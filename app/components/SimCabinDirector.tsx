'use client';

import {useMemo,useState} from 'react';
import {Activity,AlertTriangle,ArrowUpRight,CheckCircle2,Clock3,
 Coffee,HeartPulse,RefreshCw,ShieldCheck,Sparkles,Users} from 'lucide-react';
import {assessCabin,type CabinEventState,type CabinPassengerState,
 type CabinService} from '../lib/simCabinDirector';
import styles from './SimCabinDirector.module.css';

const serviceLabels:Record<CabinService,string>={
 water:'Wasser',coffee:'Kaffee',meal:'Mahlzeit',snack:'Snack',
 restroom:'WC-Begleitung',blanket:'Decke',conversation:'Betreuung'
};
type Props={
 passengers:CabinPassengerState[];events:CabinEventState[];phase:string;
 lifecycle:string;busy:boolean;onService:(service:CabinService,seat:number)=>Promise<void>;
 onSelectPassenger:(seat:number)=>void;
};
function display(value:number|null){return value===null?'—':
 new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(value);}
export default function SimCabinDirector({
 passengers,events,phase,lifecycle,busy,onService,onSelectPassenger
}:Props){
 const [minutes,setMinutes]=useState(20);
 const assessed=useMemo(()=>assessCabin(passengers,events,phase,lifecycle,minutes),
  [passengers,events,phase,lifecycle,minutes]);
 const available=assessed.serviceAvailable;
 const forecast=assessed.forecast;
 return <section className={styles.root} aria-label="SIM Cabin Experience Director">
  <div className={styles.heading}>
   <div>
    <div className="eyebrow"><Sparkles size={13}/> FLIGHT EXPERIENCE / CABIN OPERATIONS</div>
    <h4><HeartPulse size={20}/> Cabin Experience Director</h4>
    <p>Serviceempfehlungen aus den tatsächlich gespeicherten fiktiven Passagierbedürfnissen. Kein automatischer Service, keine generierte Besatzung und keine MSFS-Datenbehauptung.</p>
   </div>
   <span className={available?styles.serve:styles.hold}>
    {available?<CheckCircle2 size={15}/>:<Clock3 size={15}/>}
    {available?'Servicephase freigegeben':'Service derzeit gesperrt'}
   </span>
  </div>
  <div className={styles.kpis}>
   <div><Users size={16}/><small>GÄSTE AN BORD</small><strong>{assessed.total}</strong><span>Fiktive SIM-Passagiere</span></div>
   <div><HeartPulse size={16}/><small>ZUFRIEDENHEIT</small><strong>{display(assessed.averageSatisfaction)}<span>/ 100</span></strong><span>Gespeicherter Ist-Zustand</span></div>
   <div><AlertTriangle size={16}/><small>DRINGENDE ANLIEGEN</small><strong>{assessed.critical}</strong><span>Aus Regelmodell abgeleitet</span></div>
   <div><Coffee size={16}/><small>EMPFOHLENE SERVICES</small><strong>{assessed.recommendations.length}</strong><span>Maximal ein Vorschlag pro PAX</span></div>
  </div>
  <div className={styles.grid}>
   <div className={styles.queue}>
    <div className={styles.sectionHeading}><h5><Activity size={17}/> Service-Prioritäten</h5>
     <small>{assessed.recommendations.length} Vorschläge</small>
    </div>
    {assessed.recommendations.length===0?
     <div className={styles.empty}><CheckCircle2 size={23}/>
      <strong>{assessed.total?'Aktuell kein Servicebedarf über den Schwellenwerten':'Noch keine Passagiere in dieser Mission'}</strong>
      <span>{assessed.total?'Die Bedürfnisse werden bei der nächsten Aktualisierung neu bewertet.':'Starte eine virtuelle Trainingsmission, um die Kabinensimulation zu verwenden.'}</span>
     </div>:
     <div className={styles.tasks}>
      {assessed.recommendations.slice(0,8).map(r=><div className={styles.task} key={r.seat_index}>
       <div className={styles.taskTop}>
        <span className={styles.seat}>PAX {String(r.seat_index).padStart(2,'0')}</span>
        <span className={r.priority==='critical'?styles.critical:
          r.priority==='attention'?styles.attention:styles.routine}>
         {r.priority==='critical'?'Dringend':r.priority==='attention'?'Erhöht':'Beobachten'}
        </span>
       </div>
       <strong>{serviceLabels[r.service]}</strong>
       <p>{r.reason} · {r.metric}: {r.value}%</p>
       <div className={styles.taskButtons}>
        <button type="button" className={styles.secondary}
         onClick={()=>onSelectPassenger(r.seat_index)}>Passagier ansehen</button>
        <button type="button" className={styles.primary} disabled={busy||!r.available}
         onClick={()=>void onService(r.service,r.seat_index)}>
         {serviceLabels[r.service]} <ArrowUpRight size={14}/>
        </button>
       </div>
      </div>)}
     </div>}
    {assessed.recommendations.length>8&&
     <p className={styles.more}>Weitere {assessed.recommendations.length-8} Empfehlungen sind nach Priorität vorgemerkt. Bitte den Passagierbereich nutzen.</p>}
    {!available&&assessed.total>0&&
     <p className={styles.holdText}>Keine Serviceaktionen in der aktuellen Phase. Bestehende SIM-Regeln erlauben Service nur bei Boarding oder im Reiseflug; Kaffee und Mahlzeiten nur im Reiseflug.</p>}
   </div>
   <div className={styles.forecast}>
    <div className={styles.sectionHeading}><h5><RefreshCw size={17}/> Was-wäre-wenn</h5>
     <small>Ohne weiteren Service</small></div>
    <div className={styles.timeControl} aria-label="SIM-Projektionszeitraum">
     {[10,20,40].map(n=><button type="button" key={n}
      aria-pressed={minutes===n} className={minutes===n?styles.active:''}
      onClick={()=>setMinutes(n)}>+{n} min</button>)}
    </div>
    <p>Unverbindliche Fortschreibung des vorhandenen SIM-Bedürfnismodells für <strong>{minutes} zusätzliche Simulationsminuten</strong>. Es wird keine echte Uhr gestartet und nichts in der Datenbank geändert.</p>
    <div className={styles.forecastValues}>
     {[
      {label:'Ø Zufriedenheit',value:forecast.satisfaction,now:assessed.averageSatisfaction,
       caution:(forecast.satisfaction??100)<50},
      {label:'Ø Hunger',value:forecast.hunger,now:displayAverage(passengers,'hunger'),
       caution:(forecast.hunger??0)>=65},
      {label:'Ø Durst',value:forecast.thirst,now:displayAverage(passengers,'thirst'),
       caution:(forecast.thirst??0)>=65},
      {label:'Ø WC-Bedürfnis',value:forecast.restroom_need,now:displayAverage(passengers,'restroom_need'),
       caution:(forecast.restroom_need??0)>=65},
      {label:'Ø Müdigkeit',value:forecast.fatigue,now:displayAverage(passengers,'fatigue'),
       caution:(forecast.fatigue??0)>=70}
     ].map(item=><div key={item.label} className={styles.metric}>
      <span>{item.label}</span>
      <div><small>Jetzt {display(item.now)}</small><strong className={item.caution?styles.caution:''}>{display(item.value)}%</strong></div>
      <i className={styles.track}><i style={{width:Math.max(0,Math.min(100,item.value??0))+'%'}}/></i>
     </div>)}
    </div>
    <p className={styles.disclaimer}><ShieldCheck size={16}/>
     Ausschließlich virtuelle Modellwerte. Für echte Kabinentemperatur, Anschnallzeichen und Turbulenzen fehlen derzeit geprüfte MSFS-Bridge-Felder.
    </p>
   </div>
  </div>
 </section>;
}
function displayAverage(passengers:CabinPassengerState[],key:'hunger'|'thirst'|'restroom_need'|'fatigue'){
 const valid=passengers.map(p=>p[key]).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);
 return valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*10)/10:null;
}
