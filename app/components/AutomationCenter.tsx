'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,AlertTriangle,Bot,CheckCircle2,ClipboardList,Clock3,FileText,Play,RefreshCw,Save,ShieldAlert,Workflow} from 'lucide-react';

type CheckKind='fleet_readiness'|'crew_qualifications'|'charter_pipeline'|'contract_exposure'|'hangar_terms';
type TaskStatus='open'|'working'|'review_requested'|'closed';
type Finding={code:string;title:string;severity:'blocker'|'warning'|'info';count:number;references:string[];detail:string};
type ReviewRun={id:string;check_kind:CheckKind;summary:string;findings:Finding[];created_at:string};
type Followup={id:string;check_kind:CheckKind;issue_code:string;title:string;status:TaskStatus;note:string|null;created_at:string;updated_at:string};
type ExistingJob={id:string;job_key:string;kind:string;status:string;due_at:string;attempts:number;max_attempts:number;last_error:string|null};
type Worker={worker:string;last_started:string|null;last_completed:string|null;handled_count:number;last_error:string|null};
type JobRun={id:number;job_id:string;began_at:string;finished_at:string|null;result:string|null;error:string|null};
type Overview={review_runs:ReviewRun[];followups:Followup[];jobs:ExistingJob[];job_runs:JobRun[];worker_heartbeats:Worker[];autonomous_ai_enabled:false;worker_triggered:false};
type CheckTemplate={kind:CheckKind;title:string;description:string;owner:string};
const templates:CheckTemplate[]=[
 {kind:'fleet_readiness',title:'Flottenbereitschaft',description:'Status, Wartungsnachweise und Betriebsstunden der Flugzeuge',owner:'Flight OPS'},
 {kind:'crew_qualifications',title:'Crew-Qualifikationen',description:'Aktuelle Nachweise und Freigabestatus der Crew-Richtlinie',owner:'Crew OPS'},
 {kind:'charter_pipeline',title:'Charter-Pipeline',description:'Fehlende Vorgänge und noch nicht zugewiesene Anfragen',owner:'Charter Desk'},
 {kind:'contract_exposure',title:'Verträge & Finanzen',description:'Unvollständige Vertragsentwürfe und erfasste offene Rechnungen',owner:'Finance'},
 {kind:'hangar_terms',title:'Hangars & Heimatbasen',description:'Fehlende Mietkonditionen und ungeprüfte Stationierung',owner:'Ground OPS'}
];
const statusLabel:Record<TaskStatus,string>={open:'Offen',working:'In Bearbeitung',review_requested:'Zur Prüfung vorgelegt',closed:'Administrativ geschlossen'};
const checkLabel=(kind:CheckKind)=>templates.find(t=>t.kind===kind)?.title||kind;
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function datetime(value:string|null){
 if(!value)return 'Keine Rückmeldung';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Unbekannt':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function countValue(v:number|null|undefined){return Number.isFinite(Number(v))?Number(v):0;}

export default function AutomationCenter(){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true);
 const [running,setRunning]=useState<CheckKind|null>(null);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [activeRun,setActiveRun]=useState<string>('');
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [taskStatuses,setTaskStatuses]=useState<Record<string,TaskStatus>>({});
 const [showWorker,setShowWorker]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_automation_dashboard');
   if(rpcError||!data||!Array.isArray(data.review_runs)||!Array.isArray(data.followups))throw Error('Control data missing');
   const snapshot=data as Overview;
   setOverview(snapshot);
   setActiveRun(old=>old&&snapshot.review_runs.some(r=>r.id===old)?old:snapshot.review_runs[0]?.id||'');
   setNotes(old=>({...Object.fromEntries(snapshot.followups.map(t=>[t.id,t.note||''])),...old}));
   setTaskStatuses(Object.fromEntries(snapshot.followups.map(t=>[t.id,t.status])) as Record<string,TaskStatus>);
  }catch{
   setOverview(null);setError('Automationszentrale nicht erreichbar. Bitte aktive CEO-Berechtigung und Anmeldung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const chosen=useMemo(()=>overview?.review_runs.find(r=>r.id===activeRun)||null,[overview,activeRun]);
 const unfinished=overview?.followups.filter(t=>t.status!=='closed').length||0;
 const lastWorker=overview?.worker_heartbeats[0]||null;
 const availableJobs=overview?.jobs.length||0;

 async function execute(kind:CheckKind){
  setError('');setNotice('');setRunning(kind);
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_automation_check_run',{p_check_kind:kind});
   if(rpcError||!data?.run_id)throw Error('Deterministic check failed');
   await load();setActiveRun(String(data.run_id));
   setNotice('Regelbasierte Prüfung abgeschlossen und protokolliert. Keine Betriebsaktion ausgeführt.');
  }catch{
   setError('Prüfung fehlgeschlagen. Bitte CEO-Rechte und Datenzugriff kontrollieren.');
  }finally{setRunning(null);}
 }

 async function createTask(finding:Finding){
  if(!chosen||saving!==null)return;
  setError('');setNotice('');setSaving(finding.code);
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_automation_followup_create',{
    p_run_id:chosen.id,p_issue_code:finding.code,p_note:null
   });
   if(rpcError||!data?.id)throw Error('Task creation failed');
   await load();
   setNotice('Folgeaufgabe verfügbar. Sie verändert weder Freigaben noch operative Daten.');
  }catch{
   setError('Folgeaufgabe konnte nicht angelegt werden. Bitte Berechtigung prüfen.');
  }finally{setSaving(null);}
 }

 async function updateTask(task:Followup){
  const status=taskStatuses[task.id]||task.status;
  const note=(notes[task.id]||'').trim();
  if(status===task.status){setError('Bitte zuerst einen anderen Bearbeitungsstatus wählen.');return;}
  if(note.length<8){setError('Für die Statusänderung sind mindestens acht Zeichen Begründung erforderlich.');return;}
  setSaving(task.id);setError('');setNotice('');
  try{
   const {error:rpcError}=await client().rpc('aervelys_automation_followup_update',{
    p_followup_id:task.id,p_status:status,p_note:note
   });
   if(rpcError)throw Error('Task update failed');
   await load();
   setNotice('Verwaltungsaufgabe protokolliert. Dies ist keine operative Freigabe.');
  }catch{setError('Status konnte nicht aktualisiert werden. Bitte Berechtigung oder Aufgabenstatus prüfen.');}
  finally{setSaving(null);}
 }

 return <section className="panel automation-center">
  <div className="panelhead automation-header"><div><div className="eyebrow">AUTOMATION CONTROL / CEO</div><h2>KI & Automatisierung</h2>
   <p className="lead">Regelbasierte Prüfassistenten, sichere Folgeaufgaben und Status des vorhandenen Jobsystems.</p>
   </div><button type="button" className="ops-refresh" onClick={()=>void load()} disabled={loading||running!==null}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="automation-safety"><ShieldAlert size={19}/><span><strong>Noch kein autonomer KI-Agent:</strong> Diese erste Version führt nur manuell gestartete, deterministische Lesekontrollen aus. Keine E-Mails, Flüge, Vertragsentscheidungen oder Zahlungen werden ausgelöst. Ein Sprachmodell ist nicht verbunden.</span></div>
  {error&&<p className="charter-error automation-feedback" role="alert">{error}</p>}
  {notice&&<p className="charter-success automation-feedback" role="status">{notice}</p>}
  {loading&&<div className="ops-loading">Automationsstatus wird geladen …</div>}
  {overview&&<>
   <div className="automation-stats">
    <div><Bot size={18}/><strong>{templates.length}</strong><span>Manuelle Prüfvorlagen</span></div>
    <div><ClipboardList size={18}/><strong>{overview.review_runs.length}</strong><span>Gespeicherte Prüfberichte (max. 50 angezeigt)</span></div>
    <div><AlertTriangle size={18}/><strong>{unfinished}</strong><span>Offene Folgeaufgaben</span></div>
    <div><Activity size={18}/><strong>{availableJobs}</strong><span>Jobs im bestehenden System</span></div>
   </div>
   <div className="automation-subheading"><div className="eyebrow">DETERMINISTIC CHECKS</div><h3>Prüfassistenten</h3><p>Jede Prüfung bewertet den aktuellen Datenbankstand und protokolliert die gefundenen Probleme.</p></div>
   <div className="automation-templates">{templates.map(t=><article className="automation-template" key={t.kind}>
    <div><span>{t.owner}</span><h4>{t.title}</h4><p>{t.description}</p></div>
    <button type="button" className="charter-submit" disabled={running!==null||saving!==null} onClick={()=>void execute(t.kind)}>
     <Play size={15}/>{running===t.kind?'Prüfe …':'Prüfung starten'}
    </button>
   </article>)}</div>
   <div className="automation-columns">
    <div className="automation-main">
     <div className="automation-block">
      <div className="eyebrow">REVIEW LOG</div><h3>Prüfberichte ({overview.review_runs.length})</h3>
      {overview.review_runs.length===0?<p className="automation-empty">Noch keine Prüfberichte. Starte oben eine der fünf Lesekontrollen.</p>:
       <>
       <label className="automation-field">Bericht auswählen<select value={activeRun} onChange={e=>setActiveRun(e.target.value)}>
        {overview.review_runs.map(r=><option key={r.id} value={r.id}>{checkLabel(r.check_kind)} · {datetime(r.created_at)}</option>)}
       </select></label>
       {chosen&&<>
        <div className="automation-report-heading"><h4>{chosen.summary}</h4><span>{datetime(chosen.created_at)}</span></div>
        {chosen.findings.length===0?<p className="automation-clean"><CheckCircle2 size={17}/> Keine Abweichungen in den geprüften Regeln. Das ist keine allgemeine Betriebsfreigabe.</p>:
         chosen.findings.map(f=><article className="automation-finding" key={f.code}>
          <div><strong><AlertTriangle size={16}/> {f.title}</strong><span>{f.severity==='blocker'?'Freigabehindernis':'Prüfhinweis'} · {countValue(f.count)} betroffen</span></div>
          <p>{f.detail}</p>
          {Array.isArray(f.references)&&f.references.length>0&&<small>Betroffene Einträge: {f.references.join(', ')}</small>}
          <button type="button" className="ops-refresh" onClick={()=>void createTask(f)} disabled={saving!==null}>
           <ClipboardList size={15}/>{saving===f.code?'Speichert …':'Folgeaufgabe übernehmen'}
          </button>
         </article>)}
       </>}
       </>}
     </div>
     <div className="automation-block">
      <div className="eyebrow">FOLLOW-UP TRACKING</div><h3>Kontrollierte Folgeaufgaben ({overview.followups.length})</h3>
      {overview.followups.length===0?<p className="automation-empty">Aus erkannten Prüfhinweisen kannst du eine Aufgabe für die interne Nachbearbeitung anlegen.</p>:
       overview.followups.map(t=><article className="automation-task" key={t.id}>
        <div className="automation-task-top"><strong>{t.title}</strong><span>{statusLabel[t.status]}</span></div>
        <p>{checkLabel(t.check_kind)} · {t.issue_code}</p>
        {t.status!=='closed'?<div className="automation-task-controls">
         <label className="automation-field">Bearbeitungsstand<select value={taskStatuses[t.id]||t.status} onChange={e=>setTaskStatuses(old=>({...old,[t.id]:e.target.value as TaskStatus}))}>
          <option value="open">Offen</option><option value="working">In Bearbeitung</option><option value="review_requested">Zur Prüfung vorgelegt</option><option value="closed">Administrativ schließen</option>
         </select></label>
         <label className="automation-field">Begründung<input maxLength={2000} value={notes[t.id]??t.note??''} placeholder="Was wurde geprüft / dokumentiert?" onChange={e=>setNotes(old=>({...old,[t.id]:e.target.value}))}/></label>
         <button type="button" className="ops-refresh" disabled={saving!==null||taskStatuses[t.id]===t.status} onClick={()=>void updateTask(t)}><Save size={15}/>{saving===t.id?'Speichert …':'Status speichern'}</button>
        </div>:<p className="automation-admin-closed">Administrativ geschlossen, keine technische oder kommerzielle Freigabe</p>}
       </article>)}
     </div>
    </div>
    <div className="automation-side">
     <div className="automation-block">
      <div className="eyebrow">DETERMINISTIC WORKER / MONITORING ONLY</div><h3>Bestehender Worker</h3>
      <p className="automation-small">Die vorhandene Warteschlange wird hier ausschließlich angezeigt und nicht durch die neuen Prüfungen befüllt oder ausgeführt.</p>
      <div className="automation-worker">
       <div><span>Registrierte Worker</span><strong>{overview.worker_heartbeats.length}</strong></div>
       <div><span>Warteschlangen-Jobs</span><strong>{overview.jobs.length}</strong></div>
       <div><span>Protokollierte Worker-Ausführungen</span><strong>{overview.job_runs.length}</strong></div>
      </div>
      {lastWorker&&<div className="automation-heartbeat"><strong><Activity size={15}/> {lastWorker.worker}</strong><p>Letzter erfolgreicher Durchlauf: {datetime(lastWorker.last_completed)}</p><p>Bearbeitete Jobs: {lastWorker.handled_count}</p>
       {lastWorker.last_error&&<p className="automation-worker-error">{lastWorker.last_error}</p>}
      </div>}
      <button className="ops-refresh" type="button" onClick={()=>setShowWorker(!showWorker)}><FileText size={15}/>{showWorker?'Details schließen':'Worker-Protokolle anzeigen'}</button>
      {showWorker&&<div className="automation-job-list">
       {overview.jobs.length===0?<p>Keine Jobs in der Queue.</p>:overview.jobs.map(j=><article key={j.id}><strong>{j.job_key} · {j.kind}</strong><p>{j.status} · {j.attempts}/{j.max_attempts} Versuche · Fällig {datetime(j.due_at)}</p>{j.last_error&&<small>{j.last_error}</small>}</article>)}
       {overview.job_runs.length===0?<p>Noch keine Job-Ausführungen protokolliert.</p>:overview.job_runs.map(j=><article key={j.id}><strong>Joblauf #{j.id}</strong><p>{datetime(j.began_at)} – {datetime(j.finished_at)}</p>{j.error&&<small>{j.error}</small>}</article>)}
      </div>}
     </div>
     <div className="automation-block">
      <div className="eyebrow">AGENT SAFETY POLICY</div><h3>Schreib- und Freigabegrenzen</h3>
      <div className="automation-policy">
       <p><CheckCircle2 size={16}/> Nur Unternehmensdaten prüfen und dokumentieren</p>
       <p><CheckCircle2 size={16}/> Prüfhinweise als interne Verwaltungsaufgaben speichern</p>
       <p><ShieldAlert size={16}/> Keine Flüge oder Crewreservierungen freigeben</p>
       <p><ShieldAlert size={16}/> Keine Verträge aktivieren oder Zahlungen auslösen</p>
       <p><ShieldAlert size={16}/> Keine externen Nachrichten ohne gesonderte Freigabe</p>
      </div>
      <p className="automation-small">Künftige KI-Agenten benötigen zusätzliche Berechtigungen, eine kontrollierte Ausführungsumgebung und einen unabhängigen End-to-End-Test.</p>
     </div>
    </div>
   </div>
   <div className="ops-footer"><Workflow size={15}/> Status: manuell gestartete regelbasierte Prüfungen · kein autonomer KI-Betrieb.</div>
  </>}
 </section>;
}
