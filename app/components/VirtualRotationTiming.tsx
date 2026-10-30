'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,AlertTriangle,Clock3,Gauge,RefreshCw,Route,ShieldAlert,Wrench,Users} from 'lucide-react';

type FlightTime={
 request_id:string;request_code:string;origin:string;destination:string;registration:string;
 aircraft_type:string;aircraft_id:string;original_choice:boolean;rank:number;
 charter_distance_nm:number|null;charter_block_minutes:number|null;
 charter_departure_at:string;estimated_arrival_at:string|null;
 report_at:string|null;release_at:string|null;estimated_duty_minutes:number|null;
 positioning_origin:string|null;positioning_destination:string|null;
 positioning_distance_nm:number|null;positioning_block_minutes:number|null;
 positioning_depart_at:string|null;positioning_arrival_at:string|null;
 required_positioning_arrival_at:string|null;positioning_window_valid:boolean|null;
 maintenance_conflict:boolean;crew_duty_conflict:boolean;warnings:string[];
 source_model:string;calculated_at:string;
};
type TimingResponse={results:FlightTime[];total_options:number;simulated_only:boolean;
 route_reference:string;groundspeed_reference:string;duty_reference:string};
const reasons:Record<string,string>={
 aircraft_positioning_unconfirmed:'Positionierungsflug nicht bestätigt',
 ferry_crew_unconfirmed:'Crew für Positionierungsabschnitt ungeprüft',
 positioning_distance_missing:'Positionierungsdistanz unbekannt',
 positioning_window_insufficient:'Verfügbares Positionierungszeitfenster reicht im Modell nicht aus',
 positioning_window_unknown:'Positionierungszeitfenster nicht berechenbar',
 ferry_and_charter_duty_exceeds_sim_limit:'Ferry + Charter: internes Dienstzeitlimit überschritten',
 route_distance_or_speed_missing:'Distanz oder Flugzeuggeschwindigkeit fehlt',
 charter_duty_exceeds_sim_limit:'Charter-Dienstzeit überschreitet vorläufiges Limit',
 aircraft_schedule_overlap:'Flugzeug zeitlich doppelt verplant',
 crew_candidate_missing:'PIC oder SIC noch nicht zugeordnet',
 crew_policy_not_approved:'Crew-Dienstzeitregelung nicht operativ freigegeben',
 performance_not_verified_for_dispatch:'Flugzeugleistungen / Reichweite nicht verifiziert',
 maintenance_due_or_overlap:'Wartungsfälligkeit oder Wartungsfenster im Konflikt',
 recorded_crew_conflict:'Erfasste Crew-Dienstzeit oder Nichtverfügbarkeit überschneidet sich'
};
function time(s:string|null){if(!s)return '—';const d=new Date(s);return isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});}
function min(m:number|null){return m===null?'—':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min';}
function nm(n:number|null){return n===null?'—':Math.round(n).toLocaleString('de-DE')+' NM';}
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase not configured');
 return createBrowserClient(url,key);
}
export default function VirtualRotationTiming(){
 const [data,setData]=useState<TimingResponse|null>(null);
 const [request,setRequest]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  const {data:response,error:e}=await client().rpc('aervelys_virtual_rotation_timing_list');
  if(e||!Array.isArray(response?.results))throw Error('Missing rotation timing data');
  const result=response as TimingResponse;
  setData(result);
  setRequest(prev=>prev&&result.results.some(x=>x.request_id===prev)?prev:result.results[0]?.request_id||'');
 },[]);
 useEffect(()=>{void load().catch(()=>setError('Zeitplan konnte nicht geladen werden. Bitte Zugriffsrechte prüfen.'));},[load]);
 const groups=useMemo(()=>{const seen=new Map<string,FlightTime>();data?.results.forEach(x=>{if(!seen.has(x.request_id))seen.set(x.request_id,x);});return [...seen.values()];},[data]);
 const options=useMemo(()=>data?.results.filter(x=>x.request_id===request).sort((a,b)=>a.rank-b.rank)||[],[data,request]);
 async function recalculate(){
  setBusy(true);setError('');setNotice('');
  try{
   const {data:result,error:e}=await client().rpc('aervelys_virtual_rotation_time_refresh');
   if(e||!result?.simulated_only)throw Error('Simulation calculator failed');
   await load();
   setNotice(String(result.estimated_options||0)+' vorläufige Zeitpläne neu berechnet. Keine operative Freigabe.');
  }catch{setError('Berechnung fehlgeschlagen. Prüfe die Routen- und Crewdatengrundlage.');}
  finally{setBusy(false);}
 }
 return <section className="virtual-timing">
  <div className="virtual-timing-head"><div>
   <div className="eyebrow">SIMULATION / DISTANCE · BLOCK TIME · CREW DUTY</div>
   <h3><Route size={19}/> Mehrtägige Rotationszeitplanung</h3>
   <p>Geschätzte Flugabschnitte, Rückpositionierungen, Dienstzeitfenster und Wartungsüberschneidungen pro Jet.</p>
  </div><button type="button" className="ops-refresh" disabled={busy} onClick={()=>void recalculate()}><RefreshCw size={15}/> {busy?'Berechnung läuft …':'Zeitplan neu berechnen'}</button></div>
  <div className="virtual-timing-disclaimer"><ShieldAlert size={18}/><span>
   <strong>Rein fiktive Planungswerte.</strong> Großkreisdistanzen aus ungeprüften Airport-Koordinaten, angenommene Reisegeschwindigkeit und 35–40 Minuten pauschaler Zeitpuffer. Keine reale ATS-Route, Wettervorhersage, Treibstoff-/Reichweitenprüfung oder verbindliche Crew-Dienstzeitberechnung.
  </span></div>
  {error&&<p className="charter-error" role="alert">{error}</p>}
  {notice&&<p className="charter-success" role="status">{notice}</p>}
  {!data?<p className="virtual-staff-empty">Rotationszeiten werden geladen …</p>:data.results.length===0?
   <p className="virtual-staff-empty">Noch keine SIM-Blockzeiten berechnet. Starte eine Berechnung für vorhandene Charterfälle.</p>:<>
    <div className="virtual-timing-summary"><span><strong>{groups.length}</strong> Anfragen</span><span><strong>{data.total_options}</strong> Flugzeug-Zeitvarianten</span></div>
    <label className="virtual-timing-select">Charteranfrage
     <select value={request} onChange={e=>setRequest(e.target.value)}>{groups.map(x=><option key={x.request_id} value={x.request_id}>{x.request_code} · {x.origin} → {x.destination} · {time(x.charter_departure_at)}</option>)}</select>
    </label>
    <div className="virtual-timing-rows">
     {options.map(x=><article key={x.aircraft_id} className={'virtual-timing-card '+(x.original_choice?'is-current':'')}>
      <div className="virtual-timing-card-head"><strong>{x.registration}</strong><span>{x.original_choice?'Bisheriger SIM-Entwurf':'Vergleichsoption '+x.rank}</span></div>
      <div className="virtual-timing-track">
       {x.positioning_origin&&<div className="virtual-timing-segment position">
        <div><Route size={15}/><strong>Positionierung</strong></div>
        <p>{x.positioning_origin} → {x.positioning_destination} · {nm(x.positioning_distance_nm)}</p>
        <p><Clock3 size={12}/> ca. {min(x.positioning_block_minutes)}</p>
        <small>Frühestens {time(x.positioning_depart_at)} · geschätzte Ankunft {time(x.positioning_arrival_at)}</small>
        <small>Spätestens erforderlich: {time(x.required_positioning_arrival_at)}</small>
       </div>}
       <div className="virtual-timing-segment charter">
        <div><Gauge size={15}/><strong>Charter</strong></div>
        <p>{x.origin} → {x.destination} · {nm(x.charter_distance_nm)}</p>
        <p><Clock3 size={12}/> ca. {min(x.charter_block_minutes)}</p>
        <small>Start {time(x.charter_departure_at)} · geschätzte Ankunft {time(x.estimated_arrival_at)}</small>
       </div>
       <div className="virtual-timing-segment duty">
        <div><Users size={15}/><strong>Crew-Dienstfenster (SIM)</strong></div>
        <p>{time(x.report_at)} bis {time(x.release_at)}</p>
        <small>Charter-Dienstzeit ca. {min(x.estimated_duty_minutes)} · internes Rechenlimit 12 h</small>
       </div>
      </div>
      <div className="virtual-timing-flags">
       {x.positioning_origin&&<span className={x.positioning_window_valid===false?'bad':''}><AlertTriangle size={13}/> Positionierung: {x.positioning_window_valid===false?'Zeitfenster zu knapp':x.positioning_window_valid===true?'Rechnerisch möglich, ungeprüft':'Zeitfenster unbekannt'}</span>}
       <span className={x.maintenance_conflict?'bad':''}><Wrench size={13}/> Wartung: {x.maintenance_conflict?'Konflikt erkannt':'Kein erfasster Konflikt'}</span>
       <span className={x.crew_duty_conflict?'bad':''}><Activity size={13}/> Erfasste Crewblöcke: {x.crew_duty_conflict?'Konflikt':'Keine Überschneidung dokumentiert'}</span>
      </div>
      <details><summary>{x.warnings.length} offene Nachweise und Hinweise</summary>
       <ul>{x.warnings.map((w,i)=><li key={w+'-'+i}>{reasons[w]||w}</li>)}</ul>
      </details>
     </article>)}
    </div>
    <p className="virtual-timing-note">Berechnungsdaten sind dauerhaft im internen Simulationsschema gespeichert und werden im Agentenzyklus erneut geprüft. Sie ändern keine Flug-, Vertrags- oder Crewfreigaben.</p>
   </>}
 </section>;
}
