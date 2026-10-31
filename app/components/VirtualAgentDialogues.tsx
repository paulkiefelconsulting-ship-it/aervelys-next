'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowRight,MessageCircleQuestion,RefreshCw,ShieldAlert} from 'lucide-react';
import styles from './VirtualAgentDialogues.module.css';

type Agent='sales'|'dispatch'|'crew'|'ops';
type Status='waiting'|'answered'|'needs_review';
type Thread={
 id:number;request_id:string;request_code:string;handoff_id:number;question_key:string;
 from_agent:Agent;to_agent:Agent;state:Status;question:string;answer:string|null;
 updated_at:string;handoff_status:'open'|'closed'|'superseded';
};
type Event={id:number;question_id:number;request_id:string;kind:'question'|'answer';author_agent:Agent;body:string;state:Status;created_at:string};
type DialogueSnapshot={
 threads:Thread[];events:Event[];open_questions:number;review_required:number;
 simulation_only:true;operational_approval:false;llm_connected:false;
};
type SyncResponse={reviewed:number;questions_new:number;answers_new:number;simulation_only:true;outbound_messages:0;operational_changes:0;llm_connected:false;skipped?:string};
const agents:Record<Agent,string>={sales:'Vertrieb',dispatch:'Dispatch',crew:'Crewplanung',ops:'OPS'};
const states:Record<Status,string>={waiting:'Nachweis fehlt',answered:'SIM-Auskunft',needs_review:'Prüfung erforderlich'};
function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase-Zugang nicht konfiguriert');
 return createBrowserClient(url,key);
}
function stamp(iso:string){
 const date=new Date(iso);
 return Number.isFinite(date.getTime())?date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'Zeit unbekannt';
}

export default function VirtualAgentDialogues(){
 const [snapshot,setSnapshot]=useState<DialogueSnapshot|null>(null);
 const [selected,setSelected]=useState('');
 const [filter,setFilter]=useState<'all'|'waiting'|'needs_review'|'answered'>('all');
 const [loading,setLoading]=useState(true);
 const [running,setRunning]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [syncedAt,setSyncedAt]=useState('');
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const res=await db().rpc('aervelys_virtual_dialogues_overview');
   const data=res.data as DialogueSnapshot|null;
   if(res.error||!data||!Array.isArray(data.threads)||!Array.isArray(data.events)||
      data.simulation_only!==true||data.operational_approval!==false||data.llm_connected!==false)
     throw new Error('Unvollständiger oder nicht autorisierter SIM-Dialogsnapshot');
   setSnapshot(data);
   setSelected(prev=>data.threads.some(t=>t.request_id===prev)?prev:(data.threads[0]?.request_id||''));
   setSyncedAt(new Date().toISOString());
   setError('');
  }catch{
   setSnapshot(null);setSyncedAt('');
   setError('Interne SIM-Gespräche nicht abrufbar. Bitte CEO-/OPS-Rechte und Supabase-Verbindung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void refresh();
  const timer=window.setInterval(()=>{void refresh(true);},90000);
  return()=>window.clearInterval(timer);
 },[refresh]);
 const cases=useMemo(()=>{
  const seen=new Set<string>();
  return (snapshot?.threads||[]).filter(t=>{
   if(seen.has(t.request_id))return false;
   seen.add(t.request_id);return true;
  });
 },[snapshot]);
 const visible=cases.filter(c=>{
  if(filter==='all')return true;
  return snapshot?.threads.some(t=>t.request_id===c.request_id&&t.handoff_status==='open'&&t.state===filter);
 });
 const current=visible.find(x=>x.request_id===selected)||visible[0]||null;
 const currentThreads=(snapshot?.threads||[]).filter(x=>x.request_id===current?.request_id);
 const currentEvents=(snapshot?.events||[]).filter(x=>x.request_id===current?.request_id).slice().reverse();
 const totalEvents=snapshot?.events.length||0;

 async function sync(){
  if(running)return;
  setRunning(true);setNotice('');setError('');
  try{
   const response=await db().rpc('aervelys_virtual_dialogues_sync',{p_limit:40});
   const result=response.data as SyncResponse|null;
   if(response.error||!result||result.simulation_only!==true||
     result.operational_changes!==0||result.outbound_messages!==0||result.llm_connected!==false)
      throw new Error('SIM-Dialogdurchlauf nicht bestätigt');
   setNotice(result.skipped
     ?'Abgleich übersprungen: '+result.skipped
     :result.reviewed+' Vorgänge geprüft · '+result.questions_new+
      ' neue Rückfragen · '+result.answers_new+' neue oder aktualisierte Antworten.');
   await refresh(true);
  }catch{
   setError('Der Gesprächsabgleich konnte nicht bestätigt werden. Es wird keine operative Freigabe angenommen.');
  }finally{setRunning(false);}
 }
 return <section className={'virtual-staff-block '+styles.workspace} aria-label="Interne Gespräche virtueller Abteilungen">
   <div className={styles.heading}>
     <div>
       <div className="eyebrow">SIM INTER-AGENT DIALOGUES / EVIDENCE BOUND</div>
       <h3>Interne Mitarbeitergespräche</h3>
       <p>Gespeicherte Fragen und Antworten von Vertrieb, Dispatch, Crewplanung und OPS – mit nachvollziehbaren Datenquellen und offenen Nachweisen.</p>
     </div>
     <div className={styles.actions}>
       <button className="ops-refresh" type="button" onClick={()=>void refresh()} disabled={loading||running}>
         <RefreshCw size={15}/> Aktualisieren
       </button>
       <button className="ops-refresh" type="button" onClick={()=>void sync()} disabled={!snapshot||loading||running}>
         <MessageCircleQuestion size={15}/>{running?'Prüfe …':'SIM-Gespräche prüfen'}
       </button>
     </div>
   </div>
   <div className={styles.guard}><ShieldAlert size={17}/>
     <span>Regelbasierte, fiktive Agentenantworten auf Basis vorhandener Datensätze. Keine LLM-Chatbots, keine externen Nachrichten, keine Buchungs- oder Flugfreigaben.</span>
   </div>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {notice&&<p role="status" className={styles.notice}>{notice}</p>}
   {snapshot&&<>
     <div className={styles.summary}>
       <div><strong>{cases.length}</strong><span>SIM-Vorgänge im Dialog</span></div>
       <div><strong>{snapshot.open_questions}</strong><span>Antworten offen</span></div>
       <div><strong>{snapshot.review_required}</strong><span>Fachliche Prüfung erforderlich</span></div>
       <div><strong>{totalEvents}</strong><span>Gespeicherte Gesprächsereignisse (letzte 200)</span></div>
     </div>
     <div className={styles.filters}>
       {([
         ['all','Alle'],['waiting','Wartend'],['needs_review','Prüfung'],['answered','SIM-Auskunft']
       ] as const).map(([key,label])=>
         <button type="button" key={key} aria-pressed={filter===key}
           className={filter===key?styles.active:''} onClick={()=>setFilter(key)}>{label}</button>
       )}
     </div>
     {visible.length===0?<p className={styles.empty}>Keine passenden internen SIM-Gespräche vorhanden.</p>:
       <div className={styles.grid}>
         <nav className={styles.cases} aria-label="SIM-Gespräche auswählen">
           {visible.map(t=>{
             const currentQuestion=snapshot.threads.find(x=>x.request_id===t.request_id&&x.handoff_status==='open')||t;
             return <button type="button" key={t.request_id}
               aria-pressed={current?.request_id===t.request_id}
               className={current?.request_id===t.request_id?styles.selected:''}
               onClick={()=>setSelected(t.request_id)}>
               <strong>{t.request_code}</strong>
               <span>{agents[currentQuestion.from_agent]} <ArrowRight size={12}/> {agents[currentQuestion.to_agent]}</span>
               <small>{states[currentQuestion.state]}{currentQuestion.handoff_status!=='open'?' · historisch':''}</small>
             </button>;
           })}
         </nav>
         {current&&<article className={styles.thread}>
           <div className="eyebrow">{current.request_code} / INTERNAL SIM MESSAGES</div>
           <h4>Gesprächsverlauf</h4>
           {currentThreads.length>0&&<p className={styles.description}>
             {currentThreads.length} Fachthema{currentThreads.length===1?'':'en'} dokumentiert · kein Nachweis einer operativen Freigabe
           </p>}
           <div className={styles.messages}>
             {currentEvents.map(event=><div className={event.kind==='question'?styles.question:styles.answer} key={event.id}>
               <div className={styles.messageHeader}>
                 <strong>{agents[event.author_agent]}</strong>
                 <span>{event.kind==='question'?'Rückfrage':states[event.state]}</span>
               </div>
               <p>{event.body}</p>
               <small>{stamp(event.created_at)}</small>
             </div>)}
             {currentEvents.length===0&&<p className={styles.empty}>Für diesen Fall ist kein Gesprächsereignis im letzten Snapshot enthalten.</p>}
           </div>
         </article>}
       </div>}
     <p className={styles.synced}>Letzter Abgleich: {syncedAt?stamp(syncedAt):'nicht verfügbar'} · Anzeige aktualisiert sich alle 90 Sekunden</p>
   </>}
   {!snapshot&&!error&&<p className={styles.empty}>{loading?'Gesprächsverläufe werden geladen …':'Noch keine Gespräche vorhanden.'}</p>}
 </section>;
}
