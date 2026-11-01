-- AERVELYS NEXT end-to-end DB smoke: fake pairing / ingest / replay / revoke / no real writes.
-- All test rows are rolled back inside a savepoint-like PL/pgSQL subtransaction.
do $test$
declare
 ceo_id uuid; req uuid; pairing jsonb; token text;
 response jsonb; sessions_before integer; missions_before integer; flights_before integer;
begin
 select user_id into ceo_id from sim.app_user_roles where active and role='ceo' limit 1;
 select r.id into req from sim.charter_requests r
  join sim.sim_customer_cases c on c.request_id=r.id
  where r.request_code like 'AV-SIM-%' and r.status not in('cancelled','declined','completed')
   and c.lifecycle not in('withdrawn','declined')
   and not exists(select 1 from sim.virtual_sim_missions m where m.request_id=r.id)
  order by r.requested_departure desc limit 1;
 if ceo_id is null or req is null then raise exception 'Missing smoke test prerequisites';end if;
 select count(*) into sessions_before from sim.virtual_sim_bridge_sessions;
 select count(*) into missions_before from sim.virtual_sim_missions;
 select count(*) into flights_before from sim.flights;
 begin
  perform set_config('request.jwt.claim.sub',ceo_id::text,true);
  response:=public.aervelys_sim_mission_create(req,'DCT ONLY SIMBRIEF TEST');
  if response->>'created'<>'true' then raise exception 'Unable to create SIM mission';end if;
  perform public.aervelys_sim_mission_action(req,'start',null,null);
  pairing:=public.aervelys_sim_bridge_pair(req,10);
  token:=pairing->>'pairing_token';
  if length(token)<>96 or pairing->>'simulation_only'<>'true' then
   raise exception 'Weak pairing response';end if;
  perform set_config('request.jwt.claim.sub','',true);
  response:=public.aervelys_sim_bridge_ingest(token,1,null,
   '{"on_ground":true,"groundspeed_kt":1,"agl_ft":0,"vertical_speed_fpm":0,"indicated_airspeed_kt":0,"injected_key":"DO NOT STORE"}'::jsonb);
  if response->>'accepted'<>'true' or response->>'telemetry_trusted_for_ops'<>'false'
   then raise exception 'First untrusted heartbeat rejected';end if;
  if not exists(select 1 from sim.virtual_sim_bridge_sessions b
    where b.request_id=req and b.status='active'
      and (b.last_sample->>'groundspeed_kt')::numeric=1
      and (b.last_sample->>'agl_ft')::numeric=0
      and not (b.last_sample ? 'injected_key')) then
    raise exception 'Sanitized instruments missing or unrecognized values leaked';
  end if;
  update sim.virtual_sim_bridge_sessions set last_seen_at=now()-interval '2 seconds'
   where request_id=req and status='active';
  response:=public.aervelys_sim_bridge_ingest(token,2,'taxi_out',
   '{"on_ground":true,"groundspeed_kt":15,"agl_ft":0,"vertical_speed_fpm":0,"indicated_airspeed_kt":13}'::jsonb);
  if response->>'phase'<>'taxi_out' or response->>'real_flight_changes'<>'0'
  then raise exception 'Taxi phase failed';end if;
  update sim.virtual_sim_bridge_sessions set last_seen_at=now()-interval '2 seconds'
   where request_id=req and status='active';
  begin
   perform public.aervelys_sim_bridge_ingest(token,2,'takeoff',
    '{"on_ground":false,"groundspeed_kt":150,"agl_ft":80,"vertical_speed_fpm":900,"indicated_airspeed_kt":135}'::jsonb);
   raise exception 'REPLAY_WAS_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.aervelys_sim_bridge_ingest(token,3,'landing',
    '{"on_ground":true,"groundspeed_kt":70,"agl_ft":0,"vertical_speed_fpm":0,"indicated_airspeed_kt":60}'::jsonb);
   raise exception 'INVALID_PHASE_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.aervelys_sim_bridge_ingest(repeat('a',96),4,'takeoff',
    '{"on_ground":false,"groundspeed_kt":150,"agl_ft":80,"vertical_speed_fpm":900,"indicated_airspeed_kt":135}'::jsonb);
   raise exception 'INVALID_TOKEN_ACCEPTED';
  exception when insufficient_privilege then null;end;
  response:=public.aervelys_sim_bridge_ingest(token,3,'takeoff',
   '{"on_ground":false,"groundspeed_kt":150,"agl_ft":80,"vertical_speed_fpm":900,"indicated_airspeed_kt":135}'::jsonb);
  if response->>'phase'<>'takeoff' then raise exception 'Takeoff phase failed';end if;
  if not exists(select 1 from sim.virtual_sim_missions
   where request_id=req and phase='takeoff' and source_mode='local_simconnect_unverified') then
   raise exception 'Bridge provenance missing';end if;
  perform set_config('request.jwt.claim.sub',ceo_id::text,true);
  begin
   perform public.aervelys_sim_mission_action(req,'phase','climb',null);
   raise exception 'MANUAL_PHASE_DURING_BRIDGE_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  perform public.aervelys_sim_bridge_revoke(req);
  perform public.aervelys_sim_mission_action(req,'phase','climb',null);
  if not exists(select 1 from sim.virtual_sim_missions
    where request_id=req and phase='climb' and source_mode='manual_simulation') then
    raise exception 'Manual fallback after revoked bridge did not work';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_sim_bridge_ingest(token,4,null,'{}'::jsonb);
   raise exception 'REVOKED_TOKEN_ACCEPTED';
  exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_ALL_FAKE_BRIDGE_TEST' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.virtual_sim_bridge_sessions)<>sessions_before or
    (select count(*) from sim.virtual_sim_missions)<>missions_before or
    (select count(*) from sim.flights)<>flights_before then
   raise exception 'Fake test data escaped transactional rollback';
 end if;
end $test$;
