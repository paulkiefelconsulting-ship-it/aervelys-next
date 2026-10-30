'use client';

import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Bot,Plane,Users,BookOpen,Inbox,RefreshCw,Play,Pause,CheckCircle2,AlertTriangle,FileCheck2,Send} from 'lucide-react';
import VirtualRotationsPanel from './VirtualRotationsPanel';
import AgentDecisionGates from './AgentDecisionGates';
import AgentCaseCoordinator from './AgentCaseCoordinator';
import VirtualRotationTiming from './VirtualRotationTiming';

type Plan={request_id:string;request_code:string;registration:string|null;aircraft_type:string|null;pic:string|null;sic:string|null;
 status:string;note:string;updated_at:string;evidence:Record<string,unknown>};
type Training={id:string;person:string;role:string|null;course:string;target_aircraft_type:string|null;total_hours:number|null;required_internal_hours:number;
 hours_verified:boolean;status:string;message:string;created_at:string};
type CeoMessage={id:number;sender:string;subject:string;body:string;category:string;status:'unread'|'read';created_at:string};
type Log={id:number;action:string;result:string;detail:string;created_at:string};
type PositionDraft={request_id:string;request_code:string;registration:string;origin:string;destination:string;previous_case:string|null;window_from:string;window_until:string;status:string;explanation:string};
type Overview={enabled:boolean;max_sim_quotes_per_day:number;sim_quotes_today:number;ops_review_required:number;ops_alerts_unread:number;positioning_drafts:PositionDraft[];plans:Plan[];training:Training[];
 ceo_messages:CeoMessage[];events:Log[];model_connected:false;verified_crew_assignments:false};
type Pilot={person_id:string;person:string;pilot_role:'PIC'|'SIC';total_hours:number|null;pic_hours:number|null;source_reference:string|null;
 verification_status:'missing'|'reported'|'verified'};
function client(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('Supabase nicht konfiguriert');
 return createBrowserClient(u,k);
}
const opsReasons:Record<string,string>={aircraft_candidate_missing:'Kein Flugzeug gefunden',aircraft_positioning_unverified:'Flugzeug-Rückpositionierung fehlt',pic_positioning_unverified:'PIC-Positionierung fehlt',sic_positioning_unverified:'SIC-Positionierung fehlt',aircraft_schedule_overlap:'Flugzeug-Doppelplanung im 6-h-Fenster',crew_provisional_rest_or_duty_gap:'Crew innerhalb des internen 18-h-Prüffensters mehrfach geplant',crew_candidate_missing:'PIC oder SIC fehlt'};
function date(s:string|null){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}

export default function VirtualAirlineAgents(){
 const [data,setData]=useState<Overview|null>(null);
 const [pilots,setPilots]=useState<Pilot[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [pilotId,setPilotId]=useState('');
 const [total,setTotal]=useState('');
 const [picHours,setPicHours]=useState('');
 const [reference,setReference]=useState('');
 const [reviewNote,setReviewNote]=useState('');
 const [showHours,setShowHours]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const db=client();
   const [a,b]=await Promise.all([db.rpc('aervelys_virtual_agents_overview'),db.rpc('aervelys_virtual_pilot_hours_list')]);
   if(a.error||b.error||!a.data||!Array.isArray(a.data.ceo_messages)||!Array.isArray(b.data))throw Error('Agent data unavailable');
   setData(a.data as Overview);
   setPilots(b.data as Pilot[]);
   setPilotId(old=>old&&(b.data as Pilot[]).some(p=>p.person_id===old)?old:(b.data as Pilot[])[0]?.person_id||'');
  }catch{
   setData(null);setError('Autonome Mitarbeiterdaten nicht erreichbar. Bitte Anmeldung und CEO-/OPS-Rolle prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const pilot=pilots.find(p=>p.person_id===pilotId);
 const unread=data?.ceo_messages.filter(m=>m.status==='unread').length||0;

 async function invoke(rpc:string,args:Record<string,unknown>,message:string){
  setBusy(true);setError('');setNotice('');
  try{
   const {data:answer,error:e}=await client().rpc(rpc,args);
   if(e)throw e;
   await load();
   setNotice(message+(rpc==='aervelys_virtual_agents_run'?
    ' SIM-Antworten: '+String(answer?.sales?.count??0)+'. Neue Mitarbeiteranfragen: '+String(answer?.training?.count??0)+'.':''));
  }catch{
   setError('Aktion nicht möglich. Bitte CEO-Berechtigung, Nachweise und Eingaben prüfen.');
  }finally{setBusy(false);}
 }
 async function saveHours(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!pilotId)return;
  const n=Number(total),p=Number(picHours);
  if(!total||!picHours||!Number.isFinite(n)||!Number.isFinite(p)||p>n||n<0||p<0||reference.trim().length<10){
   setError('Gesamtstunden, PIC-Stunden und eine Quellenreferenz von mindestens 10 Zeichen sind erforderlich.');return;
  }
  await invoke('aervelys_virtual_pilot_hours_report',{
   p_person_id:pilotId,p_total_hours:n,p_pic_hours:p,p_reference:reference.trim()
  },'Flugstunden als ungeprüfter Bericht gespeichert; noch keine Type-Rating-Zulassung.');
 }
 return <section className="panel virtual-staff-center">
  <div className="panelhead virtual-staff-title"><div><div className="eyebrow">VIRTUAL AIRLINE DEPARTMENTS / SIMULATION</div>
   <h2>Autonome Mitarbeiter & Vertriebsagent</h2>
   <p className="lead">Fiktiver Vertrieb bearbeitet Kundenfälle, Flotten-/Crewplaner schlagen Besetzungen vor und Mitarbeiter schreiben Weiterbildungswünsche.</p></div>
   <button type="button" className="ops-refresh" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={15}/> Aktualisieren</button>
  </div>
  <div className="virtual-staff-safety"><AlertTriangle size={19}/><span><strong>Interne Simulationsagenten – kein Sprachmodell angeschlossen.</strong> Automatische Antworten und Zuordnungen folgen kontrollierten Regeln. Preise sind fiktive Rechenmodelle, Flugzeug-/Crewvorschläge sind nicht verifiziert. Keine echten Angebote, Reservierungen, Buchungen, Typberechtigungen oder Zahlungen.</span></div>
  {error&&<p className="charter-error virtual-staff-feedback" role="alert">{error}</p>}
  {notice&&<p className="charter-success virtual-staff-feedback" role="status">{notice}</p>}
  {loading&&<div className="ops-loading">Virtuelle Mitarbeiter werden geladen …</div>}
  {data&&<>
   <div className="virtual-staff-metrics">
    <div><Bot size={17}/><strong>{data.enabled?'Aktiv':'Pausiert'}</strong><span>Virtueller Agentenbetrieb</span></div>
    <div><Plane size={17}/><strong>{data.plans.length}</strong><span>SIM-Planungen · {data.ops_review_required||0} OPS-Konflikte</span></div>
    <div><Inbox size={17}/><strong>{unread}</strong><span>Ungelesene CEO-Nachrichten</span></div>
    <div><BookOpen size={17}/><strong>{data.training.length}</strong><span>Weiterbildungswünsche</span></div>
   </div>
   <div className="virtual-staff-controls">
    <div><strong>Vertrieb & Personal automatisch bearbeiten</strong><p>Die stündliche Simulation beantwortet fällige fiktive Charteranfragen, erstellt Besetzungsvorschläge, kontrolliert grobe Einsatzkonflikte und erzeugt Mitarbeiteranfragen. Maximal {data.max_sim_quotes_per_day} SIM-Preisvarianten in 24 Stunden.</p>
     <small>Heute erzeugte SIM-Preise: {data.sim_quotes_today}. Neue Preisvarianten brauchen später erst eine Kundenreaktion.</small>
     <small>OPS-Konfliktmeldungen: {data.ops_alerts_unread||0} ungelesen. Die Agenten prüfen Flugzeug- und Crew-Rückpositionierung als vorläufige Planung.</small></div>
    <div><button className="charter-submit" type="button" disabled={busy} onClick={()=>void invoke('aervelys_virtual_agents_run',{p_quote_limit:2,p_training_limit:2},'Agentenrunde ausgeführt.')}>
      <Play size={15}/> Agentenrunde jetzt starten</button>
     <button className="ops-refresh" type="button" disabled={busy} onClick={()=>void invoke('aervelys_virtual_ops_recheck',{},'Alle aktuellen SIM-Planungen auf Positionierungs- und Zeitkonflikte geprüft.')}>
       <AlertTriangle size={15}/> Einsatzkonflikte prüfen</button>
     <button className="ops-refresh" type="button" disabled={busy} onClick={()=>void invoke('aervelys_virtual_agents_toggle',{p_enabled:!data.enabled},!data.enabled?'Agentenautomatik aktiviert.':'Agentenautomatik pausiert.')}>
      {data.enabled?<Pause size={15}/>:<Play size={15}/>} {data.enabled?'Automatik pausieren':'Automatik aktivieren'}</button></div>
   </div>
   <div className="virtual-staff-cols">
    <div className="virtual-staff-block"><div className="eyebrow">CEO & OPS INBOX</div><h3>Mitarbeiter & OPS kontaktieren dich ({unread} neu)</h3>
     {data.ceo_messages.length===0?<p className="virtual-staff-empty">Noch keine virtuellen Mitarbeiteranfragen. Die Mitarbeiter können diese selbst bei einem geplanten Lauf erzeugen.</p>:
      data.ceo_messages.map(m=><article className="virtual-staff-mail" key={m.id}>
       <div><strong>{m.sender}</strong><span>{m.status==='unread'?'Neu':'Gelesen'} · {date(m.created_at)}</span></div>
       <h4>{m.subject}</h4><p>{m.body}</p>
       {m.status==='unread'&&<button type="button" className="ops-refresh" disabled={busy} onClick={()=>void invoke('aervelys_virtual_ceo_message_read',{p_message_id:m.id},'Nachricht als gelesen markiert, Weiterbildung nicht freigegeben.')}>
         <CheckCircle2 size={14}/> Als gelesen markieren</button>}
      </article>)}
    </div>
    <div className="virtual-staff-block"><div className="eyebrow">AUTONOMOUS DISPATCH SCREENING</div><h3>Flugzeug & Crew – SIM-Vorschläge</h3>
     {data.plans.length===0?<p className="virtual-staff-empty">Noch keine Vorschläge. Der Agent wählt intern mögliche Flugzeuge und PIC/SIC aus dem vorhandenen Bestand; ohne verifizierte Eignung erfolgt keine Freigabe.</p>:
      data.plans.map(p=><article key={p.request_id} className="virtual-staff-plan">
       <strong>{p.request_code} · {p.registration||'Kein Flugzeug gefunden'}</strong>
       <p>{p.aircraft_type||'Flugzeugkandidat fehlt'}</p>
       <p><Users size={14}/> PIC: {p.pic||'Offen'} · SIC: {p.sic||'Offen'}</p>
       <div className={'virtual-staff-ops-state '+(p.status==='review_required'?'is-blocked':'')}>
        <strong>{p.status==='review_required'?'OPS-Konflikt – Prüfung erforderlich':p.status==='no_aircraft_candidate'?'Kein Flugzeugkandidat':'Chronologische SIM-Vorprüfung'}</strong>
        {Array.isArray(p.evidence?.ops_alert_codes)&&(p.evidence.ops_alert_codes as string[]).length>0&&
         <ul>{(p.evidence.ops_alert_codes as string[]).map(code=><li key={code}>{opsReasons[code]||code}</li>)}</ul>}
        {typeof p.evidence?.aircraft_position_before==='string'&&<small>Letzte modellierte Flugzeugposition: {p.evidence.aircraft_position_before}</small>}
        <small>Positionierung bestätigt: Nein · Interne Prüfzeitfenster 6 h Flugzeug / 18 h Crew, keine gesetzliche Flugzeitberechnung</small>
       </div>
       <small>Geprüfte Sitzplätze: {p.evidence.passenger_capacity_verified?'Ja':'Nein'} · PIC Type Rating: {p.evidence.pic_type_rating_verified?'Ja':'Nein'} · SIC Type Rating: {p.evidence.sic_type_rating_verified?'Ja':'Nein'}</small>
       <p className="virtual-staff-warning">Vorläufig – keine verbindliche Flugzeug- oder Crewzuordnung</p>
       {data.positioning_drafts.filter(d=>d.request_id===p.request_id&&d.status==='unverified').map(d=>
        <div className="virtual-positioning-draft" key={d.request_id}>
         <strong>Auto-Positionierungsentwurf: {d.origin} → {d.destination}</strong>
         <small>Frühestes Planungsfenster: {date(d.window_from)}</small>
         <small>Spätester gewünschter Rückkehrzeitpunkt: {date(d.window_until)}</small>
         {d.previous_case&&<small>Nach vorheriger Anfrage: {d.previous_case}</small>}
         <p>Fiktiver Planungsvorschlag – keine bestätigte Flugzeit, Crew, Genehmigung oder Bewegung</p>
        </div>)}
      </article>)}
    </div>
   </div>
   <AgentCaseCoordinator/>
   <AgentDecisionGates enabled={data.enabled} plans={data.plans} training={data.training} modelConnected={data.model_connected} verifiedCrewAssignments={data.verified_crew_assignments}/>
   <VirtualRotationsPanel/>
   <VirtualRotationTiming/>
   <div className="virtual-staff-block virtual-staff-training">
    <div className="eyebrow">EMPLOYEE DEVELOPMENT</div><h3>Weiterbildung & Musterberechtigungen</h3>
    <p>Interne SIM-Vorsortierung: PIC mindestens 1.000 bestätigte Gesamtstunden, SIC mindestens 250. Diese Werte sind reine AERVELYS-Prüfrichtwerte, keine behördlichen Type-Rating-Voraussetzungen. Allgemeine Fortbildungen haben hier kein Flugstundenminimum.</p>
    {data.training.length===0?<p className="virtual-staff-empty">Noch keine Mitarbeitermeldungen.</p>:
     <div className="virtual-staff-training-grid">{data.training.map(t=><div className="virtual-staff-training-item" key={t.id}>
      <strong>{t.person} · {t.course}</strong>
      <small>Nachgewiesene Stunden: {t.hours_verified&&t.total_hours!==null?t.total_hours:'Ausstehend'} · Interner Richtwert: {t.required_internal_hours===0?'Entfällt':t.required_internal_hours+' h'}</small>
      <p>{t.status==='screening_ready'?'Intern vorsortiert – externe Voraussetzungen prüfen':'Nachweis/Voraussetzungen offen'}</p>
     </div>)}</div>}
    <button type="button" className="ops-refresh" onClick={()=>setShowHours(v=>!v)}><FileCheck2 size={15}/> {showHours?'Stundenverwaltung schließen':'Pilotenstunden & Logbuchnachweise verwalten'}</button>
    {showHours&&<div className="virtual-staff-hours">
     <div className="virtual-staff-pilot-list">{pilots.map(p=><button type="button" key={p.person_id} className={'virtual-staff-pilot '+(pilotId===p.person_id?'selected':'')} onClick={()=>{setPilotId(p.person_id);setTotal(p.total_hours===null?'':String(p.total_hours));setPicHours(p.pic_hours===null?'':String(p.pic_hours));setReference(p.source_reference||'');}}>
      <strong>{p.person}</strong><span>{p.pilot_role} · {p.verification_status==='verified'?'Intern geprüft':p.verification_status==='reported'?'Gemeldet':'Keine Stunden hinterlegt'}</span></button>)}</div>
     <div className="virtual-staff-hours-form">
      {pilot&&<form onSubmit={saveHours}><h4>{pilot.person}</h4>
       <label>Gesamtflugstunden<input type="number" min="0" max="100000" step="0.1" value={total} onChange={e=>setTotal(e.target.value)} required/></label>
       <label>Davon PIC-Stunden<input type="number" min="0" max="100000" step="0.1" value={picHours} onChange={e=>setPicHours(e.target.value)} required/></label>
       <label>Logbuch-/Nachweisreferenz<input value={reference} maxLength={250} minLength={10} onChange={e=>setReference(e.target.value)} required placeholder="Dokument oder Simulationslogbuch"/></label>
       <button className="charter-submit" type="submit" disabled={busy}><Send size={15}/> Stunden ungeprüft erfassen</button>
      </form>}
      {pilot?.verification_status==='reported'&&<div className="virtual-staff-review"><label>Interne Prüfnotiz<input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} minLength={15} maxLength={250} placeholder="Welche Belege wurden konkret geprüft?"/></label>
       <button className="ops-refresh" type="button" disabled={busy||reviewNote.trim().length<15} onClick={()=>void invoke('aervelys_virtual_pilot_hours_review',{p_person_id:pilotId,p_reference:reviewNote.trim()},'Stunden intern geprüft. Keine Lizenz oder Ausbildungszulassung erteilt.')}>Internen Stundennachweis prüfen</button></div>}
     </div>
    </div>}
   </div>
   <div className="virtual-staff-block virtual-staff-audit"><div className="eyebrow">AUDIT TRAIL</div><h3>Letzte Agentenhandlungen</h3>
    {data.events.length===0?<p className="virtual-staff-empty">Noch keine automatischen Schritte protokolliert.</p>:
     data.events.slice(0,12).map(e=><p key={e.id}><strong>{e.action}</strong> · {e.detail} <small>{date(e.created_at)}</small></p>)}
   </div>
  </>}
 </section>;
}
