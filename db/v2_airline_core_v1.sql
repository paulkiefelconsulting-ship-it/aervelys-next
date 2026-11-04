-- AERVELYS NEXT 2.0 / isolated and private business-airline foundation.
-- SIMULATION ONLY. Existing NEXT v1 tables, devices, logbooks and real flights remain unchanged.
create table sim.v2_companies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null default 'AERVELYS',
 home_icao text not null default 'EDAZ' check(home_icao~'^[A-Z]{4}$'),
 opening_cash_eur numeric(14,2) not null default 180000 check(opening_cash_eur>=0),
 created_at timestamptz not null default now()
);
create table sim.v2_staff(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 display_name text not null check(length(display_name) between 2 and 80),
 job_role text not null check(job_role in('sales','dispatch','chief_pilot','finance','pilot')),
 type_rating text,
 monthly_salary_eur numeric(12,2) not null check(monthly_salary_eur>=0),
 active boolean not null default true
);
create table sim.v2_aircraft(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 registration text not null check(length(registration) between 4 and 20),
 aircraft_type text not null,
 seats integer not null check(seats between 1 and 30),
 home_icao text not null check(home_icao~'^[A-Z]{4}$'),
 current_icao text not null check(current_icao~'^[A-Z]{4}$'),
 hourly_cost_eur numeric(12,2) not null check(hourly_cost_eur>=100),
 status text not null default 'available' check(status in ('available','maintenance')),
 unique(company_id,registration)
);
create table sim.v2_requests(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 request_code text not null unique,
 customer_name text not null check(length(customer_name) between 2 and 90),
 customer_reason text not null,
 origin_icao text not null check(origin_icao~'^[A-Z]{4}$'),
 destination_icao text not null check(destination_icao~'^[A-Z]{4}$'),
 departure_at timestamptz not null,
 passengers integer not null check(passengers between 1 and 30),
 estimated_hours numeric(6,2) not null check(estimated_hours between .5 and 24),
 budget_eur numeric(12,2) not null check(budget_eur>0),
 status text not null default 'new' check(status in('new','quoted','accepted','declined','planned','ready','in_flight','completed')),
 quoted_eur numeric(12,2) check(quoted_eur>=0),
 estimated_cost_eur numeric(12,2) check(estimated_cost_eur>=0),
 aircraft_id uuid references sim.v2_aircraft(id),
 captain_id uuid references sim.v2_staff(id),
 pilot_mode text not null default 'virtual' check(pilot_mode in('virtual','ceo')),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(origin_icao<>destination_icao),
 check(status<>'completed' or completed_at is not null)
);
create index v2_requests_company_status_idx on sim.v2_requests(company_id,status,created_at desc);
create table sim.v2_events(
 id bigint generated always as identity primary key,
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 request_id uuid references sim.v2_requests(id) on delete cascade,
 actor_name text not null,
 event_kind text not null,
 note text not null,
 occurred_at timestamptz not null default now()
);
create index v2_events_company_time_idx on sim.v2_events(company_id,id desc);
create table sim.v2_ledger(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 request_id uuid not null references sim.v2_requests(id) on delete cascade,
 kind text not null check(kind in('revenue','cost')),
 category text not null check(category in('charter','flight_operations')),
 amount_eur numeric(12,2) not null check(amount_eur>0),
 recorded_at timestamptz not null default now(),
 unique(request_id,kind,category)
);
create index v2_ledger_company_idx on sim.v2_ledger(company_id,recorded_at desc);
alter table sim.v2_companies enable row level security;
alter table sim.v2_staff enable row level security;
alter table sim.v2_aircraft enable row level security;
alter table sim.v2_requests enable row level security;
alter table sim.v2_events enable row level security;
alter table sim.v2_ledger enable row level security;
revoke all on sim.v2_companies,sim.v2_staff,sim.v2_aircraft,
 sim.v2_requests,sim.v2_events,sim.v2_ledger from public,anon,authenticated;
revoke all on sequence sim.v2_events_id_seq from public,anon,authenticated;

create function public.aervelys_v2_overview() returns jsonb
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
  'ledger',coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'request_id',l.request_id,'kind',l.kind,
    'category',l.category,'amount_eur',l.amount_eur,'at',l.recorded_at)
    order by l.recorded_at desc)
   from (select * from sim.v2_ledger where company_id=cid order by recorded_at desc limit 60)l),'[]'::jsonb)
 );
end $fn$;

create function public.aervelys_v2_initialize() returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid(); cid uuid; created boolean:=false;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')
 then raise exception 'CEO role required for airline initialization' using errcode='42501';end if;
 insert into sim.v2_companies(owner_id,name)
 values(u,'AERVELYS')on conflict(owner_id)do nothing
 returning id into cid;
 if cid is not null then
  created:=true;
  insert into sim.v2_staff(company_id,display_name,job_role,type_rating,monthly_salary_eur)
  values
   (cid,'Mia Hartmann','sales',null,3900),
   (cid,'Jonas Adler','dispatch',null,4600),
   (cid,'Elena Weiss','chief_pilot',null,5400),
   (cid,'Noah Becker','finance',null,4200),
   (cid,'Alex Berger','pilot','Embraer Phenom 300E',5200),
   (cid,'Leonie Brandt','pilot','Cessna Citation CJ4',5100);
  insert into sim.v2_aircraft(company_id,registration,aircraft_type,seats,home_icao,current_icao,hourly_cost_eur)
  values
   (cid,'AVF-P300','Embraer Phenom 300E',8,'EDAZ','EDAZ',1850),
   (cid,'AVF-CJ4','Cessna Citation CJ4',7,'EDAZ','EDAZ',1450);
  insert into sim.v2_events(company_id,actor_name,event_kind,note)
   values(cid,'System','airline_initialized',
    'AERVELYS V2 gegründet: virtuelles Personal und zwei simulierte Flugzeuge eingerichtet. Anfangskapital ist eine Spielannahme.');
 else select id into cid from sim.v2_companies where owner_id=u;end if;
 return jsonb_build_object('initialized',true,'created',created,'company_id',cid,
  'simulation_only',true,'financial_bank_transactions',0);
end $fn$;

create function public.aervelys_v2_generate_inquiry() returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid(); cid uuid; counter integer; rid uuid;
 code text; customer text; reason text; dest text; duration numeric; pax integer; budget numeric;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')
 then raise exception 'CEO role required for fictional client generation' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null then raise exception 'Initialize V2 first' using errcode='22023';end if;
 select count(*) into counter from sim.v2_requests where company_id=cid;
 if counter>=200 then raise exception 'V2 pilot project has a 200-case safety cap' using errcode='22023';end if;
 dest:=case counter%4 when 0 then 'EDDM' when 1 then 'EDDH'
    when 2 then 'LOWI' else 'LFMN' end;
 duration:=case counter%4 when 0 then 1.4 when 1 then 1.1
    when 2 then 1.5 else 2.2 end;
 pax:=case counter%4 when 0 then 4 when 1 then 3 when 2 then 6 else 5 end;
 customer:=case counter%4 when 0 then 'Nordstern Consulting'
   when 1 then 'Hansa Private Office' when 2 then 'Alpine Advisory'
   else 'Azure Family Travel' end;
 reason:=case counter%4 when 0 then 'Vorstandstermin'
   when 1 then 'Geschäftsreise' when 2 then 'Standortbesichtigung'
   else 'Privatreise' end;
 budget:=case counter%4 when 0 then 6200 when 1 then 2500
   when 2 then 6600 else 8900 end;
 code:='AV2-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into sim.v2_requests(company_id,request_code,customer_name,customer_reason,
  origin_icao,destination_icao,departure_at,passengers,estimated_hours,budget_eur)
 values(cid,code,customer,reason,'EDAZ',dest,
  now()+make_interval(days=>2+counter%5,hours=>counter%6),
  pax,duration,budget) returning id into rid;
 insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
  values(cid,rid,customer,'inquiry_received',
   format('Fiktive Kundenanfrage: EDAZ–%s, %s PAX, Budget %s EUR.',dest,pax,budget));
 return jsonb_build_object('created',true,'request_id',rid,'code',code,
  'simulation_only',true,'generated_by','deterministic_scenario');
end $fn$;

create function public.aervelys_v2_run_office() returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid(); cid uuid; r sim.v2_requests%rowtype;
 a sim.v2_aircraft%rowtype; captain sim.v2_staff%rowtype;
 floor_cost numeric; price numeric; transitions integer:=0; step integer;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')
 then raise exception 'CEO role required to run virtual office' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null then raise exception 'Initialize V2 first' using errcode='22023';end if;
 -- Each call runs a bounded, deterministic series of simulated employee decisions.
 for step in 1..4 loop
  for r in select * from sim.v2_requests where company_id=cid and
    status in('new','quoted','accepted','planned')
   order by created_at,id limit 20 for update skip locked loop
   if r.status='new' then
    select * into a from sim.v2_aircraft where company_id=cid and
      status='available' and seats>=r.passengers
     order by hourly_cost_eur,id limit 1;
    if found then
     floor_cost:=ceil(((r.estimated_hours*a.hourly_cost_eur)+450+
                       (r.estimated_hours*280))*1.12/10)*10;
     price:=ceil(floor_cost*1.30/50)*50;
     update sim.v2_requests set estimated_cost_eur=floor_cost,
       quoted_eur=price,status='quoted',updated_at=now() where id=r.id;
     insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
      values(cid,r.id,'Mia Hartmann · Sales','quote_created',
       format('Unverbindliches SIM-Angebot: %s EUR bei modellierten Kosten %s EUR; Flughafen-/Handlingpreise sind Annahmen.',price,floor_cost));
     transitions:=transitions+1;
    end if;
   elsif r.status='quoted' then
    if r.quoted_eur<=r.budget_eur then
     update sim.v2_requests set status='accepted',updated_at=now() where id=r.id;
     insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
      values(cid,r.id,r.customer_name,'customer_accepted',
       'Fiktive Kundenzusage innerhalb des angegebenen Budgets.');
    else
     update sim.v2_requests set status='declined',updated_at=now() where id=r.id;
     insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
      values(cid,r.id,r.customer_name,'customer_declined',
       'Fiktive Absage: Angebot überschreitet das simulierte Budget.');
    end if;
    transitions:=transitions+1;
   elsif r.status='accepted' then
    -- No imaginary aircraft teleportation or double-booking.
    select a0.* into a from sim.v2_aircraft a0
     where a0.company_id=cid and a0.status='available'
       and a0.current_icao=r.origin_icao and a0.seats>=r.passengers
       and not exists(select 1 from sim.v2_requests busy
        where busy.aircraft_id=a0.id and busy.status in('planned','ready','in_flight'))
     order by a0.hourly_cost_eur,a0.id limit 1 for update skip locked;
    if found then
     select p.* into captain from sim.v2_staff p
      where p.company_id=cid and p.active and p.job_role='pilot'
       and p.type_rating=a.aircraft_type
       and not exists(select 1 from sim.v2_requests occupied
        where occupied.captain_id=p.id
        and occupied.status in('planned','ready','in_flight'))
      order by p.id limit 1;
     if found then
      update sim.v2_requests set aircraft_id=a.id,captain_id=captain.id,
        status='planned',updated_at=now() where id=r.id;
      insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
       values(cid,r.id,'Jonas Adler · Dispatch','flight_planned',
        format('Simulierter Dispatch: %s mit %s, %s. Keine echte Crew-/Flugfreigabe.',
         a.registration,captain.display_name,r.origin_icao));
      transitions:=transitions+1;
     end if;
    end if;
   elsif r.status='planned' then
    update sim.v2_requests set status='ready',updated_at=now() where id=r.id;
    insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
     values(cid,r.id,'Elena Weiss · Chief Pilot','sim_dispatch_ready',
      'SIM-Planung bereit. Pilot kann vom CEO übernommen oder virtuell geflogen werden; echte Voraussetzungen nicht geprüft.');
    transitions:=transitions+1;
   end if;
  end loop;
 end loop;
 return jsonb_build_object('processed_steps',transitions,'simulation_only',true,
  'mode','deterministic_staff_rules','autonomous_background',false,
  'financial_bank_transactions',0);
end $fn$;

create function public.aervelys_v2_choose_pilot(p_request_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;r sim.v2_requests%rowtype;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')
 then raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if p_mode not in('virtual','ceo') or p_mode is null then
  raise exception 'Invalid pilot option' using errcode='22023';end if;
 select * into r from sim.v2_requests where id=p_request_id
  and company_id=cid and status='ready' for update;
 if not found then raise exception 'Only ready V2 flights can be assigned'
  using errcode='22023';end if;
 update sim.v2_requests set pilot_mode=p_mode,updated_at=now() where id=r.id;
 insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
 values(cid,r.id,'CEO','pilot_selected',
  case p_mode when 'ceo' then
   'CEO übernimmt den virtuellen Flug. Simulator-Training und Type-Rating sind noch nicht verifiziert.'
   else 'Fiktiver Pilot übernimmt den Flug im simulierten Betrieb.' end);
 return jsonb_build_object('assigned',true,'pilot_mode',p_mode,
  'simulation_only',true,'type_rating_verified',false);
end $fn$;

create function public.aervelys_v2_flight_action(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;r sim.v2_requests%rowtype;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')
 then raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 select * into r from sim.v2_requests where id=p_request_id
 and company_id=cid for update;
 if not found then raise exception 'V2 flight not found' using errcode='22023';end if;
 if p_action='start' then
  if r.status<>'ready' or r.aircraft_id is null or r.captain_id is null
   then raise exception 'Flight must be ready and dispatched' using errcode='22023';end if;
  -- Ensure the aircraft remains reserved only by this flight.
  if exists(select 1 from sim.v2_requests other where other.id<>r.id
    and other.aircraft_id=r.aircraft_id and other.status in('ready','planned','in_flight'))
   then raise exception 'Aircraft is already booked' using errcode='23505';end if;
  update sim.v2_requests set status='in_flight',updated_at=now() where id=r.id;
  insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
   values(cid,r.id,case r.pilot_mode when 'ceo' then 'CEO' else 'Virtual Captain' end,
    'flight_started','SIM-Flug manuell gestartet. Keine echte MSFS-Telemetrie oder Freigabe bestätigt.');
 elsif p_action='complete' then
  if r.status<>'in_flight' or r.quoted_eur is null or r.estimated_cost_eur is null
   then raise exception 'Only an in-progress priced SIM flight may be completed'
    using errcode='22023';end if;
  update sim.v2_requests set status='completed',completed_at=now(),updated_at=now()
   where id=r.id;
  update sim.v2_aircraft set current_icao=r.destination_icao
   where id=r.aircraft_id and company_id=cid;
  insert into sim.v2_ledger(company_id,request_id,kind,category,amount_eur)
    values(cid,r.id,'revenue','charter',r.quoted_eur),
          (cid,r.id,'cost','flight_operations',r.estimated_cost_eur);
  insert into sim.v2_events(company_id,request_id,actor_name,event_kind,note)
   values(cid,r.id,'Noah Becker · Finance','sim_flight_settled',
    format('SIM-Rechnung %s EUR und modellierte Kosten %s EUR erfasst; keine Banktransaktion oder reale Flugbestätigung.',
     r.quoted_eur,r.estimated_cost_eur));
 else raise exception 'Unsupported V2 flight action' using errcode='22023';end if;
 return jsonb_build_object('status',
   (select status from sim.v2_requests where id=r.id),
   'simulation_only',true,'real_flights_modified',0,'financial_bank_transactions',0,
   'cloud_telemetry_verified',false);
end $fn$;

revoke all on function public.aervelys_v2_overview() from public,anon,authenticated;
revoke all on function public.aervelys_v2_initialize() from public,anon,authenticated;
revoke all on function public.aervelys_v2_generate_inquiry() from public,anon,authenticated;
revoke all on function public.aervelys_v2_run_office() from public,anon,authenticated;
revoke all on function public.aervelys_v2_choose_pilot(uuid,text) from public,anon,authenticated;
revoke all on function public.aervelys_v2_flight_action(uuid,text) from public,anon,authenticated;
grant execute on function public.aervelys_v2_overview() to authenticated;
grant execute on function public.aervelys_v2_initialize() to authenticated;
grant execute on function public.aervelys_v2_generate_inquiry() to authenticated;
grant execute on function public.aervelys_v2_run_office() to authenticated;
grant execute on function public.aervelys_v2_choose_pilot(uuid,text) to authenticated;
grant execute on function public.aervelys_v2_flight_action(uuid,text) to authenticated;
