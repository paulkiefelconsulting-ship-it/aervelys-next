'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {AlertTriangle,CheckCircle2,ClipboardCheck,Clock3,RefreshCw,Save,ShieldAlert} from 'lucide-react';

type RequestItem={
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 requested_departure:string;request_status:string;
};
type GateState='checked'|'review'|'blocked';
type TaskState='open'|'working'|'review_requested';
type EvidenceGate={
 code:string;title:string;status:GateState;detail:string;
 task_status:TaskState;task_note:string|null;task_updated_at:string|null;
};
type ReleaseReport={
 request_id:string;request_code:string;origin:string;destination:string;
 departure:string;aircraft:string|null;gates:EvidenceGate[];
 dispatch_approved:false;flight_authorized:false;
 release_status:string;checked_at:string;scope:string;
};
const taskLabels:Record<TaskState,string>={
 open:'Offen',working:'In Bearbeitung',review_requested:'Zur Prüfung vorgelegt'
};
const gateLabels:Record<GateState,string>={
 checked:'Teilprüfung erfüllt',review:'Weitere Prüfung',blocked:'Nachweis fehlt'
};
const gateIcons={checked:CheckCircle2,review:Clock3,blocked:AlertTriangle};

function getClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase-Umgebungsvariablen fehlen');
 return createBrowserClient(url,key);
}
function localDate(value:string){
 const d=new Date(value);
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
export default function ReleaseCockpit({initialRequestId}:{initialRequestId?:string}){
 const [requests,setRequests]=useState<RequestItem[]>([]);
 const [requestId,setRequestId]=useState('');
 const [report,setReport]=useState<ReleaseReport|null>(null);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [tasks,setTasks]=useState<Record<string,TaskState>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [savingGate,setSavingGate]=useState<string|null>(null);
 const [onlyOpen,setOnlyOpen]=useState(false);

 const loadRequests=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await getClient().rpc('aervelys_charter_requests_list');
   if(rpcError||!Array.isArray(data))throw new Error('Keine Anfrageliste');
   const all=data as RequestItem[];
   setRequests(all);
   setRequestId(previous=>
    initialRequestId&&all.some(x=>x.request_id===initialRequestId)?initialRequestId:
    previous&&all.some(x=>x.request_id===previous)?previous:(all[0]?.request_id||''));
  }catch{
   setError('Chartervorgänge konnten nicht geladen werden. Bitte CEO-/OPS-Rechte und Verbindung prüfen.');
  }finally{setLoading(false);}
 },[initialRequestId]);
 useEffect(()=>{void loadRequests();},[loadRequests]);

 const refreshReport=useCallback(async(id:string,withSpinner=true)=>{
  if(!id){setReport(null);return;}
  if(withSpinner)setRefreshing(true);
  setError('');
  try{
   const {data,error:rpcError}=await getClient().rpc('aervelys_release_report',{p_request_id:id});
   if(rpcError||!data||!Array.isArray(data.gates))throw new Error('Keine Prüfdaten');
   const current=data as ReleaseReport;
   setReport(current);
   setTasks(Object.fromEntries(current.gates.map(g=>[g.code,g.task_status])) as Record<string,TaskState>);
   setNotes(Object.fromEntries(current.gates.map(g=>[g.code,g.task_note||''])) as Record<string,string>);
  }catch{
   setReport(null);
   setError('Prüfbericht konnte nicht geladen werden. Bitte Berechtigung und Charteranfrage kontrollieren.');
  }finally{setRefreshing(false);}
 },[]);
 useEffect(()=>{setReport(null);setMessage('');void refreshReport(requestId);},[requestId,refreshReport]);

 const counts=useMemo(()=>({
  checked:report?.gates.filter(x=>x.status==='checked').length||0,
  review:report?.gates.filter(x=>x.status==='review').length||0,
  blocked:report?.gates.filter(x=>x.status==='blocked').length||0,
  submitted:report?.gates.filter(x=>x.task_status==='review_requested').length||0
 }),[report]);
 const shown=useMemo(()=>onlyOpen?report?.gates.filter(x=>x.status!=='checked'||x.task_status!=='review_requested'):report?.gates,[report,onlyOpen]);

 async function saveGate(gate:EvidenceGate){
  if(!report||savingGate||!tasks[gate.code])return;
  const note=notes[gate.code]?.trim()||null;
  if(note&&note.length>2000){setError('Notiz darf höchstens 2000 Zeichen enthalten.');return;}
  setSavingGate(gate.code);setError('');setMessage('');
  try{
   const {error:rpcError}=await getClient().rpc('aervelys_release_task_update',{
    p_request_id:report.request_id,p_gate_code:gate.code,
    p_task_status:tasks[gate.code],p_note:note
   });
   if(rpcError)throw new Error('Task update failed');
   await refreshReport(report.request_id,false);
   setMessage('Aufgabe gespeichert. Dies ist keine operative Freigabe.');
  }catch{
   setError('Aufgabe konnte nicht gespeichert werden. Bitte Anmeldung und Vorgangsstatus prüfen.');
  }finally{setSavingGate(null);}
 }

 return <section className="panel release-cockpit">
  <div className="panelhead">
   <div className="eyebrow">OPERATIONAL READINESS / EVIDENCE TRACKING</div>
   <h2>Freigabe-Cockpit</h2>
   <p className="lead">Alle Nachweisprüfungen für eine Charteranfrage an einer Stelle. Aufgaben organisieren, ohne Sicherheitsregeln zu umgehen.</p>
  </div>
  <div className="release-alert"><ShieldAlert size={19}/><span>Keine automatische Flug-, Crew- oder Flugzeugfreigabe. Auch „Teilprüfung erfüllt“ bedeutet <strong>nicht</strong> einsatzbereit. Der Gesamtstatus bleibt gesperrt.</span></div>
  <div className="release-controls">
   <label>Chartervorgang
    <select value={requestId} disabled={loading} onChange={e=>setRequestId(e.target.value)}>
     {requests.length===0?<option value="">Noch keine Charteranfragen</option>:requests.map(r=><option key={r.request_id} value={r.request_id}>{r.request_code} · {r.origin_icao} → {r.destination_icao}</option>)}
    </select>
   </label>
   <button className="ops-refresh" type="button" onClick={()=>{void loadRequests();if(requestId)void refreshReport(requestId)}} disabled={loading||refreshing}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  {loading&&<p className="ops-loading">Anfragen werden geladen …</p>}
  {refreshing&&<p className="ops-loading">Prüfnachweise werden ausgewertet …</p>}
  {error&&<p className="charter-error release-feedback" role="alert">{error}</p>}
  {message&&<p className="charter-success release-feedback" role="status">{message}</p>}
  {!loading&&!requestId&&<div className="ops-loading">Erstelle zunächst unter „Charter & Angebote“ eine Anfrage. Danach kannst du den Prüfbericht einsehen.</div>}
  {report&&!refreshing&&<>
   <div className="release-overview">
    <div><span>CHARTERANFRAGE</span><strong>{report.request_code}</strong><small>{report.origin} → {report.destination} · {localDate(report.departure)}</small></div>
    <div><span>FLUGZEUGENTWURF</span><strong>{report.aircraft||'Nicht zugewiesen'}</strong><small>Keine Betriebsfreigabe</small></div>
    <div className="release-lock"><span>GESAMTFREIGABE</span><strong><ShieldAlert size={16}/> GESPERRT</strong><small>Nachweise nicht vollständig verifiziert</small></div>
   </div>
   <div className="release-statistics">
    <div><strong>{counts.checked}</strong><span>Teilprüfungen erfüllt</span></div>
    <div><strong>{counts.review}</strong><span>Weitere Prüfung</span></div>
    <div><strong>{counts.blocked}</strong><span>Nachweise fehlen</span></div>
    <div><strong>{counts.submitted}</strong><span>Aufgaben zur Prüfung</span></div>
   </div>
   <div className="release-gate-heading">
    <div><div className="eyebrow">RELEASE GATES</div><h3>Prüfnachweise ({report.gates.length})</h3></div>
    <label className="release-filter"><input type="checkbox" checked={onlyOpen} onChange={e=>setOnlyOpen(e.target.checked)}/> Nur offene Punkte</label>
   </div>
   <div className="release-gates">
    {(shown||[]).map(gate=>{
     const Icon=gateIcons[gate.status]||AlertTriangle;
     return <article key={gate.code} className={'release-gate release-'+gate.status}>
      <div className="release-gate-top"><div className="release-gate-title"><Icon size={18}/><strong>{gate.title}</strong></div><span className="release-gate-state">{gateLabels[gate.status]}</span></div>
      <p>{gate.detail}</p>
      <div className="release-task-controls">
       <label>Nachweis-Aufgabe
        <select value={tasks[gate.code]||'open'} disabled={savingGate===gate.code} onChange={e=>setTasks(old=>({...old,[gate.code]:e.target.value as TaskState}))}>
         <option value="open">Offen</option><option value="working">In Bearbeitung</option><option value="review_requested">Zur Prüfung vorgelegt</option>
        </select>
       </label>
       <label>Interne Anmerkung / Belegreferenz
        <input type="text" maxLength={2000} placeholder="Dokument, Ansprechpartner, offene Schritte …" value={notes[gate.code]||''} onChange={e=>setNotes(old=>({...old,[gate.code]:e.target.value}))}/>
       </label>
       <button className="ops-refresh" type="button" onClick={()=>void saveGate(gate)} disabled={savingGate!==null}><Save size={15}/>{savingGate===gate.code?'Speichern …':'Aufgabe speichern'}</button>
      </div>
      {gate.task_updated_at&&<small>Zuletzt bearbeitet: {localDate(gate.task_updated_at)} · {taskLabels[gate.task_status]}</small>}
     </article>;
    })}
    {shown?.length===0&&<div className="ops-loading">Keine passenden Nachweispunkte.</div>}
   </div>
   <div className="release-footer"><ClipboardCheck size={16}/> Prüfbericht {localDate(report.checked_at)} · Änderungen werden im Vorgangsverlauf protokolliert. Es wird kein Flug freigegeben.</div>
  </>}
 </section>;
}
