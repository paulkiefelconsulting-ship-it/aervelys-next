-- Attach charter code to each option; never return unrelated real charter cases.
create or replace function public.aervelys_virtual_resolutions_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in ('ceo','ops')) then
   raise exception 'SIM resolution overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'options',coalesce((select jsonb_agg(jsonb_build_object(
     'id',o.id,'decision_id',o.decision_id,'request_id',o.request_id,
     'request_code',r.request_code,'origin_icao',r.origin_icao,
     'destination_icao',r.destination_icao,'passengers',r.passengers,
     'variant_key',o.variant_key,'label',o.label,'aircraft_registration',o.aircraft_registration,
     'aircraft_type',o.aircraft_type,'proposed_departure',o.proposed_departure,
     'simulated_floor_eur',o.simulated_floor_eur,
     'positioning_component_eur',o.positioning_component_eur,
     'aircraft_plan_conflicts',o.aircraft_plan_conflicts,
     'roster_pic_candidates',o.roster_pic_candidates,'roster_sic_candidates',o.roster_sic_candidates,
     'verified_pic_candidates',o.verified_pic_candidates,'verified_sic_candidates',o.verified_sic_candidates,
     'seat_capacity_verified',o.seat_capacity_verified,
     'operationally_usable',o.operationally_usable,
     'finding',o.finding,'warnings',o.warnings,
     'evidence',o.evidence,'updated_at',o.updated_at
    ) order by o.decision_id desc,o.id)
    from (select * from sim.virtual_department_resolution_options
          order by decision_id desc,id desc limit 180)o
    join sim.charter_requests r on r.id=o.request_id
    where r.request_code like 'AV-SIM-%'),'[]'::jsonb),
  'simulation_only',true,'llm_connected',false,'operational_approval',false,
  'model_label','Fiktiver SIM-Kostenboden: Flugzeugpauschale + 350 EUR je Pax + ggf. 1.700 EUR Positionierung; keine realen Betriebskosten.'
 );
end $fn$;
