'use strict';

// AERVELYS NEXT Desktop – secure, first-party window around the existing NEXT platform.
// This application does not embed or redistribute any SkyBridge code or assets.
const {app, BrowserWindow, Menu, shell, session, dialog} = require('electron');
const {join} = require('node:path');
const {existsSync,readFileSync,writeFileSync,mkdirSync} = require('node:fs');

const {HOME, isInternal, isExternalAllowed} = require('./security.cjs');
const {findSdk,sourceDirectory,compileBridge,startBridge,stopBridge} = require('./nativeBridge.cjs');
const PARTITION = 'persist:aervelys-next-desktop';
let mainWindow = null;
let loadingOffline = false;
let bridgeProcess = null;
let startingBridge = false;

function sdkPreferenceFile() {
  return join(app.getPath('userData'),'simbridge-sdk-root.txt');
}
function savedSdkRoot() {
  try {return readFileSync(sdkPreferenceFile(),'utf8').trim();} catch {return '';}
}
async function chooseSdkRoot() {
  const selected=await dialog.showOpenDialog(mainWindow||undefined,{
    title:'Microsoft Flight Simulator 2024 SDK-Hauptordner auswählen',
    properties:['openDirectory']
  });
  if(selected.canceled || !selected.filePaths.length)return null;
  const root=selected.filePaths[0];
  if(!findSdk(root,{MSFS_SDK:'',MSFS2024_SDK:''}) ||
     !findSdk(root,{MSFS_SDK:'',MSFS2024_SDK:''}).file.startsWith(root)){
    await dialog.showMessageBox(mainWindow||undefined,{
      type:'warning',title:'SDK nicht erkannt',
      message:'In diesem Ordner wurde keine SimConnect Managed-Assembly gefunden.',
      detail:'Erwartet: SimConnect SDK\\lib\\managed\\Microsoft.FlightSimulator.SimConnect.dll'
    });
    return null;
  }
  mkdirSync(app.getPath('userData'),{recursive:true});
  writeFileSync(sdkPreferenceFile(),root+'\n','utf8');
  return root;
}
async function launchNativeBridge() {
  if(startingBridge)return;
  if(bridgeProcess && bridgeProcess.exitCode===null && !bridgeProcess.killed){
    await dialog.showMessageBox(mainWindow||undefined,{
      type:'info',title:'AERVELYS SIM BRIDGE',message:'Die Bridge wurde bereits aus NEXT gestartet.',
      detail:'Öffne in AERVELYS NEXT den Bereich MSFS-Integration, um den Gerätestatus zu sehen.'
    });
    return;
  }
  startingBridge=true;
  try {
    let root=savedSdkRoot();
    let sdk=findSdk(root);
    if(!sdk) {
      const answer=await dialog.showMessageBox(mainWindow||undefined,{
        type:'info',buttons:['SDK-Ordner auswählen','Abbrechen'],defaultId:0,cancelId:1,
        title:'MSFS-Bridge vorbereiten',
        message:'Für die native MSFS 2024 Bridge wird das Microsoft Flight Simulator SDK benötigt.',
        detail:'AERVELYS liefert keine Microsoft-SimConnect-DLLs aus. Die Bridge wird lokal aus unserem eigenen Code und deinem installierten SDK erzeugt.'
      });
      if(answer.response!==0)return;
      root=await chooseSdkRoot();
      if(!root)return;
      sdk=findSdk(root,{MSFS_SDK:'',MSFS2024_SDK:''});
    }
    const sourceDir=sourceDirectory(app.isPackaged,process.resourcesPath,
      join(__dirname,'..'));
    const targetDir=join(app.getPath('userData'),'Bridge');
    const result=await compileBridge({
      sourceDir,buildDir:targetDir,configuredRoot:sdk.root,
      env:{MSFS2024_SDK:'',MSFS_SDK:''}
    });
    bridgeProcess=await startBridge(result.exe);
    bridgeProcess.on('exit',()=>{bridgeProcess=null;});
    await dialog.showMessageBox(mainWindow||undefined,{
      type:'info',title:'AERVELYS SIM BRIDGE gestartet',
      message:'Die lokale MSFS-Bridge wurde gestartet.',
      detail:'Falls der PC noch nicht gekoppelt ist, erscheint ein Fenster für den NEXT-Kopplungscode. Öffne danach NEXT → MSFS-Integration. Eine echte SimConnect-Verbindung muss im laufenden MSFS 2024 getestet werden.'
    });
  }catch(error){
    await dialog.showMessageBox(mainWindow||undefined,{
      type:'error',title:'Bridge konnte nicht gestartet werden',
      message:'Die native SIM-Bridge wurde nicht gestartet.',
      detail:String(error?.message||error).slice(0,1000)
    });
  }finally{startingBridge=false;}
}
function stopNativeBridge(){
  if(bridgeProcess){stopBridge(bridgeProcess);bridgeProcess=null;}
}


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
      label:'Simulator',
      submenu:[
        {label:'MSFS 2024 Bridge starten / einrichten',click:()=>{void launchNativeBridge();}},
        {label:'Bridge beenden',click:()=>stopNativeBridge()},
        {type:'separator'},
        {label:'MSFS SDK-Ordner auswählen',click:()=>{void chooseSdkRoot();}},
        {label:'NEXT Command Center öffnen',click:()=>connect()}
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

app.on('before-quit',stopNativeBridge);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
