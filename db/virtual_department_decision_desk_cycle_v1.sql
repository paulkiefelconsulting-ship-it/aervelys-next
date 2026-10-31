-- AERVELYS NEXT / usability: complete manual cycle, CEO-only review button.
create or replace function public.aervelys_virtual_decisions_run(p_limit integer default 20)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare before_dialogue jsonb; decisions jsonb; after_dialogue jsonb;
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM decision sync denied' using errcode='42501';
 end if;
 before_dialogue:=sim.virtual_department_dialogue_tick(40);
 decisions:=sim.virtual_department_decision_tick(p_limit);
 after_dialogue:=sim.virtual_department_dialogue_tick(40);
 return jsonb_build_object('decision',decisions,'dialogue_before',before_dialogue,
   'dialogue_after',after_dialogue,'simulation_only',true,
   'operational_approval',false,'flight_releases',0);
end $fn$;
revoke all on function public.aervelys_virtual_decisions_run(integer) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decisions_run(integer) to authenticated;

create or replace function public.aervelys_virtual_decisions_overview()
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
 'can_acknowledge',exists(select 1 from sim.app_user_roles u
   where u.user_id=auth.uid() and u.active and u.role='ceo'),
 'simulation_only',true,'operational_approval',false,'llm_connected',false
 );
end $fn$;
revoke all on function public.aervelys_virtual_decisions_overview() from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decisions_overview() to authenticated;

create or replace function public.aervelys_virtual_decision_acknowledge(p_decision_id bigint,p_note text)
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
   left('CEO-Kenntnisnahme (KEINE Freigabe): '||trim(p_note),700)
 from sim.virtual_department_decisions d where d.id=record_id;
 return jsonb_build_object('acknowledged',true,'simulation_only',true,
   'operational_approval',false,'flight_releases',0);
end $fn$;
revoke all on function public.aervelys_virtual_decision_acknowledge(bigint,text) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_decision_acknowledge(bigint,text) to authenticated;
