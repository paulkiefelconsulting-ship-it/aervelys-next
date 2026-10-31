'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ClipboardList,FileCheck2,RefreshCw,ShieldAlert} from 'lucide-react';
import styles from './VirtualEvidenceReadiness.module.css';

type Kind='aircraft'|'crew';
type SourceState='missing'|'unverified'|'verified_in_source';
type WorkState='open'|'submitted'|'reviewed'|'rejected'|'resolved';
type Task={
 id:number;subject_kind:Kind;subject_label:string;requirement_key:string;
 title:string;guidance:string;responsible_agent:'ops'|'crew'|'finance'|'maintenance';
 source_state:SourceState;workflow_state:WorkState;reference:string|null;
 submission_note:string|null;submitted_at:string|null;review_note:string|null;
 reviewed_at:string|null;updated_at:string;
};
type EvidenceEvent={id:number;task_id:number;action:'submitted'|'reviewed'|'rejected';detail:string;created_at:string};
type Overview={
 tasks:Task[];events:EvidenceEvent[];total:number;missing:number;unverified:number;
 verified_in_source:number;submitted:number;can_review:boolean;
 simulation_only:true;operational_approval:false;automatically_verified:false;
};
type Sync={
 evaluated:number;new_or_changed:number;simulation_only:true;
 verified_facts_fabricated:0;operational_changes:0;skipped?:string;
};
const kindLabel:Record<Kind,string>={aircraft:'Flotte',crew:'Piloten'};
const agentLabel={ops:'OPS',crew:'Crewplanung',finance:'Finanzen',maintenance:'Technik'};
const sourceLabel:Record<SourceState,string>={
 missing:'Nachweis fehlt',unverified:'Angabe unbestätigt',verified_in_source:'Im Fachregister verifiziert'
};
const workLabel:Record<WorkState,string>={
 open:'Offen',submitted:'Beleg zur Prüfung',reviewed:'Dokumentation gesichtet',
 rejected:'Nacharbeit erforderlich',resolved:'Fachregister bestätigt'
};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase fehlt');
 return createBrowserClient(url,key);
}
function displayDate(value:string|null){
 if(!value)return '—';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
export default function VirtualEvidenceReadiness(){
 const [data,setData]=useState<Overview|null>(null);
 const [kind,setKind]=useState<'all'|Kind>('all');
 const [filter,setFilter]=useState<'all'|'open'|'submitted'|'verified'>('open');
 const [selected,setSelected]=useState<number>(0);
 const [reference,setReference]=useState('');
 const [note,setNote]=useState('');
 const [reviewNote,setReviewNote]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const r=await client().rpc('aervelys_virtual_evidence_overview');
   const snapshot=r.data as Overview|null;
   if(r.error||!snapshot||!Array.isArray(snapshot.tasks)||!Array.isArray(snapshot.events)||
     snapshot.simulation_only!==true||snapshot.operational_approval!==false||
     snapshot.automatically_verified!==false||typeof snapshot.can_review!=='boolean')
    throw new Error('SIM-Evidenzübersicht fehlt oder Benutzer nicht berechtigt');
   setData(snapshot);
   setSelected(prev=>snapshot.tasks.some(t=>t.id===prev)?prev:(snapshot.tasks[0]?.id||0));
   setError('');
  }catch{
   setData(null);
   setError('Nachweise können nicht geladen werden. Bitte CEO-/OPS-Rolle und Supabase-Verbindung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void refresh();
  const id=window.setInterval(()=>void refresh(true),90000);
  return()=>window.clearInterval(id);
 },[refresh]);
 const visible=useMemo(()=>(data?.tasks||[]).filter(t=>{
  if(kind!=='all'&&t.subject_kind!==kind)return false;
  if(filter==='submitted')return t.workflow_state==='submitted';
  if(filter==='verified')return t.source_state==='verified_in_source';
  if(filter==='open')return t.source_state!=='verified_in_source'&&t.workflow_state!=='submitted';
  return true;
 }),[data,kind,filter]);
 const current=visible.find(t=>t.id===selected)||visible[0]||null;
 const history=(data?.events||[]).filter(e=>e.task_id===current?.id).slice(0,5);

 async function sync(){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_virtual_evidence_sync',{p_limit:200});
   const out=r.data as Sync|null;
   if(r.error||!out||out.simulation_only!==true||
    out.operational_changes!==0||out.verified_facts_fabricated!==0)throw new Error('SIM-Abgleich nicht bestätigt');
   setNotice(out.skipped?'Abgleich übersprungen: '+out.skipped:
    out.evaluated+' Fachanforderungen geprüft · '+out.new_or_changed+' neu oder anhand von Fachregisterdaten geändert.');
   await refresh(true);
  }catch{setError('Nachweisabgleich fehlgeschlagen. Es werden keine Qualifikationen als bestätigt gesetzt.');}
  finally{setBusy(false);}
 }
 async function submit(){
  if(!current||busy||reference.trim().length<5||note.trim().length<5)return;
  const taskId=current.id;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_virtual_evidence_submit',{
    p_task_id:taskId,p_reference:reference.trim(),p_note:note.trim()
   });
   const out=r.data as {submitted:true;source_verified:false;operational_approval:false;simulation_only:true}|null;
   if(r.error||!out||out.submitted!==true||out.source_verified!==false||
    out.operational_approval!==false||out.simulation_only!==true)throw new Error('Eingang nicht bestätigt');
   setReference('');setNote('');
   setNotice('Nachweisreferenz zur Prüfung eingereicht. Die Quelle ist weiterhin nicht verifiziert.');
   await refresh(true);
  }catch{setError('Nachweis wurde nicht bestätigt. Bitte Referenz, Pflichtangaben oder Rollenrechte prüfen.');}
  finally{setBusy(false);}
 }
 async function review(accepted:boolean){
  if(!current||busy||!data?.can_review||reviewNote.trim().length<5)return;
  const taskId=current.id;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_virtual_evidence_review',{
    p_task_id:taskId,p_accepted:accepted,p_note:reviewNote.trim()
   });
   const out=r.data as {reviewed:true;accepted_documentation:boolean;source_verified:false;operational_approval:false;simulation_only:true}|null;
   if(r.error||!out||out.reviewed!==true||out.accepted_documentation!==accepted||
     out.source_verified!==false||out.operational_approval!==false||out.simulation_only!==true)
    throw new Error('Prüfvermerk nicht bestätigt');
   setReviewNote('');
   setNotice(accepted?'Dokumentationsprüfung dokumentiert. Der Fachdatensatz bleibt unverifiziert.':
    'Beleg zurückgewiesen. Weitere Unterlagen sind erforderlich.');
   await refresh(true);
  }catch{setError('CEO-Prüfung konnte nicht gespeichert werden. Bitte Berechtigung und Aufgabenstand prüfen.');}
  finally{setBusy(false);}
 }
 function resetSelection(nextId:number){
  setSelected(nextId);setReference('');setNote('');setReviewNote('');
 }
 return <section className={'virtual-staff-block '+styles.root} aria-label="AERVELYS SIM-Nachweiszentrale">
  <div className={styles.heading}>
   <div>
    <div className="eyebrow">FLEET & CREW / SOURCE EVIDENCE READINESS</div>
    <h3>Nachweiszentrale</h3>
    <p>Automatisch gefundene Nachweislücken für alle aktiven Piloten und Flottenmaschinen. Mit Zuständigkeiten, Quellenverweisen und CEO-Prüfverlauf.</p>
   </div>
   <button type="button" className="ops-refresh" disabled={loading||busy} onClick={()=>void sync()}>
    <RefreshCw size={15}/>{busy?'Bearbeite …':'Fachregister neu prüfen'}
   </button>
  </div>
  <div className={styles.guard}><ShieldAlert size={17}/>
   <span>Dokumentation ist keine Einsatzfreigabe: Selbst eine vom CEO gesichtete Quelle aktualisiert keine Pilotenlizenzen, Wartungsfreigaben, Versicherung oder Flugzeugverfügbarkeit. Bestätigt gilt nur ein gültiger Eintrag im jeweiligen Fachregister.</span>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {data&&<>
   <div className={styles.metrics}>
    <div><strong>{data.total}</strong><span>Anforderungen</span></div>
    <div><strong>{data.missing}</strong><span>Nachweise fehlen</span></div>
    <div><strong>{data.unverified}</strong><span>Angabe ungeprüft</span></div>
    <div><strong>{data.submitted}</strong><span>Zur Prüfung eingereicht</span></div>
    <div><strong>{data.verified_in_source}</strong><span>Im Fachregister bestätigt</span></div>
   </div>
   <div className={styles.controls}>
    <div className={styles.filters}>
     {([['all','Alle'],['aircraft','Flotte'],['crew','Crew']] as const).map(([key,text])=>
      <button type="button" className={kind===key?styles.active:''} aria-pressed={kind===key}
       onClick={()=>{setKind(key);resetSelection(0);}} key={key}>{text}</button>)}
    </div>
    <div className={styles.filters}>
     {([['open','Offen'],['submitted','Eingereicht'],['verified','Verifiziert'],['all','Alle']] as const).map(([key,text])=>
      <button type="button" className={filter===key?styles.active:''} aria-pressed={filter===key}
       onClick={()=>{setFilter(key);resetSelection(0);}} key={key}>{text}</button>)}
    </div>
   </div>
   {visible.length===0?<p className={styles.empty}>In dieser Ansicht gibt es keine passenden Nachweise.</p>:
    <div className={styles.columns}>
     <div className={styles.tasks} aria-label="Nachweisaufgaben">
      {visible.map(t=><button key={t.id} type="button"
       className={current?.id===t.id?styles.selected:''}
       aria-pressed={current?.id===t.id} onClick={()=>resetSelection(t.id)}>
        <strong>{t.subject_label}</strong>
        <span>{t.title}</span>
        <small>{sourceLabel[t.source_state]} · {workLabel[t.workflow_state]}</small>
      </button>)}
     </div>
     {current&&<article className={styles.details}>
      <div className="eyebrow">{kindLabel[current.subject_kind]} / {current.subject_label}</div>
      <h4>{current.title}</h4>
      <div className={styles.tags}>
       <span>{sourceLabel[current.source_state]}</span>
       <span>{workLabel[current.workflow_state]}</span>
       <span>Abteilung: {agentLabel[current.responsible_agent]}</span>
      </div>
      <p>{current.guidance}</p>
      {current.reference&&<div className={styles.reference}>
       <strong>Gespeicherter Quellenverweis (unbestätigt)</strong>
       <p>{current.reference}</p>
       {current.submission_note&&<small>{current.submission_note}</small>}
       <small>Eingang: {displayDate(current.submitted_at)}</small>
       {current.review_note&&<p>CEO-Vermerk: {current.review_note} · {displayDate(current.reviewed_at)}</p>}
      </div>}
      {current.source_state!=='verified_in_source'&&
       <div className={styles.form}>
        <h5><ClipboardList size={15}/> Nachweisreferenz einreichen</h5>
        <label htmlFor="sim-evidence-source">Quelle / Aktenzeichen / Dokumentenreferenz</label>
        <input id="sim-evidence-source" maxLength={350}
         value={reference} onChange={e=>setReference(e.target.value)}
         placeholder="z. B. internes Prüfprotokoll oder technische Dokumenten-ID"/>
        <label htmlFor="sim-evidence-note">Erläuterung</label>
        <textarea id="sim-evidence-note" maxLength={500} rows={3}
         value={note} onChange={e=>setNote(e.target.value)}
         placeholder="Welche konkrete Information belegt diese Quelle?"/>
        <button type="button" className="ops-refresh"
         disabled={busy||reference.trim().length<5||note.trim().length<5}
         onClick={()=>void submit()}>Zur Dokumentenprüfung einreichen</button>
       </div>}
      {current.workflow_state==='submitted'&&data.can_review&&
       <div className={styles.form}>
        <h5><FileCheck2 size={15}/> CEO prüft Dokumentation</h5>
        <label htmlFor="sim-evidence-review">Begründeter Prüfvermerk</label>
        <textarea id="sim-evidence-review" maxLength={500} rows={3}
         value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
         placeholder="Was wurde gesichtet? Welche Fachprüfung bleibt offen?"/>
        <div className={styles.buttons}>
         <button type="button" className="ops-refresh"
          disabled={busy||reviewNote.trim().length<5}
          onClick={()=>void review(true)}>Als gesichtet dokumentieren</button>
         <button type="button" className="ops-refresh"
          disabled={busy||reviewNote.trim().length<5}
          onClick={()=>void review(false)}>Beleg zurückweisen</button>
        </div>
       </div>}
      <div className={styles.history}>
       <h5>Nachweisverlauf</h5>
       {history.length?history.map(event=><p key={event.id}>
        <strong>{event.action==='submitted'?'Eingereicht':event.action==='reviewed'?'Gesichtet':'Zurückgewiesen'}:</strong>
        {' '+event.detail+' · '+displayDate(event.created_at)}
       </p>):<p>Noch kein manueller Prüfverlauf. Die aktuelle Quellenlage stammt direkt aus den Fachregistern.</p>}
      </div>
     </article>}
    </div>}
   <p className={styles.footer}>Die Fachregister werden im bestehenden Zehn-Minuten-SIM-Zyklus erneut geprüft. Rollen: CEO und OPS können Quellen einreichen; nur CEO kann Dokumentation sichten oder zurückweisen.</p>
  </>}
  {!data&&!error&&<p className={styles.empty}>{loading?'Nachweisaufgaben werden geladen …':'Noch keine Daten.'}</p>}
 </section>;
}
