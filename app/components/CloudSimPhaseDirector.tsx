'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,CloudOff,Gauge,Link2,Lock,
 Navigation,PauseCircle,Play,RadioTower,RefreshCw,ShieldCheck} from 'lucide-react';
import {createBrowserClient} from '@supabase/ssr';
import styles from './CloudSimPhaseDirector.module.css';

type LiveSample={
 phase:string;observed_at:string;received_at:string;
 altitude_ft:number|null;groundspeed_kt:number|null;latitude:number|null;longitude:number|null;
};
type CloudLink={
 link_id:string;request_id:string;device_name:string;session_id:string;
 status:'receiving'|'offline'|'device_revoked'|'mission_not_running';
 last_sample:LiveSample|null;
};
type SourceOverview={
 links:CloudLink[];simulation_only:true;automatic_phase_control:false;
 real_flights_modified:0;real_crew_modified:0;financial_postings:0;
};
type SyncAck={
 changed:boolean;reason:string;mission_phase:string;cloud_phase?:string;
 simulation_only:true;automatic_phase_control:true;requires_opt_in:true;
 real_flights_modified:0;financial_postings:0;
};
const phases=[
 {sim:'boarding',cloud:null,title:'Boarding'},
 {sim:'taxi_out',cloud:'TAXI_OUT',title:'Taxi Out'},
 {sim:'takeoff',cloud:'TAKEOFF',title:'Takeoff'},
 {sim:'climb',cloud:'CLIMB',title:'Climb'},
 {sim:'cruise',cloud:'CRUISE',title:'Cruise'},
 {sim:'descent',cloud:'DESCENT',title:'Descent'},
 {sim:'approach',cloud:'APPROACH',title:'Approach'},
 {sim:'landing',cloud:'LANDING',title:'Landing'},
 {sim:'taxi_in',cloud:'TAXI_IN',title:'Taxi In'},
 {sim:'arrived',cloud:null,title:'Arrived'}
] as const;
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase-Browserkonfiguration fehlt');
 return createBrowserClient(url,key);
}
function number(v:number|null,suffix:string,dec=0){
 return typeof v==='number'&&Number.isFinite(v)?
  v.toLocaleString('de-DE',{maximumFractionDigits:dec})+' '+suffix:'Nicht verfügbar';
}
function age(iso:string|null,now:number){
 if(!iso)return null;
 const t=Date.parse(iso);
 return Number.isFinite(t)?Math.round((now-t)/1000):null;
}
const reasons:Record<string,string>={
 no_owned_cloud_link:'Noch keine aktive Zuordnung zwischen dieser SIM-Mission und deinem Cloud-Gerät.',
 waiting_for_two_fresh_matching_samples:'Benötigt zwei aktuelle, übereinstimmende Flugphasenmessungen.',
 local_bridge_controls_phase:'Die separate lokale Trainings-Bridge steuert diese Mission bereits.',
 mission_not_running:'Mission ist nicht aktiv oder befindet sich in der Ankunftsphase.',
 phase_not_safe_to_map:'Parken/Unbekannt erlauben keinen automatischen Start oder Abschluss.',
 already_aligned:'Missionsphase und bestätigte Cloud-Phase sind bereits gleich.',
 manual_alignment_required:'Die Cloud ist mehrere Phasen voraus. Fehlende Phasen müssen geprüft werden.',
 out_of_order_or_go_around_requires_review:'Rücksprung oder Durchstarten erkannt. Manuelle Prüfung erforderlich.',
 phase_advanced:'Eine bestätigte SIM-Flugphase wurde übernommen.'
};
export default function CloudSimPhaseDirector({requestId,missionPhase,lifecycle,onMissionUpdated}:{
 requestId:string;missionPhase:string;lifecycle:string;
 onMissionUpdated:()=>Promise<void>;
}){
 const [link,setLink]=useState<CloudLink|null>(null);
 const [auto,setAuto]=useState(false);
 const [lastResult,setLastResult]=useState<SyncAck|null>(null);
 const [status,setStatus]=useState<'loading'|'available'|'error'>('loading');
 const [problem,setProblem]=useState('');
 const [syncing,setSyncing]=useState(false);
 const [now,setNow]=useState(Date.now());
 const busy=useRef(false);
 const onUpdated=useRef(onMissionUpdated);
 useEffect(()=>{onUpdated.current=onMissionUpdated;},[onMissionUpdated]);
 const read=useCallback(async()=>{
  try{
   const r=await client().rpc('aervelys_msfs_charter_links_overview');
   const data=r.data as SourceOverview|null;
   if(r.error||!data||data.simulation_only!==true||data.automatic_phase_control!==false||
    data.real_flights_modified!==0||data.real_crew_modified!==0||
    !Array.isArray(data.links))throw Error('Invalid SIM status response');
   setLink(data.links.find(x=>x.request_id===requestId)||null);
   setStatus('available');setProblem('');
  }catch{
   setLink(null);setStatus('error');
   setProblem('Geschützter Cloud-Sitzungsstatus nicht verfügbar. Anmeldung oder CEO-/OPS-Rolle prüfen.');
  }
 },[requestId]);
 useEffect(()=>{
  void read();
  const id=window.setInterval(()=>{setNow(Date.now());void read();},12000);
  return()=>window.clearInterval(id);
 },[read]);
 const received=age(link?.last_sample?.received_at||null,now);
 const observed=age(link?.last_sample?.observed_at||null,now);
 const fresh=Boolean(link?.status==='receiving'&&received!==null&&observed!==null&&
  received>=-15&&received<=45&&observed>=-15&&observed<=45);
 const cloudPhase=fresh?link?.last_sample?.phase||null:null;
 const normalized=phases.find(p=>p.cloud===cloudPhase)?.sim||null;
 const phaseMatch=normalized!==null&&normalized===missionPhase;
 const simService=missionPhase==='boarding'||missionPhase==='cruise';
 const safeCabin=simService&&!fresh?null:simService&&fresh&&phaseMatch;
 const canSync=Boolean(lifecycle==='running'&&fresh&&link&&!busy.current);
 const sync=useCallback(async()=>{
  if(busy.current)return;
  busy.current=true;setSyncing(true);setProblem('');
  try{
   const r=await client().rpc('aervelys_sim_cloud_phase_sync',{p_request_id:requestId});
   const ack=r.data as SyncAck|null;
   if(r.error||!ack||ack.simulation_only!==true||ack.automatic_phase_control!==true||
    ack.requires_opt_in!==true||ack.real_flights_modified!==0||
    ack.financial_postings!==0)throw Error(r.error?.message||'Cloud-Sync-RPC nicht verfügbar');
   setLastResult(ack);
   if(ack.changed)await onUpdated.current();
  }catch{
   setAuto(false);
   setProblem('Flugphasenabgleich gestoppt: Geschützte Telemetrie oder SIM-Berechtigungen prüfen.');
  }finally{busy.current=false;setSyncing(false);}
 },[requestId]);
 useEffect(()=>{
  if(!auto||!fresh||lifecycle!=='running')return;
  void sync();
  const id=window.setInterval(()=>void sync(),12000);
  return()=>window.clearInterval(id);
 },[auto,fresh,lifecycle,sync]);
 useEffect(()=>{if(lifecycle!=='running')setAuto(false);},[lifecycle]);
 return <section className={styles.root} aria-label="AERVELYS Flight Experience Cloud Sync">
  <header className={styles.head}>
   <div>
    <div className="eyebrow">FLIGHT EXPERIENCE / EVIDENCE-BASED SYNC</div>
    <h4><RadioTower size={20}/> MSFS-Phasenabgleich & Kabinenstatus</h4>
    <p>Abgleich der gespeicherten Missionsphase mit der verknüpften Cloud-Sitzung. Die bestehende Windows-Bridge bleibt unverändert.</p>
   </div>
   <span className={fresh?styles.online:styles.offline}>
    {fresh?<Activity size={15}/>:<CloudOff size={15}/>}
    {fresh?'Aktuelle Cloud-Messung':status==='loading'?'Wird geladen':'Keine aktuelle Cloud-Evidenz'}
   </span>
  </header>
  {problem&&<p className={styles.error} role="alert"><AlertTriangle size={16}/>{problem}</p>}
  <div className={styles.values}>
   <div><small>SIM-MISSION</small><strong>{phases.find(p=>p.sim===missionPhase)?.title||missionPhase}</strong><span>Aktuelle Phase in AERVELYS</span></div>
   <div><small>CLOUD-MSFS</small><strong>{cloudPhase||'—'}</strong><span>{fresh?'Zuletzt vom Server empfangen':'Keine aktuellen Messwerte'}</span></div>
   <div><small>FLUGHÖHE MSL</small><strong>{fresh?number(link?.last_sample?.altitude_ft??null,'ft'):'—'}</strong><span>Keine AGL-Schätzung</span></div>
   <div><small>GROUND SPEED</small><strong>{fresh?number(link?.last_sample?.groundspeed_kt??null,'kt',1):'—'}</strong><span>Quelle: verknüpftes Cloud-Gerät</span></div>
  </div>
  <div className={styles.phases} aria-label="SIM-Flugfortschritt">
   {phases.map((p,i)=>{
    const missionIndex=phases.findIndex(x=>x.sim===missionPhase);
    const cloudIndex=phases.findIndex(x=>x.cloud===cloudPhase);
    return <div key={p.sim} className={[styles.phase,i<missionIndex?styles.past:'',
      i===missionIndex?styles.current:'',cloudPhase&&i===cloudIndex?styles.cloud:''].join(' ')}>
     <span>{String(i+1).padStart(2,'0')}</span><strong>{p.title}</strong>
    </div>;
   })}
  </div>
  <div className={styles.state}>
   <div><ShieldCheck size={18}/><strong>Kabinen-Hinweis</strong>
    <p>{safeCabin===false?
     'AERVELYS und MSFS melden unterschiedliche Servicephasen. Kabinenservice bitte bis zur Klärung zurückstellen.':
     safeCabin===true?'Gespeicherte SIM-Phase und Cloud-Phase stimmen überein; normale SIM-Servicephasenregeln gelten.':
     simService?'SIM-Servicephase verfügbar, aber keine bestätigte Cloud-Übereinstimmung. Keine Aussage zu Turbulenz/Anschnallzeichen.':
     'In dieser SIM-Phase ist regulärer Kabinenservice nicht freigegeben.'}</p>
   </div>
   <div><Navigation size={18}/><strong>Verbindungsnachweis</strong>
    <p>{link?'Gerät: '+link.device_name+' · Cloud-Sitzung '+link.session_id.slice(0,8)+
     ' · letzte Messung '+(received===null?'—':Math.max(0,received)+' s')+' alt':
     'Keine Cloud-Sitzung zugeordnet. Unter MSFS-Integration einen echten Simulatorlauf zuweisen.'}</p>
   </div>
  </div>
  <div className={styles.controls}>
   <div><strong>Optionaler automatischer SIM-Phasenabgleich</strong>
    <p>Nur während diese Seite geöffnet ist. Benötigt zwei passende aktuelle Cloud-Messungen; verarbeitet ausschließlich den nächsten erlaubten Phasenschritt. Keine automatische Ankunft, kein Kabinenservice und keine realen Flugbetriebsänderungen.</p></div>
   <div className={styles.buttons}>
    <button type="button" className={styles.secondary} disabled={!canSync||syncing}
     onClick={()=>void sync()}><RefreshCw size={15}/> Einmal abgleichen</button>
    <button type="button" aria-pressed={auto} className={auto?styles.activeButton:styles.primary}
     disabled={lifecycle!=='running'||(!auto&&!fresh)}
     onClick={()=>setAuto(!auto)}>{auto?<PauseCircle size={16}/>:<Play size={16}/>}
     {auto?'Auto-Sync stoppen':'Auto-Sync aktivieren'}</button>
   </div>
  </div>
  {lastResult&&<p className={styles.result}>
   {lastResult.changed?<CheckCircle2 size={15}/>:<Lock size={15}/>}
   {reasons[lastResult.reason]||'Cloud-Status kontrolliert.'}
   {lastResult.cloud_phase?' · Cloud: '+lastResult.cloud_phase:''}
  </p>}
  <footer><ShieldCheck size={15}/> Nur SIM, ausdrücklich opt-in. Zuordnungen ohne sichere, aktuelle Evidenz bewirken keine Phasenänderung. Flugzeug, Crew und Finanzen bleiben unangetastet.</footer>
 </section>;
}
