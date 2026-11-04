// Offline contract tripwire, intentionally not a substitute for the SQL integration test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const migration=read('db/v2_airline_core_v1.sql');
const web=read('app/v2/V2AirlineCockpit.tsx');
const doc=read('docs/AERVELYS_V2_AIRLINE_CORE.md');
for(const name of ['overview','initialize','generate_inquiry','run_office','choose_pilot','flight_action']){
 assert.match(migration,new RegExp('create function public\\.aervelys_v2_'+name+'\\('));
 assert.match(web,new RegExp('aervelys_v2_'+name));
}
for(const table of ['companies','staff','aircraft','requests','events','ledger']){
 assert.match(migration,new RegExp('alter table sim\\.v2_'+table+' enable row level security;'));
 assert.match(migration,new RegExp('sim\\.v2_'+table));
}
assert.match(migration,/owner_id=u/);
assert.match(migration,/status in\('planned','ready','in_flight'\)/);
assert.match(migration,/unique\(request_id,kind,category\)/);
assert.match(migration,/revoke all on function public\.aervelys_v2_flight_action/);
assert.match(migration,/grant execute on function public\.aervelys_v2_overview\(\) to authenticated/);
assert.match(web,/Ich fliege selbst/);
assert.match(web,/Virtueller Pilot/);
assert.match(web,/SIM-Flugabschluss bestätigen/);
assert.match(web,/financial_bank_transactions!==0/);
assert.match(doc,/keine direkte[n]? Browserrechte|keine direkten Browserrechte/i);
assert.doesNotMatch(web,/service_role|SUPABASE_SERVICE_ROLE_KEY/i);
console.log('PASS: independent V2 airline API contract, role-bound tables and UI lifecycle');
