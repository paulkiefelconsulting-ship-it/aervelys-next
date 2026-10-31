'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,Armchair,CheckCircle2,Clock3,Coffee,Plane,RefreshCw,
 ShieldAlert,Utensils,Users,Pause,Play,ClipboardCopy} from 'lucide-react';
import styles from './VirtualSimMissionControl.module.css';

type RequestRow={
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 requested_departure:string;passengers:number;charter_status:string;customer_lifecycle:string;
 aircraft_registration:string|null;plan_status:string|null;
};
type Mission={
 request_id:string;route_text:string;route_origin:'user_simbrief_paste';
 phase:string;lifecycle:'draft'|'running'|'paused'|'completed';
 elapsed_minutes:number;source_mode:'manual_simulation';
 created_at:string;updated_at:string;average_satisfaction:number|null;
};
type Passenger={
 id:string;request_id:string;seat_index:number;satisfaction:number;
 hunger:number;thirst:number;restroom_need:number;comfort:number;fatigue:number;updated_at:string;
};
type EventRow={id:number;request_id:string;event_kind:string;passenger_id:string|null;
 payload:Record<string,unknown>;created_at:string};
type FinanceIndication={
 request_id:string;request_code:string;indicated_price_eur:number|null;
 price_status:string|null;modelled_cost_floor_eur:number|null;
 potential_difference_eur:number|null;revenue_booked:false;costs_booked:false;
 profit_realized:false;source:'fictitious_sim_indication_only';
};
type Overview={finance_indications:FinanceIndication[];requests:RequestRow[];missions:Mission[];passengers:Passenger[];
 events:EventRow[];simulation_only:true;simconnect_connected:false;
 real_flight_approvals:false;route_source:'pilot_simbrief_paste'};
type Ack={simulation_only:true;telemetry_connected?:false;real_flights_modified?:0;
 flight_releases?:0;crew_assignments?:0;financial_postings?:0;created?:boolean;exists?:boolean};
const phases=[
 ['planning','Planung'],['boarding','Boarding'],['taxi_out','Taxi Out'],
 ['takeoff','Takeoff'],['climb','Climb'],['cruise','Cruise'],
 ['descent','Descent'],['approach','Approach'],['landing','Landing'],
 ['taxi_in','Taxi In'],['arrived','Angekommen'],['debrief','Debrief']
] as const;
const services=[
 {key:'water',label:'Wasser',icon:'🥤'},
 {key:'coffee',label:'Kaffee',icon:'☕'},
 {key:'meal',label:'Speisen',icon:'🍽️'},
 {key:'snack',label:'Snack',icon:'🥨'},
 {key:'restroom',label:'WC',icon:'🚻'},
 {key:'blanket',label:'Decke',icon:'🛏️'},
 {key:'conversation',label:'Betreuung',icon:'💬'}
] as const;
function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
function localTime(s:string|null|undefined){
 if(!s)return '—';
 const d=new Date(s);
 return Number.isFinite(d.getTime())?
  d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'—';
}
function phaseName(key:string){return phases.find(p=>p[0]===key)?.[1]||key;}
function inRange(n:number){return Math.max(0,Math.min(100,Number(n)||0));}
function money(n:number|null){return n===null?'—':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n));}

export default function VirtualSimMissionControl(){
 const [snapshot,setSnapshot]=useState<Overview|null>(null);
 const [requestId,setRequestId]=useState('');
 const [route,setRoute]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [seatIndex,setSeatIndex]=useState(1);
 const [nowLabel,setNowLabel]=useState('');
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const {data,error:rpcError}=await db().rpc('aervelys_sim_missions_overview');
   const v=data as Overview|null;
   if(rpcError||!v||!Array.isArray(v.requests)||!Array.isArray(v.missions)||
    !Array.isArray(v.passengers)||!Array.isArray(v.events)||!Array.isArray(v.finance_indications)||
    v.simulation_only!==true||v.simconnect_connected!==false||
    v.real_flight_approvals!==false||v.route_source!=='pilot_simbrief_paste')
    throw Error('SIM mission data unavailable');
   setSnapshot(v);
   setRequestId(old=>v.requests.some(r=>r.request_id===old)?old:(v.requests[0]?.request_id||''));
   setError('');
   setNowLabel(new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}));
  }catch{
   setSnapshot(null);
   setError('Missionsdaten nicht erreichbar. Bitte CEO-/OPS-Rolle und Supabase-Anmeldung prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void load();
  const t=window.setInterval(()=>void load(true),60000);
  return()=>window.clearInterval(t);
 },[load]);
 const current=snapshot?.requests.find(r=>r.request_id===requestId)||null;
 const mission=snapshot?.missions.find(m=>m.request_id===requestId)||null;
 const finance=snapshot?.finance_indications.find(f=>f.request_id===requestId)||null;
 const passengers=useMemo(()=>(snapshot?.passengers||[]).filter(p=>p.request_id===requestId)
  .sort((a,b)=>a.seat_index-b.seat_index),[snapshot,requestId]);
 const events=useMemo(()=>(snapshot?.events||[]).filter(e=>e.request_id===requestId)
  .sort((a,b)=>b.id-a.id),[snapshot,requestId]);
 const passenger=passengers.find(p=>p.seat_index===seatIndex)||passengers[0]||null;
 const phaseIndex=mission?phases.findIndex(p=>p[0]===mission.phase):0;
 const next=phases[phaseIndex+1];
 const isRunning=mission?.lifecycle==='running';
 const canServe=isRunning&&(mission?.phase==='boarding'||mission?.phase==='cruise');
 const avg=mission?.average_satisfaction==null?null:Number(mission.average_satisfaction);
 const serviceCount=events.filter(e=>e.event_kind==='service').length;
 const totalPax=passengers.length;
 async function action(key:string,value:string|null=null,seat:number|null=null){
  if(!mission||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await db().rpc('aervelys_sim_mission_action',{
    p_request_id:mission.request_id,p_action:key,p_value:value,p_seat_index:seat
   });
   const ack=result.data as Ack|null;
   if(result.error||!ack||ack.simulation_only!==true||ack.telemetry_connected!==false||
    ack.real_flights_modified!==0||ack.crew_assignments!==0||ack.financial_postings!==0)
    throw Error(result.error?.message||'Mission action not confirmed');
   await load(true);
   setNotice(key==='service'?'Kabinenservice als fiktives Ereignis dokumentiert.':
    key==='phase'?'SIM-Flugphase manuell fortgesetzt. Keine MSFS-Telemetrie erfasst.':
    key==='clock'?'Kabinenzeit und Passagierbedürfnisse aktualisiert.':
    key==='debrief'?'SIM-Debrief erstellt. Keine echte Flug- oder Finanzbuchung.':
    'SIM-Mission aktualisiert.');
  }catch(e){setError(e instanceof Error?e.message:'SIM-Aktion nicht möglich.');}
  finally{setBusy(false);}
 }
 async function create(){
  if(!current||busy||route.trim().length<3||route.trim().length>1500)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await db().rpc('aervelys_sim_mission_create',{
    p_request_id:current.request_id,p_route:route.trim()
   });
   const ack=r.data as Ack|null;
   if(r.error||!ack||ack.simulation_only!==true||ack.flight_releases!==0)
    throw Error(r.error?.message||'Mission could not be created');
   setNotice(ack.created?'SIM-Mission mit fiktiven Passagieren angelegt. Noch kein Flug gestartet.':
    'SIM-Mission existiert bereits. Bestehenden Zustand verwenden.');
   setRoute('');
   await load(true);
  }catch(e){setError(e instanceof Error?e.message:'SIM-Mission konnte nicht erstellt werden.');}
  finally{setBusy(false);}
 }
 async function copyBrief(){
  if(!current||!mission)return;
  const txt=[
   'AERVELYS NEXT / SIMULATOR BRIEFING — NUR SIMULATION',
   'Charter: '+current.request_code,
   'Strecke: '+current.origin_icao+' - '+current.destination_icao,
   'Abflugplanung: '+localTime(current.requested_departure),
   'Flugzeugvorschlag: '+(current.aircraft_registration||'keine Auswahl'),
   'Crew/Flugzeug nicht operativ freigegeben',
   'Pilot-/SimBrief-Route: '+mission.route_text,
   'Passagiere: '+current.passengers,
   'MSFS/SimConnect: NICHT VERBUNDEN',
   'Flugphasen: ausschließlich manuelle Trainingssimulation'
  ].join('\n');
  try{await navigator.clipboard.writeText(txt);setNotice('SIM-Briefing in die Zwischenablage kopiert.');}
  catch{setError('Kopieren nicht möglich. Bitte Browserzugriff prüfen.');}
 }
 return <section className={'panel '+styles.root} aria-label="AERVELYS NEXT fiktiver Flugbetrieb und Kabinenservice">
  <div className={styles.heading}>
   <div><div className="eyebrow">INTEGRATED SIM MISSION / CABIN EXPERIENCE</div>
    <h2>SIM-Flugbetrieb & Passagierkabine</h2>
    <p className="lead">Vom SIM-Charterauftrag über deine SimBrief-Route bis zum Kabinenservice und Debrief. Flugphasen werden bis zum Anschluss der Windows-Bridge manuell geführt.</p></div>
   <button type="button" className="ops-refresh" onClick={()=>void load()} disabled={loading||busy}>
    <RefreshCw size={15}/> Aktualisieren
   </button>
  </div>
  <div className={styles.safety}><ShieldAlert size={18}/>
   <span><strong>Nur Airline-Simulation.</strong> Keine echten Buchungen, Flugzeug-/Crew-Freigaben oder Positionierungsänderungen. MSFS 2024 und SimConnect sind derzeit nicht verbunden; jede Phasenmeldung stammt aus der manuellen Trainingssimulation. Route wird ausschließlich aus deiner Eingabe übernommen.</span>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {loading&&!snapshot&&<p className={styles.empty}>SIM-Missionen werden geladen …</p>}
  {snapshot&&<>
   <div className={styles.headMetrics}>
    <div><Plane size={17}/><strong>{snapshot.requests.length}</strong><span>SIM-Charterfälle</span></div>
    <div><Activity size={17}/><strong>{snapshot.missions.filter(m=>m.lifecycle==='running').length}</strong><span>Aktive Trainingsmissionen</span></div>
    <div><Users size={17}/><strong>{snapshot.passengers.length}</strong><span>Fiktive Passagiere in Missionen</span></div>
    <div><CheckCircle2 size={17}/><strong>{snapshot.missions.filter(m=>m.lifecycle==='completed').length}</strong><span>SIM-Debriefs</span></div>
   </div>
   <div className={styles.selector}>
    <label htmlFor="sim-mission-request">Charterfall auswählen</label>
    <select id="sim-mission-request" value={requestId}
     onChange={e=>{setRequestId(e.target.value);setSeatIndex(1);setNotice('');setError('');}}>
     {snapshot.requests.map(r=><option value={r.request_id} key={r.request_id}>
      {r.request_code} · {r.origin_icao}–{r.destination_icao}
     </option>)}
    </select>
   </div>
   {!current?<p className={styles.empty}>Noch keine fiktiven Charterfälle vorhanden. Erstelle zunächst Kundenanfragen im Modul „Virtuelle Kunden“.</p>:
   <div className={styles.mission}>
    <div className={styles.top}>
     <div><small>SIM CHARTER / {current.request_code}</small>
      <h3>{current.origin_icao} → {current.destination_icao}</h3>
      <p>{localTime(current.requested_departure)} · {current.passengers} PAX · {current.aircraft_registration||'kein Flugzeugvorschlag'}</p>
      <p>Planungsstatus: {current.plan_status||'nicht vorhanden'} · Kundenphase: {current.customer_lifecycle}</p></div>
     <div className={styles.status}>
      <span>{mission?phaseName(mission.phase):'Noch keine Trainingsmission'}</span>
      <strong>{mission?.lifecycle==='running'?'Simulation läuft':
       mission?.lifecycle==='paused'?'Angehalten':
       mission?.lifecycle==='completed'?'SIM abgeschlossen':'Trainingsvorbereitung'}</strong>
     </div>
    </div>
    {!mission?<div className={styles.create}>
     <label htmlFor="simbrief-route">Deine Route aus SimBrief oder der Flugplanung</label>
     <textarea id="simbrief-route" maxLength={1500} rows={3} value={route}
      onChange={e=>setRoute(e.target.value)} placeholder="z. B. DCT ... AIRWAY ... DCT"/>
     <p>Es wird keine Route automatisch erfunden. Bitte den gewünschten Routentext einfügen; die Mission verändert keine aktive Charterbuchung.</p>
     <button type="button" className="ops-refresh" disabled={busy||route.trim().length<3}
      onClick={()=>void create()}><Plane size={16}/> Trainingsmission vorbereiten</button>
    </div>:
    <>
     <div className={styles.brief}>
      <div><small>Flight plan / user input</small><p>{mission.route_text}</p></div>
      <button type="button" className="ops-refresh" onClick={()=>void copyBrief()}>
       <ClipboardCopy size={15}/> Briefing kopieren
      </button>
     </div>
     <div className={styles.metrics}>
      <div><strong>{mission.elapsed_minutes} min</strong><span>Simulierte Bordzeit</span></div>
      <div><strong>{avg===null?'—':avg.toFixed(1)+' / 100'}</strong><span>Ø Passagierzufriedenheit</span></div>
      <div><strong>{serviceCount}</strong><span>Protokollierte Servicevorgänge</span></div>
      <div><strong>{totalPax}</strong><span>Fiktive Passagiere</span></div>
     </div>
     <div className={styles.finance}>
      <div className={styles.sectionHeader}>
       <h4>SIM-Vertrieb & Kalkulation</h4>
       <small>Unverbindliche Rechenwerte · keine Einnahmen oder Gewinne gebucht</small>
      </div>
      <div className={styles.financeGrid}>
       <div><span>Letzter fiktiver Angebotspreis</span><strong>{money(finance?.indicated_price_eur??null)}</strong></div>
       <div><span>SIM-Modellkosten / Vergleich</span><strong>{money(finance?.modelled_cost_floor_eur??null)}</strong></div>
       <div><span>Rechnerische Differenz</span><strong>{money(finance?.potential_difference_eur??null)}</strong></div>
      </div>
      <p>{finance?.price_status?'SIM-Angebotsstatus: '+finance.price_status+' · ':''}Keine bestätigte Kundenzusage, keine echten Kosten und keine Finanzbuchung.</p>
     </div>
     <div className={styles.phaseBox}>
      <div className={styles.sectionHeader}><h4>Flugphasen</h4><small>Manuelle Eingabe · keine automatische MSFS-Erkennung</small></div>
      <div className={styles.phaseTimeline}>
       {phases.map(([code,label],i)=><span key={code}
        className={i<phaseIndex?styles.past:i===phaseIndex?styles.current:''}>
        {label}
       </span>)}
      </div>
      <div className={styles.actionRow}>
       {mission.lifecycle==='draft'&&<button type="button" className="ops-refresh"
        disabled={busy} onClick={()=>void action('start')}><Play size={15}/> Boarding-Simulation starten</button>}
       {mission.lifecycle==='running'&&<>
        {next&&next[0]!=='debrief'&&<button type="button" className="ops-refresh"
         disabled={busy} onClick={()=>void action('phase',next[0])}>
         <Plane size={15}/> Nächste Phase: {next[1]}</button>}
        {mission.phase==='arrived'&&<button type="button" className="ops-refresh"
         disabled={busy} onClick={()=>void action('debrief')}><CheckCircle2 size={15}/> SIM-Debrief erstellen</button>}
        {mission.phase!=='arrived'&&<button type="button" className="ops-refresh" disabled={busy}
         onClick={()=>void action('pause')}><Pause size={15}/> Simulationsuhr pausieren</button>}
        {mission.phase!=='arrived'&&<>
         <button type="button" className="ops-refresh" disabled={busy}
          onClick={()=>void action('clock','10')}><Clock3 size={15}/> +10 Min</button>
         <button type="button" className="ops-refresh" disabled={busy}
          onClick={()=>void action('clock','30')}><Clock3 size={15}/> +30 Min</button>
        </>}
       </>}
       {mission.lifecycle==='paused'&&<button type="button" className="ops-refresh"
        disabled={busy} onClick={()=>void action('resume')}><Play size={15}/> Simulation fortsetzen</button>}
      </div>
     </div>
     <div className={styles.cabin}>
      <div className={styles.sectionHeader}><h4><Armchair size={17}/> Passagierkabine</h4>
       <small>Bedürfnisse wachsen mit der simulierten Zeit · Service nur in Boarding/Cruise</small></div>
      <div className={styles.cabinGrid}>
       <div className={styles.passengerList}>
        {passengers.map(p=><button type="button" key={p.id}
         className={p.seat_index===passenger?.seat_index?styles.selectedPassenger:''}
         onClick={()=>setSeatIndex(p.seat_index)}>
         <span>PAX {String(p.seat_index).padStart(2,'0')}</span>
         <strong>{p.satisfaction}%</strong>
         <small>Wohlbefinden</small>
         <i className={styles.progress}><i style={{width:inRange(p.satisfaction)+'%'}}/></i>
        </button>)}
       </div>
       {passenger&&<div className={styles.passengerDetail}>
        <h5>PAX {String(passenger.seat_index).padStart(2,'0')}</h5>
        <div className={styles.needs}>
         {([['Zufriedenheit',passenger.satisfaction,false],['Hunger',passenger.hunger,true],
           ['Durst',passenger.thirst,true],['WC-Bedürfnis',passenger.restroom_need,true],
           ['Komfort',passenger.comfort,false],['Müdigkeit',passenger.fatigue,true]] as const)
          .map(([label,value,bad])=><div key={label}>
           <span>{label}</span><strong>{value}%</strong>
           <i className={styles.progress}><i style={{width:inRange(value)+'%'}}
             className={(bad?value>=65:value<40)?styles.warning:''}/></i>
          </div>)}
        </div>
        <div className={styles.services}>
         <h5><Coffee size={16}/> Kabinenservice</h5>
         <div>{services.map(s=><button type="button" key={s.key}
          disabled={busy||!canServe||(s.key==='coffee'||s.key==='meal')&&mission.phase!=='cruise'}
          onClick={()=>void action('service',s.key,passenger.seat_index)}>
          <span>{s.icon}</span>{s.label}</button>)}</div>
        </div>
       </div>}
      </div>
     </div>
     <div className={styles.debrief}>
      <div className={styles.sectionHeader}><h4><ClipboardListFallback/> Missionsprotokoll</h4>
       <small>{nowLabel?('Letzter Abruf: '+nowLabel):''} · aktuell maximal 160 Ereignisse</small></div>
      {events.length===0?<p>Noch kein protokolliertes Ereignis.</p>:
       <div className={styles.events}>{events.slice(0,20).map(e=><div key={e.id}>
        <small>{localTime(e.created_at)}</small>
        <strong>{e.event_kind==='service'?
         ('Service: '+String(e.payload.service||'')+' · PAX '+e.payload.seat):
         e.event_kind==='phase_changed'?
         ('Phasenwechsel → '+phaseName(String(e.payload.next||''))):
         e.event_kind==='cabin_clock'?
         ('SIM-Zeit +'+String(e.payload.minutes||0)+' Min'):
         e.event_kind==='debrief'?'SIM-Debrief':
         e.event_kind==='mission_created'?'Mission vorbereitet':
         e.event_kind}</strong>
        {e.event_kind==='debrief'&&<span>Ø {String(e.payload.pax_satisfaction_avg||'—')}/100 · kein echter Flug</span>}
       </div>)}</div>}
     </div>
    </>}
   </div>}
   <p className={styles.footer}>AERVELYS NEXT bewertet hier ausschließlich manuelle Simulationsaktionen und fiktive Passagierzustände. Die Windows-SimConnect-Bridge muss für automatische Flugphasenerkennung gesondert gekoppelt und getestet werden.</p>
  </>}
 </section>;
}
function ClipboardListFallback(){return <Utensils size={16}/>;}
