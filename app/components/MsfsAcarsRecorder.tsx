'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,BookOpen,CloudOff,GraduationCap,RadioTower,RefreshCw,ShieldAlert} from 'lucide-react';
import {analyseMsfsEvidence,type AcarsRawSample} from '../lib/msfsAcarsEvidence';

type Session={device_id:string;session_id:string;device_name:string;last_received_at:string;
 last_observed_at:string;phase:string;aircraft_title:string|null;online:boolean};
type Stream={samples:AcarsRawSample[];truncated:boolean;available_in_window:number;
 simulation_only:true;certificates_issued:0;financial_postings:0;verified_flight:false};

function supabase(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('NEXT-Datenbank nicht konfiguriert');
 return createBrowserClient(u,k);
}
const date=(s:string|null|undefined)=>s&&Number.isFinite(Date.parse(s))?
 new Date(s).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'medium'}):'—';
const panel={border:'1px solid var(--line)',borderRadius:9,padding:15,
 background:'var(--notice)'} as const;
const button={display:'inline-flex',alignItems:'center' as const,gap:8,padding:'10px 13px',
 border:'1px solid var(--brand)',borderRadius:8,background:'var(--notice)',
 color:'var(--primary)',fontSize:12,cursor:'pointer'};
const small={fontSize:11,color:'var(--muted)',lineHeight:1.6} as const;

export default function MsfsAcarsRecorder(){
 const [sessions,setSessions]=useState<Session[]>([]);
 const [key,setKey]=useState('');
 const [stream,setStream]=useState<Stream|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const refreshSessions=useCallback(async()=>{
  try{
   const {data,error:rpcError}=await supabase().rpc('aervelys_msfs_acars_sessions');
   if(rpcError||!Array.isArray(data))throw Error('ACARS-Sitzungen nicht lesbar. Rechte oder Datenbankmigration prüfen.');
   setSessions(data as Session[]);
   setKey(previous=>data.some((s:Session)=>s.device_id+':'+s.session_id===previous)?
    previous:(data[0]?data[0].device_id+':'+data[0].session_id:''));
   setError('');
  }catch(e){
   setError(e instanceof Error?e.message:'ACARS nicht erreichbar.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void refreshSessions();
  const timer=window.setInterval(()=>void refreshSessions(),15000);
  return()=>window.clearInterval(timer);
 },[refreshSessions]);

 const chosen=useMemo(()=>sessions.find(s=>s.device_id+':'+s.session_id===key),[sessions,key]);
 const load=useCallback(async(deviceId:string,sessionId:string)=>{
  try{
   const {data,error:rpcError}=await supabase().rpc('aervelys_msfs_acars_samples',
    {p_device_id:deviceId,p_session_id:sessionId});
   const value=data as Stream|null;
   if(rpcError||!value||!Array.isArray(value.samples)||value.simulation_only!==true||
     value.certificates_issued!==0||value.financial_postings!==0||
     value.verified_flight!==false)throw Error('ACARS-Datenvertrag ungültig oder nicht freigegeben.');
   setStream(value);setError('');
  }catch(e){
   setStream(null);
   setError(e instanceof Error?e.message:'Aufzeichnung nicht verfügbar.');
  }
 },[]);
 useEffect(()=>{
  setStream(null);
  if(!chosen)return;
  const id=chosen.device_id,session=chosen.session_id;
  void load(id,session);
  const timer=window.setInterval(()=>void load(id,session),12000);
  return()=>window.clearInterval(timer);
 },[chosen?.device_id,chosen?.session_id,load]); // stable session ID, not every heartbeat
 const evidence=useMemo(()=>stream?analyseMsfsEvidence(stream.samples,stream.truncated):null,[stream]);
 const last=stream?.samples[stream.samples.length-1];
 return <section className="panel" style={{marginBottom:20}}>
  <div className="panelhead">
   <div className="eyebrow">AERVELYS NEXT / SIM EVIDENCE LAB</div>
   <h2><Activity size={21} style={{verticalAlign:'middle',display:'inline-block',marginRight:8}}/>ACARS Flight Recorder</h2>
   <p className="lead">Messwerte aus unserer eigenen Windows-Bridge, zeitlich geordnet und auf auffällige Flugereignisse geprüft. Ausschließlich SIM-Evidenz, keine automatisch bestätigten Lizenzen oder Flüge.</p>
  </div>
  <div style={{padding:'0 24px 24px',display:'grid',gap:14}}>
   <div style={{...panel,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
    <div><strong style={{fontSize:12}}>Simulatoraufzeichnung</strong><p style={small}>{loading?'Sitzungen werden geladen':sessions.length+' aufgezeichnete Sitzung(en) der letzten 24 Stunden'}</p></div>
    <button type="button" style={button} onClick={()=>{void refreshSessions();if(chosen)void load(chosen.device_id,chosen.session_id);}}><RefreshCw size={16}/> Aktualisieren</button>
   </div>
   {error&&<p role="alert" style={{...small,color:'#e5ac86'}}>{error}</p>}
   {!chosen&&<div style={{...panel,display:'flex',alignItems:'center',gap:12}}>
    <CloudOff size={19}/><span style={small}>Noch keine Cloud-Telemetrie von MSFS 2024. Zuerst Windows-Bridge koppeln und im Simulator fliegen.</span>
   </div>}
   {sessions.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
    <label htmlFor="msfs-acars-session" style={{...small,fontWeight:700}}>Sitzung:</label>
    <select id="msfs-acars-session" value={key} onChange={e=>setKey(e.target.value)}
     style={{background:'var(--notice)',border:'1px solid var(--line)',borderRadius:7,padding:10,color:'var(--primary)',maxWidth:'100%',flex:'1 1 260px'}}>
     {sessions.map(s=><option key={s.device_id+':'+s.session_id} value={s.device_id+':'+s.session_id}>
      {s.device_name} · {s.aircraft_title||'Flugzeug unbekannt'} · {date(s.last_received_at)}
     </option>)}
    </select>
    {chosen&&<span style={{fontSize:11,fontWeight:700,color:chosen.online?'#70d8b2':'#e5ac86'}}>{chosen.online?'● LIVE':'● OFFLINE'}</span>}
   </div>}
   {evidence&&<>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
     {[
      ['Starts',evidence.takeoffs+' / 2'],
      ['Landungen',evidence.landings+' / 2'],
      ['Telemetrie',evidence.total_samples+' Messwerte'],
      ['Unterbrechungen',String(evidence.interruptions)],
      ['Cold Start',evidence.cold_start_confirmed?'Erkannt':'Offen'],
      ['Shutdown',evidence.shutdown_confirmed?'Erkannt':'Offen']
     ].map(([name,value])=><div key={name} style={panel}>
      <span style={small}>{name}</span>
      <strong style={{display:'block',fontSize:18,marginTop:7}}>{value}</strong>
     </div>)}
    </div>
    <div style={panel}>
     <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
      <GraduationCap size={20}/>
      <strong style={{fontSize:14}}>Type Rating – Checkride-Vorprüfung</strong>
     </div>
     <p style={{fontSize:13,fontWeight:700,color:evidence.checkride==='needs_review'?'#70d8b2':'var(--primary)'}}>
      {evidence.checkride==='needs_review'?
       '2 Starts und 2 Landungen erkannt – manuelle Nachprüfung erforderlich':
       evidence.checkride==='in_progress'?'Flugereignisse erfasst – Anforderungen noch nicht vollständig':
       'Warte auf den Beginn eines Simulator-Prüfungsfluges'}
     </p>
     <p style={small}>Referenz: zwei Starts und zwei Landungen, wie bei einem EDAZ-Checkride. Die genaue Flugplatzposition, der zugelassene Flugzeugtyp, Sim-Pause/Slew, die Echtheit des Telemetriesignals und ein qualifizierter Ausbilder sind noch nicht verifiziert. Deshalb wird <strong>kein Type Rating</strong> ausgestellt und keine Flugstunde verbindlich gutgeschrieben.</p>
     <div style={{display:'flex',gap:8,alignItems:'start'}}>
      <ShieldAlert size={16} style={{flexShrink:0,color:'#e5ac86'}}/>
      <span style={small}>AERVELYS Training & Qualification Engine folgt als getrennte, auditierte Freigabe. Dieses Modul wertet Messwerte lediglich lesend aus.</span>
     </div>
    </div>
    <div style={{...panel,display:'grid',gap:9}}>
     <strong style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><BookOpen size={17}/> ACARS Ereignisprotokoll</strong>
     <span style={small}>Flugzeug: {evidence.aircraft_title||'Nicht identifiziert'} · letzter Messwert {date(last?.received_at)}</span>
     {evidence.events.length===0&&<p style={small}>Noch keine erkennbaren Start-, Lande- oder Shutdown-Ereignisse.</p>}
     {evidence.events.slice().reverse().slice(0,35).map((event,i)=><div key={event.kind+event.at+i}
      style={{display:'grid',gridTemplateColumns:'110px 90px minmax(0,1fr)',gap:10,padding:'9px 0',borderBottom:'1px solid var(--line)',fontSize:11}}>
      <span style={{color:'var(--muted)'}}>{date(event.at)}</span>
      <strong>{event.kind.toUpperCase()}</strong>
      <span>{event.detail}</span>
     </div>)}
    </div>
    <div style={{...panel,display:'grid',gap:5}}>
     <strong style={{fontSize:12}}>Grenzen der Datenqualität</strong>
     {evidence.warnings.map(w=><span key={w} style={small}><RadioTower size={12} style={{verticalAlign:'middle',marginRight:6}}/>{w}</span>)}
     <p style={small}>{stream?.truncated?'Die ältesten Daten wurden aufgrund des serverseitigen Limits nicht geladen.':'Ausgewertet werden höchstens die letzten 1.200 Messwerte innerhalb von acht Stunden.'}</p>
    </div>
   </>}
  </div>
 </section>;
}
