-- AERVELYS NEXT ONLY. Use reviewed internal source facts for SIM cost comparison.
-- No operational dispatch approvals. Crew counts require verified virtual logbooks AND type ratings.
create or replace function sim.virtual_department_resolution_tick(p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
declare
 uid uuid:=auth.uid();
 row_case record;
 craft record;
 v_key text;
 t_depart timestamptz;
 pos_fee numeric;
 floor_eur numeric;
 aircraft_conflicts integer;
 pic_count integer; sic_count integer;
 verified_pic integer; verified_sic integer;
 seat_verified boolean;
 warnings_out jsonb;
 evidence_out jsonb;
 finding_out text;
 label_out text;
 selected_count integer:=0;
 modified_count integer:=0;
 option_rows integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 80 then
  raise exception 'Invalid resolution batch size' using errcode='22023';
 end if;
 if session_user<>'postgres' and (uid is null or not exists(
  select 1 from sim.app_user_roles u where u.user_id=uid and u.active
  and u.role in ('ceo','ops'))) then
  raise exception 'SIM resolution worker denied' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(593,718) then
  return jsonb_build_object('skipped','resolution_worker_running','simulation_only',true);
 end if;
 if not coalesce((select enabled from sim.virtual_airline_agent_settings where id=1),false)
   or not coalesce((select scheduled_enabled from sim.sim_customer_settings where id=1),false) then
  return jsonb_build_object('skipped','simulation_paused','simulation_only',true);
 end if;

 for row_case in
  select d.id decision_id,d.request_id,r.request_code,r.origin_icao,
   r.requested_departure,r.passengers,r.status charter_status,
   p.aircraft_id selected_aircraft,p.status plan_status,c.lifecycle
  from sim.virtual_department_decisions d
  join sim.virtual_department_handoffs h on h.id=d.handoff_id
  join sim.charter_requests r on r.id=d.request_id
  join sim.sim_customer_cases c on c.request_id=d.request_id
  left join sim.virtual_agent_fleet_plans p on p.request_id=d.request_id
  where d.status='needs_review' and h.status='open'
   and r.request_code like 'AV-SIM-%' and r.status not in('cancelled','declined','completed')
   and c.lifecycle<>'withdrawn' and r.requested_departure>now()
  order by d.id desc limit p_limit
 loop
  selected_count:=selected_count+1;
  for v_key in select unnest(array['keep_plan','switch_aircraft','delay_24h']) loop
   t_depart:=row_case.requested_departure+
      case when v_key='delay_24h' then interval '24 hours' else interval '0 hours' end;
   label_out:=case v_key when 'keep_plan' then 'Aktuellen SIM-Kandidaten prüfen'
    when 'switch_aircraft' then 'Alternatives Flugzeug vorprüfen'
    else 'SIM-Abflug um 24 Stunden verschieben' end;
   if v_key='switch_aircraft' then
    select a.id,a.registration,a.aircraft_type,a.current_icao,
      a.operational_status,pp.passenger_seats,pp.verification_status,
      pp.cost_per_block_hour_eur,pp.source_reference
    into craft
    from sim.aircraft a
    left join sim.aircraft_performance_profiles pp on pp.aircraft_id=a.id
    where a.id is distinct from row_case.selected_aircraft
      and (case when row_case.passengers>7 then a.aircraft_type in('Cessna Citation Longitude','Pilatus PC-24')
                when row_case.passengers>4 then a.aircraft_type<>'Cirrus Vision Jet G2'
                else true end)
      and (pp.verification_status is distinct from 'verified'
           or pp.passenger_seats is null or pp.passenger_seats>=row_case.passengers)
    order by
      (select count(*) from sim.virtual_agent_fleet_plans z
       join sim.charter_requests rz on rz.id=z.request_id
       where z.aircraft_id=a.id and z.request_id<>row_case.request_id
         and rz.status not in('cancelled','declined','completed')
         and abs(extract(epoch from rz.requested_departure-t_depart))<21600),
      case when a.current_icao=row_case.origin_icao then 0 else 1 end,
      case when a.operational_status='available' then 0 else 1 end,
      a.registration
    limit 1;
   else
    select a.id,a.registration,a.aircraft_type,a.current_icao,
       a.operational_status,pp.passenger_seats,pp.verification_status,
      pp.cost_per_block_hour_eur,pp.source_reference
    into craft
    from sim.aircraft a
    left join sim.aircraft_performance_profiles pp on pp.aircraft_id=a.id
    where a.id=row_case.selected_aircraft;
   end if;
   aircraft_conflicts:=0;pic_count:=0;sic_count:=0;verified_pic:=0;verified_sic:=0;
   pos_fee:=null;floor_eur:=null;seat_verified:=false;
   warnings_out:=jsonb_build_array(
    'Nur SIM-Planung. Keine Reservierung, Crewbindung oder Flugfreigabe.',
    'Technische Bereitschaft, Versicherung, Wetter, Genehmigungen, Reichweite, Medical und Duty/Rest nicht bestätigt.'
   );
   if craft.id is null then
    finding_out:='Kein geeigneter SIM-Flugzeugdatensatz vorhanden. Keine automatische Zusage möglich.';
    warnings_out:=warnings_out||jsonb_build_array('Kein passender Flugzeugkandidat im vorhandenen Bestand.');
   else
    select count(*) into aircraft_conflicts
     from sim.virtual_agent_fleet_plans z
     join sim.charter_requests rz on rz.id=z.request_id
     where z.aircraft_id=craft.id and z.request_id<>row_case.request_id
       and rz.status not in('cancelled','declined','completed')
       and abs(extract(epoch from rz.requested_departure-t_depart))<21600;
    select count(*) filter(where pilot_role='PIC'),
           count(*) filter(where pilot_role='SIC')
      into pic_count,sic_count
    from sim.people per
    where per.active and per.pilot_role in('PIC','SIC')
      and not exists(select 1 from sim.crew_duty_blocks duties
       where duties.person_id=per.id
        and duties.starts_at<t_depart+interval '5 hours'
        and duties.ends_at>t_depart-interval '2 hours');
    select count(*) filter(where per.pilot_role='PIC'),
           count(*) filter(where per.pilot_role='SIC')
       into verified_pic,verified_sic
    from sim.people per
    join sim.virtual_pilot_hours verified_log on verified_log.person_id=per.id
    where verified_log.verification_status='verified'
      and verified_log.total_hours>=0
      and verified_log.pic_hours>=0
      and verified_log.pic_hours<=verified_log.total_hours
      and nullif(btrim(verified_log.source_reference),'') is not null
      and per.active and per.pilot_role in ('PIC','SIC')
      and exists(select 1 from sim.pilot_qualifications qual
       where qual.person_id=per.id and qual.aircraft_type=craft.aircraft_type
       and qual.verified and t_depart::date between qual.valid_from and qual.valid_until)
      and not exists(select 1 from sim.crew_duty_blocks duties
       where duties.person_id=per.id
        and duties.starts_at<t_depart+interval '5 hours'
        and duties.ends_at>t_depart-interval '2 hours');
    seat_verified:=coalesce(craft.verification_status='verified'
      and craft.passenger_seats>=row_case.passengers,false);
    pos_fee:=case when craft.current_icao=row_case.origin_icao then 0 else 1700 end;
    floor_eur:=(case when craft.verification_status='verified'
     and craft.cost_per_block_hour_eur>0
     and nullif(btrim(craft.source_reference),'') is not null
     then round(craft.cost_per_block_hour_eur * 2.5,2)
     else (case craft.aircraft_type
       when 'Cessna Citation Longitude' then 9900
       when 'Pilatus PC-24' then 7500
       when 'Embraer Phenom 300E' then 6800
       when 'Cessna Citation CJ4' then 6400
       else 7000 end) end)+row_case.passengers*350+pos_fee;
    -- Even verified hourly profile costs use a fictional 2.5h flight assumption,
    -- not actual route distance, block hours or an operational quote.
    finding_out:=case when aircraft_conflicts>0 then
       'SIM-Planungskonflikt innerhalb sechs Stunden. Nur Alternativvorschlag, kein Slot reserviert.'
      else 'Keine andere SIM-Planung innerhalb sechs Stunden registriert; echte Verfügbarkeit unbestätigt.' end;
    if aircraft_conflicts>0 then
      warnings_out:=warnings_out||jsonb_build_array('Zeitnahe andere SIM-Planung: '||aircraft_conflicts::text);
    end if;
    if craft.operational_status<>'available' then
      warnings_out:=warnings_out||jsonb_build_array('Flugzeugstatus: '||coalesce(craft.operational_status,'unbekannt'));
    end if;
    if not seat_verified then
      warnings_out:=warnings_out||jsonb_build_array('Sitzplatzkapazität nicht verifiziert');
    end if;
    if verified_pic=0 or verified_sic=0 then
      warnings_out:=warnings_out||jsonb_build_array('Keine vollständig verifizierte PIC-/SIC-Musterkombination nachgewiesen');
    end if;
    if v_key='delay_24h' then
      warnings_out:=warnings_out||jsonb_build_array('Kunde hat Terminänderung nicht bestätigt; keine Zeit-/Übernachtungsgebühren modelliert');
    end if;
   end if;
   evidence_out:=jsonb_build_object(
     'model',case when craft.verification_status='verified' and craft.cost_per_block_hour_eur>0
       and nullif(btrim(craft.source_reference),'') is not null
       then 'reviewed_hourly_profile_times_2_5h_sim_v2' else 'virtual_sales_agent_fixed_floor_v1' end,
     'price_is_fictional',true,'currency','EUR',
     'profile_hourly_rate_eur',case when craft.verification_status='verified' then craft.cost_per_block_hour_eur else null end,
     'profile_source_reference',case when craft.verification_status='verified' then craft.source_reference else null end,
     'flight_duration_assumed_hours',case when craft.verification_status='verified' then 2.5 else null end,
     'crew_logbook_required',true,
     'passenger_component_eur',row_case.passengers*350,
     'positioning_component_eur',pos_fee,
     'aircraft_base_assumption_eur',case when floor_eur is null then null
        else floor_eur-row_case.passengers*350-coalesce(pos_fee,0) end,
     'requested_departure',row_case.requested_departure,
     'scheduled_departure',t_depart,
     'aircraft_status',craft.operational_status,
     'passenger_capacity_verified',seat_verified,
     'type_ratings_evidenced_pic',verified_pic,
     'type_ratings_evidenced_sic',verified_sic,
     'crew_available_unverified_pic',pic_count,
     'crew_available_unverified_sic',sic_count,
     'conflict_6h_count',aircraft_conflicts,
     'operational_approval',false
   );
   insert into sim.virtual_department_resolution_options
     (decision_id,request_id,variant_key,label,aircraft_id,aircraft_registration,aircraft_type,
      proposed_departure,simulated_floor_eur,positioning_component_eur,aircraft_plan_conflicts,
      roster_pic_candidates,roster_sic_candidates,verified_pic_candidates,verified_sic_candidates,
      seat_capacity_verified,finding,warnings,evidence)
   values(row_case.decision_id,row_case.request_id,v_key,label_out,craft.id,craft.registration,
      craft.aircraft_type,t_depart,floor_eur,pos_fee,aircraft_conflicts,
      pic_count,sic_count,verified_pic,verified_sic,seat_verified,finding_out,warnings_out,evidence_out)
   on conflict(decision_id,variant_key) do update
    set label=excluded.label,aircraft_id=excluded.aircraft_id,
     aircraft_registration=excluded.aircraft_registration,aircraft_type=excluded.aircraft_type,
     proposed_departure=excluded.proposed_departure,simulated_floor_eur=excluded.simulated_floor_eur,
     positioning_component_eur=excluded.positioning_component_eur,
     aircraft_plan_conflicts=excluded.aircraft_plan_conflicts,
     roster_pic_candidates=excluded.roster_pic_candidates,roster_sic_candidates=excluded.roster_sic_candidates,
     verified_pic_candidates=excluded.verified_pic_candidates,
     verified_sic_candidates=excluded.verified_sic_candidates,
     seat_capacity_verified=excluded.seat_capacity_verified,
     finding=excluded.finding,warnings=excluded.warnings,evidence=excluded.evidence,updated_at=now()
    where sim.virtual_department_resolution_options.evidence is distinct from excluded.evidence
       or sim.virtual_department_resolution_options.aircraft_id is distinct from excluded.aircraft_id
       or sim.virtual_department_resolution_options.finding is distinct from excluded.finding
   returning id into option_rows;
   if found then modified_count:=modified_count+1;end if;
  end loop;
 end loop;
 return jsonb_build_object('cases_examined',selected_count,'variants_changed',modified_count,
  'simulation_only',true,'real_flight_changes',0,'real_crew_assignments',0,
  'external_operator_bookings',0,'llm_connected',false);
end $fn$;

create or replace function public.aervelys_virtual_resolutions_overview()
returns jsonb language plpgsql stable security definer
set search_path to pg_catalog,sim,auth,pg_temp
as $fn$
begin
 if auth.uid() is null or not exists(select 1 from sim.app_user_roles u
    where u.user_id=auth.uid() and u.active and u.role in ('ceo','ops')) then
   raise exception 'SIM resolution overview denied' using errcode='42501';
 end if;
 return jsonb_build_object(
  'options',coalesce((select jsonb_agg(jsonb_build_object(
     'id',o.id,'decision_id',o.decision_id,'request_id',o.request_id,
     'request_code',r.request_code,'origin_icao',r.origin_icao,
     'destination_icao',r.destination_icao,'passengers',r.passengers,
     'variant_key',o.variant_key,'label',o.label,'aircraft_registration',o.aircraft_registration,
     'aircraft_type',o.aircraft_type,'proposed_departure',o.proposed_departure,
     'simulated_floor_eur',o.simulated_floor_eur,
     'positioning_component_eur',o.positioning_component_eur,
     'aircraft_plan_conflicts',o.aircraft_plan_conflicts,
     'roster_pic_candidates',o.roster_pic_candidates,'roster_sic_candidates',o.roster_sic_candidates,
     'verified_pic_candidates',o.verified_pic_candidates,'verified_sic_candidates',o.verified_sic_candidates,
     'seat_capacity_verified',o.seat_capacity_verified,
     'operationally_usable',o.operationally_usable,
     'finding',o.finding,'warnings',o.warnings,
     'evidence',o.evidence,'updated_at',o.updated_at
    ) order by o.decision_id desc,o.id)
    from (select * from sim.virtual_department_resolution_options
          order by decision_id desc,id desc limit 180)o
    join sim.charter_requests r on r.id=o.request_id
    where r.request_code like 'AV-SIM-%'),'[]'::jsonb),
  'simulation_only',true,'llm_connected',false,'operational_approval',false,
  'model_label','SIM-Kostenboden: geprüfter Stundensatz * angenommene 2,5 Blockstunden, sonst fiktive Flugzeugpauschale; dazu 350 EUR je Person und ggf. 1.700 EUR Positionierung. Keine echte Flugzeit oder verbindliches Angebot.'
 );
end $fn$;
