'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowRight,CalendarClock,ClipboardList,RefreshCw,Search,ShieldAlert} from 'lucide-react';

type CharterRequest={
 request_id:string;
 case_id:string|null;
 request_code:string;
 origin_icao:string;
 destination_icao:string;
 requested_departure:string;
 passengers:number;
 request_status:string;
 processing_status:string|null;
 priority:string|null;
 contact_name:string|null;
 contact_email:string|null;
 customer_note:string|null;
 received_at:string;
};

type FormValues={
 origin:string;destination:string;departure:string;passengers:string;
 contact:string;email:string;note:string;priority:string;
};
const initial:FormValues={origin:'',destination:'',departure:'',passengers:'2',contact:'',email:'',note:'',priority:'normal'};

function formatDate(value:string){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'Ungültiges Datum':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase-Verbindung nicht konfiguriert.');
 return createBrowserClient(url,key);
}
export default function CharterWorkstation({onCreated,onOpenInbox}:{onCreated:()=>Promise<void>;onOpenInbox:()=>void}){
 const [form,setForm]=useState<FormValues>(initial);
 const [records,setRecords]=useState<CharterRequest[]>([]);
 const [loading,setLoading]=useState(true);
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const [ready,setReady]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_charter_requests_list');
   if(rpcError)throw rpcError;
   if(!Array.isArray(data))throw new Error('Unerwartete Serverantwort');
   setRecords(data as CharterRequest[]);setReady(true);
  }catch{
   setReady(false);
   setError('Chartervorgänge nicht erreichbar. Bitte Anmeldung und CEO-/OPS-Berechtigung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const visible=useMemo(()=>{
  const q=query.toLocaleLowerCase('de-DE').trim();
  return records.filter(r=>[r.request_code,r.origin_icao,r.destination_icao,r.contact_name].some(v=>(v||'').toLocaleLowerCase('de-DE').includes(q)));
 },[records,query]);
 const current=records.find(r=>r.request_id===selected);

 function update<K extends keyof FormValues>(field:K,value:FormValues[K]){
  setForm(old=>({...old,[field]:value}));
 }
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  setError('');setNotice('');
  const origin=form.origin.trim().toUpperCase();
  const destination=form.destination.trim().toUpperCase();
  const departure=new Date(form.departure);
  const passengers=Number(form.passengers);
  if(!/^[A-Z]{4}$/.test(origin)||!/^[A-Z]{4}$/.test(destination)||origin===destination){
   setError('Bitte unterschiedliche, vierstellige ICAO-Flughafencodes eingeben.');return;
  }
  if(Number.isNaN(departure.getTime())||departure.getTime()<=Date.now()){
   setError('Der Abflug muss in der Zukunft liegen.');return;
  }
  if(!Number.isInteger(passengers)||passengers<1||passengers>30){
   setError('Für die Anfrageerfassung sind 1 bis 30 Passagiere zulässig.');return;
  }
  if(form.contact.trim().length<2){
   setError('Bitte einen Ansprechpartner angeben.');return;
  }
  setSubmitting(true);
  try{
   const {data,error:rpcError}=await client().rpc('aervelys_charter_request_create',{
    p_origin_icao:origin,
    p_destination_icao:destination,
    p_departure:departure.toISOString(),
    p_passengers:passengers,
    p_contact_name:form.contact.trim(),
    p_contact_email:form.email.trim()||null,
    p_note:form.note.trim()||null,
    p_priority:form.priority
   });
   if(rpcError)throw rpcError;
   setNotice('Anfrage '+String(data?.request_code||'')+' wurde angelegt und im Posteingang erfasst.');
   setForm(initial);
   setSelected(data?.request_id||null);
   await load();
   await onCreated();
  }catch{
   setError('Anfrage konnte nicht gespeichert werden. Bitte Berechtigungen und Eingaben prüfen.');
  }finally{setSubmitting(false);}
 }

 return <div className="charter-layout">
  <section className="panel charter-form-panel">
   <div className="panelhead">
    <div className="eyebrow">CHARTER SALES / INTAKE</div>
    <h2>Neue Charteranfrage</h2>
    <p className="lead">Interne Erfassung. Es wird noch kein Angebot versendet und kein Flug gebucht.</p>
   </div>
   <div className="charter-alert"><ShieldAlert size={17}/><span>Alle Flüge benötigen später eine separate Prüfung von Flugzeug, Crew, Wartung und Airport-Regeln.</span></div>
   <form className="charter-form" onSubmit={create}>
    <div className="charter-form-row">
     <label>Abflug ICAO <input required maxLength={4} placeholder="EDAZ" value={form.origin} onChange={e=>update('origin',e.target.value.toUpperCase())}/></label>
     <label>Ziel ICAO <input required maxLength={4} placeholder="LFMN" value={form.destination} onChange={e=>update('destination',e.target.value.toUpperCase())}/></label>
    </div>
    <div className="charter-form-row">
     <label>Gewünschter Abflug (lokale Zeit)<input required type="datetime-local" value={form.departure} onChange={e=>update('departure',e.target.value)}/></label>
     <label>Passagiere<input required type="number" min={1} max={30} value={form.passengers} onChange={e=>update('passengers',e.target.value)}/></label>
    </div>
    <label>Ansprechpartner<input required minLength={2} maxLength={160} autoComplete="name" placeholder="Name / Unternehmen" value={form.contact} onChange={e=>update('contact',e.target.value)}/></label>
    <label>Kontakt-E-Mail (optional)<input type="email" maxLength={254} autoComplete="email" placeholder="kontakt@beispiel.de" value={form.email} onChange={e=>update('email',e.target.value)}/></label>
    <label>Priorität<select value={form.priority} onChange={e=>update('priority',e.target.value)}><option value="low">Niedrig</option><option value="normal">Normal</option><option value="high">Hoch</option><option value="urgent">Dringend</option></select></label>
    <label>Anmerkungen (optional)<textarea maxLength={2000} rows={3} placeholder="Besondere Wünsche, Gepäck, zusätzliche Informationen …" value={form.note} onChange={e=>update('note',e.target.value)}/></label>
    {error&&<p className="charter-error" role="alert">{error}</p>}
    {notice&&<p className="charter-success" role="status">{notice}</p>}
    <button className="charter-submit" type="submit" disabled={submitting}>{submitting?'Wird gespeichert …':'Anfrage erfassen'}</button>
   </form>
  </section>
  <section className="panel charter-list-panel">
   <div className="panelhead charter-list-header">
    <div><div className="eyebrow">REQUEST PIPELINE</div><h2>Chartervorgänge</h2><p className="lead">Manuelle Eingänge und ihre aktuellen Bearbeitungsstände</p></div>
    <button type="button" className="ops-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Aktualisieren</button>
   </div>
   <div className="charter-search"><Search size={16}/><input aria-label="Charteranfragen durchsuchen" value={query} placeholder="Vorgang, Flughafen, Ansprechpartner …" onChange={e=>setQuery(e.target.value)}/></div>
   {loading?<div className="ops-loading">Charteranfragen werden geladen …</div>:null}
   {!loading&&!ready?<div className="ops-error">{error}</div>:null}
   {!loading&&ready&&visible.length===0?<div className="charter-empty"><ClipboardList size={27}/><strong>Noch keine Anfragen</strong><p>{query?'Keine Treffer für deine Suche.':'Erfasse links die erste Charteranfrage.'}</p></div>:null}
   {!loading&&ready&&visible.length>0&&<div className="charter-items">
    {visible.map(item=><button key={item.request_id} type="button" className={'charter-item '+(selected===item.request_id?'selected':'')} onClick={()=>setSelected(item.request_id)}>
     <div className="charter-item-top"><strong>{item.request_code}</strong><span className="pill">{item.processing_status||item.request_status}</span></div>
     <div className="charter-route">{item.origin_icao} <ArrowRight size={16}/> {item.destination_icao}</div>
     <div className="charter-item-meta">{item.contact_name||'Kontakt nicht erfasst'} · {item.passengers} Pax · {formatDate(item.requested_departure)}</div>
    </button>)}
   </div>}
   {current&&<div className="charter-detail"><div className="eyebrow">SELECTED REQUEST</div><h3>{current.request_code}</h3><p><CalendarClock size={15}/> {formatDate(current.requested_departure)}</p><p>Ansprechpartner: <strong>{current.contact_name||'Nicht erfasst'}</strong></p>{current.contact_email&&<p>Kontakt: {current.contact_email}</p>}<p>Priorität: {current.priority||'normal'} · Bearbeitung: {current.processing_status||current.request_status}</p>{current.customer_note&&<p>Hinweise: {current.customer_note}</p>}<button type="button" className="charter-open-inbox" onClick={onOpenInbox}>Posteingang öffnen <ArrowRight size={15}/></button></div>}
   <div className="ops-footer">{ready?records.length+' Vorgänge · Geschützte Live-Daten':'Nur autorisierte CEO- und OPS-Benutzer'}</div>
  </section>
 </div>;
}
