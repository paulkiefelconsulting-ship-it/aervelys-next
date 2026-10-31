-- AERVELYS NEXT / source-truth tasks audit (read-only).
select
 (select count(*) from sim.virtual_evidence_tasks) as tasks,
 (select count(*) from sim.virtual_evidence_tasks where subject_kind='aircraft') as aircraft_tasks,
 (select count(*) from sim.virtual_evidence_tasks where subject_kind='crew') as crew_tasks,
 (select count(*) from sim.virtual_evidence_tasks where source_state='verified_in_source') as verified_source_facts,
 (select count(*) from (select subject_kind,subject_id,requirement_key
   from sim.virtual_evidence_tasks group by 1,2,3 having count(*)>1)x) as duplicate_tasks,
 (select count(*) from sim.virtual_evidence_tasks where workflow_state='resolved'
   and source_state<>'verified_in_source') as invented_resolution,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
   and active and schedule='*/10 * * * *'
   and command='select sim.virtual_department_full_cycle();') as active_scheduler,
 has_function_privilege('anon','public.aervelys_virtual_evidence_overview()','EXECUTE') anon_read,
 has_function_privilege('anon','public.aervelys_virtual_evidence_sync(integer)','EXECUTE') anon_sync,
 has_function_privilege('anon','public.aervelys_virtual_evidence_submit(bigint,text,text)','EXECUTE') anon_submit,
 has_function_privilege('anon','public.aervelys_virtual_evidence_review(bigint,boolean,text)','EXECUTE') anon_review,
 has_function_privilege('authenticated','sim.virtual_evidence_sync(integer)','EXECUTE') client_can_run_worker,
 has_table_privilege('authenticated','sim.virtual_evidence_tasks','SELECT') client_can_read_directly,
 has_table_privilege('authenticated','sim.virtual_evidence_task_events','INSERT') client_can_insert_directly;
-- Expected 77 tasks (5 aircraft * 7 + 21 crew * 2), 0 duplicate/invented,
-- 1 active scheduler, zero direct privileges/anon execute.
-- Worker idempotency: unchanged second sim.virtual_evidence_sync(200)
-- yields new_or_changed=0.
