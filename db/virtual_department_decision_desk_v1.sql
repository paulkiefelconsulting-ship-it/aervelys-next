-- AERVELYS NEXT / autonomous, evidence-bound SIM decision routing (v1)
-- Strictly separate from operational AERVELYS OPS.
create table sim.virtual_department_decisions (
 id bigint generated always as identity primary key,
 question_id bigint not null unique references sim.virtual_department_questions(id) on delete cascade,
 handoff_id bigint not null references sim.virtual_department_handoffs(id) on delete cascade,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 action_kind text not null check(action_kind in ('screen_sim_candidate','escalate_review','monitor_sim')),
 assigned_agent text not null check(assigned_agent in ('dispatch','crew','ops')),
 priority text not null check(priority in ('high','normal')),
 status text not null default 'queued' check(status in ('queued','candidate_proposed','needs_review','informational','failed')),
 decision_basis text not null default 'Noch nicht ausgewertet',
 evidence jsonb not null default '{}'::jsonb,
 source_updated_at timestamptz not null,
 last_evaluated_at timestamptz,
 next_check_at timestamptz,
 attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 acknowledged_at timestamptz,
 acknowledged_by uuid,
 acknowledge_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index virtual_department_decisions_queue_idx
 on sim.virtual_department_decisions(status,next_check_at,id);
create index virtual_department_decisions_case_idx
 on sim.virtual_department_decisions(request_id,id desc);
create table sim.virtual_department_decision_events (
 id bigint generated always as identity primary key,
 decision_id bigint not null references sim.virtual_department_decisions(id) on delete cascade,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 action_kind text not null check(action_kind in ('screen_sim_candidate','escalate_review','monitor_sim','acknowledge_review')),
 outcome text not null check(outcome in ('candidate_proposed','needs_review','informational','failed','acknowledged')),
 detail text not null check(length(detail) between 1 and 700),
 created_at timestamptz not null default now()
);
create index virtual_department_decision_events_recent_idx
 on sim.virtual_department_decision_events(id desc);
alter table sim.virtual_department_decisions enable row level security;
alter table sim.virtual_department_decision_events enable row level security;
revoke all on sim.virtual_department_decisions,sim.virtual_department_decision_events from public,anon,authenticated;
revoke all on sequence sim.virtual_department_decisions_id_seq,sim.virtual_department_decision_events_id_seq from public,anon,authenticated;

create function sim.virtual_department_decision_tick(p_limit integer default 20)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 owner_id uuid;
 old_sub text:=current_setting('request.jwt.claim.sub',true);
 x record;
 existing sim.virtual_department_decisions%rowtype;
 plan sim.virtual_agent_fleet_plans%rowtype;
 decision_id bigint;
 kind_out text; assign_out text; priority_out text;
 state_out text; basis_out text;
 evidence_out jsonb;
 created_count integer:=0;
 processed_count integer:=0;
 proposed_count integer:=0;
 review_count integer:=0;
 failed_count integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 40 then
  raise exception 'Invalid SIM decision batch size' using errcode='22023';
 end if;
 if session_user<>'postgres' and (uid is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=uid
    and u.active and u.role in ('ceo','ops')
 )) then raise exception 'SIM decision worker unauthorized' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(593,716) then
  return jsonb_build_object('skipped','decision_cycle_running','simulation_only',true,'operational_changes',0);
 end if;
 if not coalesce((select enabled from sim.virtual_airline_agent_settings where id=1),false)
  or not coalesce((select scheduled_enabled from sim.sim_customer_settings where id=1),false) then
  return jsonb_build_object('skipped','simulation_paused','simulation_only',true,'operational_changes',0);
 end if;
 if uid is null then
  select user_id into owner_id from sim.app_user_roles
   where active and role='ceo' order by created_at limit 1;
  if owner_id is null then return jsonb_build_object('skipped','no_active_ceo','simulation_only',true);end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
 end if;

 begin
  for x in
   select q.id as question_id,q.handoff_id,q.request_id,q.question_key,
     q.answer_state,q.updated_at as source_updated_at,
     r.request_code,r.requested_departure,r.status as charter_status,
     c.lifecycle, p.aircraft_id as planned_aircraft, p.status as plan_status
   from sim.virtual_department_questions q
   join sim.virtual_department_handoffs h on h.id=q.handoff_id
   join sim.charter_requests r on r.id=q.request_id
   join sim.sim_customer_cases c on c.request_id=q.request_id
   left join sim.virtual_agent_fleet_plans p on p.request_id=q.request_id
   left join sim.virtual_department_decisions d on d.question_id=q.id
   where h.status='open' and r.request_code like 'AV-SIM-%'
     and r.status not in ('cancelled','declined','completed')
     and c.lifecycle<>'withdrawn'
   order by coalesce(d.last_evaluated_at,timestamptz '1970-01-01') asc,
            q.id desc
   limit p_limit
  loop
   select * into existing from sim.virtual_department_decisions where question_id=x.question_id;
   -- Revisit only if source evidence changed or an explicit retry became due.
   if found and existing.source_updated_at=x.source_updated_at
    and (existing.next_check_at is null or existing.next_check_at>now()) then
     update sim.virtual_department_decisions
      set last_evaluated_at=now() where id=existing.id;
     continue;
   end if;
   if existing.id is not null and existing.source_updated_at=x.source_updated_at
      and existing.attempt_count>=3 and existing.status='failed' then
     update sim.virtual_department_decisions set last_evaluated_at=now()
      where id=existing.id;
     continue;
   end if;
   processed_count:=processed_count+1;
   kind_out:='monitor_sim';assign_out:='ops';priority_out:='normal';
   state_out:='informational';
   basis_out:='SIM-Nachricht dokumentiert, keine weitere sichere Aktion.';
   evidence_out:=jsonb_build_object('question_key',x.question_key,
    'answer_state',x.answer_state,'simulation_only',true,
    'operationally_approved',false);
   if x.answer_state='needs_review'
    or x.question_key in ('ops_conflicts','ops_requirements','crew_qualification') then
    kind_out:='escalate_review';assign_out:='ops';priority_out:='high';
    state_out:='needs_review';
    basis_out:='OPS/Crew-Nachweise und dokumentierte Konflikte müssen durch berechtigte Personen fachlich geprüft werden. Dieser Auftrag ist ausdrücklich keine Freigabe.';
   elsif x.question_key='aircraft_position' and x.answer_state='waiting' then
    kind_out:='screen_sim_candidate';assign_out:='dispatch';
    if x.requested_departure<=now()+interval '24 hours'
       or x.lifecycle not in ('inquired','followup_sent','negotiating','interested') then
     kind_out:='escalate_review';priority_out:='high';assign_out:='ops';
     state_out:='needs_review';
     basis_out:='SIM-Abflug zu nah oder Anfrage nicht mehr im aktiven Vertrieb. Keine automatische neue Disposition.';
    else
     -- Existing, restricted SIM helper creates only unverified fleet/crew candidate rows.
     -- No operational crew assignment or aircraft release is possible here.
     if x.planned_aircraft is null and x.plan_status is null then
      begin
       perform sim.virtual_agent_screen_request(x.request_id);
      exception when others then
       state_out:='failed';
       basis_out:='SIM-Kandidatensuche fehlgeschlagen: '||left(SQLERRM,300);
      end;
     end if;
     if state_out<>'failed' then
      select * into plan from sim.virtual_agent_fleet_plans where request_id=x.request_id;
      if plan.aircraft_id is not null then
       state_out:='candidate_proposed';
       basis_out:='Dispatsch-SIM-Vorschlag erstellt oder bereits vorhanden. Flugzeug, Crew und Freigabe sind unverbindlich und ungeprüft.';
       evidence_out:=evidence_out||jsonb_build_object('aircraft_candidate',true,
           'plan_status',plan.status,'crew_pic_candidate',plan.suggested_pic_id is not null,
           'crew_sic_candidate',plan.suggested_sic_id is not null);
      else
       kind_out:='escalate_review';assign_out:='ops';priority_out:='high';
       state_out:='needs_review';
       basis_out:='Kein geeigneter SIM-Flugzeugkandidat ermittelt. OPS muss Verfügbarkeit/Positionierung prüfen.';
       evidence_out:=evidence_out||jsonb_build_object('aircraft_candidate',false,
        'plan_status',plan.status);
      end if;
     end if;
    end if;
   elsif x.answer_state='answered' then
    kind_out:='monitor_sim';assign_out:='dispatch';
    state_out:='informational';
    basis_out:='Interne SIM-Frage beantwortet; Folgeabläufe laufen über bestehende Agenten. Keine operative Bestätigung.';
   else
    kind_out:='escalate_review';priority_out:='high';
    state_out:='needs_review';
    basis_out:='Antwort oder Evidenz fehlt; keine sichere automatisierte Entscheidung möglich.';
   end if;

   if existing.id is null then
    insert into sim.virtual_department_decisions
      (question_id,handoff_id,request_id,action_kind,assigned_agent,priority,
       source_updated_at,status,decision_basis,evidence,last_evaluated_at,
       next_check_at,attempt_count)
    values(x.question_id,x.handoff_id,x.request_id,kind_out,assign_out,priority_out,
       x.source_updated_at,state_out,basis_out,evidence_out,now(),
       case when state_out='failed' then now()+interval '2 hours' else null end,
       case when state_out='failed' then 1 else 0 end)
    returning id into decision_id;
    created_count:=created_count+1;
   else
    decision_id:=existing.id;
    update sim.virtual_department_decisions
    set action_kind=kind_out,assigned_agent=assign_out,priority=priority_out,
        status=case when state_out='failed' and existing.attempt_count>=2
          then 'needs_review' else state_out end,
        decision_basis=case when state_out='failed' and existing.attempt_count>=2
          then 'Automatische Kandidatensuche nach drei Fehlern gestoppt: '||basis_out
          else basis_out end,
        evidence=evidence_out,
        source_updated_at=x.source_updated_at,
        last_evaluated_at=now(),updated_at=now(),
        next_check_at=case when state_out='failed' and existing.attempt_count<2
          then now()+interval '2 hours' else null end,
        attempt_count=case when x.source_updated_at is distinct from existing.source_updated_at
          then (case when state_out='failed' then 1 else 0 end)
          when state_out='failed' then least(existing.attempt_count+1,3)
          else existing.attempt_count end,
        acknowledged_at=case when x.source_updated_at is distinct from existing.source_updated_at
           then null else acknowledged_at end,
        acknowledged_by=case when x.source_updated_at is distinct from existing.source_updated_at
           then null else acknowledged_by end,
        acknowledge_note=case when x.source_updated_at is distinct from existing.source_updated_at
           then null else acknowledge_note end
    where id=existing.id;
   end if;
   insert into sim.virtual_department_decision_events
    (decision_id,request_id,action_kind,outcome,detail)
   select decision_id,x.request_id,kind_out,
      case when state_out='failed' and existing.attempt_count>=2
        then 'needs_review' else state_out end,
      left(basis_out,700);
   if state_out='candidate_proposed' then proposed_count:=proposed_count+1;
   elsif state_out='needs_review' then review_count:=review_count+1;
   elsif state_out='failed' then failed_count:=failed_count+1;end if;
  end loop;
 exception when others then
   if uid is null then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);end if;
   raise;
 end;
 if uid is null then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);end if;
 return jsonb_build_object('examined',processed_count,'tasks_new',created_count,
  'candidates_proposed',proposed_count,'reviews_required',review_count,
  'failed',failed_count,'simulation_only',true,
  'real_offers',0,'real_crew_assignments',0,'flight_releases',0,'llm_connected',false);
end $fn$;
revoke all on function sim.virtual_department_decision_tick(integer) from public,anon,authenticated;

create function public.aervelys_virtual_decisions_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM decision overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(jsonb_build_object(
  'id',d.id,'request_id',d.request_id,'request_code',r.request_code,
  'question_id',d.question_id,'handoff_id',d.handoff_id,
  'action_kind',d.action_kind,'assigned_agent',d.assigned_agent,
  'priority',d.priority,'status',d.status,'decision_basis',d.decision_basis,
  'evidence',d.evidence,'updated_at',d.updated_at,'acknowledged_at',d.acknowledged_at,
  'acknowledge_note',d.acknowledge_note,'handoff_status',h.status
 ) order by d.updated_at desc,d.id desc)
 from (select * from sim.virtual_department_decisions order by updated_at desc,id desc limit 150) d
 join sim.charter_requests r on r.id=d.request_id
 join sim.virtual_department_handoffs h on h.id=d.handoff_id
 where r.request_code like 'AV-SIM-%'),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object(
  'id',e.id,'decision_id',e.decision_id,'request_id',e.request_id,
  'action_kind',e.action_kind,'outcome',e.outcome,'detail',e.detail,
  'created_at',e.created_at
 ) order by e.id desc) from
 (select * from sim.virtual_department_decision_events order by id desc limit 160)e),'[]'::jsonb),
 'review_open',(select count(*) from sim.virtual_department_decisions d
   join sim.virtual_department_handoffs h on h.id=d.handoff_id
   where h.status='open' and d.status='needs_review' and d.acknowledged_at is null),
 'simulation_only',true,'operational_approval',false,'llm_connected',false
 );
end $fn$;
revoke all on function public.aervelys_virtual_decisions_overview() from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decisions_overview() to authenticated;

create function public.aervelys_virtual_decisions_run(p_limit integer default 20)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM decision sync denied' using errcode='42501';
 end if;
 return sim.virtual_department_decision_tick(p_limit);
end $fn$;
revoke all on function public.aervelys_virtual_decisions_run(integer) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decisions_run(integer) to authenticated;

create function public.aervelys_virtual_decision_acknowledge(p_decision_id bigint,p_note text)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare record_id bigint;
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role='ceo') then
  raise exception 'CEO acknowledgement denied' using errcode='42501';
 end if;
 if p_decision_id is null or p_note is null or length(trim(p_note)) not between 3 and 250 then
   raise exception 'Please provide a review note of 3 to 250 characters' using errcode='22023';
 end if;
 select d.id into record_id
 from sim.virtual_department_decisions d
 join sim.virtual_department_handoffs h on h.id=d.handoff_id
 join sim.charter_requests r on r.id=d.request_id
 where d.id=p_decision_id and d.status='needs_review'
  and d.acknowledged_at is null and h.status='open' and r.request_code like 'AV-SIM-%'
 for update of d;
 if record_id is null then
   raise exception 'Review is closed or already acknowledged' using errcode='22023';
 end if;
 update sim.virtual_department_decisions
  set acknowledged_at=now(),acknowledged_by=auth.uid(),
      acknowledge_note=trim(p_note),updated_at=now()
 where id=record_id;
 insert into sim.virtual_department_decision_events
  (decision_id,request_id,action_kind,outcome,detail)
 select d.id,d.request_id,'acknowledge_review','acknowledged',
   'CEO hat SIM-Prüfauftrag zur Kenntnis genommen. Keine operative Freigabe.'
 from sim.virtual_department_decisions d where d.id=record_id;
 return jsonb_build_object('acknowledged',true,'simulation_only',true,
   'operational_approval',false,'flight_releases',0);
end $fn$;
revoke all on function public.aervelys_virtual_decision_acknowledge(bigint,text) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decision_acknowledge(bigint,text) to authenticated;

-- Extend one existing cron pipeline rather than adding a second scheduler.
create or replace function sim.virtual_department_full_cycle()
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare execution jsonb; dialogue jsonb; decisions jsonb; refreshed jsonb;
begin
 if session_user<>'postgres' then
  raise exception 'Internal SIM scheduler only' using errcode='42501';
 end if;
 execution:=sim.virtual_department_execute_tick(8);
 dialogue:=sim.virtual_department_dialogue_tick(40);
 decisions:=sim.virtual_department_decision_tick(20);
 refreshed:=sim.virtual_department_dialogue_tick(40);
 return jsonb_build_object('execution',execution,'dialogue',dialogue,
  'decisions',decisions,'dialogue_refresh',refreshed,'simulation_only',true);
end $fn$;
-- cron.job already targets this exact full-cycle function.
