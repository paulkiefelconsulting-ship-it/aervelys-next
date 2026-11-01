'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,FileJson2,FolderOpen,Link2Off,
 RadioTower,RefreshCw,ShieldCheck} from 'lucide-react';
import {decodeLocalBridgeTelemetry,type LocalBridgeTelemetry} from '../lib/localBridgeTelemetry';
import styles from './LocalMsfsFileLink.module.css';

const localPath='%USERPROFILE%\\AERVELYS\\FlightBridge\\telemetry.json';
const MAX_SIZE=128*1024;
const STALE_MS=12000;
let rememberedHandle:FileSystemFileHandle|null=null;
type PickerWindow=Window&{
 showOpenFilePicker?: (options?:{
  multiple?:boolean;types?:{description:string;accept:Record<string,string[]>}[];
 })=>Promise<FileSystemFileHandle[]>;
};
type LiveData={info:LocalBridgeTelemetry;lastModified:number;filename:string;readAt:number};
const val=(number:number|null,decimals=0)=>number===null?'—':
 number.toLocaleString('de-DE',{maximumFractionDigits:decimals});
const latest=(stamp:number)=>new Date(stamp).toLocaleTimeString('de-DE',
 {hour:'2-digit',minute:'2-digit',second:'2-digit'});
export default function LocalMsfsFileLink(){
 const [link,setLink]=useState<'none'|'watching'|'snapshot'>(rememberedHandle?'watching':'none');
 const [reading,setReading]=useState(false);
 const [data,setData]=useState<LiveData|null>(null);
 const [error,setError]=useState('');
 const [clock,setClock]=useState(Date.now());
 const fileInput=useRef<HTMLInputElement>(null);
 const busy=useRef(false);
 const snapshotMode=link==='snapshot';
 const load=useCallback(async(f:File)=>{
  if(f.size>MAX_SIZE)throw Error('Datei zu groß (maximal 128 KB). Bitte die aktuelle telemetry.json wählen.');
  if(f.size<2)throw Error('Die Telemetriedatei ist noch leer.');
  const json=await f.text();
  let parsed:unknown;
  try{parsed=JSON.parse(json);}catch{throw Error('Die Bridge schreibt gerade eine unvollständige JSON-Datei. Beim nächsten Intervall wird erneut geprüft.');}
  const info=decodeLocalBridgeTelemetry(parsed);
  setData({info,lastModified:f.lastModified,filename:f.name,readAt:Date.now()});
  setError('');
 },[]);
 const readHandle=useCallback(async()=>{
  if(busy.current||!rememberedHandle)return;
  busy.current=true;
  try{
   const f=await rememberedHandle.getFile();
   await load(f);
   setLink('watching');
  }catch(e){
   setError(e instanceof Error?e.message:'Datei nicht lesbar. Prüfe Zugriff und wähle sie erneut.');
  }finally{busy.current=false;}
 },[load]);
 useEffect(()=>{
  if(rememberedHandle)void readHandle();
  const timer=window.setInterval(()=>{
   setClock(Date.now());
   if(rememberedHandle)void readHandle();
  },1400);
  return()=>window.clearInterval(timer);
 },[readHandle]);
 async function open(){
  setError('');setReading(true);
  try{
   const picker=(window as PickerWindow).showOpenFilePicker;
   if(typeof picker!=='function'){
    fileInput.current?.click();
    return;
   }
   const [handle]=await picker({
    multiple:false,types:[{description:'AERVELYS Bridge JSON',accept:{'application/json':['.json']}}]
   });
   if(!handle)return;
   rememberedHandle=handle;
   setLink('watching');setData(null);
   await readHandle();
  }catch(e){
   if(e instanceof DOMException&&e.name==='AbortError')return;
   setError(e instanceof Error?e.message:'Datei konnte nicht ausgewählt werden.');
  }finally{setReading(false);}
 }
 async function chooseFallback(event:React.ChangeEvent<HTMLInputElement>){
  const f=event.currentTarget.files?.[0];if(!f)return;
  rememberedHandle=null;setLink('snapshot');setError('');
  try{await load(f);}catch(e){setError(e instanceof Error?e.message:'Datei nicht lesbar.');}
  event.currentTarget.value='';
 }
 function unlink(){
  rememberedHandle=null;setData(null);setError('');
  setLink('none');
 }
 const timestamp=data?.info.observed_at?new Date(data.info.observed_at).getTime():null;
 const age=data?clock-data.lastModified:null;
 const ageBySource=timestamp===null?null:clock-timestamp;
 const fresh=Boolean(link==='watching'&&data&&age!==null&&age>=-5000&&age<STALE_MS&&
  (ageBySource===null||(ageBySource>=-30000&&ageBySource<30000)));
 const info=data?.info;
 const hasPosition=info?.latitude!==null&&info?.longitude!==null&&info!==undefined;
 const cloudComplete=Boolean(info&&info.missingForCloudBridge.length===0);
 const missionComplete=Boolean(info&&info.missingForSimMission.length===0);
 return <section className={styles.root} aria-label="AERVELYS Flight Bridge lokale Telemetriedatei">
  <div className={styles.top}>
   <div>
    <div className="eyebrow">AERVELYS FLIGHT BRIDGE / CHROME FILE LINK</div>
    <h2><FileJson2 size={20}/> Lokale Bridge direkt in NEXT anzeigen</h2>
    <p>Verwendet die bestehende Windows-Bridge aus „Web App Bauen“. Keine zweite Bridge und kein zusätzlicher Server erforderlich.</p>
   </div>
   <span className={fresh?styles.live:styles.offline}>
    {fresh?<RadioTower size={15}/>:<Link2Off size={15}/>}
    {fresh?'Lokale Datei wird aktualisiert':link==='none'?'Noch nicht verbunden':
     snapshotMode?'Einmaliger Datei-Snapshot':'Kein aktueller Dateistand'}
   </span>
  </div>
  <div className={styles.location}>
   <span>BRIDGE-DATEI AUF DEINEM WINDOWS-PC</span>
   <code>{localPath}</code>
  </div>
  <div className={styles.actions}>
   <button type="button" className="ops-refresh" onClick={()=>void open()} disabled={reading}>
    <FolderOpen size={16}/>{link==='none'?'telemetry.json auswählen':'Datei erneut auswählen'}
   </button>
   <button type="button" className="ops-refresh" onClick={()=>void readHandle()}
    disabled={link!=='watching'}><RefreshCw size={15}/> Jetzt prüfen</button>
   <button type="button" className="ops-refresh" onClick={unlink}
    disabled={link==='none'}><Link2Off size={15}/> Anzeige trennen</button>
   <input ref={fileInput} type="file" accept=".json,application/json" onChange={e=>void chooseFallback(e)}
    style={{display:'none'}} aria-label="Telemetriedatei wählen"/>
  </div>
  {error&&<p className={styles.error} role="alert"><AlertTriangle size={15}/>{error}</p>}
  <p className={styles.hint}>In Chrome die Datei einmal auswählen. Solange die Seite geöffnet bleibt, wird sie bei unterstütztem Dateizugriff ungefähr alle 1,4 Sekunden erneut gelesen. Bei Browsern ohne Datei-Handle-Unterstützung ist nur ein einmaliger Snapshot möglich. Nach Ersetzen der Datei kann eine erneute Auswahl nötig sein.</p>
  {data&&<div className={styles.body}>
   <div className={styles.meta}>
    <span>DATEI: <strong>{data.filename}</strong></span>
    <span>LETZTE DATEIÄNDERUNG: <strong>{latest(data.lastModified)}</strong></span>
    <span>DATEIALTER: <strong>{age===null?'—':Math.max(0,Math.round(age/1000))+' s'}</strong></span>
    <span>QUELLE: <strong>Lokale Datei, nicht serverbestätigt</strong></span>
   </div>
   <div className={styles.metrics}>
    <div><span>FLUGPHASE</span><strong>{fresh?(info?.phase||'—'):'—'}</strong><small>Vom Dateiinhaltsfeld</small></div>
    <div><span>GROUND SPEED</span><strong>{fresh?val(info?.groundspeed_kt??null,1):'—'} <small>KT</small></strong><small>Nur eindeutig beschriftete Knotenwerte</small></div>
    <div><span>ALTITUDE / FT</span><strong>{fresh?val(info?.altitude_ft??null):'—'} <small>FT</small></strong><small>Keine AGL-Annahme</small></div>
    <div><span>VERTICAL SPEED</span><strong>{fresh?val(info?.vertical_speed_fpm??null):'—'} <small>FT/MIN</small></strong><small>Steigen / Sinken</small></div>
    <div><span>INDICATED AIRSPEED</span><strong>{fresh?val(info?.indicated_airspeed_kt??null):'—'} <small>KIAS</small></strong><small>Für automatische Phasenerkennung</small></div>
    <div><span>HÖHE ÜBER GRUND</span><strong>{fresh?val(info?.agl_ft??null):'—'} <small>FT AGL</small></strong><small>Nicht identisch mit Altitude</small></div>
   </div>
   <div className={styles.position}>
    <strong>SIM-POSITION</strong>
    <span>{fresh&&hasPosition?val(info!.latitude,5)+' / '+val(info!.longitude,5):'Nicht vorhanden oder Dateistand zu alt'}</span>
    <span>SIM-SESSION: {info?.session_id||'nicht angegeben'}</span>
   </div>
   <div className={styles.checks}>
    <div>
     <h3>{cloudComplete?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>} Daten für bestehenden Cloud-Bridge-Eingang</h3>
     <p>Benötigt Felder für <code>aervelys_msfs_bridge_ingest</code> plus eine separat gekoppelte Gerätekennung.</p>
     {info?.missingForCloudBridge.length?<ul>{info.missingForCloudBridge.map(s=><li key={s}>{s}</li>)}</ul>:
      <p className={styles.ok}>Alle Pflichtfelder in der Datei erkannt – Cloud-Zugang und Geräte-Pairing bleiben separat.</p>}
    </div>
    <div>
     <h3>{missionComplete?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>} Daten für automatische SIM-Missionsphasen</h3>
     <p>Die Missions-Bridge benötigt weitere SimConnect-Werte und einen missionsgebundenen Kopplungscode.</p>
     {info?.missingForSimMission.length?<ul>{info.missingForSimMission.map(s=><li key={s}>{s}</li>)}</ul>:
      <p className={styles.ok}>Telemetrie-Kernfelder erkannt; die Missionszuordnung und sicheren Phasenübergänge müssen getrennt geprüft werden.</p>}
    </div>
   </div>
   <details className={styles.schema}>
    <summary>Erkannte JSON-Feldnamen ({info?.rawKeys.length||0})</summary>
    <p>Nur Feldnamen, keine Zugangsschlüssel oder Dateiinhalte. Bei abweichendem Bridge-Format können wir die Zuordnung gezielt ergänzen.</p>
    <div>{info?.rawKeys.map(k=><code key={k}>{k}</code>)}</div>
   </details>
  </div>}
  <div className={styles.safe}><ShieldCheck size={17}/>
   <span>Dieser Anschluss liest die Datei ausschließlich lokal im Browser. <strong>Keine automatische Übertragung zu Supabase, keine Änderung von Charterflügen, Crew, Finanzen oder der bestehenden Windows-Bridge.</strong> Die separate Server-Kopplung findest du weiterhin im MSFS-Panel darunter.</span>
  </div>
 </section>;
}
