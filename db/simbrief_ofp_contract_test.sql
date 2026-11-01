-- Explicit rollback-only SIM OFP import contract test.
do $test$
declare
 uid uuid;rid uuid; aid uuid; aid2 uuid; origin text; destination text;
 orig_count integer; orig_events integer; orig_distance numeric;
 stored jsonb; projection jsonb; other jsonb; overview jsonb;
begin
 select user_id into uid from sim.app_user_roles where role='ceo' and active limit 1;
 select r.id,r.origin_icao,r.destination_icao
  into rid,origin,destination
  from sim.charter_requests r join sim.sim_customer_cases c on c.request_id=r.id
  where r.request_code like 'AV-SIM-%'
    and r.status not in('cancelled','declined','completed')
    and c.lifecycle not in('withdrawn','declined')
  order by r.requested_departure desc limit 1;
 select a.id into aid from sim.aircraft a order by registration limit 1;
 select a.id into aid2 from sim.aircraft a where a.id<>aid order by registration limit 1;
 if uid is null or rid is null or aid is null or aid2 is null then
  raise exception 'Missing test prerequisites';end if;
 select count(*) into orig_count from sim.virtual_simbrief_ofp_imports;
 select count(*) into orig_events from sim.virtual_simbrief_ofp_events;
 select (sim.virtual_route_cost_projection(rid,aid)->>'charter_distance_nm')::numeric
  into orig_distance;
 begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  begin
   perform public.aervelys_simbrief_ofp_submit(rid,aid,'XXXX',destination,
    'DCT FAKESIM DCT',555,113,'SIMBRIEF TEST SOURCE NEVER PERSISTED',null);
   raise exception 'MISMATCH_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  stored:=public.aervelys_simbrief_ofp_submit(rid,aid,origin,destination,
   'DCT TESTROUTE TESTFIX DCT',555.5,113,'SIMBRIEF TEST SOURCE NEVER PERSISTED',null);
  if stored->>'saved'<>'true' or stored->>'operational_verified'<>'false'
   or stored->>'finance_postings'<>'0' then
   raise exception 'SimBrief submission contract failed';end if;
  projection:=sim.virtual_route_cost_projection(rid,aid);
  other:=sim.virtual_route_cost_projection(rid,aid2);
  if (projection->>'charter_distance_nm')::numeric<>555.5
   or (projection->>'charter_block_minutes')::integer<>113
   or projection->>'timing_source'<>'simbrief_latest_json_v2_user_fetch_unverified'
   or projection->>'simbrief_validation_status'<>'pilot_import_unverified'
   or (other->>'charter_distance_nm')::numeric is not distinct from
        (projection->>'charter_distance_nm')::numeric
   or projection->>'quote_authorized'<>'false' then
    raise exception 'OFP not isolated to candidate or safety contract broken';
  end if;
  overview:=public.aervelys_simbrief_ofp_overview();
  if overview->>'automatic_polling'<>'false'
   or jsonb_array_length(overview->'imports')<>orig_count+1
   then raise exception 'OFP import overview invalid';end if;
  stored:=public.aervelys_simbrief_ofp_submit(rid,aid,origin,destination,
   'DCT SECOND TEST DCT',610.1,124,'SIMBRIEF TEST REPLACEMENT NEVER PERSISTED',null);
  if stored->>'replaced'<>'true' then raise exception 'Upsert audit failed';end if;
  if (select count(*) from sim.virtual_simbrief_ofp_events)<>orig_events+2 then
   raise exception 'OFP audit event missing';
  end if;
  raise exception 'ROLLBACK_SIMBRIEF_FAKE_SUCCESS' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.virtual_simbrief_ofp_imports)<>orig_count or
    (select count(*) from sim.virtual_simbrief_ofp_events)<>orig_events then
  raise exception 'Fake OFP test persisted data';end if;
 if (sim.virtual_route_cost_projection(rid,aid)->>'charter_distance_nm')::numeric
   is distinct from orig_distance then
  raise exception 'Route model changed after rollback';end if;
end $test$;
