'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const bridge=require('../nativeBridge.cjs');

test('SDK discovery selects actual Microsoft managed assembly, not loose names',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-sdk-'));
 try{
  assert.equal(bridge.sdkAssembly(tmp),null);
  const folder=path.join(tmp,'SimConnect SDK','lib','managed');
  fs.mkdirSync(folder,{recursive:true});
  const dll=path.join(folder,bridge.DLL);
  fs.writeFileSync(dll,'test-placeholder-not-redistributable');
  assert.equal(bridge.sdkAssembly(tmp),dll);
  const located=bridge.findSdk(tmp,{MSFS2024_SDK:'',MSFS_SDK:''});
  assert.equal(located.root,tmp);
  assert.equal(located.file,dll);
  assert.equal(bridge.sdkAssembly(path.join(tmp,'wrong')),null);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('missing local compiler is detected, no unknown programs invoked',()=>{
 const fakeWin=path.join(os.tmpdir(),'aervelys-no-windir-for-test-'+process.pid);
 assert.equal(bridge.compilerPath(fakeWin),null);
});

test('desktop source layout and packaged source layout stay isolated',()=>{
 const root=path.resolve(__dirname,'../..');
 assert.equal(bridge.sourceDirectory(false,'C:\\Program Files\\AERVELYS\\resources',root),
  path.join(root,'bridge','Aervelys.SimBridge'));
 assert.equal(bridge.sourceDirectory(true,'C:\\Program Files\\AERVELYS\\resources',root),
  path.join('C:\\Program Files\\AERVELYS\\resources','simbridge-src'));
 for(const source of bridge.SOURCES){
  assert.equal(fs.existsSync(path.join(root,'bridge','Aervelys.SimBridge',source)),true);
 }
});

test('electron-builder bundles OUR C# sources but never Microsoft binaries',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.0');
 assert.equal(pkg.build.extraResources.length,1);
 const resource=pkg.build.extraResources[0];
 assert.equal(resource.to,'simbridge-src');
 assert.deepEqual(resource.filter,['**/*.cs']);
 assert.ok(pkg.build.files.includes('nativeBridge.cjs'));
 assert.ok(!pkg.build.files.some(x=>/SimConnect\.dll/i.test(x)));
});

test('bridge cannot compile without locally installed SDK',async()=>{
 const sourceDir=path.resolve(__dirname,'../../bridge/Aervelys.SimBridge');
 const buildDir=path.join(os.tmpdir(),'aervelys-compile-test-'+process.pid);
 await assert.rejects(
  bridge.compileBridge({sourceDir,buildDir,configuredRoot:'',
   env:{MSFS2024_SDK:'',MSFS_SDK:''},windir:'/missing'}),
  /SDK nicht gefunden/
 );
});
