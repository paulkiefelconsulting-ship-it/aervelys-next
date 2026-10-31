'use client';
import {ArrowRight,CheckCircle2,Clock3,CloudOff,FileUp,LockKeyhole,MapPinned,Plane,RadioTower,ShieldAlert} from 'lucide-react';
import type {PassengerPlan} from '../lib/passengerPlan';
import styles from './PassengerSections.module.css';

type CabinFlight={
 origin:string;destination:string;registration:string|null;request_code:string;
 estimated_block_minutes:number|null;planning_status:string;
};
type Props={
 section:'cabin'|'connection';
 flight:CabinFlight|null;originName:string;destinationName:string;
 distance:number|null;progress:number;remaining:number|null;
 prepared:PassengerPlan|null;publicDemo:boolean;
 dispatchState:'loading'|'ready'|'error';draftCount:number;
 onOpenMap:()=>void;
};
function phase(progress:number){
 if(progress<=0)return 'FLUG VORBEREITET';
 if(progress<6)return 'START';
 if(progress<18)return 'STEIGFLUG';
 if(progress<76)return 'REISEFLUG';
 if(progress<98)return 'ANFLUG';
 if(progress<100)return 'LANDUNG';
 return 'ANGEKOMMEN';
}
function formatMinutes(minutes:number|null){
 if(minutes===null||!Number.isFinite(minutes))return 'Nicht hinterlegt';
 const h=Math.floor(minutes/60),m=Math.round(minutes%60);
 return h? h+' Std. '+m+' Min.':m+' Min.';
}
export default function PassengerSections({section,flight,originName,destinationName,distance,progress,remaining,prepared,publicDemo,dispatchState,draftCount,onOpenMap}:Props){
 const isImported=Boolean(publicDemo&&prepared);
 if(section==='cabin')return <div className={styles.cabin}>
  <div className={styles.cabinBrand}>
   <div><div className={styles.eyebrow}>AERVELYS / PRIVATE CABIN EXPERIENCE</div><strong>Willkommen an Bord.</strong><p>Deine Reise. Dein Moment. Unser Anspruch.</p></div>
   <div className={styles.monogram}>A</div>
  </div>
  <div className={styles.journeyPanel}>
   <div className={styles.journeyTop}>
    <span><Plane size={15}/> {isImported?'SIMBRIEF-FLUGPLAN · VORSCHAU':'PASSENGER EXPERIENCE · DEMO'}</span>
    <span>{flight?.request_code||'KEIN FLUGPLAN'}</span>
   </div>
   <div className={styles.journeyRoute}>
    <div><small>ABFLUG</small><strong>{flight?.origin||'—'}</strong><span>{originName}</span></div>
    <div className={styles.journeyCenter}><div className={styles.journeyDash}><Plane size={25}/></div><span>{progress>0?phase(progress):'Vorgesehene Strecke'}</span></div>
    <div className={styles.endAirport}><small>ANKUNFT</small><strong>{flight?.destination||'—'}</strong><span>{destinationName}</span></div>
   </div>
   <div className={styles.progressBar} role="progressbar" aria-label="Illustrativer Flugfortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{width:progress+'%'}}/></div>
   <div className={styles.progressLabels}><span>Geplante Abflugroute</span><span>{progress}% · Simulation</span><span>Geplantes Ziel</span></div>
  </div>
  <div className={styles.cabinFacts}>
   <div><span><Clock3 size={16}/> Geplante Flugdauer</span><strong>{formatMinutes(flight?.estimated_block_minutes??null)}</strong></div>
   <div><span><MapPinned size={16}/> Streckenlänge</span><strong>{distance!==null?distance.toLocaleString('de-DE')+' km':'—'}</strong></div>
   <div><span><Plane size={16}/> Flugzeug</span><strong>{flight?.registration||'Nicht hinterlegt'}</strong></div>
   <div><span><Clock3 size={16}/> Restzeit (Demo)</span><strong>{remaining!==null?formatMinutes(remaining):'Keine Live-Daten'}</strong></div>
  </div>
  <div className={styles.cabinBottom}>
   <div><div className={styles.eyebrow}>FLIGHT INFORMATION</div><h3>Deine Reise auf einen Blick</h3><p>{isImported?'Die dargestellte Strecke stammt aus dem von deinem Piloten vorbereiteten SimBrief-OFP mit '+prepared!.fixes.length+' Wegpunkten.':'Für diese Vorschau wurde noch kein SimBrief-Flugplan hinterlegt. Es wird eine Beispieldirektverbindung angezeigt.'}</p></div>
   <button type="button" onClick={onOpenMap} className={styles.primaryButton}><MapPinned size={17}/> Flugkarte ansehen <ArrowRight size={16}/></button>
  </div>
  <div className={styles.disclaimer}><ShieldAlert size={15}/> Diese Kabinenansicht ist eine Simulation. Flugfortschritt und Restzeit basieren nicht auf Live-Telemetrie, Wetter- oder Flugzeugdaten.</div>
 </div>;

 return <div className={styles.integration}>
  <div className={styles.integrationHead}><div className={styles.eyebrow}>AERVELYS / CONNECTIVITY</div><h2>Flugplanung und Passagierdisplay</h2><p>Drei Bausteine arbeiten zusammen. Hier siehst du, was bereits angeschlossen ist und wo noch eine Verbindung fehlt.</p></div>
  <div className={styles.connectionGrid}>
   <article className={styles.connectionCard}>
    <div className={styles.connectionIcon}><FileUp size={22}/></div>
    <span className={styles.eyebrow}>01 / FLIGHT PLAN SOURCE</span>
    <h3>SimBrief</h3>
    {isImported?<span className={styles.ready}><CheckCircle2 size={15}/> Lokal importiert</span>:<span className={styles.off}><CloudOff size={15}/> Kein OFP im Browser</span>}
    <p>{isImported?'Route '+prepared!.origin+' – '+prepared!.destination+' mit '+prepared!.fixes.length+' Wegpunkten aus der importierten Datei.':'Importiere den vorbereiteten SimBrief-OFP vor dem Abflug als XML oder JSON. Danach übernimmt die Karte die Wegpunkte.'}</p>
    <a className={styles.smallLink} href="/passenger-demo/setup">{isImported?'Flugvorbereitung prüfen':'SimBrief-OFP importieren'} <ArrowRight size={14}/></a>
   </article>
   <article className={styles.connectionCard}>
    <div className={styles.connectionIcon}><LockKeyhole size={22}/></div>
    <span className={styles.eyebrow}>02 / DISPATCH + OPS</span>
    <h3>AERVELYS NEXT</h3>
    {publicDemo?<span className={styles.off}><LockKeyhole size={15}/> Öffentlich nicht verbunden</span>:dispatchState==='ready'?<span className={styles.ready}><CheckCircle2 size={15}/> Geschützter Lesezugriff</span>:<span className={styles.off}><CloudOff size={15}/> Kein Zugriff nachgewiesen</span>}
    <p>{publicDemo?'Kunden-, Crew-, Flugzeug- und Dispositionsdaten bleiben hinter dem internen Login. In dieser öffentlichen Demo werden keine OPS-Daten geladen.':dispatchState==='ready'?draftCount+' gespeicherte Dispositionsentwürfe lesbar. Es findet keine Flug- oder Crewfreigabe statt.':'Die Dispositionsdaten sind aktuell nicht abrufbar oder noch nicht freigeschaltet.'}</p>
   </article>
   <article className={styles.connectionCard}>
    <div className={styles.connectionIcon}><RadioTower size={22}/></div>
    <span className={styles.eyebrow}>03 / LIVE TELEMETRY</span>
    <h3>MSFS 2024</h3>
    <span className={styles.off}><CloudOff size={15}/> SimConnect nicht verbunden</span>
    <p>Die lokale Windows-Bridge und das sichere Pairing fehlen noch. Bis dahin gibt es keine echte Position, Geschwindigkeit, Flughöhe oder automatische Flugphasenerkennung.</p>
   </article>
  </div>
  <div className={styles.flowline}>
   <div>SimBrief OFP <small>vorab geplant</small></div><ArrowRight size={18}/><div>AERVELYS NEXT <small>Flugzuordnung geplant</small></div><ArrowRight size={18}/><div>Passagierdisplay <small>lesende Anzeige</small></div>
  </div>
  <div className={styles.connectionNotice}><ShieldAlert size={18}/><p>Diese Ansicht ist kein Netzwerk- oder Verbindungsmonitor für reale Flugzeuge. Lokal importierte Pläne bleiben im selben Browser gespeichert. Die Verbindung zu NEXT sowie die SimConnect-Telemetrie werden später mit Zugriffsprüfung, Gerätezuordnung und sicherer Datenübertragung ergänzt.</p></div>
 </div>;
}
