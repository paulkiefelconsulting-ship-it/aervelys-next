'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Building2,CalendarDays,FileText,History,MapPin,RefreshCw,Save,ShieldAlert,Warehouse} from 'lucide-react';

type AircraftSpace={
 id:string;registration:string;aircraft_type:string;home_icao:string;current_icao:string;
 operational_status:string;homebase_policy_enabled:boolean|null;last_homebase_verified:boolean|null;
 homebase_status:string;parking_id:string|null;provider_name:string|null;facility_description:string|null;
 parking_icao:string|null;parking_status:string|null;parking_start:string|null;parking_end:string|null;
 monthly_rent_eur:number|null;fee_source:string|null;supplier_contract_id:string|null;
 supplier_contract_code:string|null;supplier_contract_status:string|null;
 supplier_contract_amount_eur:number|null;supplier_contract_evidence:string|null;
};
type MaintenanceBay={
 id:string;code:string;airport_icao:string;status:string;aircraft_size_class:string|null;
 notes:string|null;scheduled_bookings:number;
};
type Inquiry={
 id:string;aircraft_id:string;registration:string;airport_icao:string;requested_from:string;
 requirement_note:string;max_monthly_budget_eur:number|null;
 status:'open'|'provider_contacted'|'terms_received'|'closed';
 source_reference:string|null;created_at:string;updated_at:string;
};
type HangarInvoice={invoice_key:string;supplier:string;amount_eur:number;due_on:string|null;payment_status:string;approval_status:string};
type Overview={
 aircraft:AircraftSpace[];maintenance_bays:MaintenanceBay[];inquiries:Inquiry[];
 hangar_invoices:HangarInvoice[];verified_free_spaces:null;
 occupancy_confirmed:false;lease_approved:false;payment_issued:false;
};
type HistoryEvent={
 action:string;previous_status:string|null;new_status:string;
 explanation:string;source_reference:string|null;created_at:string;
};
const statusLabels:Record<Inquiry['status'],string>={
 open:'Offen',provider_contacted:'Anbieter kontaktiert',terms_received:'Konditionen erhalten',closed:'Administrativ geschlossen'
};
const spaceLabels:Record<string,string>={
 awaiting_terms:'Konditionen offen',contracted:'Vertraglich erfasst',terminated:'Beendet',
 operational_hold:'Betrieblich gesperrt',at_homebase:'An Heimatbasis',
 needs_baseline:'Heimatbasis-Nachweis fehlt',return_due:'Rückkehr fällig',
 plan_return:'Rückkehr planen',tour_allowed:'Tour vorläufig möglich'
};
const emptyForm={aircraft_id:'',airport_icao:'EDAZ',requested_from:'',requirement_note:'',max_monthly_budget_eur:''};
function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function eur(value:number|null|undefined){
 if(value===null||value===undefined)return 'Noch nicht festgelegt';
 return Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
}
function date(value:string|null){
 if(!value)return 'Nicht hinterlegt';
 const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);
 return Number.isNaN(d.getTime())?'Ungültiges Datum':d.toLocaleDateString('de-DE');
}

export default function HangarWorkspace(){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [filter,setFilter]=useState('all');
 const [form,setForm]=useState(emptyForm);
 const [activeInquiry,setActiveInquiry]=useState('');
 const [nextStatus,setNextStatus]=useState<Inquiry['status']>('provider_contacted');
 const [statusNote,setStatusNote]=useState('');
 const [evidence,setEvidence]=useState('');
 const [history,setHistory]=useState<HistoryEvent[]>([]);
 const [historyLoading,setHistoryLoading]=useState(false);
 const [showClosed,setShowClosed]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_hangar_overview');
   if(rpcError||!data||!Array.isArray(data.aircraft)||!Array.isArray(data.inquiries))throw Error('No hangar data');
   setOverview(data as Overview);
   setForm(prev=>({...prev,aircraft_id:data.aircraft.some((a:AircraftSpace)=>a.id===prev.aircraft_id)?
    prev.aircraft_id:(data.aircraft.find((a:AircraftSpace)=>a.home_icao==='EDAZ')?.id||data.aircraft[0]?.id||'')}));
  }catch{
   setOverview(null);
   setError('Hangar- und Immobiliendaten nicht abrufbar. Bitte CEO-/OPS-/Finanzrolle, Anmeldung und Verbindung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const selection=overview?.inquiries.find(i=>i.id===activeInquiry);
 const visibleAircraft=useMemo(()=>(overview?.aircraft||[]).filter(a=>filter==='all'||a.home_icao===filter),[overview,filter]);
 const visibleInquiries=useMemo(()=>(overview?.inquiries||[]).filter(i=>showClosed||i.status!=='closed'),[overview,showClosed]);

 const fetchHistory=useCallback(async(id:string)=>{
  if(!id){setHistory([]);return;}
  setHistoryLoading(true);
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_hangar_inquiry_history',{p_inquiry_id:id});
   if(rpcError||!Array.isArray(data))throw Error('History unavailable');
   setHistory(data as HistoryEvent[]);
  }catch{setHistory([]);}
  finally{setHistoryLoading(false);}
 },[]);
 useEffect(()=>{void fetchHistory(activeInquiry);},[activeInquiry,fetchHistory]);
 useEffect(()=>{
  const i=overview?.inquiries.find(x=>x.id===activeInquiry);
  if(i){
   setNextStatus(i.status==='open'?'provider_contacted':i.status==='provider_contacted'?'terms_received':i.status==='terms_received'?'closed':'closed');
   setEvidence(i.source_reference||'');
   setStatusNote('');
  }
 },[activeInquiry,selection?.status]);

 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setSuccess('');
  const airport=form.airport_icao.trim().toUpperCase();
  const budget=form.max_monthly_budget_eur.trim()===''?null:Number(form.max_monthly_budget_eur);
  if(!form.aircraft_id||!/^[A-Z]{4}$/.test(airport)||form.requirement_note.trim().length<8||!form.requested_from){
   setError('Bitte Flugzeug, vierstelligen ICAO-Code, Datum und Beschreibung angeben.');return;
  }
  if(!Number.isFinite(new Date(form.requested_from+'T12:00:00').getTime())){setError('Ungültiges Bedarfsdatum.');return;}
  if(budget!==null&&(!Number.isFinite(budget)||budget<0||budget>10000000||Math.round(budget*100)!==budget*100)){
   setError('Bitte ein gültiges monatliches Planbudget eingeben.');return;
  }
  setWorking(true);
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_hangar_inquiry_create',{
    p_aircraft_id:form.aircraft_id,p_airport_icao:airport,
    p_requested_from:form.requested_from,p_requirement_note:form.requirement_note.trim(),
    p_max_monthly_budget_eur:budget
   });
   if(rpcError||!data?.id)throw Error('Inquiry could not be saved');
   setForm(prev=>({...emptyForm,aircraft_id:prev.aircraft_id,airport_icao:prev.airport_icao}));
   await load();
   setActiveInquiry(String(data.id));
   setSuccess('Stellplatzanfrage angelegt. Keine Kapazität reserviert und kein Mietvertrag aktiviert.');
  }catch{
   setError('Anfrage konnte nicht gespeichert werden. Bitte Datum, Berechtigungen und Eingaben kontrollieren.');
  }finally{setWorking(false);}
 }
 async function updateInquiry(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setSuccess('');
  if(!selection||selection.status==='closed')return;
  if(statusNote.trim().length<8){setError('Bitte die Statusänderung mit mindestens acht Zeichen erläutern.');return;}
  if(nextStatus==='terms_received'&&!evidence.trim()){setError('Erhaltene Konditionen benötigen eine Dokument- oder Angebotsreferenz.');return;}
  setWorking(true);
  try{
   const {error:rpcError}=await db().rpc('aervelys_hangar_inquiry_update',{
    p_inquiry_id:selection.id,p_status:nextStatus,
    p_explanation:statusNote.trim(),p_source_reference:evidence.trim()||null
   });
   if(rpcError)throw Error('Update rejected');
   await load();
   await fetchHistory(selection.id);
   setStatusNote('');
   setSuccess('Bearbeitungsstand gespeichert. Weiterhin keine bestätigte Stellplatzreservierung.');
  }catch{
   setError('Status konnte nicht geändert werden. Bitte Vorgang, Begründung und Belegreferenz prüfen.');
  }finally{setWorking(false);}
 }

 return <section className="panel hangar-workspace">
  <div className="panelhead hangar-heading"><div><div className="eyebrow">AERVELYS NEXT / REAL ESTATE & BASE OPERATIONS</div>
    <h2>Hangars & Immobilien</h2>
    <p className="lead">Stationierung, Mietverträge, Werkstattbuchten und interne Stellplatzanfragen aus Supabase.</p>
   </div><button className="ops-refresh" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="hangar-safety"><ShieldAlert size={18}/><span>Vier EDAZ-Hangarverträge stehen noch im Entwurf. Ohne verifizierte Hallenbestätigung und Konditionen gelten <strong>keine Stellplätze als frei oder verbindlich reserviert</strong>. Anfrageverwaltung löst keine Mietzahlungen aus.</span></div>
  {error&&<p className="charter-error hangar-feedback" role="alert">{error}</p>}
  {success&&<p className="charter-success hangar-feedback" role="status">{success}</p>}
  {loading&&<div className="ops-loading">Standort- und Vertragsdaten werden geladen …</div>}
  {overview&&<>
   <div className="hangar-metrics">
    <article><Building2 size={19}/><strong>{overview.aircraft.length}</strong><span>Flugzeuge im Bestand</span></article>
    <article><FileText size={19}/><strong>{overview.aircraft.filter(a=>a.parking_status==='awaiting_terms').length}</strong><span>Mietkonditionen offen</span></article>
    <article><Warehouse size={19}/><strong>{overview.maintenance_bays.length}</strong><span>Erfasste Wartungsbuchten</span></article>
    <article><MapPin size={19}/><strong>Unbekannt</strong><span>Bestätigte freie Stellplätze</span></article>
   </div>
   <div className="hangar-main">
    <div className="hangar-left">
     <div className="hangar-block">
      <div className="hangar-block-head"><div><div className="eyebrow">FLEET HOMEBASE</div><h3>Standort & Vertragsstatus</h3></div><select aria-label="Heimatbasis filtern" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Alle Basen</option>{Array.from(new Set(overview.aircraft.map(a=>a.home_icao))).map(code=><option key={code} value={code}>{code}</option>)}</select></div>
      <div className="hangar-aircraft-list">{visibleAircraft.map(a=><article className="hangar-aircraft" key={a.id}>
       <div className="hangar-aircraft-top"><strong>{a.registration}</strong><span>{a.home_icao} · {a.current_icao}</span></div>
       <p>{a.aircraft_type}</p>
       <div className="hangar-facts"><span>Vertragsstand</span><strong>{a.parking_status?spaceLabels[a.parking_status]||a.parking_status:'Kein Mietvertrag hinterlegt'}</strong>
        <span>Vermieter</span><strong>{a.provider_name||'Nicht hinterlegt'}</strong>
        <span>Vertragsreferenz</span><strong>{a.supplier_contract_code||'Nicht hinterlegt'}{a.supplier_contract_status?' ('+a.supplier_contract_status+')':''}</strong>
        <span>Monatsmiete</span><strong>{eur(a.monthly_rent_eur)}</strong>
        <span>Homebase-Prüfung</span><strong>{spaceLabels[a.homebase_status]||a.homebase_status}{!a.last_homebase_verified?' · Nachweis offen':''}</strong>
       </div>
       <small>{a.facility_description||'Hallenzuordnung / Belegreferenz noch nicht vorhanden'}</small>
      </article>)}</div>
     </div>
     <div className="hangar-block"><div className="eyebrow">MAINTENANCE FACILITIES</div><h3>Werkstattbuchten ({overview.maintenance_bays.length})</h3>
      {overview.maintenance_bays.length===0?<p className="hangar-empty">Noch keine Wartungsbuchten mit bestätigter Ausstattung und Kapazität erfasst.</p>:
       overview.maintenance_bays.map(b=><div key={b.id} className="hangar-line"><strong>{b.code} · {b.airport_icao}</strong><p>{b.status} · {b.aircraft_size_class||'Größenklasse unbekannt'}</p><small>Geplante Belegungen: {b.scheduled_bookings}</small></div>)}
     </div>
     <div className="hangar-block"><div className="eyebrow">RENTAL COSTS / READ ONLY</div><h3>Hangarrechnungen ({overview.hangar_invoices.length})</h3>
      {overview.hangar_invoices.length===0?<p className="hangar-empty">Keine Hangarrechnungen erfasst. Das bedeutet nicht, dass dauerhaft keine Mietkosten entstehen.</p>:
       overview.hangar_invoices.map(i=><div key={i.invoice_key} className="hangar-line"><strong>{i.invoice_key} · {i.supplier}</strong><p>{eur(i.amount_eur)} · Fällig {date(i.due_on)}</p><small>Freigabe: {i.approval_status} · Zahlung: {i.payment_status}</small></div>)}
     </div>
    </div>
    <div className="hangar-right">
     <div className="hangar-block"><div className="eyebrow">CAPACITY PLANNING / NON-BINDING</div><h3>Stellplatzbedarf anfragen</h3>
      <p className="hangar-helper">Interne Bedarfsmeldung – keine Bestätigung durch den Flughafen und keine Mietvertragsaktivierung.</p>
      <form className="hangar-form" onSubmit={create}>
       <label>Flugzeug<select required value={form.aircraft_id} onChange={e=>setForm(old=>({...old,aircraft_id:e.target.value}))}>{overview.aircraft.map(a=><option key={a.id} value={a.id}>{a.registration} · {a.aircraft_type}</option>)}</select></label>
       <div className="hangar-form-row"><label>Flughafen (ICAO)<input required maxLength={4} value={form.airport_icao} onChange={e=>setForm(old=>({...old,airport_icao:e.target.value.toUpperCase()}))}/></label>
        <label>Benötigt ab<input required type="date" value={form.requested_from} onChange={e=>setForm(old=>({...old,requested_from:e.target.value}))}/></label></div>
       <label>Maximales Monatsbudget (€), optional<input type="number" min={0} max={10000000} step="0.01" value={form.max_monthly_budget_eur} onChange={e=>setForm(old=>({...old,max_monthly_budget_eur:e.target.value}))} placeholder="Noch unbekannt"/></label>
       <label>Bedarf / Hallenanforderungen<textarea required minLength={8} maxLength={1500} rows={4} value={form.requirement_note} onChange={e=>setForm(old=>({...old,requirement_note:e.target.value}))} placeholder="Flugzeuggröße, Zugänglichkeit, Hallenanforderungen, Ansprechpartner …"/></label>
       <button className="charter-submit" type="submit" disabled={working}><Save size={16}/>{working?'Speichert …':'Anfrage erfassen'}</button>
      </form>
     </div>
     <div className="hangar-block">
      <div className="hangar-block-head"><div><div className="eyebrow">FACILITY INQUIRIES</div><h3>Stellplatzanfragen ({visibleInquiries.length})</h3></div>
       <label className="hangar-show-closed"><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)}/> Geschlossene</label></div>
      {visibleInquiries.length===0?<p className="hangar-empty">Noch keine Stellplatzanfragen erfasst.</p>:visibleInquiries.map(i=><button type="button" key={i.id} className={'hangar-inquiry '+(activeInquiry===i.id?'selected':'')} onClick={()=>setActiveInquiry(i.id)}>
       <span><strong>{i.registration} · {i.airport_icao}</strong><small>{statusLabels[i.status]}</small></span>
       <p>Bedarf ab {date(i.requested_from)} · {eur(i.max_monthly_budget_eur)} Budget</p>
      </button>)}
     </div>
     {selection&&<div className="hangar-block">
      <div className="eyebrow">INQUIRY DETAIL</div><h3>{selection.registration} · {selection.airport_icao}</h3>
      <p className="hangar-helper">{selection.requirement_note}</p><p className="hangar-helper">Nachweis: {selection.source_reference||'Noch nicht vorhanden'}</p>
      {selection.status!=='closed'?<form className="hangar-form" onSubmit={updateInquiry}>
       <label>Bearbeitungsstand<select value={nextStatus} onChange={e=>setNextStatus(e.target.value as Inquiry['status'])}>
        <option value="open">Offen</option><option value="provider_contacted">Anbieter kontaktiert</option>
        <option value="terms_received">Konditionen erhalten</option><option value="closed">Administrativ schließen</option>
       </select></label>
       <label>Beleg-/Angebotsreferenz<input maxLength={300} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Pflicht für: Konditionen erhalten"/></label>
       <label>Begründung der Statusänderung<textarea required minLength={8} maxLength={1000} rows={3} value={statusNote} onChange={e=>setStatusNote(e.target.value)} placeholder="Kontakt, erhaltene Informationen, weitere Prüfung …"/></label>
       <button className="ops-refresh" type="submit" disabled={working||nextStatus===selection.status}><Save size={15}/>{working?'Speichert …':'Status protokollieren'}</button>
      </form>:<p className="hangar-empty">Administrativ geschlossen. Eine Reservierung oder Vermietung wurde dadurch nicht bestätigt.</p>}
      <div className="hangar-history"><h4><History size={16}/> Verlauf</h4>
       {historyLoading?<p>Verlauf wird geladen …</p>:history.length===0?<p>Kein Verlauf abrufbar.</p>:history.map((entry,index)=><div key={index}><strong>{statusLabels[entry.new_status as Inquiry['status']]||entry.new_status}</strong><small>{date(entry.created_at)}</small><p>{entry.explanation}</p>{entry.source_reference&&<small>Beleg: {entry.source_reference}</small>}</div>)}
      </div>
     </div>}
    </div>
   </div>
   <div className="ops-footer"><CalendarDays size={15}/> Standort- und Verträgeübersicht, keine Kapazitäts- oder Zahlungsfreigabe.</div>
  </>}
 </section>;
}
