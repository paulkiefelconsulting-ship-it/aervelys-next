const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../app/lib/nextIntegrationPipeline.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true
}}).outputText;
const exportsObj={};
new Function('exports',js)(exportsObj);
const {composeLifecycle}=exportsObj;
const base={
 charters:[
  {request_id:'sim1',request_code:'AV-SIM-101',origin_icao:'EDAZ',destination_icao:'LFMN',requested_departure:'2026-11-05T14:00:00Z',request_status:'draft'},
  {request_id:'real1',request_code:'AV-101',origin_icao:'EDDH',destination_icao:'ENGM',request_status:'new'}
 ],
 dispatch:[{request_id:'sim1',id:'d1',request_code:'AV-SIM-101',planning_status:'draft',registration:'D-TEST'}],
 simRequests:[{request_id:'sim1',request_code:'AV-SIM-101',origin_icao:'EDAZ',destination_icao:'LFMN'}],
 missions:[{request_id:'sim1',phase:'cruise',lifecycle:'running'}],
 links:[{request_id:'sim1',status:'receiving'}]
};
const rows=composeLifecycle(base);
assert.equal(rows.length,2,'duplicate SIM request rows are joined, not cloned');
assert.equal(rows[0].id,'sim1','running SIM mission comes first');
assert.equal(rows[0].charter,'present');
assert.equal(rows[0].planning,'present');
assert.equal(rows[0].mission,'present');
assert.equal(rows[0].evidence,'present');
assert.equal(rows[0].missionPhase,'cruise');
assert.equal(rows[0].linkStatus,'receiving');
assert.equal(rows[1].isSim,false);
assert.equal(rows[1].mission,'not_applicable','non-SIM is never treated as SIM mission');
assert.equal(rows[1].evidence,'not_applicable','no inferred MSFS match for non-SIM');
const partial=composeLifecycle({...base,dispatch:null,links:null});
assert.equal(partial[0].planning,'unavailable','RPC failure must not masquerade as missing dispatch');
assert.equal(partial[0].evidence,'unavailable','RPC failure must not masquerade as missing MSFS');
const noData=composeLifecycle({
 charters:null,dispatch:null,simRequests:base.simRequests,missions:[],links:[]
});
assert.equal(noData.length,1,'SIM data remains visible when charter RPC is unavailable');
assert.equal(noData[0].charter,'unavailable');
assert.equal(noData[0].mission,'absent');
assert.equal(noData[0].evidence,'absent');
const ordinary=composeLifecycle({...base,
 charters:[base.charters[1]],
 simRequests:[],missions:[{request_id:'real1',phase:'cruise',lifecycle:'running'}],
 links:[{request_id:'real1',status:'receiving'}]});
assert.equal(ordinary[0].mission,'not_applicable','non-SIM never receives unrelated SIM state');
assert.equal(ordinary[0].evidence,'not_applicable');
assert.equal(composeLifecycle({charters:null,dispatch:null,simRequests:null,missions:null,links:null}).length,0);
console.log('PASS: cross-module read-only linkage, SIM isolation and unavailable-source gates');
