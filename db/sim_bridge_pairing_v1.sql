-- AERVELYS NEXT — mission-scoped bearer pairing for local MSFS 2024 (SIM ONLY)
-- No service key, booking, financial, crew or aircraft-position write permissions.
-- The bridge source is heuristic/unverified and must never count as operational release.
alter table sim.virtual_sim_missions
 drop constraint virtual_sim_missions_source_mode_check;
alter table sim.virtual_sim_missions
 add constraint virtual_sim_missions_source_mode_check
 check (source_mode in ('manual_simulation','local_simconnect_unverified'));

create table sim.virtual_sim_bridge_sessions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references sim.virtual_sim_missions(request_id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64),
 status text not null default 'active' check(status in ('active','revoked')),
 issued_by uuid not null,
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 last_seen_at timestamptz,
 last_seq bigint not null default 0 check(last_seq>=0),
 accepted_events integer not null default 0 check(accepted_events between 0 and 250000),
 last_phase text,
 updated_at timestamptz not null default now(),
 check(expires_at>issued_at)
);
create unique index virtual_sim_bridge_one_active_per_mission
 on sim.virtual_sim_bridge_sessions(request_id) where status='active';
create index virtual_sim_bridge_current_idx
 on sim.virtual_sim_bridge_sessions(expires_at,last_seen_at desc) where status='active';

alter table sim.virtual_sim_bridge_sessions enable row level security;
revoke all on sim.virtual_sim_bridge_sessions from public,anon,authenticated;

create function public.aervelys_sim_bridge_pair(p_request_id uuid,p_minutes integer default 90)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 secret text;
 new_id uuid;
 until_time timestamptz;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u
  where u.user_id=uid and u.active and u.role='ceo') then
  raise exception 'CEO authorization required for device pairing' using errcode='42501';
 end if;
 if p_request_id is null or p_minutes is null or p_minutes not between 10 and 180 then
  raise exception 'Pairing duration must be 10..180 minutes' using errcode='22023';
 end if;
 if not exists(select 1 from sim.virtual_sim_missions m
   join sim.sim_customer_cases c on c.request_id=m.request_id
   join sim.charter_requests r on r.id=m.request_id
   where m.request_id=p_request_id and r.request_code like 'AV-SIM-%'
     and m.lifecycle='running' and m.phase not in('arrived','debrief')) then
  raise exception 'Pairing only allowed for a running SIM-only mission' using errcode='22023';
 end if;
 update sim.virtual_sim_bridge_sessions set status='revoked',updated_at=now()
  where request_id=p_request_id and status='active';
 secret:=replace(gen_random_uuid()::text,'-','')||
         replace(gen_random_uuid()::text,'-','')||
         replace(gen_random_uuid()::text,'-','');
 until_time:=now()+make_interval(mins=>p_minutes);
 insert into sim.virtual_sim_bridge_sessions(request_id,token_hash,issued_by,expires_at)
 values(p_request_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),uid,until_time)
 returning id into new_id;
 return jsonb_build_object('session_id',new_id,'pairing_token',secret,
  'request_id',p_request_id,'expires_at',until_time,
  'simulation_only',true,'telemetry_trusted_for_ops',false,
  'real_flight_changes',0,'one_time_secret',true);
end $fn$;
revoke all on function public.aervelys_sim_bridge_pair(uuid,integer) from public,anon,authenticated;
grant execute on function public.aervelys_sim_bridge_pair(uuid,integer) to authenticated;

create function public.aervelys_sim_bridge_revoke(p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid(); affected integer;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u
   where u.user_id=uid and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM bridge revoke denied' using errcode='42501';
 end if;
 update sim.virtual_sim_bridge_sessions set status='revoked',updated_at=now()
  where request_id=p_request_id and status='active';
 get diagnostics affected=row_count;
 return jsonb_build_object('revoked',affected,'simulation_only',true,
  'real_flight_changes',0);
end $fn$;
revoke all on function public.aervelys_sim_bridge_revoke(uuid) from public,anon,authenticated;
grant execute on function public.aervelys_sim_bridge_revoke(uuid) to authenticated;

-- Anon endpoint is intentionally bearer-authenticated with 366-bit token entropy.
-- No password/service_role/JWT secret is sent to the Windows bridge.
-- Every request validates mission isolation, expiry, sequence, sample and stage.
create function public.aervelys_sim_bridge_ingest(
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
   or jsonb_typeof(p_sample->'indicated_airspeed_kt')<>'number' then
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
  last_phase=coalesce(new_phase,last_phase),updated_at=now()
 where id=conn.id;
 return jsonb_build_object('accepted',true,'phase_changed',new_phase is not null,
  'phase',coalesce(new_phase,mission.phase),'simulation_only',true,
  'telemetry_trusted_for_ops',false,'real_flight_changes',0,
  'crew_assignments',0,'financial_postings',0);
end $fn$;
revoke all on function public.aervelys_sim_bridge_ingest(text,bigint,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.aervelys_sim_bridge_ingest(text,bigint,text,jsonb)
 to anon,authenticated;
