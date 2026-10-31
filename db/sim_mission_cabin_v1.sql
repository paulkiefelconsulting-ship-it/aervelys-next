-- AERVELYS NEXT v1: Flight experience / passenger cabin simulation.
-- STRICT ISOLATION: only sim.sim_customer_cases + AV-SIM-* charter requests.
-- No real flights, release, crew assignment, email, payment or SimConnect telemetry.
create table sim.virtual_sim_missions(
 request_id uuid primary key references sim.sim_customer_cases(request_id) on delete cascade,
 route_text text not null check(length(route_text) between 3 and 1500),
 route_origin text not null default 'user_simbrief_paste' check(route_origin='user_simbrief_paste'),
 phase text not null default 'planning' check(phase in(
  'planning','boarding','taxi_out','takeoff','climb','cruise',
  'descent','approach','landing','taxi_in','arrived','debrief')),
 lifecycle text not null default 'draft' check(lifecycle in('draft','running','paused','completed')),
 elapsed_minutes integer not null default 0 check(elapsed_minutes between 0 and 1440),
 last_tick_at timestamptz not null default now(),
 source_mode text not null default 'manual_simulation' check(source_mode='manual_simulation'),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((lifecycle='draft' and phase='planning')
     or (lifecycle in('running','paused') and phase not in('planning','debrief','arrived'))
     or (lifecycle='completed' and phase='debrief')
     or (lifecycle='running' and phase='arrived'))
);
create index virtual_sim_missions_active_idx on sim.virtual_sim_missions(lifecycle,last_tick_at);

create table sim.virtual_sim_passengers(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references sim.virtual_sim_missions(request_id) on delete cascade,
 seat_index integer not null check(seat_index between 1 and 30),
 satisfaction integer not null default 85 check(satisfaction between 0 and 100),
 hunger integer not null default 20 check(hunger between 0 and 100),
 thirst integer not null default 20 check(thirst between 0 and 100),
 restroom_need integer not null default 10 check(restroom_need between 0 and 100),
 comfort integer not null default 75 check(comfort between 0 and 100),
 fatigue integer not null default 15 check(fatigue between 0 and 100),
 updated_at timestamptz not null default now(),
 unique(request_id,seat_index)
);
create index virtual_sim_passengers_request_idx on sim.virtual_sim_passengers(request_id,seat_index);

create table sim.virtual_sim_mission_events(
 id bigint generated always as identity primary key,
 request_id uuid not null references sim.virtual_sim_missions(request_id) on delete cascade,
 passenger_id uuid references sim.virtual_sim_passengers(id) on delete set null,
 event_kind text not null check(event_kind in(
  'mission_created','route_updated','started','phase_changed','paused','resumed',
  'cabin_clock','service','debrief')),
 actor_id uuid,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index virtual_sim_mission_events_case_idx on sim.virtual_sim_mission_events(request_id,id desc);
alter table sim.virtual_sim_missions enable row level security;
alter table sim.virtual_sim_passengers enable row level security;
alter table sim.virtual_sim_mission_events enable row level security;
revoke all on sim.virtual_sim_missions,sim.virtual_sim_passengers,sim.virtual_sim_mission_events
 from public,anon,authenticated;
revoke all on sequence sim.virtual_sim_mission_events_id_seq from public,anon,authenticated;

create function sim.virtual_cabin_step_internal(p_request_id uuid,p_minutes integer)
returns integer language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare touched integer;
begin
 if p_minutes is null or p_minutes not between 1 and 60 then
  raise exception 'Invalid cabin simulation minute step' using errcode='22023';
 end if;
 update sim.virtual_sim_passengers p set
  hunger=least(100,hunger+ceil(p_minutes*0.23)::integer),
  thirst=least(100,thirst+ceil(p_minutes*0.32)::integer),
  restroom_need=least(100,restroom_need+ceil(p_minutes*0.24)::integer),
  fatigue=least(100,fatigue+ceil(p_minutes*0.16)::integer),
  satisfaction=greatest(0,satisfaction
    -case when hunger>=60 then ceil(p_minutes*0.12)::integer else 0 end
    -case when thirst>=60 then ceil(p_minutes*0.17)::integer else 0 end
    -case when restroom_need>=65 then ceil(p_minutes*0.16)::integer else 0 end
    -case when comfort<40 then ceil(p_minutes*0.10)::integer else 0 end),
  updated_at=now()
 where p.request_id=p_request_id;
 get diagnostics touched=row_count;
 update sim.virtual_sim_missions set elapsed_minutes=elapsed_minutes+p_minutes,
  updated_at=now() where request_id=p_request_id;
 return touched;
end $fn$;
revoke all on function sim.virtual_cabin_step_internal(uuid,integer) from public,anon,authenticated;

create function sim.virtual_cabin_tick(p_limit integer default 20)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 mission record;
 mins integer;
 progressed integer:=0;
 changed integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 50 then
  raise exception 'Invalid cabin batch size' using errcode='22023';
 end if;
 if session_user<>'postgres' and (uid is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=uid and u.active and u.role in('ceo','ops')
 )) then raise exception 'SIM cabin worker denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(593,722) then
  return jsonb_build_object('skipped','worker_running','simulation_only',true,'telemetry_connected',false);
 end if;
 for mission in
  select m.request_id,m.last_tick_at,m.elapsed_minutes
   from sim.virtual_sim_missions m
   join sim.charter_requests r on r.id=m.request_id
   where m.lifecycle='running' and r.request_code like 'AV-SIM-%'
    and m.elapsed_minutes<1440 and m.last_tick_at<=now()-interval '1 minute'
   order by m.last_tick_at asc limit p_limit for update of m skip locked
 loop
  mins:=least(20,1440-mission.elapsed_minutes,
    greatest(0,floor(extract(epoch from now()-mission.last_tick_at)/60)::integer));
  if mins>0 then
   changed:=changed+sim.virtual_cabin_step_internal(mission.request_id,mins);
   progressed:=progressed+1;
   update sim.virtual_sim_missions
    set last_tick_at=mission.last_tick_at+make_interval(mins=>mins)
    where request_id=mission.request_id;
   insert into sim.virtual_sim_mission_events(request_id,event_kind,payload)
    values(mission.request_id,'cabin_clock',
      jsonb_build_object('minutes',mins,'source','server_clock_simulation',
       'telemetry',false,'operational_changes',0));
  end if;
 end loop;
 return jsonb_build_object('missions_advanced',progressed,'passenger_updates',changed,
  'simulation_only',true,'telemetry_connected',false,'real_flight_changes',0);
end $fn$;
revoke all on function sim.virtual_cabin_tick(integer) from public,anon,authenticated;

create function public.aervelys_sim_mission_create(p_request_id uuid,p_route text)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid(); r record; cleaned text; pax integer; created boolean:=false;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u
   where u.user_id=uid and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM mission create denied' using errcode='42501';
 end if;
 cleaned:=upper(regexp_replace(btrim(coalesce(p_route,'')),'[[:space:]]+',' ','g'));
 if length(cleaned) not between 3 and 1500 then
  raise exception 'A 3..1500 character route pasted by the pilot is required'
   using errcode='22023';
 end if;
 select r.id,r.request_code,r.passengers into r from sim.charter_requests r
 join sim.sim_customer_cases c on c.request_id=r.id
 where r.id=p_request_id and r.request_code like 'AV-SIM-%'
 and r.status not in ('cancelled','declined','completed')
 and c.lifecycle not in ('withdrawn','declined')
 for update of r;
 if not found or r.passengers not between 1 and 30 then
  raise exception 'Active simulated charter case with 1..30 passengers required'
   using errcode='22023';
 end if;
 insert into sim.virtual_sim_missions(request_id,route_text,created_by)
 values(r.id,cleaned,uid)
 on conflict(request_id) do nothing;
 created:=found;
 if not created then
  return jsonb_build_object('created',false,'exists',true,'request_id',r.id,
    'simulation_only',true,'flight_releases',0);
 end if;
 insert into sim.virtual_sim_passengers(request_id,seat_index)
 select r.id,generate_series(1,r.passengers);
 insert into sim.virtual_sim_mission_events(request_id,event_kind,actor_id,payload)
 values(r.id,'mission_created',uid,
  jsonb_build_object('route',cleaned,'origin','user_simbrief_paste',
   'pax_count',r.passengers,'phase_source','manual_simulation'));
 return jsonb_build_object('created',true,'request_id',r.id,'passengers',r.passengers,
  'simulation_only',true,'flight_releases',0,'telemetry_connected',false);
end $fn$;
revoke all on function public.aervelys_sim_mission_create(uuid,text) from public,anon,authenticated;
grant execute on function public.aervelys_sim_mission_create(uuid,text) to authenticated;

create function public.aervelys_sim_mission_action(
 p_request_id uuid,p_action text,p_value text default null,p_seat_index integer default null)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 m sim.virtual_sim_missions%rowtype;
 pax sim.virtual_sim_passengers%rowtype;
 next_phase text;
 phases text[]:=array['planning','boarding','taxi_out','takeoff','climb','cruise',
  'descent','approach','landing','taxi_in','arrived','debrief'];
 mins integer; ev_kind text; payload jsonb:='{}'::jsonb;
 avg_score numeric;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u where u.user_id=uid
  and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM mission action denied' using errcode='42501';
 end if;
 select m.* into m from sim.virtual_sim_missions m
  join sim.charter_requests r on r.id=m.request_id
  where m.request_id=p_request_id and r.request_code like 'AV-SIM-%' for update of m;
 if not found then raise exception 'SIM mission not found' using errcode='22023';end if;
 if p_action='route' then
  next_phase:=upper(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));
  if m.lifecycle<>'draft' or length(next_phase) not between 3 and 1500 then
   raise exception 'Route can only be changed in SIM planning with valid route text'
     using errcode='22023';
  end if;
  update sim.virtual_sim_missions set route_text=next_phase,updated_at=now()
   where request_id=p_request_id;
  ev_kind:='route_updated';
  payload:=jsonb_build_object('route',next_phase,'source','user_simbrief_paste');
 elsif p_action='start' then
  if m.lifecycle<>'draft' then raise exception 'SIM mission already started' using errcode='22023';end if;
  update sim.virtual_sim_missions set phase='boarding',lifecycle='running',
   last_tick_at=now(),updated_at=now() where request_id=p_request_id;
  ev_kind:='started';
  payload:=jsonb_build_object('phase','boarding','telemetry',false);
 elsif p_action='phase' then
  next_phase:=lower(btrim(coalesce(p_value,'')));
  if m.lifecycle<>'running'
    or array_position(phases,next_phase) is distinct from array_position(phases,m.phase)+1
    or next_phase='debrief' then
   raise exception 'Only the next manual SIM flight phase is allowed'
    using errcode='22023';
  end if;
  update sim.virtual_sim_missions set phase=next_phase,updated_at=now()
   where request_id=p_request_id;
  ev_kind:='phase_changed';
  payload:=jsonb_build_object('previous',m.phase,'next',next_phase,
   'source','manual_simulation','simconnect_telemetry',false);
 elsif p_action='pause' then
  if m.lifecycle<>'running' then raise exception 'Mission is not running' using errcode='22023';end if;
  update sim.virtual_sim_missions set lifecycle='paused',last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='paused';payload:=jsonb_build_object('mode','manual_simulation');
 elsif p_action='resume' then
  if m.lifecycle<>'paused' then raise exception 'Mission is not paused' using errcode='22023';end if;
  update sim.virtual_sim_missions set lifecycle='running',last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='resumed';payload:=jsonb_build_object('mode','manual_simulation');
 elsif p_action='clock' then
  if m.lifecycle<>'running' or p_value is null
   or btrim(p_value)!~'^[0-9]{1,2}$' then
   raise exception 'Only running SIM flights support a 1..60 minute manual step' using errcode='22023';
  end if;
  mins:=btrim(p_value)::integer;
  if mins not between 1 and 60 or m.elapsed_minutes+mins>1440 then
   raise exception 'SIM minute step or total duration out of range' using errcode='22023';
  end if;
  perform sim.virtual_cabin_step_internal(p_request_id,mins);
  update sim.virtual_sim_missions set last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='cabin_clock';
  payload:=jsonb_build_object('minutes',mins,'source','manual_simulation',
    'telemetry',false);
 elsif p_action='service' then
  if m.lifecycle<>'running' or m.phase not in('boarding','cruise')
   or p_seat_index is null or p_value not in('water','coffee','meal','snack','restroom','blanket','conversation')
   or (m.phase<>'cruise' and p_value in('coffee','meal')) then
   raise exception 'Service only possible for selected passenger and permitted SIM phase'
    using errcode='22023';
  end if;
  select * into pax from sim.virtual_sim_passengers
   where request_id=p_request_id and seat_index=p_seat_index for update;
  if not found then raise exception 'Passenger not present in cabin' using errcode='22023';end if;
  update sim.virtual_sim_passengers set
   thirst=greatest(0,least(100,thirst+case p_value
     when 'water' then -40 when 'coffee' then -20 when 'meal' then 10 else 0 end)),
   hunger=greatest(0,least(100,hunger+case p_value
     when 'meal' then -65 when 'snack' then -30 else 0 end)),
   restroom_need=greatest(0,least(100,restroom_need+case p_value
     when 'restroom' then -85 when 'coffee' then 12 when 'water' then 7 else 0 end)),
   comfort=greatest(0,least(100,comfort+case when p_value='blanket' then 24 else 0 end)),
   fatigue=greatest(0,least(100,fatigue+case when p_value='coffee' then -16 else 0 end)),
   satisfaction=least(100,satisfaction+case p_value
     when 'meal' then 10 when 'coffee' then 6 when 'restroom' then 8
     when 'conversation' then 8 else 5 end),
   updated_at=now() where id=pax.id;
  ev_kind:='service';
  payload:=jsonb_build_object('service',p_value,'seat',p_seat_index,
   'phase',m.phase,'cabin_simulation',true);
 elsif p_action='debrief' then
  if m.lifecycle<>'running' or m.phase<>'arrived' then
   raise exception 'Debrief only after manual SIM arrival'
    using errcode='22023';
  end if;
  select round(avg(satisfaction)::numeric,1) into avg_score
   from sim.virtual_sim_passengers where request_id=p_request_id;
  update sim.virtual_sim_missions set lifecycle='completed',phase='debrief',
   last_tick_at=now(),updated_at=now() where request_id=p_request_id;
  ev_kind:='debrief';
  payload:=jsonb_build_object('pax_satisfaction_avg',avg_score,
   'minutes_simulated',m.elapsed_minutes,'real_flight_completed',false,
   'financial_postings',0,'aircraft_moved',false);
 else
  raise exception 'Unsupported SIM mission action' using errcode='22023';
 end if;
 insert into sim.virtual_sim_mission_events(request_id,passenger_id,event_kind,actor_id,payload)
 values(p_request_id,case when p_action='service' then pax.id else null end,
  ev_kind,uid,payload);
 return jsonb_build_object('action',p_action,'phase',coalesce(next_phase,m.phase),
  'simulation_only',true,'telemetry_connected',false,'real_flights_modified',0,
  'crew_assignments',0,'financial_postings',0);
end $fn$;
revoke all on function public.aervelys_sim_mission_action(uuid,text,text,integer)
 from public,anon,authenticated;
grant execute on function public.aervelys_sim_mission_action(uuid,text,text,integer) to authenticated;

create function public.aervelys_sim_missions_overview()
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
 'simulation_only',true,'simconnect_connected',false,'real_flight_approvals',false,
 'route_source','pilot_simbrief_paste'
 );
end $fn$;
revoke all on function public.aervelys_sim_missions_overview() from public,anon,authenticated;
grant execute on function public.aervelys_sim_missions_overview() to authenticated;

-- Reuse existing 10-minute postgres scheduler; no second cron.
create or replace function sim.virtual_department_full_cycle()
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare execution jsonb;dialogue jsonb;decisions jsonb;refreshed jsonb;
 alternatives jsonb;evidence jsonb;cabin jsonb;
begin
 if session_user<>'postgres' then
  raise exception 'Internal SIM scheduler only' using errcode='42501';
 end if;
 execution:=sim.virtual_department_execute_tick(8);
 dialogue:=sim.virtual_department_dialogue_tick(40);
 decisions:=sim.virtual_department_decision_tick(20);
 refreshed:=sim.virtual_department_dialogue_tick(40);
 alternatives:=sim.virtual_department_resolution_tick(30);
 evidence:=sim.virtual_evidence_sync(200);
 cabin:=sim.virtual_cabin_tick(20);
 return jsonb_build_object('execution',execution,'dialogue',dialogue,'decisions',decisions,
  'dialogue_refresh',refreshed,'alternatives',alternatives,'evidence',evidence,
  'cabin',cabin,'simulation_only',true);
end $fn$;
