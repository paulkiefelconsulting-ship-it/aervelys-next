'use client';
import {useState} from 'react';
import {Plane, LayoutDashboard, BriefcaseBusiness, UsersRound, Wallet, MapPin, ShieldCheck, Menu, X, Bell, ArrowRight, FileClock, Handshake, Clock3, Building2, GraduationCap, Search, CircleHelp, ChevronRight, ClipboardList, BookUser} from 'lucide-react';
import './preview.css';

type Area='Übersicht'|'Kunden & Charter'|'Pilot Services'|'Flotte & Training'|'Personal'|'Standorte'|'Finanzen'|'Behörden';
const sections:{name:Area;icon:typeof Plane}[]=[
 {name:'Übersicht',icon:LayoutDashboard},{name:'Kunden & Charter',icon:Handshake},{name:'Pilot Services',icon:BriefcaseBusiness},
 {name:'Flotte & Training',icon:Plane},{name:'Personal',icon:UsersRound},{name:'Standorte',icon:MapPin},
 {name:'Finanzen',icon:Wallet},{name:'Behörden',icon:ShieldCheck}
];
const tasks=[
 {title:'Pilotenakte vervollständigen',desc:'Musterberechtigungen, Medical und Betreiberfreigaben prüfen',icon:BookUser,area:'Pilot Services' as Area},
 {title:'Charterpartner recherchieren',desc:'Zugelassene Betreiber suchen und Verträge anfragen',icon:Handshake,area:'Kunden & Charter' as Area},
 {title:'Standortmöglichkeiten prüfen',desc:'EDAZ ist Homebase, weitere Standorte bleiben offen',icon:Building2,area:'Standorte' as Area},
];
const capabilities:Record<Area,{headline:string;description:string;items:string[];icon:typeof Plane}>={
 'Übersicht':{headline:'Geschäftsführung',description:'Alle wichtigen Entscheidungen auf einen Blick.',items:[],icon:LayoutDashboard},
 'Kunden & Charter':{headline:'Kunden & Charter',description:'Charteranfragen, Angebote, Partnerverträge und Stammkunden.',items:['Kundenkartei','Charteranfragen','Angebote & Verhandlungen','Partnernetzwerk'],icon:Handshake},
 'Pilot Services':{headline:'Pilot Services',description:'Deine persönliche Pilotenakte und externe Aufträge.',items:['ATPL(A) – virtuelle Ausgangsannahme','Muster- und Klassenberechtigungen','Betreiberfreigaben','Pilotenangebote'],icon:BriefcaseBusiness},
 'Flotte & Training':{headline:'Flotte & Training',description:'Flugzeuge mieten, leasen und kaufen – mit echten operativen Grenzen.',items:['Privatflugzeugmiete','Flugzeugmarkt','Ausbildungsaufträge','MSFS-2024-Bridge (noch nicht verbunden)'],icon:Plane},
 'Personal':{headline:'Personal',description:'Arbeitsplätze schaffen, qualifizierte Menschen einstellen und Dienstpläne verwalten.',items:['Sophie Brandt – vorgemerkt','Nora Falk – vorgemerkt','Leonie Berger – vorgemerkt','Hannah Wolf – vorgemerkt','Marie Seidel – vorgemerkt'],icon:UsersRound},
 'Standorte':{headline:'Standorte & Projekte',description:'Standortunabhängig suchen, planen und wachsen.',items:['EDAZ – Gründungsbasis','Standortsuche weltweit','Machbarkeitsstudien & Planungsbüros','Miete, Kauf & Bauanträge'],icon:MapPin},
 'Finanzen':{headline:'Finanzen',description:'Liquidität, Verträge, Zahlungen und finanzielle Verpflichtungen.',items:['Anfangskapital: 25.000 €','Buchungsjournal','Verbindlichkeiten & Forderungen','Liquiditätsplanung'],icon:Wallet},
 'Behörden':{headline:'Behörden & Genehmigungen',description:'Virtuelle Anträge mit realitätsnahen Voraussetzungen.',items:['Kein eigenes AOC','AOC-Vorbereitungsprogramm','Versicherungsnachweise','Betriebs- und Standortgenehmigungen'],icon:ShieldCheck}
};
export default function TycoonPreview(){
 const [area,setArea]=useState<Area>('Übersicht');const [mobile,setMobile]=useState(false);
 const [query,setQuery]=useState('');const [done,setDone]=useState<string[]>([]);
 const view=capabilities[area];const Icon=view.icon;
 function navigate(next:Area){setArea(next);setMobile(false);}
 const visibleTasks=tasks.filter(t=>(t.title+' '+t.desc).toLowerCase().includes(query.toLowerCase()));
 return <div className="tycoon-preview">
  <aside className={'tycoon-side '+(mobile?'mobile-open':'')}>
   <div className="tycoon-logo">
    <span className="tycoon-logo-letter" aria-hidden="true">A</span>
    <div><strong>AERVELYS</strong><small>BUSINESS AVIATION</small></div>
   </div>
   <div className="tycoon-side-label">TYCOON · COMMAND CENTER</div>
   <nav aria-label="Unternehmensbereiche">{sections.map(({name,icon:NavIcon})=><button key={name} type="button" className={area===name?'selected':''} aria-current={area===name?'page':undefined} onClick={()=>navigate(name)}><NavIcon size={18}/><span>{name}</span></button>)}</nav>
   <div className="tycoon-side-bottom"><span className="tycoon-status-dot"/> Gründungsphase <small>Homebase EDAZ · AOC nicht vorhanden</small></div>
  </aside>
  {mobile&&<button type="button" className="tycoon-shade" onClick={()=>setMobile(false)} aria-label="Menü schließen"/>}
  <div className="tycoon-work">
   <header className="tycoon-topbar">
    <button type="button" className="tycoon-mobile-toggle" onClick={()=>setMobile(!mobile)} aria-label={mobile?'Menü schließen':'Menü öffnen'}>{mobile?<X size={20}/>:<Menu size={20}/>}</button>
    <div className="tycoon-top-meta"><strong>AERVELYS</strong><span>Geschäftsführung / Konzeptvorschau</span></div>
    <div className="tycoon-header-right"><span className="tycoon-preview-label">DEMO · KEINE LIVE-DATEN</span><span className="tycoon-avatar" aria-label="Geschäftsführer">GF</span></div>
   </header>
   <main className="tycoon-content">
    {area==='Übersicht'?<>
      <div className="tycoon-welcome"><div className="tycoon-kicker">AERVELYS · GRÜNDUNGSPHASE</div><h1>Dein Unternehmen beginnt hier.</h1><p>Starte als Gründer und Pilot. Baue Kundenbeziehungen auf und entwickle Schritt für Schritt deine eigene Business-Airline.</p></div>
      <div className="tycoon-metrics">
       <article><span>Kontostand</span><strong>25.000 €</strong><small>Virtuelles Startkapital</small></article>
       <article><span>Aktive Aufträge</span><strong>0</strong><small>Noch kein Vertrag</small></article>
       <article><span>Eigene Flugzeuge</span><strong>0</strong><small>Miete über externe Anbieter</small></article>
       <article><span>Mitarbeiter</span><strong>0</strong><small>Alle Positionen noch unbesetzt</small></article>
      </div>
      <div className="tycoon-feature"><div className="tycoon-feature-inner"><span>GRÜNDERBETRIEB · EDAZ</span><h2>Deine Airline.<br/>Deine Entscheidungen.</h2><p>Vermittle Charterflüge, arbeite als Pilot und trainiere mit gemieteten Flugzeugen. Das eigene AOC erarbeitest du dir später.</p><button type="button" onClick={()=>navigate('Kunden & Charter')}>Geschäftsbereiche ansehen <ArrowRight size={17}/></button></div><div className="tycoon-wing" aria-hidden="true">A</div></div>
      <div className="tycoon-lower">
       <section className="tycoon-panel"><div className="tycoon-panel-title"><h2>Nächste Schritte</h2><span>Beispielaufgaben</span></div>
        <label className="tycoon-search"><Search size={15}/><input aria-label="Aufgaben suchen" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Aufgaben suchen ..."/></label>
        {visibleTasks.map(task=><div className="tycoon-task" key={task.title}><input type="checkbox" aria-label={task.title+' in der Vorschau markieren'} checked={done.includes(task.title)} onChange={e=>setDone(old=>e.target.checked?[...old,task.title]:old.filter(x=>x!==task.title))}/><div><strong className={done.includes(task.title)?'tycoon-cross':''}>{task.title}</strong><small>{task.desc}</small></div><button type="button" onClick={()=>navigate(task.area)} aria-label={task.area+' ansehen'}><ChevronRight size={17}/></button></div>)}
        {visibleTasks.length===0&&<p className="tycoon-empty">Keine passenden Aufgaben.</p>}
       </section>
       <section className="tycoon-panel"><div className="tycoon-panel-title"><h2>Unternehmensstatus</h2><span>Gründungsakte GA-001</span></div>
        <div className="tycoon-state"><div><Clock3 size={17}/><span>Simulationszeit</span></div><strong>1:1 Echtzeit geplant</strong></div>
        <div className="tycoon-state"><div><GraduationCap size={17}/><span>Pilotenstatus</span></div><strong>ATPL(A) · virtuell</strong></div>
        <div className="tycoon-state"><div><ShieldCheck size={17}/><span>Eigenes AOC</span></div><strong>Nicht vorhanden</strong></div>
        <div className="tycoon-state"><div><MapPin size={17}/><span>Homebase</span></div><strong>Schönhagen (EDAZ)</strong></div>
        <div className="tycoon-disclaimer">Die gezeigten Werte sind der vereinbarte Ausgangszustand. Der 24/7-Simulationsmotor ist noch nicht angeschlossen.</div>
       </section>
      </div>
    </>:<>
      <div className="tycoon-breadcrumb">AERVELYS <ChevronRight size={14}/> {area}</div>
      <div className="tycoon-section-heading"><div className="tycoon-section-icon"><Icon size={23}/></div><div><h1>{view.headline}</h1><p>{view.description}</p></div></div>
      <div className="tycoon-explain"><CircleHelp size={19}/><p><strong>Funktionsvorschau:</strong> Die Navigation ist bedienbar; Verträge, Buchungen, Bewerbungen und Anträge werden hier noch nicht ausgeführt. Der eigentliche Simulationsmotor wird erst nach der sicheren Datenbankanbindung aktiviert.</p></div>
      <div className="tycoon-module-grid">{view.items.map(item=><article key={item}><div className="tycoon-module-icon"><ClipboardList size={19}/></div><strong>{item}</strong><small>Modul vorgesehen · noch nicht aktiviert</small></article>)}</div>
      <button type="button" className="tycoon-back" onClick={()=>navigate('Übersicht')}>Zurück zur Übersicht <ArrowRight size={16}/></button>
    </>}
    <footer className="tycoon-footer"><span>AERVELYS-Tycoon · Designvorschau</span><span>Corporate Design: Navy · Weiß · Silber · Accent Blue</span></footer>
   </main>
  </div>
 </div>;
}
