-- AERVELYS NEXT / persistent SIM department handoffs
-- Read-only release audit; execute in the AERVELYS NEXT Supabase project ONLY.
select
 (select count(*) from sim.virtual_department_handoffs) as handoff_events,
 (select count(*) from sim.virtual_department_handoffs where status='open') as open_handoffs,
 (select count(*) from sim.virtual_department_handoffs where status='closed') as terminal_handoffs,
 (select count(*) from (
   select request_id from sim.virtual_department_handoffs
   where status='open' group by request_id having count(*)>1
 ) duplicate_open) as duplicate_open_cases,
 (select count(*) from sim.virtual_department_handoffs h
    join sim.charter_requests r on r.id=h.request_id
   where r.request_code not like 'AV-SIM-%') as non_sim_cases,
 (select count(*) from cron.job
   where jobname='aervelys-sim-department-handoffs'
    and active and schedule='*/10 * * * *') as scheduled_jobs,
 has_function_privilege('anon','public.aervelys_virtual_handoffs_overview()','EXECUTE') as anon_can_read,
 has_function_privilege('anon','public.aervelys_virtual_handoffs_sync(integer)','EXECUTE') as anon_can_sync,
 has_function_privilege('authenticated','sim.virtual_department_handoff_tick(integer)','EXECUTE') as user_can_run_internal,
 has_table_privilege('authenticated','sim.virtual_department_handoffs','SELECT') as user_can_read_table;
-- Expected: duplicate_open_cases=0, non_sim_cases=0, scheduled_jobs=1;
-- all four privilege columns=false.
-- Stateful idempotence test: call sim.virtual_department_handoff_tick(40) twice
-- and confirm the second call returns new_handoffs=0 without any input changes.
-- Never use this checklist against AERVELYS OPS.
