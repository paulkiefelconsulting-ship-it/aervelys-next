-- Fix PL/pgSQL record name versus charter table alias. No data modifications.
create or replace function public.aervelys_sim_mission_create(p_request_id uuid,p_route text)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare uid uuid:=auth.uid(); source_req record; cleaned text; pax integer; created boolean:=false;
begin
 if uid is null or not exists(select 1 from sim.app_user_roles u
   where u.user_id=uid and u.active and u.role in('ceo','ops')) then
  raise exception 'SIM mission create denied' using errcode='42501';
 end if;
 cleaned:=upper(regexp_replace(btrim(coalesce(p_route,'')),'[[:space:]]+',' ','g'));
 if length(cleaned) not between 3 and 1500 then
  raise exception 'A 3..1500 character route pasted by the pilot is required'
   using errcode='22023';
 end if;
 select request.id,request.request_code,request.passengers into source_req
 from sim.charter_requests request
 join sim.sim_customer_cases c on c.request_id=request.id
 where request.id=p_request_id and request.request_code like 'AV-SIM-%'
 and request.status not in ('cancelled','declined','completed')
 and c.lifecycle not in ('withdrawn','declined')
 for update of request;
 if not found or source_req.passengers not between 1 and 30 then
  raise exception 'Active simulated charter case with 1..30 passengers required'
   using errcode='22023';
 end if;
 insert into sim.virtual_sim_missions(request_id,route_text,created_by)
 values(source_req.id,cleaned,uid)
 on conflict(request_id) do nothing;
 created:=found;
 if not created then
  return jsonb_build_object('created',false,'exists',true,'request_id',source_req.id,
    'simulation_only',true,'flight_releases',0);
 end if;
 insert into sim.virtual_sim_passengers(request_id,seat_index)
 select source_req.id,generate_series(1,source_req.passengers);
 insert into sim.virtual_sim_mission_events(request_id,event_kind,actor_id,payload)
 values(source_req.id,'mission_created',uid,
  jsonb_build_object('route',cleaned,'origin','user_simbrief_paste',
   'pax_count',source_req.passengers,'phase_source','manual_simulation'));
 return jsonb_build_object('created',true,'request_id',source_req.id,'passengers',source_req.passengers,
  'simulation_only',true,'flight_releases',0,'telemetry_connected',false);
end $fn$;
