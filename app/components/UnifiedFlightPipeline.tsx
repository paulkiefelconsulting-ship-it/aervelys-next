'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowUpRight,CheckCircle2,Clock3,CloudOff,Link2,RefreshCw,ShieldAlert} from 'lucide-react';
import {composeLifecycle,type LifecycleFeeds,type LifecycleFlight,type Stage} from '../lib/nextIntegrationPipeline';
import styles from './UnifiedFlightPipeline.module.css';

const empty:LifecycleFeeds={charters:null,dispatch:null,simRequests:null,missions:null,links:null};
const stages:{key:'charter'|'planning'|'mission'|'evidence';name:string}[]=[
 {key:'charter',name:'Charter'},
 {key:'planning',name:'Disposition'},
 {key:'mission',name:'SIM-Mission'},
 {key:'evidence',name:'MSFS-Evidenz'}
];
function formatDate(value:string|null){
 if(!value)return 'Termin nicht hinterlegt';
 const t=Date.parse(value);
 return Number.isFinite(t)?new Date(t).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):
  'Termin nicht lesbar';
}
function label(state:Stage){
 switch(state){
  case 'present':return 'Vorhanden';
  case 'absent':return 'Nicht vorhanden';
  case 'unavailable':return 'Nicht prüfbar';
  default:return 'Nicht anwendbar';
 }
}
function stageTitle(row:LifecycleFlight,key:typeof stages[number]['key']){
 if(key==='charter')return row.charterStatus||'Chartervorgang erfasst';
 if(key==='planning')return row.planningStatus||'Dispositionsentwurf vorhanden';
 if(key==='mission')return [row.missionLifecycle,row.missionPhase].filter(Boolean).join(' · ')||'SIM-Mission erfasst';
 return row.linkStatus==='receiving'?'Cloud-Sitzung empfängt Daten':
  row.linkStatus?'Cloud-Zuordnung: '+row.linkStatus:'Nur eine bestätigte Cloud-Zuordnung zählt';
}
type Props={onNavigate:(target:string)=>void;onOpenDispatch:(requestId:string)=>void};
export default function UnifiedFlightPipeline({onNavigate,onOpenDispatch}:Props){
 const [feeds,setFeeds]=useState<LifecycleFeeds>(empty);
 const [loading,setLoading]=useState(true);
 const [loaded,setLoaded]=useState(false);
 const [refreshedAt,setRefreshedAt]=useState('');
 const [query,setQuery]=useState('');
 const [scope,setScope]=useState<'all'|'sim'>('sim');
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
   const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   if(!url||!key)throw Error('No public Supabase configuration');
   const db=createBrowserClient(url,key);
   const get=async(name:string):Promise<unknown>=>{
    try{const {data,error}=await db.rpc(name);return error?null:data;}catch{return null;}
   };
   const [charters,dispatch,sim,msfs]=await Promise.all([
    get('aervelys_charter_requests_list'),get('aervelys_dispatch_plans_list'),
    get('aervelys_sim_missions_overview'),get('aervelys_msfs_charter_links_overview')
   ]);
   const s=sim as Record<string,unknown>|null;
   const m=msfs as Record<string,unknown>|null;
   const simOk=Boolean(s&&s.simulation_only===true&&s.real_flight_approvals===false&&
    Array.isArray(s.requests)&&Array.isArray(s.missions));
   const msfsOk=Boolean(m&&m.simulation_only===true&&m.automatic_phase_control===false&&
    m.real_flights_modified===0&&m.real_crew_modified===0&&m.financial_postings===0&&
    Array.isArray(m.links));
   setFeeds({
    charters:Array.isArray(charters)?charters:null,
    dispatch:Array.isArray(dispatch)?dispatch:null,
    simRequests:simOk?s!.requests as LifecycleFeeds['simRequests']:null,
    missions:simOk?s!.missions as LifecycleFeeds['missions']:null,
    links:msfsOk?m!.links as LifecycleFeeds['links']:null
   });
  }catch{setFeeds(empty);}
  finally{
   setLoaded(true);setRefreshedAt(new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
   setLoading(false);
  }
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const rows=useMemo(()=>composeLifecycle(feeds),[feeds]);
 const shown=useMemo(()=>{
  const q=query.toLocaleLowerCase('de').trim();
  return rows.filter(r=>(scope==='all'||r.isSim)&&
   [r.code,r.origin,r.destination,r.registration||''].some(v=>
    v.toLocaleLowerCase('de').includes(q))).slice(0,12);
 },[rows,query,scope]);
 const incomplete=Object.values(feeds).some(v=>v===null);
 return <section className={styles.root} aria-label="AERVELYS NEXT verknüpfter Flugablauf">
  <div className={styles.head}>
   <div>
    <div className="eyebrow">AERVELYS NEXT / ONE AIRLINE / ONE FLIGHT LIFECYCLE</div>
    <h3><Link2 size={21}/> Verbundener Flugablauf</h3>
    <p>Charter, Dispatch, virtuelle Mission und Cloud-MSFS-Nachweis über dieselbe Vorgangs-ID.
     Bestehende Systeme werden gelesen, nicht dupliziert oder automatisch freigegeben.</p>
   </div>
   <button className={styles.refresh} type="button" onClick={()=>void refresh()} disabled={loading}>
    <RefreshCw size={15}/> {loading?'Prüfe …':'Aktualisieren'}
   </button>
  </div>
  <div className={styles.process} aria-label="Ablaufstufen">
   {stages.map((s,i)=><div className={styles.processStep} key={s.key}>
    <span className={styles.stepNum}>{String(i+1).padStart(2,'0')}</span>
    <strong>{s.name}</strong>
   </div>)}
  </div>
  <div className={styles.toolbar}>
   <div className={styles.filters} aria-label="Vorgangsfilter">
    <button type="button" className={scope==='sim'?styles.active:''} aria-pressed={scope==='sim'}
     onClick={()=>setScope('sim')}>SIM-Charter</button>
    <button type="button" className={scope==='all'?styles.active:''} aria-pressed={scope==='all'}
     onClick={()=>setScope('all')}>Alle Vorgänge</button>
   </div>
   <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
    aria-label="Flugablauf nach Vorgang oder Route durchsuchen" placeholder="Vorgang, ICAO oder Registrierung suchen"/>
   <small>{loaded?'Stand '+refreshedAt:'Lade Daten'} · {rows.length} verfügbare Vorgänge</small>
  </div>
  {incomplete&&loaded&&<div className={styles.warning} role="status">
   <ShieldAlert size={16}/>
   <span>Ein oder mehrere Datenbereiche sind nicht erreichbar oder nicht freigegeben.
    „Nicht prüfbar“ bedeutet ausdrücklich nicht „nicht vorhanden“.</span>
  </div>}
  {!loaded&&<div className={styles.empty}><Clock3 size={18}/> Geschützte Flugvorgänge werden geprüft …</div>}
  {loaded&&rows.length===0&&<div className={styles.empty}>
   <CloudOff size={18}/> Keine belegten Vorgänge aus den erreichbaren Datenquellen.
   {incomplete?' Mindestens eine Datenquelle ist aktuell nicht prüfbar.':''}
  </div>}
  {loaded&&rows.length>0&&shown.length===0&&<div className={styles.empty}>
   Keine Vorgänge für diese Filterauswahl.</div>}
  {shown.length>0&&<div className={styles.flights}>
   {shown.map(r=><article key={r.id} className={styles.flight}>
    <div className={styles.flightHead}>
     <div>
      <div className={styles.flightCode}>{r.code}
       <span className={r.isSim?styles.simTag:styles.otherTag}>{r.isSim?'SIM':'NICHT SIM-BESTÄTIGT'}</span>
      </div>
      <strong>{r.origin} <span>→</span> {r.destination}</strong>
      <small>{formatDate(r.departure)}{r.registration?' · '+r.registration:''}</small>
     </div>
     <button type="button" onClick={()=>r.planning==='present'?
      onOpenDispatch(r.id):onNavigate('Charter & Angebote')}>
      {r.planning==='present'?'Disposition öffnen':'Charter öffnen'} <ArrowUpRight size={14}/>
     </button>
    </div>
    <div className={styles.stages}>
     {stages.map(s=><div key={s.key} className={styles.stage}
      title={r[s.key]==='present'?stageTitle(r,s.key):label(r[s.key])}>
      <div className={styles.stageName}>{s.name}</div>
      <div className={styles.status} data-status={r[s.key]}>
       {r[s.key]==='present'?<CheckCircle2 size={14}/>:r[s.key]==='unavailable'?
        <ShieldAlert size={14}/>:<span className={styles.dot}/>}
       {label(r[s.key])}
      </div>
      {r[s.key]==='present'&&<div className={styles.stageDetail}>{stageTitle(r,s.key)}</div>}
     </div>)}
    </div>
   </article>)}
  </div>}
  <div className={styles.foot}>
   <span><ShieldAlert size={15}/> Lesen statt Freigeben: SIM-Status ist kein echter Flugabschluss,
    MSFS-Evidenz keine automatische Flugphase und kein Finanzumsatz.</span>
   <button type="button" onClick={()=>onNavigate('Finanzen')}>Finanzen öffnen <ArrowUpRight size={14}/></button>
   <button type="button" onClick={()=>onNavigate('MSFS-Integration')}>MSFS öffnen <ArrowUpRight size={14}/></button>
  </div>
 </section>;
}
