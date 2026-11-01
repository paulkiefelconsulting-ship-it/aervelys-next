-- AERVELYS NEXT: store only validated sampled cockpit instruments, no operational release.
alter table sim.virtual_sim_bridge_sessions add column
  last_sample jsonb not null default '{}'::jsonb
  check(jsonb_typeof(last_sample)='object');
create or replace function public.aervelys_sim_bridge_ingest(
 p_token text,p_seq bigint,p_phase text default null,p_sample jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 conn sim.virtual_sim_bridge_sessions%rowtype;
 mission sim.virtual_sim_missions%rowtype;
 new_phase text:=nullif(lower(btrim(coalesce(p_phase,''))),'');
 gs numeric;agl numeric;vs numeric;ias numeric;ground boolean;engine boolean;
 prior_idx integer;next_idx integer;
 stage text[]:=array['boarding','taxi_out','takeoff','climb','cruise',
  'descent','approach','landing','taxi_in','arrived'];
begin
 if p_token is null or p_token !~ '^[a-f0-9]{96}$'
  or p_seq is null or p_seq<1 or p_seq>10000000
  or p_sample is null or jsonb_typeof(p_sample)<>'object'
  or length(p_sample::text)>1500
  or (new_phase is not null and not new_phase=any(stage)) then
   raise exception 'Invalid SIM bridge event' using errcode='22023';
 end if;
 select * into conn from sim.virtual_sim_bridge_sessions
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and status='active' and expires_at>now()
  for update;
 if not found then
  raise exception 'Invalid or expired SIM pairing' using errcode='42501';
 end if;
 if p_seq<=conn.last_seq then
  raise exception 'Duplicate or out-of-order telemetry sequence' using errcode='22023';
 end if;
 if conn.last_seen_at is not null and now()-conn.last_seen_at<interval '0.5 seconds' then
  raise exception 'Device event rate too high' using errcode='22023';
 end if;
 select m.* into mission from sim.virtual_sim_missions m
  join sim.charter_requests r on r.id=m.request_id
  join sim.sim_customer_cases c on c.request_id=m.request_id
  where m.request_id=conn.request_id and r.request_code like 'AV-SIM-%'
    and m.lifecycle in('running','paused') for update of m;
 if not found then raise exception 'Paired SIM mission no longer active' using errcode='22023';end if;
 if p_sample ?& array['on_ground','groundspeed_kt','agl_ft','vertical_speed_fpm','indicated_airspeed_kt']
   then
  if jsonb_typeof(p_sample->'on_ground')<>'boolean'
   or jsonb_typeof(p_sample->'groundspeed_kt')<>'number'
   or jsonb_typeof(p_sample->'agl_ft')<>'number'
   or jsonb_typeof(p_sample->'vertical_speed_fpm')<>'number'
   or jsonb_typeof(p_sample->'indicated_airspeed_kt')<>'number'
   or (p_sample ? 'engine_running' and jsonb_typeof(p_sample->'engine_running')<>'boolean')
   then
   raise exception 'Invalid SimConnect sample types' using errcode='22023';
  end if;
  ground:=(p_sample->>'on_ground')::boolean;
  gs:=(p_sample->>'groundspeed_kt')::numeric;
  agl:=(p_sample->>'agl_ft')::numeric;
  vs:=(p_sample->>'vertical_speed_fpm')::numeric;
  ias:=(p_sample->>'indicated_airspeed_kt')::numeric;
  if gs not between 0 and 900 or agl not between -100 and 120000
   or vs not between -15000 and 15000 or ias not between 0 and 900 then
   raise exception 'Implausible SimConnect measurements' using errcode='22023';
  end if;
 else
  -- Accept only a narrow empty heartbeat; phase transitions demand telemetry.
  if new_phase is not null or p_sample<>'{}'::jsonb then
   raise exception 'Incomplete telemetry cannot advance a SIM phase' using errcode='22023';
  end if;
 end if;

 if new_phase is not null then
  if mission.lifecycle<>'running' or mission.phase='arrived' then
   raise exception 'SIM mission not eligible for automatic phase' using errcode='22023';
  end if;
  prior_idx:=array_position(stage,mission.phase);
  next_idx:=array_position(stage,new_phase);
  if prior_idx is null or
   not (next_idx=prior_idx+1 or (mission.phase='approach' and new_phase='climb')) then
   raise exception 'SIM phase transition rejected' using errcode='22023';
  end if;
  if not (
   (new_phase='taxi_out' and ground and gs>=7)
   or (new_phase='takeoff' and not ground and agl>=35 and ias>=60)
   or (new_phase='climb' and not ground and agl>=300 and vs>=200
       and (mission.phase<>'approach' or (agl>=400 and vs>=500)))
   or (new_phase='cruise' and not ground and agl>=4000 and abs(vs)<=350)
   or (new_phase='descent' and not ground and agl>=2000 and vs<=-400)
   or (new_phase='approach' and not ground and agl<=3200 and vs<=-150)
   or (new_phase='landing' and ground and gs>=25)
   or (new_phase='taxi_in' and ground and gs<=25)
   or (new_phase='arrived' and ground and gs<=3
     and p_sample->>'engine_running'='false')
  ) then
   raise exception 'Telemetry does not support requested simulated phase'
     using errcode='22023';
  end if;
  update sim.virtual_sim_missions set phase=new_phase,
   source_mode='local_simconnect_unverified',updated_at=now()
   where request_id=conn.request_id;
  insert into sim.virtual_sim_mission_events
    (request_id,event_kind,payload)
   values(conn.request_id,'phase_changed',
    jsonb_build_object('previous',mission.phase,'next',new_phase,
      'source','local_simconnect_unverified','sample',p_sample,
      'session_id',conn.id,'device_seq',p_seq,'real_flight_changes',0));
 end if;
 update sim.virtual_sim_bridge_sessions set last_seen_at=now(),last_seq=p_seq,
  accepted_events=accepted_events+1,
  last_sample=case when p_sample ? 'on_ground' then jsonb_build_object(
     'on_ground',ground,
     'groundspeed_kt',gs,
     'agl_ft',agl,
     'vertical_speed_fpm',vs,
     'indicated_airspeed_kt',ias,
     'engine_running',case when p_sample ? 'engine_running'
       then (p_sample->>'engine_running')::boolean else null end
    ) else last_sample end,
  last_phase=coalesce(new_phase,last_phase),updated_at=now()
 where id=conn.id;
 return jsonb_build_object('accepted',true,'phase_changed',new_phase is not null,
  'phase',coalesce(new_phase,mission.phase),'simulation_only',true,
  'telemetry_trusted_for_ops',false,'real_flight_changes',0,
  'crew_assignments',0,'financial_postings',0);
end $fn$;

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
 'bridge_sessions',coalesce((select jsonb_agg(jsonb_build_object(
  'session_id',s.id,'request_id',s.request_id,'status',s.status,
  'issued_at',s.issued_at,'expires_at',s.expires_at,
  'last_seen_at',s.last_seen_at,'last_sample',s.last_sample,
  'accepted_events',s.accepted_events,
  'last_phase',s.last_phase,
  'heartbeat_recent',s.status='active' and s.expires_at>now()
     and s.last_seen_at>now()-interval '20 seconds'
 ) order by s.issued_at desc) from (
  select * from sim.virtual_sim_bridge_sessions
   order by issued_at desc limit 100
 )s),'[]'::jsonb),
 'bridge_pairing_available',true,
 'simulation_only',true,'simconnect_connected',false,'real_flight_approvals',false,
 'route_source','pilot_simbrief_paste'
 );
end $fn$;
