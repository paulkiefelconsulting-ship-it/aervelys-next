-- AERVELYS NEXT — per-case, per-aircraft user-directed SimBrief OFP import.
-- Public fetch is a user action, not a polling service. No SimConnect bridge change.
create table sim.virtual_simbrief_ofp_imports(
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 aircraft_id uuid not null references sim.aircraft(id),
 origin_icao text not null check(origin_icao~'^[A-Z]{4}$'),
 destination_icao text not null check(destination_icao~'^[A-Z]{4}$'),
 route_text text not null check(length(route_text) between 3 and 1500),
 route_distance_nm numeric(9,1) not null check(route_distance_nm between 1 and 12000),
 block_minutes integer not null check(block_minutes between 10 and 1440),
 source_kind text not null default 'simbrief_latest_json_v2_user_fetch'
  check(source_kind='simbrief_latest_json_v2_user_fetch'),
 source_reference text not null check(length(source_reference) between 12 and 250),
 simbrief_generated_at timestamptz,
 imported_by uuid not null,
 imported_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 validation_status text not null default 'pilot_import_unverified'
  check(validation_status='pilot_import_unverified'),
 primary key(request_id,aircraft_id)
);
create index virtual_simbrief_imports_time_idx
 on sim.virtual_simbrief_ofp_imports(imported_at desc);
create table sim.virtual_simbrief_ofp_events(
 id bigint generated always as identity primary key,
 request_id uuid not null references sim.sim_customer_cases(request_id) on delete cascade,
 aircraft_id uuid not null references sim.aircraft(id),
 actor_id uuid not null,
 event_name text not null check(event_name in('imported','replaced')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index virtual_simbrief_events_request_idx on sim.virtual_simbrief_ofp_events(request_id,id desc);
alter table sim.virtual_simbrief_ofp_imports enable row level security;
alter table sim.virtual_simbrief_ofp_events enable row level security;
revoke all on sim.virtual_simbrief_ofp_imports,sim.virtual_simbrief_ofp_events from public,anon,authenticated;
revoke all on sequence sim.virtual_simbrief_ofp_events_id_seq from public,anon,authenticated;

create function public.aervelys_simbrief_ofp_submit(
 p_request_id uuid,p_aircraft_id uuid,p_origin text,p_destination text,
 p_route text,p_distance_nm numeric,p_block_minutes integer,
 p_source_reference text,p_generated_at timestamptz default null)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid(); from_icao text;to_icao text;
 registration text;existing boolean; clean_route text;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u
  where u.user_id=uid and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM OFP import denied' using errcode='42501';
 end if;
 if p_request_id is null or p_aircraft_id is null
  or p_origin is null or p_destination is null
  or p_origin !~ '^[A-Z]{4}$' or p_destination !~ '^[A-Z]{4}$'
  or p_distance_nm is null or p_distance_nm not between 1 and 12000
  or p_block_minutes is null or p_block_minutes not between 10 and 1440
  or p_source_reference is null or length(btrim(p_source_reference)) not between 12 and 250
  or p_generated_at>now()+interval '1 hour' then
  raise exception 'Invalid user-provided SimBrief OFP fields' using errcode='22023';
 end if;
 clean_route:=upper(regexp_replace(btrim(coalesce(p_route,'')),'[[:space:]]+',' ','g'));
 if length(clean_route) not between 3 and 1500 then
  raise exception 'Missing/invalid SimBrief route' using errcode='22023';
 end if;
 select r.origin_icao,r.destination_icao into from_icao,to_icao
  from sim.charter_requests r
  join sim.sim_customer_cases c on c.request_id=r.id
  where r.id=p_request_id and r.request_code like 'AV-SIM-%'
    and r.status not in('declined','cancelled','completed')
    and c.lifecycle not in('declined','withdrawn')
  for update of r;
 if not found or from_icao is distinct from p_origin or to_icao is distinct from p_destination then
  raise exception 'OFP airports do not match an active SIM charter case'
   using errcode='22023';
 end if;
 select a.registration into registration from sim.aircraft a where a.id=p_aircraft_id;
 if registration is null then raise exception 'Airframe not in AERVELYS fleet' using errcode='22023';end if;
 select exists(select 1 from sim.virtual_simbrief_ofp_imports i
  where i.request_id=p_request_id and i.aircraft_id=p_aircraft_id) into existing;
 insert into sim.virtual_simbrief_ofp_imports(
  request_id,aircraft_id,origin_icao,destination_icao,route_text,route_distance_nm,
  block_minutes,source_reference,simbrief_generated_at,imported_by)
 values(p_request_id,p_aircraft_id,p_origin,p_destination,clean_route,
  p_distance_nm,p_block_minutes,btrim(p_source_reference),p_generated_at,uid)
 on conflict(request_id,aircraft_id) do update set
  origin_icao=excluded.origin_icao,destination_icao=excluded.destination_icao,
  route_text=excluded.route_text,route_distance_nm=excluded.route_distance_nm,
  block_minutes=excluded.block_minutes,source_reference=excluded.source_reference,
  simbrief_generated_at=excluded.simbrief_generated_at,imported_by=excluded.imported_by,
  imported_at=now(),updated_at=now(),
  validation_status='pilot_import_unverified';
 insert into sim.virtual_simbrief_ofp_events(request_id,aircraft_id,actor_id,event_name,payload)
 values(p_request_id,p_aircraft_id,uid,case when existing then 'replaced' else 'imported' end,
  jsonb_build_object('airframe_registration',registration,
   'origin',p_origin,'destination',p_destination,
   'distance_nm',p_distance_nm,'block_minutes',p_block_minutes,
   'source_reference',btrim(p_source_reference),
   'route_preview',left(clean_route,60),
   'operational_verified',false,'financial_postings',0));
 return jsonb_build_object('saved',true,'replaced',existing,'request_id',p_request_id,
  'aircraft_id',p_aircraft_id,'simulation_only',true,'operational_verified',false,
  'flight_changes',0,'finance_postings',0);
end $fn$;
revoke all on function public.aervelys_simbrief_ofp_submit(uuid,uuid,text,text,text,numeric,integer,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.aervelys_simbrief_ofp_submit(uuid,uuid,text,text,text,numeric,integer,text,timestamptz)
 to authenticated;

create function public.aervelys_simbrief_ofp_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
  where u.user_id=auth.uid() and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM OFP overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'imports',coalesce((select jsonb_agg(jsonb_build_object(
   'request_id',i.request_id,'aircraft_id',i.aircraft_id,'registration',a.registration,
   'origin_icao',i.origin_icao,'destination_icao',i.destination_icao,
   'route_text',i.route_text,'distance_nm',i.route_distance_nm,
   'block_minutes',i.block_minutes,'source_reference',i.source_reference,
   'simbrief_generated_at',i.simbrief_generated_at,'imported_at',i.imported_at,
   'validation_status',i.validation_status
  ) order by i.imported_at desc)
  from sim.virtual_simbrief_ofp_imports i join sim.aircraft a on a.id=i.aircraft_id),
  '[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'request_id',e.request_id,'aircraft_id',e.aircraft_id,
    'event_name',e.event_name,'payload',e.payload,'created_at',e.created_at
    ) order by e.id desc)
   from (select * from sim.virtual_simbrief_ofp_events
    order by id desc limit 100)e),'[]'::jsonb),
  'simulation_only',true,'pilot_import_unverified',true,
  'automatic_polling',false,'real_flight_changes',0
 );
end $fn$;
revoke all on function public.aervelys_simbrief_ofp_overview() from public,anon,authenticated;
grant execute on function public.aervelys_simbrief_ofp_overview() to authenticated;
