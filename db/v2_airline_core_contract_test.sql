-- V2 transaction-only integration test; fake company/requests/events/ledger never persist.
do $test$
declare
 u uuid; cid uuid; rid uuid; response jsonb; snapshot jsonb;
 c_company integer;c_staff integer;c_aircraft integer;c_request integer;c_event integer;c_ledger integer;
 n_ready integer;n_declined integer;n_accepted integer;
begin
 select user_id into u from sim.app_user_roles where active and role='ceo' limit 1;
 if u is null then raise exception 'Missing CEO prerequisite';end if;
 select count(*) into c_company from sim.v2_companies;
 select count(*) into c_staff from sim.v2_staff;
 select count(*) into c_aircraft from sim.v2_aircraft;
 select count(*) into c_request from sim.v2_requests;
 select count(*) into c_event from sim.v2_events;
 select count(*) into c_ledger from sim.v2_ledger;
 begin
  perform set_config('request.jwt.claim.sub',u::text,true);
  response:=public.aervelys_v2_initialize();
  if response->>'created'<>'true' then raise exception 'V2 initial company missing';end if;
  cid:=(response->>'company_id')::uuid;
  response:=public.aervelys_v2_initialize();
  if response->>'created'<>'false' then raise exception 'V2 init not idempotent';end if;
  for i in 1..4 loop perform public.aervelys_v2_generate_inquiry();end loop;
  snapshot:=public.aervelys_v2_overview();
  if jsonb_array_length(snapshot->'requests')<>4 or
    jsonb_array_length(snapshot->'staff')<>6 or
    jsonb_array_length(snapshot->'aircraft')<>2 or
    snapshot->'simulation_only'<>'true' then
    raise exception 'V2 company snapshot wrong';end if;
  response:=public.aervelys_v2_run_office();
  if (response->>'processed_steps')::int<10 then
    raise exception 'Virtual employees did not process expected steps';end if;
  select count(*) into n_ready from sim.v2_requests where company_id=cid and status='ready';
  select count(*) into n_declined from sim.v2_requests where company_id=cid and status='declined';
  select count(*) into n_accepted from sim.v2_requests where company_id=cid and status='accepted';
  if n_ready<>2 or n_declined<>1 or n_accepted<>1 then
   raise exception 'Unexpected office scenarios: ready %, declined %, waiting %',n_ready,n_declined,n_accepted;end if;
  select id into rid from sim.v2_requests where company_id=cid and status='ready' order by created_at,id limit 1;
  perform public.aervelys_v2_choose_pilot(rid,'ceo');
  response:=public.aervelys_v2_flight_action(rid,'start');
  if response->>'status'<>'in_flight' or response->>'cloud_telemetry_verified'<>'false' then
   raise exception 'SIM flight start contract failed';end if;
  response:=public.aervelys_v2_flight_action(rid,'complete');
  if response->>'status'<>'completed' or response->>'financial_bank_transactions'<>'0' then
   raise exception 'SIM settlement contract failed';end if;
  if (select count(*) from sim.v2_ledger where company_id=cid and request_id=rid)<>2 then
   raise exception 'Revenue and cost not both recorded';end if;
  begin
   perform public.aervelys_v2_flight_action(rid,'complete');
   raise exception 'DUPLICATE_SETTLEMENT_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  snapshot:=public.aervelys_v2_overview();
  if (snapshot->'company'->>'cash_eur')::numeric<=180000
   or (select count(*) from sim.v2_ledger where company_id=cid)<>2 then
   raise exception 'Company cash failed or duplicate ledger';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.aervelys_v2_overview();
    raise exception 'ANONYMOUS_V2_OVERVIEW_ACCEPTED';
  exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_V2_FAKE_AIRLINE' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.v2_companies)<>c_company or
    (select count(*) from sim.v2_staff)<>c_staff or
    (select count(*) from sim.v2_aircraft)<>c_aircraft or
    (select count(*) from sim.v2_requests)<>c_request or
    (select count(*) from sim.v2_events)<>c_event or
    (select count(*) from sim.v2_ledger)<>c_ledger then
    raise exception 'Rollback leaked synthetic V2 records';end if;
end $test$;
