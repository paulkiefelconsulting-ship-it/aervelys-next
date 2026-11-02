'use strict';

// Desktop-owned native companion. No remote page has an IPC or preload API to invoke this.
// The Microsoft SDK managed assembly must already exist locally; it is NEVER bundled.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile,spawn} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

const SDK_SUBPATH = path.join('SimConnect SDK','lib','managed','Microsoft.FlightSimulator.SimConnect.dll');
const SOURCES = ['Program.cs','PhaseClassifier.cs','SimBridgeWindow.cs'];
const DLL = 'Microsoft.FlightSimulator.SimConnect.dll';

function sdkAssembly(root) {
  if (typeof root !== 'string' || !root.trim()) return null;
  const file = path.join(root,SDK_SUBPATH);
  try { return fs.statSync(file).isFile()?file:null; }
  catch { return null; }
}
function findSdk(configuredRoot,env=process.env) {
  const roots=[
    configuredRoot,
    env.MSFS2024_SDK,
    env.MSFS_SDK,
    'C:\\MSFS 2024 SDK',
    'C:\\MSFS SDK',
  ];
  for (const root of roots) {
    const file=sdkAssembly(root);
    if (file) return {root,file};
  }
  return null;
}
function compilerPath(windir=process.env.WINDIR||'C:\\Windows') {
  const locations=[
    path.join(windir,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),
    path.join(windir,'Microsoft.NET','Framework','v4.0.30319','csc.exe')
  ];
  for(const candidate of locations) {
    try {if(fs.statSync(candidate).isFile())return candidate;}catch{}
  }
  return null;
}
function sourceDirectory(packaged,resourcesPath,repoRoot){
  return packaged?
    path.join(resourcesPath,'simbridge-src'):
    path.join(repoRoot,'bridge','Aervelys.SimBridge');
}
function sourceHash(sourceDir,assembly){
  const hash=crypto.createHash('sha256');
  for(const name of SOURCES)hash.update(fs.readFileSync(path.join(sourceDir,name)));
  // SDK assemblies vary; do not hash any proprietary SDK bytes into the package.
  const st=fs.statSync(assembly);
  hash.update(String(st.size)+'|'+String(st.mtimeMs));
  return hash.digest('hex');
}
async function compileBridge({sourceDir,buildDir,configuredRoot,env=process.env,windir}){
  const sdk=findSdk(configuredRoot,env);
  if(!sdk)throw new Error('MSFS 2024 SDK nicht gefunden. Bitte den installierten SDK-Hauptordner auswählen.');
  const compiler=compilerPath(windir);
  if(!compiler)throw new Error('.NET Framework C#-Compiler fehlt. Windows .NET Framework 4.8 / Developer Pack prüfen.');
  if(!SOURCES.every(name=>fs.existsSync(path.join(sourceDir,name))))
    throw new Error('Die AERVELYS-Bridge-Quelldateien fehlen im Installationspaket.');
  const signature=sourceHash(sourceDir,sdk.file);
  fs.mkdirSync(buildDir,{recursive:true});
  const exe=path.join(buildDir,'Aervelys.SimBridge.exe');
  const signaturePath=path.join(buildDir,'build.sha256');
  if(fs.existsSync(exe)&&fs.existsSync(signaturePath)&&fs.readFileSync(signaturePath,'utf8').trim()===signature)
    return {exe,cached:true,sdkRoot:sdk.root};
  const args=[
    '/nologo','/target:exe','/platform:x64','/optimize+',
    '/out:'+exe,
    '/reference:'+sdk.file,
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Web.Extensions.dll',
    '/reference:System.Net.Http.dll',
    '/reference:System.Security.dll',
    ...SOURCES.map(name=>path.join(sourceDir,name))
  ];
  try {
    await run(compiler,args,{windowsHide:true,timeout:120000,maxBuffer:256000});
  } catch(err) {
    // Do not use arbitrary commands or ever retry with relaxed compiler flags.
    // Keep diagnostics limited to known build failures; no remote source execution.
    const output=typeof err?.stderr==='string'?err.stderr.slice(0,800):'';
    throw new Error('Bridge-Kompilierung fehlgeschlagen. SDK-Version und Windows-Buildtools prüfen. '+output);
  }
  if(!fs.existsSync(exe))throw new Error('Windows-Bridge wurde nicht erzeugt.');
  fs.writeFileSync(signaturePath,signature,'utf8');
  return {exe,cached:false,sdkRoot:sdk.root};
}
async function startBridge(exe,args=[],sdkManagedAssembly=null) {
  if(!fs.existsSync(exe))throw new Error('Bridge EXE fehlt.');
  // Launched by an explicitly clicked native menu item only.
  if(!Array.isArray(args)||args.some(x=>x!=='--offline'))throw Error('Invalid bridge arguments');
  if(sdkManagedAssembly!==null &&
      (!path.isAbsolute(sdkManagedAssembly)||
       path.basename(sdkManagedAssembly)!==DLL||!fs.existsSync(sdkManagedAssembly)))
    throw Error('Managed SDK-Assembly fehlt.');
  const child=spawn(exe,args,{
    cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false,
    env:{...process.env,
      ...(sdkManagedAssembly?{AERVELYS_SIMCONNECT_MANAGED:sdkManagedAssembly}:{})}
  });
  await new Promise((resolve,reject)=>{
    child.once('spawn',resolve);
    child.once('error',reject);
  });
  child.on('error',()=>{}); // Prevent uncaught error after successful spawn.
  child.unref();
  return child;
}
function stopBridge(child) {
  if(!child || child.killed)return false;
  return child.kill();
}
module.exports={SDK_SUBPATH,DLL,SOURCES,sdkAssembly,findSdk,compilerPath,
 sourceDirectory,compileBridge,startBridge,stopBridge};
