'use client';

import {useCallback,useEffect,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,Bot,CheckCircle2,Plane,RefreshCw,ShieldAlert,Users} from 'lucide-react';
import styles from './AirlineReadinessOverview.module.css';

type Snapshot={
 fleet:{total:number;available_status:number;verified_performance:number;maintenance_released:number;insurance_verified:number};
 crew:{active_pilots:number;verified_type_ratings:number;verified_logbooks:number};
 sales:{sim_profiles:number;sim_requests:number;sim_fleet_plans:number;sim_cases_with_candidates:number};
 ops:{real_flights:number;open_evidence_tasks:number;review_needed:number;resolution_variants:number};
 sim_flights:{missions:number;running:number;completed:number;sim_passengers:number;manual_phase_only:true;simconnect_connected:false};
 automation:{agents_enabled:boolean;sim_customers_enabled:boolean;active_sim_crons:number};
 requirements:string[];simulation_only:true;operational_ready:false;readiness_metric_is_factual:true;
};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase not available');
 return createBrowserClient(url,key);
}
export default function AirlineReadinessOverview({openMission}:{openMission:()=>void}){
 const [value,setValue]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const r=await client().rpc('aervelys_airline_readiness_overview');
   const s=r.data as Snapshot|null;
   if(r.error||!s||s.simulation_only!==true||s.operational_ready!==false||
      s.sim_flights?.simconnect_connected!==false||!Array.isArray(s.requirements))
    throw Error('Readiness data denied');
   setValue(s);setError('');
  }catch{setValue(null);setError('Betriebsbereitschaft derzeit nicht abrufbar. CEO-/OPS-Anmeldung erforderlich.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 return <section className={'panel '+styles.root} aria-label="Aktueller AERVELYS Airline-Betriebsbereitschaftsstatus">
  <div className={styles.header}>
   <div><div className="eyebrow">LAUNCH READINESS / MEASURED DATA</div>
    <h2>Airline-Betriebsbereitschaft</h2>
    <p>Live-Fakten statt erfundener Fertigstellungsprozente: Simulation und tatsächlich nachgewiesene operative Bereitschaft bleiben getrennt.</p></div>
   <button className="ops-refresh" type="button" disabled={loading} onClick={()=>void load()}>
    <RefreshCw size={15}/> Aktualisieren
   </button>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {!value&&!error&&<p className={styles.caption}>Daten werden geladen …</p>}
  {value&&<>
   <div className={styles.banner}><ShieldAlert size={18}/><span>
    <strong>Airline-Simulation im Aufbau · kein freigegebener Flugbetrieb.</strong>
    Die Simulator-Missionen sind manuell; MSFS-Telemetrie, Versicherungsnachweise und vollständige Crew-/Flottenfreigaben fehlen weiterhin.
   </span></div>
   <div className={styles.grid}>
    <article><Plane size={19}/><strong>{value.fleet.total}</strong><span>Flugzeuge erfasst</span>
     <small>{value.fleet.verified_performance} Leistungsprofile geprüft · {value.fleet.maintenance_released} Wartungsfreigaben</small></article>
    <article><Users size={19}/><strong>{value.crew.active_pilots}</strong><span>Aktive Piloten</span>
     <small>{value.crew.verified_type_ratings} geprüfte Musterberechtigungen · {value.crew.verified_logbooks} Stundenregister</small></article>
    <article><Bot size={19}/><strong>{value.sales.sim_requests}</strong><span>Virtuelle Charterfälle</span>
     <small>{value.sales.sim_cases_with_candidates} mit Kandidat · {value.sales.sim_profiles} SIM-Kundenprofile</small></article>
    <article><Activity size={19}/><strong>{value.sim_flights.missions}</strong><span>SIM-Missionen</span>
     <small>{value.sim_flights.running} laufend · {value.sim_flights.completed} abgeschlossene Debriefs</small></article>
    <article><ShieldAlert size={19}/><strong>{value.ops.open_evidence_tasks}</strong><span>Offene Fachnachweise</span>
     <small>{value.ops.review_needed} ungesehene OPS-Prüfaufträge</small></article>
    <article><CheckCircle2 size={19}/><strong>{value.automation.active_sim_crons}</strong><span>Aktive SIM-Automationszyklen</span>
     <small>Agenten {value.automation.agents_enabled?'aktiv':'pausiert'} · Kunden {value.automation.sim_customers_enabled?'aktiv':'pausiert'}</small></article>
   </div>
   <div className={styles.bottom}>
    <div><h3>Vor Gesamtfreigabe noch zu erledigen</h3>
     <ul>{value.requirements.map(r=><li key={r}>{r}</li>)}</ul></div>
    <div className={styles.start}>
     <strong>SIM-Flugbetrieb</strong>
     <p>Charter, Flugphasen und fiktiven Kabinenservice direkt im neuen Missionsmodul ausprobieren.</p>
     <button type="button" className="ops-refresh" onClick={openMission}>
      <Plane size={15}/> SIM-Missionen öffnen
     </button>
    </div>
   </div>
  </>}
 </section>;
}
