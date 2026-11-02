'use strict';

// AERVELYS NEXT Desktop – secure, first-party window around the existing NEXT platform.
// This application does not embed or redistribute any SkyBridge code or assets.
const {app, BrowserWindow, Menu, shell, session, dialog, ipcMain} = require('electron');
const {join} = require('node:path');
const {pathToFileURL} = require('node:url');
const {existsSync,readFileSync,writeFileSync,mkdirSync} = require('node:fs');

const {HOME, isInternal, isExternalAllowed} = require('./security.cjs');
const localStore=require('./localStore.cjs');
const pilots=require('./pilotProfiles.cjs');
const offlineMarket=require('./offlineMarket.cjs');
const flightSettlement=require('./flightSettlement.cjs');
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
    bridgeProcess=await startBridge(result.exe,['--offline']);
    bridgeProcess.on('exit',()=>{bridgeProcess=null;});
    await dialog.showMessageBox(mainWindow||undefined,{
      type:'info',title:'AERVELYS SIM BRIDGE gestartet',
      message:'Die lokale MSFS-Bridge wurde gestartet.',
      detail:'Die Bridge speichert Flugdaten jetzt lokal, ohne Cloud-Kopplung. Der ACARS-Bereich in NEXT Desktop liest diese Daten. Der echte MSFS-Test bleibt ausstehend.'
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

function connect() {
  // LOCAL UI is the application. The Cloud is optional, opened externally.
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadFile(join(__dirname,'local.html'));
}

function makeMenu() {
  const template = [
    {
      label: 'AERVELYS',
      submenu: [
        {label: 'Lokales Command Center',click: () => connect()},
        {label: 'Website im Browser öffnen',click: () => void shell.openExternal(HOME.toString())},
        {type: 'separator'},
        {label: 'Beenden',role: 'quit'}
      ]
    },
    {
      label: 'Verbindung',
      submenu: [
        {label: 'Lokale Oberfläche aktualisieren',accelerator: 'CmdOrCtrl+R',click: () => connect()},
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
        {label:'Lokales Command Center öffnen',click:()=>connect()}
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
      devTools: !app.isPackaged,
      preload:join(__dirname,'preload.cjs')
    }
  };
  if (existsSync(icon)) options.icon = icon;
  mainWindow = new BrowserWindow(options);

  const contents = mainWindow.webContents;

  const localUrl=pathToFileURL(join(__dirname,'local.html')).toString();
  contents.setWindowOpenHandler(({url}) => {
    if(isExternalAllowed(url)||isInternal(url))void shell.openExternal(url);
    return {action:'deny'};
  });
  contents.on('will-navigate',(event,url)=>{
    if(url!==localUrl){
      event.preventDefault();
      if(isExternalAllowed(url)||isInternal(url))void shell.openExternal(url);
    }
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

    // No remote website receives these IPC methods. Only our packaged local page.
    const trustedLocalUrl=pathToFileURL(join(__dirname,'local.html')).toString();
    function localOnly(event){
      if(!mainWindow || mainWindow.isDestroyed() ||
         event.sender!==mainWindow.webContents ||
         event.senderFrame!==event.sender.mainFrame ||
         event.senderFrame.url!==trustedLocalUrl)
        throw Error('Local IPC denied');
    }
    const homeDir=()=>app.getPath('userData');
    const appDataDir=()=>app.getPath('appData');
    ipcMain.handle('local:snapshot',event=>{
      localOnly(event);
      const index=pilots.list(homeDir());
      const active=pilots.selected(homeDir());
      return {state:active?.state||null,selectedPilot:active?.meta||null,
        pilots:index.pilots,activeId:index.activeId,
        telemetry:localStore.lastTelemetry(appDataDir())};
    });
    ipcMain.handle('local:pilotCreate',(event,data)=>{
      localOnly(event);
      return pilots.create(homeDir(),data);
    });
    ipcMain.handle('local:pilotSelect',(event,id)=>{
      localOnly(event);
      return pilots.select(homeDir(),id);
    });
    ipcMain.handle('local:renamePilot',(event,name)=>{
      localOnly(event);
      return pilots.updateName(homeDir(),name);
    });
    ipcMain.handle('local:addMission',(event,payload)=>{
      localOnly(event);
      return pilots.addMission(homeDir(),payload);
    });
    ipcMain.handle('local:marketList',event=>{
      localOnly(event);
      return offlineMarket.list(homeDir());
    });
    ipcMain.handle('local:marketAccept',(event,id)=>{
      localOnly(event);
      return offlineMarket.accept(homeDir(),id);
    });
    ipcMain.handle('local:marketRefresh',event=>{
      localOnly(event);
      return offlineMarket.regenerate(homeDir());
    });
    ipcMain.handle('local:marketCancel',(event,id)=>{
      localOnly(event);
      return offlineMarket.cancel(homeDir(),id);
    });
    ipcMain.handle('local:trainingPlan',(event,type)=>{
      localOnly(event);
      return offlineMarket.planTypeCheck(homeDir(),type);
    });
    ipcMain.handle('local:flightArm',(event,missionId)=>{
      localOnly(event);
      return flightSettlement.arm(homeDir(),appDataDir(),missionId);
    });
    ipcMain.handle('local:flightReview',(event,missionId)=>{
      localOnly(event);
      return flightSettlement.inspect(homeDir(),appDataDir(),missionId);
    });
    ipcMain.handle('local:flightSettle',(event,missionId)=>{
      localOnly(event);
      return flightSettlement.finalize(homeDir(),appDataDir(),missionId);
    });
    ipcMain.handle('local:backup',async event=>{
      localOnly(event);
      const result=await dialog.showSaveDialog(mainWindow,{
        title:'AERVELYS SIM-Karrieren sichern',
        defaultPath:'AERVELYS-NEXT-Piloten-Backup.json',
        filters:[{name:'AERVELYS JSON Backup',extensions:['json']}]
      });
      if(result.canceled||!result.filePath)return {cancelled:true};
      const data=JSON.stringify(pilots.exportData(homeDir()),null,2);
      // User explicitly chose export destination; backup contains private pilot data.
      const fs=require('node:fs');
      fs.writeFileSync(result.filePath,data,{encoding:'utf8',flag:'wx'});
      return {ok:true};
    });
    ipcMain.handle('local:restore',async event=>{
      localOnly(event);
      const answer=await dialog.showOpenDialog(mainWindow,{
        title:'AERVELYS SIM-Karrieren aus Backup wiederherstellen',
        properties:['openFile'],
        filters:[{name:'AERVELYS JSON Backup',extensions:['json']}]
      });
      if(answer.canceled||!answer.filePaths.length)return {cancelled:true};
      const fs=require('node:fs');
      const filename=answer.filePaths[0];
      if(fs.statSync(filename).size>8*1024*1024)throw Error('Backup-Datei zu groß.');
      const raw=JSON.parse(fs.readFileSync(filename,'utf8'));
      return pilots.importData(homeDir(),raw);
    });
    ipcMain.handle('local:startBridge',async event=>{
      localOnly(event);
      await launchNativeBridge();
      return {ok:true};
    });
    ipcMain.handle('local:stopBridge',event=>{
      localOnly(event);
      stopNativeBridge();
      return {ok:true};
    });
    ipcMain.handle('local:openCloud',event=>{
      localOnly(event);
      void shell.openExternal(HOME.toString());
      return {ok:true};
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
