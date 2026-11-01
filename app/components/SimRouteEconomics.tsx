'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,ArrowRight,Calculator,Clock3,MapPinned,Plane,RefreshCw,ShieldAlert,Wallet,Wind} from 'lucide-react';
import styles from './SimRouteEconomics.module.css';

type Projection={
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 requested_departure:string;passengers:number;
 aircraft_id:string;registration:string;aircraft_type:string;aircraft_current_icao:string;
 charter_distance_nm:number|null;charter_block_minutes:number|null;
 positioning_needed:boolean;positioning_origin:string|null;
 positioning_distance_nm:number|null;positioning_block_minutes:number|null;
 hourly_rate_eur:number|null;hourly_rate_verified:boolean;hourly_rate_source:string;
 charter_component_eur:number|null;positioning_component_eur:number|null;
 passenger_component_eur:number;sim_cost_excluding_airport_fees_eur:number|null;
 airport_fee_known_subset_eur:number|null;airport_verified_fee_entries:number;
 airport_fee_coverage_complete:false;timing_source:string;timing_calculated_at:string|null;
 speed_assumption_kt:number|null;buffer_assumption_minutes:number|null;
 range_nm_verified:number|null;range_needs_review:true;
 maintenance_overlap:boolean|null;crew_duty_overlap:boolean|null;
 positioning_window_valid:boolean|null;warnings:string[];
 is_simulation:true;operationally_usable:false;quote_authorized:false;
 finance_postings:0;cost_model:string;
};
type Overview={projections:Projection[];simulation_only:true;
 operational_approval:false;real_financial_postings:0;fees_verified_complete:false;method:string};

function client(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('Supabase-Zugriff nicht konfiguriert');
 return createBrowserClient(u,k);
}
const euro=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const num=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
function money(v:number|null){return typeof v==='number'&&Number.isFinite(v)?euro.format(v):'Noch offen';}
function dist(v:number|null){return typeof v==='number'&&Number.isFinite(v)?num.format(v)+' NM':'Unbekannt';}
function mins(v:number|null){return typeof v==='number'&&Number.isFinite(v)?
 Math.floor(v/60)+' h '+String(v%60).padStart(2,'0')+' min':'Nicht berechenbar';}
function time(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'—':
 d.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'});}

export default function SimRouteEconomics({initialRequestId}:{initialRequestId?:string}){
 const [data,setData]=useState<Overview|null>(null);
 const [requestId,setRequestId]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [showMissing,setShowMissing]=useState(true);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const r=await client().rpc('aervelys_sim_route_economics_overview');
   const v=r.data as Overview|null;
   if(r.error||!v||v.simulation_only!==true||v.operational_approval!==false||
     v.real_financial_postings!==0||v.fees_verified_complete!==false||
     !Array.isArray(v.projections)||
     v.projections.some(p=>p.is_simulation!==true||p.quote_authorized!==false||
       p.operationally_usable!==false||p.airport_fee_coverage_complete!==false))
     throw Error('Ungültiger SIM-Datenvertrag');
   setData(v);
   setRequestId(old=>
    v.projections.some(p=>p.request_id===(initialRequestId||old))?
     (initialRequestId||old):(v.projections[0]?.request_id||''));
   setError('');
  }catch{
   setData(null);setError('Strecken-Kostenmodell nicht abrufbar. CEO-/OPS-Zugriff oder Datenverbindung prüfen.');
  }finally{setLoading(false);}
 },[initialRequestId]);
 useEffect(()=>{void refresh();},[refresh]);
 const cases=useMemo(()=>{
  const seen=new Set<string>();
  return (data?.projections||[]).filter(p=>{
   if(seen.has(p.request_id))return false;
   seen.add(p.request_id);return true;
  });
 },[data]);
 const selected=useMemo(()=>(data?.projections||[])
  .filter(p=>p.request_id===requestId).sort((a,b)=>{
   if(a.sim_cost_excluding_airport_fees_eur===null)return b.sim_cost_excluding_airport_fees_eur===null?0:1;
   if(b.sim_cost_excluding_airport_fees_eur===null)return -1;
   return a.sim_cost_excluding_airport_fees_eur-b.sim_cost_excluding_airport_fees_eur;
  }),[data,requestId]);
 const caseData=selected[0]||null;
 const priced=(data?.projections||[]).filter(p=>p.sim_cost_excluding_airport_fees_eur!==null).length;
 const viewOptions=selected.filter(p=>showMissing||p.sim_cost_excluding_airport_fees_eur!==null);
 return <section className={styles.root} aria-label="AERVELYS SIM-Strecken- und Kostenvergleich">
  <div className={styles.heading}>
   <div><div className="eyebrow">ROUTE INTELLIGENCE / NONBINDING SIM PRICING</div>
    <h3><Calculator size={20}/> Streckenabhängige Charterkalkulation</h3>
    <p>Vergleiche die geschätzte Blockzeit, Positionierung und fiktive Flugkosten verschiedener Flugzeuge. Grundlage sind die bestehenden internen Rotationszeitmodelle, nicht eine bestätigte SimBrief-Flugroute.</p>
   </div>
   <button type="button" className="ops-refresh" disabled={loading} onClick={()=>void refresh()}>
    <RefreshCw size={15}/> Aktualisieren
   </button>
  </div>
  <div className={styles.disclaimer}><ShieldAlert size={17}/>
   <span><strong>Keine Angebotsfreigabe.</strong> Flughafengebühren, Handling, Wetter, Navigation, Tankstopps und operative Nachweise sind nicht vollständig berücksichtigt. Angezeigte Kosten sind nur ein SIM-Teilmodell ohne tatsächliche Buchung oder Gewinn.</span>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {loading&&!data&&<p className={styles.empty}>SIM-Streckenmodelle werden geladen …</p>}
  {data&&<>
   <div className={styles.kpis}>
    <div><Plane size={17}/><strong>{cases.length}</strong><span>Virtuelle Charterstrecken</span></div>
    <div><Activity size={17}/><strong>{data.projections.length}</strong><span>Flugzeug-Strecken-Kombinationen</span></div>
    <div><Wallet size={17}/><strong>{priced}</strong><span>Berechenbare SIM-Teilkosten</span></div>
    <div><ShieldAlert size={17}/><strong>{data.projections.length-priced}</strong><span>Offene Kalkulationen</span></div>
   </div>
   <div className={styles.toolbar}>
    <label>SIM-Charterfall
     <select value={requestId} onChange={e=>setRequestId(e.target.value)}>
      {cases.map(c=><option key={c.request_id} value={c.request_id}>
       {c.request_code} · {c.origin_icao}–{c.destination_icao}
      </option>)}
     </select>
    </label>
    <label className={styles.toggle}>
     <input type="checkbox" checked={showMissing} onChange={e=>setShowMissing(e.target.checked)}/>
     Auch unvollständige Modelle zeigen
    </label>
   </div>
   {caseData&&<div className={styles.routeBanner}>
    <div><small>CHARTER / {caseData.request_code}</small>
     <h4>{caseData.origin_icao} <ArrowRight size={22}/> {caseData.destination_icao}</h4>
     <span><Clock3 size={13}/> Geplanter Abflug: {time(caseData.requested_departure)}</span>
    </div>
    <div><strong>{caseData.passengers}</strong><span>PASSAGIERE</span></div>
   </div>}
   <div className={styles.grid}>
    {viewOptions.map(p=>{
     const available=p.sim_cost_excluding_airport_fees_eur!==null;
     return <article key={p.aircraft_id} className={styles.option}>
      <div className={styles.optionHead}>
       <div><small>{p.aircraft_type}</small><h4>{p.registration}</h4></div>
       <span className={available?styles.calculated:styles.missing}>
        {available?'Teilmodell berechenbar':'Nachweise fehlen'}
       </span>
      </div>
      <div className={styles.estimate}>
       <small>SIM-Teilkosten ohne Flughafengebühren</small>
       <strong>{money(p.sim_cost_excluding_airport_fees_eur)}</strong>
       <p>{p.hourly_rate_verified?'Intern geprüfter Stundenkostensatz':
         'Stundensatz lediglich aus dem fiktiven Muster-Kostenmodell'}</p>
      </div>
      <div className={styles.facts}>
       <div><MapPinned size={15}/><span>Strecke</span><strong>{dist(p.charter_distance_nm)}</strong></div>
       <div><Clock3 size={15}/><span>Blockzeit</span><strong>{mins(p.charter_block_minutes)}</strong></div>
       <div><Plane size={15}/><span>Positionierung</span>
        <strong>{p.positioning_needed?
         (p.positioning_origin+' → '+p.origin_icao+' · '+mins(p.positioning_block_minutes)):'Nicht nötig'}</strong></div>
       <div><Wind size={15}/><span>SIM-Geschwindigkeit</span>
        <strong>{p.speed_assumption_kt!==null?p.speed_assumption_kt+' KT':'Unbekannt'}</strong></div>
      </div>
      <div className={styles.breakdown}>
       <h5>Kostenbestandteile</h5>
       <div><span>Charter-Blockzeit</span><strong>{money(p.charter_component_eur)}</strong></div>
       <div><span>Positionierung</span><strong>{money(p.positioning_component_eur)}</strong></div>
       <div><span>Fiktiver Passagieranteil</span><strong>{money(p.passenger_component_eur)}</strong></div>
       <div><span>Airport / Handling</span><strong>Unvollständig</strong></div>
      </div>
      <div className={styles.warnings}>
       <strong><ShieldAlert size={14}/> Nicht eingepreiste Risiken</strong>
       <ul>{p.warnings.filter((w,i)=>i>0).slice(0,5).map((w,i)=><li key={i}>{w}</li>)}</ul>
      </div>
      <small className={styles.source}>Quelle: {p.timing_source} · keine tatsächlichen Flugdaten</small>
     </article>;
    })}
   </div>
   {viewOptions.length===0&&<p className={styles.empty}>Für diese Strecke sind derzeit keine vollständigen Zeit- und Positionierungsannahmen vorhanden.</p>}
   <p className={styles.footer}>Entfernungen beruhen auf dem bestehenden fiktiven Großkreis-Modell, Flugzeiten auf musterbezogenen Geschwindigkeitsannahmen. Es erfolgt keine Änderung von Charterstatus, Crew, Flugzeugposition oder Finanzbuchungen.</p>
  </>}
 </section>;
}
