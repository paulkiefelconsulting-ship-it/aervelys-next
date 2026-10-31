'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowLeftRight,CalendarClock,RefreshCw,ShieldAlert,UsersRound} from 'lucide-react';
import styles from './VirtualResolutionComparison.module.css';

type Option={
 id:number;decision_id:number;request_id:string;
 variant_key:'keep_plan'|'switch_aircraft'|'delay_24h';
 label:string;aircraft_registration:string|null;aircraft_type:string|null;
 proposed_departure:string;simulated_floor_eur:number|null;positioning_component_eur:number|null;
 aircraft_plan_conflicts:number;roster_pic_candidates:number;roster_sic_candidates:number;
 verified_pic_candidates:number;verified_sic_candidates:number;
 seat_capacity_verified:boolean;operationally_usable:false;
 finding:string;warnings:string[];evidence:Record<string,unknown>;updated_at:string;
};
type Overview={
 options:Option[];simulation_only:true;llm_connected:false;operational_approval:false;
 model_label:string;
};
type Sync={
 cases_examined:number;variants_changed:number;simulation_only:true;
 real_flight_changes:0;real_crew_assignments:0;external_operator_bookings:0;
 llm_connected:false;skipped?:string;
};
const eur=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const readableDate=(value:string)=>{
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Unbekannt':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
export default function VirtualResolutionComparison(){
 const [data,setData]=useState<Overview|null>(null);
 const [selected,setSelected]=useState<number>(0);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const result=await client().rpc('aervelys_virtual_resolutions_overview');
   const payload=result.data as Overview|null;
   if(result.error||!payload||!Array.isArray(payload.options)||
     payload.simulation_only!==true||payload.llm_connected!==false||
     payload.operational_approval!==false)throw new Error('SIM-Varianten nicht zugänglich');
   setData(payload);
   setSelected(old=>payload.options.some(o=>o.decision_id===old)?old:payload.options[0]?.decision_id||0);
   setError('');
  }catch{
   setData(null);setError('Variantenvergleich nicht erreichbar. Bitte CEO-/OPS-Berechtigung und Supabase-Verbindung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void refresh();
  const t=window.setInterval(()=>void refresh(true),90000);
  return()=>window.clearInterval(t);
 },[refresh]);
 async function regenerate(){
  if(busy||loading)return;
  setBusy(true);setNotice('');setError('');
  try{
   const r=await client().rpc('aervelys_virtual_resolutions_sync',{p_limit:30});
   const v=r.data as Sync|null;
   if(r.error||!v||v.simulation_only!==true||v.llm_connected!==false||
    (v.real_flight_changes!==undefined&&v.real_flight_changes!==0)||
    (v.real_crew_assignments!==undefined&&v.real_crew_assignments!==0)||
    (v.external_operator_bookings!==undefined&&v.external_operator_bookings!==0))
     throw new Error('SIM-Variantenlauf nicht bestätigt');
   setNotice(v.skipped?'Variantenabgleich übersprungen: '+v.skipped:
    v.cases_examined+' SIM-Fälle geprüft · '+v.variants_changed+' Varianten neu oder nach Datenänderung aktualisiert.');
   await refresh(true);
  }catch{setError('SIM-Varianten konnten nicht bestätigt werden. Keine operative Aktion ausgeführt.');}
  finally{setBusy(false);}
 }
 const grouped=useMemo(()=>{
  const ids=new Set<number>();
  return (data?.options||[]).filter(o=>{
   if(ids.has(o.decision_id))return false;
   ids.add(o.decision_id);return true;
  });
 },[data]);
 const alternatives=(data?.options||[]).filter(o=>o.decision_id===selected).sort((a,b)=>{
  const order={keep_plan:0,switch_aircraft:1,delay_24h:2};
  return order[a.variant_key]-order[b.variant_key];
 });
 const current=alternatives.length?alternatives:
  (data?.options||[]).filter(o=>o.decision_id===grouped[0]?.decision_id);
 const base=current.find(o=>o.variant_key==='keep_plan');
 const totalOptions=data?.options.length||0;
 const unavailable=(data?.options||[]).filter(o=>!o.operationally_usable).length;
 return <section className={'virtual-staff-block '+styles.root} aria-label="SIM-Lösungsalternativen vergleichen">
  <div className={styles.head}>
   <div>
    <div className="eyebrow">OPS RECOVERY ALTERNATIVES / UNVERIFIED SIM MODEL</div>
    <h3>Flugzeug-, Crew- und Kostenvarianten</h3>
    <p>Die virtuellen Abteilungen vergleichen Planungsszenarien, ohne Flugzeuge zu buchen, Crew zuzuweisen oder Freigaben vorzutäuschen.</p>
   </div>
   <div className={styles.actions}>
    <button type="button" className="ops-refresh" disabled={loading||busy} onClick={()=>void refresh()}>
     <RefreshCw size={15}/> Aktualisieren
    </button>
    <button type="button" className="ops-refresh" disabled={loading||busy||!data} onClick={()=>void regenerate()}>
     <ArrowLeftRight size={15}/>{busy?'Vergleiche …':'Varianten neu berechnen'}
    </button>
   </div>
  </div>
  <div className={styles.guard}><ShieldAlert size={17}/>
   <span>Alle Preise sind fiktive Rechenwerte aus dem SIM-Vertriebsmodell, keine echten Flugkosten oder Angebote. Flotte aktuell nicht freigegeben; Sitzplätze, Flugstunden, Lizenzen, medizinische Nachweise und Crew-Einsatzbereitschaft sind nicht abschließend verifiziert.</span>
  </div>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {data&&<>
   <div className={styles.stats}>
    <div><strong>{grouped.length}</strong><span>Verglichene SIM-Prüffälle</span></div>
    <div><strong>{totalOptions}</strong><span>Gespeicherte Varianten</span></div>
    <div><strong>{unavailable}</strong><span>Nicht operativ freigegeben</span></div>
   </div>
   {grouped.length>0&&<>
    <div className={styles.selector}>
     <label htmlFor="sim-resolution-case">Charterfall auswählen</label>
     <select id="sim-resolution-case" value={current[0]?.decision_id||0}
       onChange={e=>setSelected(Number(e.target.value))}>
      {grouped.map(o=><option key={o.decision_id} value={o.decision_id}>
       SIM-Fall #{o.decision_id}
      </option>)}
     </select>
    </div>
    <div className={styles.grid}>
     {current.map(option=>{
      const cost=option.simulated_floor_eur;
      const difference=cost!==null&&base?.simulated_floor_eur!=null?
       cost-base.simulated_floor_eur:null;
      return <article className={styles.option} key={option.id}>
       <div className={styles.optionHead}>
        <h4>{option.label}</h4>
        <span>{option.variant_key==='keep_plan'?'Bestand':option.variant_key==='switch_aircraft'?'Alternative':'Zeitfenster'}</span>
       </div>
       <div className={styles.cost}>
        <strong>{cost!==null?eur.format(Number(cost)):'Kein Kostenwert'}</strong>
        <small>Fiktiver SIM-Kostenboden</small>
       </div>
       <p className={styles.delta}>{difference===null?'Vergleich nicht möglich':
        difference===0?'Gleicher Modellwert wie Bestand':
        (difference>0?'+':'')+eur.format(difference)+' gegenüber Bestand'}</p>
       <div className={styles.info}>
        <div><span>Flugzeug</span><strong>{option.aircraft_registration||'Kein Kandidat'}</strong></div>
        <div><span>Muster</span><strong>{option.aircraft_type||'Nicht bestimmt'}</strong></div>
        <div><span><CalendarClock size={13}/> SIM-Abflug</span><strong>{readableDate(option.proposed_departure)}</strong></div>
        <div><span>Andere SIM-Pläne ±6 h</span><strong>{option.aircraft_plan_conflicts}</strong></div>
        <div><span><UsersRound size={13}/> PIC-/SIC-Roster ohne Dienstblock</span>
         <strong>{option.roster_pic_candidates} / {option.roster_sic_candidates}</strong></div>
        <div><span>Nachgewiesene Typberechtigung PIC/SIC</span>
         <strong>{option.verified_pic_candidates} / {option.verified_sic_candidates}</strong></div>
       </div>
       <p className={styles.finding}>{option.finding}</p>
       {option.warnings.length>0&&<div className={styles.warnings}>
        <strong>Offene Nachweise</strong>
        <ul>{option.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
       </div>}
       <small className={styles.nonbinding}>Planungsalternative · nicht reserviert · keine Flugfreigabe</small>
      </article>;
     })}
    </div>
   </>}
   <p className={styles.disclaimer}>{data.model_label} Der Vergleich berücksichtigt weder echte Streckenflugzeiten noch Gebühren, Flughafenzulassungen oder berechnete Duty-Limits.</p>
  </>}
  {!data&&!error&&<p className={styles.empty}>{loading?'SIM-Varianten werden geladen …':'Noch keine Vergleiche.'}</p>}
 </section>;
}
