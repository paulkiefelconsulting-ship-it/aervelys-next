-- AERVELYS NEXT. Dedicated, bounded 10-minute SIM handoff reconciliation.
-- Journal-only: no flight movements, price quotes, crew assignments or outbound communication.
select cron.schedule(
 'aervelys-sim-department-handoffs',
 '*/10 * * * *',
 'select sim.virtual_department_handoff_tick(40);'
);
