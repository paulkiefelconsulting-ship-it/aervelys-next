-- AERVELYS NEXT / guarded registry proposal audit (read-only, no fictitious approvals).
select
 (select count(*) from sim.aircraft) as aircraft,
 (select count(*) from sim.people where active and pilot_role in ('PIC','SIC')) as pilots,
 (select count(*) from sim.virtual_registry_proposals) as proposals,
 (select count(*) from sim.virtual_registry_proposals where status='approved') as approved_proposals,
 (select count(*) from sim.aircraft_performance_profiles where verification_status='verified') as source_verified_profiles,
 (select count(*) from sim.pilot_qualifications where verified) as source_verified_ratings,
 (select count(*) from sim.virtual_department_resolution_options where operationally_usable) as operationally_usable_variants,
 (select count(*) from sim.virtual_department_resolution_options where verified_pic_candidates>0 or verified_sic_candidates>0) as eligible_crew_variants,
 (select count(*) from sim.virtual_registry_proposals p where p.status='submitted' and
  exists(select 1 from sim.virtual_registry_proposals q where q.status='submitted' and q.id<>p.id
  and q.subject_kind=p.subject_kind and q.subject_id=p.subject_id and q.target_key=p.target_key)) as duplicated_pending,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs'
  and active and command='select sim.virtual_department_full_cycle();') as active_sim_cron,
 has_function_privilege('anon','public.aervelys_registry_proposals_overview()','EXECUTE') as anon_overview,
 has_function_privilege('anon','public.aervelys_registry_profile_submit(uuid,integer,numeric,numeric,text)','EXECUTE') as anon_profile_submit,
 has_function_privilege('anon','public.aervelys_registry_type_rating_submit(uuid,text,text,date,date,text)','EXECUTE') as anon_type_submit,
 has_function_privilege('anon','public.aervelys_registry_proposal_review(bigint,boolean,text)','EXECUTE') as anon_review,
 has_table_privilege('authenticated','sim.virtual_registry_proposals','SELECT') as direct_proposal_read,
 has_table_privilege('authenticated','sim.virtual_registry_proposal_events','INSERT') as direct_event_write;
-- Expected: 0 unauthorized privileges and duplicate pending.
-- Without source evidence: 0 verified canonical facts and 0 operational approvals.
-- Run sim.virtual_department_resolution_tick(30) twice after a profile change;
-- second unchanged run should have variants_changed = 0.
