select
 (select count(*) from sim.virtual_sim_missions) virtual_missions,
 (select count(*) from sim.virtual_sim_mission_events) sim_mission_events,
 (select count(*) from sim.msfs_bridge_devices) cloud_devices,
 (select count(*) from sim.msfs_bridge_samples) cloud_samples,
 (select count(*) from sim.virtual_msfs_charter_links where unlinked_at is null) active_cloud_links,
 (select count(*) from sim.flights) actual_flights,
 has_function_privilege('anon','public.aervelys_sim_cloud_phase_sync(uuid)','EXECUTE') anon_can_sync,
 has_function_privilege('authenticated','public.aervelys_sim_cloud_phase_sync(uuid)','EXECUTE') authenticated_rpc_enabled,
 has_table_privilege('authenticated','sim.virtual_sim_missions','UPDATE') browser_direct_mission_write,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs' and active) existing_sim_crons;
