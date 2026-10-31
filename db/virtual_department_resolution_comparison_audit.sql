-- AERVELYS NEXT / read-only alternatives and permission audit
select
 (select count(*) from sim.virtual_department_resolution_options) as variants,
 (select count(distinct decision_id) from sim.virtual_department_resolution_options) as compared_decisions,
 (select count(*) from (select decision_id,variant_key from sim.virtual_department_resolution_options
    group by 1,2 having count(*)>1)x) as duplicate_variants,
 (select count(*) from sim.virtual_department_resolution_options o
    join sim.charter_requests r on r.id=o.request_id where r.request_code not like 'AV-SIM-%') as non_sim_variants,
 (select count(*) from sim.virtual_department_resolution_options where operationally_usable) as released_variants,
 (select count(*) from sim.virtual_department_resolution_options
    where seat_capacity_verified and (verified_pic_candidates=0 or verified_sic_candidates=0)) as incomplete_verified_crew,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
    and active and command='select sim.virtual_department_full_cycle();') as shared_cron_jobs,
 has_function_privilege('anon','public.aervelys_virtual_resolutions_overview()','EXECUTE') as anon_read,
 has_function_privilege('anon','public.aervelys_virtual_resolutions_sync(integer)','EXECUTE') as anon_run,
 has_function_privilege('authenticated','sim.virtual_department_resolution_tick(integer)','EXECUTE') as client_internal_execute,
 has_table_privilege('authenticated','sim.virtual_department_resolution_options','SELECT') as direct_option_read;
-- Expected: 0 duplicates, 0 non-SIM, 0 operational releases,
-- shared_cron_jobs=1 and all *_read/*_execute/anon flags false.
-- Re-run the SIM worker without data changes: variants_changed must be 0.
