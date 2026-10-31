-- AERVELYS NEXT: evidence-based CEO system readiness snapshot.
-- Reports factual counts; never infers certification or operational readiness.
create function public.aervelys_airline_readiness_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
  where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
  raise exception 'AERVELYS NEXT readiness denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'fleet',jsonb_build_object(
   'total',(select count(*) from sim.aircraft),
   'available_status',(select count(*) from sim.aircraft where operational_status='available'),
   'verified_performance',(select count(*) from sim.aircraft_performance_profiles
     where verification_status='verified'),
   'maintenance_released',(select count(*) from sim.aircraft_maintenance_state
     where maintenance_release_verified),
   'insurance_verified',0
  ),
  'crew',jsonb_build_object(
   'active_pilots',(select count(*) from sim.people
      where active and pilot_role in('PIC','SIC')),
   'verified_type_ratings',(select count(*) from sim.pilot_qualifications q
      join sim.people p on p.id=q.person_id where q.verified and
       p.active and current_date between q.valid_from and q.valid_until),
   'verified_logbooks',(select count(*) from sim.virtual_pilot_hours
      where verification_status='verified')
  ),
  'sales',jsonb_build_object(
   'sim_profiles',(select count(*) from sim.sim_customer_profiles),
   'sim_requests',(select count(*) from sim.sim_customer_cases),
   'sim_fleet_plans',(select count(*) from sim.virtual_agent_fleet_plans),
   'sim_cases_with_candidates',(select count(*) from sim.virtual_agent_fleet_plans
      where aircraft_id is not null)
  ),
  'ops',jsonb_build_object(
   'real_flights',(select count(*) from sim.flights),
   'open_evidence_tasks',(select count(*) from sim.virtual_evidence_tasks
       where source_state<>'verified_in_source'),
   'review_needed',(select count(*) from sim.virtual_department_decisions
       where status='needs_review' and acknowledged_at is null),
   'resolution_variants',(select count(*) from sim.virtual_department_resolution_options)
  ),
  'sim_flights',jsonb_build_object(
   'missions',(select count(*) from sim.virtual_sim_missions),
   'running',(select count(*) from sim.virtual_sim_missions where lifecycle='running'),
   'completed',(select count(*) from sim.virtual_sim_missions where lifecycle='completed'),
   'sim_passengers',(select count(*) from sim.virtual_sim_passengers),
   'manual_phase_only',true,
   'simconnect_connected',false
  ),
  'automation',jsonb_build_object(
   'agents_enabled',coalesce((select enabled from sim.virtual_airline_agent_settings
     where id=1),false),
   'sim_customers_enabled',coalesce((select scheduled_enabled from sim.sim_customer_settings
     where id=1),false),
   'active_sim_crons',(select count(*) from cron.job
     where jobname='aervelys-sim-department-handoffs' and active
      and command='select sim.virtual_department_full_cycle();')
  ),
  'requirements',jsonb_build_array(
   'Verbindliche Flugzeug- und Versicherungsnachweise',
   'Fachlich gültige Crewqualifikationen und Ruhezeiten',
   'Echter SimConnect-Windows-Connector mit gesicherter Kopplung',
   'Durchgängige Flug- und Angebotsfreigaben nach vollständigem Test',
   'Echte Zeit-, Handling- und Missionskosten',
   'Authentifizierter Browser-End-to-End-Test aller Kernmodule'
  ),
  'simulation_only',true,
  'operational_ready',false,
  'readiness_metric_is_factual',true,
  'source','aervelys_next_sim_schema'
 );
end $fn$;
revoke all on function public.aervelys_airline_readiness_overview() from public,anon,authenticated;
grant execute on function public.aervelys_airline_readiness_overview() to authenticated;
