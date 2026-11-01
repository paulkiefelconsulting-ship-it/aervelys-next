-- ALL fabricated data is rolled back via an intentional caught PT098 exception.
do $test$
declare
 uid uuid; rid uuid; device uuid; sid uuid:=gen_random_uuid();sid2 uuid:=gen_random_uuid();
 link jsonb; same jsonb; state jsonb; link_id uuid;
 nlink integer; ndev integer; nsample integer; nmission integer; nevent integer;
 nflight integer;
begin
 select user_id into uid from sim.app_user_roles where active and role='ceo' limit 1;
 select r.id into rid from sim.charter_requests r
 join sim.sim_customer_cases c on c.request_id=r.id
 where r.request_code like 'AV-SIM-%'
 and r.status not in ('declined','cancelled','completed')
 and c.lifecycle not in ('withdrawn','declined')
 and not exists(select 1 from sim.virtual_sim_missions m where m.request_id=r.id)
 order by r.requested_departure desc limit 1;
 if uid is null or rid is null then raise exception 'SIM test prerequisites unavailable';end if;
 select count(*) into nlink from sim.virtual_msfs_charter_links;
 select count(*) into nevent from sim.virtual_msfs_charter_link_events;
 select count(*) into ndev from sim.msfs_bridge_devices;
 select count(*) into nsample from sim.msfs_bridge_samples;
 select count(*) into nmission from sim.virtual_sim_missions;
 select count(*) into nflight from sim.flights;
 begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.aervelys_sim_mission_create(rid,'DCT SIMLINK EVIDENCE');
  perform public.aervelys_sim_mission_action(rid,'start',null,null);
  insert into sim.msfs_bridge_devices(owner_id,device_name,token_hash,last_seen_at)
   values(uid,'ROLLBACK-ONLY MSFS SIM DEVICE',
    extensions.digest('ROLLBACK_ONLY_TEST_MSFS_20261101','sha256'),now())
   returning id into device;
  insert into sim.msfs_bridge_samples(id,device_id,observed_at,session_id,phase,sample)
   values((select coalesce(max(id),0)+10000 from sim.msfs_bridge_samples),
    device,now(),sid,'CRUISE',
    '{"phase":"CRUISE","latitude":52.5,"longitude":13.3,"altitude_ft":30000,"groundspeed_kt":420}'::jsonb);
  -- The overview must find this actual server-stored sample, not invented client input.
  state:=public.aervelys_msfs_charter_links_overview();
  if jsonb_array_length(state->'sessions')<>1
   or (state->'sessions'->0->>'fresh')<>'true'
   or jsonb_array_length(state->'missions')<>1 then
   raise exception 'Server evidence not reflected in overview';
  end if;
  -- A UUID not observed by the server must never create a linkage.
  begin
   perform public.aervelys_msfs_charter_link(device,gen_random_uuid(),rid);
   raise exception 'UNOBSERVED_SESSION_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  link:=public.aervelys_msfs_charter_link(device,sid,rid);
  if link->>'linked'<>'true' or link->>'automatic_phase_control'<>'false'
   or link->>'financial_postings'<>'0' or link->>'real_flights_modified'<>'0' then
   raise exception 'Unsafe link contract';
  end if;
  link_id:=(link->>'link_id')::uuid;
  same:=public.aervelys_msfs_charter_link(device,sid,rid);
  if same->>'reused'<>'true' or same->>'link_id'<>link_id::text then
   raise exception 'Idempotent link failed';
  end if;
  insert into sim.msfs_bridge_samples(id,device_id,observed_at,session_id,phase,sample)
   values((select coalesce(max(id),0)+10001 from sim.msfs_bridge_samples),
    device,now(),sid2,'CRUISE',
    '{"phase":"CRUISE","latitude":52.5,"longitude":13.3,"altitude_ft":30001,"groundspeed_kt":421}'::jsonb);
  begin
   perform public.aervelys_msfs_charter_link(device,sid2,rid);
   raise exception 'DUPLICATE_MISSION_BINDING_ACCEPTED';
  exception when unique_violation then null;end;
  state:=public.aervelys_msfs_charter_links_overview();
  if jsonb_array_length(state->'links')<>1
    or state->'links'->0->>'status'<>'receiving'
    or state->'links'->0->>'request_id'<>rid::text then
   raise exception 'Link does not display received server evidence';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_msfs_charter_links_overview();
   raise exception 'ANONYMOUS_READ_ACCEPTED';
  exception when insufficient_privilege then null;end;
  begin
   perform public.aervelys_msfs_charter_unlink(link_id);
   raise exception 'ANONYMOUS_UNLINK_ACCEPTED';
  exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  same:=public.aervelys_msfs_charter_unlink(link_id);
  if same->>'unlinked'<>'true' or same->>'real_flights_modified'<>'0' then
   raise exception 'Unlink safety contract failed';end if;
  state:=public.aervelys_msfs_charter_links_overview();
  if jsonb_array_length(state->'links')<>0 then
   raise exception 'Unlink did not close session';
  end if;
  if (select count(*) from sim.virtual_msfs_charter_link_events)<>nevent+2
   then raise exception 'Missing link/unlink audit';end if;
  raise exception 'ROLLBACK_ALL_FAKE_SIM_DATA' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.virtual_msfs_charter_links)<>nlink
 or (select count(*) from sim.virtual_msfs_charter_link_events)<>nevent
 or (select count(*) from sim.msfs_bridge_devices)<>ndev
 or (select count(*) from sim.msfs_bridge_samples)<>nsample
 or (select count(*) from sim.virtual_sim_missions)<>nmission
 or (select count(*) from sim.flights)<>nflight then
  raise exception 'Rollback-only tests leaked data';
 end if;
end $test$;
