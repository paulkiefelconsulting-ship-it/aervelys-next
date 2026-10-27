'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {BadgeEuro,CalendarClock,Clock3,MessageSquareQuote,RefreshCw,ShieldAlert,Send} from 'lucide-react';

type Proposal={
 id:string;request_id:string;request_code:string;customer_name:string;
 revision:number;price_eur:number;budget_eur:number;
 requested_departure:string;proposed_departure:string;note:string;
 status:'presented'|'responded';next_response_at:string;
 response_outcome:string|null;response_reason:string|null;response_message:string|null;
 responded_at:string|null;created_at:string;
};
type LabRequest={request_id:string;request_code:string;customer_name:string;origin:string;destination:string;
 departure:string;budget_ceiling_eur:number;request_status:string};

function db(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw new Error('Supabase not configured');
 return createBrowserClient(u,k);
}
function formatPrice(n:number){return Number(n).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
function displayDate(s:string|null){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}
function toDatetimeLocal(s:string){const d=new Date(s);if(Number.isNaN(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
const reactionText:Record<string,string>={interested:'Unverbindliches Interesse',counter_offer:'Preisverhandlung',schedule_change:'Anderer Termin gewünscht',declined:'Kunde zieht Anfrage zurück'};

export default function SimulatedPriceLab({current,onChanged}:{current:LabRequest|null;onChanged?:()=>Promise<void>}){
 const [all,setAll]=useState<Proposal[]>([]);
 const [price,setPrice]=useState('');
 const [departure,setDeparture]=useState('');
 const [note,setNote]=useState('Unverbindliche simulierte Preisindikation zur Prüfung der Kundenreaktion – keine echte Offerte.');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const {data,error:err}=await db().rpc('aervelys_sim_price_proposals_list');
   if(err||!Array.isArray(data))throw new Error('Could not read');
   setAll(data as Proposal[]);
  }catch{setAll([]);setError('Preisindikationen konnten nicht geladen werden. Bitte Berechtigung und Supabase prüfen.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  setPrice(current?String(Math.round(current.budget_ceiling_eur)):'' );
  setDeparture(current?toDatetimeLocal(current.departure):'');
  setError('');setNotice('');
 },[current?.request_id]);
 const items=useMemo(()=>all.filter(x=>x.request_id===current?.request_id),[all,current?.request_id]);
 const pending=items.find(x=>x.status==='presented');
 const allowed=!!current&&new Date(current.departure)>new Date()
  &&!['cancelled','completed','declined'].includes(current.request_status)&&items.length<5&&!pending;

 async function changed(){
  await load();
  if(onChanged){try{await onChanged();}catch{/* local write already succeeded */}}
 }
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!current)return;
  setError('');setNotice('');
  const amount=Number(price),dt=new Date(departure);
  if(!Number.isFinite(amount)||amount<2500||amount>250000||Math.round(amount*100)!==amount*100){
   setError('Bitte einen Preis zwischen 2.500 und 250.000 € mit höchstens zwei Nachkommastellen angeben.');return;
  }
  if(Number.isNaN(dt.getTime())||dt<=new Date()){
   setError('Bitte eine gültige zukünftige Abflugzeit wählen.');return;
  }
  if(note.trim().length<10){setError('Bitte kurz erklären, welche Variante simuliert werden soll.');return;}
  setBusy(true);
  try{
   const {data,error:err}=await db().rpc('aervelys_sim_price_proposal_create',{
    p_request_id:current.request_id,p_indicated_price_eur:amount,
    p_proposed_departure:dt.toISOString(),p_note:note.trim()
   });
   if(err||!data?.proposal_id)throw new Error('Failed to create proposal');
   await changed();
   setNotice('Interne SIM-Preisindikation gespeichert. Der Kunde kann nach seiner Reaktionszeit oder auf Knopfdruck antworten.');
  }catch{
   setError('Preisindikation abgelehnt. Bitte Termin, Freigrenzen und offene Testangebote prüfen.');
  }finally{setBusy(false);}
 }
 async function react(id:string){
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:err}=await db().rpc('aervelys_sim_price_proposal_react',{p_proposal_id:id});
   if(err||!data?.response_outcome)throw new Error('Could not simulate reply');
   await changed();
   setNotice('Fiktiver Kunde hat reagiert: '+(reactionText[String(data.response_outcome)]||String(data.response_outcome))+'. Keine echte Buchung.');
  }catch{
   setError('Kundenreaktion nicht möglich. Die Preisindikation ist möglicherweise bereits beantwortet oder die Anfrage abgelaufen.');
  }finally{setBusy(false);}
 }

 return <section className="sim-price-lab">
  <div className="sim-price-head"><div><div className="eyebrow">SANDBOX / SIMULATED PRICE SIGNALS</div><h3><BadgeEuro size={19}/> Preis- und Verhandlungslabor</h3>
    <p>Teste Preisvorstellungen, Terminkonflikte und Kundenreaktionen. Die Simulation erzeugt keine echten Charterangebote.</p></div>
    <button type="button" className="ops-refresh" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={15}/> Aktualisieren</button>
  </div>
  <div className="sim-price-warning"><ShieldAlert size={17}/><span><strong>Nur Simulation:</strong> Der Betrag ist eine Test-Preisindikation, kein verbindliches Charterangebot. Weder Flugzeug, Crew noch Zahlung werden reserviert oder freigegeben.</span></div>
  {error&&<p className="charter-error" role="alert">{error}</p>}
  {notice&&<p className="charter-success" role="status">{notice}</p>}
  {!current?<p className="sim-customer-empty">Wähle oben eine simulierte Charteranfrage aus, um einen Preistest zu starten.</p>:
   <div className="sim-price-grid">
    <form className="sim-price-form" onSubmit={create}>
     <h4>{current.request_code} · {current.customer_name}</h4>
     <p>{current.origin} → {current.destination} · Wunschabflug {displayDate(current.departure)}</p>
     <label>Unverbindlicher Testpreis (€)<input type="number" min="2500" max="250000" step="0.01" required value={price} disabled={!allowed||busy} onChange={e=>setPrice(e.target.value)}/></label>
     <label>Vorgeschlagener Abflug (lokale Zeit)<input type="datetime-local" required value={departure} disabled={!allowed||busy} onChange={e=>setDeparture(e.target.value)}/></label>
     <label>Interne Simulationsnotiz<textarea required minLength={10} maxLength={1200} rows={3} value={note} disabled={!allowed||busy} onChange={e=>setNote(e.target.value)}/></label>
     <button className="charter-submit" type="submit" disabled={!allowed||busy}><Send size={15}/>{busy?'Verarbeitet …':'Preisindikation simulieren'}</button>
     {!allowed&&<p className="sim-price-warning-inline">{pending?'Diese Anfrage wartet noch auf eine Kundenreaktion.':items.length>=5?'Für diese Anfrage wurden bereits fünf Testvarianten erfasst.':'Die Anfrage ist geschlossen oder ihr Abflug liegt in der Vergangenheit.'}</p>}
    </form>
    <div className="sim-price-history">
     <h4><MessageSquareQuote size={17}/> Kundenreaktionen ({items.length})</h4>
     {loading?<p>Testhistorie wird geladen …</p>:items.length===0?<p>Hier erscheinen deine Preisvarianten und die Antworten des virtuellen Kunden.</p>:items.map(item=><article key={item.id}>
      <div className="sim-price-history-top"><strong>Variante {item.revision} · {formatPrice(item.price_eur)}</strong><span>{item.status==='presented'?'Antwort ausstehend':reactionText[item.response_outcome||'']||'Beantwortet'}</span></div>
      <small><CalendarClock size={13}/> Vorgeschlagener Abflug: {displayDate(item.proposed_departure)}</small>
      <p>{item.note}</p>
      {item.response_message?<blockquote>{item.response_message}</blockquote>:<div className="sim-price-pending"><Clock3 size={15}/> Früheste automatische Reaktion: {displayDate(item.next_response_at)}
       <button type="button" className="ops-refresh" disabled={busy} onClick={()=>void react(item.id)}>Jetzt simuliert antworten</button></div>}
     </article>)}
    </div>
   </div>}
  <p className="sim-price-footer">Genuine Charter-Angebote bleiben ausschließlich im separat gesicherten Angebots- und Freigabesystem.</p>
 </section>;
}
