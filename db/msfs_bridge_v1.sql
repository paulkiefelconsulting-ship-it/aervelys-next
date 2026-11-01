-- AERVELYS NEXT / MSFS Bridge v1. Private tables, scoped device capabilities.
create table if not exists sim.msfs_bridge_pairs (
 code_hash bytea primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists sim.msfs_bridge_devices (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 device_name text not null check(length(device_name) between 1 and 64),
 token_hash bytea not null unique, paired_at timestamptz not null default now(),
 revoked_at timestamptz, last_seen_at timestamptz, last_sample jsonb
);
create index if not exists msfs_bridge_devices_owner on sim.msfs_bridge_devices(owner_id);
create table if not exists sim.msfs_bridge_samples (
 id bigint generated always as identity primary key,
 device_id uuid not null references sim.msfs_bridge_devices(id) on delete cascade,
 observed_at timestamptz not null, received_at timestamptz not null default now(),
 session_id uuid not null, phase text not null, sample jsonb not null
);
create index if not exists msfs_bridge_samples_device_time on sim.msfs_bridge_samples(device_id,received_at desc);
alter table sim.msfs_bridge_pairs enable row level security;
alter table sim.msfs_bridge_devices enable row level security;
alter table sim.msfs_bridge_samples enable row level security;
revoke all on sim.msfs_bridge_pairs,sim.msfs_bridge_devices,sim.msfs_bridge_samples from public,anon,authenticated;

create or replace function public.aervelys_msfs_bridge_pair_begin()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_code text; v_exp timestamptz;
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles where user_id=v_user and active and role in ('ceo','ops'))
 then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from sim.msfs_bridge_pairs where owner_id=v_user or expires_at<=now();
 v_code:=encode(extensions.gen_random_bytes(16),'hex'); v_exp:=now()+interval '5 minutes';
 insert into sim.msfs_bridge_pairs(code_hash,owner_id,expires_at)
 values(extensions.digest(v_code,'sha256'),v_user,v_exp);
 return jsonb_build_object('code',v_code,'expires_at',v_exp);
end $$;

create or replace function public.aervelys_msfs_bridge_pair_claim(p_code text,p_device_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_token text; v_id uuid; v_name text;
begin
 if p_code is null or p_code !~ '^[a-f0-9]{32}$' then
 raise exception 'Invalid or expired code' using errcode='22023'; end if;
 v_name:=left(btrim(coalesce(p_device_name,'')),64);
 if length(v_name)<1 then raise exception 'Device name required' using errcode='22023'; end if;
 delete from sim.msfs_bridge_pairs
 where code_hash=extensions.digest(p_code,'sha256') and expires_at>now()
 returning owner_id into v_user;
 if v_user is null then raise exception 'Invalid or expired code' using errcode='22023'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into sim.msfs_bridge_devices(owner_id,device_name,token_hash)
 values(v_user,v_name,extensions.digest(v_token,'sha256')) returning id into v_id;
 return jsonb_build_object('device_id',v_id,'device_token',v_token);
end $$;

create or replace function public.aervelys_msfs_bridge_ingest(p_token text,p_sample jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_device sim.msfs_bridge_devices%rowtype; v_stamp timestamptz; v_session uuid;
 v_phase text; v_lat double precision; v_lon double precision; v_alt double precision; v_gs double precision;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_sample is null
 or jsonb_typeof(p_sample)<>'object' or octet_length(p_sample::text)>2000
 then raise exception 'Invalid telemetry payload' using errcode='22023'; end if;
 v_stamp:=(p_sample->>'observed_at')::timestamptz;
 v_session:=(p_sample->>'session_id')::uuid;
 v_phase:=p_sample->>'phase';
 v_lat:=(p_sample->>'latitude')::double precision;
 v_lon:=(p_sample->>'longitude')::double precision;
 v_alt:=(p_sample->>'altitude_ft')::double precision;
 v_gs:=(p_sample->>'groundspeed_kt')::double precision;
 if v_stamp is null or v_session is null or v_phase is null
 or v_lat is null or v_lon is null or v_alt is null or v_gs is null
 then raise exception 'Missing telemetry fields' using errcode='22023'; end if;
 if abs(extract(epoch from(now()-v_stamp)))>120
 or v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180
 or v_alt < -2500 or v_alt > 110000 or v_gs < 0 or v_gs > 1500
 or v_phase <> all(array['PARKED','TAXI_OUT','TAKEOFF','CLIMB','CRUISE','DESCENT','APPROACH','LANDING','TAXI_IN','UNKNOWN'])
 then raise exception 'Telemetry out of range' using errcode='22023'; end if;
 select * into v_device from sim.msfs_bridge_devices
 where token_hash=extensions.digest(p_token,'sha256') and revoked_at is null for update;
 if not found then raise exception 'Invalid device token' using errcode='28000'; end if;
 if v_device.last_seen_at is not null and v_device.last_seen_at>now()-interval '3 seconds'
 then return jsonb_build_object('accepted',false,'reason','rate_limited'); end if;
 update sim.msfs_bridge_devices set last_seen_at=now(),last_sample=p_sample where id=v_device.id;
 insert into sim.msfs_bridge_samples(device_id,observed_at,session_id,phase,sample)
 values(v_device.id,v_stamp,v_session,v_phase,p_sample);
 return jsonb_build_object('accepted',true,'device_id',v_device.id);
end $$;

create or replace function public.aervelys_msfs_bridge_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles where user_id=v_user and active and role in ('ceo','ops'))
 then raise exception 'Not authorized' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'device_name',device_name,'paired_at',paired_at,
 'last_seen_at',last_seen_at,'last_sample',last_sample,
 'online',last_seen_at>now()-interval '20 seconds') order by paired_at desc),'[]'::jsonb)
 into v_result from sim.msfs_bridge_devices where owner_id=v_user and revoked_at is null;
 return v_result;
end $$;

create or replace function public.aervelys_msfs_bridge_revoke(p_device_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles where user_id=v_user and active and role in ('ceo','ops'))
 then raise exception 'Not authorized' using errcode='42501'; end if;
 update sim.msfs_bridge_devices set revoked_at=now(),last_sample=null
 where id=p_device_id and owner_id=v_user and revoked_at is null;
 get diagnostics v_count=row_count;
 return v_count>0;
end $$;

revoke all on function public.aervelys_msfs_bridge_pair_begin() from public,anon;
revoke all on function public.aervelys_msfs_bridge_pair_claim(text,text) from public,authenticated;
revoke all on function public.aervelys_msfs_bridge_ingest(text,jsonb) from public,authenticated;
revoke all on function public.aervelys_msfs_bridge_status() from public,anon;
revoke all on function public.aervelys_msfs_bridge_revoke(uuid) from public,anon;
grant execute on function public.aervelys_msfs_bridge_pair_begin() to authenticated;
grant execute on function public.aervelys_msfs_bridge_pair_claim(text,text) to anon;
grant execute on function public.aervelys_msfs_bridge_ingest(text,jsonb) to anon;
grant execute on function public.aervelys_msfs_bridge_status() to authenticated;
grant execute on function public.aervelys_msfs_bridge_revoke(uuid) to authenticated;
