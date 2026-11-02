'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const store=require('../localStore.cjs');

test('standalone NEXT career works without any cloud data',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-local-'));
 try{
  assert.equal(store.readState(tmp).missions.length,0);
  assert.equal(store.readState(tmp).profile.homeBase,'EDAZ');
  const name=store.setPilotName(tmp,'Local Pilot');
  assert.equal(name.profile.pilotName,'Local Pilot');
  const updated=store.addMission(tmp,{
   kind:'checkride',departure:'edaz',destination:'EDAZ',aircraft:'Phenom 300'
  });
  assert.equal(updated.missions.length,1);
  assert.equal(updated.missions[0].kind,'checkride');
  assert.equal(updated.missions[0].departure,'EDAZ');
  assert.equal(updated.missions[0].verified,false);
  assert.equal(updated.missions[0].certificateIssued,false);
  assert.equal(updated.missions[0].settled,false);
  const reloaded=store.readState(tmp);
  assert.equal(reloaded.missions[0].id,updated.missions[0].id);
  assert.equal(reloaded.profile.pilotName,'Local Pilot');
  assert.throws(()=>store.addMission(tmp,{departure:'../',destination:'EDAZ',aircraft:'Phenom'}));
  assert.throws(()=>store.setPilotName(tmp,''));
  assert.equal(store.readState(tmp).missions.length,1);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('local simulator recorder ignores invalid files and has no demo telemetry',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-sim-'));
 try{
  const empty=store.lastTelemetry(root);
  assert.equal(empty.latest,null);
  assert.equal(empty.connected,false);
  const folder=store.telemetryDir(root);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'secret.txt'),'should be ignored');
  fs.writeFileSync(path.join(folder,'2026-11-01.jsonl'),
   JSON.stringify({observed_at:new Date().toISOString(),session_id:'local',phase:'PARKED',
    aircraft_title:'Phenom 300',latitude:52.2,longitude:13.15,
    altitude_ft:160,groundspeed_kt:0})+'\n');
  const result=store.lastTelemetry(root);
  assert.equal(result.latest.aircraft_title,'Phenom 300');
  assert.equal(result.connected,true);
  assert.equal(result.samples,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Windows installer includes offline cockpit and preload',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.5.1');
 for(const file of ['local.html','local.css','local.js','localStore.cjs','preload.cjs','pilotProfiles.cjs','offlineMarket.cjs'])
  assert.ok(pkg.build.files.includes(file),file);
});
