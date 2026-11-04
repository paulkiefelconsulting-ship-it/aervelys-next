-- AERVELYS V2.2: customer-facing itemised charter quotes and immutable pricing.
-- Financial figures are modelled SIM values, not real VAT, airport fees or taxes.
create table sim.v2_quotes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references sim.v2_companies(id) on delete cascade,
 request_id uuid not null unique references sim.v2_requests(id) on delete cascade,
 aircraft_id uuid not null references sim.v2_aircraft(id),
 version integer not null default 1 check(version>=1),
 status text not null default 'offered'
  check(status in('offered','accepted','declined','expired')),
 currency text not null default 'EUR' check(currency='EUR'),
 valid_until timestamptz not null,
 accepted_at timestamptz,
 quoted_aircraft_position text not null check(quoted_aircraft_position~'^[A-Z]{4}$'),
 positioning_from text check(positioning_from is null or positioning_from~'^[A-Z]{4}$'),
 positioning_to text check(positioning_to is null or positioning_to~'^[A-Z]{4}$'),
 positioning_hours numeric(6,2) not null default 0 check(positioning_hours>=0),
 charter_sell_eur numeric(12,2) not null check(charter_sell_eur>0),
 handling_sell_eur numeric(12,2) not null check(handling_sell_eur>=0),
 positioning_sell_eur numeric(12,2) not null check(positioning_sell_eur>=0),
 total_sell_eur numeric(12,2) not null check(total_sell_eur>0),
 charter_cost_eur numeric(12,2) not null check(charter_cost_eur>0),
 positioning_cost_eur numeric(12,2) not null check(positioning_cost_eur>=0),
 estimated_total_cost_eur numeric(12,2) not null check(estimated_total_cost_eur>0),
 postflight_policy text not null default 'remain_at_destination'
  check(postflight_policy in('remain_at_destination')),
 customer_terms text not null default 'Fiktiver SIM-Pauschalpreis; Positionierung im Gesamtpreis enthalten. Angebot vorbehaltlich Verfügbarkeit. Keine realen Steuer-/Gebührenauskünfte.',
 created_at timestamptz not null default now(),
 constraint v2_quote_sell_sum check(total_sell_eur=
   charter_sell_eur+handling_sell_eur+positioning_sell_eur),
 constraint v2_quote_cost_sum check(estimated_total_cost_eur=
   charter_cost_eur+positioning_cost_eur),
 constraint v2_quote_pos_gate check(
  (positioning_hours=0 and positioning_sell_eur=0 and positioning_cost_eur=0
   and positioning_from is null and positioning_to is null)
  or (positioning_hours>0 and positioning_sell_eur>0 and positioning_cost_eur>0
   and positioning_from is not null and positioning_to is not null
   and positioning_from<>positioning_to)),
 constraint v2_quote_accept_time check(status<>'accepted' or accepted_at is not null)
);
create index v2_quotes_company_idx on sim.v2_quotes(company_id,created_at desc);
alter table sim.v2_quotes enable row level security;
revoke all on sim.v2_quotes from public,anon,authenticated;

create function sim.v2_quote_lock_issued_terms()
returns trigger language plpgsql set search_path='' as $lock$
begin
 -- The issued customer price, positioning and commercial terms never change.
 if (to_jsonb(new)-'status'-'accepted_at') is distinct from
     (to_jsonb(old)-'status'-'accepted_at') then
  raise exception 'Issued V2 quote terms are immutable' using errcode='22023';end if;
 if old.status<>'offered' or new.status not in('accepted','declined','expired')
 then raise exception 'Only the first customer decision can change a quote status'
  using errcode='22023';end if;
 if new.status='accepted' and new.accepted_at is null then
  raise exception 'Accepted quotes require acceptance timestamp'
  using errcode='22023';end if;
 if new.status<>'accepted' and new.accepted_at is not null then
  raise exception 'Only accepted quote may carry acceptance timestamp'
  using errcode='22023';end if;
 return new;
end $lock$;
create trigger v2_lock_issued_terms before update on sim.v2_quotes
 for each row execute function sim.v2_quote_lock_issued_terms();
revoke all on function sim.v2_quote_lock_issued_terms() from public,anon,authenticated;

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
  'quotes',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'request_id',q.request_id,'request_code',r.request_code,
    'version',q.version,'status',q.status,'valid_until',q.valid_until,
    'aircraft_registration',a.registration,'aircraft_type',a.aircraft_type,
    'quoted_aircraft_position',q.quoted_aircraft_position,
    'origin_icao',r.origin_icao,'destination_icao',r.destination_icao,
    'estimated_charter_hours',r.estimated_hours,
    'estimated_positioning_hours',q.positioning_hours,
    'positioning_from',q.positioning_from,
    'positioning_to',q.positioning_to,
    'charter_sell_eur',q.charter_sell_eur,
    'handling_sell_eur',q.handling_sell_eur,
    'positioning_sell_eur',q.positioning_sell_eur,
    'total_sell_eur',q.total_sell_eur,
    'charter_cost_eur',q.charter_cost_eur,
    'positioning_cost_eur',q.positioning_cost_eur,
    'estimated_total_cost_eur',q.estimated_total_cost_eur,
    'estimated_margin_eur',q.total_sell_eur-q.estimated_total_cost_eur,
    'estimated_margin_pct',round(
      ((q.total_sell_eur-q.estimated_total_cost_eur)/q.total_sell_eur)*100,1),
    'postflight_policy',q.postflight_policy,
    'customer_terms',q.customer_terms,
    'accepted_at',q.accepted_at,
    'created_at',q.created_at)
   order by q.created_at desc)
    from sim.v2_quotes q join sim.v2_requests r on r.id=q.request_id
    join sim.v2_aircraft a on a.id=q.aircraft_id
    where q.company_id=cid),'[]'::jsonb),
  'finance_reviews',coalesce((select jsonb_agg(jsonb_build_object(
     'request_id',r.id,'code',r.request_code,'customer_total_eur',q.total_sell_eur,
     'quoted_cost_eur',q.estimated_total_cost_eur,
     'posted_revenue_eur',coalesce(l.revenue,0),
     'posted_sim_cost_eur',coalesce(l.cost,0),
     'planned_margin_eur',q.total_sell_eur-q.estimated_total_cost_eur,
     'posted_sim_contribution_eur',coalesce(l.revenue,0)-coalesce(l.cost,0),
     'sim_cost_variance_eur',coalesce(l.cost,0)-q.estimated_total_cost_eur,
     'postflight_aircraft_position',a.current_icao,
     'completed_at',r.completed_at)
    order by r.completed_at desc)
   from sim.v2_requests r
    join sim.v2_quotes q on q.request_id=r.id
    left join sim.v2_aircraft a on a.id=r.aircraft_id
    left join lateral(
     select sum(case when kind='revenue' then amount_eur else 0 end) revenue,
            sum(case when kind='cost' then amount_eur else 0 end) cost
     from sim.v2_ledger l where l.request_id=r.id
    )l on true
   where r.company_id=cid and r.status='completed'),'[]'::jsonb),
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


