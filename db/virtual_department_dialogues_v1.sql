-- AERVELYS NEXT: evidence-bound departmental conversations (SIM only).
-- This migration does not alter operational flights, offers, real crew assignments or payments.
create table sim.virtual_department_questions (
 id bigint generated always as identity primary key,
 handoff_id bigint not null references sim.virtual_department_handoffs(id) on delete cascade,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 question_key text not null check(question_key in ('aircraft_position','crew_availability','ops_requirements','ops_conflicts','crew_qualification')),
 from_agent text not null check(from_agent in ('sales','dispatch','crew','ops')),
 to_agent text not null check(to_agent in ('sales','dispatch','crew','ops')),
 question_body text not null,
 answer_state text not null default 'waiting' check(answer_state in ('waiting','answered','needs_review')),
 answer_body text,
 evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(handoff_id,question_key)
);
create index virtual_department_questions_case_idx on sim.virtual_department_questions(request_id,id desc);
create table sim.virtual_department_dialogue_events (
 id bigint generated always as identity primary key,
 question_id bigint not null references sim.virtual_department_questions(id) on delete cascade,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 kind text not null check (kind in ('question','answer')),
 author_agent text not null check (author_agent in ('sales','dispatch','crew','ops')),
 body text not null check(length(body) between 1 and 1500),
 state text not null check (state in ('waiting','answered','needs_review')),
 created_at timestamptz not null default now()
);
create index virtual_department_dialogue_events_case_idx on sim.virtual_department_dialogue_events(request_id,id desc);
alter table sim.virtual_department_questions enable row level security;
alter table sim.virtual_department_dialogue_events enable row level security;
revoke all on sim.virtual_department_questions,sim.virtual_department_dialogue_events from public,anon,authenticated;
revoke all on sequence sim.virtual_department_questions_id_seq,sim.virtual_department_dialogue_events_id_seq from public,anon,authenticated;

create function sim.virtual_department_dialogue_tick(p_limit integer default 40)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $function$
declare
 uid uuid:=auth.uid();
 x record;
 q_id bigint;
 q_old record;
 key_out text; from_out text; to_out text;
 question_out text; answer_out text; state_out text;
 evidence_out jsonb;
 alert_text text;
 generated integer:=0; responses integer:=0; reviewed integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then
  raise exception 'Invalid SIM dialogue batch size' using errcode='22023';
 end if;
 if session_user<>'postgres' and (uid is null or not exists(
   select 1 from sim.app_user_roles u where u.user_id=uid and u.active and u.role in('ceo','ops')
 )) then raise exception 'SIM dialogue authorization denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(593,714) then
  return jsonb_build_object('skipped','dialogue_worker_running','simulation_only',true,'operational_changes',0);
 end if;
 if not coalesce((select enabled from sim.virtual_airline_agent_settings where id=1),false)
  or not coalesce((select scheduled_enabled from sim.sim_customer_settings where id=1),false) then
  return jsonb_build_object('skipped','simulation_paused','simulation_only',true,'operational_changes',0);
 end if;

 for x in
  select h.id handoff_id,h.request_id,h.stage,r.request_code,r.origin_icao,r.destination_icao,
    p.aircraft_id,p.suggested_pic_id,p.suggested_sic_id,p.status plan_status,p.evidence,
    a.registration,pic.full_name as pic_name,sic.full_name as sic_name,
    exists(select 1 from sim.crew_preplanning_drafts d where d.request_id=h.request_id) crew_draft,
    exists(select 1 from sim.dispatch_planning_drafts d where d.request_id=h.request_id) aircraft_draft
   from sim.virtual_department_handoffs h
   join sim.sim_customer_cases c on c.request_id=h.request_id
   join sim.charter_requests r on r.id=h.request_id
   left join sim.virtual_agent_fleet_plans p on p.request_id=h.request_id
   left join sim.aircraft a on a.id=p.aircraft_id
   left join sim.people pic on pic.id=p.suggested_pic_id
   left join sim.people sic on sic.id=p.suggested_sic_id
   where h.status='open' and r.request_code like 'AV-SIM-%'
     and c.lifecycle<>'withdrawn' and r.status not in('cancelled','completed','declined')
   order by h.id desc
   limit p_limit
 loop
   key_out:=null;from_out:=null;to_out:=null;
   question_out:=null;answer_out:=null;state_out:='waiting';
   evidence_out:=jsonb_build_object('source','aervelys_next_sim','operational_approval',false);

   case x.stage
    when 'sales_reply','sales_price' then
     key_out:='aircraft_position';from_out:='sales';to_out:='dispatch';
     question_out:='Für '||x.request_code||': Welcher Flugzeugkandidat ist für '||
      x.origin_icao||' nach '||x.destination_icao||' dokumentiert? Ist die Positionierung geprüft?';
     if x.aircraft_id is not null then
      state_out:=case when x.plan_status='review_required' then 'needs_review' else 'answered' end;
      answer_out:='Dispatch: '||coalesce(x.registration,'Flugzeug-ID hinterlegt')||
       ' ist nur ein SIM-Kandidat. Positionierung, technische Verfügbarkeit und Freigabe sind nicht bestätigt.'||
       case when x.plan_status='review_required' then ' OPS-Konflikt ist dokumentiert.' else '' end;
     else
      answer_out:='Dispatch: Noch kein Flugzeugkandidat dokumentiert. Keine Zusage an den fiktiven Kunden.';
     end if;
     evidence_out:=evidence_out||jsonb_build_object('candidate_exists',x.aircraft_id is not null,
      'provisional_aircraft',x.registration,'plan_status',x.plan_status);
    when 'dispatch_candidate' then
     key_out:='crew_availability';from_out:='dispatch';to_out:='crew';
     question_out:='Für '||x.request_code||': Gibt es PIC- und SIC-Kandidaten sowie einen Crew-Entwurf?';
     if x.suggested_pic_id is not null and x.suggested_sic_id is not null then
      state_out:=case when x.plan_status='review_required' then 'needs_review' else 'answered' end;
      answer_out:='Crewplanung: PIC '||coalesce(x.pic_name,'nicht benannt')||
       ', SIC '||coalesce(x.sic_name,'nicht benannt')||
       ' als unverbindlicher SIM-Vorschlag. Crew-Entwurf: '||
       case when x.crew_draft then 'vorhanden' else 'fehlt' end||
       '. Flugstunden, Musterberechtigungen, Dienst- und Ruhezeiten nicht abschließend bestätigt.';
     else
      answer_out:='Crewplanung: PIC oder SIC fehlt. Keine bestätigte Einsatzbereitschaft.';
     end if;
     evidence_out:=evidence_out||jsonb_build_object('pic_candidate',x.suggested_pic_id is not null,
      'sic_candidate',x.suggested_sic_id is not null,'crew_draft',x.crew_draft);
    when 'crew_candidate' then
     key_out:='ops_requirements';from_out:='crew';to_out:='ops';
     question_out:='Für '||x.request_code||': Sind Positionierung, Ruhezeit und Einsatznachweise zur Freigabe vollständig?';
     state_out:='needs_review';
     answer_out:='OPS: Nein, die vorhandenen SIM-Vorschläge sind keine prüffähige operative Freigabe. '||
      'Positionierung, Ruhezeit, Qualifikationen und technische Nachweise müssen separat bestätigt werden.';
     evidence_out:=evidence_out||jsonb_build_object('released',false);
    when 'ops_blocker' then
     key_out:='ops_conflicts';from_out:='ops';to_out:='dispatch';
     question_out:='Für '||x.request_code||': Welche ungeklärten Flugzeug-/Crew-Konflikte liegen konkret vor?';
     state_out:='needs_review';
     if jsonb_typeof(x.evidence->'ops_alert_codes')='array' then
       select string_agg(left(code,100),', ' order by code) into alert_text
       from (select jsonb_array_elements_text(x.evidence->'ops_alert_codes') as code) alerts;
     else alert_text:=null;end if;
     answer_out:='Dispatch: '||case when nullif(alert_text,'') is null then
       'OPS-Prüfung ist markiert; dokumentierte Einzelursachen fehlen.'
       else 'Im SIM-Plan dokumentierte Konfliktcodes: '||left(alert_text,650)||'.' end||
       ' Keine Luftfahrzeug-/Crewzusage und keine Flugfreigabe.';
     evidence_out:=evidence_out||jsonb_build_object('alert_codes',coalesce(x.evidence->'ops_alert_codes','[]'::jsonb),
      'plan_status',x.plan_status,'released',false);
    when 'ops_readiness' then
     key_out:='crew_qualification';from_out:='ops';to_out:='crew';
     question_out:='Für '||x.request_code||': Sind PIC, SIC und die flugbezogenen Nachweise bestätigt?';
     state_out:='needs_review';
     answer_out:='Crewplanung: '||case when x.suggested_pic_id is not null and x.suggested_sic_id is not null then
       'PIC/SIC sind nur vorgeschlagen. ' else 'Mindestens ein Crewvorschlag fehlt. ' end||
       'Crew-Entwurf: '||case when x.crew_draft then 'vorhanden' else 'fehlt' end||
       '. Lizenzen, medizinische Gültigkeit, Dienst-/Ruhezeit und tatsächliche Positionierung '||
       'sind nicht durch diese SIM-Prüfung bestätigt. Keine Freigabe.';
     evidence_out:=evidence_out||jsonb_build_object('crew_draft',x.crew_draft,'released',false);
   end case;
   if key_out is null then continue;end if;
   reviewed:=reviewed+1;

   select q.id,q.answer_state,q.answer_body into q_old
    from sim.virtual_department_questions q
    where q.handoff_id=x.handoff_id and q.question_key=key_out;
   if not found then
     insert into sim.virtual_department_questions
       (handoff_id,request_id,question_key,from_agent,to_agent,question_body)
     values(x.handoff_id,x.request_id,key_out,from_out,to_out,question_out)
     returning id into q_id;
     insert into sim.virtual_department_dialogue_events
       (question_id,request_id,kind,author_agent,body,state)
     values(q_id,x.request_id,'question',from_out,question_out,'waiting');
     generated:=generated+1;
     q_old.answer_body:=null;q_old.answer_state:=null;
   else q_id:=q_old.id;end if;

   if q_old.answer_body is distinct from answer_out or q_old.answer_state is distinct from state_out then
      update sim.virtual_department_questions
       set answer_body=answer_out,answer_state=state_out,evidence=evidence_out,updated_at=now()
      where id=q_id;
      insert into sim.virtual_department_dialogue_events
       (question_id,request_id,kind,author_agent,body,state)
      values(q_id,x.request_id,'answer',to_out,answer_out,state_out);
      responses:=responses+1;
   end if;
 end loop;
 return jsonb_build_object('reviewed',reviewed,'questions_new',generated,'answers_new',responses,
  'simulation_only',true,'outbound_messages',0,'operational_changes',0,'llm_connected',false);
end $function$;
revoke all on function sim.virtual_department_dialogue_tick(integer) from public,anon,authenticated;

create function public.aervelys_virtual_dialogues_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $function$
begin
 if auth.uid() is null or not exists(
   select 1 from sim.app_user_roles u where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')
 ) then raise exception 'SIM dialogues access denied' using errcode='42501';end if;
 return jsonb_build_object(
  'threads',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'request_id',q.request_id,'request_code',r.request_code,
    'handoff_id',q.handoff_id,'question_key',q.question_key,
    'from_agent',q.from_agent,'to_agent',q.to_agent,
    'state',q.answer_state,'question',q.question_body,'answer',q.answer_body,
    'updated_at',q.updated_at,'handoff_status',h.status
   ) order by q.updated_at desc,q.id desc)
   from (select * from sim.virtual_department_questions order by updated_at desc,id desc limit 100) q
   join sim.charter_requests r on r.id=q.request_id
   join sim.virtual_department_handoffs h on h.id=q.handoff_id
   where r.request_code like 'AV-SIM-%'),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'question_id',e.question_id,'request_id',e.request_id,
    'kind',e.kind,'author_agent',e.author_agent,'body',e.body,'state',e.state,
    'created_at',e.created_at
   ) order by e.id desc)
   from (select * from sim.virtual_department_dialogue_events order by id desc limit 200) e),'[]'::jsonb),
  'open_questions',(select count(*) from sim.virtual_department_questions q
    join sim.virtual_department_handoffs h on h.id=q.handoff_id
    where h.status='open' and q.answer_state='waiting'),
  'review_required',(select count(*) from sim.virtual_department_questions q
    join sim.virtual_department_handoffs h on h.id=q.handoff_id
    where h.status='open' and q.answer_state='needs_review'),
  'simulation_only',true,'operational_approval',false,'llm_connected',false
 );
end $function$;
revoke all on function public.aervelys_virtual_dialogues_overview() from public,anon,authenticated;
grant execute on function public.aervelys_virtual_dialogues_overview() to authenticated;

create function public.aervelys_virtual_dialogues_sync(p_limit integer default 40)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $function$
begin
 if auth.uid() is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')
 ) then raise exception 'SIM dialogue synchronization denied' using errcode='42501';end if;
 return sim.virtual_department_dialogue_tick(p_limit);
end $function$;
revoke all on function public.aervelys_virtual_dialogues_sync(integer) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_dialogues_sync(integer) to authenticated;

-- Reuse the existing 10-minute SIM worker; avoid introducing another cron subscription/job.
create function sim.virtual_department_full_cycle()
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $function$
declare execution jsonb; dialogue jsonb;
begin
 if session_user<>'postgres' then raise exception 'Internal SIM scheduler only' using errcode='42501';end if;
 execution:=sim.virtual_department_execute_tick(8);
 dialogue:=sim.virtual_department_dialogue_tick(40);
 return jsonb_build_object('execution',execution,'dialogue',dialogue,'simulation_only',true);
end $function$;
revoke all on function sim.virtual_department_full_cycle() from public,anon,authenticated;
select cron.schedule('aervelys-sim-department-handoffs','*/10 * * * *',
 'select sim.virtual_department_full_cycle();');
