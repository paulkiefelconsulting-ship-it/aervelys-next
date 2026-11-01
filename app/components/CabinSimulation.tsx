'use client';
import {useEffect,useMemo,useState} from 'react';
import {Activity,Armchair,Check,ChevronRight,Clock3,Coffee,GlassWater,Heart,RefreshCw,ShieldAlert,Sparkles,Sun,Toilet,Utensils,Users} from 'lucide-react';
import {adjustCabin,advanceCabinWithCrew,cabinSummary,guestSatisfaction,initialCabin,performCabinService,canMoveInCabin,canProvideHotFood,SERVICE_NAMES,type CabinPhase,type CabinState,type ServiceKind} from '../lib/cabinSimulation';
import styles from './CabinSimulation.module.css';
type Props={elapsedMinutes:number;phase:CabinPhase;flightKey:string;playing:boolean;onToggle:()=>void;publicDemo:boolean;livePhase:boolean;elapsedBasis:'takeoff'|'connection'};
const services:{kind:ServiceKind;icon:typeof Coffee;label:string;caption:string}[]=[
 {kind:'cold_drink',icon:GlassWater,label:'Kaltgetränk',caption:'Wasser · Softdrinks'},
 {kind:'coffee',icon:Coffee,label:'Kaffee & Tee',caption:'Heißgetränke'},
 {kind:'meal',icon:Utensils,label:'Dining',caption:'Menüservice'},
 {kind:'snack',icon:Utensils,label:'Snacks',caption:'Kleine Speisen'},
 {kind:'wc',icon:Toilet,label:'Lavatory',caption:'WC-Besuch'}
];
const phaseNames:Record<CabinPhase,string>={parked:'Am Gate',taxi:'Taxi',takeoff:'Take-off',climb:'Climb',cruise:'Cruise',descent:'Descent',approach:'Approach',landing:'Landing'};
const clock=(min:number)=>Math.floor(min/60)+'h '+String(min%60).padStart(2,'0')+'m';
export default function CabinSimulation({elapsedMinutes,phase,flightKey,playing,onToggle,publicDemo,livePhase,elapsedBasis}:Props){
 const [count,setCount]=useState(5);
 const [state,setState]=useState<CabinState>(()=>initialCabin(5));
 const [selectedId,setSelectedId]=useState('P01');
 const [autoCrew,setAutoCrew]=useState(true);
 const [status,setStatus]=useState('');
 useEffect(()=>{setState(initialCabin(count));setSelectedId('P01');setStatus('');},[flightKey,count]);
 useEffect(()=>{setState(current=>advanceCabinWithCrew(elapsedMinutes<current.minute?initialCabin(count):current,elapsedMinutes,phase,autoCrew));},[elapsedMinutes,phase,autoCrew,flightKey,count]);
 const summary=useMemo(()=>cabinSummary(state),[state]);
 const selected=state.guests.find(g=>g.id===selectedId)??state.guests[0];
 const selectedScore=selected?guestSatisfaction(selected,state.temperature,state.turbulence):0;
 const canMove=canMoveInCabin(phase,state.turbulence);
 const hotAllowed=canProvideHotFood(phase,state.turbulence);
 const openRequests=state.requests.filter(r=>r.status==='open').sort((a,b)=>a.createdAt-b.createdAt);
 const mood=summary.satisfaction>=75?'Exzellent':summary.satisfaction>=55?'Ausgeglichen':'Service erforderlich';
 function serve(kind:ServiceKind){
  const next=performCabinService(state,kind,phase,selected?.id);
  if(next.error){setStatus(next.error);return;}
  setState(next.state);setStatus((selected?.label||'Gast')+' · '+SERVICE_NAMES[kind]+' abgeschlossen');
 }
 function environment(temp:number,turbulence:CabinState['turbulence']){setState(s=>adjustCabin(s,temp,turbulence));setStatus('');}
 const reset=()=>{setState(advanceCabinWithCrew(initialCabin(count),elapsedMinutes,phase,autoCrew));setStatus('Simulation für aktuelle Flugzeit zurückgesetzt');};
 return <section className={styles.section}>
  <div className={styles.heading}>
   <div className={styles.headingMain}>
    <span className={styles.eyebrow}><Sparkles size={14}/> AERVELYS / CABIN OPERATIONS</span>
    <h3>Cabin Experience <span>Studio</span></h3>
    <p>Ein virtuelles Kabinenteam begleitet deinen Flug. Wünsche, Komfort und Service folgen {livePhase?'der von MSFS gemeldeten Flugphase und der verstrichenen Live-Zeit.':'der simulierten Flugzeit.'}</p>
   </div>
   <div className={styles.headingPills}><span><Users size={14}/>{count} Gäste</span><span><Clock3 size={14}/> T+{clock(state.minute)} {livePhase?(elapsedBasis==='takeoff'?'ab Start':'ab Link'):''}</span><span className={styles.phasePill}>{phaseNames[phase]} · {livePhase?'MSFS LIVE':'Demo'}</span></div>
  </div>

  <div className={styles.overview}>
   <div className={styles.satisfactionCard}>
    <div className={styles.cardTop}>GUEST EXPERIENCE <Heart size={17}/></div>
    <div className={styles.satisfactionContent}>
     <div className={styles.ring} style={{background:'conic-gradient(#72e8d0 '+summary.satisfaction+'%,rgba(101,145,173,.18) 0)'}}>
      <div><strong>{summary.satisfaction}</strong><small>/100</small></div>
     </div>
     <div><strong>{mood}</strong><span>Durchschnittliche Zufriedenheit</span><small>Berechnet aus Bedürfnissen, Temperatur und Service</small></div>
    </div>
   </div>
   <div className={styles.metricCard}><small>OFFENE WÜNSCHE</small><strong>{summary.openRequests.toString().padStart(2,'0')}</strong><span>{summary.openRequests?'Crew-Aufgaben im Blick':'Alle Wünsche erfüllt'}</span></div>
   <div className={styles.metricCard}><small>SERVICES</small><strong>{summary.drinks+summary.meals}</strong><span>{summary.drinks} Drinks · {summary.meals} Meals</span></div>
   <div className={styles.metricCard}><small>LAVATORY</small><strong>{summary.wcVisits}</strong><span>Simulierte WC-Besuche</span></div>
  </div>

  <div className={styles.crewStrip}>
   <div className={styles.crewInfo}><div className={styles.crewIcon}><Sparkles size={18}/></div><div><strong>Cabin Crew Autopilot</strong><span>{autoCrew?'Aktiv: fällige Getränke und Speisen werden selbständig serviert.':'Manuell: Du steuerst jeden Service selbst.'}</span></div></div>
   <button type="button" role="switch" aria-checked={autoCrew} className={autoCrew?styles.autoEnabled:styles.autoDisabled} onClick={()=>setAutoCrew(v=>!v)}><span className={styles.switchTrack}><span/></span>{autoCrew?'Auto-Crew AN':'Auto-Crew AUS'}</button>
  </div>

  <div className={styles.controls}>
   <label><Users size={15}/> Passagiere <select aria-label="Anzahl simulierte Gäste" value={count} onChange={e=>setCount(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <label><Sun size={15}/> Kabinentemperatur <strong>{state.temperature} °C</strong><input aria-label="Kabinentemperatur" type="range" min={18} max={27} value={state.temperature} onChange={e=>environment(Number(e.target.value),state.turbulence)}/></label>
   <label><Activity size={15}/> Turbulenz <select aria-label="Turbulenz" value={state.turbulence} onChange={e=>environment(state.temperature,e.target.value as CabinState['turbulence'])}><option value="calm">Ruhig</option><option value="light">Leicht</option><option value="moderate">Mäßig</option><option value="severe">Stark</option></select></label>
   {publicDemo&&<button className={styles.reset} type="button" onClick={reset}><RefreshCw size={15}/> Reset</button>}
  </div>
  {!canMove&&<div className={styles.warning}><ShieldAlert size={17}/><span>Cabin secure: {['takeoff','landing','taxi','approach','parked'].includes(phase)?'Kritische Flugphase – Service pausiert.':'Turbulenz – Service und WC vorübergehend gesperrt.'}</span></div>}

  <div className={styles.columns}>
   <div className={styles.panel}>
    <div className={styles.panelHead}><div><small>CREW WORKSPACE</small><h4>Service & Wünsche</h4></div><span className={styles.queueCount}>{summary.openRequests} offen</span></div>
    <div className={styles.serviceTitle}>Service für <strong>{selected?.label||'—'}</strong> <ChevronRight size={15}/></div>
    <div className={styles.serviceGrid}>{services.map(({kind,icon:Icon,label,caption})=><button key={kind} type="button" disabled={!canMove||(['coffee','meal'].includes(kind)&&!hotAllowed)||!selected} onClick={()=>serve(kind)}>
     <span className={styles.serviceIcon}><Icon size={21}/></span><strong>{label}</strong><small>{caption}</small>
    </button>)}</div>
    <div className={styles.requestTitle}>Service Queue <span>{openRequests.length} Anfragen</span></div>
    <div className={styles.queue}>{openRequests.slice(0,8).map(r=><button type="button" key={r.id} className={styles.request} onClick={()=>setSelectedId(r.guestId)}>
      <span className={styles.requestDot}/><span>{state.guests.find(g=>g.id===r.guestId)?.label||r.guestId}<small>T+{clock(r.createdAt)}</small></span><strong>{SERVICE_NAMES[r.type]}</strong><ChevronRight size={14}/>
    </button>)}{openRequests.length===0&&<div className={styles.empty}><Check size={17}/> Keine offenen Wünsche. Deine Gäste sind versorgt.</div>}</div>
    {status&&<p role="status" className={styles.status}>{status}</p>}
   </div>
   <div className={styles.panel}>
    <div className={styles.panelHead}><div><small>PASSENGER MANIFEST</small><h4>Kabinensitzplan</h4></div><span className={styles.passengerCount}>{count} / 8</span></div>
    <div className={styles.seatMap}>
     <div className={styles.seatLabel}><Armchair size={15}/> FORWARD CABIN</div>
     <div className={styles.seats}>{state.guests.map(g=>{
      const score=guestSatisfaction(g,state.temperature,state.turbulence);
      return <button key={g.id} type="button" className={selected?.id===g.id?styles.selectedSeat:styles.seat} onClick={()=>setSelectedId(g.id)} aria-pressed={selected?.id===g.id}>
       <Armchair size={19}/><span>{g.id}</span><small>{score}%</small>
      </button>;
     })}</div>
     <div className={styles.seatLabel}>AERVELYS · PRIVATE CABIN</div>
    </div>
    {selected&&<div className={styles.guestDetail}>
     <div className={styles.guestHeader}><div><small>AUSGEWÄHLTER GAST</small><strong>{selected.label}</strong></div><div><strong>{selectedScore}%</strong><span>Zufriedenheit</span></div></div>
     <div className={styles.guestMeters}>
      {([['Durst',selected.thirst],['Hunger',selected.hunger],['WC-Bedarf',selected.wc]] as const).map(([label,value])=><div key={label}><div><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className={styles.needTrack}><div style={{width:value+'%',background:value>=75?'#f5aa7d':'#6dcbe9'}}/></div></div>)}
     </div>
     <div className={styles.guestFooter}>{selected.wcVisitEnd!==null&&selected.wcVisitEnd>state.minute?'WC derzeit belegt':selected.drinks+' Getränke · '+selected.meals+' Speisen · '+selected.wcCount+' WC-Besuche'}</div>
    </div>}
   </div>
  </div>
  <div className={styles.timeline}><div className={styles.timelineTitle}><span><Activity size={15}/> LIVE CABIN LOG</span><small>Simulierte Ereignisse</small></div><div>{state.events.slice(0,7).map((event,i)=><div key={i}><time>{clock(event.minute)}</time><span className={styles.eventDot}/><p>{event.label}</p></div>)}</div></div>
  <p className={styles.disclaimer}><ShieldAlert size={14}/> {livePhase?'Die Flugphase stammt aus MSFS; Gäste, Bedürfnisse und alle Bordservices sind rein simuliert. Die verstrichene Zeit beginnt '+(elapsedBasis==='takeoff'?'mit dem durch die Bridge beobachteten Start.':'erst mit der lokalen Live-Verbindung (Start nicht beobachtet).'):'Alle Gäste und Services sind simuliert. Auto-Crew verwendet vereinfachte Regeln und repräsentiert weder echte Crew noch reale Passagierdaten.'}</p>
 </section>;
}
