-- Transactional contract smoke test: the entire fake evidence workflow is rolled back.
-- Only use on the separate AERVELYS NEXT Supabase project.
do $test$
declare
  ceo_id uuid;
  target_aircraft uuid;
  target_pilot uuid;
  target_type text;
  ref jsonb;
  proposal_id bigint;
  review_result jsonb;
  initial_proposals bigint;
  initial_approved_profiles bigint;
  initial_approved_ratings bigint;
begin
  select user_id into ceo_id from sim.app_user_roles
   where active and role='ceo' order by created_at limit 1;
  select id into target_aircraft from sim.aircraft order by registration limit 1;
  select id into target_pilot from sim.people
   where active and pilot_role='PIC' order by full_name limit 1;
  select aircraft_type into target_type from sim.aircraft order by aircraft_type limit 1;
  if ceo_id is null or target_aircraft is null or target_pilot is null then
    raise exception 'Smoke test prereqs missing';
  end if;
  perform set_config('request.jwt.claim.sub',ceo_id::text,true);
  select count(*) into initial_proposals from sim.virtual_registry_proposals;
  select count(*) into initial_approved_profiles from sim.aircraft_performance_profiles
   where verification_status='verified';
  select count(*) into initial_approved_ratings from sim.pilot_qualifications
   where verified;
  begin
    ref:=public.aervelys_registry_profile_submit(
       target_aircraft,7,1650,2500,
       'ROLLBACK TEST ONLY - NOT EVIDENCE');
    proposal_id:=(ref->>'proposal_id')::bigint;
    if ref->>'status'<>'submitted' or ref->>'facts_verified'<>'false' then
      raise exception 'Profile submitted prematurely verified';
    end if;
    review_result:=public.aervelys_registry_proposal_review(
      proposal_id,true,
      'ROLLBACK TEST fake profile source review, never retain.');
    if review_result->>'source_registered'<>'true'
      or review_result->>'operational_approval'<>'false'
      or not exists(select 1 from sim.aircraft_performance_profiles
       where aircraft_id=target_aircraft and verification_status='verified'
         and passenger_seats=7) then
      raise exception 'Profile review contract failed';
    end if;
    ref:=public.aervelys_registry_type_rating_submit(
       target_pilot,target_type,'PIC',current_date,current_date+365,
       'ROLLBACK TEST ONLY - NOT LICENSING');
    proposal_id:=(ref->>'proposal_id')::bigint;
    if ref->>'facts_verified'<>'false' then
      raise exception 'Type rating prematurely verified';
    end if;
    review_result:=public.aervelys_registry_proposal_review(
      proposal_id,true,
      'ROLLBACK TEST fake type rating source review, never retain.');
    if review_result->>'operational_approval'<>'false'
       or not exists(select 1 from sim.pilot_qualifications
        where person_id=target_pilot and aircraft_type=target_type
         and role='PIC' and verified=true) then
      raise exception 'Type rating review contract failed';
    end if;
    raise exception 'ROLLBACK_FAKE_TEST_EVIDENCE' using errcode='PT099';
  exception when sqlstate 'PT099' then
    -- PostgreSQL rolls back all writes from the inner block.
    null;
  end;
  if (select count(*) from sim.virtual_registry_proposals)<>initial_proposals
    or (select count(*) from sim.aircraft_performance_profiles where verification_status='verified')<>initial_approved_profiles
    or (select count(*) from sim.pilot_qualifications where verified)<>initial_approved_ratings
  then raise exception 'Fake test facts escaped rollback';end if;
end $test$;
