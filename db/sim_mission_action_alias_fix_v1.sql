-- Disambiguate row variable from table alias in mission control, no data changes.
create or replace function public.aervelys_sim_mission_action(
 p_request_id uuid,p_action text,p_value text default null,p_seat_index integer default null)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 mission_rec sim.virtual_sim_missions%rowtype;
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
 select mission_row.* into mission_rec
  from sim.virtual_sim_missions mission_row
  join sim.charter_requests charter on charter.id=mission_row.request_id
  where mission_row.request_id=p_request_id and charter.request_code like 'AV-SIM-%'
  for update of mission_row;
 if not found then raise exception 'SIM mission not found' using errcode='22023';end if;
 if p_action='route' then
  next_phase:=upper(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));
  if mission_rec.lifecycle<>'draft' or length(next_phase) not between 3 and 1500 then
   raise exception 'Route can only be changed in SIM planning with valid route text'
     using errcode='22023';
  end if;
  update sim.virtual_sim_missions set route_text=next_phase,updated_at=now()
   where request_id=p_request_id;
  ev_kind:='route_updated';
  payload:=jsonb_build_object('route',next_phase,'source','user_simbrief_paste');
 elsif p_action='start' then
  if mission_rec.lifecycle<>'draft' then raise exception 'SIM mission already started' using errcode='22023';end if;
  update sim.virtual_sim_missions set phase='boarding',lifecycle='running',
   last_tick_at=now(),updated_at=now() where request_id=p_request_id;
  ev_kind:='started';
  payload:=jsonb_build_object('phase','boarding','telemetry',false);
 elsif p_action='phase' then
  next_phase:=lower(btrim(coalesce(p_value,'')));
  if mission_rec.lifecycle<>'running'
    or array_position(phases,next_phase) is distinct from array_position(phases,mission_rec.phase)+1
    or next_phase='debrief' then
   raise exception 'Only the next manual SIM flight phase is allowed'
    using errcode='22023';
  end if;
  update sim.virtual_sim_missions set phase=next_phase,updated_at=now()
   where request_id=p_request_id;
  ev_kind:='phase_changed';
  payload:=jsonb_build_object('previous',mission_rec.phase,'next',next_phase,
   'source','manual_simulation','simconnect_telemetry',false);
 elsif p_action='pause' then
  if mission_rec.lifecycle<>'running' then raise exception 'Mission is not running' using errcode='22023';end if;
  update sim.virtual_sim_missions set lifecycle='paused',last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='paused';payload:=jsonb_build_object('mode','manual_simulation');
 elsif p_action='resume' then
  if mission_rec.lifecycle<>'paused' then raise exception 'Mission is not paused' using errcode='22023';end if;
  update sim.virtual_sim_missions set lifecycle='running',last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='resumed';payload:=jsonb_build_object('mode','manual_simulation');
 elsif p_action='clock' then
  if mission_rec.lifecycle<>'running' or p_value is null
   or btrim(p_value)!~'^[0-9]{1,2}$' then
   raise exception 'Only running SIM flights support a 1..60 minute manual step' using errcode='22023';
  end if;
  mins:=btrim(p_value)::integer;
  if mins not between 1 and 60 or mission_rec.elapsed_minutes+mins>1440 then
   raise exception 'SIM minute step or total duration out of range' using errcode='22023';
  end if;
  perform sim.virtual_cabin_step_internal(p_request_id,mins);
  update sim.virtual_sim_missions set last_tick_at=now(),updated_at=now()
   where request_id=p_request_id;
  ev_kind:='cabin_clock';
  payload:=jsonb_build_object('minutes',mins,'source','manual_simulation',
    'telemetry',false);
 elsif p_action='service' then
  if mission_rec.lifecycle<>'running' or mission_rec.phase not in('boarding','cruise')
   or p_seat_index is null or p_value not in('water','coffee','meal','snack','restroom','blanket','conversation')
   or (mission_rec.phase<>'cruise' and p_value in('coffee','meal')) then
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
   'phase',mission_rec.phase,'cabin_simulation',true);
 elsif p_action='debrief' then
  if mission_rec.lifecycle<>'running' or mission_rec.phase<>'arrived' then
   raise exception 'Debrief only after manual SIM arrival'
    using errcode='22023';
  end if;
  select round(avg(satisfaction)::numeric,1) into avg_score
   from sim.virtual_sim_passengers where request_id=p_request_id;
  update sim.virtual_sim_missions set lifecycle='completed',phase='debrief',
   last_tick_at=now(),updated_at=now() where request_id=p_request_id;
  ev_kind:='debrief';
  payload:=jsonb_build_object('pax_satisfaction_avg',avg_score,
   'minutes_simulated',mission_rec.elapsed_minutes,'real_flight_completed',false,
   'financial_postings',0,'aircraft_moved',false);
 else
  raise exception 'Unsupported SIM mission action' using errcode='22023';
 end if;
 insert into sim.virtual_sim_mission_events(request_id,passenger_id,event_kind,actor_id,payload)
 values(p_request_id,case when p_action='service' then pax.id else null end,
  ev_kind,uid,payload);
 return jsonb_build_object('action',p_action,'phase',coalesce(next_phase,mission_rec.phase),
  'simulation_only',true,'telemetry_connected',false,'real_flights_modified',0,
  'crew_assignments',0,'financial_postings',0);
end $fn$;
