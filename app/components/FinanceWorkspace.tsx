'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Building2,FileText,LockKeyhole,RefreshCw,Save,Search,ShieldAlert,Wallet} from 'lucide-react';

type Contract={
 id:string;code:string;supplier:string;type:string;title:string;
 start:string|null;end:string|null;payment_terms_days:number|null;
 recurring_amount_eur:number|null;status:string;
 evidence_reference:string|null;approved_at:string|null;
 created_at:string;draft_text:string|null;
};
type Quote={id:string;code:string;supplier:string;description:string;amount_eur:number|null;status:string;received_at:string;valid_until:string|null;evidence_reference:string|null};
type Invoice={id:string;invoice_key:string;supplier:string;category:string;amount_eur:number;issued_on:string|null;due_on:string|null;verification_status:string;approval_status:string;payment_status:string};
type Account={code:string;label:string;type:string;balance_eur:number};
type Overview={
 company_cash_eur:number;company_booked_expenses_eur:number;draft_monthly_nominal_eur:number;
 unpaid_supplier_invoices_eur:number;
 contracts:Contract[];quotes:Quote[];invoices:Invoice[];company_accounts:Account[];
 payments_executed:false;contract_approved:false;
};
type ContractForm={
 supplier:string;title:string;type:string;start:string;end:string;
 monthly:string;payment_terms:string;draft_text:string;
};
const blank:ContractForm={supplier:'',title:'',type:'other',start:'',end:'',monthly:'',payment_terms:'',draft_text:''};
const typeLabels:Record<string,string>={hangar_rent:'Hangarmiete',maintenance_framework:'Wartungsrahmenvertrag',parts_supply:'Ersatzteilversorgung',other:'Sonstiges'};
const statusLabels:Record<string,string>={draft:'Entwurf',quoted:'Angebot',awaiting_ceo:'CEO-Prüfung',approved:'Freigegeben',active:'Aktiv',expired:'Abgelaufen',rejected:'Abgelehnt'};

function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function eur(value:number|string|null|undefined){
 const n=Number(value??0);
 return Number.isFinite(n)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n):'—';
}
function date(value:string|null){return value?new Date(value+'T00:00:00').toLocaleDateString('de-DE'):'—';}
function editForm(item:Contract):ContractForm{
 return {supplier:item.supplier,title:item.title,type:item.type,start:item.start||'',end:item.end||'',
 monthly:item.recurring_amount_eur===null?'':String(item.recurring_amount_eur),
 payment_terms:item.payment_terms_days===null?'':String(item.payment_terms_days),
 draft_text:item.draft_text||''};
}
export default function FinanceWorkspace(){
 const [snapshot,setSnapshot]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('all');
 const [selected,setSelected]=useState<string|null>(null);
 const [form,setForm]=useState<ContractForm>(blank);
 const [showAccounts,setShowAccounts]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_finance_overview');
   if(rpcError||!data||!Array.isArray(data.contracts)||!Array.isArray(data.company_accounts))throw new Error('No finance data');
   setSnapshot(data as Overview);
  }catch{
   setSnapshot(null);
   setError('Unternehmensfinanzen nicht abrufbar. Bitte mit aktiver CEO- oder Finanzrolle anmelden.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const filtered=useMemo(()=>(snapshot?.contracts||[]).filter(c=>
  (category==='all'||c.status===category)&&
  [c.code,c.supplier,c.title,c.type].join(' ').toLocaleLowerCase('de-DE').includes(search.toLocaleLowerCase('de-DE').trim())
 ),[snapshot,category,search]);
 const focused=snapshot?.contracts.find(c=>c.id===selected)||null;

 function resetForm(){setSelected(null);setForm(blank);setError('');setSuccess('');}
 function choose(c:Contract){
  setSelected(c.id);setForm(editForm(c));setError('');setSuccess('');
 }
 function update<K extends keyof ContractForm>(key:K,value:ContractForm[K]){
  setForm(old=>({...old,[key]:value}));
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setSuccess('');
  if(focused&&focused.status!=='draft'){setError('Nur nicht freigegebene Entwürfe sind bearbeitbar.');return;}
  if(form.supplier.trim().length<2||form.title.trim().length<5){setError('Bitte Lieferant und Vertragstitel ausfüllen.');return;}
  if(form.end&&(!form.start||form.end<form.start)){setError('Das Enddatum darf nicht vor dem Startdatum liegen.');return;}
  const monthly=form.monthly.trim()?Number(form.monthly):null;
  const terms=form.payment_terms.trim()?Number(form.payment_terms):null;
  if(monthly!==null&&(!Number.isFinite(monthly)||monthly<0||monthly>10000000||Math.round(monthly*100)!==monthly*100)){
   setError('Bitte einen gültigen Monatsbetrag mit höchstens zwei Nachkommastellen eingeben.');return;
  }
  if(terms!==null&&(!Number.isInteger(terms)||terms<0||terms>365)){setError('Zahlungsziel muss 0 bis 365 Tage betragen.');return;}
  setSaving(true);
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_contract_draft_save',{
    p_contract_id:selected,
    p_supplier:form.supplier.trim(),
    p_title:form.title.trim(),
    p_contract_type:form.type,
    p_start:form.start||null,
    p_end:form.end||null,
    p_monthly:monthly,
    p_payment_terms:terms,
    p_draft_text:form.draft_text.trim()||null
   });
   if(rpcError||!data?.id)throw new Error('Could not save draft');
   await load();
   setSelected(String(data.id));
   setSuccess('Vertragsentwurf '+String(data.code)+' gespeichert. Keine Freigabe oder Zahlung ausgelöst.');
  }catch{
   setError('Entwurf konnte nicht gespeichert werden. Bitte Rollenrechte, Eingaben oder Vertragsstatus prüfen.');
  }finally{setSaving(false);}
 }

 return <section className="panel finance-workspace">
  <div className="panelhead finance-heading"><div><div className="eyebrow">AERVELYS NEXT / COMPANY FINANCE</div><h2>Finanzen & Verträge</h2><p className="lead">Unternehmensbuchhaltung, Lieferantenverträge und neue Vertragsentwürfe – strikt getrennt vom Privatvermögen.</p></div>
   <button type="button" className="ops-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  <div className="finance-safety"><LockKeyhole size={19}/><span>Nur <strong>Unternehmensbuchungen</strong> werden hier ausgewertet. Vertragsentwürfe erzeugen weder Zahlungsverpflichtungen noch automatische Freigaben. Es gibt keine Zahlungsfunktion.</span></div>
  {error&&<p className="charter-error finance-feedback" role="alert">{error}</p>}
  {success&&<p className="charter-success finance-feedback" role="status">{success}</p>}
  {loading&&<div className="ops-loading">Firmenbuchhaltung wird geladen …</div>}
  {snapshot&&<>
   <div className="finance-metrics">
    <article><Wallet size={18}/><span>Firmenliquidität (Konto 1000)</span><strong>{eur(snapshot.company_cash_eur)}</strong><small>Gebuchter Anfangsbestand abzüglich vorhandener Firmenbuchungen</small></article>
    <article><FileText size={18}/><span>Gebuchte Firmenaufwendungen</span><strong>{eur(snapshot.company_booked_expenses_eur)}</strong><small>Nur Aufwandskonten der Gesellschaft</small></article>
    <article><Building2 size={18}/><span>Monatliche Entwurfsbeträge</span><strong>{eur(snapshot.draft_monthly_nominal_eur)}</strong><small>Geplant, nicht vertraglich verpflichtet</small></article>
    <article><ShieldAlert size={18}/><span>Unbezahlte Lieferantenrechnungen</span><strong>{eur(snapshot.unpaid_supplier_invoices_eur)}</strong><small>Erfasster Rechnungsbestand, ohne Überweisung</small></article>
   </div>
   <div className="finance-layout">
    <div className="finance-main">
     <div className="finance-block"><div className="finance-block-top"><div><div className="eyebrow">SUPPLIER AGREEMENTS</div><h3>Verträge ({snapshot.contracts.length})</h3></div><button type="button" className="ops-refresh" onClick={resetForm}>+ Neuer Entwurf</button></div>
      <div className="finance-filters"><label className="finance-search"><Search size={16}/><input aria-label="Verträge durchsuchen" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Lieferant, Kennung, Titel suchen …"/></label><select aria-label="Vertragsstatus" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Alle Status</option><option value="draft">Entwurf</option><option value="quoted">Angebot</option><option value="awaiting_ceo">CEO-Prüfung</option><option value="approved">Freigegeben</option><option value="active">Aktiv</option><option value="expired">Abgelaufen</option><option value="rejected">Abgelehnt</option></select></div>
      <div className="finance-contracts">{filtered.map(c=><button type="button" key={c.id} className={'finance-contract '+(selected===c.id?'selected':'')} onClick={()=>choose(c)}>
       <div className="finance-contract-top"><strong>{c.code}</strong><span>{statusLabels[c.status]||c.status}</span></div>
       <h4>{c.title}</h4><p>{c.supplier} · {typeLabels[c.type]||c.type}</p><small>{c.recurring_amount_eur===null?'Betrag noch offen':eur(c.recurring_amount_eur)+' pro Monat'} · Beginn {date(c.start)}</small>
      </button>)}</div>
      {filtered.length===0&&<p className="finance-empty">Keine passenden Verträge gefunden.</p>}
     </div>
     <div className="finance-block"><div className="eyebrow">SUPPLIER QUOTES</div><h3>Lieferantenangebote ({snapshot.quotes.length})</h3>
      {snapshot.quotes.length===0?<p className="finance-empty">Noch keine Angebote erfasst.</p>:snapshot.quotes.map(q=><article key={q.id} className="finance-item"><strong>{q.code} · {q.supplier}</strong><p>{q.description}</p><small>{eur(q.amount_eur)} · {q.status} · Gültig bis {date(q.valid_until)}</small></article>)}
     </div>
     <div className="finance-block"><div className="eyebrow">INVOICES / READ ONLY</div><h3>Lieferantenrechnungen ({snapshot.invoices.length})</h3>
      {snapshot.invoices.length===0?<p className="finance-empty">Keine Lieferantenrechnungen erfasst. Dies ist kein Nachweis über künftig anfallende Kosten.</p>:snapshot.invoices.map(i=><article key={i.id} className="finance-item"><strong>{i.invoice_key} · {i.supplier}</strong><p>{eur(i.amount_eur)} · Fällig {date(i.due_on)}</p><small>Prüfung: {i.verification_status} · Freigabe: {i.approval_status} · Zahlung: {i.payment_status}</small></article>)}
     </div>
     <div className="finance-block"><div className="finance-block-top"><div><div className="eyebrow">GENERAL LEDGER</div><h3>Firmenkonten ({snapshot.company_accounts.length})</h3></div><button type="button" className="ops-refresh" onClick={()=>setShowAccounts(!showAccounts)}>{showAccounts?'Ausblenden':'Konten anzeigen'}</button></div>
      {showAccounts&&<div className="tablewrap"><table><thead><tr><th>KONTO</th><th>BEZEICHNUNG</th><th>TYP</th><th>SALDO</th></tr></thead><tbody>
       {snapshot.company_accounts.map(a=><tr key={a.code}><td>{a.code}</td><td>{a.label}</td><td>{a.type}</td><td>{eur(a.balance_eur)}</td></tr>)}
      </tbody></table></div>}
      <p className="finance-hint">Konten mit Eigentümerkennzeichnung „private“ oder „external“ werden hier nicht eingelesen.</p>
     </div>
    </div>
    <div className="finance-editor">
     <div className="eyebrow">CONTRACT MANAGEMENT / DRAFTS</div>
     <h3>{focused?'Vertrag '+focused.code:'Neuer Vertragsentwurf'}</h3>
     {focused?.status!=='draft'&&focused!==null?<div className="finance-locked"><LockKeyhole size={16}/> Dieser Vertrag steht auf „{statusLabels[focused.status]||focused.status}“. Er kann hier nicht geändert werden. Vertragsänderungen erfordern einen separaten Freigabeprozess.</div>:null}
     <form className="finance-form" onSubmit={save}>
      <label>Lieferant<input required minLength={2} maxLength={160} value={form.supplier} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('supplier',e.target.value)} placeholder="Firma / Dienstleister"/></label>
      <label>Vertragsbezeichnung<input required minLength={5} maxLength={200} value={form.title} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('title',e.target.value)} placeholder="Leistung und Vertragszweck"/></label>
      <label>Vertragsart<select value={form.type} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('type',e.target.value)}><option value="hangar_rent">Hangarmiete</option><option value="maintenance_framework">Wartungsrahmenvertrag</option><option value="parts_supply">Ersatzteilversorgung</option><option value="other">Sonstiges</option></select></label>
      <div className="finance-form-row"><label>Geplanter Beginn<input type="date" value={form.start} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('start',e.target.value)}/></label><label>Geplantes Ende<input type="date" value={form.end} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('end',e.target.value)}/></label></div>
      <div className="finance-form-row"><label>Monatlicher Planbetrag (€)<input type="number" min={0} max={10000000} step="0.01" value={form.monthly} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('monthly',e.target.value)} placeholder="Optional"/></label><label>Zahlungsziel (Tage)<input type="number" min={0} max={365} step={1} value={form.payment_terms} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('payment_terms',e.target.value)} placeholder="Optional"/></label></div>
      <label>Entwurfstext / interne Notizen<textarea maxLength={10000} rows={6} value={form.draft_text} disabled={!!focused&&focused.status!=='draft'} onChange={e=>update('draft_text',e.target.value)} placeholder="Vertragsgegenstand, offene Nachweise, zu prüfende Konditionen …"/></label>
      <div className="finance-locked"><ShieldAlert size={16}/> Speichern führt ausschließlich zu Status „Entwurf“; keine Zahlung und keine CEO-Vertragsfreigabe.</div>
      <button type="submit" className="charter-submit" disabled={saving||!!focused&&focused.status!=='draft'}><Save size={16}/>{saving?'Speichern …':'Entwurf speichern'}</button>
     </form>
    </div>
   </div>
   <div className="ops-footer"><LockKeyhole size={14}/> Geschützte Unternehmensbuchhaltung · Keine Zahlungen oder Vertragsfreigaben im Modul.</div>
  </>}
 </section>;
}
