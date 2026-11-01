-- Apply user-directed OFP distance/time only to the specifically mapped candidate airframe.
create or replace function sim.virtual_route_cost_projection(p_request_id uuid,p_aircraft_id uuid)
returns jsonb language sql stable security definer
set search_path to pg_catalog,sim,pg_temp
as $fn$
with matched as (
 select
  r.id request_id,r.request_code,r.origin_icao,r.destination_icao,
  r.requested_departure,r.passengers,r.status as request_status,
  a.id aircraft_id,a.registration,a.aircraft_type,a.current_icao,
  coalesce(f.route_distance_nm,t.charter_distance_nm) as charter_distance_nm,
  coalesce(f.block_minutes,t.charter_block_minutes) as charter_block_minutes,
  f.imported_at as simbrief_imported_at,
  f.source_reference as simbrief_source_reference,
  f.route_text as simbrief_route_text,
  f.validation_status as simbrief_validation_status,
  t.positioning_origin,
  t.positioning_destination,t.positioning_distance_nm,t.positioning_block_minutes,
  t.estimated_at,t.simulation_model,t.maintenance_overlap,t.duty_overlap,
  t.positioning_window_valid,
  p.cost_per_block_hour_eur,p.verification_status,p.source_reference,
  p.max_still_air_range_nm,
  sp.assumed_groundspeed_kt,sp.fixed_block_buffer_minutes,
  case a.aircraft_type
   when 'Cessna Citation Longitude' then 3960::numeric
   when 'Pilatus PC-24' then 3000::numeric
   when 'Embraer Phenom 300E' then 2720::numeric
   when 'Cessna Citation CJ4' then 2560::numeric
   when 'Cirrus Vision Jet G2' then 2800::numeric
   else null::numeric end as purely_assumed_hourly_rate
 from sim.charter_requests r
 join sim.sim_customer_cases c on c.request_id=r.id
 cross join sim.aircraft a
 left join sim.virtual_rotation_time_estimates t
   on t.request_id=r.id and t.aircraft_id=a.id
 left join sim.virtual_simbrief_ofp_imports f
   on f.request_id=r.id and f.aircraft_id=a.id
    and f.origin_icao=r.origin_icao and f.destination_icao=r.destination_icao
 left join sim.aircraft_performance_profiles p on p.aircraft_id=a.id
 left join sim.virtual_aircraft_speed_assumptions sp on sp.aircraft_type=a.aircraft_type
 where r.id=p_request_id and a.id=p_aircraft_id and r.request_code like 'AV-SIM-%'
), priced as (
 select *,
  (verification_status='verified' and cost_per_block_hour_eur>0
   and nullif(btrim(source_reference),'') is not null) as verified_hourly,
  case when verification_status='verified' and cost_per_block_hour_eur>0
      and nullif(btrim(source_reference),'') is not null
   then cost_per_block_hour_eur else purely_assumed_hourly_rate end hourly_rate,
  case when current_icao=origin_icao then 0
    when positioning_origin=current_icao and positioning_destination=origin_icao
      and positioning_block_minutes between 1 and 1440 then positioning_block_minutes
    else null end as ferry_minutes,
  case when charter_block_minutes between 1 and 1440
    and charter_distance_nm between 1 and 12000
    then true else false end valid_charter_timing,
  case when current_icao=origin_icao then false else true end reposition_needed
 from matched
), rated as (
 select *,
  case when valid_charter_timing and hourly_rate>0
   then round(hourly_rate*charter_block_minutes/60,2) else null end as charter_component,
  case when ferry_minutes is not null and hourly_rate>0
   then round(hourly_rate*ferry_minutes/60,2) else null end as positioning_component,
  round(passengers*350::numeric,2) as passenger_component,
  (select count(*) from sim.airport_fees fee
    where fee.icao in(origin_icao,destination_icao)
      and fee.verification_status='verified'
      and nullif(btrim(fee.source_url),'') is not null
      and requested_departure::date between fee.valid_from and fee.valid_to) as verified_fee_entries,
  (select round(sum(fee.amount_eur),2) from sim.airport_fees fee
    where fee.icao in(origin_icao,destination_icao)
      and fee.verification_status='verified'
      and nullif(btrim(fee.source_url),'') is not null
      and requested_departure::date between fee.valid_from and fee.valid_to) as known_fee_subset
 from priced
)
select jsonb_build_object(
 'request_id',request_id,'request_code',request_code,
 'origin_icao',origin_icao,'destination_icao',destination_icao,
 'requested_departure',requested_departure,'passengers',passengers,
 'aircraft_id',aircraft_id,'registration',registration,'aircraft_type',aircraft_type,
 'aircraft_current_icao',current_icao,
 'charter_distance_nm',charter_distance_nm,'charter_block_minutes',charter_block_minutes,
 'positioning_needed',reposition_needed,
 'positioning_origin',case when reposition_needed then current_icao else null end,
 'positioning_distance_nm',case when reposition_needed then positioning_distance_nm else 0 end,
 'positioning_block_minutes',ferry_minutes,
 'hourly_rate_eur',hourly_rate,
 'hourly_rate_verified',verified_hourly,
 'hourly_rate_source',case when verified_hourly then source_reference else 'SIM model assumption by aircraft type (not verified)' end,
 'charter_component_eur',charter_component,
 'positioning_component_eur',positioning_component,
 'passenger_component_eur',passenger_component,
 'sim_cost_excluding_airport_fees_eur',
   case when charter_component is not null and positioning_component is not null
      then charter_component+positioning_component+passenger_component else null end,
 'airport_fee_known_subset_eur',known_fee_subset,
 'airport_verified_fee_entries',verified_fee_entries,
 'airport_fee_coverage_complete',false,
 'timing_source',case when simbrief_imported_at is not null then 'simbrief_latest_json_v2_user_fetch_unverified' else coalesce(simulation_model,'missing') end,
 'simbrief_imported_at',simbrief_imported_at,
 'simbrief_source_reference',simbrief_source_reference,
 'simbrief_route_text',simbrief_route_text,
 'simbrief_validation_status',simbrief_validation_status,
 'timing_calculated_at',estimated_at,
 'speed_assumption_kt',assumed_groundspeed_kt,
 'buffer_assumption_minutes',fixed_block_buffer_minutes,
 'range_nm_verified',case when verification_status='verified' then max_still_air_range_nm else null end,
 'range_needs_review',true,
 'maintenance_overlap',maintenance_overlap,'crew_duty_overlap',duty_overlap,
 'positioning_window_valid',positioning_window_valid,
 'warnings',to_jsonb(array_remove(array[
   'Nur fiktive SIM-Kalkulation: keine verifizierte Route, Freigabe oder tatsächlichen Kosten.',
   'Airportgebühren, Handling, Parken, Enteisung, Navigation und mögliche Tankstopps sind nicht vollständig enthalten.',
   case when not valid_charter_timing then 'Streckendistanz oder Blockzeit fehlen; kein SIM-Kostenboden berechenbar.' end,
   case when simbrief_imported_at is not null then 'SimBrief OFP wurde vom Benutzer importiert; zur Flugzeugzuordnung und Gültigkeit wurde keine operative Freigabe erteilt.' end,
   case when ferry_minutes is null then 'Positionierungsstrecke/-zeit unbekannt; kein vollständiger SIM-Kostenboden.' end,
   case when not verified_hourly then 'Stundensatz ausschließlich aus fiktivem Flugzeugtyp-Modell, nicht verifiziert.' end,
   case when coalesce(verified_fee_entries,0)=0 then 'Keine verifizierten Flughafentarife hinterlegt.' end,
   case when maintenance_overlap=true then 'Möglicher Wartungszeitkonflikt in der SIM-Planung.' end,
   case when duty_overlap=true then 'Möglicher Crew-Dienstzeitkonflikt in der SIM-Planung.' end,
   case when positioning_window_valid=false then 'Positionierungszeitfenster im SIM-Modell nicht ausreichend.' end
 ]::text[],null)),
 'is_simulation',true,'operationally_usable',false,
 'quote_authorized',false,'finance_postings',0,
 'cost_model','route_block_minutes_times_profile_or_type_assumption_v1'
)
from rated
$fn$;

create or replace function public.aervelys_sim_route_economics_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=auth.uid()
   and u.active and u.role in('ceo','ops')
 ) then raise exception 'SIM economics overview denied' using errcode='42501';end if;
 return jsonb_build_object(
  'projections',coalesce((
    select jsonb_agg(
      sim.virtual_route_cost_projection(r.id,a.id)
      order by r.requested_departure desc,a.registration
    )
    from (select r.id,r.requested_departure from sim.charter_requests r
      join sim.sim_customer_cases c on c.request_id=r.id
      where r.request_code like 'AV-SIM-%'
      order by r.requested_departure desc limit 80) r
    cross join sim.aircraft a
  ),'[]'::jsonb),
  'simulation_only',true,
  'operational_approval',false,
  'real_financial_postings',0,
  'fees_verified_complete',false,
  'method','User-imported SimBrief OFP distance/block time for matching airframe when present; otherwise existing simulated great-circle distances and approximate block times. All imports unverified; no dispatch approval.'
 );
end $fn$;
