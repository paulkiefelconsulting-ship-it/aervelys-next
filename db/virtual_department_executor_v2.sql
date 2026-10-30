-- AERVELYS NEXT ONLY. Persistent execution status for SIM handoffs.
-- No tables in the existing AERVELYS OPS project are modified.
alter table sim.virtual_department_handoffs
  add column execution_state text not null default 'queued'
    check (execution_state in ('queued','waiting','completed','blocked','failed')),
  add column attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  add column last_attempt_at timestamptz,
  add column next_attempt_at timestamptz,
  add column last_result text;

create table sim.virtual_department_action_events(
  id bigint generated always as identity primary key,
  handoff_id bigint not null references sim.virtual_department_handoffs(id) on delete cascade,
  request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
  agent text not null check (agent in ('sales','dispatch','crew','ops')),
  outcome text not null check (outcome in ('completed','waiting','blocked','failed')),
  detail text not null,
  created_at timestamptz not null default now()
);
create index virtual_department_action_events_recent_idx on
 sim.virtual_department_action_events(id desc);
alter table sim.virtual_department_action_events enable row level security;
revoke all on sim.virtual_department_action_events from public,anon,authenticated;
revoke all on sequence sim.virtual_department_action_events_id_seq from public,anon,authenticated;

create function sim.virtual_department_execute_tick(p_limit integer default 8)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
  uid uuid:=auth.uid();
  owner_id uuid;
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  rec record;
  answer jsonb;
  sales_count integer:=0;
  processed integer:=0;
  completed integer:=0;
  waiting_count integer:=0;
  blocked_count integer:=0;
  failed_count integer:=0;
  result_state text;
  result_detail text;
  next_at timestamptz;
  draft_dispatch boolean;
  draft_crew boolean;
  enabled_agents boolean;
  enabled_customers boolean;
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Invalid executable agent batch size' using errcode='22023';
  end if;
  if session_user <> 'postgres' and
     (uid is null or not exists(
       select 1 from sim.app_user_roles u where u.user_id=uid
         and u.active and u.role in ('ceo','ops')))
  then raise exception 'SIM executor access denied' using errcode='42501';end if;

  if not pg_try_advisory_xact_lock(593,712) then
    return jsonb_build_object('skipped','worker_running','simulation_only',true);
  end if;

  select coalesce(enabled,false) into enabled_agents
   from sim.virtual_airline_agent_settings where id=1;
  select coalesce(scheduled_enabled,false) into enabled_customers
   from sim.sim_customer_settings where id=1;

  if not coalesce(enabled_agents,false) or not coalesce(enabled_customers,false) then
    return jsonb_build_object('skipped','agents_or_customer_simulation_paused',
      'simulation_only',true,'operational_changes',0);
  end if;

  -- Existing SIM agent functions require a CEO/OPS identity. Cron alone may
  -- assume the active CEO in its restricted postgres session, as the
  -- pre-existing simulator scheduler already does.
  if uid is null then
    select user_id into owner_id from sim.app_user_roles
     where active and role='ceo' order by created_at limit 1;
    if owner_id is null then
      return jsonb_build_object('skipped','no_active_ceo','simulation_only',true);
    end if;
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
  end if;

  begin
    perform sim.virtual_department_handoff_tick(40);

    -- The existing sales agent already enforces due dates, number of quotes,
    -- maximum indicative prices and its own transaction lock. No new pricing model.
    if exists(
       select 1 from sim.virtual_department_handoffs h
       join sim.sim_customer_cases c on c.request_id=h.request_id
       where h.status='open' and h.stage in ('sales_reply','sales_price')
         and c.next_action_at<=now()
    ) then
      begin
        answer:=sim.virtual_agent_respond_charters(2,true);
        sales_count:=coalesce((answer->>'count')::integer,0);
      exception when others then
        -- A sales failure must not bypass dispatch restrictions or erase
        -- previously committed simulated handoffs.
        sales_count:=0;
      end;
    end if;
    perform sim.virtual_department_handoff_tick(40);

    for rec in
      select h.id,h.request_id,h.stage,h.to_agent,h.attempt_count,
             r.requested_departure,r.status as request_status,c.lifecycle
      from sim.virtual_department_handoffs h
      join sim.sim_customer_cases c on c.request_id=h.request_id
      join sim.charter_requests r on r.id=h.request_id
      where h.status='open'
       and h.execution_state in ('queued','waiting','failed')
       and (h.next_attempt_at is null or h.next_attempt_at<=now())
       and h.attempt_count<3
       and r.request_code like 'AV-SIM-%'
      order by coalesce(h.next_attempt_at,h.created_at),h.id
      limit p_limit
      for update of h skip locked
    loop
      processed:=processed+1;
      result_state:='waiting';
      result_detail:='SIM-Aktion noch nicht fällig oder fachlich nicht bereit.';
      next_at:=now()+interval '6 hours';

      if rec.request_status in ('cancelled','completed','declined')
         or rec.lifecycle='withdrawn' or rec.requested_departure<=now() then
        result_state:='blocked';next_at:=null;
        result_detail:='Anfrage geschlossen oder Abflugzeit vergangen; keine neue Aktion.';
      elsif rec.stage in ('sales_reply','sales_price') then
        result_detail:='Vertriebsautomatik ausgeführt, sofern Fälligkeit, Tageslimit und SIM-Preisregeln erfüllt sind. Kein Einzelangebot erzwungen.';
      elsif rec.stage='dispatch_candidate' or rec.stage='crew_candidate' then
        begin
          -- These functions write only unconfirmed SIM planning drafts.
          if rec.stage='dispatch_candidate' then
            perform sim.virtual_agent_assign_ops_case(rec.request_id);
            perform sim.virtual_agent_screen_request(rec.request_id);
          end if;

          answer:=sim.virtual_agent_create_existing_planning_drafts(rec.request_id);
          select exists(select 1 from sim.dispatch_planning_drafts d
                        where d.request_id=rec.request_id),
                 exists(select 1 from sim.crew_preplanning_drafts d
                        where d.request_id=rec.request_id)
            into draft_dispatch,draft_crew;

          if (rec.stage='dispatch_candidate' and draft_dispatch) or
             (rec.stage='crew_candidate' and draft_crew) then
            result_state:='completed';next_at:=null;
            result_detail:=case when rec.stage='dispatch_candidate'
              then 'Nicht freigegebener SIM-Flugzeugentwurf vorhanden.'
              else 'Nicht freigegebener SIM-Crew-/Rotationsentwurf vorhanden.' end;
          else
            result_detail:='Kein verifizierbarer Entwurf erzeugt; erneute SIM-Prüfung später.';
          end if;
        exception when others then
          result_state:='failed';
          next_at:=now()+interval '2 hours';
          result_detail:=left(SQLERRM,300);
        end;
      elsif rec.stage in ('ops_blocker','ops_readiness') then
        result_state:='blocked';next_at:=null;
        result_detail:='OPS-Nachweise bzw. Konflikte nur an Menschen eskaliert. Keine automatische Flugfreigabe.';
      else
        result_state:='blocked';next_at:=null;
        result_detail:='Nicht ausführbare Handoff-Phase.';
      end if;

      -- Retain bounded attempts; failed work is not silently marked done.
      update sim.virtual_department_handoffs
      set attempt_count=least(attempt_count+1,10),
          last_attempt_at=now(),
          next_attempt_at=case when result_state='failed' and attempt_count>=2 then null else next_at end,
          execution_state=case when result_state='failed' and attempt_count>=2
            then 'blocked' else result_state end,
          last_result=result_detail
      where id=rec.id and status='open';

      insert into sim.virtual_department_action_events
        (handoff_id,request_id,agent,outcome,detail)
      values(rec.id,rec.request_id,
        case when rec.to_agent in ('sales','dispatch','crew','ops') then rec.to_agent else 'ops' end,
        case when result_state='failed' and rec.attempt_count>=2 then 'blocked' else result_state end,
        result_detail);
      if result_state='completed' then completed:=completed+1;
      elsif result_state='blocked' then blocked_count:=blocked_count+1;
      elsif result_state='failed' then failed_count:=failed_count+1;
      else waiting_count:=waiting_count+1;end if;
    end loop;

    -- Reconcile new persisted handoffs produced by actual SIM drafts.
    perform sim.virtual_department_handoff_tick(40);
  exception when others then
    if uid is null then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);end if;
    raise;
  end;
  if uid is null then perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);end if;
  return jsonb_build_object('processed',processed,'completed',completed,
    'waiting',waiting_count,'blocked',blocked_count,'failed',failed_count,
    'sales_sim_quotes',sales_count,'simulation_only',true,
    'real_offers',0,'real_crew_assignments',0,'flights_released',0);
end $fn$;

revoke all on function sim.virtual_department_execute_tick(integer)
 from public,anon,authenticated;

create function public.aervelys_virtual_department_execute(p_limit integer default 8)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(
   select 1 from sim.app_user_roles u where u.user_id=auth.uid()
     and u.active and u.role in ('ceo','ops')) then
   raise exception 'Agent execution denied' using errcode='42501';
 end if;
 return sim.virtual_department_execute_tick(p_limit);
end $fn$;
revoke all on function public.aervelys_virtual_department_execute(integer)
 from public,anon,authenticated;
grant execute on function public.aervelys_virtual_department_execute(integer)
 to authenticated;

-- Extend the protected RPC with actual execution data. No direct grants on
-- journal tables or action event rows.
create or replace function public.aervelys_virtual_handoffs_execution_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(
   select 1 from sim.app_user_roles u where u.user_id=auth.uid()
    and u.active and u.role in('ceo','ops')) then
   raise exception 'Agent execution overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
   'runs',coalesce((
      select jsonb_agg(jsonb_build_object(
       'id',e.id,'handoff_id',e.handoff_id,
       'request_id',e.request_id,'agent',e.agent,
       'outcome',e.outcome,'detail',e.detail,'created_at',e.created_at
      ) order by e.id desc)
      from (select * from sim.virtual_department_action_events order by id desc limit 120) e
   ),'[]'::jsonb),
   'states',coalesce((
     select jsonb_agg(jsonb_build_object(
       'handoff_id',h.id,'execution_state',h.execution_state,
       'attempt_count',h.attempt_count,'last_result',h.last_result,
       'last_attempt_at',h.last_attempt_at,'next_attempt_at',h.next_attempt_at
     ) order by h.id desc)
     from (select * from sim.virtual_department_handoffs order by id desc limit 150) h
   ),'[]'::jsonb),
   'simulation_only',true,'operational_approval',false
 );
end $fn$;
revoke all on function public.aervelys_virtual_handoffs_execution_overview()
 from public,anon,authenticated;
grant execute on function public.aervelys_virtual_handoffs_execution_overview()
 to authenticated;

-- Reuse the existing NEXT cron slot to avoid duplicate competing workers.
select cron.schedule('aervelys-sim-department-handoffs','*/10 * * * *',
  'select sim.virtual_department_execute_tick(8);');
