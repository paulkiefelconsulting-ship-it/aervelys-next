'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Check, ClipboardCopy, CloudOff, ClipboardList, Plane, RadioTower, RefreshCw, ShieldAlert} from 'lucide-react';
import styles from './MsfsMissionDesk.module.css';

type DispatchDraft={
 id:string;
 request_id:string;
 request_code:string;
 registration:string|null;
 origin:string;
 destination:string;
 requested_departure:string;
 estimated_block_minutes:number|null;
 planning_status:string;
 coordinator_note:string|null;
};
type FetchState='loading'|'ready'|'error';

function dateLabel(value:string|undefined){
 if(!value)return 'Nicht hinterlegt';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Nicht hinterlegt':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function safe(value:string|null|undefined){return value?.trim()||'—';}

export default function MsfsMissionDesk(){
 const [drafts,setDrafts]=useState<DispatchDraft[]>([]);
 const [state,setState]=useState<FetchState>('loading');
 const [error,setError]=useState('');
 const [selected,setSelected]=useState('');
 const [feedback,setFeedback]=useState('');
 const [updatedAt,setUpdatedAt]=useState('');
 const refresh=useCallback(async()=>{
  setState('loading');
  setError('');
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
   const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   if(!url||!key)throw new Error('Supabase ist nicht konfiguriert.');
   const client=createBrowserClient(url,key);
   // Read-only, permission-gated RPC already used by the Dispatch Workbench.
   const {data,error:rpcError}=await client.rpc('aervelys_dispatch_plans_list');
   if(rpcError||!Array.isArray(data))throw new Error('Keine Berechtigung oder keine Verbindung zur Flugdisposition.');
   setDrafts(data as DispatchDraft[]);
   setSelected(previous=>data.some((item:DispatchDraft)=>item.id===previous)?previous:(data[0]?.id||''));
   setUpdatedAt(new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
   setState('ready');
  }catch(e){
   setState('error');
   setError(e instanceof Error?e.message:'Dispatch-Daten nicht verfügbar.');
  }
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const plan=useMemo(()=>drafts.find(item=>item.id===selected),[drafts,selected]);

 async function copyBrief(){
  if(!plan)return;
  const briefing=[
   'AERVELYS NEXT // MSFS 2024 // DISPATCH-ENTWURF',
   'KEINE OPERATIVE FLUGFREIGABE',
   'Auftrag: '+safe(plan.request_code),
   'Route: '+safe(plan.origin)+' -> '+safe(plan.destination),
   'Flugzeug: '+safe(plan.registration),
   'Geplanter Abflug: '+dateLabel(plan.requested_departure),
   'Geschätzte Blockzeit: '+String(plan.estimated_block_minutes??'unbekannt')+' min',
   'Planungsstatus: '+safe(plan.planning_status),
   'Bemerkung: '+safe(plan.coordinator_note),
   'MSFS/ACARS: nicht verbunden – keine Telemetrie erfasst'
  ].join('\n');
  try{
   await navigator.clipboard.writeText(briefing);
   setFeedback('Entwurfsbriefing kopiert. Es ist keine Flugfreigabe.');
  }catch{
   setFeedback('Kopieren nicht möglich. Bitte Browser-Berechtigung prüfen.');
  }
 }

 return <div className={styles.stack}>
  <section className="panel">
   <div className="panelhead">
    <div className="eyebrow">FLIGHT SIMULATOR OPERATIONS / FIRST STAGE</div>
    <h2>AERVELYS SIM Mission Desk</h2>
    <p className="lead">Deine Flugdisposition mit MSFS 2024 verbinden. Derzeit ein geschützter, lesender Dispatch-Einblick – noch keine SimConnect-Verbindung.</p>
   </div>
   <div className={styles.statusGrid}>
    <div className={styles.statusCard}>
     <div className={styles.statusTitle}><CloudOff size={19}/><strong>SIM BRIDGE</strong></div>
     <span className={styles.offline}>Nicht eingerichtet</span>
     <small>Lokaler SimConnect-Reader und Phasendetektor liegen als Quellcode vor. Windows-Test, sichere Kopplung und Live-Übertragung fehlen noch.</small>
    </div>
    <div className={styles.statusCard}>
     <div className={styles.statusTitle}><RadioTower size={19}/><strong>ACARS & TELEMETRIE</strong></div>
     <span className={styles.offline}>Keine Live-Daten</span>
     <small>Start, Landung und Flugphasen werden noch nicht aus MSFS übernommen.</small>
    </div>
    <div className={styles.statusCard}>
     <div className={styles.statusTitle}><ClipboardList size={19}/><strong>NEXT DISPATCH</strong></div>
     <span className={state==='ready'?styles.active:styles.offline}>{state==='ready'?'Geschützter Zugriff':'Nicht abrufbar'}</span>
     <small>{state==='ready'?drafts.length+' vorhandene Planungsentwürfe · Stand '+updatedAt:'CEO-/OPS-Anmeldung und Datenbankverbindung erforderlich.'}</small>
    </div>
   </div>
   <div className={styles.safety}><ShieldAlert size={18}/><span>Planungsentwürfe sind keine Flugfreigaben. Weder Musterberechtigung noch Wartung, Versicherung oder Performance sind hierdurch bestätigt. Alle Simulator-Ereignisse bleiben zukünftig ausdrücklich als SIM gekennzeichnet.</span></div>
  </section>

  <section className="panel">
   <div className={styles.heading}>
    <div><div className="eyebrow">NEXT → MSFS 2024</div><h2>Flugauftrag auswählen</h2><p>Vorhandene Dispatch-Entwürfe aus AERVELYS NEXT – keine erfundenen Charteraufträge.</p></div>
    <button type="button" className={styles.button} onClick={()=>void refresh()} disabled={state==='loading'}><RefreshCw size={16}/> Aktualisieren</button>
   </div>
   {state==='loading'&&<p className={styles.message}>Dispatch-Daten werden geprüft …</p>}
   {state==='error'&&<p className={styles.message} role="alert">{error}</p>}
   {state==='ready'&&drafts.length===0&&<p className={styles.message}>Noch keine Flugplanungsentwürfe vorhanden. Ein Charterauftrag kann zunächst in der Flugdisposition geplant werden.</p>}
   {state==='ready'&&drafts.length>0&&<div className={styles.split}>
    <div className={styles.list} aria-label="Dispatch-Entwürfe">
     {drafts.map(item=><button type="button" key={item.id} className={selected===item.id?styles.selected:styles.flight} onClick={()=>{setSelected(item.id);setFeedback('');}}>
      <span className={styles.flightTop}><strong>{safe(item.request_code)}</strong><span>{safe(item.planning_status)}</span></span>
      <span className={styles.route}><Plane size={15}/> {safe(item.origin)} → {safe(item.destination)}</span>
      <small>{safe(item.registration)} · {dateLabel(item.requested_departure)}</small>
     </button>)}
    </div>
    {plan&&<div className={styles.details}>
     <div className="eyebrow">MISSION BRIEF / DRAFT</div>
     <h3>{safe(plan.origin)} <span>→</span> {safe(plan.destination)}</h3>
     <div className={styles.facts}>
      <div><small>Auftrag</small><strong>{safe(plan.request_code)}</strong></div>
      <div><small>Flugzeug</small><strong>{safe(plan.registration)}</strong></div>
      <div><small>Abflug</small><strong>{dateLabel(plan.requested_departure)}</strong></div>
      <div><small>Blockzeit (Schätzung)</small><strong>{plan.estimated_block_minutes??'—'} min</strong></div>
      <div><small>Status</small><strong>{safe(plan.planning_status)}</strong></div>
     </div>
     {plan.coordinator_note&&<p className={styles.note}>{plan.coordinator_note}</p>}
     <button type="button" className={styles.button} onClick={()=>void copyBrief()}><ClipboardCopy size={16}/> Entwurfsbriefing kopieren</button>
     {feedback&&<p className={styles.feedback} role="status"><Check size={14}/>{feedback}</p>}
     <p className={styles.fineprint}>„Als Pilot übernehmen“, SimBrief-Übergabe und automatische Bestätigung werden erst nach gesicherter Kopplung und Freigabe implementiert.</p>
    </div>}
   </div>}
  </section>

  <section className="panel">
   <div className="panelhead">
    <div className="eyebrow">ROADMAP / ACARS</div>
    <h2>Automatischer Flugbericht</h2>
    <p className="lead">Diese Phasen sollen nach Anschluss der lokalen Windows-Bridge echte MSFS-Messungen auswerten, nicht simulierte oder manuell erfundene Werte.</p>
    <div className={styles.phases}>
     {['Connected','Taxi out','Takeoff','Cruise','Approach','Landing','Taxi in','Debrief'].map((phase,i)=><div className={styles.phase} key={phase}><span>{String(i+1).padStart(2,'0')}</span><strong>{phase}</strong><small>Ausstehend</small></div>)}
    </div>
    <p className={styles.fineprint}>Technische Grundlage: Microsoft SimConnect SDK. Ein lokales Windows-Programm übernimmt später den Datenaustausch; Vercel kann nicht direkt auf MSFS auf deinem Rechner zugreifen.</p>
   </div>
  </section>
 </div>;
}
