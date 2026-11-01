const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../app/lib/simCabinDirector.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true
}}).outputText;
const exportsObj={};
new Function('exports',js)(exportsObj);
const {assessCabin,projectCabinNeeds}=exportsObj;
const sample=(seat,fields={})=>({
 id:'fake-'+seat,request_id:'SIM-CASE-TEST',seat_index:seat,
 satisfaction:88,hunger:15,thirst:16,restroom_need:12,comfort:90,fatigue:18,...fields
});
const a=sample(1,{
 satisfaction:35,hunger:83,thirst:73,restroom_need:94,comfort:31,fatigue:78
});
const b=sample(2,{thirst:87,restroom_need:10});
const c=sample(3);
const empty=assessCabin([],[],'cruise','running',20);
assert.equal(empty.total,0);
assert.equal(empty.averageSatisfaction,null);
assert.equal(empty.recommendations.length,0);
assert.equal(empty.forecast.hunger,null);
const assessed=assessCabin([a,b,c],[],'cruise','running',20);
assert.equal(assessed.total,3,'only real passenger rows count');
assert.equal(assessed.recommendations.length,2);
assert.equal(assessed.recommendations[0].seat_index,1);
assert.equal(assessed.recommendations[0].service,'restroom');
assert.equal(assessed.recommendations[0].priority,'critical');
assert.equal(assessed.recommendations[1].service,'water');
assert.equal(assessed.recommendations[1].seat_index,2);
assert.equal(assessed.serviceAvailable,true);
assert.ok(assessed.forecast.thirst>0);
const paused=assessCabin([a],[],'cruise','paused');
assert.equal(paused.serviceAvailable,false);
assert.equal(paused.recommendations[0].available,false);
const descent=assessCabin([a],[],'descent','running');
assert.equal(descent.recommendations[0].available,false);
const boarding=assessCabin([sample(1,{hunger:95})],[],'boarding','running');
assert.equal(boarding.recommendations[0].service,'snack','no meal outside cruise');
assert.equal(boarding.recommendations[0].available,true);
const served=[{id:2,request_id:'SIM-CASE-TEST',event_kind:'service',created_at:'2026-11-01T12:00:00Z',
 payload:{service:'restroom',seat:1}}];
const afterRecent=assessCabin([a,b],served,'cruise','running',20,
 Date.parse('2026-11-01T12:01:00Z'));
const paxOne=afterRecent.recommendations.find(r=>r.seat_index===1);
assert.ok(paxOne,'other passenger needs remain visible after recent service');
assert.notEqual(paxOne.service,'restroom',
 'do not immediately repeat the same freshly logged service');
const oldEvent=assessCabin([a],served,'cruise','running',20,
 Date.parse('2026-11-01T12:10:00Z'));
assert.equal(oldEvent.recommendations[0].service,'restroom');
const forecast=projectCabinNeeds(sample(5,{hunger:60,thirst:60,restroom_need:65,
 comfort:30,satisfaction:70,fatigue:30}),20);
assert.equal(forecast.hunger,65);
assert.equal(forecast.thirst,67);
assert.equal(forecast.restroom_need,70);
assert.equal(forecast.fatigue,34);
assert.equal(forecast.satisfaction,70-3-4-4-2,
 'must match existing server SIM clock penalty calculation');
const invalid=assessCabin([sample(1,{thirst:NaN}),sample(2,{comfort:500})],[],'cruise','running');
assert.equal(invalid.total,0,'invalid fake values must not become virtual passengers');
console.log('PASS: real SIM passenger-only priorities, phases, recent events and cabin forecast');
