'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {AlertTriangle,ClipboardList,Clock3,FileText,History,MapPin,RefreshCw,Save,ShieldAlert,Tool,Workflow} from 'lucide-react';

type MaintenanceAircraft={
 id:string;registration:string;type:string;location:string;
 operational_status:string;ownership_status:string;
 hours_verified:boolean;release_verified:boolean;airframe_hours:number|null;
 decision:{status:string;reason?:string;return_base?:string};
 open_orders:number;requirements:number;
};
type Requirement={id:string;registration:string;title:string;due_at:string|null;due_airframe_hours:number|null;status:string;source_reference:string|null;maintenance_base_icao:string};
type WorkOrder={id:string;order_code:string;registration:string;title:string;status:string;service_model:string;vendor:string|null;planned_start:string|null;planned_end:string|null;estimated_cost_eur:number|null;release_reference:string|null;released_at:string|null};
type Vendor={name:string;base_icao:string;status:string;verified_for_fleet:boolean;approval_reference:string|null};
type Intake={id:string;aircraft_id:string;registration:string;title:string;description:string;priority:'normal'|'high'|'urgent';status:'reported'|'triage'|'evidence_requested'|'archived';source_reference:string|null;updated_at:string;created_at:string};
type EventRow={action:string;old_status:string|null;new_status:string|null;note:string|null;created_at:string};
type Overview={aircraft:MaintenanceAircraft[];requirements:Requirement[];work_orders:WorkOrder[];vendors:Vendor[];intake_reports:Intake[];operational_approval:false};

const intakeText:Record<Intake['status'],string>={reported:'Gemeldet',triage:'In Sichtung',evidence_requested:'Nachweis angefordert',archived:'Administrativ archiviert'};
const priorityText={normal:'Normal',high:'Hoch',urgent:'Dringend'};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase-Verbindung nicht konfiguriert');
 return createBrowserClient(url,key);
}
function formatDate(value:string|null){if(!value)return 'Nicht hinterlegt';const d=new Date(value);return Number.isNaN(d.getTime())?'Ungültig':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}
function human(value:string|null|undefined){return (value||'Nicht hinterlegt').replaceAll('_',' ');}
const emptyState={title:'',description:'',source_reference:'',priority:'normal' as Intake['priority']};

export default function MaintenanceWorkspace(){
 const [snapshot,setSnapshot]=useState<Overview|null>(null);
 const [aircraftId,setAircraftId]=useState('');
 const [form,setForm]=useState(emptyState);
 const [loading,setLoading]=useState(true);
 const [creating,setCreating]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [reportId,setReportId]=useState('');
 const [nextStatus,setNextStatus]=useState<Intake['status']>('triage');
 const [updateNote,setUpdateNote]=useState('');
 const [events,setEvents]=useState<EventRow[]>([]);
 const [historyLoading,setHistoryLoading]=useState(false);
 const [showArchived,setShowArchived]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_maintenance_overview');
   if(rpcError||!data||!Array.isArray(data.aircraft)||!Array.isArray(data.intake_reports))throw new Error('invalid overview');
   const current=data as Overview;
   setSnapshot(current);
   setAircraftId(prev=>current.aircraft.some(a=>a.id===prev)?prev:(current.aircraft[0]?.id||''));
  }catch{
   setSnapshot(null);
   setError('Wartungsdaten nicht erreichbar. Bitte CEO-/OPS-Rechte, Anmeldung und Supabase prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const aircraft=snapshot?.aircraft.find(x=>x.id===aircraftId);
 const selectedReport=snapshot?.intake_reports.find(x=>x.id===reportId);
 const reports=useMemo(()=>(snapshot?.intake_reports||[]).filter(r=>
  (aircraftId?r.aircraft_id===aircraftId:true)&&(showArchived||r.status!=='archived')
 ),[snapshot,aircraftId,showArchived]);

 const readHistory=useCallback(async(id:string)=>{
  if(!id){setEvents([]);return;}
  setHistoryLoading(true);
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_maintenance_issue_history',{p_report_id:id});
   if(rpcError||!Array.isArray(data))throw Error('history not available');
   setEvents(data as EventRow[]);
  }catch{setEvents([]);}
  finally{setHistoryLoading(false);}
 },[]);
 useEffect(()=>{void readHistory(reportId);},[readHistory,reportId]);
 useEffect(()=>{
  if(selectedReport){
   setNextStatus(selectedReport.status==='reported'?'triage':
    selectedReport.status==='triage'?'evidence_requested':
    selectedReport.status==='evidence_requested'?'archived':'archived');
  }
  setUpdateNote('');
 },[reportId,selectedReport?.status]);

 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setSuccess('');
  if(!aircraftId||form.title.trim().length<5||form.description.trim().length<8){
   setError('Bitte Flugzeug, aussagekräftigen Titel und Beschreibung angeben.');return;
  }
  setCreating(true);
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_maintenance_issue_create',{
    p_aircraft_id:aircraftId,p_title:form.title.trim(),
    p_description:form.description.trim(),p_priority:form.priority,
    p_source_reference:form.source_reference.trim()||null
   });
   if(rpcError||!data?.id)throw Error('save failed');
   setForm(emptyState);
   await load();
   setReportId(String(data.id));
   setSuccess('Meldung angelegt. Es wurde kein Wartungsauftrag und keine technische Freigabe erteilt.');
  }catch{setError('Meldung konnte nicht gespeichert werden. Bitte Eingaben und Zugriffsrechte prüfen.');}
  finally{setCreating(false);}
 }

 async function updateReport(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!selectedReport||selectedReport.status==='archived')return;
  if(updateNote.trim().length<8){setError('Für Statusänderungen ist eine Begründung mit mindestens 8 Zeichen nötig.');return;}
  setSaving(true);setError('');setSuccess('');
  try{
   const {error:rpcError}=await client().rpc('aervelys_maintenance_issue_update',{
    p_report_id:selectedReport.id,p_status:nextStatus,p_note:updateNote.trim()
   });
   if(rpcError)throw Error('status update failed');
   await load();
   await readHistory(selectedReport.id);
   setUpdateNote('');
   setSuccess('Bearbeitungsstatus gespeichert. Wartungs- und Flugfreigabe bleiben unverändert.');
  }catch{setError('Statusänderung nicht möglich. Bitte Statuswechsel und Begründung prüfen.');}
  finally{setSaving(false);}
 }

 return <section className="panel maintenance-workspace">
  <div className="panelhead maintenance-heading"><div><div className="eyebrow">MAINTENANCE CONTROL / EDAZ</div><h2>Wartungsmanagement</h2><p className="lead">Live-Wartungsstand, Aufträge und interne Mängelmeldungen für die AERVELYS-Flotte.</p></div>
   <button className="ops-refresh" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="maintenance-warning"><ShieldAlert size={19}/><span>Eine Mängelmeldung oder Nachweisanforderung ist <strong>keine technische Freigabe</strong>. Der Wartungsstatus stammt ausschließlich aus den geschützten Bestands- und Prüfdaten.</span></div>
  {error&&<p role="alert" className="charter-error maintenance-feedback">{error}</p>}
  {success&&<p role="status" className="charter-success maintenance-feedback">{success}</p>}
  {loading&&<div className="ops-loading">Wartungsunterlagen werden geladen …</div>}
  {snapshot&&<>
   <div className="maintenance-metrics">
    <div><strong>{snapshot.aircraft.length}</strong><span>Flugzeuge</span></div>
    <div><strong>{snapshot.aircraft.filter(a=>!a.release_verified).length}</strong><span>Technische Freigabe fehlt</span></div>
    <div><strong>{snapshot.work_orders.filter(w=>!['released','cancelled'].includes(w.status)).length}</strong><span>Offene Werkstattaufträge</span></div>
    <div><strong>{snapshot.intake_reports.filter(r=>r.status!=='archived').length}</strong><span>Offene Meldungen</span></div>
   </div>
   <div className="maintenance-selector"><label>Flugzeug wählen<select value={aircraftId} onChange={e=>{setAircraftId(e.target.value);setReportId('');}}>{snapshot.aircraft.map(a=><option key={a.id} value={a.id}>{a.registration} · {a.type}</option>)}</select></label></div>
   {aircraft&&<div className="maintenance-aircraft">
    <div className="maintenance-aircraft-title"><div><div className="eyebrow">TECHNICAL READINESS</div><h3>{aircraft.registration}</h3><p>{aircraft.type}</p></div><span className="maintenance-blocked"><ShieldAlert size={17}/> Keine technische Einsatzfreigabe</span></div>
    <div className="maintenance-facts">
     <div><MapPin size={16}/><span>Standort</span><strong>{aircraft.location}</strong></div>
     <div><Clock3 size={16}/><span>Betriebsstunden verifiziert</span><strong>{aircraft.hours_verified?'Ja':'Nein'}</strong></div>
     <div><ShieldAlert size={16}/><span>Wartungsfreigabe verifiziert</span><strong>{aircraft.release_verified?'Ja':'Nein'}</strong></div>
     <div><Tool size={16}/><span>Wartungsprüfung</span><strong>{human(aircraft.decision?.reason||aircraft.decision?.status)}</strong></div>
    </div>
    <p className="maintenance-caveat">Fehlende Wartungseinträge bedeuten nicht, dass keine Wartung nötig ist. Ohne verifizierte Unterlagen bleibt das Flugzeug gesperrt.</p>
   </div>}
   <div className="maintenance-layout">
    <div className="maintenance-main">
     <div className="maintenance-section"><div className="eyebrow">TECHNICAL WORK PACKAGES</div><h3>Wartungsanforderungen ({snapshot.requirements.filter(r=>r.registration===aircraft?.registration).length})</h3>
      {snapshot.requirements.filter(r=>r.registration===aircraft?.registration).length===0?<p className="maintenance-empty">Noch keine Anforderungen erfasst. Dies ist **kein** Nachweis technischer Einsatzbereitschaft.</p>:
      snapshot.requirements.filter(r=>r.registration===aircraft?.registration).map(r=><article className="maintenance-line" key={r.id}><strong>{r.title}</strong><p>{r.status} · Fällig: {formatDate(r.due_at)} · {r.due_airframe_hours===null?'Keine Stundenfälligkeit':r.due_airframe_hours+' Stunden'}</p><small>Nachweis: {r.source_reference||'nicht hinterlegt'}</small></article>)}
     </div>
     <div className="maintenance-section"><div className="eyebrow">WORK ORDERS</div><h3>Werkstattaufträge ({snapshot.work_orders.filter(w=>w.registration===aircraft?.registration).length})</h3>
      {snapshot.work_orders.filter(w=>w.registration===aircraft?.registration).length===0?<p className="maintenance-empty">Keine Werkstattaufträge erfasst. Die technische Freigabe bleibt davon unberührt.</p>:
      snapshot.work_orders.filter(w=>w.registration===aircraft?.registration).map(w=><article className="maintenance-line" key={w.id}><strong>{w.order_code} · {w.title}</strong><p>{human(w.status)} · {human(w.service_model)} {w.vendor?'· '+w.vendor:''}</p><small>Geplant: {formatDate(w.planned_start)} · Freigabenachweis: {w.release_reference||'fehlt'}</small></article>)}
     </div>
     <div className="maintenance-section"><div className="eyebrow">WORKSHOP PARTNERS</div><h3>Werkstattpartner ({snapshot.vendors.length})</h3>
      {snapshot.vendors.length===0?<p className="maintenance-empty">Noch keine Werkstattpartner erfasst.</p>:
      snapshot.vendors.map(v=><article className="maintenance-line" key={v.name}><strong>{v.name}</strong><p>{v.base_icao} · {human(v.status)} · Für die Flotte verifiziert: {v.verified_for_fleet?'Ja':'Nein'}</p><small>Referenz: {v.approval_reference||'nicht hinterlegt'}</small></article>)}
     </div>
    </div>
    <div className="maintenance-intake">
     <div className="maintenance-section"><div className="eyebrow">ADMINISTRATIVE INTAKE</div><h3>Neue Mängel-/Nachweismeldung</h3><p className="maintenance-help">Erfasst eine interne Meldung für {aircraft?.registration||'ein Flugzeug'}, ohne einen technischen Auftrag auszulösen.</p>
      <form className="maintenance-form" onSubmit={create}>
       <label>Titel<input required minLength={5} maxLength={160} value={form.title} placeholder="z. B. Wartungsakte unvollständig" onChange={e=>setForm({...form,title:e.target.value})}/></label>
       <label>Beschreibung<textarea required minLength={8} maxLength={3000} rows={4} value={form.description} placeholder="Welche Unterlagen oder Untersuchungen fehlen?" onChange={e=>setForm({...form,description:e.target.value})}/></label>
       <label>Priorität<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as Intake['priority']})}><option value="normal">Normal</option><option value="high">Hoch</option><option value="urgent">Dringend</option></select></label>
       <label>Beleg-/Dokumentreferenz (optional)<input maxLength={300} value={form.source_reference} placeholder="Werkstattbericht, Aktenzeichen …" onChange={e=>setForm({...form,source_reference:e.target.value})}/></label>
       <button type="submit" className="charter-submit" disabled={creating||!aircraftId}><Save size={16}/>{creating?'Speichert …':'Meldung erfassen'}</button>
      </form>
     </div>
     <div className="maintenance-section"><div className="maintenance-reports-head"><div><div className="eyebrow">ISSUE TRACKING</div><h3>Meldungen ({reports.length})</h3></div><label><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Archivierte anzeigen</label></div>
      {reports.length===0?<p className="maintenance-empty">Für dieses Flugzeug liegen noch keine internen Meldungen vor.</p>:
       reports.map(r=><button type="button" key={r.id} className={'maintenance-report-button '+(r.id===reportId?'selected':'')} onClick={()=>setReportId(r.id)}>
         <span><AlertTriangle size={15}/><strong>{r.title}</strong></span><small>{priorityText[r.priority]} · {intakeText[r.status]} · {formatDate(r.updated_at)}</small>
       </button>)}
     </div>
     {selectedReport&&<div className="maintenance-section maintenance-detail"><div className="eyebrow">REPORT DETAILS</div><h3>{selectedReport.title}</h3><p>{selectedReport.description}</p><small>Referenz: {selectedReport.source_reference||'nicht hinterlegt'}</small>
       {selectedReport.status!=='archived'?<form className="maintenance-form" onSubmit={updateReport}>
        <label>Bearbeitungsstatus<select value={nextStatus} onChange={e=>setNextStatus(e.target.value as Intake['status'])}>
         <option value="reported">Gemeldet</option><option value="triage">In Sichtung</option><option value="evidence_requested">Nachweis angefordert</option><option value="archived">Administrativ archivieren</option>
        </select></label>
        <label>Begründung (Pflicht)<textarea minLength={8} maxLength={1000} rows={3} required value={updateNote} onChange={e=>setUpdateNote(e.target.value)} placeholder="Wer kümmert sich darum? Welche Belege fehlen?"/></label>
        <button type="submit" className="ops-refresh" disabled={saving||nextStatus===selectedReport.status}><Workflow size={16}/>{saving?'Speichert …':'Status mit Verlauf speichern'}</button>
       </form>:<p className="maintenance-empty">Administrativ archiviert. Eine Archivierung bestätigt keine Reparatur.</p>}
       <div className="maintenance-history"><h4><History size={16}/> Bearbeitungsverlauf</h4>
        {historyLoading?<p>Verlauf wird geladen …</p>:events.length===0?<p>Keine Historie abrufbar.</p>:events.map((event,i)=><div key={i}><strong>{human(event.action)} · {human(event.new_status)}</strong><small>{formatDate(event.created_at)}</small><p>{event.note||'Keine Anmerkung'}</p></div>)}
       </div>
     </div>}
    </div>
   </div>
   <div className="ops-footer"><FileText size={15}/> Technische Freigaben werden nicht in diesem Modul erteilt. Datenstand aus geschützter Supabase-Abfrage.</div>
  </>}
 </section>;
}
