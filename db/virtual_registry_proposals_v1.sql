-- AERVELYS NEXT ONLY: explicit two-stage SIM fleet profile and pilot type rating review.
-- Source references are internal simulation evidence; no airworthiness, regulatory or flight approval.
create table sim.virtual_registry_proposals(
 id bigint generated always as identity primary key,
 subject_kind text not null check(subject_kind in ('aircraft_profile','pilot_type_rating')),
 subject_id uuid not null,
 subject_label text not null,
 target_key text not null,
 proposal_data jsonb not null,
 source_reference text not null check(length(source_reference) between 12 and 350),
 status text not null default 'submitted' check(status in ('submitted','approved','rejected')),
 submitted_by uuid not null,
 submitted_at timestamptz not null default now(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text,
 check(status='submitted' or (reviewed_by is not null and reviewed_at is not null and length(review_note)>=15))
);
create unique index virtual_registry_proposals_one_pending
 on sim.virtual_registry_proposals(subject_kind,subject_id,target_key)
 where status='submitted';
create index virtual_registry_proposals_recent on sim.virtual_registry_proposals(id desc);

create table sim.virtual_registry_proposal_events(
 id bigint generated always as identity primary key,
 proposal_id bigint not null references sim.virtual_registry_proposals(id) on delete cascade,
 actor_id uuid not null,
 action text not null check(action in ('submitted','approved','rejected')),
 description text not null,
 created_at timestamptz not null default now()
);
create index virtual_registry_proposal_events_recent
 on sim.virtual_registry_proposal_events(id desc);
alter table sim.virtual_registry_proposals enable row level security;
alter table sim.virtual_registry_proposal_events enable row level security;
revoke all on sim.virtual_registry_proposals,sim.virtual_registry_proposal_events from public,anon,authenticated;
revoke all on sequence sim.virtual_registry_proposals_id_seq,sim.virtual_registry_proposal_events_id_seq from public,anon,authenticated;

create function public.aervelys_registry_proposals_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in ('ceo','ops')) then
   raise exception 'SIM registry overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
 'aircraft',coalesce((select jsonb_agg(jsonb_build_object(
  'id',a.id,'registration',a.registration,'aircraft_type',a.aircraft_type,
  'operational_status',a.operational_status,'seats',p.passenger_seats,
  'range_nm',p.max_still_air_range_nm,'cost_hour_eur',p.cost_per_block_hour_eur,
  'source_reference',p.source_reference,
  'profile_status',coalesce(p.verification_status,'unverified')
 ) order by a.registration) from sim.aircraft a
 left join sim.aircraft_performance_profiles p on p.aircraft_id=a.id),'[]'::jsonb),
 'pilots',coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'full_name',p.full_name,'role',p.pilot_role,
  'hours_status',coalesce(h.verification_status,'missing'),
  'total_hours',h.total_hours,'pic_hours',h.pic_hours,
  'hours_source',h.source_reference
 ) order by p.pilot_role,p.full_name) from sim.people p
 left join sim.virtual_pilot_hours h on h.person_id=p.id
 where p.active and p.pilot_role in('PIC','SIC')),'[]'::jsonb),
 'types',coalesce((select jsonb_agg(distinct a.aircraft_type) from sim.aircraft a),'[]'::jsonb),
 'qualifications',coalesce((select jsonb_agg(jsonb_build_object(
  'person_id',q.person_id,'aircraft_type',q.aircraft_type,'role',q.role,
  'valid_until',q.valid_until,'verified',q.verified
 )) from sim.pilot_qualifications q),'[]'::jsonb),
 'proposals',coalesce((select jsonb_agg(jsonb_build_object(
  'id',v.id,'subject_kind',v.subject_kind,'subject_id',v.subject_id,
  'subject_label',v.subject_label,'target_key',v.target_key,'proposal_data',v.proposal_data,
  'source_reference',v.source_reference,'status',v.status,'submitted_at',v.submitted_at,
  'reviewed_at',v.reviewed_at,'review_note',v.review_note
 ) order by v.id desc) from
 (select * from sim.virtual_registry_proposals order by id desc limit 120)v),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'proposal_id',e.proposal_id,'action',e.action,
  'description',e.description,'created_at',e.created_at
 ) order by e.id desc) from
 (select * from sim.virtual_registry_proposal_events order by id desc limit 120)e),'[]'::jsonb),
 'can_review',exists(select 1 from sim.app_user_roles u
   where u.user_id=auth.uid() and u.active and u.role='ceo'),
 'simulation_only',true,'operational_approval',false,'source_review_required',true
 );
end $fn$;
revoke all on function public.aervelys_registry_proposals_overview() from public,anon,authenticated;
grant execute on function public.aervelys_registry_proposals_overview() to authenticated;

create function public.aervelys_registry_profile_submit(
 p_aircraft_id uuid,p_seats integer,p_range_nm numeric,p_cost_hour_eur numeric,p_source text
)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid();a sim.aircraft%rowtype;new_id bigint;source text:=btrim(coalesce(p_source,''));
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u where u.user_id=uid and u.active
  and u.role in('ceo','ops')) then raise exception 'SIM profile report denied' using errcode='42501';end if;
 if p_aircraft_id is null or p_seats is null or p_seats not between 1 and 30
  or p_range_nm is null or p_range_nm not between 50 and 12000
  or p_cost_hour_eur is null or p_cost_hour_eur not between 1 and 100000
  or length(source) not between 12 and 350 then
  raise exception 'Seats 1..30, range 50..12000, hourly cost 1..100000 and source 12..350 required'
    using errcode='22023';
 end if;
 select * into a from sim.aircraft where id=p_aircraft_id;
 if not found then raise exception 'Unknown NEXT aircraft' using errcode='22023';end if;
 insert into sim.virtual_registry_proposals
  (subject_kind,subject_id,subject_label,target_key,proposal_data,source_reference,submitted_by)
 values('aircraft_profile',a.id,a.registration,'profile',
  jsonb_build_object('seats',p_seats,'range_nm',p_range_nm,'cost_hour_eur',p_cost_hour_eur),
  source,uid) returning id into new_id;
 insert into sim.virtual_registry_proposal_events(proposal_id,actor_id,action,description)
 values(new_id,uid,'submitted','Unverifizierte SIM-Profilwerte zur Prüfung eingereicht.');
 return jsonb_build_object('proposal_id',new_id,'status','submitted',
  'facts_verified',false,'simulation_only',true,'operational_approval',false);
end $fn$;
revoke all on function public.aervelys_registry_profile_submit(uuid,integer,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.aervelys_registry_profile_submit(uuid,integer,numeric,numeric,text) to authenticated;

create function public.aervelys_registry_type_rating_submit(
 p_person_id uuid,p_aircraft_type text,p_role text,p_valid_from date,p_valid_until date,p_source text
)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid();pilot sim.people%rowtype;source text:=btrim(coalesce(p_source,''));
 type_key text:=btrim(coalesce(p_aircraft_type,''));new_id bigint;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u where u.user_id=uid and u.active
  and u.role in('ceo','ops')) then raise exception 'SIM type rating report denied' using errcode='42501';end if;
 select * into pilot from sim.people where id=p_person_id and active and pilot_role in('PIC','SIC');
 if not found or pilot.pilot_role is distinct from p_role
  or not exists(select 1 from sim.aircraft a where a.aircraft_type=type_key)
  or p_valid_from is null or p_valid_until is null or p_valid_until<p_valid_from
  or p_valid_until<current_date or p_valid_from>current_date+365
  or length(source) not between 12 and 350 then
   raise exception 'Active pilot, matching role, fleet type, valid dates and evidence source required'
    using errcode='22023';
 end if;
 insert into sim.virtual_registry_proposals
 (subject_kind,subject_id,subject_label,target_key,proposal_data,source_reference,submitted_by)
 values('pilot_type_rating',pilot.id,pilot.full_name,type_key||':'||p_role,
  jsonb_build_object('aircraft_type',type_key,'role',p_role,
   'valid_from',p_valid_from,'valid_until',p_valid_until),
  source,uid) returning id into new_id;
 insert into sim.virtual_registry_proposal_events(proposal_id,actor_id,action,description)
 values(new_id,uid,'submitted','SIM-Musterberechtigung nur als Prüfunterlage eingereicht.');
 return jsonb_build_object('proposal_id',new_id,'status','submitted',
  'facts_verified',false,'simulation_only',true,'operational_approval',false);
end $fn$;
revoke all on function public.aervelys_registry_type_rating_submit(uuid,text,text,date,date,text) from public,anon,authenticated;
grant execute on function public.aervelys_registry_type_rating_submit(uuid,text,text,date,date,text) to authenticated;

create function public.aervelys_registry_proposal_review(
 p_proposal_id bigint,p_approve boolean,p_review_note text
)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid();proposal sim.virtual_registry_proposals%rowtype;
 note text:=btrim(coalesce(p_review_note,''));
 payload jsonb;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u where u.user_id=uid
  and u.active and u.role='ceo') then
  raise exception 'CEO source review required' using errcode='42501';
 end if;
 if p_proposal_id is null or p_approve is null or length(note) not between 15 and 500 then
  raise exception 'Review needs decision and 15..500 character evidence note' using errcode='22023';
 end if;
 select * into proposal from sim.virtual_registry_proposals
  where id=p_proposal_id and status='submitted' for update;
 if not found then raise exception 'Proposal no longer pending' using errcode='22023';end if;
 payload:=proposal.proposal_data;
 if p_approve then
   if proposal.subject_kind='aircraft_profile' then
    if not exists(select 1 from sim.aircraft where id=proposal.subject_id) then
     raise exception 'Aircraft no longer exists' using errcode='22023';end if;
    insert into sim.aircraft_performance_profiles
      (aircraft_id,passenger_seats,max_still_air_range_nm,
       cost_per_block_hour_eur,source_reference,verification_status,reviewed_at,note)
    values(proposal.subject_id,(payload->>'seats')::integer,
      (payload->>'range_nm')::numeric,(payload->>'cost_hour_eur')::numeric,
      proposal.source_reference,'verified',now(),'CEO-Quellenprüfung: '||note)
    on conflict(aircraft_id) do update set
      passenger_seats=excluded.passenger_seats,max_still_air_range_nm=excluded.max_still_air_range_nm,
      cost_per_block_hour_eur=excluded.cost_per_block_hour_eur,source_reference=excluded.source_reference,
      verification_status='verified',reviewed_at=now(),note=excluded.note;
   elsif proposal.subject_kind='pilot_type_rating' then
    if not exists(select 1 from sim.people p where p.id=proposal.subject_id
     and p.active and p.pilot_role=(payload->>'role'))
     or not exists(select 1 from sim.aircraft a where a.aircraft_type=payload->>'aircraft_type')
     or (payload->>'valid_until')::date<current_date then
     raise exception 'Pilot, aircraft type or qualification dates invalid at review'
       using errcode='22023';
    end if;
    insert into sim.pilot_qualifications
      (person_id,aircraft_type,role,valid_from,valid_until,verified)
    values(proposal.subject_id,payload->>'aircraft_type',payload->>'role',
      (payload->>'valid_from')::date,(payload->>'valid_until')::date,true)
    on conflict(person_id,aircraft_type,role) do update set
      valid_from=excluded.valid_from,valid_until=excluded.valid_until,verified=true;
   else
    raise exception 'Unsupported SIM evidence kind' using errcode='22023';
   end if;
 end if;
 update sim.virtual_registry_proposals
  set status=case when p_approve then 'approved' else 'rejected' end,
   reviewed_by=uid,reviewed_at=now(),review_note=note
 where id=proposal.id;
 insert into sim.virtual_registry_proposal_events
 (proposal_id,actor_id,action,description)
 values(proposal.id,uid,case when p_approve then 'approved' else 'rejected' end,
  case when p_approve then 'CEO hat die interne Quellengrundlage im SIM-Fachregister bestätigt. Keine Flugfreigabe.'
  else 'CEO hat den SIM-Nachweis abgelehnt.' end);
 -- Surface updates to the existing evidence tasks immediately. No release.
 perform sim.virtual_evidence_sync(200);
 return jsonb_build_object('reviewed',true,'approved',p_approve,
  'source_registered',p_approve,'simulation_only',true,
  'operational_approval',false,'flights_released',0);
end $fn$;
revoke all on function public.aervelys_registry_proposal_review(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.aervelys_registry_proposal_review(bigint,boolean,text) to authenticated;
