'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Activity,ArrowRight,CheckCircle2,Clock3,CloudOff,Link2,Plane,
 RefreshCw,ShieldAlert,Unlink,Wifi} from 'lucide-react';
import styles from './MsfsCharterSessionLink.module.css';

type Device={id:string;device_name:string;online:boolean;last_seen_at:string|null};
type Session={device_id:string;session_id:string;device_name:string;
 last_seen_at:string;observed_at:string;phase:string;fresh:boolean;
 sample:{latitude:number|null;longitude:number|null;altitude_ft:number|null;
 groundspeed_kt:number|null;aircraft_title:string|null}};
type Mission={request_id:string;request_code:string;origin_icao:string;
 destination_icao:string;passengers:number;phase:string;lifecycle:'running';route_text:string};
type LiveSample={phase:string;observed_at:string;received_at:string;
 altitude_ft:number|null;groundspeed_kt:number|null;latitude:number|null;longitude:number|null};
type Link={link_id:string;device_id:string;device_name:string;session_id:string;
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 linked_at:string;status:'receiving'|'offline'|'device_revoked'|'mission_not_running';
 last_sample:LiveSample|null};
type Overview={devices:Device[];sessions:Session[];missions:Mission[];links:Link[];
 simulation_only:true;automatic_phase_control:false;
 real_flights_modified:0;real_crew_modified:0;financial_postings:0};
type Ack={simulation_only:true;automatic_phase_control:false;
 real_flights_modified:0;financial_postings:0;
 linked?:true;unlinked?:true;link_id:string};
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase Verbindung fehlt');
 return createBrowserClient(url,key);
}
const keyOf=(s:{device_id:string;session_id:string})=>s.device_id+':'+s.session_id;
const fmt=(v:string|null)=>v&&Number.isFinite(Date.parse(v))?
 new Date(v).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'medium'}):'—';
const n=(v:number|null,dec=0)=>typeof v==='number'&&Number.isFinite(v)?
 v.toLocaleString('de-DE',{maximumFractionDigits:dec}):'—';

export default function MsfsCharterSessionLink({onlyRequestId}:{onlyRequestId?:string}){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [sessionKey,setSessionKey]=useState('');
 const [missionId,setMissionId]=useState(onlyRequestId||'');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const response=await client().rpc('aervelys_msfs_charter_links_overview');
   const v=response.data as Overview|null;
   if(response.error||!v||!Array.isArray(v.devices)||!Array.isArray(v.sessions)||
     !Array.isArray(v.missions)||!Array.isArray(v.links)||
     v.simulation_only!==true||v.automatic_phase_control!==false||
     v.real_flights_modified!==0||v.real_crew_modified!==0||v.financial_postings!==0)
    throw Error('Unbekannter SIM-Datenvertrag');
   setOverview(v);
   setSessionKey(current=>v.sessions.some(s=>keyOf(s)===current)?current:
    (v.sessions.find(s=>s.fresh)?keyOf(v.sessions.find(s=>s.fresh)!):''));
   setMissionId(current=>onlyRequestId||(
     v.missions.some(m=>m.request_id===current)?current:(v.missions[0]?.request_id||'')));
   setError('');
  }catch{
   setError('Cloud-Missionszuordnung nicht erreichbar. CEO-/OPS-Rolle und Supabase-Zugriff prüfen.');
  }finally{setLoading(false);}
 },[onlyRequestId]);
 useEffect(()=>{
  void refresh();
  const interval=window.setInterval(()=>void refresh(true),12000);
  return()=>window.clearInterval(interval);
 },[refresh]);
 const sessions=useMemo(()=>(overview?.sessions||[]).slice().sort((a,b)=>
  Number(b.fresh)-Number(a.fresh)||Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at)),[overview]);
 const selectedSession=sessions.find(s=>keyOf(s)===sessionKey)||null;
 const activeLinkForSession=overview?.links.find(l=>keyOf(l)===sessionKey)||null;
 const activeLinkForMission=overview?.links.find(l=>l.request_id===missionId)||null;
 const currentLinks=onlyRequestId?(overview?.links||[]).filter(l=>l.request_id===onlyRequestId):
  (overview?.links||[]);
 const canLink=Boolean(!busy&&!loading&&selectedSession?.fresh&&missionId&&
  !activeLinkForSession&&!activeLinkForMission&&(overview?.missions||[]).some(m=>m.request_id===missionId));
 async function link(){
  if(!canLink||!selectedSession)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_msfs_charter_link',{
    p_device_id:selectedSession.device_id,
    p_session_id:selectedSession.session_id,p_request_id:missionId
   });
   const a=r.data as Ack|null;
   if(r.error||!a||a.linked!==true||a.simulation_only!==true||
    a.automatic_phase_control!==false||a.real_flights_modified!==0||
    a.financial_postings!==0)throw Error(r.error?.message||'Zuordnung nicht bestätigt');
   setNotice('Sitzung als SIM-Evidenz verknüpft. Automatische Flugphasen bleiben deaktiviert.');
   await refresh(true);
  }catch(e){setError(e instanceof Error?e.message:'SIM-Zuordnung nicht möglich');}
  finally{setBusy(false);}
 }
 async function unlink(linkId:string){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_msfs_charter_unlink',{p_link_id:linkId});
   const a=r.data as Ack|null;
   if(r.error||!a||a.unlinked!==true||a.simulation_only!==true||
     a.automatic_phase_control!==false||a.real_flights_modified!==0||
     a.financial_postings!==0)throw Error(r.error?.message||'Trennung nicht bestätigt');
   setNotice('Verknüpfung getrennt und protokolliert. SIM-Mission bleibt unverändert.');
   await refresh(true);
  }catch(e){setError(e instanceof Error?e.message:'Trennung fehlgeschlagen');}
  finally{setBusy(false);}
 }
 return <section className={styles.root} aria-label="MSFS Sitzung einem SIM Charterflug zuordnen">
  <div className={styles.heading}>
   <div>
    <div className="eyebrow">AERVELYS NEXT / SIM FLIGHT ASSOCIATION</div>
    <h3><Link2 size={20}/> MSFS-Sitzung mit Chartermission verbinden</h3>
    <p>Verknüpfe eine serverseitig empfangene Simulatorsitzung mit einem bereits gestarteten, fiktiven Charterflug. Flugphase und Messwerte sind SIM-Evidenz, keine Freigabe.</p>
   </div>
   <button type="button" className="ops-refresh" disabled={busy||loading} onClick={()=>void refresh()}>
    <RefreshCw size={15}/> Status prüfen
   </button>
  </div>
  <div className={styles.safety}><ShieldAlert size={16}/>
   <span>Nur bestätigte Cloud-Telemetrie kann verknüpft werden. Die lokale <code>telemetry.json</code> reicht dafür allein nicht aus. Es erfolgen keine Crew-/Finanzänderungen und keine automatischen Missionsphasen.</span>
  </div>
  {loading&&!overview&&<p className={styles.muted}>Sitzungen und laufende Trainingsmissionen werden geladen …</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {overview&&<>
   <div className={styles.kpis}>
    <div><Wifi size={17}/><strong>{overview.devices.filter(d=>d.online).length}</strong><span>Cloud-Geräte online</span></div>
    <div><Activity size={17}/><strong>{sessions.filter(s=>s.fresh).length}</strong><span>Frisch empfangene Sitzungen</span></div>
    <div><Plane size={17}/><strong>{overview.missions.length}</strong><span>Laufende SIM-Missionen</span></div>
    <div><Link2 size={17}/><strong>{overview.links.length}</strong><span>Aktive Zuordnungen</span></div>
   </div>
   {!sessions.some(s=>s.fresh)&&<div className={styles.empty}>
    <CloudOff size={19}/>
    <div><strong>Keine aktuelle Cloud-MSFS-Sitzung</strong>
     <p>Starte die bestehende Windows-Bridge und verwende ihre Cloud-Kopplung in „MSFS-Integration → Simulator Live Bridge“. Die lokale Dateianzeige oben ist davon unabhängig. Nach dem ersten serverseitigen Empfang erscheint die Sitzung hier.</p>
    </div>
   </div>}
   {overview.missions.length===0&&<div className={styles.empty}>
    <Plane size={18}/>
    <div><strong>Keine laufende SIM-Mission</strong>
     <p>Öffne „SIM-Flugbetrieb & Kabine“, wähle eine AV-SIM-Charteranfrage aus, füge deine SimBrief-Route ein und starte das Boarding. Erst danach wird ein Charterflug zur Verknüpfung angeboten.</p>
    </div>
   </div>}
   {sessions.length>0&&<div className={styles.pair}>
    <label>Cloud-Sitzung
     <select value={sessionKey} disabled={busy||sessions.every(s=>!s.fresh)}
      onChange={e=>setSessionKey(e.target.value)}>
      <option value="">Sitzung auswählen</option>
      {sessions.map(s=><option key={keyOf(s)} value={keyOf(s)}>
       {s.device_name} · {s.phase} · {s.fresh?'LIVE':'VERALTET'} · {s.session_id.slice(0,8)}
      </option>)}
     </select>
    </label>
    <ArrowRight size={21} className={styles.arrow}/>
    <label>Virtuelle Chartermission
     <select value={missionId} disabled={Boolean(onlyRequestId)||busy||!overview.missions.length}
      onChange={e=>setMissionId(e.target.value)}>
      <option value="">SIM-Mission auswählen</option>
      {overview.missions.map(m=><option key={m.request_id} value={m.request_id}>
       {m.request_code} · {m.origin_icao}–{m.destination_icao} · {m.phase}
      </option>)}
     </select>
    </label>
    <button type="button" className={styles.primary} disabled={!canLink} onClick={()=>void link()}>
     <Link2 size={16}/> Als SIM-Nachweis verbinden
    </button>
   </div>}
   {selectedSession&&<div className={styles.selected}>
    <span><strong>Letztes Cloud-Signal</strong> {fmt(selectedSession.last_seen_at)}</span>
    <span>Phase: <strong>{selectedSession.phase}</strong></span>
    <span>Höhe MSL: <strong>{n(selectedSession.sample.altitude_ft)} ft</strong></span>
    <span>Groundspeed: <strong>{n(selectedSession.sample.groundspeed_kt)} kt</strong></span>
   </div>}
   {currentLinks.length>0&&<div className={styles.links}>
    <h4>Verknüpfte SIM-Flüge</h4>
    {currentLinks.map(l=><article key={l.link_id} className={styles.link}>
     <div className={styles.linkHead}>
      <div><small>{l.request_code} · {l.device_name}</small>
       <strong>{l.origin_icao} → {l.destination_icao}</strong>
       <span>Verknüpft: {fmt(l.linked_at)} · {l.status==='receiving'?'Gerätedaten empfangen':'Aktuell keine bestätigte Live-Sitzung'}</span>
      </div>
      <button type="button" className="ops-refresh" disabled={busy}
       onClick={()=>void unlink(l.link_id)}><Unlink size={15}/> Trennen</button>
     </div>
     {l.last_sample?<div className={styles.data}>
      <span><Clock3 size={13}/> {fmt(l.last_sample.received_at)}</span>
      <span>Phase <strong>{l.last_sample.phase}</strong></span>
      <span>Höhe <strong>{n(l.last_sample.altitude_ft)} ft MSL</strong></span>
      <span>GS <strong>{n(l.last_sample.groundspeed_kt)} kt</strong></span>
     </div>:<div className={styles.disconnected}>Keine aktuelle Cloud-Messung für diese Sitzungskennung.</div>}
    </article>)}
   </div>}
  </>}
  <div className={styles.footer}><CheckCircle2 size={15}/>
   <span>Die Zuordnung ist ein nicht-operativer SIM-Evidenzlink. Das bestehende Missionscockpit und der Kabinenservice werden dadurch noch nicht automatisch gesteuert.</span>
  </div>
 </section>;
}
