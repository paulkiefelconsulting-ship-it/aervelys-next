select
 (select count(*) from sim.airport_fees) verified_fee_source_rows,
 (select count(*) from sim.virtual_rotation_time_estimates) rotation_estimates,
 (select count(*) from sim.virtual_sim_missions) active_sim_mission_rows,
 (select count(*) from sim.flights) actual_flight_rows,
 has_function_privilege('anon','public.aervelys_sim_route_economics_overview()','EXECUTE') as anonymous_can_read,
 has_function_privilege('authenticated','public.aervelys_sim_route_economics_overview()','EXECUTE') as authenticated_rpc_granted,
 has_function_privilege('authenticated','sim.virtual_route_cost_projection(uuid,uuid)','EXECUTE') as direct_internal_projection,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs' and active) as existing_cron_count;
