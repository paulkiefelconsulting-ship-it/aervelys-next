-- AERVELYS NEXT — SIM-only device pairing safety audit.
select
 (select count(*) from sim.virtual_sim_bridge_sessions) as sessions,
 (select count(*) from sim.virtual_sim_bridge_sessions b
  left join sim.virtual_sim_missions m on m.request_id=b.request_id
  left join sim.charter_requests r on r.id=m.request_id
  where r.request_code is null or r.request_code not like 'AV-SIM-%') as non_sim_sessions,
 (select count(*) from (
   select request_id from sim.virtual_sim_bridge_sessions
   where status='active' group by request_id having count(*)>1
 )q) as duplicated_active_devices,
 (select count(*) from sim.virtual_sim_missions
   where source_mode='local_simconnect_unverified') as bridge_sourced_missions,
 (select count(*) from cron.job
   where jobname='aervelys-sim-department-handoffs'
    and command='select sim.virtual_department_full_cycle();' and active) as existing_sim_cron,
 has_function_privilege('anon','public.aervelys_sim_bridge_ingest(text,bigint,text,jsonb)','EXECUTE') as public_bearer_ingest,
 has_function_privilege('anon','public.aervelys_sim_bridge_pair(uuid,integer)','EXECUTE') as anon_can_pair,
 has_function_privilege('anon','public.aervelys_sim_bridge_revoke(uuid)','EXECUTE') as anon_can_revoke,
 has_table_privilege('authenticated','sim.virtual_sim_bridge_sessions','SELECT') as direct_session_read,
 has_table_privilege('anon','sim.virtual_sim_bridge_sessions','SELECT') as anon_session_read,
 has_table_privilege('authenticated','sim.virtual_sim_bridge_sessions','INSERT') as direct_session_write,
 (select count(*) from sim.flights) as actual_flight_records;
-- Only the 366-bit bearer-protected ingest RPC is deliberately exposed to anon;
-- pairing, revocation and stored sessions require guarded CEO/OPS RPCs.
-- A browser or Windows test should not create an operational flight.
