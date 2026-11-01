// Contract tests for ACARS read-only signal reconstruction. No MSFS hardware needed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../app/lib/msfsAcarsEvidence.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true
}}).outputText;
const moduleExports={};
new Function('exports',js)(moduleExports);
const evaluate=moduleExports.analyseMsfsEvidence;
const base=new Date('2026-11-01T19:00:00Z').getTime();
let id=0;
const sample=(t,ground,speed,other={})=>({
 id:++id,observed_at:new Date(base+t*5000).toISOString(),
 received_at:new Date(base+t*5000).toISOString(),
 phase:ground?'PARKED':'CRUISE',
 sample:{latitude:52.2+Math.min(t,100)*0.00001,longitude:13.15,
  groundspeed_kt:speed,on_ground:ground,altitude_agl_ft:ground?0:150,
  vertical_speed_fpm:ground?-120:600,aircraft_title:'Embraer Phenom 300',
  parking_brake:false,engine_running:true,...other}
});
const parked=i=>sample(i,true,0,{parking_brake:true,engine_running:false});
const sequence=[
 parked(0),parked(1),parked(2),
 sample(3,true,15),sample(4,true,35),
 sample(5,false,65),sample(6,false,95),sample(7,false,120),
 sample(8,true,90),sample(9,true,60),sample(10,true,20),
 sample(11,false,75),sample(12,false,100),sample(13,false,110),
 sample(14,true,75),sample(15,true,35),sample(16,true,9),
 parked(17),parked(18),parked(19)
];
let result=evaluate(sequence);
assert.equal(result.takeoffs,2,'two valid ground-to-air events');
assert.equal(result.landings,2,'two air-to-ground events');
assert.equal(result.cold_start_confirmed,true);
assert.equal(result.shutdown_confirmed,true);
assert.equal(result.checkride,'needs_review','never auto-issue a rating');
assert.equal(result.interruptions,0);
assert.equal(result.aircraft_changes,0);

result=evaluate(sequence.map(s=>({...s,sample:{...s.sample,engine_running:null}})));
assert.equal(result.checkride,'in_progress','missing engine data must block readiness');
assert.equal(result.cold_start_confirmed,false);
assert.ok(result.warnings.some(x=>x.includes('Triebwerkszustand')));

result=evaluate(sequence,true);
assert.equal(result.checkride,'in_progress','truncated history may not pass');

const changed=sequence.map((s,i)=>i>8?{...s,sample:{...s.sample,aircraft_title:'Airbus A320'}}:s);
result=evaluate(changed);
assert.ok(result.aircraft_changes>0);
assert.equal(result.checkride,'in_progress');

const discontinuity=sequence.map((s,i)=>({...s,
 observed_at:new Date(Date.parse(s.observed_at)+(i>=10?60000:0)).toISOString()}));
result=evaluate(discontinuity);
assert.ok(result.interruptions>0,'long telemetry gap detected');
assert.equal(result.checkride,'in_progress');

const inAir=[
 sample(40,false,190),sample(41,false,200),
 sample(42,true,80),sample(43,true,50),parked(44),parked(45),parked(46)
];
result=evaluate(inAir);
assert.equal(result.cold_start_confirmed,false,'already-airborne connection must not pass checkride');
assert.equal(result.checkride,'in_progress');

const duplicate=sequence.concat({...sequence[12],id:++id});
result=evaluate(duplicate);
assert.ok(result.rejected_samples>0,'duplicates rejected');

const none=evaluate([]);
assert.equal(none.checkride,'waiting');
assert.equal(none.events.length,0);
console.log('ACARS evidence: ground/air transitions, cold start, shutdown, gaps, truncation, type change and late connect: OK');
