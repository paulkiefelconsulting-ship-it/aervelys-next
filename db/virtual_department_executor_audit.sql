-- AERVELYS NEXT / Read-only verification for executable department agents
select
 (select count(*) from sim.virtual_department_handoffs h
   join sim.charter_requests r on r.id=h.request_id
   where r.request_code not like 'AV-SIM-%') as non_sim_handoffs,
 (select count(*) from sim.virtual_department_action_events e
   join sim.charter_requests r on r.id=e.request_id
   where r.request_code not like 'AV-SIM-%') as non_sim_agent_actions,
 (select count(*) from (
   select request_id from sim.virtual_department_handoffs
   where status='open' group by request_id having count(*)>1
 ) z) as duplicate_active_handoffs,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
   and active and command='select sim.virtual_department_execute_tick(8);') as active_worker_jobs,
 has_function_privilege('anon','public.aervelys_virtual_department_execute(integer)','EXECUTE') as anonymous_executor_allowed,
 has_function_privilege('anon','public.aervelys_virtual_handoffs_execution_overview()','EXECUTE') as anonymous_audit_allowed,
 has_function_privilege('authenticated','sim.virtual_department_execute_tick(integer)','EXECUTE') as direct_worker_allowed,
 has_table_privilege('authenticated','sim.virtual_department_action_events','SELECT') as direct_event_read_allowed,
 (select count(*) from sim.virtual_department_handoffs
   where status='open' and execution_state='waiting' and attempt_count>0) as waiting_exhausts_retries;
-- Expected: all *_allowed false; no non-SIM rows, no duplicate active rows;
-- exactly 1 active_worker_jobs; waiting_exhausts_retries = 0.
