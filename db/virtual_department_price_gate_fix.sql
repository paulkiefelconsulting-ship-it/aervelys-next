-- A recorded SIM proposal advances the sales handoff even before customer feedback.
-- last_offer_price_eur can be NULL until a later simulated customer reaction.
create or replace function sim.virtual_department_handoff_tick(p_limit integer default 40)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 rec record; prev_id bigint; prev_stage text; prev_agent text; prev_status text;
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
      exists(select 1 from sim.sim_customer_price_proposals sp
             where sp.request_id=c.request_id and sp.status in('presented','responded')) as price_recorded,
      exists(select 1 from sim.sim_customer_messages m
             where m.request_id=c.request_id and m.message_kind='sales_agent_reply') as sales_replied,
      p.aircraft_id,p.suggested_pic_id,p.suggested_sic_id,p.status as plan_status,
      d.request_id as dispatch_id
   from sim.sim_customer_cases c
   join sim.charter_requests r on r.id=c.request_id
   left join sim.virtual_agent_fleet_plans p on p.request_id=c.request_id
   left join sim.dispatch_planning_drafts d on d.request_id=c.request_id
   left join lateral (select max(h.last_evaluated_at) as last_seen from sim.virtual_department_handoffs h where h.request_id=c.request_id) hlast on true
   where r.request_code like 'AV-SIM-%'
   order by coalesce(hlast.last_seen,timestamptz '1970-01-01') asc,c.updated_at desc,c.request_id
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
   elsif not rec.price_recorded then
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
   prev_id:=null;prev_stage:=null;prev_agent:=null;prev_status:=null;
   select h.id,h.stage,h.to_agent,h.status into prev_id,prev_stage,prev_agent,prev_status
     from sim.virtual_department_handoffs h where h.request_id=rec.request_id
     order by h.id desc limit 1;
   if prev_id is null or prev_stage is distinct from next_stage then
     if prev_id is not null and prev_status='open' then
       update sim.virtual_department_handoffs
       set status='superseded',completed_at=now()
       where id=prev_id and status='open';
       changed:=changed+1;
     end if;
     insert into sim.virtual_department_handoffs
       (request_id,stage,from_agent,to_agent,subject,body,status,completed_at)
     values(rec.request_id,next_stage,coalesce(prev_agent,'system'),next_agent,
            rec.request_code||' · '||next_subject,next_body,
            case when next_stage='customer_closed' then 'closed' else 'open' end,
            case when next_stage='customer_closed' then now() else null end);
     inserted:=inserted+1;
   else
     update sim.virtual_department_handoffs set last_evaluated_at=now() where id=prev_id;
   end if;
 end loop;
 return jsonb_build_object('examined',visited,'new_handoffs',inserted,
    'closed_previous',changed,'simulation_only',true,'operational_changes',0);
end $fn$;


