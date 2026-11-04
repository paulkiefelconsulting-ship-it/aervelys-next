-- AERVELYS V2 operations foundation. Existing workforce and fleet are source-of-truth.
-- These are SIM-only planning records. No real duty certification, property purchase or payments.

create table sim.v2_training_records(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 person_id uuid not null references sim.people(id),
 title text not null check(length(trim(title)) between 4 and 160),
 category text not null check(category in('type_rating','recurrent','safety','service','leadership','other')),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 cost_eur numeric(12,2) check(cost_eur is null or cost_eur>=0),
 status text not null default 'planned'
   check(status in('planned','in_progress','completed','cancelled')),
 notes text not null default '' check(length(notes)<=1500),
 created_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index v2_training_person_dates on sim.v2_training_records(company_id,person_id,starts_at);
alter table sim.v2_training_records enable row level security;
revoke all on sim.v2_training_records from public,anon,authenticated;

create table sim.v2_duty_roster(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 person_id uuid not null references sim.people(id),
 duty_kind text not null check(duty_kind in('duty','standby','leave','training','rest')),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'draft' check(status in('draft','published','cancelled')),
 base_icao text check(base_icao is null or base_icao ~ '^[A-Z]{4}$'),
 notes text not null default '' check(length(notes)<=1500),
 created_at timestamptz not null default now(),
 check(ends_at>starts_at),
 check(ends_at-starts_at<=interval '31 days')
);
create index v2_roster_person_dates on sim.v2_duty_roster(company_id,person_id,starts_at);
alter table sim.v2_duty_roster enable row level security;
revoke all on sim.v2_duty_roster from public,anon,authenticated;

create table sim.v2_facility_projects(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 title text not null check(length(trim(title)) between 3 and 160),
 facility_kind text not null check(facility_kind in(
  'leased_office','leased_parking','hangar','office_extension','terminal','land','other')),
 status text not null default 'idea' check(status in(
  'leased','idea','assessment','approved_sim','construction','operational','cancelled')),
 site_name text not null default 'Standort noch zu prüfen' check(length(site_name)<=160),
 monthly_rent_eur numeric(12,2) check(monthly_rent_eur is null or monthly_rent_eur>=0),
 planned_capex_eur numeric(14,2) check(planned_capex_eur is null or planned_capex_eur>=0),
 notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now(),
 unique(company_id,title)
);
alter table sim.v2_facility_projects enable row level security;
revoke all on sim.v2_facility_projects from public,anon,authenticated;

-- Existing user company is preserved, and its actual lease amounts remain unknown.
insert into sim.v2_facility_projects(company_id,title,facility_kind,status,notes)
 select c.id,'Bestehende Mieträume','leased_office','leased',
 'Mieträume laut CEO vorhanden; Fläche, Standortdetails, Vertragsdauer und monatliche Miete nicht bestätigt.'
 from sim.v2_companies c on conflict(company_id,title)do nothing;
insert into sim.v2_facility_projects(company_id,title,facility_kind,status,notes)
 select c.id,'Bestehende Mietstellplätze','leased_parking','leased',
 'Gemietete Flugzeugstellplätze laut CEO vorhanden; Anzahl und Kosten noch nicht bestätigt.'
 from sim.v2_companies c on conflict(company_id,title)do nothing;

create function public.aervelys_v2_ops_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role in('ceo','ops')) then
  raise exception 'AERVELYS V2 operations access denied' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 return jsonb_build_object(
  'simulation_only',true,'company_exists',cid is not null,
  'legacy_roster_integrated',false,'legacy_dispatch_integrated',false,
  'real_crew_qualifications_verified',false,'property_purchase_executed',false,
  'aircraft',coalesce((select jsonb_agg(jsonb_build_object(
     'id',a.id,'registration',a.registration,'type',a.aircraft_type,
     'home',a.home_icao,'location',a.current_icao,
     'operational_status',a.operational_status,
     'charter_released',false,
     'charter_release_note',case when a.aircraft_type='Embraer Phenom 300E'
      then 'Explizit nicht für Charteraufträge freigegeben'
      else 'Bestandsflotte im Onboarding – V2 Freigabeprüfung und Übernahme noch offen' end)
   order by a.registration)from sim.aircraft a),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object(
     'id',p.id,'name',p.full_name,'department',p.department,
     'role',p.role,'pilot_role',p.pilot_role,'active',p.active,
     'monthly_salary_eur',p.monthly_gross_eur,
     'qualifications_verified',coalesce((
       select bool_or(q.verified and
        (q.valid_until is null or q.valid_until>=current_date))
       from sim.pilot_qualifications q where q.person_id=p.id),false))
    order by p.department,p.full_name)
   from sim.people p),'[]'::jsonb),
  'training',coalesce((select jsonb_agg(jsonb_build_object(
     'id',t.id,'person_id',t.person_id,'title',t.title,
     'category',t.category,'start',t.starts_at,'end',t.ends_at,
     'cost_eur',t.cost_eur,'status',t.status,'notes',t.notes)
     order by t.starts_at desc)
    from (select * from sim.v2_training_records where company_id=cid
      order by starts_at desc limit 100)t),'[]'::jsonb),
  'roster',coalesce((select jsonb_agg(jsonb_build_object(
     'id',d.id,'person_id',d.person_id,'kind',d.duty_kind,
     'start',d.starts_at,'end',d.ends_at,'status',d.status,
     'base',d.base_icao,'notes',d.notes)
     order by d.starts_at)
    from (select * from sim.v2_duty_roster where company_id=cid
      order by starts_at limit 400)d),'[]'::jsonb),
  'facilities',coalesce((select jsonb_agg(jsonb_build_object(
     'id',f.id,'title',f.title,'kind',f.facility_kind,
     'status',f.status,'site',f.site_name,
     'monthly_rent_eur',f.monthly_rent_eur,
     'planned_capex_eur',f.planned_capex_eur,'notes',f.notes)
    order by f.created_at)
    from sim.v2_facility_projects f where company_id=cid),'[]'::jsonb),
  'active_v2_fleet',coalesce((select jsonb_agg(jsonb_build_object(
     'registration',a.registration,'type',a.aircraft_type,
     'charter_release_status',a.charter_release_status,
     'hold_reason',a.charter_hold_reason)
    order by a.registration)
    from sim.v2_aircraft a where a.company_id=cid),'[]'::jsonb)
 );
end $fn$;

create function public.aervelys_v2_training_add(
 p_person_id uuid,p_title text,p_category text,p_start timestamptz,
 p_end timestamptz,p_cost numeric default null,p_notes text default ''
)returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;result_id uuid;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')then
  raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null or not exists(select 1 from sim.people
   where id=p_person_id and active)then
  raise exception 'Active existing employee required' using errcode='22023';end if;
 if p_start is null or p_end is null or p_end<=p_start
  or p_start<now()-interval '7 days' or p_start>now()+interval '18 months'
  or p_end>p_start+interval '90 days' then
  raise exception 'Training dates outside planning horizon' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtext('aervelys_v2_roster'),hashtext(p_person_id::text));
 if exists(select 1 from sim.v2_duty_roster d where d.company_id=cid
  and d.person_id=p_person_id and d.status<>'cancelled'
  and d.starts_at<p_end and d.ends_at>p_start)then
   raise exception 'Training conflicts with existing duty/standby/leave/rest'
    using errcode='22023';end if;
 insert into sim.v2_training_records(company_id,person_id,title,category,
  starts_at,ends_at,cost_eur,notes)
 values(cid,p_person_id,p_title,p_category,p_start,p_end,p_cost,coalesce(p_notes,''))
 returning id into result_id;
 return jsonb_build_object('created',true,'id',result_id,
 'sim_training_only',true,'type_rating_automatically_granted',false);
end $fn$;

create function public.aervelys_v2_duty_add(
 p_person_id uuid,p_kind text,p_start timestamptz,p_end timestamptz,
 p_base text default null,p_notes text default ''
)returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;result_id uuid;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
    where user_id=u and active and role='ceo')then
  raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null or not exists(select 1 from sim.people
   where id=p_person_id and active)then
  raise exception 'Active existing employee required' using errcode='22023';end if;
 if p_start is null or p_end is null or p_end<=p_start
  or p_start<now()-interval '7 days'
  or p_start>now()+interval '18 months'
  or p_end-p_start>interval '31 days' then
  raise exception 'Duty dates outside planning horizon' using errcode='22023';end if;
 -- Serialize this employee's creation to prevent overlapping assignments.
 perform pg_advisory_xact_lock(hashtext('aervelys_v2_roster'),hashtext(p_person_id::text));
 if exists(select 1 from sim.v2_duty_roster d
  where d.company_id=cid and d.person_id=p_person_id and
   d.status<>'cancelled' and d.starts_at<p_end and d.ends_at>p_start)then
  raise exception 'Existing shift, standby, leave or rest overlaps'
   using errcode='22023';end if;
 if exists(select 1 from sim.v2_training_records t
  where t.company_id=cid and t.person_id=p_person_id and
    t.status in('planned','in_progress') and t.starts_at<p_end and t.ends_at>p_start)then
  raise exception 'Training conflicts with planned duty'
   using errcode='22023';end if;
 insert into sim.v2_duty_roster(company_id,person_id,duty_kind,starts_at,ends_at,base_icao,notes)
 values(cid,p_person_id,p_kind,p_start,p_end,p_base,coalesce(p_notes,''))
 returning id into result_id;
 return jsonb_build_object('created',true,'id',result_id,'planning_status','draft',
  'real_duty_time_verified',false,'sim_schedule_only',true);
end $fn$;

create function public.aervelys_v2_facility_add(
 p_title text,p_kind text,p_site text default 'Standort noch zu prüfen',
 p_capex numeric default null,p_monthly_rent numeric default null,
 p_notes text default ''
)returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare u uuid:=auth.uid();cid uuid;fid uuid;
begin
 if u is null or not exists(select 1 from sim.app_user_roles
   where user_id=u and active and role='ceo')then
  raise exception 'CEO role required' using errcode='42501';end if;
 select id into cid from sim.v2_companies where owner_id=u;
 if cid is null then raise exception 'Company not initialized' using errcode='22023';end if;
 insert into sim.v2_facility_projects(company_id,title,facility_kind,status,
   site_name,planned_capex_eur,monthly_rent_eur,notes)
 values(cid,p_title,p_kind,'idea',coalesce(p_site,'Standort noch zu prüfen'),
   p_capex,p_monthly_rent,coalesce(p_notes,''))
 returning id into fid;
 return jsonb_build_object('created',true,'id',fid,
  'construction_started',false,'bank_transaction_created',false,'sim_only',true);
end $fn$;

revoke all on function public.aervelys_v2_ops_overview()
 from public,anon,authenticated;
revoke all on function public.aervelys_v2_training_add(uuid,text,text,timestamptz,timestamptz,numeric,text)
 from public,anon,authenticated;
revoke all on function public.aervelys_v2_duty_add(uuid,text,timestamptz,timestamptz,text,text)
 from public,anon,authenticated;
revoke all on function public.aervelys_v2_facility_add(text,text,text,numeric,numeric,text)
 from public,anon,authenticated;
grant execute on function public.aervelys_v2_ops_overview() to authenticated;
grant execute on function public.aervelys_v2_training_add(uuid,text,text,timestamptz,timestamptz,numeric,text) to authenticated;
grant execute on function public.aervelys_v2_duty_add(uuid,text,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.aervelys_v2_facility_add(text,text,text,numeric,numeric,text) to authenticated;
