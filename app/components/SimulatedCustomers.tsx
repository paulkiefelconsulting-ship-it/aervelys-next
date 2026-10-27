'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Bot,BriefcaseBusiness,CalendarClock,Clock3,MapPin,MessageCircle,Pause,Play,RefreshCw,ShieldAlert,Users} from 'lucide-react';

type Profile={
 code:string;display_name:string;contact_name:string;segment:string;base_icao:string;
 typical_pax:number;typical_budget_eur:number;price_sensitivity:number;urgency:number;
 style:string;favorite_destinations:string[];travel_purpose:string;requests_total:number;
 active:boolean;last_simulated_at:string|null;
 relationship_stage:string;acquisition_channel:string;preferred_frequency_days:number;satisfaction_score:number;
};
type Case={
 request_id:string;request_code:string;customer_code:string;customer_name:string;contact_name:string;
 scenario:string;budget_ceiling_eur:number;lifecycle:string;response_count:number;
 next_action_at:string;origin:string;destination:string;departure:string;passengers:number;
 request_status:string;created_at:string;generation_source?:string;
 round_trip:boolean;planned_return_at:string|null;special_requests:string|null;
};
type Message={id:number;request_id:string;kind:string;body:string;simulation_round:number;created_at:string};
type SimulationSnapshot={profiles:Profile[];cases:Case[];messages:Message[];simulated_only:true;external_messages_sent:false;llm_connected:false};
type Settings={scheduled_enabled:boolean;daily_hard_cap:number;scheduled_window:string;llm_connected:false};
type MarketMetrics={total:number;active:number;regular:number;occasional:number;prospect:number;dormant:number;at_risk:number;lost:number;acquired_this_month:number;repeat_customers:number;market_events:number};
type MarketPage={profiles:Profile[];filtered_total:number;offset:number;limit:number;market:MarketMetrics};
const stageLabels:Record<string,string>={regular:'Stammkunde',occasional:'Gelegenheitskunde',prospect:'Interessent',dormant:'Inaktiv',at_risk:'Abwanderungsrisiko',lost:'Verloren'};

const segmentLabels:Record<string,string>={
 corporate:'Unternehmen',family_office:'Family Office',production:'Filmproduktion',
 startup:'Startup',concierge:'VIP Concierge',industry:'Industrie',creative:'Kreativwirtschaft',
 hospitality:'Hotellerie',sports:'Sportmanagement',arts:'Kunst & Kultur',
 estate:'Immobilien',events:'Veranstaltungen',trade:'Handelsberatung'
};
const phaseLabels:Record<string,string>={
 inquired:'Neue Anfrage',followup_sent:'Kunde fragt nach',negotiating:'Änderung / Preisfrage',
 interested:'Interesse, noch keine Buchung',withdrawn:'Kunde zieht zurück'
};
const kindLabels:Record<string,string>={
 initial_request:'Erstanfrage',reminder:'Nachfrage',price_question:'Preis / Änderung',
 customer_interest:'Interesse',withdrawal:'Rückzug'
};
function supabase(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function when(value:string|null){
 if(!value)return 'Noch keine Aktivität';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function euros(value:number){return Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});}
export default function SimulatedCustomers({onInboxChanged}:{onInboxChanged?:()=>Promise<void>}){
 const [snapshot,setSnapshot]=useState<SimulationSnapshot|null>(null);
 const [settings,setSettings]=useState<Settings|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [batchSize,setBatchSize]=useState(3);
 const [selectedCustomer,setSelectedCustomer]=useState('');
 const [selectedCase,setSelectedCase]=useState('');
 const [showAll,setShowAll]=useState(false);
 const [directory,setDirectory]=useState<MarketPage|null>(null);
 const [searchDraft,setSearchDraft]=useState('');
 const [searchTerm,setSearchTerm]=useState('');
 const [stage,setStage]=useState('all');
 const [offset,setOffset]=useState(0);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const client=supabase();
   const [list,control,marketList]=await Promise.all([
    client.rpc('aervelys_sim_customers_dashboard'),
    client.rpc('aervelys_sim_customers_settings'),
    client.rpc('aervelys_sim_customers_market_page',{
     p_search:searchTerm,p_stage:stage,p_offset:offset,p_limit:36
    })
   ]);
   if(list.error||control.error||marketList.error||!Array.isArray(marketList.data?.profiles)||!Array.isArray(list.data?.cases))throw Error('No simulation data');
   const result=list.data as SimulationSnapshot;
   setSnapshot(result);
   setSettings(control.data as Settings);
   setDirectory(marketList.data as MarketPage);
   setSelectedCustomer(old=>old&&result.profiles.some(p=>p.code===old)?old:'');
   setSelectedCase(old=>old&&result.cases.some(c=>c.request_id===old)?old:(result.cases[0]?.request_id||''));
  }catch{
   setError('Virtuelle Kunden sind nicht erreichbar. Bitte Anmeldung sowie CEO-/OPS-Rechte prüfen.');
   setSnapshot(null);
  }finally{setLoading(false);}
 },[searchTerm,stage,offset]);
 useEffect(()=>{void load();},[load]);

 async function generate(){
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await supabase().rpc('aervelys_sim_customers_generate',{p_count:batchSize});
   if(rpcError||!Array.isArray(data?.created))throw Error('Generation failed');
   const created=data.created as Array<{customer:string;request_code:string}>;
   await load();
   if(onInboxChanged)await onInboxChanged();
   setNotice(created.length+' unterschiedliche, fiktive Charteranfragen im echten AERVELYS-Posteingang angelegt – eindeutig als SIM markiert.');
  }catch{
   setError('Generierung nicht möglich. Eventuell ist die Obergrenze von 15 Anfragen pro 24 Stunden erreicht.');
  }finally{setBusy(false);}
 }
 async function advance(){
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await supabase().rpc('aervelys_sim_customers_advance',{p_limit:5});
   if(rpcError||!Array.isArray(data?.responses))throw Error('Cycle failed');
   const count=data.responses.length;
   await load();
   if(onInboxChanged)await onInboxChanged();
   setNotice(count>0
    ?count+' Kundenreaktionen simuliert und dem Vorgangsverlauf hinzugefügt. Keine Buchung wurde bestätigt.'
    :'Keine offenen Kundenreaktionen vorhanden. Erzeuge zunächst Anfragen.');
  }catch{
   setError('Kundenreaktionen konnten nicht simuliert werden. Bitte Vorgangsstatus kontrollieren.');
  }finally{setBusy(false);}
 }
 async function toggle(){
  if(!settings)return;
  setBusy(true);setError('');setNotice('');
  try{
   const updated=!settings.scheduled_enabled;
   const {error:rpcError}=await supabase().rpc('aervelys_sim_customers_toggle',{p_enabled:updated});
   if(rpcError)throw Error('Toggle failed');
   await load();
   setNotice(updated?'Automatischer Kundenverkehr aktiviert.':'Automatischer Kundenverkehr pausiert. Manuelle Simulationsrunden bleiben möglich.');
  }catch{
   setError('Einstellung konnte nicht geändert werden. Für die Automatik ist eine CEO-Berechtigung erforderlich.');
  }finally{setBusy(false);}
 }

 const caseRows=useMemo(()=>snapshot?.cases.filter(c=>!selectedCustomer||c.customer_code===selectedCustomer)||[],[snapshot,selectedCustomer]);
 const shownCases=showAll?caseRows:caseRows.slice(0,12);
 const currentCase=snapshot?.cases.find(c=>c.request_id===selectedCase)||null;
 const currentMessages=useMemo(()=>snapshot?.messages.filter(m=>m.request_id===selectedCase).slice().reverse()||[],[snapshot,selectedCase]);
 const activeProfiles=directory?.market.active||0;

 return <section className="panel sim-customer-center">
  <div className="panelhead sim-customer-header">
   <div><div className="eyebrow">AERVELYS / VIRTUAL CUSTOMER AGENCY</div>
    <h2>Virtuelle Charterkunden</h2>
    <p className="lead">Eigenständige fiktive Kunden mit Reiseverhalten, Budget, wiederkehrenden Anfragen und Reaktionen.</p></div>
   <button type="button" className="ops-refresh" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="sim-customer-alert"><ShieldAlert size={19}/><span><strong>Simulierte Geschäftswelt:</strong> Alle Namen, Firmen, Nachrichten und Anfragen dieses Moduls sind fiktiv. E-Mail-Adressen enden auf <code>.invalid</code>. Es werden keine Nachrichten an echte Menschen gesendet, keine Flüge freigegeben und keine Kosten für ein Sprachmodell ausgelöst. Die Agentenlogik ist zunächst regel- und zustandsbasiert.</span></div>
  {error&&<p role="alert" className="charter-error sim-customer-feedback">{error}</p>}
  {notice&&<p role="status" className="charter-success sim-customer-feedback">{notice}</p>}
  {loading&&<div className="ops-loading">Virtuelle Kundenwelt wird geladen …</div>}
  {snapshot&&settings&&<>
   <div className="sim-customer-stats">
    <div><Users size={18}/><strong>{activeProfiles}</strong><span>Unterschiedliche Kundenprofile</span></div>
    <div><BriefcaseBusiness size={18}/><strong>{snapshot.cases.length}</strong><span>Letzte simulierte Anfragen (max. 100)</span></div>
    <div><MessageCircle size={18}/><strong>{snapshot.messages.filter(m=>m.kind!=='initial_request').length}</strong><span>Kundenreaktionen im Verlauf</span></div>
    <div><CalendarClock size={18}/><strong>{settings.scheduled_enabled?'Aktiv':'Pause'}</strong><span>Zeitgesteuerter Kundenverkehr</span></div>
   </div>
   <div className="sim-customer-controls">
    <div><div className="eyebrow">CUSTOMER TRAFFIC CONTROL</div><h3>Realistische Nachfrage simulieren</h3>
     <p>Stammkunden, Gelegenheitskunden und Neukunden fragen unterschiedlich häufig an. Werktags entsteht mehr Nachfrage als am Wochenende. Höchstens 15 Anfragen pro 24 Stunden schützen den Posteingang; neue Marktprofile können monatlich hinzukommen.</p></div>
    <div className="sim-customer-actions">
     <label>Neue Anfragen pro Runde<select value={batchSize} disabled={busy} onChange={e=>setBatchSize(Number(e.target.value))}><option value={1}>1 Kunde</option><option value={3}>3 Kunden</option><option value={5}>5 Kunden</option></select></label>
     <button type="button" className="charter-submit" disabled={busy} onClick={()=>void generate()}><Play size={16}/> Kundenanfragen erzeugen</button>
     <button type="button" className="ops-refresh" disabled={busy} onClick={()=>void advance()}><MessageCircle size={16}/> Kunden reagieren lassen</button>
     <button type="button" className="ops-refresh" disabled={busy} onClick={()=>void toggle()}>{settings.scheduled_enabled?<Pause size={16}/>:<Play size={16}/>} {settings.scheduled_enabled?'Automatik pausieren':'Automatik aktivieren'}</button>
    </div>
   </div>
   <div className="sim-customer-section">
    <div className="eyebrow">RECURRING VIRTUAL CLIENTS</div><h3>Deine virtuelle Kundschaft</h3>
    <p>Jeder Kunde besitzt eigene Reisegewohnheiten und einen wiedererkennbaren Kommunikationsstil.</p>
    {directory&&<div className="sim-customer-market-summary">
     <div><strong>{directory.market.total}</strong><span>Gesamtmarkt</span></div>
     <div><strong>{directory.market.regular}</strong><span>Stammkunden</span></div>
     <div><strong>{directory.market.occasional}</strong><span>Gelegenheitskunden</span></div>
     <div><strong>{directory.market.prospect}</strong><span>Interessenten</span></div>
     <div><strong>{directory.market.dormant+directory.market.at_risk+directory.market.lost}</strong><span>Inaktiv / verloren</span></div>
     <div><strong>{directory.market.repeat_customers}</strong><span>Wiederkehrende Auftraggeber</span></div>
    </div>}
    <div className="sim-customer-directory-tools">
     <form onSubmit={e=>{e.preventDefault();setOffset(0);setSearchTerm(searchDraft.trim());}}>
      <input aria-label="Kunden suchen" maxLength={80} value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} placeholder="Firma, Ansprechpartner oder Kundennummer suchen …"/>
      <button type="submit" className="ops-refresh">Suchen</button>
     </form>
     <select aria-label="Kundengruppen filtern" value={stage} onChange={e=>{setStage(e.target.value);setOffset(0);}}>
      <option value="all">Alle Kundengruppen</option><option value="regular">Stammkunden</option>
      <option value="occasional">Gelegenheitskunden</option><option value="prospect">Interessenten</option>
      <option value="dormant">Inaktiv</option><option value="at_risk">Abwanderungsrisiko</option>
      <option value="lost">Verlorene Kunden</option>
     </select>
    </div>
    <div className="sim-customer-directory-result">Zeige {directory?.profiles.length||0} von {directory?.filtered_total||0} passenden Kunden · Seite {Math.floor(offset/36)+1}</div>
    <div className="sim-customer-profiles">
     {(directory?.profiles||[]).map(p=><button type="button" key={p.code}
      className={'sim-customer-profile '+(selectedCustomer===p.code?'selected':'')}
      onClick={()=>{setSelectedCustomer(old=>old===p.code?'':p.code);setSelectedCase('');}}>
      <div><span>{segmentLabels[p.segment]||p.segment}</span><small>{p.code}</small></div>
      <div className="sim-customer-status"><strong>{stageLabels[p.relationship_stage]||p.relationship_stage}</strong><small>{p.acquisition_channel}</small></div>
      <h4>{p.display_name}</h4><p>{p.contact_name}</p>
      <div className="sim-customer-profile-facts">
       <span><MapPin size={13}/> {p.base_icao}</span><span>{p.typical_pax} Passagiere typisch</span>
       <span>Budget ~{euros(p.typical_budget_eur)}</span><span>{p.requests_total} bisherige Anfragen</span>
      </div>
      <small>Charakter: {p.style} · Preisempfindlichkeit {p.price_sensitivity}/5 · Anfragezyklus ~{p.preferred_frequency_days} Tage · Zufriedenheit {p.satisfaction_score}/100</small>
     </button>)}
    </div>
    <div className="sim-customer-pagination">
     <button type="button" className="ops-refresh" disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-36))}>Vorherige Seite</button>
     <span>{directory?.filtered_total||0} Kunden gefunden</span>
     <button type="button" className="ops-refresh" disabled={loading||offset+36>=(directory?.filtered_total||0)} onClick={()=>setOffset(offset+36)}>Nächste Seite</button>
    </div>
   </div>
   <div className="sim-customer-columns">
    <div className="sim-customer-section">
     <div className="sim-customer-heading"><div><div className="eyebrow">SIMULATED REQUEST PIPELINE</div><h3>Generierte Charteranfragen</h3></div>
      <button className="ops-refresh" type="button" onClick={()=>{setSelectedCustomer('');setShowAll(!showAll);}}>{showAll?'Weniger anzeigen':'Alle anzeigen'}</button></div>
     {shownCases.length===0?<p className="sim-customer-empty">Noch keine fiktiven Anfragen für diese Auswahl. Starte oben eine Runde.</p>:shownCases.map(c=><button key={c.request_id} type="button"
       className={'sim-customer-case '+(selectedCase===c.request_id?'selected':'')}
       onClick={()=>setSelectedCase(c.request_id)}>
       <div><strong>{c.request_code}</strong><span>{phaseLabels[c.lifecycle]||c.lifecycle}</span></div>
       <h4>{c.customer_name}</h4>
       <p>{c.origin} → {c.destination} · {c.passengers} Pax · {when(c.departure)}</p>
       <small>Interner Preisrahmen {euros(c.budget_ceiling_eur)} · {c.response_count} Reaktionen{c.round_trip&&c.planned_return_at?' · Rückflug angefragt: '+when(c.planned_return_at):''}</small>
      </button>)}
    </div>
    <div className="sim-customer-section">
     <div className="eyebrow">CUSTOMER CONVERSATION</div><h3>Nachrichtenverlauf</h3>
     {!currentCase?<p className="sim-customer-empty">Wähle eine Charteranfrage aus, um ihre simulierte Kundenkommunikation zu sehen.</p>:
      <>
       <div className="sim-customer-conversation-head">
        <strong>{currentCase.customer_name}</strong><p>{currentCase.request_code} · {phaseLabels[currentCase.lifecycle]||currentCase.lifecycle}</p>
        <small>Geplanter Abflug: {when(currentCase.departure)}</small>
        {currentCase.round_trip&&currentCase.planned_return_at&&<small>Rückreise angefragt: {when(currentCase.planned_return_at)} (nur Anfrage)</small>}
        {currentCase.special_requests&&<small>Servicewunsch: {currentCase.special_requests}</small>}
       </div>
       {currentMessages.map(m=><article className="sim-customer-message" key={m.id}>
        <div><strong>{kindLabels[m.kind]||m.kind}</strong><span>{when(m.created_at)}</span></div>
        <p>{m.body}</p><small>Simulation · Runde {m.simulation_round}</small>
       </article>)}
      </>}
    </div>
   </div>
   <div className="ops-footer"><Bot size={15}/> Stufe 1: wachsender synthetischer Markt mit Stamm- und Gelegenheitskunden, Kundenhistorie und monatlicher Akquise. Die Anfragen bleiben simuliert; keine LLM-Kosten und keine externen Kontakte.</div>
  </>}
 </section>;
}
