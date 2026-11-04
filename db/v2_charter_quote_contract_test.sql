-- Completely rolled-back AERVELYS v2.2 test: immutable customer quotations,
-- itemised positioning, price protection, and estimate-vs-posted SIM contribution.
do $test$
declare
 uid uuid; cid uuid; rid uuid; some_quote sim.v2_quotes%rowtype;
 expensive sim.v2_quotes%rowtype;
 f sim.v2_ferry_legs%rowtype; ack jsonb; snap jsonb;
 nco int;nst int;nac int;nr int;nq int;nf int;ne int;nl int;
begin
 select user_id into uid from sim.app_user_roles where active and role='ceo' limit 1;
 if uid is null then raise exception 'CEO test prereq missing';end if;
 select count(*) into nco from sim.v2_companies;
 select count(*) into nst from sim.v2_staff;
 select count(*) into nac from sim.v2_aircraft;
 select count(*) into nr from sim.v2_requests;
 select count(*) into nq from sim.v2_quotes;
 select count(*) into nf from sim.v2_ferry_legs;
 select count(*) into ne from sim.v2_events;
 select count(*) into nl from sim.v2_ledger;
 begin
  perform set_config('request.jwt.claim.sub',uid::text,true);
  ack:=public.aervelys_v2_initialize();
  if ack->>'created'<>'true' then raise exception 'Test profile not fresh';end if;
  cid:=(ack->>'company_id')::uuid;
  for i in 1..4 loop perform public.aervelys_v2_generate_inquiry();end loop;
  perform public.aervelys_v2_run_office();
  if (select count(*) from sim.v2_quotes where company_id=cid)<>4 then
   raise exception 'All four clients must have separate quotation snapshots';end if;
  if (select count(*) from sim.v2_quotes where company_id=cid and
    total_sell_eur<>charter_sell_eur+handling_sell_eur+positioning_sell_eur)<>0 then
   raise exception 'A quote total does not match its customer-facing lines';end if;
  if (select count(*) from sim.v2_quotes where company_id=cid and status='declined')<>1 then
   raise exception 'One customer budget decision must decline a quotation';end if;
  if (select count(*) from sim.v2_quotes where company_id=cid and status='accepted')<>3 then
   raise exception 'Three customer quotes should be accepted';end if;
  select * into some_quote from sim.v2_quotes
   where company_id=cid and status='accepted' limit 1;
  if (select quoted_eur from sim.v2_requests where id=some_quote.request_id)<>some_quote.total_sell_eur
  then raise exception 'Customer price differs from accepted immutable quotation';end if;
  begin
   update sim.v2_quotes set positioning_sell_eur=positioning_sell_eur+50
    where id=some_quote.id;
   raise exception 'ACCEPTED_QUOTE_PRICE_MUTATION_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  begin
   update sim.v2_quotes set status='declined' where id=some_quote.id;
   raise exception 'ACCEPTED_QUOTE_DECISION_MUTATION_ACCEPTED';
  exception when invalid_parameter_value then null;end;
  for rid in select id from sim.v2_requests where company_id=cid and status='ready' loop
   perform public.aervelys_v2_flight_action(rid,'start');
   perform public.aervelys_v2_flight_action(rid,'complete');
  end loop;
  if exists(select 1 from sim.v2_aircraft where company_id=cid and current_icao='EDAZ') then
   raise exception 'Expected aircraft away after two completed charters';end if;
  insert into sim.v2_requests(company_id,request_code,customer_name,customer_reason,
   origin_icao,destination_icao,departure_at,passengers,estimated_hours,budget_eur)
   values(cid,'AV2-ROLLBACK-QUOTED-FERRY','Quote Lock Test','Needs reposition',
    'EDAZ','LFMN',now()+interval '3 days',2,2.2,35000) returning id into rid;
  perform public.aervelys_v2_run_office();
  select * into expensive from sim.v2_quotes where request_id=rid;
  if not found or expensive.status<>'accepted' or
    expensive.positioning_from is null or expensive.positioning_to<>'EDAZ' or
    expensive.positioning_hours<=0 or
    expensive.positioning_sell_eur<=0 or expensive.positioning_cost_eur<=0 or
    expensive.postflight_policy<>'remain_at_destination' then
    raise exception 'Ferry missing from full customer price before decision';end if;
  if expensive.total_sell_eur<>(expensive.charter_sell_eur+
   expensive.handling_sell_eur+expensive.positioning_sell_eur) then
   raise exception 'Quote changed total after acceptance';end if;
  select * into f from sim.v2_ferry_legs where request_id=rid;
  if not found or f.status<>'planned' then
   raise exception 'Ferry only appears after approved customer quote';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid)<>0 then
   raise exception 'No cost or revenue may be posted merely for issuing the quote';end if;
  perform public.aervelys_v2_ferry_action(f.id,'start');
  perform public.aervelys_v2_ferry_action(f.id,'complete');
  if (select count(*) from sim.v2_ledger where request_id=rid and kind='revenue')<>0 then
   raise exception 'Ferry must never be passenger charter revenue';end if;
  perform public.aervelys_v2_run_office();
  if (select status from sim.v2_requests where id=rid)<>'ready' then
   raise exception 'Post-ferry charter did not reach ready';end if;
  perform public.aervelys_v2_flight_action(rid,'start');
  perform public.aervelys_v2_flight_action(rid,'complete');
  snap:=public.aervelys_v2_overview();
  if jsonb_array_length(snap->'quotes')<>5 then
   raise exception 'Quote snapshots missing from protected API';end if;
  if (select quoted_eur from sim.v2_requests where id=rid)<>expensive.total_sell_eur then
   raise exception 'Customer price unexpectedly increased after ferry';end if;
  if (select count(*) from sim.v2_ledger where request_id=rid)<>3 then
   raise exception 'Expected one ferry cost, charter cost, charter revenue';end if;
  if not exists(select 1 from jsonb_array_elements(snap->'finance_reviews') rev
   where rev->>'request_id'=rid::text and
    (rev->>'posted_sim_cost_eur')::numeric=
       (select sum(amount_eur) from sim.v2_ledger where request_id=rid and kind='cost')
    and (rev->>'posted_revenue_eur')::numeric=expensive.total_sell_eur
    and (rev->>'planned_margin_eur')::numeric=
      expensive.total_sell_eur-expensive.estimated_total_cost_eur
    and (rev->>'posted_sim_contribution_eur')::numeric=
      expensive.total_sell_eur-
       (select sum(amount_eur) from sim.v2_ledger where request_id=rid and kind='cost')
    )then
     raise exception 'SIM-actual versus quote financial review is inconsistent';end if;
  if (select current_icao from sim.v2_aircraft where id=f.aircraft_id)<>'LFMN' then
   raise exception 'Jet not at passenger destination following accepted charter';end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform public.aervelys_v2_overview();
   raise exception 'ANON_QUOTE_DATA_VISIBLE';
  exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_ALL_V2_QUOTE_TESTS' using errcode='PT098';
 exception when sqlstate 'PT098' then null;end;
 if (select count(*) from sim.v2_companies)<>nco or
    (select count(*) from sim.v2_staff)<>nst or
    (select count(*) from sim.v2_aircraft)<>nac or
    (select count(*) from sim.v2_requests)<>nr or
    (select count(*) from sim.v2_quotes)<>nq or
    (select count(*) from sim.v2_ferry_legs)<>nf or
    (select count(*) from sim.v2_events)<>ne or
    (select count(*) from sim.v2_ledger)<>nl then
     raise exception 'Rollback-only quote scenario persisted fake entries';end if;
end $test$;
