-- SIM finance cross-link: modeled charter indications, no ledger entries or realized profit.
create or replace function public.aervelys_sim_missions_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
  where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
   raise exception 'SIM mission overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
 'requests',coalesce((select jsonb_agg(jsonb_build_object(
  'request_id',r.id,'request_code',r.request_code,
  'origin_icao',r.origin_icao,'destination_icao',r.destination_icao,
  'requested_departure',r.requested_departure,'passengers',r.passengers,
  'charter_status',r.status,'customer_lifecycle',c.lifecycle,
  'aircraft_registration',a.registration,'plan_status',p.status
 ) order by r.requested_departure desc) from
  (select r.* from sim.charter_requests r join sim.sim_customer_cases c on c.request_id=r.id
   where r.request_code like 'AV-SIM-%' order by r.requested_departure desc limit 80) r
  join sim.sim_customer_cases c on c.request_id=r.id
  left join sim.virtual_agent_fleet_plans p on p.request_id=r.id
  left join sim.aircraft a on a.id=p.aircraft_id),'[]'::jsonb),
 'missions',coalesce((select jsonb_agg(jsonb_build_object(
  'request_id',m.request_id,'route_text',m.route_text,'route_origin',m.route_origin,
  'phase',m.phase,'lifecycle',m.lifecycle,'elapsed_minutes',m.elapsed_minutes,
  'source_mode',m.source_mode,'created_at',m.created_at,
  'updated_at',m.updated_at,'average_satisfaction',
  (select round(avg(satisfaction)::numeric,1)
   from sim.virtual_sim_passengers pax where pax.request_id=m.request_id)
 ) order by m.updated_at desc) from
  (select * from sim.virtual_sim_missions order by updated_at desc limit 80)m),'[]'::jsonb),
 'passengers',coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'request_id',p.request_id,'seat_index',p.seat_index,
  'satisfaction',p.satisfaction,'hunger',p.hunger,'thirst',p.thirst,
  'restroom_need',p.restroom_need,'comfort',p.comfort,'fatigue',p.fatigue,
  'updated_at',p.updated_at
 ) order by p.request_id,p.seat_index) from sim.virtual_sim_passengers p
  where p.request_id in(select request_id from sim.virtual_sim_missions
   order by updated_at desc limit 80)),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'request_id',e.request_id,'event_kind',e.event_kind,
  'passenger_id',e.passenger_id,'payload',e.payload,'created_at',e.created_at
 ) order by e.id desc) from
  (select * from sim.virtual_sim_mission_events order by id desc limit 160)e),'[]'::jsonb),
 'finance_indications',coalesce((select jsonb_agg(jsonb_build_object(
  'request_id',r.id,'request_code',r.request_code,
  'indicated_price_eur',p.indicated_price_eur,
  'price_status',p.status,
  'modelled_cost_floor_eur',coalesce(v.simulated_floor_eur,p.simulated_cost_floor_eur),
  'potential_difference_eur',case
   when p.indicated_price_eur is not null
    and coalesce(v.simulated_floor_eur,p.simulated_cost_floor_eur) is not null
   then round(p.indicated_price_eur-coalesce(v.simulated_floor_eur,p.simulated_cost_floor_eur),2)
   else null end,
  'revenue_booked',false,'costs_booked',false,'profit_realized',false,
  'source','fictitious_sim_indication_only')
  order by r.requested_departure desc)
  from sim.charter_requests r
   join sim.sim_customer_cases c on c.request_id=r.id
   left join lateral(select s.indicated_price_eur,s.simulated_cost_floor_eur,s.status
    from sim.sim_customer_price_proposals s where s.request_id=r.id
    order by s.revision desc,s.created_at desc limit 1)p on true
   left join lateral(select o.simulated_floor_eur
    from sim.virtual_department_resolution_options o
    where o.request_id=r.id and o.variant_key='keep_plan'
    order by o.updated_at desc,o.id desc limit 1)v on true
  where r.request_code like 'AV-SIM-%'),'[]'::jsonb),
 'simulation_only',true,'simconnect_connected',false,'real_flight_approvals',false,
 'route_source','pilot_simbrief_paste'
 );
end $fn$;
