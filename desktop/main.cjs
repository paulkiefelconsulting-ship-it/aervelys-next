'use strict';

// AERVELYS NEXT Desktop – secure, first-party window around the existing NEXT platform.
// This application does not embed or redistribute any SkyBridge code or assets.
const {app, BrowserWindow, Menu, shell, session} = require('electron');
const {join} = require('node:path');
const {existsSync} = require('node:fs');

const {HOME, isInternal, isExternalAllowed} = require('./security.cjs');
const PARTITION = 'persist:aervelys-next-desktop';
let mainWindow = null;
let loadingOffline = false;

function openTrustedExternal(raw) {
  if (!isExternalAllowed(raw)) return;
  void shell.openExternal(raw).catch(() => {
    // No untrusted content or stack traces are shown inside the desktop window.
  });
}

function displayOffline() {
  if (!mainWindow || mainWindow.isDestroyed() || loadingOffline) return;
  loadingOffline = true;
  void mainWindow.loadFile(join(__dirname, 'offline.html')).catch(() => {});
}

function connect() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadingOffline = false;
  void mainWindow.loadURL(HOME.toString()).catch(() => displayOffline());
}

function makeMenu() {
  const template = [
    {
      label: 'AERVELYS',
      submenu: [
        {label: 'Command Center',click: () => connect()},
        {label: 'Website im Browser öffnen',click: () => void shell.openExternal(HOME.toString())},
        {type: 'separator'},
        {label: 'Beenden',role: 'quit'}
      ]
    },
    {
      label: 'Verbindung',
      submenu: [
        {label: 'Erneut verbinden',accelerator: 'CmdOrCtrl+R',click: () => connect()},
        {label: 'Seite neu laden',accelerator: 'F5',click: () => connect()}
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        {label: 'Vollbild',role: 'togglefullscreen'},
        {type: 'separator'},
        {label: 'Vergrößern',role: 'zoomIn'},
        {label: 'Verkleinern',role: 'zoomOut'},
        {label: 'Zoom zurücksetzen',role: 'resetZoom'}
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {label: 'AERVELYS NEXT auf GitHub',click: () => openTrustedExternal('https://github.com/paulkiefelconsulting-ship-it/aervelys-next')},
        {label: 'SimBrief öffnen',click: () => openTrustedExternal('https://www.simbrief.com/')}
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const icon = join(__dirname,'assets','icon.png');
  const options = {
    title: 'AERVELYS NEXT • Aviation Operations',
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    backgroundColor: '#091b30',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      partition: PARTITION,
      devTools: !app.isPackaged
    }
  };
  if (existsSync(icon)) options.icon = icon;
  mainWindow = new BrowserWindow(options);

  const contents = mainWindow.webContents;

  contents.setWindowOpenHandler(({url}) => {
    if (isInternal(url)) {
      // Internal windows remain in the single application workspace.
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed()) connect();
      });
    } else {
      openTrustedExternal(url);
    }
    return {action: 'deny'};
  });

  contents.on('will-navigate', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      openTrustedExternal(url);
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
    }
  });

  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) displayOffline();
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  connect();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.aervelys.next.desktop');

    const aervelysSession = session.fromPartition(PARTITION);
    aervelysSession.setPermissionRequestHandler((contents, permission, callback) => {
      // Clipboard copy is needed for the dispatch brief; deny camera,
      // microphone, geolocation, notifications and all other permissions.
      const clipboard = permission === 'clipboard-sanitized-write';
      callback(clipboard && isInternal(contents.getURL()));
    });

    aervelysSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
      return permission === 'clipboard-sanitized-write' && isInternal(requestingOrigin);
    });

    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => event.preventDefault());
    });

    makeMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch(() => app.quit());
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
