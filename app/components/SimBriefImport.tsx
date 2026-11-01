'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {CheckCircle2,CloudDownload,Plane,RefreshCw,ShieldAlert} from 'lucide-react';
import type {LatestSimbriefOfp} from '../lib/simbrief';
import styles from './SimBriefImport.module.css';

type Airframe={aircraft_id:string;registration:string;aircraft_type:string};
type Stored={request_id:string;aircraft_id:string;registration:string;origin_icao:string;
 destination_icao:string;distance_nm:number;block_minutes:number;route_text:string;
 source_reference:string;imported_at:string;validation_status:'pilot_import_unverified'};
type Overview={imports:Stored[];events:unknown[];simulation_only:true;
 pilot_import_unverified:true;automatic_polling:false;real_flight_changes:0};
type ImportAck={saved:true;simulation_only:true;operational_verified:false;
 flight_changes:0;finance_postings:0;replaced:boolean};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!k)throw Error('Supabase-Verbindung nicht eingerichtet');
 return createBrowserClient(url,k);
}
function fmt(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'—':
 d.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});}
const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
export default function SimBriefImport({requestId,origin,destination,airframes,onImported}:{
 requestId:string;origin:string;destination:string;airframes:Airframe[];
 onImported:()=>Promise<void>;
}){
 const [mode,setMode]=useState<'username'|'userid'>('username');
 const [account,setAccount]=useState('');
 const [preview,setPreview]=useState<LatestSimbriefOfp|null>(null);
 const [aircraft,setAircraft]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [stored,setStored]=useState<Stored[]>([]);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const loadStored=useCallback(async()=>{
  try{
   const r=await client().rpc('aervelys_simbrief_ofp_overview');
   const v=r.data as Overview|null;
   if(r.error||!v||v.simulation_only!==true||v.automatic_polling!==false||
    !Array.isArray(v.imports))throw Error('SIM OFP list unavailable');
   setStored(v.imports);
  }catch{setError('Bisherige OFP-Importe konnten nicht geladen werden.');}
 },[]);
 useEffect(()=>{void loadStored();},[loadStored]);
 useEffect(()=>{setPreview(null);setConfirmed(false);setNotice('');setError('');setAircraft('');},[requestId]);
 const matching=preview?.origin_icao===origin&&preview?.destination_icao===destination;
 const localImports=stored.filter(i=>i.request_id===requestId);
 const knownMatch=useMemo(()=>
  airframes.find(a=>preview?.ofp_aircraft_registration&&
   a.registration.toUpperCase()===preview.ofp_aircraft_registration.toUpperCase())
 ,[airframes,preview]);
 async function fetchLatest(){
  if(loading||saving)return;
  setError('');setNotice('');setPreview(null);setConfirmed(false);
  const input=account.trim();
  if(mode==='userid'?!/^[0-9]{1,7}$/.test(input):!/^[A-Za-z0-9_.-]{2,64}$/.test(input)){
   setError('Bitte gültigen SimBrief-Benutzernamen oder eine Pilot-ID mit maximal sieben Ziffern eingeben.');
   return;
  }
  setLoading(true);
  try{
   const db=client();
   const s=await db.auth.getSession();
   const accessToken=s.data.session?.access_token;
   if(s.error||!accessToken)throw Error('AERVELYS-Anmeldung erforderlich.');
   const uri='/api/simbrief/latest?'+mode+'='+encodeURIComponent(input);
   const response=await fetch(uri,{cache:'no-store',headers:{Authorization:'Bearer '+accessToken}});
   const result=await response.json() as LatestSimbriefOfp&{error?:string};
   if(!response.ok||result.error)throw Error(result.error||'SimBrief konnte nicht gelesen werden.');
   if(typeof result.route_distance_nm!=='number'||typeof result.block_minutes!=='number'||
     result.operational_verified!==false)throw Error('SimBrief-Daten nicht plausibel.');
   setPreview(result);
   const found=airframes.find(a=>
    result.ofp_aircraft_registration&&
    a.registration.toUpperCase()===result.ofp_aircraft_registration.toUpperCase());
   setAircraft(found?.aircraft_id||airframes[0]?.aircraft_id||'');
   setNotice('SimBrief-OFP geladen. Bitte Start/Ziel und die Flugzeugzuordnung prüfen.');
  }catch(e){setError(e instanceof Error?e.message:'SimBrief-Abruf fehlgeschlagen.');}
  finally{setLoading(false);}
 }
 async function importPlan(){
  if(!preview||!matching||!aircraft||!confirmed||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_simbrief_ofp_submit',{
    p_request_id:requestId,p_aircraft_id:aircraft,
    p_origin:preview.origin_icao,p_destination:preview.destination_icao,
    p_route:preview.route_text,p_distance_nm:preview.route_distance_nm,
    p_block_minutes:preview.block_minutes,
    p_source_reference:preview.source_reference,p_generated_at:null
   });
   const v=r.data as ImportAck|null;
   if(r.error||!v||v.saved!==true||v.simulation_only!==true||
    v.operational_verified!==false||v.flight_changes!==0||v.finance_postings!==0)
     throw Error(r.error?.message||'Speicherung nicht bestätigt.');
   setNotice('SimBrief-Plan als ungeprüfte SIM-Flugplanquelle gespeichert; Kostenvergleich aktualisiert.');
   setPreview(null);setConfirmed(false);
   await Promise.all([loadStored(),onImported()]);
  }catch(e){setError(e instanceof Error?e.message:'SIM-Flugplan konnte nicht gespeichert werden.');}
  finally{setSaving(false);}
 }
 return <section className={styles.root} aria-label="SimBrief-Flugplan importieren">
  <div className={styles.heading}>
   <div><div className="eyebrow">SIMBRIEF / USER-TRIGGERED OFP IMPORT</div>
    <h4><CloudDownload size={19}/> Letzten SimBrief-Flugplan übernehmen</h4>
    <p>Nur auf deinen Klick: OFP abrufen, Strecke prüfen und einem AERVELYS-Flugzeug zuordnen. Keine wiederholten Hintergrundabfragen.</p>
   </div>
   <button type="button" className="ops-refresh" onClick={()=>void loadStored()} disabled={loading||saving}>
    <RefreshCw size={15}/> Importliste
   </button>
  </div>
  <div className={styles.form}>
   <label>SimBrief-Kennung
    <select value={mode} onChange={e=>{setMode(e.target.value as 'username'|'userid');setAccount('');setPreview(null);}}>
     <option value="username">Benutzername / Navigraph Alias</option>
     <option value="userid">Pilot-ID</option>
    </select></label>
   <label>{mode==='username'?'Benutzername':'Pilot-ID'}
    <input value={account} onChange={e=>setAccount(e.target.value)}
     placeholder={mode==='username'?'SimBrief Alias':'123456'}
     maxLength={mode==='username'?64:7} autoComplete="off" spellCheck={false}/></label>
   <button type="button" className="ops-refresh" onClick={()=>void fetchLatest()}
     disabled={!account.trim()||loading||saving}><CloudDownload size={16}/>
     {loading?'SimBrief abrufen …':'Letzten Flugplan abrufen'}</button>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {preview&&<div className={styles.preview}>
   <div className={styles.route}>
    <span>SIMBRIEF OFP / VORSCHAU</span>
    <strong>{preview.origin_icao} → {preview.destination_icao}</strong>
    <small>{number.format(preview.route_distance_nm)} NM · {preview.block_minutes} Minuten Blockzeit</small>
   </div>
   <p className={matching?styles.match:styles.mismatch}>
    {matching?<><CheckCircle2 size={16}/> Strecke passt zur gewählten SIM-Anfrage ({origin}–{destination}).</>:
     <><ShieldAlert size={16}/> Strecke passt nicht! Erwartet: {origin}–{destination}. Kein Import möglich.</>}
   </p>
   <div className={styles.routeText}><span>SimBrief-Route</span><code>{preview.route_text}</code></div>
   <p>Registrierung aus OFP: <strong>{preview.ofp_aircraft_registration||'nicht angegeben'}</strong>.
    {knownMatch?' Eine identische AERVELYS-Kennung ist vorhanden.':' Flugzeugzuordnung muss ausdrücklich bestätigt werden.'}</p>
   <label>Zu welchem AERVELYS-Flugzeug gehört dieser OFP?
    <select value={aircraft} onChange={e=>{setAircraft(e.target.value);setConfirmed(false);}}>
     {airframes.map(a=><option value={a.aircraft_id} key={a.aircraft_id}>
      {a.registration} · {a.aircraft_type}
     </option>)}
    </select></label>
   <label className={styles.check}>
    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    Ich bestätige die Zuordnung dieses OFP zum ausgewählten SIM-Flugzeug. Es ist keine behördliche oder operative Freigabe.
   </label>
   <button type="button" className="ops-refresh" onClick={()=>void importPlan()}
    disabled={saving||!matching||!confirmed||!aircraft}>
    <Plane size={16}/> {saving?'Wird gespeichert …':'SIM-Flugplan für dieses Flugzeug speichern'}
   </button>
  </div>}
  {localImports.length>0&&<div className={styles.stored}>
   <h5>Bereits zugeordnete OFP-Flugpläne</h5>
   {localImports.map(i=><div key={i.aircraft_id}>
    <strong>{i.registration}</strong>
    <span>{number.format(i.distance_nm)} NM · {i.block_minutes} Min</span>
    <small>{fmt(i.imported_at)} · ungeprüfter Pilotimport</small>
    <button type="button" className="ops-refresh" onClick={async()=>{
     try{await navigator.clipboard.writeText(i.route_text);
      setNotice('SimBrief-Route in die Zwischenablage kopiert – für die SIM-Missionsplanung.');
     }catch{setError('SimBrief-Route konnte nicht kopiert werden.');}
    }}>Route kopieren</button>
   </div>)}
  </div>}
  <p className={styles.footer}>SimBrief gehört zu Navigraph. Es wird nur der letzte OFP des angegebenen Kontos abgerufen, keine Flugpläne erzeugt und keine Navigraph-Anmeldung gespeichert. Importierte Daten überschreiben weder Charterauftrag noch Flugzeugstatus, Crew oder Finanzen.</p>
 </section>;
}
