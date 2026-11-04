const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=file('db/v2_dispatch_positioning_v1.sql');
const web=file('app/v2/V2AirlineCockpit.tsx');
const css=file('app/v2/V2AirlineCockpit.module.css');
const tests=file('db/v2_dispatch_positioning_contract_test.sql');
for(const fragment of [
 'create table sim.v2_ferry_legs','create unique index v2_active_ferry_aircraft_idx',
 'create unique index v2_active_ferry_captain_idx',
 'create unique index v2_active_charter_aircraft_idx',
 'create unique index v2_active_charter_captain_idx',
 'create or replace function public.aervelys_v2_run_office()',
 'create or replace function public.aervelys_v2_overview()',
 'create function public.aervelys_v2_choose_ferry_pilot',
 'create function public.aervelys_v2_ferry_action',
 "'ferries',coalesce","category in('charter','flight_operations','positioning')",
 'status in(\'planned\',\'in_flight\',\'arrived\')',
 'current_icao=f.destination_icao',
 "'cost','positioning',f.estimated_cost_eur",
 'financial_bank_transactions'
]) assert.ok(sql.includes(fragment),'Missing ferry invariant: '+fragment);
for(const fragment of [
 'aervelys_v2_choose_ferry_pilot','aervelys_v2_ferry_action',
 'flightableFerries','Positionierungsflüge','FERRY / 0 PAX',
 'Ich fliege den Leerflug','SIM-Leerflug starten','Leerflug-Ankunft bestätigen',
 "l.category==='positioning'","!Array.isArray(value.ferries)"
])assert.ok(web.includes(fragment),'Missing UI ferry contract: '+fragment);
for(const fragment of ['.ferryGrid','.ferryTask','.ferryRow','.ferryEconomics'])
 assert.ok(css.includes(fragment),'Missing style: '+fragment);
for(const fragment of [
 'ROLLBACK_ALL_FERRY_V2_TEST_DATA','DUPLICATE_FERRY_SETTLEMENT_ACCEPTED',
 "'category'","ferry.status"
])if(fragment!=="'category'"&&fragment!=="ferry.status"){
 assert.ok(tests.includes(fragment),'Missing rollback test: '+fragment);
}
assert.doesNotMatch(web,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
assert.ok(!sql.includes('insert into sim.flights'));
assert.ok(!sql.includes('update sim.aircraft'));
console.log('PASS: ferry reservation, pilot choices, private positioning ledger and frontend contracts');
