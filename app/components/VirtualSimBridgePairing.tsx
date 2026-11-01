'use client';

import {useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {Cable,ClipboardCopy,LockKeyhole,RadioTower,RefreshCw,ShieldAlert,XCircle} from 'lucide-react';
import styles from './VirtualSimBridgePairing.module.css';

type Pairing={session_id:string;request_id:string;status:'active'|'revoked';issued_at:string;
 expires_at:string;last_seen_at:string|null;accepted_events:number;last_phase:string|null;heartbeat_recent:boolean};
type PairAck={session_id:string;pairing_token:string;request_id:string;expires_at:string;simulation_only:true;
 telemetry_trusted_for_ops:false;real_flight_changes:0;one_time_secret:true};
type RevokeAck={revoked:number;simulation_only:true;real_flight_changes:0};
function client(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw Error('Supabase is not configured');
 return createBrowserClient(u,k);
}
function fmt(value:string|null){
 if(!value)return 'Noch kein Signal';
 const d=new Date(value);
 return Number.isNaN(d.getTime())?'Unbekannt':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
export default function VirtualSimBridgePairing({requestId,lifecycle,phase,session,onRefresh}:{
 requestId:string;lifecycle:string;phase:string;session:Pairing|null;onRefresh:()=>Promise<void>;
}){
 const [busy,setBusy]=useState(false);
 const [secret,setSecret]=useState('');
 const [expires,setExpires]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const active=session?.status==='active'&&new Date(session.expires_at).getTime()>Date.now();
 const canPair=lifecycle==='running'&&phase!=='arrived';
 async function pair(){
  if(!canPair||busy)return;
  setBusy(true);setSecret('');setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_sim_bridge_pair',{p_request_id:requestId,p_minutes:90});
   const v=r.data as PairAck|null;
   if(r.error||!v||v.simulation_only!==true||v.one_time_secret!==true||
    v.telemetry_trusted_for_ops!==false||v.real_flight_changes!==0||
    !/^[a-f0-9]{96}$/.test(v.pairing_token))throw Error('CEO pairing failed');
   setSecret(v.pairing_token);
   setExpires(v.expires_at);
   setNotice('Gerätecode erzeugt. Er ist nur einmal sichtbar und bleibt auf diese SIM-Mission begrenzt.');
   await onRefresh();
  }catch{setError('Kopplung abgewiesen. Bitte laufende Mission und aktive CEO-Berechtigung prüfen.');}
  finally{setBusy(false);}
 }
 async function revoke(){
  if(!active||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await client().rpc('aervelys_sim_bridge_revoke',{p_request_id:requestId});
   const v=r.data as RevokeAck|null;
   if(r.error||!v||v.simulation_only!==true||v.real_flight_changes!==0)
    throw Error('Revocation failed');
   setSecret('');setExpires('');
   setNotice('Gerät für diese SIM-Mission getrennt. Weitere Ereignisse mit altem Code werden verworfen.');
   await onRefresh();
  }catch{setError('Gerätezugriff konnte nicht widerrufen werden.');}
  finally{setBusy(false);}
 }
 async function copySecret(){
  if(!secret)return;
  try{await navigator.clipboard.writeText(secret);
   setNotice('Geheimen Kopplungscode kopiert. Nur im lokalen Windows-Programm einfügen.');
  }catch{setError('Zwischenablage nicht verfügbar. Code manuell übernehmen.');}
 }
 async function copySetup(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key){setError('Öffentliche Supabase-Projektwerte fehlen.');return;}
  const text=['# AERVELYS NEXT – nur öffentliche Supabase-Verbindungswerte',
   '$env:AERVELYS_SUPABASE_URL = "'+url+'"',
   '$env:AERVELYS_SUPABASE_ANON_KEY = "'+key+'"',
   'python bridge/msfs2024/run_paired.py --initial-phase '+(phase==='planning'?'boarding':phase),
   '# Der geheime Kopplungscode wird verdeckt im Terminal abgefragt.'].join('\n');
  try{await navigator.clipboard.writeText(text);setNotice('PowerShell-Verbindungsdaten kopiert. Der geheime Code ist NICHT darin enthalten.');}
  catch{setError('PowerShell-Anleitung konnte nicht kopiert werden.');}
 }
 return <section className={styles.root} aria-label="Lokale MSFS-Bridge koppeln">
  <div className={styles.heading}>
   <div><div className="eyebrow">LOCAL SIMCONNECT / DEVICE PAIRING</div>
    <h4><Cable size={18}/> Windows-Bridge koppeln</h4>
    <p>Ein Windows-Reader kann gemessene Simulatorphasen an genau diese SIM-Mission senden. Der Anschluss ersetzt keine echte Flugbetriebsfreigabe.</p></div>
   <span className={active&&session?.heartbeat_recent?styles.pulse:styles.offline}>
    <RadioTower size={14}/>
    {active&&session?.heartbeat_recent?'Geräteheartbeat empfangen':
     active?'Code aktiv · noch kein Heartbeat':'Kein Gerät gekoppelt'}
   </span>
  </div>
  <div className={styles.guard}><ShieldAlert size={16}/>
   <span>Telemetrie bleibt **nicht verifiziert**. Nur nach einer echten Installation und Testverbindung am Windows-PC kann ein Geräteheartbeat eintreffen. Ohne Kopplung bleiben alle Phasen manuell.</span></div>
  <div className={styles.info}>
   <span><strong>Status:</strong> {active?'Kopplung zeitlich gültig':'Nicht gekoppelt'}</span>
   <span><strong>Letztes Signal:</strong> {fmt(session?.last_seen_at||null)}</span>
   <span><strong>Ereignisse:</strong> {session?.accepted_events||0}</span>
   <span><strong>Gültig bis:</strong> {session?fmt(session.expires_at):'—'}</span>
  </div>
  <div className={styles.controls}>
   <button type="button" className="ops-refresh" disabled={!canPair||busy}
    onClick={()=>void pair()}><LockKeyhole size={15}/>{active?'Neuen Code erzeugen':'Mission koppeln (90 Min)'}</button>
   <button type="button" className="ops-refresh" disabled={!active||busy}
    onClick={()=>void revoke()}><XCircle size={15}/> Gerät trennen</button>
   <button type="button" className="ops-refresh"
    onClick={()=>void copySetup()}><ClipboardCopy size={15}/> Windows-Befehl kopieren</button>
   <button type="button" className="ops-refresh" onClick={()=>void onRefresh()}><RefreshCw size={15}/> Status prüfen</button>
  </div>
  {secret&&<div className={styles.secret}>
   <strong>Einmaliger Kopplungscode – vertraulich behandeln</strong>
   <code>{secret}</code>
   <small>Gültig bis {fmt(expires)}. Ein neuer Code widerruft den vorherigen. Bei Verlust einfach neu erzeugen.</small>
   <button type="button" className="ops-refresh" onClick={()=>void copySecret()}><ClipboardCopy size={15}/> Geheimen Code kopieren</button>
   <button type="button" className="ops-refresh" onClick={()=>setSecret('')}>Code ausblenden</button>
  </div>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  <p className={styles.footer}>Lokal benötigt: MSFS 2024, Python, kompatibler SimConnect-Client und das Repository mit <code>bridge/msfs2024/run_paired.py</code>. Der Kopplungscode wird im Terminal verdeckt abgefragt; nicht in Screenshots, Logs oder Git speichern.</p>
 </section>;
}
