'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {BookOpen,CalendarDays,GraduationCap,RefreshCw,ShieldAlert,Users,ClipboardCheck} from 'lucide-react';

type Course={id:string;code:string;title:string;category:string;aircraft_type:string|null;duration_hours:number;validity_months:number|null;standard_cost_eur:number|null;approved_required:boolean;active:boolean};
type Center={id:string;name:string;location_icao:string|null;provider_type:string;is_approved_provider:boolean;status:string};
type Session={id:string;course_id:string;course_code:string;course_title:string;center_id:string;center_name:string;provider_verified:boolean;starts_at:string;ends_at:string;capacity:number;status:string;cost_eur:number|null;requested_count:number;confirmed_count:number};
type Enrollment={id:string;session_id:string;person_id:string;full_name:string;status:string;course_title:string;start_at:string;approved_by:string|null;completed_at:string|null};
type Person={id:string;name:string;department:string;role:string;pilot_role:string|null};
type Certificate={id:string;person_name:string;course_code:string;issued_on:string;expires_on:string|null;verified:boolean};
type PilotQualification={id:string;person_name:string;aircraft_type:string;role:string;valid_from:string;valid_until:string;verified:boolean};
type TrainingData={courses:Course[];centers:Center[];sessions:Session[];enrollments:Enrollment[];people:Person[];certificates:Certificate[];pilot_qualifications:PilotQualification[];approved_training_authority:false;operational_pilot_authorization:false};

function supabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase-Zugang nicht konfiguriert');
 return createBrowserClient(url,key);
}
function dateText(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}
function localTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function money(value:number|null){return value===null?'Noch kein Planbetrag':Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
const categories:Record<string,string>={type_rating:'Mustertraining',recurrent:'Wiederkehrend',opc:'Operator Proficiency Check',lpc:'Licence Proficiency Check',crm:'Crew Resource Management',safety:'Safety',dispatch:'Dispatch',management:'Management',other:'Sonstiges'};

export default function TrainingWorkspace(){
 const [data,setData]=useState<TrainingData|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [enrolling,setEnrolling]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [courseId,setCourseId]=useState('');
 const [centerId,setCenterId]=useState('');
 const [start,setStart]=useState('');
 const [end,setEnd]=useState('');
 const [capacity,setCapacity]=useState('8');
 const [cost,setCost]=useState('');
 const [sessionId,setSessionId]=useState('');
 const [personId,setPersonId]=useState('');
 const [sessionFilter,setSessionFilter]=useState('all');
 const [showEvidence,setShowEvidence]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data:response,error:rpcError}=await supabase().rpc('aervelys_training_overview');
   if(rpcError||!response||!Array.isArray(response.courses)||!Array.isArray(response.people)||!Array.isArray(response.sessions))throw Error('Training overview unavailable');
   const v=response as TrainingData;
   setData(v);
   setCourseId(prev=>v.courses.some(x=>x.id===prev&&x.active)?prev:(v.courses.find(x=>x.active)?.id||''));
   setCenterId(prev=>v.centers.some(x=>x.id===prev&&x.status==='available')?prev:(v.centers.find(x=>x.status==='available')?.id||''));
   setSessionId(prev=>v.sessions.some(x=>x.id===prev&&x.status==='planned')?prev:(v.sessions.find(x=>x.status==='planned')?.id||''));
   setPersonId(prev=>v.people.some(x=>x.id===prev)?prev:(v.people[0]?.id||''));
  }catch{
   setData(null);
   setError('Training-Daten nicht abrufbar. Bitte CEO-/Training-Rolle, Anmeldung und Supabase prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const chosenCourse=data?.courses.find(x=>x.id===courseId);
 const chosenCenter=data?.centers.find(x=>x.id===centerId);
 const planned=data?.sessions.filter(s=>s.status==='planned'&&new Date(s.starts_at)>new Date())||[];
 const visibleSessions=useMemo(()=>data?.sessions.filter(s=>sessionFilter==='all'||s.status===sessionFilter)||[],[data,sessionFilter]);

 async function plan(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setNotice('');
  const a=new Date(start),b=new Date(end);
  const cap=Number(capacity);
  const amount=cost.trim()?Number(cost):null;
  if(!courseId||!centerId||!start||!end||!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||a<=new Date()||b<=a){
   setError('Bitte einen gültigen zukünftigen Termin mit Ende nach Beginn angeben.');return;
  }
  if(!Number.isInteger(cap)||cap<1||cap>30){setError('Kapazität muss zwischen 1 und 30 liegen.');return;}
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>1000000||Math.round(amount*100)!==amount*100)){
   setError('Bitte einen gültigen Planbetrag angeben.');return;
  }
  setSaving(true);
  try{
   const {data:result,error:rpcError}=await supabase().rpc('aervelys_training_session_plan',{
    p_course_id:courseId,p_center_id:centerId,p_starts_at:a.toISOString(),
    p_ends_at:b.toISOString(),p_capacity:cap,p_cost_eur:amount
   });
   if(rpcError||!result?.session_id)throw Error('Could not plan session');
   await load();
   setSessionId(String(result.session_id));
   setStart('');setEnd('');setCost('');
   setNotice('Trainingstermin gespeichert: geplant, nicht bestätigt. Kein Ausbildungsnachweis erzeugt.');
  }catch{setError('Termin konnte nicht angelegt werden. Bitte Daten, Berechtigung und Anbieterstatus prüfen.');}
  finally{setSaving(false);}
 }
 async function enroll(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setNotice('');
  if(!sessionId||!personId){setError('Bitte Termin und Mitarbeiter auswählen.');return;}
  setEnrolling(true);
  try{
   const {data:result,error:rpcError}=await supabase().rpc('aervelys_training_enrollment_request',{
    p_session_id:sessionId,p_person_id:personId
   });
   if(rpcError||!result?.enrollment_id)throw Error('Enrollment failed');
   await load();
   setNotice('Teilnehmeranfrage gespeichert. Es wurde keine Dienstzeit gebucht und keine Qualifikation vergeben.');
  }catch{setError('Anmeldung konnte nicht erfasst werden. Eventuell bereits angefragt oder Kapazitätsgrenze erreicht.');}
  finally{setEnrolling(false);}
 }

 return <section className="panel training-workspace">
  <div className="panelhead training-heading">
   <div><div className="eyebrow">AERVELYS TRAINING ACADEMY / EDAZ</div><h2>Training Center</h2>
    <p className="lead">Kurse, geplante Termine, Teilnahmeanfragen und vorhandene Nachweise – mit geschütztem Zugriff.</p>
   </div>
   <button className="ops-refresh" type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="training-warning"><ShieldAlert size={18}/><span>Die interne Trainingskoordination ist noch kein zugelassener Ausbildungsanbieter. Geplante Kurse und angefragte Teilnehmer erzeugen <strong>keine Musterberechtigungen, Dienstblöcke oder Flugfreigaben</strong>.</span></div>
  {error&&<p role="alert" className="charter-error training-feedback">{error}</p>}
  {notice&&<p role="status" className="charter-success training-feedback">{notice}</p>}
  {loading&&<div className="ops-loading">Trainingdaten werden geladen …</div>}
  {data&&<>
   <div className="training-metrics">
    <div><BookOpen size={19}/><strong>{data.courses.filter(x=>x.active).length}</strong><span>Aktive Kurse</span></div>
    <div><CalendarDays size={19}/><strong>{data.sessions.filter(x=>x.status==='planned').length}</strong><span>Geplante Termine</span></div>
    <div><Users size={19}/><strong>{data.enrollments.filter(x=>x.status==='requested').length}</strong><span>Teilnahmeanfragen</span></div>
    <div><ClipboardCheck size={19}/><strong>{data.pilot_qualifications.filter(x=>x.verified).length}</strong><span>Verifizierte Pilotenqualifikationen</span></div>
   </div>
   <div className="training-course-section">
    <div className="eyebrow">COURSE CATALOG</div><h3>Kursangebot ({data.courses.length})</h3>
    <div className="training-course-grid">{data.courses.map(course=><article key={course.id} className="training-course">
     <div className="training-course-top"><strong>{course.code}</strong><span>{course.active?'Aktiv':'Inaktiv'}</span></div>
     <h4>{course.title}</h4><p>{categories[course.category]||course.category}{course.aircraft_type?' · '+course.aircraft_type:''}</p>
     <small>Dauer: {Number(course.duration_hours).toLocaleString('de-DE')} Stunden · {course.validity_months?course.validity_months+' Monate Gültigkeit':'Gültigkeit offen'}</small>
     {course.approved_required&&<div className="training-approval-warning">Zugelassener Ausbildungsanbieter erforderlich</div>}
    </article>)}</div>
   </div>
   <div className="training-layout">
    <div className="training-list-col">
     <div className="training-block">
      <div className="training-block-top"><div><div className="eyebrow">TRAINING SCHEDULE</div><h3>Trainingstermine ({data.sessions.length})</h3></div>
       <select aria-label="Trainingstermine filtern" value={sessionFilter} onChange={e=>setSessionFilter(e.target.value)}><option value="all">Alle Termine</option><option value="planned">Geplant</option><option value="confirmed">Bestätigt</option><option value="in_progress">In Durchführung</option><option value="completed">Abgeschlossen</option><option value="cancelled">Abgesagt</option></select></div>
      {visibleSessions.length===0?<p className="training-empty">Keine Trainingstermine vorhanden. Rechts kannst du einen Planungstermin erstellen.</p>:
       visibleSessions.map(s=><article className="training-session" key={s.id}>
        <div><strong>{s.course_title}</strong><span className="training-pill">{s.status}</span></div>
        <p>{dateText(s.starts_at)} – {dateText(s.ends_at)}</p>
        <small>{s.center_name} · {s.confirmed_count}/{s.capacity} bestätigt · {s.requested_count} Anfragen · {money(s.cost_eur)}</small>
        {!s.provider_verified&&<small className="training-unverified">Anbieter nicht verifiziert</small>}
       </article>)}
     </div>
     <div className="training-block"><div className="eyebrow">ATTENDEE REQUESTS</div><h3>Teilnahmen ({data.enrollments.length})</h3>
      {data.enrollments.length===0?<p className="training-empty">Bisher keine Teilnehmer erfasst.</p>:
       data.enrollments.map(e=><article className="training-line" key={e.id}><strong>{e.full_name} · {e.course_title}</strong><p>{dateText(e.start_at)} · Status: {e.status}</p><small>{e.status==='requested'?'Noch nicht bestätigt; keine Dienstzeit zugeordnet':'Status aus Trainingsdatenbank'}</small></article>)}
     </div>
     <div className="training-block">
      <div className="training-block-top"><div><div className="eyebrow">QUALIFICATION EVIDENCE</div><h3>Zertifikate & Berechtigungen</h3></div>
       <button type="button" className="ops-refresh" onClick={()=>setShowEvidence(!showEvidence)}>{showEvidence?'Ausblenden':'Details'}</button>
      </div>
      <p className="training-hint">{data.certificates.length} Zertifikate · {data.pilot_qualifications.length} Pilotenberechtigungen. Nur vorhandene Datensätze werden angezeigt.</p>
      {showEvidence&&<>
       {data.certificates.length===0&&data.pilot_qualifications.length===0?<p className="training-empty">Keine Qualifikationsnachweise vorhanden. Alle erforderlichen Verifizierungen bleiben offen.</p>:null}
       {data.certificates.map(c=><article className="training-line" key={c.id}><strong>{c.person_name} · {c.course_code}</strong><p>Ausgestellt: {c.issued_on} · {c.verified?'Verifiziert':'Nicht verifiziert'}</p></article>)}
       {data.pilot_qualifications.map(q=><article className="training-line" key={q.id}><strong>{q.person_name} · {q.aircraft_type} ({q.role})</strong><p>Gültig bis {q.valid_until} · {q.verified?'Verifiziert':'Nicht verifiziert'}</p></article>)}
      </>}
     </div>
    </div>
    <div className="training-forms">
     <div className="training-block">
      <div className="eyebrow">PLAN TRAINING SESSION</div><h3>Neuen Termin planen</h3>
      <p className="training-hint">Legt einen organisatorischen Termin mit Status „geplant“ an. Keine verbindliche Trainingsbestätigung.</p>
      <form className="training-form" onSubmit={plan}>
       <label>Kurs<select required value={courseId} onChange={e=>setCourseId(e.target.value)}>{data.courses.filter(x=>x.active).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label>
       {chosenCourse?.approved_required&&<p className="training-unverified">Für diesen Kurs sind zusätzlich verifizierte externe Ausbildungsnachweise nötig.</p>}
       <label>Koordinationszentrum<select required value={centerId} onChange={e=>setCenterId(e.target.value)}>{data.centers.filter(x=>x.status==='available').map(c=><option key={c.id} value={c.id}>{c.name} ({c.location_icao||'—'})</option>)}</select></label>
       {chosenCenter&&!chosenCenter.is_approved_provider&&<p className="training-unverified">Dieses Zentrum ist kein verifizierter Ausbildungsanbieter.</p>}
       <div className="training-form-row"><label>Beginn (lokale Zeit)<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Ende (lokale Zeit)<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
       <div className="training-form-row"><label>Plätze<input required type="number" min={1} max={30} value={capacity} onChange={e=>setCapacity(e.target.value)}/></label><label>Planungskosten (€)<input type="number" min={0} max={1000000} step="0.01" value={cost} placeholder="Optional" onChange={e=>setCost(e.target.value)}/></label></div>
       <button type="submit" className="charter-submit" disabled={saving||!courseId||!centerId}><CalendarDays size={16}/>{saving?'Speichere …':'Termin planen'}</button>
      </form>
     </div>
     <div className="training-block">
      <div className="eyebrow">ENROLLMENT INTAKE</div><h3>Teilnahme anfragen</h3>
      <p className="training-hint">Ein Teilnehmerwunsch für einen geplanten Termin. Keine automatische Schulung, Crewblockierung oder Lizenz.</p>
      <form className="training-form" onSubmit={enroll}>
       <label>Geplanter Termin<select required value={sessionId} onChange={e=>setSessionId(e.target.value)}>{planned.length===0?<option value="">Noch kein geplanter Termin</option>:planned.map(s=><option key={s.id} value={s.id}>{s.course_code} · {dateText(s.starts_at)}</option>)}</select></label>
       <label>Mitarbeiter<select required value={personId} onChange={e=>setPersonId(e.target.value)}>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}{p.pilot_role?' · '+p.pilot_role:''}</option>)}</select></label>
       <button type="submit" className="charter-submit" disabled={enrolling||!sessionId||!personId}><Users size={16}/>{enrolling?'Speichere …':'Teilnahmeanfrage speichern'}</button>
      </form>
     </div>
     <div className="training-block">
      <div className="eyebrow">TRAINING PROVIDERS</div><h3>Standorte ({data.centers.length})</h3>
      {data.centers.map(c=><div key={c.id} className="training-line"><strong>{c.name}</strong><p>{c.location_icao||'Standort nicht erfasst'} · {c.provider_type==='internal'?'Intern':'Extern'}</p><small>{c.is_approved_provider?'Anbieter verifiziert':'Anbieterzulassung nicht bestätigt'}</small></div>)}
      <p className="training-hint">Termine und Anmeldungen ersetzen niemals externe Schulungsbestätigungen oder behördliche Musterberechtigungen.</p>
     </div>
    </div>
   </div>
   <div className="ops-footer"><GraduationCap size={15}/> Trainingsvorplanung · Freigabe und Ausstellung von Pilotenberechtigungen in diesem Modul nicht möglich.</div>
  </>}
 </section>;
}
