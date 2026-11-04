-- V2.2 follow-up correction to an applied migration. Pricing remains immutable.
create or replace function public.aervelys_v2_run_office() returns jsonb
language plpgsql security definer set search_path=''
as $office$
declare u uuid:=auth.uid(); cid uuid; r sim.v2_requests%rowtype;
 a sim.v2_aircraft%rowtype; captain sim.v2_staff%rowtype;
 f sim.v2_ferry_legs%rowtype;
 charter_cost numeric; offer_price numeric; ferry_hours numeric; ferry_cost numeric;
 steps integer:=0; stage integer;
 handling_cost numeric:=ceil((450*1.12)/10)*10;
 charter_sell numeric;handling_sell numeric;position_sell numeric;
 proposed_cost numeric; q sim.v2_quotes%rowtype;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
  where user_id=u and active and role='ceo') then
  raise exception 'CEO role required to run V2 office' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null then raise exception 'Initialize airline first' using errcode='22023';end if;
 -- Transaction guard: at most 80 state steps, no background or unbounded loop.
 for stage in 1..4 loop
  for r in select * from sim.v2_requests
   where company_id=cid and status in('new','quoted','accepted','planned')
   order by created_at,id limit 20 for update skip locked loop

   if r.status='new' then
    -- Pricing recognizes the actual location and eligible crew, unlike V2.0.
    select a0.* into a from sim.v2_aircraft a0
    where a0.company_id=cid and a0.status='available'
      and a0.seats>=r.passengers
      and sim.v2_estimate_ferry_hours(a0.current_icao,r.origin_icao) is not null
      and not exists(select 1 from sim.v2_requests booked
       where booked.aircraft_id=a0.id and booked.status in('planned','ready','in_flight'))
      and not exists(select 1 from sim.v2_ferry_legs booked
       where booked.aircraft_id=a0.id and booked.status in('planned','in_flight','arrived'))
      and exists(select 1 from sim.v2_staff p where p.company_id=cid and p.active
        and p.job_role='pilot' and p.type_rating=a0.aircraft_type
        and not exists(select 1 from sim.v2_requests busy
         where busy.captain_id=p.id and busy.status in('planned','ready','in_flight'))
        and not exists(select 1 from sim.v2_ferry_legs busy
         where busy.captain_id=p.id and busy.status in('planned','in_flight','arrived')))
    order by
      ((r.estimated_hours+sim.v2_estimate_ferry_hours(a0.current_icao,r.origin_icao))
        *(a0.hourly_cost_eur+280)),a0.id
    limit 1;
    if found then
      -- Quote includes both the passenger leg AND any mandatory ferry BEFORE acceptance.
      ferry_hours:=sim.v2_estimate_ferry_hours(a.current_icao,r.origin_icao);
      ferry_cost:=case when ferry_hours=0 then 0
       else ceil(((ferry_hours*(a.hourly_cost_eur+280)+240)*1.12)/10)*10 end;
      charter_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
        (r.estimated_hours*280))*1.12/10)*10;
      charter_sell:=ceil(((charter_cost-handling_cost)*1.30)/50)*50;
      handling_sell:=ceil((handling_cost*1.30)/50)*50;
      position_sell:=case when ferry_hours=0 then 0
        else ceil((ferry_cost*1.30)/50)*50 end;
      offer_price:=charter_sell+handling_sell+position_sell;
      insert into sim.v2_quotes(company_id,request_id,aircraft_id,
       valid_until,quoted_aircraft_position,positioning_from,positioning_to,
       positioning_hours,charter_sell_eur,handling_sell_eur,
       positioning_sell_eur,total_sell_eur,charter_cost_eur,
       positioning_cost_eur,estimated_total_cost_eur)
      values(cid,r.id,a.id,now()+interval '48 hours',a.current_icao,
       case when ferry_hours>0 then a.current_icao else null end,
       case when ferry_hours>0 then r.origin_icao else null end,
       ferry_hours,charter_sell,handling_sell,position_sell,offer_price,
       charter_cost,ferry_cost,charter_cost+ferry_cost);
      update sim.v2_requests set estimated_cost_eur=charter_cost,
       quoted_eur=offer_price,status='quoted',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,'Mia Hartmann · Sales','quote_created',
        format('SIM-Angebot #1: Charter %s EUR, Handling %s EUR, Positionierung %s EUR (%s h), Gesamtpreis %s EUR. Flugzeug bleibt nach Kundenflug am Ziel; kein pauschaler Rückferry.',
         charter_sell,handling_sell,position_sell,ferry_hours,offer_price));
      steps:=steps+1;
    end if;

   elsif r.status='quoted' then
    select * into q from sim.v2_quotes where request_id=r.id
      and company_id=cid and status='offered' for update;
    if not found then
      raise exception 'Quote must exist before simulated customer decision'
       using errcode='22023';end if;
    if now()>q.valid_until then
      update sim.v2_quotes set status='expired' where id=q.id;
      update sim.v2_requests set status='declined',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,r.customer_name,'customer_quote_expired',
        'Das vorliegende SIM-Angebot ist abgelaufen. Keine automatische Preisänderung.');
    elsif q.total_sell_eur<=r.budget_eur then
      update sim.v2_quotes set status='accepted',accepted_at=now() where id=q.id;
      update sim.v2_requests set status='accepted',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,r.customer_name,'customer_accepted',
        format('SIM-Kunde akzeptiert den eingefrorenen Gesamtpreis von %s EUR inklusive ausgewiesener Positionierung. Keine stillschweigende Nachforderung.',
         q.total_sell_eur));
    else
      update sim.v2_quotes set status='declined' where id=q.id;
      update sim.v2_requests set status='declined',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,r.customer_name,'customer_declined',
        'Der Kunde lehnt den gesamten SIM-Angebotspreis wegen seines Budgets ab.');
    end if;
    steps:=steps+1;

   elsif r.status='accepted' then
    select * into q from sim.v2_quotes where request_id=r.id
      and company_id=cid and status='accepted';
    if not found or q.total_sell_eur<>r.quoted_eur then
      raise exception 'Accepted request must match its immutable SIM quote'
       using errcode='22023';end if;
    select * into f from sim.v2_ferry_legs where request_id=r.id for update;
    if found then
      -- An already started ferry cannot be re-booked. After the landing,
      -- reserve its *same* aircraft and crew for the original charter.
      if f.status='arrived' then
        select * into a from sim.v2_aircraft where id=f.aircraft_id and
         company_id=cid and status='available' and current_icao=r.origin_icao
         and seats>=r.passengers
         and not exists(select 1 from sim.v2_requests booked
          where booked.aircraft_id=f.aircraft_id and booked.status in('planned','ready','in_flight'))
         for update;
        if found then
          select * into captain from sim.v2_staff where id=f.captain_id and
           company_id=cid and active and job_role='pilot' and type_rating=a.aircraft_type
           and not exists(select 1 from sim.v2_requests booked
            where booked.captain_id=f.captain_id and booked.status in('planned','ready','in_flight'))
           for update;
          if found then
            proposed_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
              (r.estimated_hours*280))*1.12/10)*10;
            if proposed_cost+f.estimated_cost_eur>q.total_sell_eur*0.95 then
              raise exception 'Locked customer price does not cover rotated flight'
               using errcode='22023';end if;
            update sim.v2_requests set aircraft_id=a.id,captain_id=captain.id,
              estimated_cost_eur=proposed_cost,
              status='planned',updated_at=now() where id=r.id;
            update sim.v2_ferry_legs set status='linked' where id=f.id;
            insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
             values(cid,r.id,'Jonas Adler · Dispatch','flight_planned',
              format('Positionierungsflug abgeschlossen: %s und %s jetzt am Charterstart %s disponiert.',
              a.registration,captain.display_name,r.origin_icao));
            steps:=steps+1;
          end if;
        end if;
      end if;
      continue;
    end if;

    -- Prefer a jet already at the departure airport.
    select a0.* into a from sim.v2_aircraft a0
    where a0.company_id=cid and a0.status='available'
      and a0.current_icao=r.origin_icao and a0.seats>=r.passengers
      and ceil(((r.estimated_hours*a0.hourly_cost_eur)+450+
        (r.estimated_hours*280))*1.12/10)*10<=q.total_sell_eur*0.95
      and not exists(select 1 from sim.v2_requests busy
       where busy.aircraft_id=a0.id and busy.status in('planned','ready','in_flight'))
      and not exists(select 1 from sim.v2_ferry_legs busy
       where busy.aircraft_id=a0.id and busy.status in('planned','in_flight','arrived'))
      and exists(select 1 from sim.v2_staff p where p.company_id=cid and p.active
       and p.job_role='pilot' and p.type_rating=a0.aircraft_type
       and not exists(select 1 from sim.v2_requests busy
        where busy.captain_id=p.id and busy.status in('planned','ready','in_flight'))
       and not exists(select 1 from sim.v2_ferry_legs busy
        where busy.captain_id=p.id and busy.status in('planned','in_flight','arrived')))
    order by a0.hourly_cost_eur,a0.id limit 1 for update skip locked;
    if found then
      select p.* into captain from sim.v2_staff p where p.company_id=cid and
        p.active and p.job_role='pilot' and p.type_rating=a.aircraft_type
        and not exists(select 1 from sim.v2_requests busy
         where busy.captain_id=p.id and busy.status in('planned','ready','in_flight'))
        and not exists(select 1 from sim.v2_ferry_legs busy
         where busy.captain_id=p.id and busy.status in('planned','in_flight','arrived'))
        order by p.id limit 1 for update skip locked;
      if found then
        proposed_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
         (r.estimated_hours*280))*1.12/10)*10;
        update sim.v2_requests set aircraft_id=a.id,captain_id=captain.id,
         estimated_cost_eur=proposed_cost,
         status='planned',updated_at=now() where id=r.id;
        insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
          values(cid,r.id,'Jonas Adler · Dispatch','flight_planned',
           format('SIM-Dispatch: %s und %s direkt am Flughafen %s verfügbar.',
            a.registration,captain.display_name,r.origin_icao));
        steps:=steps+1;
        continue;
      end if;
    end if;

    -- Otherwise plan an explicit empty reposition leg, never teleport.
    select a0.* into a from sim.v2_aircraft a0
    where a0.company_id=cid and a0.status='available'
      and a0.current_icao<>r.origin_icao and a0.seats>=r.passengers
      and sim.v2_estimate_ferry_hours(a0.current_icao,r.origin_icao) is not null
      and not exists(select 1 from sim.v2_requests busy
       where busy.aircraft_id=a0.id and busy.status in('planned','ready','in_flight'))
      and not exists(select 1 from sim.v2_ferry_legs busy
       where busy.aircraft_id=a0.id and busy.status in('planned','in_flight','arrived'))
      and exists(select 1 from sim.v2_staff p where p.company_id=cid and p.active
       and p.job_role='pilot' and p.type_rating=a0.aircraft_type
       and not exists(select 1 from sim.v2_requests busy
        where busy.captain_id=p.id and busy.status in('planned','ready','in_flight'))
       and not exists(select 1 from sim.v2_ferry_legs busy
        where busy.captain_id=p.id and busy.status in('planned','in_flight','arrived')))
    order by sim.v2_estimate_ferry_hours(a0.current_icao,r.origin_icao)*a0.hourly_cost_eur,a0.id
    limit 1 for update skip locked;
    if found then
      select p.* into captain from sim.v2_staff p where p.company_id=cid and
        p.active and p.job_role='pilot' and p.type_rating=a.aircraft_type
        and not exists(select 1 from sim.v2_requests busy
         where busy.captain_id=p.id and busy.status in('planned','ready','in_flight'))
        and not exists(select 1 from sim.v2_ferry_legs busy
         where busy.captain_id=p.id and busy.status in('planned','in_flight','arrived'))
       order by p.id limit 1 for update skip locked;
      if found then
        ferry_hours:=sim.v2_estimate_ferry_hours(a.current_icao,r.origin_icao);
        ferry_cost:=ceil(((ferry_hours*(a.hourly_cost_eur+280)+240)*1.12)/10)*10;
        proposed_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
          (r.estimated_hours*280))*1.12/10)*10;
        if q.total_sell_eur < (proposed_cost+ferry_cost)/0.95 then
          if not exists(select 1 from sim.v2_events e
            where e.request_id=r.id and e.event_kind='reposition_cost_review') then
            insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
              values(cid,r.id,'Noah Becker · Finance','reposition_cost_review',
               'Positionierung oder Flugzeugwechsel unterschreiten die interne Mindestmarge. Eingefrorener Kundenpreis bleibt unverändert; Finance-Prüfung nötig.');
          end if;
          continue;
        end if;
        insert into sim.v2_ferry_legs(company_id,request_id,aircraft_id,captain_id,
         origin_icao,destination_icao,estimated_hours,estimated_cost_eur)
        values(cid,r.id,a.id,captain.id,a.current_icao,r.origin_icao,
         ferry_hours,ferry_cost);
        insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
         values(cid,r.id,'Jonas Adler · Dispatch','positioning_planned',
          format('Leerer Positionierungsflug %s–%s für %s mit %s: %s h, %s EUR Modellkosten. Keine Chartererlöse für diesen Leg.',
           a.current_icao,r.origin_icao,a.registration,captain.display_name,ferry_hours,ferry_cost));
        steps:=steps+1;
      end if;
    end if;

   elsif r.status='planned' then
    update sim.v2_requests set status='ready',updated_at=now() where id=r.id;
    insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
      values(cid,r.id,'Elena Weiss · Chief Pilot','sim_dispatch_ready',
       'SIM-Flug bereit: CEO darf selbst fliegen oder delegieren. Keine echte Crew-Freigabe.');
    steps:=steps+1;
   end if;
  end loop;
 end loop;
 return jsonb_build_object('processed_steps',steps,'simulation_only',true,
  'mode','deterministic_staff_rules_with_immutable_quotes','autonomous_background',false,
  'financial_bank_transactions',0);
end $office$;

