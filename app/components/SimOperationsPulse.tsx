'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,ArrowUpRight,Armchair,HeartPulse,Plane,RefreshCw,ShieldAlert} from 'lucide-react';
import {assessCabin,type CabinPassengerState,type CabinEventState} from '../lib/simCabinDirector';
import styles from './SimOperationsPulse.module.css';

type SimMission={request_id:string;phase:string;lifecycle:string;elapsed_minutes:number};
type SimRequest={request_id:string;request_code:string;origin_icao:string;destination_icao:string};
type PulseSnapshot={missions:SimMission[];requests:SimRequest[];passengers:CabinPassengerState[];
 events:CabinEventState[];simulation_only:true;real_flight_approvals:false;
 simconnect_connected:false;route_source:'pilot_simbrief_paste'};
type ActiveMission={
 id:string;code:string;origin:string;destination:string;phase:string;minutes:number;
 pax:number;satisfaction:number|null;services:number;urgent:number;
};
function client(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('Supabase fehlt');
 return createBrowserClient(u,k);
}
export default function SimOperationsPulse({onNavigate}:{onNavigate:(name:string)=>void}){
 const [data,setData]=useState<PulseSnapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const fetchData=useCallback(async()=>{
  try{
   const {data:value,error:e}=await client().rpc('aervelys_sim_missions_overview');
   const snapshot=value as PulseSnapshot|null;
   if(e||!snapshot||snapshot.simulation_only!==true||
      snapshot.real_flight_approvals!==false||snapshot.simconnect_connected!==false||
      !Array.isArray(snapshot.requests)||!Array.isArray(snapshot.missions)||
      !Array.isArray(snapshot.passengers)||!Array.isArray(snapshot.events))
    throw Error('Unexpected protected SIM snapshot');
   setData(snapshot);setError(false);
  }catch{setError(true);setData(null);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void fetchData();
  const t=window.setInterval(()=>void fetchData(),60000);
  return()=>window.clearInterval(t);
 },[fetchData]);
 const missions=useMemo<ActiveMission[]>(()=>data?.missions.filter(m=>m.lifecycle==='running')
  .map(m=>{
   const req=data.requests.find(r=>r.request_id===m.request_id);
   const pax=data.passengers.filter(p=>p.request_id===m.request_id);
   const events=data.events.filter(e=>e.request_id===m.request_id);
   const assessment=assessCabin(pax,events,m.phase,m.lifecycle);
   return {id:m.request_id,code:req?.request_code||'AV-SIM',
    origin:req?.origin_icao||'—',destination:req?.destination_icao||'—',
    phase:m.phase,minutes:m.elapsed_minutes,
    pax:assessment.total,satisfaction:assessment.averageSatisfaction,
    services:events.filter(e=>e.event_kind==='service').length,
    urgent:assessment.critical};
  })||[],[data]);
 const readyCases=data?.requests.length||0;
 const onboard=data?.passengers.length||0;
 const urgent=missions.reduce((acc,m)=>acc+m.urgent,0);
 return <section className={styles.root} aria-label="SIM Airline Operations Pulse">
  <div className={styles.head}>
   <div><div className="eyebrow">SIM OPERATIONS / FLIGHT EXPERIENCE</div>
    <h3><Armchair size={20}/> Airline Experience Monitor</h3>
    <p>Live aus deiner geschützten SIM-Datenbasis. Kabinenbedarf und Flugfortschritt bleiben strikt von realen Flugfreigaben getrennt.</p>
   </div>
   <div className={styles.actions}>
    <button type="button" aria-label="SIM-Status aktualisieren" onClick={()=>void fetchData()}
     className={styles.refresh} disabled={loading}><RefreshCw size={15}/></button>
    <button type="button" className={styles.open}
     onClick={()=>onNavigate('SIM-Flugbetrieb & Kabine')}>
     Kabinencockpit <ArrowUpRight size={15}/>
    </button>
   </div>
  </div>
  {error?<div className={styles.error}><ShieldAlert size={16}/> Geschützte SIM-Daten aktuell nicht abrufbar. CEO-/OPS-Zugriff prüfen.</div>:
   <div className={styles.kpis}>
    <div><Plane size={16}/><strong>{loading&&!data?'—':missions.length}</strong><small>Laufende SIM-Missionen</small></div>
    <div><Activity size={16}/><strong>{loading&&!data?'—':readyCases}</strong><small>Virtuelle Charterfälle</small></div>
    <div><HeartPulse size={16}/><strong>{loading&&!data?'—':onboard}</strong><small>Simulierte Passagiere</small></div>
    <div><ShieldAlert size={16}/><strong>{loading&&!data?'—':urgent}</strong><small>Dringende Servicehinweise</small></div>
   </div>}
  {!error&&missions.length===0&&!loading&&
   <div className={styles.empty}><span><Plane size={23}/></span>
    <div><strong>Keine SIM-Mission gestartet</strong>
     <p>Deine Charterfälle sind vorbereitet. Starte im Kabinencockpit einen Trainingsflug, um hier Flugfortschritt, Passagierzufriedenheit und Serviceaufgaben zu sehen.</p></div>
    <button type="button" onClick={()=>onNavigate('SIM-Flugbetrieb & Kabine')}>
     Trainingsflug öffnen <ArrowUpRight size={15}/></button>
   </div>}
  {missions.length>0&&<div className={styles.missions}>
   {missions.slice(0,4).map(m=><button type="button" key={m.id}
    className={styles.flight} onClick={()=>onNavigate('SIM-Flugbetrieb & Kabine')}>
    <div><small>{m.code} / TRAINING</small>
     <strong>{m.origin} → {m.destination}</strong>
     <span>{m.phase.replaceAll('_',' ').toUpperCase()} · {m.minutes} SIM-Minuten</span></div>
    <div className={styles.flightRight}>
     <strong>{m.satisfaction===null?'—':m.satisfaction.toFixed(1)}<span>/100</span></strong>
     <small>{m.pax} PAX · {m.urgent} dringend</small>
     <ArrowUpRight size={16}/>
    </div>
   </button>)}
  </div>}
  <div className={styles.foot}><ShieldAlert size={14}/> SIM-only · Nur gespeicherte virtuelle Datensätze; keine echten Flüge, Umsätze oder automatisch angestoßenen Services.</div>
 </section>;
}
