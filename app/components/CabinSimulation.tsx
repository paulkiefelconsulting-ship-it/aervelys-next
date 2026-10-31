'use client';
import {useEffect,useMemo,useState} from 'react';
import {Coffee,GlassWater,Utensils,Toilet,ShieldAlert,RefreshCw,Users,Sun,Activity,Clock3} from 'lucide-react';
import {adjustCabin,advanceCabin,averageSatisfaction,cabinSummary,guestSatisfaction,initialCabin,performCabinService,canMoveInCabin,canProvideHotFood,SERVICE_NAMES,type CabinPhase,type CabinState,type ServiceKind} from '../lib/cabinSimulation';
import styles from './CabinSimulation.module.css';
type Props={elapsedMinutes:number;phase:CabinPhase;flightKey:string;playing:boolean;onToggle:()=>void;publicDemo:boolean};
const services:{kind:ServiceKind;icon:typeof Coffee;label:string}[]=[
 {kind:'cold_drink',icon:GlassWater,label:'Kaltgetränke'},
 {kind:'coffee',icon:Coffee,label:'Kaffee / Tee'},
 {kind:'meal',icon:Utensils,label:'Menü'},
 {kind:'snack',icon:Utensils,label:'Snacks'},
 {kind:'wc',icon:Toilet,label:'WC-Besuch'}
];
const clock=(min:number)=>Math.floor(min/60)+'h '+String(min%60).padStart(2,'0')+'m';
export default function CabinSimulation({elapsedMinutes,phase,flightKey,playing,onToggle,publicDemo}:Props){
 const [count,setCount]=useState(5);
 const [state,setState]=useState<CabinState>(()=>initialCabin(5));
 const [status,setStatus]=useState('');
 useEffect(()=>{setState(initialCabin(count));setStatus('');},[flightKey,count]);
 useEffect(()=>{setState(current=>advanceCabin(current,elapsedMinutes,phase));},[elapsedMinutes,phase]);
 const summary=useMemo(()=>cabinSummary(state),[state]);
 const canMove=canMoveInCabin(phase,state.turbulence);
 const hotAllowed=canProvideHotFood(phase,state.turbulence);
 function serve(kind:ServiceKind){
  const next=performCabinService(state,kind,phase);
  if(next.error){setStatus(next.error);return;}
  setState(next.state);setStatus(SERVICE_NAMES[kind]+' abgeschlossen');
 }
 function environment(temp:number,turbulence:CabinState['turbulence']){setState(s=>adjustCabin(s,temp,turbulence));setStatus('');}
 return <section className={styles.section}>
  <div className={styles.heading}><div><span className={styles.eyebrow}>AERVELYS · CABIN SIMULATION ENGINE</span><h3>Passagiererlebnis & Bordservice</h3><p>Fiktive Gäste mit individuellen Bedürfnissen. Die Kabinensimulation reagiert auf den Demo-Flugfortschritt und sperrt Services während kritischer Flugphasen.</p></div>
  <div className={styles.meta}><span><Users size={15}/> {count} Gäste</span><span><Clock3 size={15}/> T+{clock(state.minute)}</span></div></div>
  <div className={styles.stats}>
   <div><small>ZUFRIEDENHEIT</small><strong>{summary.satisfaction}<span>/100</span></strong><div className={styles.meter}><span style={{width:summary.satisfaction+'%',background:summary.satisfaction>=70?'#72e1c2':summary.satisfaction>=45?'#f0b25e':'#ed7777'}}/></div></div>
   <div><small>OFFENE WÜNSCHE</small><strong>{summary.openRequests}</strong><span>Serviceanfragen</span></div>
   <div><small>GETRÄNKE / SPEISEN</small><strong>{summary.drinks} / {summary.meals}</strong><span>Ausgegebene Services</span></div>
   <div><small>WC-BESUCHE</small><strong>{summary.wcVisits}</strong><span>Im Flug simuliert</span></div>
  </div>
  <div className={styles.controls}>
   <label>Passagiere<select value={count} onChange={e=>setCount(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} Gäste</option>)}</select></label>
   <label><Sun size={14}/> Temperatur <strong>{state.temperature} °C</strong><input aria-label="Kabinentemperatur" type="range" min={18} max={27} value={state.temperature} onChange={e=>environment(Number(e.target.value),state.turbulence)}/></label>
   <label><Activity size={14}/> Turbulenz<select value={state.turbulence} onChange={e=>environment(state.temperature,e.target.value as CabinState['turbulence'])}><option value="calm">Ruhig</option><option value="light">Leicht</option><option value="moderate">Mäßig</option><option value="severe">Stark</option></select></label>
   {publicDemo&&<button className={styles.reset} type="button" onClick={()=>{setState(initialCabin(count));setStatus('Simulation zurückgesetzt');}}><RefreshCw size={14}/> Zurücksetzen</button>}
  </div>
  {!canMove&&<p className={styles.warning}><ShieldAlert size={16}/> Kabinenservice und WC aktuell gesperrt: {['takeoff','landing','taxi','approach','parked'].includes(phase)?'kritische Flugphase':'Turbulenz / Anschnallzeichen'}. Gäste bleiben angeschnallt.</p>}
  <div className={styles.columns}>
   <div className={styles.panel}>
    <div className={styles.panelHead}><h4>Service durchführen</h4><span>Ein Service pro Aktion</span></div>
    <div className={styles.serviceGrid}>{services.map(({kind,icon:Icon,label})=><button key={kind} type="button" disabled={!canMove||(['coffee','meal'].includes(kind)&&!hotAllowed)} onClick={()=>serve(kind)}><Icon size={20}/><strong>{label}</strong><small>{kind==='coffee'||kind==='meal'?'nur ruhiger Reiseflug':kind==='wc'?'1 Bordtoilette':'Kabinenservice'}</small></button>)}</div>
    <div className={styles.panelHead}><h4>Offene Passagierwünsche</h4><span>{summary.openRequests} offen</span></div>
    <div className={styles.queue}>{state.requests.filter(r=>r.status==='open').slice(0,8).map(r=><div key={r.id}><span>{state.guests.find(g=>g.id===r.guestId)?.label||r.guestId}</span><strong>{SERVICE_NAMES[r.type]}</strong><small>seit T+{clock(r.createdAt)}</small></div>)}{!summary.openRequests&&<p className={styles.noRequests}>Aktuell keine offenen Servicewünsche.</p>}</div>
    {status&&<p role="status" className={styles.status}>{status}</p>}
    <p className={styles.note}>Die Simulation verschlechtert bzw. verbessert die Zufriedenheit nach Zeit, Bedürfnissen, Kabinentemperatur, Turbulenz und Service. Kein reales Passagierfeedback.</p>
   </div>
   <div className={styles.panel}>
    <div className={styles.panelHead}><h4>Gästeübersicht</h4><span>fiktive Passagiere</span></div>
    <div className={styles.guests}>{state.guests.map(g=>{
     const satisfaction=guestSatisfaction(g,state.temperature,state.turbulence);
     return <div key={g.id} className={styles.guest}>
      <div><strong>{g.label}</strong><span>{g.wcVisitEnd!==null&&g.wcVisitEnd>state.minute?'🚻 Im WC':'Zufriedenheit '+satisfaction+'/100'}</span></div>
      <div className={styles.guestMeters}>
       <label>Durst <div><span style={{width:g.thirst+'%'}}/></div><small>{Math.round(g.thirst)}%</small></label>
       <label>Hunger <div><span style={{width:g.hunger+'%'}}/></div><small>{Math.round(g.hunger)}%</small></label>
       <label>WC <div><span style={{width:g.wc+'%'}}/></div><small>{Math.round(g.wc)}%</small></label>
      </div>
     </div>;
    })}</div>
   </div>
  </div>
  <div className={styles.timeline}><h4>Ereignisprotokoll</h4><div>{state.events.slice(0,8).map((event,i)=><p key={i}><time>T+{clock(event.minute)}</time>{event.label}</p>)}</div></div>
 </section>;
}
