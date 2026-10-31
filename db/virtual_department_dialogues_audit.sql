-- AERVELYS NEXT / read-only evidence dialogue safety checks.
select
 (select count(*) from sim.virtual_department_questions) as questions,
 (select count(*) from sim.virtual_department_dialogue_events where kind='question') as question_events,
 (select count(*) from sim.virtual_department_dialogue_events where kind='answer') as answer_events,
 (select count(*) from (
    select handoff_id,question_key from sim.virtual_department_questions
    group by 1,2 having count(*)>1
  ) x) as duplicate_questions,
 (select count(*) from sim.virtual_department_questions q
    join sim.charter_requests r on r.id=q.request_id
    where r.request_code not like 'AV-SIM-%') as non_sim_questions,
 (select count(*) from sim.virtual_department_dialogue_events e
    join sim.charter_requests r on r.id=e.request_id
    where r.request_code not like 'AV-SIM-%') as non_sim_messages,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
    and active and schedule='*/10 * * * *'
    and command='select sim.virtual_department_full_cycle();') as shared_cron_jobs,
 has_function_privilege('anon','public.aervelys_virtual_dialogues_overview()','EXECUTE') as anonymous_can_read,
 has_function_privilege('anon','public.aervelys_virtual_dialogues_sync(integer)','EXECUTE') as anonymous_can_sync,
 has_function_privilege('authenticated','sim.virtual_department_dialogue_tick(integer)','EXECUTE') as user_can_run_internal,
 has_table_privilege('authenticated','sim.virtual_department_questions','SELECT') as user_can_read_questions,
 has_table_privilege('authenticated','sim.virtual_department_dialogue_events','SELECT') as user_can_read_dialogue_events;
-- Expected: duplicate/non-SIM=0, shared_cron_jobs=1, privilege fields=false.
-- Idempotency test: run sim.virtual_department_dialogue_tick(40) twice
-- without changing source evidence, then expect the second run to
-- report questions_new=0 and answers_new=0.
