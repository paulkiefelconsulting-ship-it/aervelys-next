select
 (select count(*) from sim.v2_companies) v2_companies,
 (select count(*) from sim.v2_requests) v2_charters,
 (select count(*) from sim.v2_quotes) issued_quotes,
 (select count(*) from sim.v2_ferry_legs) ferry_legs,
 (select count(*) from sim.v2_ledger) sim_ledger_entries,
 (select count(*) from sim.aircraft) legacy_aircraft,
 (select count(*) from sim.sim_customer_cases) legacy_cases,
 has_table_privilege('anon','sim.v2_quotes','SELECT') anon_can_read_quotes,
 has_table_privilege('authenticated','sim.v2_quotes','SELECT') browser_can_read_quote_table,
 has_table_privilege('authenticated','sim.v2_quotes','UPDATE') browser_can_change_customer_price,
 has_function_privilege('anon','public.aervelys_v2_run_office()','EXECUTE') anon_can_run_sales_dispatch,
 has_function_privilege('authenticated','public.aervelys_v2_overview()','EXECUTE') authenticated_can_use_overview,
 (select count(*) from information_schema.triggers
    where event_object_schema='sim' and event_object_table='v2_quotes'
     and trigger_name='v2_lock_issued_terms') quote_lock_triggers;