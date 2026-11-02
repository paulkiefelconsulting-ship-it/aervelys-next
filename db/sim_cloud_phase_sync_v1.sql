-- AERVELYS NEXT v1: opt-in, fail-closed Cloud MSFS SIM phase synchronization.
-- No data writes outside the SIM mission & SIM audit. No timer/cabin time acceleration.
-- Does not touch local Windows Bridge or real operational flight/crew/finance tables.
create function public.aervelys_sim_cloud_phase_sync(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_user uuid:=auth.uid();
 m sim.virtual_sim_missions%rowtype;
 l sim.virtual_msfs_charter_links%rowtype;
 latest sim.msfs_bridge_samples%rowtype;
 previous sim.msfs_bridge_samples%rowtype;
 phases text[]:=array['boarding','taxi_out','takeoff','climb','cruise',
   'descent','approach','landing','taxi_in','arrived'];
 target text;
 state text;
 target_idx integer;
 current_idx integer;
begin
 if v_user is null or not exists(select 1 from sim.app_user_roles u
   where u.user_id=v_user and u.active and u.role in('ceo','ops'))
 then raise exception 'SIM phase evidence sync denied' using errcode='42501';end if;
 if p_request_id is null then
  raise exception 'SIM request required' using errcode='22023';end if;
 select mission_row.* into m
 from sim.virtual_sim_missions mission_row
 join sim.charter_requests r on r.id=mission_row.request_id
 join sim.sim_customer_cases c on c.request_id=r.id
 where mission_row.request_id=p_request_id and r.request_code like 'AV-SIM-%'
 for update of mission_row;
 if not found then raise exception 'SIM mission not found' using errcode='22023';end if;
 if m.lifecycle<>'running' or m.phase='arrived' then
  return jsonb_build_object('changed',false,'reason','mission_not_running',
   'mission_phase',m.phase,'simulation_only',true,'automatic_phase_control',true,
   'requires_opt_in',true,'real_flights_modified',0,'financial_postings',0);
 end if;
 -- Local mission SimConnect bridge has its own controller; never race with it.
 if exists(select 1 from sim.virtual_sim_bridge_sessions s
  where s.request_id=p_request_id and s.status='active' and s.expires_at>now()
   and s.last_seen_at>now()-interval '20 seconds') then
  return jsonb_build_object('changed',false,'reason','local_bridge_controls_phase',
   'mission_phase',m.phase,'simulation_only',true,'automatic_phase_control',true,
   'requires_opt_in',true,'real_flights_modified',0,'financial_postings',0);
 end if;
 select link_row.* into l from sim.virtual_msfs_charter_links link_row
 join sim.msfs_bridge_devices d on d.id=link_row.device_id
 where link_row.request_id=p_request_id and link_row.owner_id=v_user
  and link_row.unlinked_at is null and d.owner_id=v_user and d.revoked_at is null
 limit 1;
 if not found then
  return jsonb_build_object('changed',false,'reason','no_owned_cloud_link',
   'mission_phase',m.phase,'simulation_only',true,'automatic_phase_control',true,
   'requires_opt_in',true,'real_flights_modified',0,'financial_postings',0);
 end if;
 -- Use exactly the last two received records, not two cherry-picked matching phases.
 select s.* into latest from sim.msfs_bridge_samples s
  where s.device_id=l.device_id and s.session_id=l.session_id
  order by s.received_at desc,s.id desc limit 1;
 select s.* into previous from sim.msfs_bridge_samples s
  where s.device_id=l.device_id and s.session_id=l.session_id
  order by s.received_at desc,s.id desc offset 1 limit 1;
 if latest.id is null or previous.id is null
   or latest.id=previous.id
   or latest.received_at<now()-interval '45 seconds'
   or previous.received_at<now()-interval '45 seconds'
   or latest.observed_at<now()-interval '45 seconds'
   or previous.observed_at<now()-interval '45 seconds'
   or latest.observed_at>now()+interval '15 seconds'
   or previous.observed_at>now()+interval '15 seconds'
   or latest.phase is distinct from previous.phase
   or latest.received_at<previous.received_at
 then
  return jsonb_build_object('changed',false,'reason','waiting_for_two_fresh_matching_samples',
   'mission_phase',m.phase,'cloud_phase',latest.phase,
   'simulation_only',true,'automatic_phase_control',true,'requires_opt_in',true,
   'real_flights_modified',0,'financial_postings',0);
 end if;
 target:=case latest.phase
   when 'TAXI_OUT' then 'taxi_out'
   when 'TAKEOFF' then 'takeoff'
   when 'CLIMB' then 'climb'
   when 'CRUISE' then 'cruise'
   when 'DESCENT' then 'descent'
   when 'APPROACH' then 'approach'
   when 'LANDING' then 'landing'
   when 'TAXI_IN' then 'taxi_in'
   else null end;
 -- PARKED and UNKNOWN never imply arrival or boarding.
 if target is null then state:='phase_not_safe_to_map';
 else
  current_idx:=array_position(phases,m.phase);
  target_idx:=array_position(phases,target);
  if target_idx=current_idx then state:='already_aligned';
  elsif target_idx=current_idx+1 then state:='advance_one_phase';
  elsif target_idx>current_idx+1 then state:='manual_alignment_required';
  else state:='out_of_order_or_go_around_requires_review';
  end if;
 end if;
 if state<>'advance_one_phase' then
  return jsonb_build_object('changed',false,'reason',state,
   'mission_phase',m.phase,'cloud_phase',latest.phase,
   'simulation_only',true,'automatic_phase_control',true,'requires_opt_in',true,
   'real_flights_modified',0,'financial_postings',0);
 end if;
 update sim.virtual_sim_missions set
   phase=target,source_mode='local_simconnect_unverified',updated_at=now()
 where request_id=p_request_id;
 insert into sim.virtual_sim_mission_events
  (request_id,event_kind,actor_id,payload)
 values(p_request_id,'phase_changed',v_user,jsonb_build_object(
  'previous',m.phase,'next',target,'source','cloud_msfs_opt_in_unverified',
  'simconnect_telemetry',true,'approved_for_real_operations',false,
  'device_id',l.device_id,'session_id',l.session_id,
  'last_sample_id',latest.id,'previous_sample_id',previous.id,
  'observed_at',latest.observed_at,
  'real_flights_modified',0,'financial_postings',0));
 return jsonb_build_object('changed',true,'reason','phase_advanced',
   'previous_phase',m.phase,'mission_phase',target,'cloud_phase',latest.phase,
   'simulation_only',true,'automatic_phase_control',true,'requires_opt_in',true,
   'real_flights_modified',0,'financial_postings',0);
end $fn$;
revoke all on function public.aervelys_sim_cloud_phase_sync(uuid) from public,anon,authenticated;
grant execute on function public.aervelys_sim_cloud_phase_sync(uuid) to authenticated;
