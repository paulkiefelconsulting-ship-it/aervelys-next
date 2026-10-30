-- AERVELYS NEXT ONLY. Additive SIM handoff journal. No flight, crew or payment writes.
create table sim.virtual_department_handoffs (
 id bigint generated always as identity primary key,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 stage text not null check (stage in ('customer_closed','ops_blocker','sales_reply','sales_price','dispatch_candidate','crew_candidate','ops_readiness')),
 from_agent text not null check (from_agent in ('system','sales','dispatch','crew','ops')),
 to_agent text not null check (to_agent in ('system','sales','dispatch','crew','ops')),
 subject text not null,
 body text not null,
 status text not null default 'open' check (status in ('open','superseded')),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create unique index virtual_department_handoffs_one_open on sim.virtual_department_handoffs(request_id) where status='open';
create index virtual_department_handoffs_recent on sim.virtual_department_handoffs(created_at desc,id desc);
alter table sim.virtual_department_handoffs enable row level security;
revoke all on sim.virtual_department_handoffs from public,anon,authenticated;
revoke all on sequence sim.virtual_department_handoffs_id_seq from public,anon,authenticated;

-- Internal, bounded, idempotent SIM-only refresh.
create function sim.virtual_department_handoff_tick(p_limit integer default 40)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 rec record; prev_id bigint; prev_stage text; prev_agent text;
 next_stage text; next_agent text; next_subject text; next_body text;
 visited integer:=0; inserted integer:=0; changed integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then
   raise exception 'Invalid handoff batch size' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(593,710);
 for rec in
   select c.request_id,r.request_code,c.lifecycle,r.status as request_status,
      c.last_offer_price_eur,
      exists(select 1 from sim.sim_customer_messages m
             where m.request_id=c.request_id and m.message_kind='sales_agent_reply') as sales_replied,
      p.aircraft_id,p.suggested_pic_id,p.suggested_sic_id,p.status as plan_status,
      d.request_id as dispatch_id
   from sim.sim_customer_cases c
   join sim.charter_requests r on r.id=c.request_id
   left join sim.virtual_agent_fleet_plans p on p.request_id=c.request_id
   left join sim.dispatch_planning_drafts d on d.request_id=c.request_id
   where r.request_code like 'AV-SIM-%'
   order by c.updated_at desc,c.request_id
   limit p_limit
 loop
   visited:=visited+1;
   if rec.lifecycle='withdrawn' or rec.request_status in ('cancelled','completed','declined') then
     next_stage:='customer_closed';next_agent:='system';
     next_subject:='SIM-Kundenfall beendet';
     next_body:='Keine weitere Bearbeitung des geschlossenen SIM-Kundenfalls.';
   elsif rec.plan_status='review_required' then
     next_stage:='ops_blocker';next_agent:='ops';
     next_subject:='OPS-SIM-Konflikt prüfen';
     next_body:='Virtuelle Disposition meldet offene Konflikte oder Positionierung. Nur Vorprüfung, kein GO.';
   elsif not rec.sales_replied then
     next_stage:='sales_reply';next_agent:='sales';
     next_subject:='SIM-Kundenanfrage beantworten';
     next_body:='Vertrieb soll die fiktive Anfrage über die bestehende Agentenlogik beantworten.';
   elsif rec.last_offer_price_eur is null then
     next_stage:='sales_price';next_agent:='sales';
     next_subject:='SIM-Preisindikation fehlt';
     next_body:='Kaufmännische, unverbindliche SIM-Preisindikation prüfen. Kein echtes Angebot.';
   elsif rec.aircraft_id is null and rec.dispatch_id is null then
     next_stage:='dispatch_candidate';next_agent:='dispatch';
     next_subject:='Flugzeugkandidat vorprüfen';
     next_body:='Virtuelle Disposition benötigt einen geeigneten Flugzeugvorschlag und Positionsprüfung.';
   elsif rec.suggested_pic_id is null or rec.suggested_sic_id is null then
     next_stage:='crew_candidate';next_agent:='crew';
     next_subject:='PIC und SIC vorprüfen';
     next_body:='Nur Crewvorschläge und Dienst-/Ruhezeit-Konflikte prüfen. Keine bindende Einteilung.';
   else
     next_stage:='ops_readiness';next_agent:='ops';
     next_subject:='SIM-Planung zur OPS-Nachweisprüfung';
     next_body:='Vertrieb, Flugzeug und Crew wurden nur vorläufig geplant. Technik, Genehmigungen und Freigaben bleiben gesperrt.';
   end if;
   prev_id:=null;prev_stage:=null;prev_agent:=null;
   select h.id,h.stage,h.to_agent into prev_id,prev_stage,prev_agent
     from sim.virtual_department_handoffs h where h.request_id=rec.request_id and h.status='open'
     order by h.id desc limit 1;
   if prev_id is null or prev_stage is distinct from next_stage then
     if prev_id is not null then
       update sim.virtual_department_handoffs
       set status='superseded',completed_at=now()
       where id=prev_id and status='open';
       changed:=changed+1;
     end if;
     insert into sim.virtual_department_handoffs
       (request_id,stage,from_agent,to_agent,subject,body)
     values(rec.request_id,next_stage,coalesce(prev_agent,'system'),next_agent,
            rec.request_code||' · '||next_subject,next_body);
     inserted:=inserted+1;
   end if;
 end loop;
 return jsonb_build_object('examined',visited,'new_handoffs',inserted,
    'closed_previous',changed,'simulation_only',true,'operational_changes',0);
end $fn$;
revoke all on function sim.virtual_department_handoff_tick(integer) from public,anon,authenticated;

create function public.aervelys_virtual_handoffs_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists (
   select 1 from sim.app_user_roles u where u.user_id=auth.uid()
    and u.active and u.role in ('ceo','ops')
 ) then raise exception 'Handoff access denied' using errcode='42501';end if;
 return jsonb_build_object(
   'handoffs',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',h.id,'request_id',h.request_id,'request_code',r.request_code,
       'stage',h.stage,'from_agent',h.from_agent,'to_agent',h.to_agent,
       'subject',h.subject,'body',h.body,'status',h.status,
       'created_at',h.created_at,'completed_at',h.completed_at
     ) order by h.id desc)
     from (select * from sim.virtual_department_handoffs order by id desc limit 150) h
     join sim.charter_requests r on r.id=h.request_id
     where r.request_code like 'AV-SIM-%'
   ),'[]'::jsonb),
   'open_count',(select count(*) from sim.virtual_department_handoffs where status='open'),
   'simulation_only',true,'llm_connected',false,'operational_approval',false
 );
end $fn$;

create function public.aervelys_virtual_handoffs_sync(p_limit integer default 40)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists (
   select 1 from sim.app_user_roles u where u.user_id=auth.uid()
    and u.active and u.role in ('ceo','ops')
 ) then raise exception 'Handoff sync denied' using errcode='42501';end if;
 return sim.virtual_department_handoff_tick(p_limit);
end $fn$;

revoke all on function public.aervelys_virtual_handoffs_overview() from public,anon,authenticated;
revoke all on function public.aervelys_virtual_handoffs_sync(integer) from public,anon,authenticated;
grant execute on function public.aervelys_virtual_handoffs_overview() to authenticated;
grant execute on function public.aervelys_virtual_handoffs_sync(integer) to authenticated;
