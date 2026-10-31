-- AERVELYS NEXT / read-only SIM decision desk audit.
select
 (select count(*) from sim.virtual_department_decisions) as decision_tasks,
 (select count(*) from sim.virtual_department_decision_events where outcome='candidate_proposed') as candidate_events,
 (select count(*) from sim.virtual_department_decisions where status='needs_review' and acknowledged_at is null) as reviews_pending,
 (select count(*) from (select question_id from sim.virtual_department_decisions
   group by question_id having count(*)>1) x) as duplicate_question_decisions,
 (select count(*) from sim.virtual_department_decisions d
   join sim.charter_requests r on r.id=d.request_id
   where r.request_code not like 'AV-SIM-%') as non_sim_tasks,
 (select count(*) from sim.virtual_department_decision_events e
   join sim.charter_requests r on r.id=e.request_id
   where r.request_code not like 'AV-SIM-%') as non_sim_events,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
   and active and schedule='*/10 * * * *'
   and command='select sim.virtual_department_full_cycle();') as active_sim_crons,
 has_function_privilege('anon','public.aervelys_virtual_decisions_overview()','EXECUTE') as anon_read,
 has_function_privilege('anon','public.aervelys_virtual_decisions_run(integer)','EXECUTE') as anon_run,
 has_function_privilege('anon','public.aervelys_virtual_decision_acknowledge(bigint,text)','EXECUTE') as anon_ack,
 has_function_privilege('authenticated','sim.virtual_department_decision_tick(integer)','EXECUTE') as public_internal_worker,
 has_table_privilege('authenticated','sim.virtual_department_decisions','SELECT') as direct_task_read,
 has_table_privilege('authenticated','sim.virtual_department_decision_events','SELECT') as direct_event_read;
-- Expected: zero duplicate/non-SIM, one cron, all access flags false.
-- Retry test: run sim.virtual_department_full_cycle() twice without changed
-- simulation inputs; the second unchanged run must add zero decision events.
