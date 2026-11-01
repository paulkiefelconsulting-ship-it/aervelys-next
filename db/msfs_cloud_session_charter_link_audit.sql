-- AERVELYS NEXT / Cloud SIM links security and pollution audit
select
 (select count(*) from sim.virtual_msfs_charter_links) as links_total,
 (select count(*) from sim.virtual_msfs_charter_link_events) as link_events_total,
 (select count(*) from sim.msfs_bridge_devices) as cloud_devices,
 (select count(*) from sim.msfs_bridge_samples) as cloud_samples,
 (select count(*) from sim.virtual_sim_missions) as sim_missions,
 (select count(*) from sim.flights) as real_flight_records,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs' and active)
  as existing_sim_cron,
 has_function_privilege('anon','public.aervelys_msfs_charter_link(uuid,uuid,uuid)','EXECUTE')
  as anon_can_link,
 has_function_privilege('anon','public.aervelys_msfs_charter_unlink(uuid)','EXECUTE')
  as anon_can_unlink,
 has_function_privilege('anon','public.aervelys_msfs_charter_links_overview()','EXECUTE')
  as anon_can_overview,
 has_table_privilege('authenticated','sim.virtual_msfs_charter_links','SELECT')
  as authenticated_direct_table_read,
 has_table_privilege('authenticated','sim.virtual_msfs_charter_links','INSERT')
  as authenticated_direct_table_write;
