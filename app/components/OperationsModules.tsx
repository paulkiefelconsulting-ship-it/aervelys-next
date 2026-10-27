'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {MapPin, Plane, RefreshCw, Search, ShieldAlert, Users} from 'lucide-react';

type Aircraft={
 id:string; registration:string; aircraft_type:string;
 home_icao:string|null; current_icao:string|null;
 operational_status:string; ownership_status:string|null; updated_at:string|null;
};
type CrewMember={
 id:string; full_name:string; department:string|null;
 role:string|null; pilot_role:string|null; active:boolean;
};
type RosterMode='fleet'|'crew';
type LoadState='loading'|'ready'|'error';

function readableStatus(value:string|null|undefined){
 return value?value.replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase()):'Nicht hinterlegt';
}
function dateText(value:string|null){
 if(!value)return 'Keine Angabe';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Keine Angabe':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}

export default function OperationsModules({mode}:{mode:RosterMode}){
 const [fleet,setFleet]=useState<Aircraft[]>([]);
 const [crew,setCrew]=useState<CrewMember[]>([]);
 const [state,setState]=useState<LoadState>('loading');
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('all');
 const [refreshed,setRefreshed]=useState('');

 const load=useCallback(async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key){setState('error');setError('Supabase-Verbindung ist nicht konfiguriert.');return;}
  setState('loading');setError('');
  try{
   const supabase=createBrowserClient(url,key);
   const fn=mode==='fleet'?'aervelys_fleet_roster':'aervelys_crew_roster';
   const {data,error:rpcError}=await supabase.rpc(fn);
   if(rpcError)throw rpcError;
   if(!Array.isArray(data))throw new Error('Unerwartetes Datenformat');
   if(mode==='fleet')setFleet(data as Aircraft[]);
   else setCrew(data as CrewMember[]);
   setRefreshed(new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
   setState('ready');
  }catch{
   setState('error');
   setError('Daten nicht abrufbar. Bitte CEO-/OPS-Berechtigung, Anmeldung und Verbindung prüfen.');
  }
 },[mode]);

 useEffect(()=>{void load();},[load]);
 const q=search.trim().toLocaleLowerCase('de-DE');
 const shownFleet=useMemo(()=>fleet.filter(a=>
  (filter==='all'||a.operational_status===filter)&&
  [a.registration,a.aircraft_type,a.current_icao,a.home_icao].some(x=>(x||'').toLocaleLowerCase('de-DE').includes(q))
 ),[fleet,filter,q]);
 const shownCrew=useMemo(()=>crew.filter(p=>
  (filter==='all'||(filter==='pilot'&&!!p.pilot_role)||(filter==='ops'&&!p.pilot_role))&&
  [p.full_name,p.department,p.role,p.pilot_role].some(x=>(x||'').toLocaleLowerCase('de-DE').includes(q))
 ),[crew,filter,q]);
 const statuses=Array.from(new Set(fleet.map(a=>a.operational_status))).sort();
 const pilots=crew.filter(p=>!!p.pilot_role).length;

 return <section className="panel ops-roster" aria-label={mode==='fleet'?'Flottenmanagement':'Crewübersicht'}>
  <div className="panelhead ops-header">
   <div>
    <div className="eyebrow">{mode==='fleet'?'AIRCRAFT OPERATIONS':'CREW & PEOPLE'}</div>
    <h2>{mode==='fleet'?'Flottenmanagement':'Crew & Personal'}</h2>
    <p className="lead">{mode==='fleet'?'Aktueller Standort, Heimatbasis und Onboarding der gesamten Flotte.':'Aktive Mitarbeiter, Funktionen und Crewrollen aus dem Unternehmensbestand.'}</p>
   </div>
   <button className="ops-refresh" type="button" onClick={()=>void load()} disabled={state==='loading'}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="ops-warning"><ShieldAlert size={17}/><span>{mode==='fleet'?'Registriert bedeutet nicht flugbereit. Flugzeugfreigaben und Leistungsdaten sind noch nicht verifiziert.':'Personalzuordnung ist keine Bestätigung von Musterberechtigung, Verfügbarkeit oder Dienstzeitfreigabe.'}</span></div>
  {state==='error'?<div className="ops-error" role="alert">{error}</div>:null}
  {state==='loading'?<div className="ops-loading" role="status">Unternehmensdaten werden geladen …</div>:null}
  {state==='ready'&&<>
   <div className="ops-totals">
    <div><span>{mode==='fleet'?'FLUGZEUGE':'AKTIVE MITARBEITER'}</span><strong>{mode==='fleet'?fleet.length:crew.length}</strong></div>
    <div><span>{mode==='fleet'?'IM ONBOARDING':'PILOTEN'}</span><strong>{mode==='fleet'?fleet.filter(a=>a.operational_status==='onboarding').length:pilots}</strong></div>
    <div><span>{mode==='fleet'?'UNTERSCHIEDLICHE STANDORTE':'OPS / ANDERE'}</span><strong>{mode==='fleet'?new Set(fleet.map(a=>a.current_icao).filter(Boolean)).size:crew.length-pilots}</strong></div>
   </div>
   <div className="ops-controls">
    <label className="ops-search"><Search size={17}/><input aria-label="Bestand durchsuchen" placeholder={mode==='fleet'?'Registrierung, Typ oder ICAO suchen':'Name, Funktion oder Abteilung suchen'} value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <select aria-label="Bestand filtern" value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="all">Alle anzeigen</option>
     {mode==='fleet'?statuses.map(x=><option key={x} value={x}>{readableStatus(x)}</option>):<><option value="pilot">Nur Piloten</option><option value="ops">OPS / Sonstige</option></>}
    </select>
   </div>
   {mode==='fleet'?
    <div className="ops-cards">{shownFleet.map(a=><article className="ops-aircraft" key={a.id}>
     <div className="ops-card-top"><Plane size={19}/><span className="pill">{readableStatus(a.operational_status)}</span></div>
     <h3>{a.registration}</h3><p>{a.aircraft_type}</p>
     <div className="ops-card-facts"><div><MapPin size={15}/> Standort <strong>{a.current_icao||'—'}</strong></div><div>Heimatbasis <strong>{a.home_icao||'—'}</strong></div><div>Besitzstatus <strong>{readableStatus(a.ownership_status)}</strong></div></div>
     <small>Letzte Änderung: {dateText(a.updated_at)}</small>
    </article>)}</div>:
    <div className="tablewrap"><table><thead><tr><th>NAME</th><th>ABTEILUNG</th><th>POSITION</th><th>CREWROLLE</th></tr></thead><tbody>
     {shownCrew.map(p=><tr key={p.id}><td><strong>{p.full_name}</strong></td><td>{p.department||'—'}</td><td>{p.role||'—'}</td><td>{p.pilot_role?<span className="pill">{p.pilot_role}</span>:'—'}</td></tr>)}
    </tbody></table></div>}
   {(mode==='fleet'?shownFleet.length:shownCrew.length)===0?<div className="ops-loading">Keine passenden Einträge gefunden.</div>:null}
   <div className="ops-footer"><Users size={14}/> {mode==='fleet'?shownFleet.length:shownCrew.length} Einträge · Stand {refreshed} · Geschützte Live-Abfrage</div>
  </>}
 </section>;
}
