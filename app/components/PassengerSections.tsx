'use client';
import {ArrowRight,CheckCircle2,Clock3,CloudOff,FileUp,LockKeyhole,MapPinned,Plane,RadioTower,ShieldAlert} from 'lucide-react';
import type {PassengerPlan} from '../lib/passengerPlan';
import styles from './PassengerSections.module.css';
import CabinSimulation from './CabinSimulation';
import BridgeSnapshotInspector from './BridgeSnapshotInspector';
import type {CabinPhase} from '../lib/cabinSimulation';
import type {BridgeSnapshot} from '../lib/localBridge';
import {BRIDGE_PHASE_LABELS} from '../lib/localBridge';
import type {LiveRouteMetrics} from '../lib/liveFlightProgress';

type CabinFlight={
 origin:string;destination:string;registration:string|null;request_code:string;
 estimated_block_minutes:number|null;planning_status:string;
};
type Props={
 section:'cabin'|'connection';
 flight:CabinFlight|null;originName:string;destinationName:string;
 distance:number|null;progress:number|null;remaining:number|null;liveMetrics:LiveRouteMetrics|null;elapsedBasis:'takeoff'|'connection';
 prepared:PassengerPlan|null;publicDemo:boolean;
 dispatchState:'loading'|'ready'|'error';draftCount:number;
 onOpenMap:()=>void;playing:boolean;onToggle:()=>void;
 liveSnapshot:BridgeSnapshot|null;bridgeConnected:boolean;bridgeError:string;bridgeElapsed:number;connectBridge:()=>Promise<void>;disconnectBridge:()=>void;
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
function cabinPhase(progress:number):CabinPhase{
 if(progress<=0)return 'parked';
 if(progress<5)return 'takeoff';
 if(progress<18)return 'climb';
 if(progress<75)return 'cruise';
 if(progress<94)return 'descent';
 if(progress<99)return 'approach';
 return 'landing';
}
function bridgePhaseToCabin(phase:string):CabinPhase{
 switch(phase){
  case 'TaxiOut':case 'TaxiIn':return 'taxi';
  case 'TakeoffRoll':return 'takeoff';
  case 'Climb':return 'climb';
  case 'Cruise':return 'cruise';
  case 'Descent':return 'descent';
  case 'Approach':return 'approach';
  case 'Landing':return 'landing';
  default:return 'parked';
 }
}
export default function PassengerSections({section,flight,originName,destinationName,distance,progress,remaining,prepared,publicDemo,dispatchState,draftCount,onOpenMap,playing,onToggle,liveMetrics,elapsedBasis,liveSnapshot,bridgeConnected,bridgeError,bridgeElapsed,connectBridge,disconnectBridge}:Props){
 const isImported=Boolean(publicDemo&&prepared);
 if(section==='cabin')return <div className={styles.cabin}>
  <div className={styles.cabinBrand}>
   <div><div className={styles.eyebrow}>AERVELYS / PRIVATE CABIN EXPERIENCE</div><strong>Willkommen an Bord.</strong><p>Deine Reise. Dein Moment. Unser Anspruch.</p></div>
   <div className={styles.monogram}>A</div>
  </div>
  <div className={styles.journeyPanel}>
   <div className={styles.journeyTop}>
    <span><Plane size={15}/> {liveSnapshot?'SIMBRIEF-PLAN · MSFS LIVE':isImported?'SIMBRIEF-FLUGPLAN · VORSCHAU':'PASSENGER EXPERIENCE · DEMO'}</span>
    <span>{flight?.request_code||'KEIN FLUGPLAN'}</span>
   </div>
   <div className={styles.journeyRoute}>
    <div><small>ABFLUG</small><strong>{flight?.origin||'—'}</strong><span>{originName}</span></div>
    <div className={styles.journeyCenter}><div className={styles.journeyDash}><Plane size={25}/></div><span>{liveSnapshot?BRIDGE_PHASE_LABELS[liveSnapshot.phase]:progress!==null&&progress>0?phase(progress):'Vorgesehene Strecke'}</span></div>
    <div className={styles.endAirport}><small>ANKUNFT</small><strong>{flight?.destination||'—'}</strong><span>{destinationName}</span></div>
   </div>
   <div className={styles.progressBar} role="progressbar" aria-label={liveSnapshot?'Live-Fortschritt auf dem SimBrief-OFP':'Illustrativer Flugfortschritt'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress??undefined} aria-valuetext={progress===null?'Routenfortschritt nicht verfügbar':undefined}><div style={{width:(progress??0)+'%'}}/></div>
   <div className={styles.progressLabels}><span>Geplante Abflugroute</span><span>{liveSnapshot?(progress!==null?progress+' % · MSFS':'Live-Position · Route nicht zugeordnet'):(progress??0)+'% · Simulation'}</span><span>Geplantes Ziel</span></div>
  </div>
  <div className={styles.cabinFacts}>
   <div><span><Clock3 size={16}/> Geplante Flugdauer</span><strong>{formatMinutes(flight?.estimated_block_minutes??null)}</strong></div>
   <div><span><MapPinned size={16}/> Streckenlänge</span><strong>{distance!==null?distance.toLocaleString('de-DE')+' km':'—'}</strong></div>
   <div><span><Plane size={16}/> Flugzeug</span><strong>{flight?.registration||'Nicht hinterlegt'}</strong></div>
   <div><span><Clock3 size={16}/> {liveSnapshot?'ETA / Restzeit (geschätzt)':'Restzeit (Demo)'}</span><strong>{remaining!==null?formatMinutes(remaining):liveSnapshot?'Nicht ermittelbar':'Keine Live-Daten'}</strong></div>
  </div>
  {liveSnapshot&&<div className={styles.cabinLiveStatus}>
    <span><CheckCircle2 size={16}/> {BRIDGE_PHASE_LABELS[liveSnapshot.phase]} · echte MSFS-Flugphase</span>
    <span>{liveMetrics?.remainingKm!=null?liveMetrics.remainingKm+' km Reststrecke':'Live-Position ohne verlässlichen Routenabgleich'}</span>
    <span>{liveMetrics?.etaAtUtc?new Date(liveMetrics.etaAtUtc).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr ETA (geschätzt)':'ETA nicht verfügbar'}</span>
    <span>{elapsedBasis==='takeoff'?'Fluguhr ab erkanntem Start':'Kabinenzeit ab Live-Verbindung'}</span>
   </div>}
   <div className={styles.cabinBottom}>
   <div><div className={styles.eyebrow}>FLIGHT INFORMATION</div><h3>Deine Reise auf einen Blick</h3><p>{isImported?'Die dargestellte Strecke stammt aus dem von deinem Piloten vorbereiteten SimBrief-OFP mit '+prepared!.fixes.length+' Wegpunkten.':'Für diese Vorschau wurde noch kein SimBrief-Flugplan hinterlegt. Es wird eine Beispieldirektverbindung angezeigt.'}</p></div>
   <button type="button" onClick={onOpenMap} className={styles.primaryButton}><MapPinned size={17}/> Flugkarte ansehen <ArrowRight size={16}/></button>
  </div>
  <div className={styles.disclaimer}><ShieldAlert size={15}/> {liveSnapshot?'Position und Flugphase kommen aus der lokalen MSFS-Bridge; Reststrecke, Fortschritt und ETA sind unverbindliche Schätzungen auf dem SimBrief-Plan. Gäste und Service bleiben simuliert.':'Diese Kabinenansicht ist eine Simulation. Flugfortschritt und Restzeit basieren nicht auf Live-Telemetrie, Wetter- oder Flugzeugdaten.'}</div>
  {publicDemo&&!liveSnapshot&&<div className={styles.cabinPlayback}><button type="button" onClick={onToggle}>{playing?'Demo-Flug pausieren':'Demo-Flug starten'}</button><span>Flugfortschritt und Kabinenbedürfnisse laufen gemeinsam.</span></div>}
  <CabinSimulation key={String(flight?.request_code)+'-'+String(prepared?.preparedAt||'draft')} elapsedMinutes={liveSnapshot?bridgeElapsed:Math.round((flight?.estimated_block_minutes||115)*(progress??0)/100)} phase={liveSnapshot?bridgePhaseToCabin(liveSnapshot.phase):cabinPhase(progress??0)} flightKey={String(flight?.request_code)+'-'+String(prepared?.preparedAt||'draft')} playing={playing} onToggle={onToggle} publicDemo={publicDemo} livePhase={Boolean(liveSnapshot)} elapsedBasis={elapsedBasis}/>
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
    {liveSnapshot?<span className={styles.ready}><CheckCircle2 size={15}/> Lokale Live-Daten erkannt</span>:<span className={styles.off}><CloudOff size={15}/> Kein Live-Tracking</span>}
    <p>{liveSnapshot?'Der Browser liest tatsächlich aktuelle Messwerte aus der lokalen Windows-Bridge. Phase: '+liveSnapshot.phase+'. Übertragung nur auf diesem PC.':'Die Windows-Bridge liefert echte Messwerte lokal. Wähle im Browser den neuen Live-Datenordner aus, um fortlaufende Daten auf demselben PC zu sehen.'}</p>
   </article>
  </div>
  <div className={styles.flowline}>
   <div>SimBrief OFP <small>vorab geplant</small></div><ArrowRight size={18}/><div>AERVELYS NEXT <small>Flugzuordnung geplant</small></div><ArrowRight size={18}/><div>Passagierdisplay <small>lesende Anzeige</small></div>
  </div>
  <BridgeSnapshotInspector snapshot={liveSnapshot} connected={bridgeConnected} isLive={liveSnapshot!==null} error={bridgeError} connect={connectBridge} disconnect={disconnectBridge}/>
  <div className={styles.connectionNotice}><ShieldAlert size={18}/><p>Es erfolgt noch keine Live-Übertragung aus MSFS an NEXT. Die lokale Bridge schreibt nur eine Momentaufnahme auf den Simulator-PC. SimBrief-Pläne bleiben im selben Browser. Für echte Kopplung braucht es Gerätepaarung, Flugzuordnung, Zugriffsprüfung und sichere Datenübertragung.</p></div>
 </div>;
}
