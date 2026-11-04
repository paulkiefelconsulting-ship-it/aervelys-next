'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,ArrowLeft,ArrowRight,BriefcaseBusiness,Building2,CheckCircle2,
 ChevronRight,CircleDollarSign,ClipboardCheck,Clock3,CloudOff,Coins,FileText,
 Gauge,Handshake,LayoutDashboard,LoaderCircle,Menu,Plane,PlaneTakeoff,
 Plus,RefreshCw,Route,Settings2,ShieldCheck,Sparkles,Users,Wallet,X} from 'lucide-react';
import styles from './V2AirlineCockpit.module.css';
import V2OperationsFoundation from './V2OperationsFoundation';
import V2SimbriefButton from './V2SimbriefButton';
import {CharterOffer,FinanceReviewBoard,type V2Quote,type V2FinanceReview}
 from './V2CharterOffer';

type Department='dashboard'|'commercial'|'operations'|'myflights'|'finance'|'administration';
type Status='new'|'quoted'|'accepted'|'declined'|'planned'|'ready'|'in_flight'|'completed';
type Company={id:string;name:string;home_icao:string;cash_eur:number;opening_cash_eur:number};
type Staff={id:string;name:string;role:string;rating:string|null;salary_eur:number;active:boolean};
type Aircraft={id:string;registration:string;type:string;seats:number;current_icao:string;home_icao:string;hourly_cost_eur:number;status:string};
type Charter={id:string;code:string;customer:string;reason:string;origin:string;destination:string;
 departure_at:string;pax:number;hours:number;budget_eur:number;status:Status;
 quote_eur:number|null;cost_eur:number|null;aircraft_registration:string|null;
 captain_name:string|null;pilot_mode:'ceo'|'virtual';completed_at:string|null};
type Event={id:number;request_id:string|null;actor:string;kind:string;note:string;at:string};
type Ledger={id:string;request_id:string;kind:'revenue'|'cost';category:string;amount_eur:number;at:string};
type Ferry={id:string;request_id:string;request_code:string;
 aircraft_registration:string;aircraft_type:string;captain_name:string;
 origin:string;destination:string;hours:number;cost_eur:number;
 pilot_mode:'ceo'|'virtual';status:'planned'|'in_flight'|'arrived'|'linked';
 completed_at:string|null};
type Snapshot={initialized:boolean;company:Company|null;staff:Staff[];aircraft:Aircraft[];
 requests:Charter[];ferries:Ferry[];quotes:V2Quote[];finance_reviews:V2FinanceReview[];events:Event[];ledger:Ledger[];
 simulation_only:true;real_flights_modified:0;financial_bank_transactions:0};
type Ack={simulation_only:true;[key:string]:unknown};
const navigation:{id:Department;title:string;eyebrow:string;icon:typeof Plane}[]=[
 {id:'dashboard',title:'CEO Cockpit',eyebrow:'COMMAND',icon:LayoutDashboard},
 {id:'commercial',title:'Commercial',eyebrow:'SALES & CLIENTS',icon:Handshake},
 {id:'operations',title:'Flight Operations',eyebrow:'DISPATCH & FLEET',icon:PlaneTakeoff},
 {id:'myflights',title:'My Flights',eyebrow:'FLY OR DELEGATE',icon:Gauge},
 {id:'finance',title:'Finance',eyebrow:'SIM BUSINESS',icon:Wallet},
 {id:'administration',title:'Airline Administration',eyebrow:'PEOPLE & RULES',icon:Settings2}
];
const phases:Record<Status,{label:string;className:string}>={
 new:{label:'Neue Anfrage',className:'new'},
 quoted:{label:'Angebot erstellt',className:'quoted'},
 accepted:{label:'Kunde bestätigt',className:'accepted'},
 declined:{label:'Abgelehnt',className:'declined'},
 planned:{label:'Disponiert',className:'planned'},
 ready:{label:'Flug bereit',className:'ready'},
 in_flight:{label:'In Durchführung',className:'inflight'},
 completed:{label:'Abgeschlossen',className:'completed'}
};
const staffRoles:Record<string,string>={
 sales:'Sales & Charter',dispatch:'Flight Dispatch',
 chief_pilot:'Chief Pilot',finance:'Finance & Controlling',pilot:'Flight Crew'
};
const euro=(n:number|null|undefined)=>
 typeof n==='number'&&Number.isFinite(n)?
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n):'—';
const timestamp=(value:string)=>
 Number.isFinite(Date.parse(value))?
 new Date(value).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'—';
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase-Browserkonfiguration fehlt.');
 return createBrowserClient(url,key);
}
function StatusPill({status}:{status:Status}){
 return <span className={styles.statusPill} data-status={phases[status].className}>
  <span className={styles.statusDot}/>{phases[status].label}
 </span>;
}
function AircraftMarker({registration}:{registration:string|null}){
 return <span className={styles.aircraftMarker}>{registration||'Noch nicht zugewiesen'}</span>;
}
export default function V2AirlineCockpit(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [dept,setDept]=useState<Department>('dashboard');
 const [selected,setSelected]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [mobileNav,setMobileNav]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  try{
   const r=await client().rpc('aervelys_v2_overview');
   const value=r.data as Snapshot|null;
   if(r.error||!value||value.simulation_only!==true||value.real_flights_modified!==0||
     value.financial_bank_transactions!==0||!Array.isArray(value.requests)||
     !Array.isArray(value.staff)||!Array.isArray(value.aircraft)||
     !Array.isArray(value.ledger)||!Array.isArray(value.events)||
     !Array.isArray(value.ferries)||!Array.isArray(value.quotes)||
     !Array.isArray(value.finance_reviews))
    throw Error(r.error?.message||'Unerwartete Airline-Daten.');
   setData(value);setError('');
  }catch(e){
   setError(e instanceof Error?e.message:'AERVELYS V2 ist gerade nicht erreichbar.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const action=useCallback(async(label:string,fn:string,params?:Record<string,unknown>)=>{
  if(busy)return false;
  setBusy(label);setError('');setNotice('');
  try{
   const r=await client().rpc(fn,params||{});
   const a=r.data as Ack|null;
   if(r.error||!a||a.simulation_only!==true)
    throw Error(r.error?.message||'V2-Aktion nicht bestätigt.');
   await refresh();
   setNotice(label+' erfolgreich. Alle Ergebnisse sind ausschließlich Simulation.');
   return true;
  }catch(e){
   setError(e instanceof Error?e.message:'Aktion konnte nicht durchgeführt werden.');
   return false;
  }finally{setBusy('');}
 },[busy,refresh]);
 const requests=data?.requests||[];
 const fleet=data?.aircraft||[];
 const staff=data?.staff||[];
 const events=data?.events||[];
 const ledger=data?.ledger||[];
 const quotes=data?.quotes||[];
 const financeReviews=data?.finance_reviews||[];
 const ferries=data?.ferries||[];
 const activeFerries=ferries.filter(f=>f.status==='planned'||f.status==='in_flight'||f.status==='arrived');
 const flightableFerries=ferries.filter(f=>f.status==='planned'||f.status==='in_flight');
 const company=data?.company||null;
 const active=requests.filter(r=>r.status!=='completed'&&r.status!=='declined');
 const ready=requests.filter(r=>r.status==='ready'||r.status==='in_flight');
 const pending=requests.filter(r=>['new','quoted','accepted','planned'].includes(r.status));
 const completed=requests.filter(r=>r.status==='completed');
 const totalRevenue=ledger.filter(l=>l.kind==='revenue').reduce((s,l)=>s+Number(l.amount_eur),0);
 const totalCost=ledger.filter(l=>l.kind==='cost').reduce((s,l)=>s+Number(l.amount_eur),0);
 const monthlyPayroll=staff.filter(s=>s.active).reduce((v,s)=>v+Number(s.salary_eur),0);
 const spotlight=useMemo(()=>requests.find(r=>r.id===selected)||requests[0]||null,[requests,selected]);
 const page=navigation.find(x=>x.id===dept)!;
 function navigate(target:Department){
  setDept(target);setMobileNav(false);setError('');setNotice('');
 }
 async function generate(){await action('Kundenanfrage erstellt','aervelys_v2_generate_inquiry');}
 async function process(){await action('Fiktive Mitarbeiter haben ihre Aufgaben bearbeitet','aervelys_v2_run_office');}
 async function initialize(){await action('Airline eingerichtet','aervelys_v2_initialize');}
 async function choose(id:string,mode:'ceo'|'virtual'){
  await action(mode==='ceo'?'Flug für dich reserviert':'Flug an virtuellen Piloten übergeben',
   'aervelys_v2_choose_pilot',{p_request_id:id,p_mode:mode});
 }
 async function chooseFerry(id:string,mode:'ceo'|'virtual'){
  await action(mode==='ceo'?'Ferry-Flug für dich reserviert':'Ferry-Flug an virtuellen Piloten vergeben',
   'aervelys_v2_choose_ferry_pilot',{p_ferry_id:id,p_mode:mode});
 }
 async function ferryMove(id:string,step:'start'|'complete'){
  if(step==='complete'&&typeof window!=='undefined'&&!window.confirm(
   'Leeren Positionierungsflug abschließen? Der Jet wird zum Zielflughafen bewegt und die geschätzten Betriebskosten ohne Chartereinnahmen gebucht. Eine echte MSFS-Landung ist noch nicht bestätigt.'
  ))return;
  await action(step==='start'?'Ferry-Flug gestartet':'Ferry-Flug als angekommen eingetragen',
   'aervelys_v2_ferry_action',{p_ferry_id:id,p_action:step});
 }
 async function move(id:string,step:'start'|'complete'){
  if(step==='complete'&&typeof window!=='undefined'&&!window.confirm(
    'SIM-Flug als abgeschlossen bestätigen? Es werden ausschließlich fiktive Erlöse und Modellkosten erfasst. Die tatsächliche MSFS-Landung wurde noch nicht nachgewiesen.'
  ))return;
  await action(step==='start'?'SIM-Flug gestartet':'SIM-Flug wirtschaftlich abgeschlossen',
    'aervelys_v2_flight_action',{p_request_id:id,p_action:step});
 }
 const insight=[
  {title:'SIM-LIQUIDITÄT',value:company?euro(Number(company.cash_eur)):'—',
   caption:'Anfangskapital + abgeschlossene SIM-Flüge',icon:Wallet},
  {title:'OFFENE AUFTRÄGE',value:String(active.length),
   caption:pending.length+' in Vertriebs-/Dispatchbearbeitung',icon:BriefcaseBusiness},
  {title:'FLÜGE ZU ENTSCHEIDEN',value:String(ready.length+flightableFerries.length),
   caption:ready.length+' Charter · '+flightableFerries.length+' Positionierungen',icon:PlaneTakeoff},
  {title:'SIM-ERGEBNIS',value:euro(totalRevenue-totalCost),
   caption:'Nur abgeschlossene Flüge; keine Fixkosten',icon:CircleDollarSign}
 ];
 return <div className={styles.shell}>
  <aside className={[styles.sidebar,mobileNav?styles.sidebarOpen:''].join(' ')}>
   <div className={styles.brand}>
    <div className={styles.mark}><PlaneTakeoff size={22}/></div>
    <div><strong>AERVELYS</strong><span>NEXT 2.0 · BUSINESS AIRLINE</span></div>
    <button className={styles.mobileClose} type="button" aria-label="Menü schließen" onClick={()=>setMobileNav(false)}><X size={18}/></button>
   </div>
   <div className={styles.navGroup}>AIRLINE MANAGEMENT</div>
   <nav className={styles.nav} aria-label="AERVELYS 2.0 Hauptnavigation">
    {navigation.map(item=>{
     const Icon=item.icon;
     return <button type="button" key={item.id} onClick={()=>navigate(item.id)}
      className={dept===item.id?styles.navActive:styles.navItem}
      aria-current={dept===item.id?'page':undefined}>
      <Icon size={19}/><span><strong>{item.title}</strong><small>{item.eyebrow}</small></span>
      {item.id==='commercial'&&pending.length>0&&<b>{pending.length}</b>}
     </button>;
    })}
   </nav>
   <div className={styles.sideBottom}>
    <div className={styles.simLabel}><ShieldCheck size={15}/> GESCHÜTZTE SIMULATION</div>
    <p>Der Airline-Kern von V2 ist unabhängig von NEXT 1.0 und seiner Windows-Bridge.</p>
    <a href="/" className={styles.legacy}><ArrowLeft size={15}/> Bisherige NEXT-Version</a>
   </div>
  </aside>
  {mobileNav&&<button className={styles.backdrop} type="button" aria-label="Menü schließen" onClick={()=>setMobileNav(false)}/>}
  <main className={styles.main}>
   <div className={styles.topbar}>
    <div className={styles.topLeft}>
     <button type="button" className={styles.mobileMenu} onClick={()=>setMobileNav(true)}
      aria-label="Navigation öffnen"><Menu size={21}/></button>
     <span>FLIGHT BUSINESS SYSTEM</span><ChevronRight size={14}/><strong>{page.title}</strong>
    </div>
    <div className={styles.topRight}>
     <span className={styles.testMode}><span/> SIMULATION ONLY</span>
     <button type="button" aria-label="Daten aktualisieren" className={styles.iconBtn}
      disabled={!!busy} onClick={()=>void refresh()}><RefreshCw size={17}/></button>
    </div>
   </div>
   <div className={styles.content}>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    {notice&&<div className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</div>}
    {loading&&!data?<div className={styles.loading}><LoaderCircle size={25}/> Airline-Daten werden geladen …</div>:
     !data?.initialized?<section className={styles.onboard}>
      <div className={styles.onboardOrb}><PlaneTakeoff size={58}/></div>
      <span className={styles.eyebrow}><Sparkles size={16}/> THE NEW AERVELYS</span>
      <h1>Build an airline.<br/><em>Run the business.</em></h1>
      <p>Starte deine neue virtuelle Business-Airline mit eigenem Kapital, fiktiven Mitarbeitern, zwei Flugzeugen und einem geschützten Geschäftsprozess vom Charterangebot bis zur Abrechnung.</p>
      <div className={styles.onboardFacts}>
       <span><Users size={16}/> 6 virtuelle Mitarbeiter</span>
       <span><Plane size={16}/> 2 SIM-Flugzeuge</span>
       <span><Coins size={16}/> 180.000 € Spielkapital</span>
      </div>
      <button type="button" className={styles.heroButton} disabled={!!busy} onClick={()=>void initialize()}>
       {busy?<LoaderCircle size={17}/>:<ArrowRight size={17}/>} AERVELYS 2.0 gründen
      </button>
      <small>Bestehende NEXT-1.0-Daten bleiben unverändert. Das Startkapital und sämtliche Rollen sind fiktiv.</small>
     </section>:<>
      <div className={styles.pageHeading}>
       <div><div className={styles.eyebrow}>AERVELYS NEXT / {page.eyebrow}</div>
        <h1>{page.title}</h1>
        <p>{dept==='dashboard'?'Deine Airline arbeitet. Du entscheidest, was du selbst fliegst.':
          dept==='commercial'?'Von der Kundenanfrage zum verbindlichen SIM-Auftrag.':
          dept==='operations'?'Flugzeugpositionen, Crewzuordnung und Dispatch-Entscheidungen.':
          dept==='myflights'?'Wähle zwischen eigenem Cockpit und virtuellem Piloten.':
          dept==='finance'?'Transparente modellierte Erlöse, Betriebskosten und Liquidität.':
          'Dein Team, dein Unternehmen, deine Spielregeln.'}</p></div>
       <span className={styles.pageTag}><Activity size={16}/> {company?.name} · {company?.home_icao}</span>
      </div>
      {dept==='dashboard'&&<>
       <section className={styles.hero}>
        <div className={styles.heroText}>
         <span className={styles.heroEyebrow}><Sparkles size={14}/> AIRLINE BUSINESS ENGINE · V2.2</span>
         <h2>The airline runs.<br/><em>You take command.</em></h2>
         <p>Dein virtuelles Unternehmen organisiert Sales, Dispatch, Crew und Finanzen. Sobald ein Flug bereit ist, kannst du ihn selbst übernehmen.</p>
         <div className={styles.heroActions}>
          <button type="button" onClick={()=>void generate()} disabled={!!busy}>
           <Plus size={16}/> Kundenanfrage erzeugen
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!!busy||pending.length===0}
           onClick={()=>void process()}><Users size={16}/> Mitarbeiter arbeiten lassen</button>
         </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
         <div className={styles.ringOuter}/><div className={styles.ringMiddle}/>
         <div className={styles.ringCore}><PlaneTakeoff size={45}/></div>
         <span className={styles.visualTop}>AERVELYS / OPS</span>
         <span className={styles.visualBottom}>HOME BASE · EDAZ</span>
        </div>
       </section>
       <div className={styles.kpis}>{insight.map(k=>{const Icon=k.icon;return <div className={styles.kpi} key={k.title}>
        <div><span>{k.title}</span><Icon size={18}/></div><strong>{k.value}</strong><small>{k.caption}</small>
       </div>;})}</div>
       <div className={styles.columns}>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>WORK QUEUE</span><h3>Was die Airline gerade beschäftigt</h3></div>
          <button className={styles.textButton} type="button" onClick={()=>navigate('commercial')}>Alle Aufträge <ArrowRight size={14}/></button></div>
         {requests.length===0?<EmptyState icon={FileText} title="Noch keine Charteranfragen"
          description="Erzeuge die erste fiktive Kundenanfrage, danach können die Mitarbeiter Angebote und Flugpläne bearbeiten."/>:
          requests.slice(0,5).map(r=><button className={styles.quickFlight} key={r.id}
           type="button" onClick={()=>{setSelected(r.id);navigate('commercial');}}>
           <div><small>{r.code} · {r.customer}</small><strong>{r.origin} <span>→</span> {r.destination}</strong></div>
           <StatusPill status={r.status}/><ChevronRight size={17}/>
          </button>)}
        </section>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>DECISION LOG</span><h3>Deine virtuellen Mitarbeiter</h3></div>
          <Users size={19}/></div>
         {events.length===0?<EmptyState icon={Users} title="Unternehmen gegründet"
          description="Die ersten dokumentierten Mitarbeiterentscheidungen erscheinen hier."/>:
          <div className={styles.feed}>{events.slice(0,7).map(e=><div key={e.id} className={styles.feedItem}>
           <i/><div><strong>{e.actor}</strong><p>{e.note}</p><small>{timestamp(e.at)}</small></div></div>)}</div>}
        </section>
       </div>
       {activeFerries.length>0&&<section className={styles.callout}>
        <Route size={22}/><div><strong>{activeFerries.length} Positionierungsflug/-flüge sind offen.</strong>
         <p>Ein Businessjet muss erst an den Abflugort des Kunden gelangen. Leerflüge werden separat mit Kosten und ohne Erlöse geplant.</p></div>
        <button type="button" onClick={()=>navigate('myflights')}>Ferry Flights <ArrowRight size={16}/></button>
       </section>}
       {ready.length>0&&<section className={styles.callout}>
        <PlaneTakeoff size={22}/><div><strong>{ready.length} Flugauftrag/Flugaufträge stehen bereit.</strong>
         <p>Du kannst einen dieser Aufträge selbst übernehmen oder delegiert lassen.</p></div>
        <button type="button" onClick={()=>navigate('myflights')}>Meine Flüge <ArrowRight size={16}/></button>
       </section>}
      </>}
      {dept==='commercial'&&<>
       <div className={styles.actionBand}>
        <div><h3>Charter Desk</h3><p>Virtuelle Anfragen werden anhand transparenter Kostensätze kalkuliert. Ein Kunde sagt zu oder lehnt ab, wenn sein Budget nicht reicht.</p></div>
        <div className={styles.bandActions}>
         <button type="button" disabled={!!busy} onClick={()=>void generate()}><Plus size={16}/> Neue Anfrage</button>
         <button type="button" disabled={!!busy||pending.length===0} className={styles.altButton}
          onClick={()=>void process()}><Users size={16}/> Büroprozess ausführen</button>
        </div>
       </div>
       <div className={styles.columns}>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>CUSTOMER PIPELINE</span><h3>{requests.length} Kundenfälle</h3></div></div>
         {requests.length===0?<EmptyState icon={Handshake} title="Das Charterpostfach ist leer"
          description="Mit „Neue Anfrage“ erzeugst du eine fiktive Kundennachfrage für den ersten Geschäftsprozess."/>:
          <div className={styles.requestList}>{requests.map(r=><button type="button" key={r.id}
           className={spotlight?.id===r.id?styles.requestSelected:styles.request}
           onClick={()=>setSelected(r.id)}>
           <div><strong>{r.origin} → {r.destination}</strong><small>{r.customer} · {r.code}</small></div>
           <StatusPill status={r.status}/>
          </button>)}</div>}
        </section>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>CUSTOMER FILE</span><h3>Auftragsakte</h3></div><FileText size={19}/></div>
         {!spotlight?<EmptyState icon={FileText} title="Noch kein Auftrag ausgewählt"
          description="Wähle eine Anfrage links aus oder erzeuge eine neue."/>:
          <div className={styles.details}>
           <div className={styles.bigRoute}>{spotlight.origin} <ArrowRight size={20}/> {spotlight.destination}</div>
           <StatusPill status={spotlight.status}/>
           <div className={styles.detailGrid}>{[
            ['Kunde',spotlight.customer],['Reisegrund',spotlight.reason],
            ['Abflugwunsch',timestamp(spotlight.departure_at)],
            ['Passagiere',String(spotlight.pax)],
            ['Geplante Blockzeit',spotlight.hours+' h'],
            ['Maximalbudget',euro(Number(spotlight.budget_eur))],
            ['SIM-Angebot',euro(spotlight.quote_eur)],
            ['Modellierte Kosten',euro(spotlight.cost_eur)]
           ].map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>
           <CharterOffer
            quote={quotes.find(q=>q.request_id===spotlight.id)||null}
            request={{code:spotlight.code,customer:spotlight.customer,
             origin:spotlight.origin,destination:spotlight.destination,
             departure_at:spotlight.departure_at,pax:spotlight.pax,hours:spotlight.hours}}
            companyName={company?.name||'AERVELYS'}/>
           <div className={styles.softNote}>Sales kalkuliert den gesamten SIM-Kundenpreis einschließlich notwendiger Anflugpositionierungen. Der angenommene Preis ist in der Datenbank gesperrt; Dispatch darf nicht stillschweigend nachberechnen. Generative Kundengespräche sind noch nicht vorhanden.</div>
           {['new','quoted','accepted','planned'].includes(spotlight.status)&&
            <button type="button" disabled={!!busy} className={styles.fullButton} onClick={()=>void process()}>
             <Users size={16}/> Mitarbeiterprozess fortsetzen</button>}
          </div>}
        </section>
       </div>
      </>}
      {dept==='operations'&&<>
       <div className={styles.softNote}><strong>Flottenfreigabe:</strong> Die Phenom 300E ist derzeit für Charterangebote und Charterpositionierungen gesperrt. Bestehende Mitarbeiter und Flugzeuge sowie langfristige Dienstplanung findest du unter Airline Administration → Operations Foundation. Der laufende CJ4-SIM-Auftrag bleibt unverändert.</div>
       <div className={styles.kpis}>
        {[
         {title:'FLOTTE',value:String(fleet.length),caption:'Simulierte Businessjets',icon:Plane},
         {title:'DISPONIERT',value:String(requests.filter(r=>['planned','ready','in_flight'].includes(r.status)).length),
          caption:'Offene Flugplanungen',icon:Route},
         {title:'WARTEN AUF DISPATCH',value:String(requests.filter(r=>r.status==='accepted').length),
          caption:'Kapazität/Standort prüfen',icon:Clock3},
         {title:'FLUGABSCHLÜSSE',value:String(completed.length),caption:'Virtuelle abgeschlossene Flüge',icon:ClipboardCheck}
        ].map(k=>{const I=k.icon;return <div className={styles.kpi} key={k.title}>
         <div><span>{k.title}</span><I size={18}/></div><strong>{k.value}</strong><small>{k.caption}</small>
        </div>;})}
       </div>
       <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>AIRCRAFT MANAGEMENT</span><h3>Flugzeugpositionen</h3></div><Plane size={20}/></div>
        <div className={styles.fleetList}>{fleet.map(a=><div className={styles.fleetCard} key={a.id}>
         <div className={styles.fleetMark}><Plane size={24}/></div>
         <div><small>{a.registration} · {a.seats} Sitze</small><strong>{a.type}</strong>
          <span>Aktueller Standort: <b>{a.current_icao}</b> · Basis {a.home_icao}</span></div>
         <div className={styles.fleetPrice}><strong>{euro(Number(a.hourly_cost_eur))}</strong><small>Modellkosten / Stunde</small></div>
        </div>)}</div>
       </section>
       <section className={styles.panel}>
        <div className={styles.panelTitle}>
         <div><span className={styles.eyebrow}>POSITIONING / FERRY FLIGHTS</span>
          <h3>Leere Flugzeugpositionierungen</h3></div><Route size={19}/>
        </div>
        {activeFerries.length===0?
         <EmptyState icon={Route} title="Keine Positionierungsflüge offen"
          description="Dispatch versucht zunächst ein freies Flugzeug am Kundenabflugort zu finden. Ist nur ein Jet an einem anderen Standort verfügbar, plant das System einen eigenen Leerflug."/>:
         activeFerries.map(f=><div className={styles.ferryRow} key={f.id}>
          <div><span className={styles.ferryBadge}>LEERFLUG · 0 PAX</span>
           <strong>{f.origin} <ArrowRight size={14}/> {f.destination}</strong>
           <small>{f.aircraft_registration} · {f.captain_name} · {f.hours} h geschätzt</small>
           <small>Charter: {f.request_code}</small></div>
          <div className={styles.ferryRight}>
           <strong>{euro(Number(f.cost_eur))}</strong>
           <span>{f.status==='planned'?'Geplant':
            f.status==='in_flight'?'In Durchführung':'Am Abflugort eingetroffen'}</span>
           <button type="button" onClick={()=>navigate('myflights')}>Cockpit öffnen <ArrowRight size={14}/></button>
          </div>
         </div>)}
        <div className={styles.softNote}>Blockzeiten und Ferry-Kosten sind konservative SIM-Schätzungen aus Flughafenpositionen und Flugzeugkostensätzen. Kein echter Flugplan, kein NOTAM-/Wettercheck.</div>
       </section>
       <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>DISPATCH DESK</span><h3>Aktuelle Flugplanung</h3></div>
         <button type="button" disabled={!!busy||pending.length===0} className={styles.textButton}
          onClick={()=>void process()}><RefreshCw size={15}/> Dispatch ausführen</button></div>
        {requests.filter(r=>['accepted','planned','ready','in_flight'].includes(r.status)).length===0?
         <EmptyState icon={Route} title="Noch keine bestätigten Flugaufträge" description="Sales muss zunächst einen bezahlbaren Charterauftrag gewinnen."/>:
         requests.filter(r=>['accepted','planned','ready','in_flight'].includes(r.status)).map(r=>
          <div className={styles.dispatchLine} key={r.id}>
           <div><small>{r.code}</small><strong>{r.origin} → {r.destination}</strong>
            <span>{r.pax} PAX · {r.hours} h · {timestamp(r.departure_at)}</span></div>
           <div><AircraftMarker registration={r.aircraft_registration}/>
            <small>{r.captain_name||'Crew noch nicht zugewiesen'}</small></div>
           <StatusPill status={r.status}/>
          </div>)}
        <div className={styles.softNote}>Dispatch respektiert Standorte, Sitze, Musterberechtigungen und exklusive Ressourcenreservierungen. Erforderliche Positionierungen werden als separate Leerflüge geplant. Tages- und Crew-Dienstzeiten, Slots und echte Flugrouten folgen später.</div>
       </section>
      </>}
      {dept==='myflights'&&<>
       <div className={styles.actionBand}>
        <div><h3>Choose your flight</h3><p>Du bestimmst, ob du einen Auftrag selbst im Simulator fliegst oder ein fiktiver Pilot übernimmt.</p></div>
        <div className={styles.bandActions}><button type="button" onClick={()=>navigate('operations')} className={styles.altButton}>
         <Route size={16}/> Dispatch anzeigen</button></div>
       </div>
       <section className={styles.panel}>
        <div className={styles.panelTitle}>
         <div><span className={styles.eyebrow}>FLIGHT SELECTION / POSITIONING</span>
          <h3>Positionierungsflüge · leer und kostenpflichtig</h3></div>
         <Route size={20}/>
        </div>
        {flightableFerries.length===0?
         <EmptyState icon={Route} title="Derzeit keine offenen Leerflüge"
          description="Wenn Dispatch einen Jet an einem anderen Flughafen benötigt, erscheint der echte SIM-Positionierungsauftrag hier. Du kannst auch diesen Flug selbst fliegen."/>:
         <div className={styles.ferryGrid}>{flightableFerries.map(f=>
          <article className={styles.ferryTask} key={f.id}>
           <div className={styles.ferryTaskHead}>
            <span className={styles.ferryBadge}>FERRY / 0 PAX</span>
            <span>{f.status==='planned'?'GEPLANT':'SIM-FLUG LÄUFT'}</span>
           </div>
           <div className={styles.flightRoute}><strong>{f.origin}</strong>
            <span><PlaneTakeoff size={23}/></span><strong>{f.destination}</strong></div>
           <div className={styles.flightFacts}>
            <span>{f.aircraft_registration}</span>
            <span>{f.hours} h geschätzt</span>
            <span>Charter {f.request_code}</span>
           </div>
           <V2SimbriefButton leg={{
            origin:f.origin,destination:f.destination,aircraftType:f.aircraft_type,
            estimatedHours:Number(f.hours),passengers:0
           }}/>
           <div className={styles.ferryEconomics}>
            <span>Geschätzte Positionierungskosten</span>
            <strong>−{euro(Number(f.cost_eur))}</strong>
           </div>
           {f.status==='planned'?<>
            <div className={styles.choiceRow}>
             <button type="button" disabled={!!busy}
              className={f.pilot_mode==='ceo'?styles.choiceActive:styles.choice}
              aria-pressed={f.pilot_mode==='ceo'} onClick={()=>void chooseFerry(f.id,'ceo')}>
              Ich fliege den Leerflug</button>
             <button type="button" disabled={!!busy}
              className={f.pilot_mode==='virtual'?styles.choiceActive:styles.choice}
              aria-pressed={f.pilot_mode==='virtual'} onClick={()=>void chooseFerry(f.id,'virtual')}>
              Virtueller Pilot</button>
            </div>
            <button type="button" className={styles.fullButton}
             disabled={!!busy} onClick={()=>void ferryMove(f.id,'start')}>
             <PlaneTakeoff size={16}/> SIM-Leerflug starten</button>
           </>:<button type="button" className={styles.fullButton}
             disabled={!!busy} onClick={()=>void ferryMove(f.id,'complete')}>
             <CheckCircle2 size={16}/> Leerflug-Ankunft bestätigen</button>}
           <p>Eine Bestätigung ist derzeit manuell und keine aus MSFS verifizierte Landung.</p>
          </article>)}</div>}
        {activeFerries.some(f=>f.status==='arrived')&&
         <div className={styles.ferryArrived}>
          <CheckCircle2 size={18}/>
          <div><strong>Positionierung abgeschlossen</strong>
           <p>Das Flugzeug ist angekommen. Starte den Mitarbeiterprozess, damit Dispatch den eigentlichen Kundencharter freigibt.</p></div>
          <button type="button" disabled={!!busy} onClick={()=>void process()}>Dispatch fortsetzen</button>
         </div>}
       </section>
       {ready.length===0?<EmptyState icon={PlaneTakeoff} title="Noch keine Flugaufträge bereit"
        description="Erzeuge im Commercial-Bereich eine Anfrage und lasse Sales und Dispatch arbeiten. Bereite anschließend deinen ersten Flug vor."/>:
        <div className={styles.flightCards}>{ready.map(r=><article key={r.id} className={styles.flightCard}>
         <div className={styles.flightTop}><span>{r.code} · {r.customer}</span><StatusPill status={r.status}/></div>
         <div className={styles.flightRoute}><strong>{r.origin}</strong><span><PlaneTakeoff size={25}/></span><strong>{r.destination}</strong></div>
         <div className={styles.flightFacts}>
          <span>{r.aircraft_registration||'Kein Flugzeug'}</span><span>{r.pax} PAX</span><span>{r.hours} h geplant</span>
         </div>
         <div className={styles.flightCrew}><Users size={16}/>
          <span>{r.pilot_mode==='ceo'?'DU ÜBERNIMMST DIESEN FLUG':'VIRTUELLER PILOT: '+(r.captain_name||'unbekannt')}</span></div>
         <V2SimbriefButton leg={{
          origin:r.origin,destination:r.destination,
          aircraftType:fleet.find(a=>a.registration===r.aircraft_registration)?.type||'',
          estimatedHours:Number(r.hours),passengers:r.pax,departureAt:r.departure_at
         }}/>
         {r.status==='ready'?<>
          <div className={styles.choiceRow}>
           <button type="button" disabled={!!busy} aria-pressed={r.pilot_mode==='ceo'}
            className={r.pilot_mode==='ceo'?styles.choiceActive:styles.choice}
            onClick={()=>void choose(r.id,'ceo')}>Ich fliege selbst</button>
           <button type="button" disabled={!!busy} aria-pressed={r.pilot_mode==='virtual'}
            className={r.pilot_mode==='virtual'?styles.choiceActive:styles.choice}
            onClick={()=>void choose(r.id,'virtual')}>Virtueller Pilot</button>
          </div>
          <button type="button" className={styles.fullButton} disabled={!!busy}
           onClick={()=>void move(r.id,'start')}><PlaneTakeoff size={17}/> SIM-Flug starten</button>
         </>:<button type="button" className={styles.fullButton} disabled={!!busy}
          onClick={()=>void move(r.id,'complete')}><CheckCircle2 size={17}/> SIM-Flugabschluss bestätigen</button>}
         <p>MSFS-Integration und Lizenzprüfung werden erst in einer späteren Version angeschlossen. Kein automatischer Start- oder Landungsnachweis.</p>
        </article>)}</div>}
       {completed.length>0&&<section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>SIM FLIGHT HISTORY</span><h3>Abgeschlossene Flüge</h3></div></div>
        {completed.slice(0,8).map(r=><div key={r.id} className={styles.historyLine}>
         <span>{r.origin} → {r.destination}</span><span>{r.aircraft_registration}</span><strong>{euro(r.quote_eur)}</strong>
        </div>)}
       </section>}
      </>}
      {dept==='finance'&&<>
       <FinanceReviewBoard reviews={financeReviews}/>
       <div className={styles.kpis}>
        {[
         {title:'SIM-BANKBESTAND',value:company?euro(Number(company.cash_eur)):'—',
          caption:'Fiktiver Kontostand',icon:Wallet},
         {title:'GEBUCHTE SIM-ERLÖSE',value:euro(totalRevenue),
          caption:'Nur abgeschlossene Flüge',icon:Coins},
         {title:'MODELLIERTE FLUGKOSTEN',value:euro(totalCost),
          caption:'Schätzwerte, keine Belege',icon:CircleDollarSign},
         {title:'ROHER FLUGBEITRAG',value:euro(totalRevenue-totalCost),
          caption:'Vor Fixkosten, Steuern, Finanzierung',icon:Activity}
        ].map(k=>{const I=k.icon;return <div className={styles.kpi} key={k.title}>
         <div><span>{k.title}</span><I size={18}/></div><strong>{k.value}</strong><small>{k.caption}</small>
        </div>;})}
       </div>
       <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>SIM LEDGER</span><h3>Nachvollziehbare Flugabrechnungen</h3></div><FileText size={18}/></div>
        {ledger.length===0?<EmptyState icon={Coins} title="Noch keine Buchungen"
         description="Erst ein bestätigter SIM-Flugabschluss erzeugt Erlös und Modellkosten. Angebote zählen nicht als Umsatz."/>:
         ledger.map(l=><div key={l.id} className={styles.ledgerLine}>
          <div><strong>{l.kind==='revenue'?'Chartererlös':l.category==='positioning'?'Positionierungskosten':'Flugbetriebskosten'}</strong>
           <small>{timestamp(l.at)} · {requests.find(r=>r.id===l.request_id)?.code||'SIM'}</small></div>
          <strong className={l.kind==='revenue'?styles.positive:styles.negative}>
           {l.kind==='revenue'?'+':'−'}{euro(Number(l.amount_eur))}</strong>
         </div>)}
       </section>
       <div className={styles.softNote}>Wirtschaftlicher Rechenkern V2.2: Anfangskapital {euro(Number(company?.opening_cash_eur||0))} · geplant {euro(monthlyPayroll)}/Monat Personalkosten. Diese Fixkosten, Steuern, Leasing, Wartung und echte Flughafengebühren werden noch nicht periodisch gebucht. Der angezeigte Flugbeitrag ist daher ausdrücklich **kein Unternehmensgewinn**.</div>
      </>}
      {dept==='administration'&&<>
       <V2OperationsFoundation/>
       <div className={styles.columns}>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>YOUR TEAM</span><h3>Fiktive Mitarbeiter</h3></div><Users size={19}/></div>
         {staff.map(s=><div className={styles.employee} key={s.id}>
          <span className={styles.avatar}>{s.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span>
          <div><strong>{s.name}</strong><small>{staffRoles[s.role]||s.role}{s.rating?' · '+s.rating:''}</small></div>
          <span>{euro(Number(s.salary_eur))}/Monat</span>
         </div>)}
        </section>
        <section className={styles.panel}>
         <div className={styles.panelTitle}><div><span className={styles.eyebrow}>SIMULATION RULES</span><h3>Airline-Geschäftsregeln</h3></div><Settings2 size={19}/></div>
         <div className={styles.rules}>
          {[
           ['Unternehmen',company?.name||'AERVELYS'],
           ['Heimatbasis',company?.home_icao||'EDAZ'],
           ['Startkapital',euro(Number(company?.opening_cash_eur||0))],
           ['Kundenanfragen','Deterministische fiktive Szenarien'],
           ['Sales','Preis auf Basis modellierter Flugkosten'],
           ['Dispatch','Standort, Sitze, Musterberechtigungen, exklusive Crew/Flotte'],
           ['Positionierungen','Ferry-Legs vor Kundenflug im Angebot enthalten'],
           ['Angebotsbindung','Kunden-Gesamtpreis ab Annahme unveränderbar'],
           ['Rückflug zur Basis','Nicht automatisch enthalten; Rotation bleibt am Kundenziel'],
           ['Nachkalkulation','Planwerte gegen gebuchte SIM-Kosten, vor Fixkosten'],
           ['Flugwahl','CEO oder virtueller Captain'],
           ['Simulationsfortschritt','Manuell ausgelöst, keine Hintergrundautomatik'],
           ['Phenom 300E','Für Charter und Charterpositionierungen in V2 gesperrt'],
           ['Mitarbeiter-Stamm','31 bestehende Mitarbeiter, V2-Demo-Personal noch nicht verknüpft'],
           ['Schulungen und Rufbereitschaft','SIM-Planung bis zu 18 Monate im Voraus'],
           ['SimBrief','Vorbefüllter Dispatch-Link ohne zusätzliche API-Kosten'],
           ['MSFS-Bridge','Bestehende NEXT-1.0-Bridge noch nicht angeschlossen']
          ].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}
         </div>
         <div className={styles.softNote}>Dieses erste Release enthält bewusst wenige, überprüfbare Geschäftsregeln. Weitere Agenten, Monatsabschlüsse, Wartung und Flottenerweiterung werden erst nach dem vollständigen Praxistest eingebaut.</div>
        </section>
       </div>
      </>}
      <div className={styles.disclaimer}><ShieldCheck size={16}/>
       AERVELYS NEXT 2.0 · ausschließlich fiktiver Business-Airline-Betrieb. Keine realen Flüge, keine reale Crew-Freigabe, keine Zahlungsdienste und keine bestätigte MSFS-Telemetrie.
      </div>
     </>}
   </div>
  </main>
 </div>;
}
function EmptyState({icon:Icon,title,description}:{icon:typeof Plane;title:string;description:string}){
 return <div className={styles.empty}><Icon size={26}/><strong>{title}</strong><p>{description}</p></div>;
}
