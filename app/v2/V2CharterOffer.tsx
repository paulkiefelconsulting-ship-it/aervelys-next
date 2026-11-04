'use client';
import {useState} from 'react';
import {CheckCircle2,ClipboardCopy,Clock3,FileCheck2,FileText,
 Landmark,LockKeyhole,PlaneTakeoff,ReceiptText,Route,ShieldCheck} from 'lucide-react';
import styles from './V2CharterOffer.module.css';

export type V2Quote={
 id:string;request_id:string;request_code:string;version:number;
 status:'offered'|'accepted'|'declined'|'expired';
 valid_until:string;accepted_at:string|null;created_at:string;
 aircraft_registration:string;aircraft_type:string;
 quoted_aircraft_position:string;origin_icao:string;destination_icao:string;
 estimated_charter_hours:number;estimated_positioning_hours:number;
 positioning_from:string|null;positioning_to:string|null;
 charter_sell_eur:number;handling_sell_eur:number;positioning_sell_eur:number;
 total_sell_eur:number;charter_cost_eur:number;positioning_cost_eur:number;
 estimated_total_cost_eur:number;estimated_margin_eur:number;
 estimated_margin_pct:number;postflight_policy:'remain_at_destination';
 customer_terms:string;
};
export type V2FinanceReview={
 request_id:string;code:string;customer_total_eur:number;quoted_cost_eur:number;
 posted_revenue_eur:number;posted_sim_cost_eur:number;planned_margin_eur:number;
 posted_sim_contribution_eur:number;sim_cost_variance_eur:number;
 postflight_aircraft_position:string|null;completed_at:string;
};
export type OfferRequest={
 code:string;customer:string;origin:string;destination:string;
 departure_at:string;pax:number;hours:number;
};
const money=(n:number)=>Number.isFinite(Number(n))?
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)):'—';
const time=(s:string|null)=>s&&Number.isFinite(Date.parse(s))?
 new Date(s).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'—';
export function CharterOffer({quote,request,companyName='AERVELYS'}:{
 quote:V2Quote|null;request:OfferRequest|null;companyName?:string
}){
 const [copyState,setCopyState]=useState('');
 if(!quote||!request)return <div className={styles.missing}>
  <FileText size={22}/><strong>Noch kein Kundenangebot kalkuliert</strong>
  <p>Sales und Dispatch müssen zuerst das Flugzeug, den Kundenflug und mögliche Positionierungskosten kalkulieren. Danach liegt hier das vollständige SIM-Angebot.</p>
 </div>;
 const positioning=Number(quote.estimated_positioning_hours)>0;
 const accepted=quote.status==='accepted';
 const labels:Record<V2Quote['status'],string>={
  offered:'Angebot an SIM-Kunde übermittelt',
  accepted:'Vom SIM-Kunden angenommen · Gesamtpreis fest',
  declined:'SIM-Kunde hat abgelehnt',
  expired:'Angebot abgelaufen'
 };
 const lines=[
  {label:`Charterflug ${request.origin} → ${request.destination}`,value:Number(quote.charter_sell_eur)},
  {label:'Handling und SIM-Catering',value:Number(quote.handling_sell_eur)},
  ...(positioning?[{label:`Positionierung ${quote.positioning_from} → ${quote.positioning_to} (0 PAX)`,
   value:Number(quote.positioning_sell_eur)}]:[])
 ];
 const clientText=[
  `${companyName} · EXECUTIVE CHARTER · SIMULATION`,
  `Angebot ${request.code} / Revision ${quote.version}`,
  `Kunde: ${request.customer}`,
  `Route: ${request.origin} → ${request.destination}`,
  `Gewünschter Abflug: ${time(request.departure_at)}`,
  `Passagiere: ${request.pax}`,
  `Vorgeschlagener Flugzeugtyp: ${quote.aircraft_type} (vorbehaltlich Verfügbarkeit)`,
  `Geplante Charterflugzeit: ${request.hours} h`,
  '',
  ...lines.map(l=>`${l.label}: ${money(l.value)}`),
  `Gesamtpreis: ${money(Number(quote.total_sell_eur))}`,
  `Gültig bis: ${time(quote.valid_until)}`,
  'Flugzeug verbleibt nach Kundenflug am Ziel. Kein pauschaler Rückferry enthalten.',
  'Preise und Gebühren sind fiktive SIM-Modellwerte. Steuerliche Behandlung nicht berechnet.',
  `Bedingungen: ${quote.customer_terms}`
 ].join('\n');
 async function copy(){
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(clientText);
   setCopyState('Angebotstext kopiert');
  }catch{setCopyState('Kopieren im Browser nicht verfügbar');}
 }
 return <section className={styles.offer} aria-label={'Charterangebot '+request.code}>
  <header className={styles.header}>
   <div><span className={styles.eyebrow}>CHARTER PROPOSAL · REV {quote.version}</span>
    <h4><FileCheck2 size={19}/> Offerte {request.code}</h4>
    <p>{request.customer} · {time(request.departure_at)} · {request.pax} PAX</p>
   </div>
   <span className={accepted?styles.accepted:styles.status}>
    {accepted?<LockKeyhole size={15}/>:<Clock3 size={15}/>}
    {labels[quote.status]}
   </span>
  </header>
  <div className={styles.trip}>
   <span>{request.origin}</span><div><PlaneTakeoff size={23}/><small>CHARTER / {request.hours} H</small></div>
   <span>{request.destination}</span>
  </div>
  <div className={styles.aircraft}><Route size={16}/>
   Angebotsgrundlage: <strong>{quote.aircraft_type}</strong>
   <span>· {quote.aircraft_registration} · Stand {quote.quoted_aircraft_position}</span>
  </div>
  <div className={styles.lines}>
   {lines.map(l=><div className={styles.line} key={l.label}>
    <span>{l.label}</span><strong>{money(l.value)}</strong></div>)}
   <div className={styles.total}><strong>Gesamtpreis für den Kunden</strong>
    <strong>{money(Number(quote.total_sell_eur))}</strong></div>
  </div>
  <div className={styles.positionNote}>
   <PlaneTakeoff size={17}/>
   <span>{positioning?
    `Ein notwendiger Leerflug ${quote.positioning_from}–${quote.positioning_to} ist bereits im Angebot enthalten (${quote.estimated_positioning_hours} h modelliert). Keine spätere automatische Nachforderung.`:
    'Für dieses Angebot ist keine zusätzliche Anflugpositionierung kalkuliert.'}
    {' '}Nach dem Kundenflug bleibt der Jet zunächst am Ziel. Ein Rückferry wird nicht pauschal berechnet.
   </span>
  </div>
  <div className={styles.validity}><Clock3 size={15}/>
   <span>Gültigkeit: {time(quote.valid_until)}</span>
   {accepted&&<strong>Preis seit {time(quote.accepted_at)} gesperrt</strong>}
  </div>
  <div className={styles.actions}>
   <button type="button" onClick={()=>void copy()}>
    <ClipboardCopy size={15}/> Angebotstext kopieren</button>
   <span role="status">{copyState}</span>
  </div>
  <details className={styles.internal}>
   <summary><Landmark size={15}/> Interne Kalkulation – nicht im Kundenangebot</summary>
   <div><span>Geschätzte Charterkosten inkl. Handling</span><strong>{money(Number(quote.charter_cost_eur))}</strong></div>
   <div><span>Geschätzte Positionierungskosten</span><strong>{money(Number(quote.positioning_cost_eur))}</strong></div>
   <div><span>Gesamte geschätzte Direktkosten</span><strong>{money(Number(quote.estimated_total_cost_eur))}</strong></div>
   <div><span>Geplanter Deckungsbeitrag vor Fixkosten</span>
    <strong>{money(Number(quote.estimated_margin_eur))} ({quote.estimated_margin_pct} %)</strong></div>
  </details>
  <footer><ShieldCheck size={15}/> Reines SIM-Angebot. Keine bestätigten Flughafentarife, Steuern, Crew-Freigaben, Slots oder realen Charterverträge.</footer>
 </section>;
}
export function FinanceReviewBoard({reviews}:{reviews:V2FinanceReview[]}){
 return <section className={styles.review} aria-label="Charter-Nachkalkulation">
  <div className={styles.reviewHead}><ReceiptText size={19}/><div>
   <span className={styles.eyebrow}>FINANCE / POST-FLIGHT CONTROL</span>
   <h4>Angebot versus SIM-Abschluss</h4>
   <p>Jeder abgeschlossene Kundenauftrag: der ursprünglich akzeptierte Preis und die tatsächlich im Spieljournal gebuchten Modellkosten.</p>
  </div></div>
  {reviews.length===0?<div className={styles.missing}>
   <FileText size={20}/><strong>Keine abgeschlossenen SIM-Charteraufträge</strong>
   <p>Sobald ein Charter abgeschlossen ist, erscheint hier die Gegenüberstellung von Angebot, geplantem Deckungsbeitrag und gebuchten SIM-Kosten.</p>
  </div>:reviews.map(r=><article className={styles.reviewRow} key={r.request_id}>
   <div className={styles.reviewTitle}><strong>{r.code}</strong>
    <span>SIM-Abschluss {time(r.completed_at)}</span></div>
   <div className={styles.reviewGrid}>
    <div><small>Fixierter Kundenpreis</small><strong>{money(Number(r.customer_total_eur))}</strong></div>
    <div><small>Ursprüngliche Plankosten</small><strong>{money(Number(r.quoted_cost_eur))}</strong></div>
    <div><small>Gebuchte SIM-Kosten</small><strong>{money(Number(r.posted_sim_cost_eur))}</strong></div>
    <div><small>Kostenabweichung</small><strong>{money(Number(r.sim_cost_variance_eur))}</strong></div>
    <div><small>Geplanter Deckungsbeitrag</small><strong>{money(Number(r.planned_margin_eur))}</strong></div>
    <div className={styles.finalContribution}><small>Gebuchter SIM-Deckungsbeitrag</small>
     <strong>{money(Number(r.posted_sim_contribution_eur))}</strong></div>
   </div>
  </article>)}
  <div className={styles.reviewCaution}><CheckCircle2 size={15}/>
   Preisbindung gilt für die SIM-Kundenrechnung. Verbuchte Kosten stammen derzeit aus geplanten SIM-Flugwerten, nicht aus tatsächlichen Tankbelegen oder MSFS-Flugdaten. Fixkosten und Steuern sind nicht eingerechnet.</div>
 </section>;
}
