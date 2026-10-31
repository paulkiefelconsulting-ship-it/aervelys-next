-- AERVELYS NEXT ONLY: source-truth readiness / documentation workbench.
-- Documentary submission and review NEVER set pilot qualifications, maintenance,
-- insurance, fleet operating status, or flight-hour verification flags.
create table sim.virtual_evidence_tasks(
 id bigint generated always as identity primary key,
 subject_kind text not null check(subject_kind in('aircraft','crew')),
 subject_id uuid not null,
 subject_label text not null,
 requirement_key text not null check(requirement_key in(
   'seat_capacity','range','hourly_cost','airframe_hours','maintenance_release',
   'insurance','aircraft_status','type_rating','flight_hours')),
 title text not null,
 guidance text not null,
 responsible_agent text not null check(responsible_agent in('ops','crew','finance','maintenance')),
 source_state text not null check(source_state in('missing','unverified','verified_in_source')),
 workflow_state text not null default 'open' check(workflow_state in('open','submitted','reviewed','rejected','resolved')),
 reference text,
 submission_note text,
 submitted_by uuid,
 submitted_at timestamptz,
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text,
 source_checked_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(subject_kind,subject_id,requirement_key),
 check(workflow_state <> 'resolved' or source_state='verified_in_source')
);
create index virtual_evidence_tasks_worklist_idx on sim.virtual_evidence_tasks(source_state,workflow_state,updated_at desc);
create table sim.virtual_evidence_task_events(
 id bigint generated always as identity primary key,
 task_id bigint not null references sim.virtual_evidence_tasks(id) on delete cascade,
 action text not null check(action in('submitted','reviewed','rejected')),
 actor_id uuid not null,
 detail text not null,
 created_at timestamptz not null default now()
);
create index virtual_evidence_task_events_recent_idx on sim.virtual_evidence_task_events(id desc);
alter table sim.virtual_evidence_tasks enable row level security;
alter table sim.virtual_evidence_task_events enable row level security;
revoke all on sim.virtual_evidence_tasks,sim.virtual_evidence_task_events from public,anon,authenticated;
revoke all on sequence sim.virtual_evidence_tasks_id_seq,sim.virtual_evidence_task_events_id_seq from public,anon,authenticated;

create function sim.virtual_evidence_sync(p_limit integer default 200)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 processed integer:=0;
 changed integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 250 then
  raise exception 'Invalid evidence sync limit' using errcode='22023';
 end if;
 if session_user<>'postgres' and (uid is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=uid
   and u.active and u.role in ('ceo','ops'))) then
  raise exception 'SIM evidence sync denied' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(593,720) then
  return jsonb_build_object('skipped','evidence_sync_running','simulation_only',true,'operational_changes',0);
 end if;
 with expected as (
  select 'aircraft'::text subject_kind,a.id subject_id,a.registration subject_label,
   v.key requirement_key,v.title,v.guidance,v.responsible_agent,v.source_state
  from sim.aircraft a
  left join sim.aircraft_performance_profiles p on p.aircraft_id=a.id
  left join sim.aircraft_maintenance_state m on m.aircraft_id=a.id
  cross join lateral (values
   ('seat_capacity','Sitzplatzkapazität','Sitzplätze und Profilquelle prüfen; nur explizit verifizierter Leistungsdatensatz zählt.','ops',
      case when p.verification_status='verified' and p.passenger_seats>0 and nullif(trim(p.source_reference),'') is not null then 'verified_in_source'
       when p.passenger_seats is not null then 'unverified' else 'missing' end),
   ('range','Reichweite','Maximalreichweite und Dokumentationsquelle verifizieren; missionsspezifische Reichweite bleibt separat zu prüfen.','ops',
      case when p.verification_status='verified' and p.max_still_air_range_nm>0 and nullif(trim(p.source_reference),'') is not null then 'verified_in_source'
       when p.max_still_air_range_nm is not null then 'unverified' else 'missing' end),
   ('hourly_cost','Kosten je Blockstunde','Kalkulationsgrundlage je Muster und Datensatzquelle prüfen. Keine Schätzung als reale Betriebskosten ausgeben.','finance',
      case when p.verification_status='verified' and p.cost_per_block_hour_eur>0 and nullif(trim(p.source_reference),'') is not null then 'verified_in_source'
       when p.cost_per_block_hour_eur is not null then 'unverified' else 'missing' end),
   ('airframe_hours','Verifizierte Flugzeugstunden','Betriebsstundenzähler und dazugehörige Prüfung im Wartungsmodul hinterlegen.','maintenance',
      case when m.hours_verified=true and m.airframe_hours is not null and m.airframe_hours>=0 then 'verified_in_source'
       when m.airframe_hours is not null then 'unverified' else 'missing' end),
   ('maintenance_release','Wartungsfreigabe','Wartungsfreigabe aus dem Technikmodul erforderlich; eine Notiz ersetzt sie nicht.','maintenance',
      case when m.maintenance_release_verified=true then 'verified_in_source' else 'missing' end),
   ('insurance','Flugzeugspezifische Versicherung','Gültigkeit, Luftfahrzeug und Deckungsumfang gesondert prüfen. Im NEXT-Datenbestand derzeit kein verifizierbares Versicherungsregister.','ops','missing'),
   ('aircraft_status','Flugzeug-Betriebsstatus','Status im Flottenregister prüfen. Ein Status available allein bestätigt keine Lufttüchtigkeit.','ops',
      case when a.operational_status='available' then 'verified_in_source' else 'unverified' end)
  ) as v(key,title,guidance,responsible_agent,source_state)
  union all
  select 'crew'::text,per.id,per.full_name,
   v.key,v.title,v.guidance,v.responsible_agent,v.source_state
  from sim.people per
  left join sim.virtual_pilot_hours hours on hours.person_id=per.id
  cross join lateral (values
   ('type_rating','Gültige Musterberechtigung','Aktuelle, überprüfte Typberechtigung für mindestens ein NEXT-Flottenmuster und die jeweilige PIC-/SIC-Rolle hinterlegen.','crew',
     case when exists(select 1 from sim.pilot_qualifications q join sim.aircraft ac on ac.aircraft_type=q.aircraft_type
       where q.person_id=per.id and q.role=per.pilot_role and q.verified=true
         and current_date between q.valid_from and q.valid_until)
       then 'verified_in_source'
      when exists(select 1 from sim.pilot_qualifications q where q.person_id=per.id) then 'unverified'
      else 'missing' end),
   ('flight_hours','Bestätigte Pilotenstunden','Pilotensummen, PIC-Anteil und Quellenreferenz im virtuellen Flugstundenregister prüfen.','crew',
     case when hours.verification_status='verified' and hours.total_hours>=0 and
        hours.pic_hours>=0 and hours.pic_hours<=hours.total_hours and
        nullif(trim(hours.source_reference),'') is not null then 'verified_in_source'
      when hours.person_id is not null then 'unverified' else 'missing' end)
   ) as v(key,title,guidance,responsible_agent,source_state)
   where per.active=true and per.pilot_role in('PIC','SIC')
 ), limited as (
  select * from expected order by subject_kind,subject_label,requirement_key limit p_limit
 ), upserted as (
  insert into sim.virtual_evidence_tasks as t
   (subject_kind,subject_id,subject_label,requirement_key,title,guidance,responsible_agent,source_state,workflow_state)
  select subject_kind,subject_id,subject_label,requirement_key,title,guidance,responsible_agent,source_state,
   case when source_state='verified_in_source' then 'resolved' else 'open' end
  from limited
  on conflict(subject_kind,subject_id,requirement_key) do update set
   subject_label=excluded.subject_label,title=excluded.title,guidance=excluded.guidance,
   responsible_agent=excluded.responsible_agent,source_state=excluded.source_state,
   workflow_state=case
     when excluded.source_state='verified_in_source' then 'resolved'
     when t.workflow_state='resolved' then 'open'
     else t.workflow_state end,
   source_checked_at=now(),updated_at=now()
  where t.source_state is distinct from excluded.source_state
    or t.subject_label is distinct from excluded.subject_label
    or t.workflow_state='resolved' and excluded.source_state<>'verified_in_source'
    or t.workflow_state<>'resolved' and excluded.source_state='verified_in_source'
  returning id
 )
 select (select count(*) from limited),(select count(*) from upserted)
 into processed,changed;
 return jsonb_build_object('evaluated',processed,'new_or_changed',changed,
   'simulation_only',true,'verified_facts_fabricated',0,'operational_changes',0);
end $fn$;
revoke all on function sim.virtual_evidence_sync(integer) from public,anon,authenticated;

create function public.aervelys_virtual_evidence_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u where u.user_id=auth.uid()
  and u.active and u.role in('ceo','ops')) then
   raise exception 'SIM evidence overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'tasks',coalesce((select jsonb_agg(jsonb_build_object(
   'id',t.id,'subject_kind',t.subject_kind,'subject_label',t.subject_label,
   'requirement_key',t.requirement_key,'title',t.title,'guidance',t.guidance,
   'responsible_agent',t.responsible_agent,'source_state',t.source_state,
   'workflow_state',t.workflow_state,'reference',t.reference,
   'submission_note',t.submission_note,'submitted_at',t.submitted_at,
   'review_note',t.review_note,'reviewed_at',t.reviewed_at,'updated_at',t.updated_at
   ) order by t.subject_kind,t.subject_label,t.requirement_key)
   from (select * from sim.virtual_evidence_tasks order by subject_kind,subject_label,requirement_key limit 250)t),
   '[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'task_id',e.task_id,'action',e.action,'detail',e.detail,'created_at',e.created_at
    ) order by e.id desc)
   from (select * from sim.virtual_evidence_task_events order by id desc limit 100)e),'[]'::jsonb),
  'total',(select count(*) from sim.virtual_evidence_tasks),
  'missing',(select count(*) from sim.virtual_evidence_tasks where source_state='missing'),
  'unverified',(select count(*) from sim.virtual_evidence_tasks where source_state='unverified'),
  'verified_in_source',(select count(*) from sim.virtual_evidence_tasks where source_state='verified_in_source'),
  'submitted',(select count(*) from sim.virtual_evidence_tasks where workflow_state='submitted'),
  'can_review',exists(select 1 from sim.app_user_roles u where u.user_id=auth.uid()
    and u.active and u.role='ceo'),
  'simulation_only',true,'operational_approval',false,'automatically_verified',false
 );
end $fn$;
revoke all on function public.aervelys_virtual_evidence_overview() from public,anon,authenticated;
grant execute on function public.aervelys_virtual_evidence_overview() to authenticated;

create function public.aervelys_virtual_evidence_sync(p_limit integer default 200)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u where u.user_id=auth.uid()
  and u.active and u.role in('ceo','ops')) then
   raise exception 'SIM evidence refresh denied' using errcode='42501';
 end if;
 return sim.virtual_evidence_sync(p_limit);
end $fn$;
revoke all on function public.aervelys_virtual_evidence_sync(integer) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_evidence_sync(integer) to authenticated;

create function public.aervelys_virtual_evidence_submit(p_task_id bigint,p_reference text,p_note text)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare task_id bigint;
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u where u.user_id=auth.uid()
  and u.active and u.role in('ceo','ops')) then
   raise exception 'SIM evidence submit denied' using errcode='42501';
 end if;
 if p_task_id is null or p_reference is null or length(trim(p_reference)) not between 5 and 350
   or p_note is null or length(trim(p_note)) not between 5 and 500 then
    raise exception 'Reference must be 5..350 and note 5..500 characters' using errcode='22023';
 end if;
 select id into task_id from sim.virtual_evidence_tasks
 where id=p_task_id and workflow_state in('open','submitted','reviewed','rejected')
   and source_state<>'verified_in_source' for update;
 if task_id is null then raise exception 'Evidence task not eligible' using errcode='22023';end if;
 update sim.virtual_evidence_tasks set
  reference=trim(p_reference),submission_note=trim(p_note),
  submitted_by=auth.uid(),submitted_at=now(),workflow_state='submitted',
  reviewed_by=null,reviewed_at=null,review_note=null,updated_at=now()
 where id=task_id;
 insert into sim.virtual_evidence_task_events(task_id,action,actor_id,detail)
 values(task_id,'submitted',auth.uid(),'Quellenverweis eingereicht, noch nicht geprüft.');
 return jsonb_build_object('submitted',true,'simulation_only',true,
   'source_verified',false,'operational_approval',false);
end $fn$;
revoke all on function public.aervelys_virtual_evidence_submit(bigint,text,text) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_evidence_submit(bigint,text,text) to authenticated;

create function public.aervelys_virtual_evidence_review(p_task_id bigint,p_accepted boolean,p_note text)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare task_id bigint;
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u where u.user_id=auth.uid()
  and u.active and u.role='ceo') then
   raise exception 'CEO evidence review denied' using errcode='42501';
 end if;
 if p_task_id is null or p_accepted is null or p_note is null
   or length(trim(p_note)) not between 5 and 500 then
   raise exception 'Invalid evidence review or note (5..500 characters)' using errcode='22023';
 end if;
 select id into task_id from sim.virtual_evidence_tasks
 where id=p_task_id and workflow_state='submitted' and source_state<>'verified_in_source'
 for update;
 if task_id is null then raise exception 'No submitted evidence available for review' using errcode='22023';end if;
 update sim.virtual_evidence_tasks set workflow_state=case when p_accepted then 'reviewed' else 'rejected' end,
  review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where id=task_id;
 insert into sim.virtual_evidence_task_events(task_id,action,actor_id,detail)
 values(task_id,case when p_accepted then 'reviewed' else 'rejected' end,auth.uid(),
  'Dokumentation '||case when p_accepted then 'gesichtet' else 'zurückgewiesen' end||
  '; keine Freigabe und keine Änderung an den zugrunde liegenden Fakten.');
 return jsonb_build_object('reviewed',true,'accepted_documentation',p_accepted,
  'source_verified',false,'simulation_only',true,'operational_approval',false);
end $fn$;
revoke all on function public.aervelys_virtual_evidence_review(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_evidence_review(bigint,boolean,text) to authenticated;

-- Existing 10-minute SIM worker: refresh worklist but no second scheduler.
create or replace function sim.virtual_department_full_cycle()
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare execution jsonb;dialogue jsonb;decisions jsonb;refreshed jsonb;alternatives jsonb;evidence jsonb;
begin
 if session_user<>'postgres' then
  raise exception 'Internal SIM scheduler only' using errcode='42501';
 end if;
 execution:=sim.virtual_department_execute_tick(8);
 dialogue:=sim.virtual_department_dialogue_tick(40);
 decisions:=sim.virtual_department_decision_tick(20);
 refreshed:=sim.virtual_department_dialogue_tick(40);
 alternatives:=sim.virtual_department_resolution_tick(30);
 evidence:=sim.virtual_evidence_sync(200);
 return jsonb_build_object('execution',execution,'dialogue',dialogue,'decisions',decisions,
  'dialogue_refresh',refreshed,'alternatives',alternatives,'evidence',evidence,
  'simulation_only',true);
end $fn$;
