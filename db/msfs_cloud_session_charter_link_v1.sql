-- AERVELYS NEXT / SIM-only Cloud MSFS session -> actual SIM charter mission binding.
-- No Windows Bridge changes; no real aircraft, dispatch, crew, or accounting modifications.
create table sim.virtual_msfs_charter_links (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 device_id uuid not null references sim.msfs_bridge_devices(id),
 session_id uuid not null,
 request_id uuid not null references sim.virtual_sim_missions(request_id),
 linked_by uuid not null,
 linked_at timestamptz not null default now(),
 unlinked_at timestamptz,
 check(unlinked_at is null or unlinked_at>=linked_at)
);
create unique index virtual_msfs_charter_links_session_active_idx
 on sim.virtual_msfs_charter_links(device_id,session_id) where unlinked_at is null;
create unique index virtual_msfs_charter_links_request_active_idx
 on sim.virtual_msfs_charter_links(request_id) where unlinked_at is null;
create index virtual_msfs_charter_links_owner_idx on sim.virtual_msfs_charter_links(owner_id,linked_at desc);

create table sim.virtual_msfs_charter_link_events (
 id bigint generated always as identity primary key,
 link_id uuid not null references sim.virtual_msfs_charter_links(id),
 actor_id uuid not null,
 event_kind text not null check (event_kind in ('linked','unlinked')),
 created_at timestamptz not null default now(),
 simulation_only boolean not null default true check (simulation_only)
);
create index virtual_msfs_charter_link_events_link_idx
 on sim.virtual_msfs_charter_link_events(link_id,created_at desc);

alter table sim.virtual_msfs_charter_links enable row level security;
alter table sim.virtual_msfs_charter_link_events enable row level security;
revoke all on sim.virtual_msfs_charter_links,sim.virtual_msfs_charter_link_events
 from public,anon,authenticated;
revoke all on sequence sim.virtual_msfs_charter_link_events_id_seq from public,anon,authenticated;

create function public.aervelys_msfs_charter_link(
 p_device_id uuid,p_session_id uuid,p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid:=auth.uid();
 v_id uuid;
 v_status text;
begin
 if v_user is null or not exists(
  select 1 from sim.app_user_roles
   where user_id=v_user and active and role in ('ceo','ops')
 ) then raise exception 'Not authorized for SIM charter linking' using errcode='42501';end if;
 if p_device_id is null or p_session_id is null or p_request_id is null
 then raise exception 'Missing device, session, or SIM request' using errcode='22023';end if;
 -- Only the caller's non-revoked device; sessions cannot be invented by the browser.
 if not exists(select 1 from sim.msfs_bridge_devices d
  where d.id=p_device_id and d.owner_id=v_user and d.revoked_at is null)
 then raise exception 'Device not paired to this operator' using errcode='42501';end if;
 if not exists(
  select 1 from sim.msfs_bridge_samples s
  where s.device_id=p_device_id and s.session_id=p_session_id
   and s.received_at>=now()-interval '120 seconds'
   and s.observed_at between now()-interval '120 seconds' and now()+interval '30 seconds'
 ) then raise exception 'No fresh server-confirmed telemetry for session'
 using errcode='22023';end if;
 select m.lifecycle into v_status
  from sim.virtual_sim_missions m
  join sim.charter_requests r on r.id=m.request_id
  join sim.sim_customer_cases c on c.request_id=r.id
 where m.request_id=p_request_id
  and r.request_code like 'AV-SIM-%'
  and r.status not in ('declined','cancelled','completed')
  and c.lifecycle not in ('withdrawn','declined')
 for update of m;
 if not found or v_status<>'running'
 then raise exception 'A running AV-SIM mission is required' using errcode='22023';end if;
 select l.id into v_id from sim.virtual_msfs_charter_links l
 where l.device_id=p_device_id and l.session_id=p_session_id
  and l.request_id=p_request_id and l.owner_id=v_user and l.unlinked_at is null
 limit 1;
 if v_id is not null then
  return jsonb_build_object('linked',true,'reused',true,
   'link_id',v_id,'simulation_only',true,'telemetry_verified_for_ops',false,
   'automatic_phase_control',false,'real_flights_modified',0,
   'crew_assignments_modified',0,'financial_postings',0);
 end if;
 if exists(select 1 from sim.virtual_msfs_charter_links l
  where l.unlinked_at is null and
   ((l.device_id=p_device_id and l.session_id=p_session_id) or l.request_id=p_request_id)
 ) then raise exception 'Session or SIM mission already linked'
 using errcode='23505';end if;
 insert into sim.virtual_msfs_charter_links(owner_id,device_id,session_id,request_id,linked_by)
 values(v_user,p_device_id,p_session_id,p_request_id,v_user)
 returning id into v_id;
 insert into sim.virtual_msfs_charter_link_events(link_id,actor_id,event_kind)
 values(v_id,v_user,'linked');
 return jsonb_build_object('linked',true,'reused',false,
  'link_id',v_id,'simulation_only',true,'telemetry_verified_for_ops',false,
  'automatic_phase_control',false,'real_flights_modified',0,
  'crew_assignments_modified',0,'financial_postings',0);
end $function$;
revoke all on function public.aervelys_msfs_charter_link(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.aervelys_msfs_charter_link(uuid,uuid,uuid) to authenticated;

create function public.aervelys_msfs_charter_unlink(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_user uuid:=auth.uid(); v_n integer;
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles
  where user_id=v_user and active and role in('ceo','ops'))
 then raise exception 'Not authorized to unlink SIM charter' using errcode='42501';end if;
 if p_link_id is null then raise exception 'Link id required' using errcode='22023';end if;
 update sim.virtual_msfs_charter_links l set unlinked_at=now()
 where l.id=p_link_id and l.owner_id=v_user and l.unlinked_at is null;
 get diagnostics v_n=row_count;
 if v_n<>1 then raise exception 'Active owned SIM link not found'
 using errcode='42501';end if;
 insert into sim.virtual_msfs_charter_link_events(link_id,actor_id,event_kind)
 values(p_link_id,v_user,'unlinked');
 return jsonb_build_object('unlinked',true,'link_id',p_link_id,
  'simulation_only',true,'automatic_phase_control',false,
  'real_flights_modified',0,'crew_assignments_modified',0,'financial_postings',0);
end $function$;
revoke all on function public.aervelys_msfs_charter_unlink(uuid) from public,anon,authenticated;
grant execute on function public.aervelys_msfs_charter_unlink(uuid) to authenticated;

create function public.aervelys_msfs_charter_links_overview() returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles
  where user_id=v_user and active and role in ('ceo','ops'))
 then raise exception 'SIM charter link overview denied' using errcode='42501';end if;
 return jsonb_build_object(
  'devices',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',d.id,'device_name',d.device_name,'last_seen_at',d.last_seen_at,
    'online',coalesce(d.last_seen_at>now()-interval '20 seconds',false))
    order by d.device_name)
   from sim.msfs_bridge_devices d where d.owner_id=v_user and d.revoked_at is null
  ),'[]'::jsonb),
  'sessions',coalesce((
   select jsonb_agg(jsonb_build_object(
    'device_id',s.device_id,'session_id',s.session_id,
    'device_name',d.device_name,'last_seen_at',s.received_at,
    'observed_at',s.observed_at,'phase',s.phase,
    'fresh',s.received_at>=now()-interval '120 seconds'
      and s.observed_at between now()-interval '120 seconds' and now()+interval '30 seconds',
    'sample',jsonb_build_object(
      'latitude',s.sample->'latitude','longitude',s.sample->'longitude',
      'altitude_ft',s.sample->'altitude_ft',
      'groundspeed_kt',s.sample->'groundspeed_kt',
      'aircraft_title',s.sample->'aircraft_title')
    ) order by s.received_at desc)
    from (
     select distinct on (raw.device_id,raw.session_id)
       raw.device_id,raw.session_id,raw.received_at,raw.observed_at,
       raw.phase,raw.sample
      from sim.msfs_bridge_samples raw
      join sim.msfs_bridge_devices owned on owned.id=raw.device_id
      where owned.owner_id=v_user and owned.revoked_at is null
        and raw.received_at>now()-interval '24 hours'
      order by raw.device_id,raw.session_id,raw.received_at desc
      limit 30
    )s
    join sim.msfs_bridge_devices d on d.id=s.device_id
  ),'[]'::jsonb),
  'missions',coalesce((
   select jsonb_agg(jsonb_build_object(
    'request_id',m.request_id,'request_code',r.request_code,
    'origin_icao',r.origin_icao,'destination_icao',r.destination_icao,
    'passengers',r.passengers,'phase',m.phase,'lifecycle',m.lifecycle,
    'route_text',left(m.route_text,200))
    order by m.updated_at desc)
    from sim.virtual_sim_missions m
     join sim.charter_requests r on r.id=m.request_id
    where m.lifecycle='running' and r.request_code like 'AV-SIM-%'
   ),'[]'::jsonb),
  'links',coalesce((
   select jsonb_agg(jsonb_build_object(
     'link_id',l.id,'device_id',l.device_id,'device_name',d.device_name,
     'session_id',l.session_id,'request_id',l.request_id,
     'request_code',r.request_code,'origin_icao',r.origin_icao,
     'destination_icao',r.destination_icao,
     'linked_at',l.linked_at,'status',case
      when d.revoked_at is not null then 'device_revoked'
      when m.lifecycle<>'running' then 'mission_not_running'
      when s.received_at is null or s.received_at<now()-interval '120 seconds' then 'offline'
      else 'receiving' end,
     'last_sample',case when s.received_at>now()-interval '120 seconds'
      then jsonb_build_object(
       'phase',s.phase,'observed_at',s.observed_at,'received_at',s.received_at,
       'altitude_ft',s.sample->'altitude_ft',
       'groundspeed_kt',s.sample->'groundspeed_kt',
       'latitude',s.sample->'latitude',
       'longitude',s.sample->'longitude')
      else null end)
      order by l.linked_at desc)
     from sim.virtual_msfs_charter_links l
      join sim.msfs_bridge_devices d on d.id=l.device_id
      join sim.virtual_sim_missions m on m.request_id=l.request_id
      join sim.charter_requests r on r.id=l.request_id
      left join lateral (
       select ss.received_at,ss.observed_at,ss.phase,ss.sample
        from sim.msfs_bridge_samples ss
       where ss.device_id=l.device_id and ss.session_id=l.session_id
       order by ss.received_at desc limit 1
      )s on true
     where l.owner_id=v_user and l.unlinked_at is null
  ),'[]'::jsonb),
  'simulation_only',true,
  'automatic_phase_control',false,
  'real_flights_modified',0,
  'real_crew_modified',0,
  'financial_postings',0
 );
end $function$;
revoke all on function public.aervelys_msfs_charter_links_overview()
 from public,anon,authenticated;
grant execute on function public.aervelys_msfs_charter_links_overview() to authenticated;
