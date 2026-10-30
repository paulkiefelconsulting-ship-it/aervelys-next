'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {AlertTriangle,CheckCircle2,GitCompareArrows,MapPin,RefreshCw,ShieldAlert,Users} from 'lucide-react';
type Option={request_id:string;request_code:string;requested_departure:string;origin_icao:string;destination_icao:string;registration:string;aircraft_type:string;aircraft_id:string;pic:string|null;sic:string|null;score:number;rank:number;is_current:boolean;positioning_needed:boolean;origin_location:string|null;prior_request_code:string|null;aircraft_conflicts:number;status:string;warnings:string[];assessed_at:string};
type Comparison={scenarios:Option[];cases_compared:number;options_compared:number;simulated_only:boolean};
const reasons:Record<string,string>={aircraft_overlap:'Flugzeug überschneidet sich mit anderem Entwurf',positioning_required:'Flugzeug muss erst positioniert werden',crew_unavailable:'Keine überschneidungsfreie PIC-/SIC-Kombination',crew_type_ratings_unverified:'Musterberechtigungen nicht verifiziert',passenger_capacity_unverified:'Sitzplätze / Leistungen nicht bestätigt',aircraft_technical_release_unverified:'Technische Freigabe fehlt',pic_positioning_required:'PIC-Positionierung ungeklärt',sic_positioning_required:'SIC-Positionierung ungeklärt'};
function date(s:string){const d=new Date(s);return isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}
function db(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!u||!k)throw Error('No Supabase connection');return createBrowserClient(u,k);}
export default function VirtualRotationsPanel(){
 const [data,setData]=useState<Comparison|null>(null);
 const [selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  const {data:result,error:e}=await db().rpc('aervelys_virtual_rotation_options_list');
  if(e||!Array.isArray(result?.scenarios))throw Error('Rotation data unavailable');
  const next=result as Comparison;setData(next);
  setSelected(old=>old&&next.scenarios.some(v=>v.request_id===old)?old:next.scenarios[0]?.request_id||'');
 },[]);
 useEffect(()=>{void load().catch(()=>setError('Alternativen konnten nicht geladen werden. CEO-/OPS-Zugriff prüfen.'));},[load]);
 const groups=useMemo(()=>{const set=new Map<string,Option>();data?.scenarios.forEach(o=>{if(!set.has(o.request_id))set.set(o.request_id,o);});return [...set.values()];},[data]);
 const options=useMemo(()=>data?.scenarios.filter(o=>o.request_id===selected).sort((a,b)=>a.rank-b.rank)||[],[data,selected]);
 const current=options.find(o=>o.is_current);
 const best=options.find(o=>o.aircraft_conflicts===0&&o.pic&&o.sic)||options[0];
 const noPositioning=options.some(o=>o.aircraft_conflicts===0&&!o.positioning_needed&&!!o.pic&&!!o.sic);
 async function recalculate(){
  setBusy(true);setError('');setNotice('');
  try{const {data:result,error:e}=await db().rpc('aervelys_virtual_rotation_refresh');
   if(e||!result?.simulated_only)throw Error('Rotation refresh failed');
   await load();setNotice(String(result.cases_scanned||0)+' SIM-Anfragen verglichen. Keine reale Freigabe erteilt.');
  }catch{setError('Alternativeprüfung fehlgeschlagen. Berechtigung und Daten prüfen.');}
  finally{setBusy(false);}
 }
 return <section className="virtual-rotations">
  <div className="virtual-rotations-head"><div><div className="eyebrow">AUTONOMOUS OPS / COMPARATIVE ROTATION PLANNER</div>
   <h3><GitCompareArrows size={19}/> Rotationsalternativen</h3>
   <p>Die Agenten vergleichen die fünf Jets und mögliche Crewpaare. Bestehende Dispositions- und Crewentwürfe werden nicht überschrieben.</p>
  </div><button type="button" className="ops-refresh" disabled={busy} onClick={()=>void recalculate()}><RefreshCw size={15}/>{busy?'Wird geprüft …':'Alternativen neu berechnen'}</button></div>
  <div className="virtual-rotations-caution"><ShieldAlert size={17}/><span>Nur SIM: Die Vergleichsreihenfolge bedeutet keine bestätigte Flugzeugkapazität, Flugzeit, Crewqualifikation, Dienstzeit, Positionierung oder Freigabe. Annahmen: 6 Stunden Flugzeug- und 18 Stunden Crewabstand.</span></div>
  {error&&<p className="charter-error" role="alert">{error}</p>}
  {notice&&<p className="charter-success" role="status">{notice}</p>}
  {!data?<p className="virtual-staff-empty">Vergleichsdaten werden geladen …</p>:data.cases_compared===0?
   <p className="virtual-staff-empty">Noch keine Rotationen bewertet. Starte die Prüfung für bestehende SIM-Charterentwürfe.</p>:<>
    <div className="virtual-rotations-summary"><strong>{data.cases_compared}</strong><span>verglichene Anfragen</span><strong>{data.options_compared}</strong><span>bewertete Flugzeugvarianten</span></div>
    <label className="virtual-rotations-select">Simulierte Charteranfrage
     <select value={selected} onChange={e=>setSelected(e.target.value)}>{groups.map(o=><option key={o.request_id} value={o.request_id}>{o.request_code} · {o.origin_icao} → {o.destination_icao} · {date(o.requested_departure)}</option>)}</select>
    </label>
    {current&&<div className="virtual-rotations-context"><span>Bisherige SIM-Planung: <strong>{current.registration}</strong></span>
     <span>{noPositioning?'Mindestens eine Variante ohne bekannten Flugzeug-Standortwechsel':'Keine konfliktfreie Variante ohne offenen Positionierungsbedarf gefunden'}</span></div>}
    <div className="virtual-rotations-options">{options.map(o=><article key={o.aircraft_id} className={'virtual-rotation-option '+(o.is_current?'is-current':'')}>
     <div className="virtual-rotation-top"><strong>{o.registration}</strong><span>{o.is_current?'Bisheriger SIM-Entwurf':o.aircraft_id===best?.aircraft_id?'Bevorzugte Vergleichsvariante':'Weitere Alternative'}</span></div>
     <p>{o.aircraft_type}</p>
     <div className="virtual-rotation-facts"><span><MapPin size={13}/> Modellierter Vor-Standort: {o.origin_location||'Unbekannt'}</span>
      <span><Users size={13}/> PIC: {o.pic||'Offen'} · SIC: {o.sic||'Offen'}</span>
      {o.prior_request_code&&<span>Vorherige Anfrage: {o.prior_request_code}</span>}</div>
     <div className="virtual-rotation-state">{o.aircraft_conflicts>0?<><AlertTriangle size={15}/> Zeitüberschneidung</>:
      o.positioning_needed?<><AlertTriangle size={15}/> Positionierung ungeprüft</>:<><CheckCircle2 size={15}/> Kein modellierter Flugzeug-Positionskonflikt</>}</div>
     {o.warnings.length>0&&<ul>{o.warnings.map(w=><li key={w}>{reasons[w]||w}</li>)}</ul>}
     <small>Rang {o.rank} · interner Vergleichswert {o.score} · keine Freigabe</small>
    </article>)}</div>
    <p className="virtual-rotations-note">Angezeigt werden bis zu drei Alternativen plus der vorhandene Entwurf. Die Bewertung ist rein intern, nicht flugbetrieblich zertifiziert.</p>
   </>}
 </section>;
}
