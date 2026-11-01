'use client';

import {ArrowUpRight,ArrowRight,Activity,CalendarClock,Plane,RadioTower,ShieldCheck,Sparkles,Users,Workflow} from 'lucide-react';
import styles from './ModernCommandDeck.module.css';

type Shortcut={title:string;description:string;caption:string;icon:typeof Plane;target:string};
const shortcuts:Shortcut[]=[
 {title:'Flight Operations',description:'Disposition, Crew und Freigabe prüfen',caption:'OPS / DISPATCH',icon:Plane,target:'Flugdisposition'},
 {title:'Charter Desk',description:'Anfragen und Angebote bearbeiten',caption:'COMMERCIAL',icon:CalendarClock,target:'Charter & Angebote'},
 {title:'SIM Flight Deck',description:'Mission, Bridge und Kabine starten',caption:'MSFS 2024',icon:RadioTower,target:'SIM-Flugbetrieb & Kabine'},
 {title:'Agent Center',description:'Virtuelle Abläufe und Prüfungen',caption:'AUTOMATION',icon:Workflow,target:'KI & Automatisierung'},
];
export default function ModernCommandDeck({onNavigate,live,fleetCount,openCases}:{
 onNavigate:(name:string)=>void;live:boolean;fleetCount:number|null;openCases:number;
}){
 return <section className={styles.root} aria-label="AERVELYS NEXT moderne Kommandobrücke">
  <div className={styles.hero}>
   <div className={styles.heroContent}>
    <div className={styles.eyebrow}><Sparkles size={14}/> AERVELYS / NEXT GENERATION OPS</div>
    <h2>Your airline.<br/><span>One command center.</span></h2>
    <p>Charter. Flotte. Crew. Flight Experience. Alle Simulationsbereiche an einem Ort, mit transparenten Nachweisen statt künstlicher Betriebsfreigaben.</p>
    <div className={styles.heroActions}>
     <button type="button" className={styles.primary} onClick={()=>onNavigate('SIM-Flugbetrieb & Kabine')}>
      SIM-Mission öffnen <ArrowUpRight size={17}/></button>
     <button type="button" className={styles.secondary} onClick={()=>onNavigate('Freigabe-Cockpit')}>
      Freigaben prüfen <ShieldCheck size={16}/></button>
    </div>
   </div>
   <div className={styles.radar} aria-hidden="true">
    <div className={styles.orbitOuter}><span/></div>
    <div className={styles.orbitMid}><span/></div>
    <div className={styles.orbitInner}/>
    <div className={styles.radarCore}><Plane size={42} strokeWidth={1.3}/></div>
    <span className={styles.radarTop}>AERVELYS · OPS</span>
    <span className={styles.radarBottom}>SIMULATION / EDAZ</span>
   </div>
   <div className={styles.heroFoot}>
    <span><span className={styles.dot}/> {live?'Datenzugriff aktiv':'Datenzugriff prüfen'}</span>
    <span><Activity size={14}/> {fleetCount===null?'—':fleetCount} Flugzeuge im Register</span>
    <span><Users size={14}/> {openCases} Vorgänge im Posteingang</span>
   </div>
  </div>
  <div className={styles.shortcutHeader}>
   <div><span className="eyebrow">QUICK ACCESS</span><h3>Direkt ins Geschäft</h3></div>
   <span>Deine wichtigsten Arbeitsbereiche <ArrowRight size={14}/></span>
  </div>
  <div className={styles.shortcuts}>
   {shortcuts.map((shortcut)=>{
    const Icon=shortcut.icon;
    return <button type="button" key={shortcut.title}
      onClick={()=>onNavigate(shortcut.target)} className={styles.shortcut}>
      <div className={styles.icon}><Icon size={21} strokeWidth={1.6}/></div>
      <small>{shortcut.caption}</small>
      <strong>{shortcut.title}</strong>
      <span>{shortcut.description}</span>
      <ArrowUpRight size={17} className={styles.arrow}/>
    </button>;
   })}
  </div>
 </section>;
}
