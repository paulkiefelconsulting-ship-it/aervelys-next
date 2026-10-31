'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ClipboardCheck,RefreshCw,ShieldAlert,Workflow} from 'lucide-react';
import styles from './VirtualAgentDecisionDesk.module.css';

type DecisionStatus='queued'|'candidate_proposed'|'needs_review'|'informational'|'failed';
type DecisionAction='screen_sim_candidate'|'escalate_review'|'monitor_sim'|'acknowledge_review';
type DecisionTask={
 id:number;request_id:string;request_code:string;question_id:number;handoff_id:number;
 action_kind:DecisionAction;assigned_agent:'dispatch'|'crew'|'ops';
 priority:'high'|'normal';status:DecisionStatus;decision_basis:string;
 evidence:Record<string,unknown>;updated_at:string;
 acknowledged_at:string|null;acknowledge_note:string|null;
 handoff_status:'open'|'superseded'|'closed';
};
type DecisionEvent={
 id:number;decision_id:number;request_id:string;action_kind:DecisionAction;
 outcome:'candidate_proposed'|'needs_review'|'informational'|'failed'|'acknowledged';
 detail:string;created_at:string;
};
type Overview={
 tasks:DecisionTask[];events:DecisionEvent[];review_open:number;can_acknowledge:boolean;
 simulation_only:true;operational_approval:false;llm_connected:false;
};
type Run={
 decision:{examined:number;tasks_new:number;candidates_proposed:number;reviews_required:number;failed:number;simulation_only:true;flight_releases:0;skipped?:string};
 simulation_only:true;operational_approval:false;flight_releases:0;
};
const statusText:Record<DecisionStatus,string>={
 queued:'Noch nicht geprüft',candidate_proposed:'SIM-Kandidat gefunden',
 needs_review:'Prüfung erforderlich',informational:'Automatisch ausgewertet',failed:'Automatikfehler'
};
const agentText={dispatch:'Dispatch',crew:'Crewplanung',ops:'OPS'};
const actionText:Record<DecisionAction,string>={
 screen_sim_candidate:'Flugzeugkandidaten finden',
 escalate_review:'Fachliche Entscheidung prüfen',
 monitor_sim:'SIM-Verlauf verfolgen',
 acknowledge_review:'Kenntnisnahme durch CEO'
};
function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function date(iso:string|null){
 if(!iso)return '—';
 const d=new Date(iso);
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}

export default function VirtualAgentDecisionDesk(){
 const [data,setData]=useState<Overview|null>(null);
 const [selectedId,setSelectedId]=useState<number>(0);
 const [filter,setFilter]=useState<'all'|'review'|'automated'>('review');
 const [note,setNote]=useState('');
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [updated,setUpdated]=useState('');

 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const result=await db().rpc('aervelys_virtual_decisions_overview');
   const incoming=result.data as Overview|null;
   if(result.error||!incoming||!Array.isArray(incoming.tasks)||
      !Array.isArray(incoming.events)||typeof incoming.can_acknowledge!=='boolean'||
      incoming.simulation_only!==true||incoming.operational_approval!==false||
      incoming.llm_connected!==false)
     throw new Error('Ungültige oder nicht berechtigte Entscheidungsübersicht');
   setData(incoming);
   setSelectedId(old=>incoming.tasks.some(t=>t.id===old)?old:incoming.tasks[0]?.id||0);
   setUpdated(new Date().toISOString());setError('');
  }catch{
   setData(null);setError('SIM-Entscheidungszentrale nicht erreichbar. Bitte CEO-/OPS-Rolle und Supabase-Zugriff prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void load();
  const interval=window.setInterval(()=>void load(true),90000);
  return()=>window.clearInterval(interval);
 },[load]);

 const ordered=useMemo(()=>(data?.tasks||[]).slice().sort((a,b)=>{
  const score=(t:DecisionTask)=>{
   if(t.handoff_status!=='open')return 0;
   if(t.status==='needs_review'&&!t.acknowledged_at)return 5;
   if(t.status==='failed')return 4;
   if(t.status==='needs_review')return 3;
   if(t.status==='candidate_proposed')return 2;
   return 1;
  };
  return score(b)-score(a)||b.id-a.id;
 }),[data]);
 const visible=ordered.filter(t=>{
  if(filter==='review')return t.handoff_status==='open'&&(t.status==='needs_review'||t.status==='failed');
  if(filter==='automated')return t.status==='candidate_proposed'||t.status==='informational';
  return true;
 });
 const current=visible.find(t=>t.id===selectedId)||visible[0]||null;
 const events=(data?.events||[]).filter(e=>e.decision_id===current?.id);
 const candidates=(data?.events||[]).filter(e=>e.outcome==='candidate_proposed').length;

 async function run(){
  if(working)return;
  setWorking(true);setError('');setNotice('');
  try{
   const r=await db().rpc('aervelys_virtual_decisions_run',{p_limit:20});
   const value=r.data as Run|null;
   if(r.error||!value||value.simulation_only!==true||
     value.operational_approval!==false||value.flight_releases!==0||
     !value.decision||value.decision.simulation_only!==true||
     (value.decision.flight_releases!==undefined&&value.decision.flight_releases!==0))
     throw new Error('SIM-Lauf nicht vollständig bestätigt');
   setNotice(value.decision.skipped?'SIM-Lauf übersprungen: '+value.decision.skipped:
     'Bearbeitet: '+value.decision.examined+' · Neue SIM-Kandidaten: '+
      value.decision.candidates_proposed+' · Prüfaufträge: '+value.decision.reviews_required+
      ' · Fehler: '+value.decision.failed+'.');
   await load(true);
  }catch{
   setError('Automatische Entscheidungsrunde nicht bestätigt. Keine operative Freigabe angenommen.');
  }finally{setWorking(false);}
 }
 async function acknowledge(){
  if(!current||!data?.can_acknowledge||working||note.trim().length<3||note.trim().length>250)return;
  setWorking(true);setError('');setNotice('');
  try{
   const r=await db().rpc('aervelys_virtual_decision_acknowledge',{
    p_decision_id:current.id,p_note:note.trim()
   });
   const v=r.data as {acknowledged:true;simulation_only:true;operational_approval:false;flight_releases:0}|null;
   if(r.error||!v||v.acknowledged!==true||v.simulation_only!==true||
      v.operational_approval!==false||v.flight_releases!==0)
     throw new Error('CEO-Kenntnisnahme nicht bestätigt');
   setNote('');
   setNotice('Prüfauftrag als gesehen dokumentiert. Das ist ausdrücklich keine Flugfreigabe.');
   await load(true);
  }catch{
   setError('Kenntnisnahme nicht gespeichert. Möglicherweise fehlen CEO-Rechte oder der Fall wurde bereits geändert.');
  }finally{setWorking(false);}
 }

 return <section className={'virtual-staff-block '+styles.root} aria-label="SIM-Agenten-Entscheidungszentrale">
  <div className={styles.heading}>
   <div>
    <div className="eyebrow">AGENT DECISION ORCHESTRATION / SIM ONLY</div>
    <h3>Entscheidungszentrale</h3>
    <p>Die Mitarbeiter nutzen dokumentierte Rückfragen, erzeugen erlaubte SIM-Vorschläge und leiten ungeklärte OPS-Nachweise gezielt an den CEO weiter.</p>
   </div>
   <div className={styles.actions}>
    <button type="button" className="ops-refresh" disabled={working||loading} onClick={()=>void load()}>
     <RefreshCw size={15}/> Aktualisieren
    </button>
    <button type="button" className="ops-refresh" disabled={working||loading||!data} onClick={()=>void run()}>
     <Workflow size={15}/>{working?'Prüfung läuft …':'SIM-Entscheidungen ausführen'}
    </button>
   </div>
  </div>
  <div className={styles.guard}><ShieldAlert size={17}/>
   <span>Die Automatik erstellt nur unverbindliche SIM-Kandidaten. Eine CEO-Kenntnisnahme ersetzt keine OPS-Freigabe, Qualifikation, Versicherungsprüfung oder technische Flugfreigabe. Kein externes Sprachmodell verbunden.</span>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {data&&<>
   <div className={styles.metrics}>
    <div><strong>{data.review_open}</strong><span>Neue CEO-Prüfaufträge</span></div>
    <div><strong>{candidates}</strong><span>Dokumentierte SIM-Kandidatensuchen</span></div>
    <div><strong>{data.tasks.length}</strong><span>Entscheidungen im Verlauf</span></div>
   </div>
   <div className={styles.filters}>
    {([['review','Prüfen'],['automated','Automatisch bearbeitet'],['all','Alle']] as const).map(([value,label])=>
     <button type="button" key={value} aria-pressed={filter===value}
       className={filter===value?styles.active:''} onClick={()=>{setFilter(value);setNote('');}}>
       {label}
     </button>
    )}
   </div>
   {visible.length===0?<p className={styles.empty}>Keine Entscheidungen in dieser Ansicht.</p>:
    <div className={styles.columns}>
     <div className={styles.tasks}>
      {visible.map(task=><button type="button" key={task.id}
        aria-pressed={current?.id===task.id}
        className={current?.id===task.id?styles.selected:''}
        onClick={()=>{setSelectedId(task.id);setNote('');}}>
        <strong>{task.request_code}</strong>
        <span>{actionText[task.action_kind]}</span>
        <small>{task.acknowledged_at?'Vom CEO gesehen · ':''}{statusText[task.status]} · {agentText[task.assigned_agent]}</small>
       </button>)}
     </div>
     {current&&<article className={styles.detail}>
      <div className="eyebrow">DECISION #{current.id} / {current.request_code}</div>
      <h4>{actionText[current.action_kind]}</h4>
      <div className={styles.tags}>
       <span>{statusText[current.status]}</span>
       <span>{current.priority==='high'?'Hohe Priorität':'Normale Priorität'}</span>
       <span>{agentText[current.assigned_agent]}</span>
       {current.handoff_status!=='open'&&<span>Historischer Fall</span>}
      </div>
      <p>{current.decision_basis}</p>
      {current.status==='needs_review'&&current.handoff_status==='open'&&<>
       <div className={styles.review}>
        <strong><ClipboardCheck size={16}/> CEO-Prüfauftrag</strong>
        {current.acknowledged_at?<>
          <p>Gesehen am {date(current.acknowledged_at)}. Die fachlichen Nachweise bleiben weiterhin offen.</p>
          {current.acknowledge_note&&<p>Notiz: {current.acknowledge_note}</p>}
        </>:data.can_acknowledge?<>
         <label htmlFor="sim-decision-ack-note">Prüfnotiz (keine Freigabe)</label>
         <textarea id="sim-decision-ack-note" rows={3} maxLength={250}
           placeholder="Was muss vor einer Entscheidung geprüft werden?"
           value={note} onChange={e=>setNote(e.target.value)}/>
         <button type="button" className="ops-refresh" disabled={working||note.trim().length<3||note.trim().length>250}
           onClick={()=>void acknowledge()}>Nur als gesehen markieren</button>
        </>:<p>Die Kenntnisnahme kann ausschließlich der angemeldete CEO dokumentieren.</p>}
       </div>
      </>}
      <div className={styles.history}>
       <h5>Nachvollziehbarer Entscheidungsverlauf</h5>
       {events.length===0?<p>Keine Ereignisse im letzten Snapshot.</p>:events.map(e=><div key={e.id}>
        <strong>{e.outcome==='acknowledged'?'CEO-Kenntnisnahme':statusText[e.outcome as DecisionStatus]||e.outcome}</strong>
        <p>{e.detail}</p><small>{date(e.created_at)}</small>
       </div>)}
      </div>
     </article>}
    </div>}
   <p className={styles.updated}>Aktualisiert: {date(updated)} · Automatischer Abgleich über den vorhandenen SIM-Cronjob.</p>
  </>}
  {!data&&!error&&<p className={styles.empty}>{loading?'Entscheidungen werden geladen …':'Keine Daten vorhanden.'}</p>}
 </section>;
}
