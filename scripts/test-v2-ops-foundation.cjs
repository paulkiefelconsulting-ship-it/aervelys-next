const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const js=ts.transpileModule(read('app/v2/simbriefDispatch.ts'),{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true}}).outputText;
const exportsObj={};new Function('exports',js)(exportsObj);
const make=exportsObj.simbriefUrlForLeg;
const planned=make({origin:'edaz',destination:'EDDM',aircraftType:'Cessna Citation CJ4',
 departureAt:'2026-11-04T19:45:00.000Z',estimatedHours:1.5,passengers:4,
 registration:'AVF-CJ4'});
assert.ok(planned,'CJ4 dispatch redirect must be supported');
const url=new URL(planned);
assert.equal(url.origin,'https://dispatch.simbrief.com');
assert.equal(url.pathname,'/options/custom');
assert.equal(url.searchParams.get('airline'),'AVF');
assert.equal(url.searchParams.get('orig'),'EDAZ');
assert.equal(url.searchParams.get('dest'),'EDDM');
assert.equal(url.searchParams.get('type'),'C25C');
assert.equal(url.searchParams.get('date'),'04NOV26');
assert.equal(url.searchParams.get('deph'),'19');
assert.equal(url.searchParams.get('depm'),'45');
assert.equal(url.searchParams.get('steh'),'1');
assert.equal(url.searchParams.get('stem'),'30');
assert.equal(url.searchParams.get('pax'),'4');
assert.equal(url.searchParams.has('reg'),false,'dummy V2 jet registration is not a real airframe');
assert.equal(url.searchParams.has('route'),false,'no invented IFR route');
assert.equal(url.searchParams.has('apicode'),false,'no unapproved developer API key');
const ferry=new URL(make({origin:'EDDM',destination:'EDAZ',aircraftType:'Cessna Citation CJ4',
 estimatedHours:1.25,passengers:0}));
assert.equal(ferry.searchParams.get('pax'),'0','ferry must be zero passengers');
assert.equal(ferry.searchParams.get('stem'),'15');
assert.equal(make({origin:'NOT_AIRPORT',destination:'EDDM',aircraftType:'Cessna Citation CJ4'}),null);
assert.equal(make({origin:'EDAZ',destination:'EDAZ',aircraftType:'Cessna Citation CJ4'}),null);
assert.equal(make({origin:'EDAZ',destination:'EDDM',aircraftType:'Unknown Jet'}),null);
for(const f of ['app/v2/V2OperationsFoundation.tsx','db/v2_ops_charter_release_guard.sql',
 'db/v2_ops_people_roster_property_v1.sql']){
 assert.ok(read(f).length>500,'missing ops module '+f);
}
const guard=read('db/v2_ops_charter_release_guard.sql');
assert.match(guard,/aircraft_type='Embraer Phenom 300E'/);
assert.match(guard,/charter_release_status='blocked'/);
assert.match(guard,/create trigger v2_guard_charter_release_insert_or_update/);
assert.match(guard,/create trigger v2_guard_ferry_release_insert_or_update/);
assert.match(guard,/a0\.charter_release_status='sim_enabled'/);
const ops=read('db/v2_ops_people_roster_property_v1.sql');
assert.match(ops,/p_start>now\(\)\+interval '18 months'/);
assert.match(ops,/pg_advisory_xact_lock/);
assert.match(ops,/Training conflicts with planned duty/);
assert.match(ops,/Bestehende Mieträume/);
assert.match(ops,/Bestehende Mietstellplätze/);
assert.match(ops,/type_rating_automatically_granted',false/);
const ui=read('app/v2/V2AirlineCockpit.tsx');
assert.match(ui,/V2OperationsFoundation/);
assert.match(ui,/V2SimbriefButton/);
console.log('PASS: charter exclusion, original roster, 18-month standby planning and SimBrief prefill');
