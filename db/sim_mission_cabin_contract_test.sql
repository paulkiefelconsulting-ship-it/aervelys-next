-- Complete fake SIM mission run, intentionally rolled back.
-- It must not create any real flight, booking, settlement or crew assignment.
do $test$
declare
 owner_id uuid; req uuid; created jsonb; action_result jsonb;
 before_count integer; after_count integer;
 e_count integer;
 event_count integer;
 average_score numeric;
begin
 select user_id into owner_id from sim.app_user_roles
  where role='ceo' and active order by created_at limit 1;
 select r.id into req from sim.charter_requests r
  join sim.sim_customer_cases c on c.request_id=r.id
  where r.request_code like 'AV-SIM-%' and r.status not in('cancelled','declined','completed')
   and not exists(select 1 from sim.virtual_sim_missions m where m.request_id=r.id)
  order by r.requested_departure desc limit 1;
 if owner_id is null or req is null then raise exception 'Test preconditions not available';end if;
 select count(*) into before_count from sim.virtual_sim_missions;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  created:=public.aervelys_sim_mission_create(req,'DCT SIMBRIEF ROUTE TEST');
  if created->>'created'<>'true' or created->>'flight_releases'<>'0' then
   raise exception 'Mission creation contract failed';
  end if;
  select count(*) into after_count from sim.virtual_sim_passengers where request_id=req;
  if after_count<>(select passengers from sim.charter_requests where id=req) then
   raise exception 'Passenger initialization count differs from charter pax';
  end if;
  perform public.aervelys_sim_mission_action(req,'start',null,null);
  perform public.aervelys_sim_mission_action(req,'service','water',1);
  perform public.aervelys_sim_mission_action(req,'clock','15',null);
  perform public.aervelys_sim_mission_action(req,'phase','taxi_out',null);
  perform public.aervelys_sim_mission_action(req,'phase','takeoff',null);
  perform public.aervelys_sim_mission_action(req,'phase','climb',null);
  perform public.aervelys_sim_mission_action(req,'phase','cruise',null);
  perform public.aervelys_sim_mission_action(req,'service','meal',1);
  perform public.aervelys_sim_mission_action(req,'service','restroom',1);
  perform public.aervelys_sim_mission_action(req,'clock','35',null);
  perform public.aervelys_sim_mission_action(req,'phase','descent',null);
  perform public.aervelys_sim_mission_action(req,'phase','approach',null);
  perform public.aervelys_sim_mission_action(req,'phase','landing',null);
  perform public.aervelys_sim_mission_action(req,'phase','taxi_in',null);
  perform public.aervelys_sim_mission_action(req,'phase','arrived',null);
  action_result:=public.aervelys_sim_mission_action(req,'debrief',null,null);
  if action_result->>'real_flights_modified'<>'0' then
   raise exception 'Real flight changes not zero';
  end if;
  if not exists(select 1 from sim.virtual_sim_missions
   where request_id=req and lifecycle='completed' and phase='debrief'
    and elapsed_minutes=50) then
   raise exception 'SIM mission debrief mismatch';
  end if;
  select count(*) into e_count from sim.virtual_sim_mission_events where request_id=req;
  if e_count<15 then raise exception 'Mission event trail missing';end if;
  select avg(satisfaction) into average_score from sim.virtual_sim_passengers where request_id=req;
  if average_score is null or average_score not between 0 and 100 then
   raise exception 'Cabin satisfaction outside range';
  end if;
  raise exception 'SIM_FAKE_ROLLBACK_SUCCESS' using errcode='PT098';
 exception when sqlstate 'PT098' then
  null; -- Entire subtransaction rolls back; nothing fabricated persists.
 end;
 if (select count(*) from sim.virtual_sim_missions)<>before_count then
  raise exception 'Mission test data escaped rollback';end if;
end $test$;
