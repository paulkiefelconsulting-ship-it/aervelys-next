-- AERVELYS NEXT 2.1 — dedicated, auditable, no-revenue positioning legs.
-- Only SIM-specific objects are changed. Flight completion requires explicit CEO confirmation.
-- Airport coordinates approximate from OurAirports public-domain airport data;
-- planning-time estimates are NOT navigational or real airport fees.

create table sim.v2_airport_reference(
 icao text primary key check (icao ~ '^[A-Z]{4}$'),
 latitude_deg double precision not null check(latitude_deg between -90 and 90),
 longitude_deg double precision not null check(longitude_deg between -180 and 180)
);
insert into sim.v2_airport_reference(icao,latitude_deg,longitude_deg) values
 ('EDAZ',52.2081,13.1564),
 ('EDDB',52.3667,13.5033),
 ('EDDH',53.6304,9.9882),
 ('EDDM',48.3538,11.7861),
 ('LOWI',47.2602,11.3440),
 ('LFMN',43.6584,7.2159);
alter table sim.v2_airport_reference enable row level security;
revoke all on sim.v2_airport_reference from public,anon,authenticated;

create function sim.v2_estimate_ferry_hours(p_from text,p_to text)
returns numeric language plpgsql stable security definer set search_path=''
as $estimate$
declare
 a sim.v2_airport_reference%rowtype;
 b sim.v2_airport_reference%rowtype;
 nautical_miles double precision;
begin
 select * into a from sim.v2_airport_reference where icao=p_from;
 if not found then return null;end if;
 select * into b from sim.v2_airport_reference where icao=p_to;
 if not found then return null;end if;
 if p_from=p_to then return 0;end if;
 nautical_miles:=3440.065*acos(least(1::double precision,greatest(-1::double precision,
  sin(radians(a.latitude_deg))*sin(radians(b.latitude_deg))+
  cos(radians(a.latitude_deg))*cos(radians(b.latitude_deg))*
  cos(radians(a.longitude_deg-b.longitude_deg)))));
 return greatest(0.5::numeric,ceil(((0.30+nautical_miles/320)*4)::numeric)/4);
end $estimate$;
revoke all on function sim.v2_estimate_ferry_hours(text,text) from public,anon,authenticated;

alter table sim.v2_ledger drop constraint v2_ledger_category_check;
alter table sim.v2_ledger add constraint v2_ledger_category_check
 check(category in('charter','flight_operations','positioning'));

create table sim.v2_ferry_legs(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 request_id uuid not null unique references sim.v2_requests(id) on delete cascade,
 aircraft_id uuid not null references sim.v2_aircraft(id),
 captain_id uuid not null references sim.v2_staff(id),
 origin_icao text not null check(origin_icao ~ '^[A-Z]{4}$'),
 destination_icao text not null check(destination_icao ~ '^[A-Z]{4}$'),
 estimated_hours numeric(6,2) not null check(estimated_hours between 0.5 and 24),
 estimated_cost_eur numeric(12,2) not null check(estimated_cost_eur>0),
 pilot_mode text not null default 'virtual' check(pilot_mode in('ceo','virtual')),
 status text not null default 'planned'
  check(status in('planned','in_flight','arrived','linked')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 check(origin_icao<>destination_icao),
 check(status not in('arrived','linked') or completed_at is not null)
);
create unique index v2_active_ferry_aircraft_idx on sim.v2_ferry_legs(aircraft_id)
 where status in('planned','in_flight','arrived');
create unique index v2_active_ferry_captain_idx on sim.v2_ferry_legs(captain_id)
 where status in('planned','in_flight','arrived');
create unique index v2_active_charter_aircraft_idx on sim.v2_requests(aircraft_id)
 where status in('planned','ready','in_flight');
create unique index v2_active_charter_captain_idx on sim.v2_requests(captain_id)
 where status in('planned','ready','in_flight');
create index v2_ferry_company_idx on sim.v2_ferry_legs(company_id,status,created_at desc);
alter table sim.v2_ferry_legs enable row level security;
revoke all on sim.v2_ferry_legs from public,anon,authenticated;

create or replace function public.aervelys_v2_overview() returns jsonb
language plpgsql stable security definer set search_path=''
as $fn$
declare u uuid:=auth.uid(); cid uuid; result jsonb;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role in('ceo','ops'))
 then raise exception 'AERVELYS V2 access denied' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 return jsonb_build_object(
  'initialized',cid is not null,'simulation_only',true,
  'real_flights_modified',0,'financial_bank_transactions',0,
  'company',(select jsonb_build_object(
     'id',c.id,'name',c.name,'home_icao',c.home_icao,
     'opening_cash_eur',c.opening_cash_eur,
     'cash_eur',c.opening_cash_eur+coalesce((
        select sum(case when l.kind='revenue' then l.amount_eur else -l.amount_eur end)
        from sim.v2_ledger l where l.company_id=c.id),0)
    )from sim.v2_companies c where c.id=cid),
  'staff',coalesce((select jsonb_agg(jsonb_build_object(
     'id',s.id,'name',s.display_name,'role',s.job_role,
     'rating',s.type_rating,'salary_eur',s.monthly_salary_eur,'active',s.active)
     order by s.job_role,s.display_name)
    from sim.v2_staff s where s.company_id=cid),'[]'::jsonb),
  'aircraft',coalesce((select jsonb_agg(jsonb_build_object(
     'id',a.id,'registration',a.registration,'type',a.aircraft_type,
     'seats',a.seats,'current_icao',a.current_icao,
     'home_icao',a.home_icao,'hourly_cost_eur',a.hourly_cost_eur,
     'status',a.status)order by a.registration)
    from sim.v2_aircraft a where a.company_id=cid),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(jsonb_build_object(
     'id',r.id,'code',r.request_code,'customer',r.customer_name,
     'reason',r.customer_reason,'origin',r.origin_icao,
     'destination',r.destination_icao,'departure_at',r.departure_at,
     'pax',r.passengers,'hours',r.estimated_hours,
     'budget_eur',r.budget_eur,'status',r.status,
     'quote_eur',r.quoted_eur,'cost_eur',r.estimated_cost_eur,
     'aircraft_registration',a.registration,
     'captain_name',s.display_name,'pilot_mode',r.pilot_mode,
     'completed_at',r.completed_at)order by r.created_at desc,r.request_code desc)
    from sim.v2_requests r left join sim.v2_aircraft a on a.id=r.aircraft_id
     left join sim.v2_staff s on s.id=r.captain_id
    where r.company_id=cid),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'request_id',e.request_id,'actor',e.actor_name,
    'kind',e.event_kind,'note',e.note,'at',e.occurred_at)
    order by e.id desc)
   from (select * from sim.v2_events where company_id=cid order by id desc limit 60)e),'[]'::jsonb),
  'ferries',coalesce((select jsonb_agg(jsonb_build_object(
    'id',f.id,'request_id',f.request_id,'request_code',r.request_code,
    'aircraft_registration',a.registration,'aircraft_type',a.aircraft_type,
    'captain_name',p.display_name,'origin',f.origin_icao,
    'destination',f.destination_icao,'hours',f.estimated_hours,
    'cost_eur',f.estimated_cost_eur,'pilot_mode',f.pilot_mode,
    'status',f.status,'completed_at',f.completed_at)
    order by f.created_at desc)
   from sim.v2_ferry_legs f
    join sim.v2_requests r on r.id=f.request_id
    join sim.v2_aircraft a on a.id=f.aircraft_id
    join sim.v2_staff p on p.id=f.captain_id
   where f.company_id=cid),'[]'::jsonb),
  'ledger',coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'request_id',l.request_id,'kind',l.kind,
    'category',l.category,'amount_eur',l.amount_eur,'at',l.recorded_at)
    order by l.recorded_at desc)
   from (select * from sim.v2_ledger where company_id=cid order by recorded_at desc limit 60)l),'[]'::jsonb)
 );
end $fn$;


create or replace function public.aervelys_v2_run_office() returns jsonb
language plpgsql security definer set search_path=''
as $office$
declare u uuid:=auth.uid(); cid uuid; r sim.v2_requests%rowtype;
 a sim.v2_aircraft%rowtype; captain sim.v2_staff%rowtype;
 f sim.v2_ferry_legs%rowtype;
 charter_cost numeric; offer_price numeric; ferry_hours numeric; ferry_cost numeric;
 steps integer:=0; stage integer;
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
      ferry_hours:=sim.v2_estimate_ferry_hours(a.current_icao,r.origin_icao);
      ferry_cost:=case when ferry_hours=0 then 0
       else ceil(((ferry_hours*(a.hourly_cost_eur+280)+240)*1.12)/10)*10 end;
      charter_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
        (r.estimated_hours*280))*1.12/10)*10;
      offer_price:=ceil(((charter_cost+ferry_cost)*1.30)/50)*50;
      update sim.v2_requests set estimated_cost_eur=charter_cost,
       quoted_eur=offer_price,status='quoted',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,'Mia Hartmann · Sales','quote_created',
        format('SIM-Angebot %s EUR, Charterkosten %s EUR, geschätzte Positionierung %s h/%s EUR. Keine geprüften Flughafengebühren.',
          offer_price,charter_cost,ferry_hours,ferry_cost));
      steps:=steps+1;
    end if;

   elsif r.status='quoted' then
    if r.quoted_eur<=r.budget_eur then
      update sim.v2_requests set status='accepted',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,r.customer_name,'customer_accepted',
        'Fiktive Kundenzusage auf Grundlage des angebotenen Preises.');
    else
      update sim.v2_requests set status='declined',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,r.customer_name,'customer_declined',
        'Budget der simulierten Anfrage liegt unter dem Angebot.');
    end if;
    steps:=steps+1;

   elsif r.status='accepted' then
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
            update sim.v2_requests set aircraft_id=a.id,captain_id=captain.id,
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
        update sim.v2_requests set aircraft_id=a.id,captain_id=captain.id,
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
        if r.quoted_eur < r.estimated_cost_eur + ferry_cost then
          if not exists(select 1 from sim.v2_events e
            where e.request_id=r.id and e.event_kind='reposition_cost_review') then
            insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
              values(cid,r.id,'Noah Becker · Finance','reposition_cost_review',
               'Positionierung wäre teurer als die Deckung durch das Kundenangebot. Dispatch zurückgestellt.');
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
  'mode','deterministic_staff_rules_with_positioning','autonomous_background',false,
  'financial_bank_transactions',0);
end $office$;

create function public.aervelys_v2_choose_ferry_pilot(p_ferry_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;f sim.v2_ferry_legs%rowtype;
begin
 if u is null or not exists(select 1 from sim.app_user_roles where user_id=u
  and active and role='ceo') then raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if p_mode not in('ceo','virtual') or p_mode is null then
  raise exception 'Unknown positioning pilot mode' using errcode='22023';end if;
 select * into f from sim.v2_ferry_legs where id=p_ferry_id and company_id=cid
  and status='planned' for update;
 if not found then raise exception 'Only planned positioning may be assigned'
  using errcode='22023';end if;
 update sim.v2_ferry_legs set pilot_mode=p_mode where id=f.id;
 insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
 values(cid,f.request_id,'CEO','positioning_pilot_selected',
   case when p_mode='ceo' then 'CEO übernimmt leeren Positionierungsflug selbst (SIM-only).'
   else 'Positionierungsflug wurde dem fiktiven Piloten zugeordnet.' end);
 return jsonb_build_object('assigned',true,'simulation_only',true,
  'pilot_mode',p_mode,'type_rating_verified',false);
end $fn$;

create function public.aervelys_v2_ferry_action(p_ferry_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;f sim.v2_ferry_legs%rowtype;
 a sim.v2_aircraft%rowtype;req sim.v2_requests%rowtype;
begin
 if u is null or not exists(select 1 from sim.app_user_roles where user_id=u
  and active and role='ceo') then raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 select * into f from sim.v2_ferry_legs where id=p_ferry_id and company_id=cid for update;
 if not found then raise exception 'Positioning leg not found' using errcode='22023';end if;
 select * into a from sim.v2_aircraft where id=f.aircraft_id and company_id=cid for update;
 select * into req from sim.v2_requests where id=f.request_id and company_id=cid for update;
 if req.status<>'accepted' then
  raise exception 'Parent charter must still be accepted awaiting positioning'
   using errcode='22023';end if;
 if p_action='start' then
  if f.status<>'planned' or a.current_icao<>f.origin_icao or a.status<>'available' then
    raise exception 'Positioning flight is not ready at origin' using errcode='22023';end if;
  update sim.v2_ferry_legs set status='in_flight' where id=f.id;
  insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
  values(cid,f.request_id,case when f.pilot_mode='ceo' then 'CEO' else 'Virtual Captain' end,
    'positioning_started','Leerflug im SIM-Betrieb manuell begonnen; keine MSFS-Evidenz.');
 elsif p_action='complete' then
  if f.status<>'in_flight' or a.current_icao<>f.origin_icao then
   raise exception 'Only a started positioning leg may arrive' using errcode='22023';end if;
  update sim.v2_ferry_legs set status='arrived',completed_at=now() where id=f.id;
  update sim.v2_aircraft set current_icao=f.destination_icao where id=f.aircraft_id;
  insert into sim.v2_ledger(company_id,request_id,kind,category,amount_eur)
  values(cid,f.request_id,'cost','positioning',f.estimated_cost_eur);
  insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
  values(cid,f.request_id,'Jonas Adler · Dispatch','positioning_arrived',
   format('SIM-Positionierung %s–%s abgeschlossen. %s EUR geschätzte Kosten verbucht. Der Charter darf jetzt disponiert werden.',
    f.origin_icao,f.destination_icao,f.estimated_cost_eur));
 else raise exception 'Unsupported positioning action' using errcode='22023';end if;
 return jsonb_build_object('simulation_only',true,'status',
 (select status from sim.v2_ferry_legs where id=f.id),
 'real_flights_modified',0,'financial_bank_transactions',0,'cloud_telemetry_verified',false);
end $fn$;

revoke all on function public.aervelys_v2_choose_ferry_pilot(uuid,text)
 from public,anon,authenticated;
grant execute on function public.aervelys_v2_choose_ferry_pilot(uuid,text) to authenticated;
revoke all on function public.aervelys_v2_ferry_action(uuid,text)
 from public,anon,authenticated;
grant execute on function public.aervelys_v2_ferry_action(uuid,text) to authenticated;
