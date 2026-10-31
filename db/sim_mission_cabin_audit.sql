-- AERVELYS NEXT: SIM mission access and isolation audit.
select
 (select count(*) from sim.virtual_sim_missions) missions,
 (select count(*) from sim.virtual_sim_passengers) passengers,
 (select count(*) from sim.virtual_sim_mission_events) mission_events,
 (select count(*) from sim.virtual_sim_missions m
   left join sim.charter_requests r on r.id=m.request_id
   where r.request_code is null or r.request_code not like 'AV-SIM-%') non_sim_missions,
 (select count(*) from sim.virtual_sim_passengers p
   left join sim.virtual_sim_missions m on m.request_id=p.request_id
   where m.request_id is null) orphan_passengers,
 (select count(*) from (
   select request_id,seat_index from sim.virtual_sim_passengers
   group by request_id,seat_index having count(*)>1
 )t) duplicate_seats,
 (select count(*) from sim.virtual_sim_missions
   where source_mode<>'manual_simulation') false_telemetry_source,
 (select count(*) from cron.job
   where jobname='aervelys-sim-department-handoffs'
    and command='select sim.virtual_department_full_cycle();' and active) active_jobs,
 has_function_privilege('anon','public.aervelys_sim_missions_overview()','EXECUTE') anonymous_overview,
 has_function_privilege('anon','public.aervelys_sim_mission_create(uuid,text)','EXECUTE') anonymous_create,
 has_function_privilege('anon','public.aervelys_sim_mission_action(uuid,text,text,integer)','EXECUTE') anonymous_action,
 has_function_privilege('authenticated','sim.virtual_cabin_step_internal(uuid,integer)','EXECUTE') client_internal_step,
 has_function_privilege('authenticated','sim.virtual_cabin_tick(integer)','EXECUTE') client_internal_tick,
 has_table_privilege('authenticated','sim.virtual_sim_missions','SELECT') direct_mission_read,
 has_table_privilege('authenticated','sim.virtual_sim_passengers','UPDATE') direct_passenger_update;
-- Expected: all anomaly and privilege fields zero / false; exactly one scheduler.
