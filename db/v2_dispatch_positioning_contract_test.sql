-- Transaction-only V2.1 ferry scenario. Every synthetic entry is rolled back.
do $test$
declare
 uid uuid;cid uuid;rid uuid;f sim.v2_ferry_legs%rowtype;
 res jsonb;snapshot jsonb;ac uuid;
 c_company int;c_staff int;c_aircraft int;c_requests int;c_events int;c_ledger int;c_ferry int;
begin
 select user_id into uid from sim.app_user_roles where active and role='ceo' limit 1;
 if uid is null then raise exception 'CEO test prerequisite missing';end if;
 select count(*) into c_company from sim.v2_companies;
 select count(*) into c_staff from sim.v2_staff;
 select count(*) into c_aircraft from sim.v2_aircraft;
 select count(*) into c_requests from sim.v2_requests;
 select count(*) into c_events from sim.v2_events;
 select count(*) into c_ledger from sim.v2_ledger;
 select count(*) into c_ferry from sim.v2_ferry_legs;
 begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  res:=public.aervelys_v2_initialize();
  if res->>'created'<>'true' then raise exception 'Unexpected preexisting V2 test company';end if;
  cid:=(res->>'company_id')::uuid;
  -- Existing standard scenario must remain compatible.
  for i in 1..4 loop perform public.aervelys_v2_generate_inquiry();end loop;
  perform public.aervelys_v2_run_office();
  if (select count(*) from sim.v2_requests where company_id=cid and status='ready')<>2 then
   raise exception 'Legacy V2 baseline charter dispatch regressed';end if;
  if (select count(*) from sim.v2_requests where company_id=cid and status='declined')<>1 then
   raise exception 'Customer budget decisions regressed';end if;
  -- Move both available jets away from EDAZ by explicitly completing scheduled charters.
  for rid in select id from sim.v2_requests where company_id=cid and status='ready' loop
   perform public.aervelys_v2_flight_action(rid,'start');
   perform public.aervelys_v2_flight_action(rid,'complete');
  end loop;
  if exists(select 1 from sim.v2_aircraft where company_id=cid and current_icao='EDAZ') then
   raise exception 'Expected all fleet aircraft away from home for ferry test';end if;
  -- High-budget request requires a priced and real (in SIM) empty ferry.
  insert into sim.v2_requests(company_id,request_code,customer_name,customer_reason,
   origin_icao,destination_icao,departure_at,passengers,estimated_hours,budget_eur)
   values(cid,'AV2-ROLLBACK-FERRY','Rollback Test Corp','Charter with positioning',
    'EDAZ','EDDH',now()+interval '2 days',2,1.5,25000) returning id into rid;
  perform public.aervelys_v2_run_office();
  select * into f from sim.v2_ferry_legs where request_id=rid;
  if not found or f.status<>'planned' or f.destination_icao<>'EDAZ' or
     f.estimated_cost_eur<=0 or f.estimated_hours<=0 then
   raise exception 'Required explicit empty positioning leg missing';end if;
  if (select status from sim.v2_requests where id=rid)<>'accepted' then
   raise exception 'Charter allocated before ferry arrival';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid)<>0 then
   raise exception 'Positioning posted costs prematurely';end if;
  if (select count(*) from sim.v2_ferry_legs where company_id=cid and status in('planned','in_flight','arrived'))<>1 then
   raise exception 'Exactly one reserved ferry expected';end if;
  perform public.aervelys_v2_run_office();
  if (select count(*) from sim.v2_ferry_legs where request_id=rid)<>1 then
   raise exception 'Repeated dispatch created duplicate empty legs';end if;
  res:=public.aervelys_v2_choose_ferry_pilot(f.id,'ceo');
  if res->>'pilot_mode'<>'ceo' then raise exception 'CEO ferry choice ignored';end if;
  res:=public.aervelys_v2_ferry_action(f.id,'start');
  if res->>'status'<>'in_flight' then raise exception 'Empty ferry not started';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid)<>0 then
   raise exception 'Ferry cost posted before arrival';end if;
  res:=public.aervelys_v2_ferry_action(f.id,'complete');
  if res->>'status'<>'arrived' then raise exception 'Ferry arrival missing';end if;
  if (select current_icao from sim.v2_aircraft where id=f.aircraft_id)<>'EDAZ' then
   raise exception 'Ferry aircraft not moved to required customer origin';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid and
   kind='cost' and category='positioning')<>1 then
   raise exception 'Positioning expense not posted exactly once';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid and kind='revenue')<>0 then
   raise exception 'Ferry unexpectedly created passenger charter revenue';end if;
  begin
   perform public.aervelys_v2_ferry_action(f.id,'complete');
   raise exception 'DUPLICATE_FERRY_SETTLEMENT_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  perform public.aervelys_v2_run_office();
  if (select status from sim.v2_requests where id=rid)<>'ready' or
     (select status from sim.v2_ferry_legs where id=f.id)<>'linked' or
     (select aircraft_id from sim.v2_requests where id=rid)<>f.aircraft_id then
   raise exception 'Post-ferry dispatch did not honor reserved aircraft';end if;
  perform public.aervelys_v2_choose_pilot(rid,'ceo');
  perform public.aervelys_v2_flight_action(rid,'start');
  perform public.aervelys_v2_flight_action(rid,'complete');
  if (select count(*) from sim.v2_ledger where request_id=rid)<>3 then
   raise exception 'Expected positioning cost + charter cost + customer revenue';end if;
  if (select sum(case when kind='revenue' then amount_eur else 0 end)
    from sim.v2_ledger where request_id=rid)<=0 then
   raise exception 'Charter must post its own revenue only after completion';end if;
  snapshot:=public.aervelys_v2_overview();
  if jsonb_array_length(snapshot->'ferries')<>1 or
     snapshot->'ferries'->0->>'status'<>'linked' or
     snapshot->>'financial_bank_transactions'<>'0' then
    raise exception 'Private API ferry overview contract invalid';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_v2_ferry_action(f.id,'start');
   raise exception 'ANONYMOUS_FERRY_ACTION_ACCEPTED';
  exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_ALL_FERRY_V2_TEST_DATA' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.v2_companies)<>c_company or
    (select count(*) from sim.v2_staff)<>c_staff or
    (select count(*) from sim.v2_aircraft)<>c_aircraft or
    (select count(*) from sim.v2_requests)<>c_requests or
    (select count(*) from sim.v2_events)<>c_events or
    (select count(*) from sim.v2_ledger)<>c_ledger or
    (select count(*) from sim.v2_ferry_legs)<>c_ferry then
   raise exception 'Fake V2 ferry test leaked data';end if;
end $test$;
