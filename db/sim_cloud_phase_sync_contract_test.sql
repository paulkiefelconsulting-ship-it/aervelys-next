-- Transaction-rollback-only Cloud phase autopilot test; NEVER leaves fake devices/flights.
do $test$
declare
 uid uuid; rid uuid; device uuid; session uuid:=gen_random_uuid();
 result jsonb; before_missions integer; before_events integer; before_devices integer;
 before_samples integer; before_links integer; before_flights integer;
begin
 select user_id into uid from sim.app_user_roles where role='ceo' and active limit 1;
 select r.id into rid from sim.charter_requests r
 join sim.sim_customer_cases c on c.request_id=r.id
 where r.request_code like 'AV-SIM-%' and r.status not in('declined','cancelled','completed')
  and c.lifecycle not in('withdrawn','declined')
  and not exists(select 1 from sim.virtual_sim_missions m where m.request_id=r.id)
 order by r.requested_departure desc limit 1;
 if uid is null or rid is null then raise exception 'Missing existing SIM test charter';end if;
 select count(*) into before_missions from sim.virtual_sim_missions;
 select count(*) into before_events from sim.virtual_sim_mission_events;
 select count(*) into before_devices from sim.msfs_bridge_devices;
 select count(*) into before_samples from sim.msfs_bridge_samples;
 select count(*) into before_links from sim.virtual_msfs_charter_links;
 select count(*) into before_flights from sim.flights;
 begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.aervelys_sim_mission_create(rid,'DCT SIM CLOUD PHASE EVIDENCE');
  perform public.aervelys_sim_mission_action(rid,'start',null,null);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'reason'<>'no_owned_cloud_link' or result->>'changed'<>'false'
    then raise exception 'Missing Cloud link did not fail closed';end if;
  insert into sim.msfs_bridge_devices(owner_id,device_name,token_hash,last_seen_at)
   values(uid,'ROLLBACK ONLY AUTO PHASE BRIDGE',
    extensions.digest('ROLLBACK_ONLY_AUTOPHASE_20261102','sha256'),now())
   returning id into device;
  insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
   values(device,now(),session,'TAXI_OUT',
    '{"phase":"TAXI_OUT","latitude":52.3,"longitude":13.1,"altitude_ft":100,"groundspeed_kt":13}'::jsonb);
  perform public.aervelys_msfs_charter_link(device,session,rid);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'reason'<>'waiting_for_two_fresh_matching_samples'
    then raise exception 'Single sample permitted phase step';end if;
  insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
   values(device,now(),session,'TAXI_OUT',
    '{"phase":"TAXI_OUT","latitude":52.3,"longitude":13.1,"altitude_ft":100,"groundspeed_kt":14}'::jsonb);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'changed'<>'true' or result->>'mission_phase'<>'taxi_out'
   or result->>'real_flights_modified'<>'0' then
   raise exception 'Two matched taxi samples did not advance exact next phase';end if;
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'changed'<>'false' or result->>'reason'<>'already_aligned'
   then raise exception 'Repeat phase application was not idempotent';end if;
  insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
   values(device,now(),session,'CRUISE',
    '{"phase":"CRUISE","altitude_ft":31000,"groundspeed_kt":410}'::jsonb),
   (device,now(),session,'CRUISE',
    '{"phase":"CRUISE","altitude_ft":31020,"groundspeed_kt":412}'::jsonb);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'reason'<>'manual_alignment_required' or
     (select phase from sim.virtual_sim_missions where request_id=rid)<>'taxi_out'
  then raise exception 'Unsafe flight phase skip was permitted';end if;
  insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
   values(device,now()-interval '120 seconds',session,'TAKEOFF',
    '{"phase":"TAKEOFF","altitude_ft":400,"groundspeed_kt":135}'::jsonb),
   (device,now()-interval '120 seconds',session,'TAKEOFF',
    '{"phase":"TAKEOFF","altitude_ft":500,"groundspeed_kt":143}'::jsonb);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'reason'<>'waiting_for_two_fresh_matching_samples'
   then raise exception 'Stale observed telemetry accepted';end if;
  insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
   values(device,now(),session,'TAKEOFF',
    '{"phase":"TAKEOFF","altitude_ft":550,"groundspeed_kt":151}'::jsonb),
   (device,now(),session,'TAKEOFF',
    '{"phase":"TAKEOFF","altitude_ft":570,"groundspeed_kt":155}'::jsonb);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'changed'<>'true' or result->>'mission_phase'<>'takeoff'
   then raise exception 'Valid sequential takeoff missing';end if;
  perform public.aervelys_sim_mission_action(rid,'pause',null,null);
  result:=public.aervelys_sim_cloud_phase_sync(rid);
  if result->>'reason'<>'mission_not_running' then
   raise exception 'Paused mission advanced';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_sim_cloud_phase_sync(rid);
   raise exception 'ANON_SYNC_ALLOWED';
  exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  if (select count(*) from sim.virtual_sim_mission_events
      where request_id=rid and event_kind='phase_changed'
       and payload->>'source'='cloud_msfs_opt_in_unverified')<>2 then
   raise exception 'Expected precisely two audited cloud steps';end if;
  raise exception 'ROLLBACK_CLOUD_PHASE_ALL_TEST_DATA' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.virtual_sim_missions)<>before_missions or
    (select count(*) from sim.virtual_sim_mission_events)<>before_events or
    (select count(*) from sim.msfs_bridge_devices)<>before_devices or
    (select count(*) from sim.msfs_bridge_samples)<>before_samples or
    (select count(*) from sim.virtual_msfs_charter_links)<>before_links or
    (select count(*) from sim.flights)<>before_flights then
    raise exception 'Fake SIM test records persisted';end if;
end $test$;
