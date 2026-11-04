select
 (select count(*) from sim.people) original_staff,
 (select count(*) from sim.aircraft) original_aircraft,
 (select count(*) from sim.v2_companies) active_v2_companies,
 (select count(*) from sim.v2_requests where status='in_flight') existing_inflight,
 (select count(*) from sim.v2_training_records) training_records,
 (select count(*) from sim.v2_duty_roster) roster_records,
 (select count(*) from sim.v2_facility_projects) facility_records,
 (select count(*) from sim.v2_ledger) ledger_records,
 (select charter_release_status from sim.v2_aircraft
  where aircraft_type='Embraer Phenom 300E' limit 1) phenom_charter_release,
 (select charter_release_status from sim.v2_aircraft
  where aircraft_type='Cessna Citation CJ4' limit 1) cj4_sim_charter_release,
 has_table_privilege('anon','sim.v2_duty_roster','SELECT') anon_roster_read,
 has_table_privilege('authenticated','sim.v2_training_records','INSERT') browser_training_write,
 has_table_privilege('authenticated','sim.v2_facility_projects','INSERT') browser_property_write,
 has_function_privilege('anon','public.aervelys_v2_ops_overview()','EXECUTE') anon_ops_overview,
 has_function_privilege('anon','public.aervelys_v2_duty_add(uuid,text,timestamptz,timestamptz,text,text)','EXECUTE') anon_roster_change;