'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowRight,Clock3,Inbox,RefreshCw,ShieldCheck} from 'lucide-react';
import styles from './VirtualHandoffInbox.module.css';

type Department='system'|'sales'|'dispatch'|'crew'|'ops';
type Handoff={
 id:number;request_id:string;request_code:string;stage:string;
 from_agent:Department;to_agent:Department;subject:string;body:string;
 status:'open'|'superseded'|'closed';created_at:string;completed_at:string|null;
};
type Overview={handoffs:Handoff[];open_count:number;simulation_only:true;llm_connected:false;operational_approval:false};
type Tick={examined:number;new_handoffs:number;closed_previous:number;simulation_only:true;operational_changes:0};
type AgentRun={id:number;handoff_id:number;request_id:string;agent:Department;outcome:'completed'|'waiting'|'blocked'|'failed';detail:string;created_at:string};
type AgentState={handoff_id:number;execution_state:'queued'|'waiting'|'completed'|'blocked'|'failed';attempt_count:number;last_result:string|null;last_attempt_at:string|null;next_attempt_at:string|null};
type ExecutionOverview={runs:AgentRun[];states:AgentState[];simulation_only:true;operational_approval:false};
type WorkResult={processed:number;completed:number;waiting:number;blocked:number;failed:number;sales_sim_quotes:number;simulation_only:true;real_offers:0;real_crew_assignments:0;flights_released:0;skipped?:string};
const departments:Record<Department,string>={
 system:'System',sales:'Vertrieb',dispatch:'Dispatch',crew:'Crewplanung',ops:'OPS'
};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function when(s:string|null){
 if(!s)return '—';const d=new Date(s);
 return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}

export default function VirtualHandoffInbox(){
 const [data,setData]=useState<Overview|null>(null);
 const [execution,setExecution]=useState<ExecutionOverview|null>(null);
 const [filter,setFilter]=useState<'open'|'all'>('open');
 const [selected,setSelected]=useState<string>('');
 const [loading,setLoading]=useState(true);
 const [syncing,setSyncing]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [lastRefreshed,setLastRefreshed]=useState('');
 const load=useCallback(async(silent=false)=>{
   if(!silent)setLoading(true);
   try{
     const db=client();
     const [r,actions]=await Promise.all([
       db.rpc('aervelys_virtual_handoffs_overview'),
       db.rpc('aervelys_virtual_handoffs_execution_overview')
     ]);
     const incoming=r.data as Overview|null;
     const actionData=actions.data as ExecutionOverview|null;
     if(r.error||actions.error||!incoming||!Array.isArray(incoming.handoffs)||
       !actionData||!Array.isArray(actionData.runs)||!Array.isArray(actionData.states)||
       incoming.simulation_only!==true||incoming.operational_approval!==false||
       actionData.simulation_only!==true||actionData.operational_approval!==false){
       throw new Error('Keine autorisierte Übergabeübersicht');
     }
     setData(incoming);
     setExecution(actionData);
     setSelected(old=>incoming.handoffs.some(x=>x.request_id===old)?old:incoming.handoffs[0]?.request_id||'');
     setLastRefreshed(new Date().toISOString());
     setError('');
   }catch{
     setData(null);setExecution(null);setLastRefreshed('');
     setError('Agenten-Übergaben nicht erreichbar. Bitte Anmeldung, CEO-/OPS-Rechte und Supabase-Funktion prüfen.');
   }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
   void load();
   const timer=window.setInterval(()=>{void load(true);},90000);
   return()=>window.clearInterval(timer);
 },[load]);
 async function runAgents(){
   if(syncing)return;
   setSyncing(true);setNotice('');setError('');
   try{
     const r=await client().rpc('aervelys_virtual_department_execute',{p_limit:8});
     const result=r.data as WorkResult|null;
     if(r.error||!result||result.simulation_only!==true||
       (result.real_offers!==undefined&&result.real_offers!==0)||
       (result.flights_released!==undefined&&result.flights_released!==0)||
       (result.real_crew_assignments!==undefined&&result.real_crew_assignments!==0)){
       throw new Error('SIM-Agentenrunde wurde nicht bestätigt');
     }
     setNotice(result.skipped
       ?'Agentenrunde übersprungen: '+result.skipped
       :'Agentenrunde: '+result.processed+' Übergaben geprüft · '+result.completed+
         ' SIM-Entwürfe erledigt · '+result.waiting+' wartend · '+
         result.blocked+' blockiert · '+result.sales_sim_quotes+' SIM-Preisvarianten.');
     await load(true);
   }catch{setError('Agentenrunde fehlgeschlagen. Keine Ausführung als erfolgreich bestätigt.');}
   finally{setSyncing(false);}
 }
 async function sync(){
   if(syncing)return;
   setSyncing(true);setNotice('');setError('');
   try{
     const r=await client().rpc('aervelys_virtual_handoffs_sync',{p_limit:40});
     const result=r.data as Tick|null;
     if(r.error||!result||result.simulation_only!==true||result.operational_changes!==0){
       throw new Error('Agentenzyklus nicht bestätigt');
     }
     setNotice(result.new_handoffs+' neue interne SIM-Übergaben · '+result.examined+' Vorgänge geprüft · keine operative Änderung.');
     await load(true);
   }catch{setError('Interne Übergaben konnten nicht aktualisiert werden. Keine weiteren Aktionen ausgeführt.');}
   finally{setSyncing(false);}
 }
 const cases=useMemo(()=>{
   const all=data?.handoffs||[];
   const ids=new Set<string>();
   return all.filter(h=>{if(ids.has(h.request_id))return false;ids.add(h.request_id);return true;});
 },[data]);
 const visible=cases.filter(c=>filter==='all'||data?.handoffs.some(h=>h.request_id===c.request_id&&h.status==='open'));
 const current=visible.find(c=>c.request_id===selected)||visible[0]||null;
 const timeline=current?data?.handoffs.filter(h=>h.request_id===current.request_id)||[]:[];
 const currentOpen=timeline.find(x=>x.status==='open');
 const executionById=new Map<number,AgentState>((execution?.states||[]).map(x=>[x.handoff_id,x] as const));
 const currentRuns=(execution?.runs||[]).filter(x=>x.request_id===current?.request_id);
 const openIds=new Set((data?.handoffs||[]).filter(x=>x.status==='open').map(x=>x.id));
 const openStates=(execution?.states||[]).filter(x=>openIds.has(x.handoff_id));
 const failedStates=openStates.filter(x=>x.execution_state==='failed'||x.execution_state==='blocked').length;
 return <section className={'virtual-staff-block '+styles.workspace} aria-label="Persistente Agenten-Nachrichtenzentrale">
   <div className={styles.heading}>
     <div><div className="eyebrow">INTER-AGENT COMMUNICATION / STORED SIM EVENTS</div>
       <h3>Interne Agenten-Nachrichtenzentrale</h3>
       <p>Vertrieb, Dispatch, Crewplanung und OPS reichen SIM-Vorgänge über gespeicherte, nachvollziehbare Status-Übergaben weiter.</p>
     </div>
     <div className={styles.actions}>
       <button type="button" className="ops-refresh" disabled={loading||syncing} onClick={()=>void load()}>
         <RefreshCw size={15}/> Ansicht aktualisieren</button>
       <button type="button" className="ops-refresh" disabled={loading||syncing||!data} onClick={()=>void runAgents()}>
         <ArrowRight size={15}/>{syncing?'Agenten arbeiten …':'SIM-Agentenrunde starten'}</button>
       <button type="button" className="ops-refresh" disabled={loading||syncing||!data} onClick={()=>void sync()}>
         <ArrowRight size={15}/>{syncing?'Prüfe …':'SIM-Übergaben prüfen'}</button>
     </div>
   </div>
   <p className={styles.guard}><ShieldCheck size={16}/>
     Gespeicherte, regelbasierte SIM-Ereignisse – keine LLM-Unterhaltung.
     Hier werden keine echten Nachrichten versendet, Flugzeuge reserviert oder Flugfreigaben erteilt.</p>
   {notice&&<p className={styles.notice} role="status">{notice}</p>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {data&&<>
     <div className={styles.meta}>
       <span><Inbox size={15}/> {data.open_count} offene Übergaben</span>
       <span><ShieldCheck size={15}/> {failedStates} blockiert / fehlgeschlagen</span>
       <span><Clock3 size={15}/> Synchronisiert: {when(lastRefreshed)}</span>
       <div className={styles.filters}>
         <button type="button" aria-pressed={filter==='open'} className={filter==='open'?styles.active:''} onClick={()=>setFilter('open')}>Offen</button>
         <button type="button" aria-pressed={filter==='all'} className={filter==='all'?styles.active:''} onClick={()=>setFilter('all')}>Alle Vorgänge</button>
       </div>
     </div>
     {visible.length===0?<p className={styles.empty}>Noch keine passenden SIM-Übergaben gespeichert.</p>:
       <div className={styles.columns}>
         <div className={styles.cases}>
           {visible.map(c=>{
             const active=data.handoffs.find(h=>h.request_id===c.request_id&&h.status==='open');
             return <button type="button" key={c.request_id}
               className={current?.request_id===c.request_id?styles.selected:''}
               onClick={()=>setSelected(c.request_id)} aria-pressed={current?.request_id===c.request_id}>
               <strong>{c.request_code}</strong>
               <span>{active?.subject||'Übergabe abgeschlossen'}</span>
               <small>{active?'Zuständig: '+departments[active.to_agent]:'Kein offener Empfänger'}</small>
             </button>;
           })}
         </div>
         {current&&<div className={styles.thread}>
           <div className="eyebrow">SAVED HANDOFF HISTORY / {current.request_code}</div>
           <h4>{currentOpen?.subject||'Vorgangsverlauf'}</h4>
           <p>{currentOpen?.body||'Zurzeit keine offene Übergabe.'}</p>
           <div className={styles.timeline}>{timeline.map(h=><article key={h.id}>
             <div className={styles.messageTop}>
               <strong>{departments[h.from_agent]} <ArrowRight size={13}/> {departments[h.to_agent]}</strong>
               <span className={h.status==='open'?styles.open:styles.superseded}>
                 {h.status==='open'?'Aktuell':h.status==='closed'?'Beendet':'Abgelöst'}</span>
             </div>
             <h5>{h.subject}</h5>
             <p>{h.body}</p>
             {executionById.has(h.id)&&<div className={styles.executionStatus}>
               <strong>Agentenstatus: {executionById.get(h.id)!.execution_state}</strong>
               {executionById.get(h.id)!.last_result&&<p>{executionById.get(h.id)!.last_result}</p>}
               <small>Versuche: {executionById.get(h.id)!.attempt_count} ·
                 Letzte Prüfung: {when(executionById.get(h.id)!.last_attempt_at)}</small>
             </div>}
             <small>{when(h.created_at)}{h.completed_at?' · Abgelöst '+when(h.completed_at):''}</small>
           </article>)}</div>
           {currentRuns.length>0&&<div className={styles.executionEvents}>
             <h5>Ausführungsprotokoll</h5>
             {currentRuns.slice(0,8).map(action=><p key={action.id}>
               <strong>{departments[action.agent]} · {action.outcome}</strong>
               {' · '+action.detail+' · '+when(action.created_at)}
             </p>)}
           </div>}
         </div>}
       </div>}
   </>}
   {!data&&!error&&<p className={styles.empty}>{loading?'Interne Übergaben werden geladen …':'Keine Daten.'}</p>}
 </section>;
}
