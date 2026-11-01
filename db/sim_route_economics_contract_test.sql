-- Read-only contract test: no fabricated full quotes, no real flight/ledger writes.
do $test$
declare
 owner_id uuid; snapshot jsonb; total_rows integer; valid_costs integer; missing_costs integer;
 aircraft_before integer; flight_before integer;
begin
 select user_id into owner_id from sim.app_user_roles where active and role='ceo' limit 1;
 if owner_id is null then raise exception 'Missing CEO';end if;
 select count(*) into flight_before from sim.flights;
 select count(*) into aircraft_before from sim.aircraft;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 snapshot:=public.aervelys_sim_route_economics_overview();
 if snapshot->>'simulation_only'<>'true'
   or snapshot->>'operational_approval'<>'false'
   or snapshot->>'fees_verified_complete'<>'false'
   or snapshot->>'real_financial_postings'<>'0'
   then raise exception 'SIM-only response contract mismatch';end if;
 total_rows:=jsonb_array_length(snapshot->'projections');
 select count(*) filter(where (r->>'sim_cost_excluding_airport_fees_eur') is not null),
        count(*) filter(where (r->>'sim_cost_excluding_airport_fees_eur') is null)
 into valid_costs,missing_costs
 from jsonb_array_elements(snapshot->'projections')r;
 if total_rows<>70 or valid_costs<10 or missing_costs<5 then
   raise exception 'Unexpected coverage total % valid % missing %',
   total_rows,valid_costs,missing_costs;
 end if;
 if exists(select 1 from jsonb_array_elements(snapshot->'projections')r
   where r->>'is_simulation'<>'true'
   or r->>'quote_authorized'<>'false'
   or r->>'operationally_usable'<>'false'
   or r->>'airport_fee_coverage_complete'<>'false'
   or r->>'finance_postings'<>'0'
   or (r->>'sim_cost_excluding_airport_fees_eur') is not null
     and ((r->>'charter_block_minutes') is null
      or (r->>'positioning_block_minutes') is null)) then
   raise exception 'Simulated cost or security contract broken';
 end if;
 if (select count(*) from sim.flights)<>flight_before or
    (select count(*) from sim.aircraft)<>aircraft_before
    then raise exception 'SIM-only overview changed real fleet/flight data';end if;
end $test$;
