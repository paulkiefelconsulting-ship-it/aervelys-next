-- AERVELYS NEXT: read-only, owner-scoped flight recorder for simulator ACARS.
-- No certification, score, financial posting or real flight authority is granted.
create or replace function public.aervelys_msfs_acars_sessions()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
 if v_user is null or not exists (
   select 1 from sim.app_user_roles r
   where r.user_id=v_user and r.active and r.role in ('ceo','ops')
 ) then
   raise exception 'ACARS sessions forbidden' using errcode='42501';
 end if;
 with latest as (
   select distinct on (s.device_id,s.session_id)
     s.device_id,s.session_id,s.received_at,s.observed_at,s.phase,s.sample,
     d.device_name
   from sim.msfs_bridge_samples s
   join sim.msfs_bridge_devices d on d.id=s.device_id
   where d.owner_id=v_user and d.revoked_at is null
     and s.received_at>now()-interval '24 hours'
   order by s.device_id,s.session_id,s.received_at desc,s.id desc
 ), recent as (
   select * from latest order by received_at desc limit 15
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'device_id',device_id,'session_id',session_id,'device_name',device_name,
   'last_received_at',received_at,'last_observed_at',observed_at,
   'phase',phase,'aircraft_title',sample->>'aircraft_title',
   'online',received_at>now()-interval '20 seconds'
 ) order by received_at desc),'[]'::jsonb)
 into v_result from recent;
 return v_result;
end $fn$;

create or replace function public.aervelys_msfs_acars_samples(
 p_device_id uuid,p_session_id uuid
) returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_user uuid:=auth.uid(); v_result jsonb; v_truncated boolean:=false; v_count integer;
begin
 if v_user is null or not exists (
   select 1 from sim.app_user_roles r
   where r.user_id=v_user and r.active and r.role in ('ceo','ops')
 ) then
   raise exception 'ACARS flight samples forbidden' using errcode='42501';
 end if;
 if p_device_id is null or p_session_id is null or not exists (
   select 1 from sim.msfs_bridge_devices d
    where d.id=p_device_id and d.owner_id=v_user and d.revoked_at is null
 ) then
   raise exception 'Device not authorized' using errcode='42501';
 end if;
 with last_samples as (
   select s.id,s.observed_at,s.received_at,s.phase,s.sample
   from sim.msfs_bridge_samples s
   where s.device_id=p_device_id and s.session_id=p_session_id
     and s.received_at>now()-interval '8 hours'
   order by s.received_at desc,s.id desc
   limit 1201
 ), counted as (
   select count(*) as count from last_samples
 ), limited as (
   select * from last_samples order by received_at desc,id desc limit 1200
 )
 select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'observed_at',l.observed_at,'received_at',l.received_at,
    'phase',l.phase,'sample',l.sample
 ) order by l.received_at asc,l.id asc),'[]'::jsonb),
 (select count>1200 from counted), (select count from counted)
 into v_result,v_truncated,v_count
 from limited l;
 return jsonb_build_object(
  'samples',coalesce(v_result,'[]'::jsonb),
  'truncated',coalesce(v_truncated,false),
  'available_in_window',coalesce(v_count,0),
  'simulation_only',true,'certificates_issued',0,'financial_postings',0,
  'verified_flight',false
 );
end $fn$;

revoke all on function public.aervelys_msfs_acars_sessions() from public,anon,authenticated;
revoke all on function public.aervelys_msfs_acars_samples(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aervelys_msfs_acars_sessions() to authenticated;
grant execute on function public.aervelys_msfs_acars_samples(uuid,uuid) to authenticated;
