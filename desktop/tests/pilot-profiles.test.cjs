'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const localStore=require('../localStore.cjs');
const profiles=require('../pilotProfiles.cjs');

function temp(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-pilots-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return dir;
}
test('new install starts without fake pilot; create and switch isolated pilots',t=>{
 const root=temp(t);
 assert.equal(profiles.list(root).pilots.length,0);
 assert.equal(profiles.selected(root),null);
 const first=profiles.create(root,{name:'Paul Kiefel',country:'DE',currency:'EUR',licence:'CPL',capital:12000});
 assert.equal(first.entry.startingHours,200);
 assert.equal(first.state.finances.balance,12000);
 assert.equal(first.state.profile.verifiedFlightHours,0);
 profiles.addMission(root,{kind:'checkride',departure:'EDAZ',destination:'EDAZ',aircraft:'Phenom 300'});
 const second=profiles.create(root,{name:'Paul Kiefel',country:'US',currency:'USD',licence:'PPL',capital:4000});
 assert.notEqual(first.entry.id,second.entry.id);
 assert.equal(second.entry.startingHours,50);
 assert.equal(profiles.selected(root).state.missions.length,0);
 profiles.addMission(root,{kind:'charter',departure:'EDAZ',destination:'EDDB',aircraft:'Vision Jet'});
 assert.equal(profiles.selected(root).state.missions.length,1);
 profiles.select(root,first.entry.id);
 assert.equal(profiles.selected(root).state.missions.length,1);
 assert.equal(profiles.selected(root).state.missions[0].kind,'checkride');
 assert.equal(profiles.selected(root).state.company.currency,'EUR');
 profiles.updateName(root,'Captain Kiefel');
 assert.equal(profiles.list(root).pilots[0].name,'Captain Kiefel');
 assert.equal(profiles.list(root).pilots[1].name,'Paul Kiefel');
 assert.equal(profiles.selected(root).state.profile.pilotName,'Captain Kiefel');
 assert.throws(()=>profiles.select(root,'../../outside'));
 assert.throws(()=>profiles.create(root,{name:'Tester',country:'DE',currency:'EUR',licence:'CPL',capital:-1}));
 assert.equal(profiles.list(root).pilots.length,2);
});
test('legacy 0.3 career is migrated by COPY and never destroyed',t=>{
 const root=temp(t);
 let old=localStore.defaultState();old.profile.pilotName='Legacy Pilot';
 old.missions.push({id:'mission1',kind:'charter',departure:'EDAZ',destination:'EDDB',
  aircraft:'Phenom 300',status:'planned',verified:false});
 localStore.writeState(root,old);
 const contentsBefore=fs.readFileSync(path.join(root,'local-career.json'),'utf8');
 const index=profiles.list(root);
 assert.equal(index.pilots.length,1);
 assert.equal(index.pilots[0].licence,'LEGACY');
 assert.equal(profiles.selected(root).state.missions[0].id,'mission1');
 assert.equal(fs.readFileSync(path.join(root,'local-career.json'),'utf8'),contentsBefore);
 assert.equal(profiles.list(root).pilots.length,1);
});
test('invalid legacy career does not create an empty replacement index',t=>{
 const root=temp(t);
 fs.writeFileSync(path.join(root,'local-career.json'),'{oops');
 assert.throws(()=>profiles.list(root),/beschädigt/i);
 assert.equal(fs.existsSync(path.join(root,'pilots-index.json')),false);
 assert.equal(fs.readFileSync(path.join(root,'local-career.json'),'utf8'),'{oops');
});
test('backup roundtrip never overwrites existing profiles',t=>{
 const src=temp(t),dst=temp(t);
 const a=profiles.create(src,{name:'Pilot A',country:'CH',currency:'CHF',
  licence:'FROZEN_ATPL',capital:35000});
 profiles.addMission(src,{kind:'charter',departure:'LSZH',destination:'EDAZ',aircraft:'Phenom 300'});
 const backup=profiles.exportData(src);
 assert.equal(backup.pilots[0].meta.id,a.entry.id);
 assert.equal(backup.pilots[0].state.missions.length,1);
 const existing=profiles.create(dst,{name:'Existing',country:'DE',currency:'EUR',
  licence:'PPL',capital:4000});
 const imported=profiles.importData(dst,backup);
 assert.equal(imported.count,1);
 assert.equal(profiles.list(dst).pilots.length,2);
 assert.equal(profiles.selected(dst).state.missions.length,1);
 assert.equal(profiles.selected(dst).state.company.currency,'CHF');
 assert.equal(profiles.list(dst).pilots[0].id,existing.entry.id);
 assert.notEqual(profiles.list(dst).pilots[1].id,a.entry.id);
 const invalid={...backup,version:99};
 assert.throws(()=>profiles.importData(dst,invalid));
 assert.equal(profiles.list(dst).pilots.length,2);
});
test('validates licensing, currency, country, profile count and IDs',t=>{
 const dir=temp(t);
 for(const licence of ['PPL','CPL','FROZEN_ATPL']){
  assert.ok(profiles.LICENCES[licence]);
 }
 assert.throws(()=>profiles.create(dir,{name:'A',country:'DE',currency:'EUR',licence:'PPL',capital:1}));
 assert.throws(()=>profiles.create(dir,{name:'Pilot',country:'XX',currency:'EUR',licence:'PPL',capital:1}));
 assert.throws(()=>profiles.create(dir,{name:'Pilot',country:'DE',currency:'XYZ',licence:'PPL',capital:1}));
 assert.throws(()=>profiles.create(dir,{name:'Pilot',country:'DE',currency:'EUR',licence:'ATPL',capital:1}));
 assert.throws(()=>profiles.create(dir,{name:'Pilot',country:'DE',currency:'EUR',licence:'CPL',capital:1.5}));
 assert.throws(()=>profiles.profileDir(dir,'../x'));
});
