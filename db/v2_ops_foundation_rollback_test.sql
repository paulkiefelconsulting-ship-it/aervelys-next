-- Real V2 company read-only+rollback test: no user training or property data persisted.
do $test$
declare
 u uuid; cid uuid; person uuid; phenom uuid;req_id uuid; t0 int;d0 int;f0 int; l0 int;
 future_start timestamptz:=date_trunc('day',now()+interval '23 days')+interval '8 hours';
 snapshot jsonb;out jsonb;
begin
 select owner_id,id into u,cid from sim.v2_companies limit 1;
 select id into person from sim.people where active order by full_name limit 1;
 select id into phenom from sim.v2_aircraft where company_id=cid and aircraft_type='Embraer Phenom 300E';
 if u is null or person is null or phenom is null then raise exception 'Missing existing V2 and heritage records';end if;
 select count(*) into t0 from sim.v2_training_records;
 select count(*) into d0 from sim.v2_duty_roster;
 select count(*) into f0 from sim.v2_facility_projects;
 select count(*) into l0 from sim.v2_ledger;
 if (select charter_release_status from sim.v2_aircraft where id=phenom)<>'blocked' then
  raise exception 'Phenom 300E is not blocked';end if;
 if (select count(*) from sim.people)<>31 or (select count(*) from sim.aircraft)<>5 then
  raise exception 'Original heritage data changed';end if;
 begin
  perform set_config('request.jwt.claim.sub',u::text,true);
  snapshot:=public.aervelys_v2_ops_overview();
  if jsonb_array_length(snapshot->'aircraft')<>5 or
     jsonb_array_length(snapshot->'people')<>31 or
     snapshot->>'legacy_dispatch_integrated'<>'false' then
    raise exception 'Legacy roster or aircraft not visible without false dispatch claims';end if;
  if jsonb_array_length(snapshot->'facilities')<2 then
    raise exception 'Existing leased rooms/parking not identified';end if;
  -- Block even direct DB assignments, not just the quote UI/employee rule.
  begin
   insert into sim.v2_requests(company_id,request_code,customer_name,customer_reason,
    origin_icao,destination_icao,departure_at,passengers,estimated_hours,budget_eur,
    status,aircraft_id) values(cid,'AV2-ROLLBACK-PHENOM','Sim Audit Customer',
    'Charter status guard','EDAZ','EDDM',future_start,2,1.4,15000,
    'ready',phenom);
   raise exception 'PHENOM_CHARTER_ALLOWED';
  exception when invalid_parameter_value then null;end;
  out:=public.aervelys_v2_training_add(person,
   'Roll back recurrent refresher','recurrent',future_start,future_start+interval '2 hours',
   null,'Rollback only');
  if out->>'type_rating_automatically_granted'<>'false' then
   raise exception 'Training granted a false rating';end if;
  out:=public.aervelys_v2_duty_add(person,'standby',
   future_start+interval '3 hours',future_start+interval '9 hours','EDAZ',
   'Rollback-only standby');
  if out->>'real_duty_time_verified'<>'false' then
   raise exception 'Standby inappropriately verified as real duty';end if;
  begin
   perform public.aervelys_v2_training_add(person,
    'Overlapping new type training prohibited','type_rating',
    future_start+interval '4 hours',future_start+interval '7 hours',
    null,'should be rejected');
   raise exception 'TRAINING_OVER_EXISTING_STANDBY_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.aervelys_v2_duty_add(person,'duty',
    future_start+interval '4 hours',future_start+interval '7 hours','EDAZ',
    'Overlap not allowed');
   raise exception 'OVERLAPPING_DUTY_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.aervelys_v2_duty_add(person,'duty',
    future_start+interval '1 hour',future_start+interval '4 hours','EDAZ',
    'Overlaps training');
   raise exception 'TRAINING_DUTY_OVERLAP_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  out:=public.aervelys_v2_facility_add('ROLLBACK ONLY Hangar concept',
    'hangar','Airport base',500000,null,'No construction or payment');
  if out->>'construction_started'<>'false' or out->>'bank_transaction_created'<>'false' then
    raise exception 'Facility falsely created construction or payment';end if;
  if (select count(*) from sim.v2_ledger)<>l0 then
    raise exception 'Planning changed financial ledger';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_v2_ops_overview();
   raise exception 'ANONYMOUS_ROSTER_VISIBLE';
  exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_ALL_V2_OPS_TEST_DATA' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.v2_training_records)<>t0
   or (select count(*) from sim.v2_duty_roster)<>d0
   or (select count(*) from sim.v2_facility_projects)<>f0
   or (select count(*) from sim.v2_ledger)<>l0
 then raise exception 'Synthetic Ops records persisted';end if;
end $test$;