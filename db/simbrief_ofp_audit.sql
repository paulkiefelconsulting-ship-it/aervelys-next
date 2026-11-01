select
 (select count(*) from sim.virtual_simbrief_ofp_imports) stored_ofp,
 (select count(*) from sim.virtual_simbrief_ofp_events) stored_events,
 (select count(*) from sim.flights) real_flights,
 (select count(*) from sim.virtual_rotation_time_estimates) rotation_estimates,
 (select count(*) from cron.job where jobname='aervelys-sim-department-handoffs' and active) scheduled_jobs,
 has_function_privilege('anon','public.aervelys_simbrief_ofp_submit(uuid,uuid,text,text,text,numeric,integer,text,timestamptz)','EXECUTE') anon_submit,
 has_function_privilege('anon','public.aervelys_simbrief_ofp_overview()','EXECUTE') anon_overview,
 has_function_privilege('authenticated','public.aervelys_simbrief_ofp_submit(uuid,uuid,text,text,text,numeric,integer,text,timestamptz)','EXECUTE') authorized_api,
 has_table_privilege('authenticated','sim.virtual_simbrief_ofp_imports','SELECT') direct_browser_read,
 has_table_privilege('authenticated','sim.virtual_simbrief_ofp_imports','UPDATE') direct_browser_update;
