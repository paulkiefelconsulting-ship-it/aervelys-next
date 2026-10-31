'use client';
import {useState} from 'react';
import {FileJson2,ShieldAlert,RadioTower} from 'lucide-react';

type Snapshot={schemaVersion:1;source:'msfs2024-simconnect-local';timestampUtc:string;phase:string;telemetry:{
 latitude:number;longitude:number;altitudeFt:number;aglFt:number;verticalSpeedFpm:number;groundSpeedKt:number;indicatedSpeedKt:number;onGround:boolean;parkingBrake:boolean
}};
const PHASE_LABELS:Record<string,string>={
 Unknown:'Unbekannt',Parked:'Am Standplatz',TaxiOut:'Rollen zum Start',TakeoffRoll:'Startlauf',Climb:'Steigflug',
 Cruise:'Reiseflug',Descent:'Sinkflug',Approach:'Anflug',Landing:'Landung',TaxiIn:'Rollen nach der Landung'
};
function valid(value:unknown):value is Snapshot{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 if(v.schemaVersion!==1||v.source!=='msfs2024-simconnect-local'||typeof v.phase!=='string'||
  !(v.phase in PHASE_LABELS)||typeof v.timestampUtc!=='string')return false;
 const tele=v.telemetry as Record<string,unknown>|undefined;
 if(!tele||typeof tele!=='object')return false;
 for(const k of ['latitude','longitude','altitudeFt','aglFt','verticalSpeedFpm','groundSpeedKt','indicatedSpeedKt']){
  if(typeof tele[k]!=='number'||!Number.isFinite(tele[k]))return false;
 }
 return typeof tele.onGround==='boolean'&&typeof tele.parkingBrake==='boolean'&&
 Math.abs(tele.latitude as number)<=90&&Math.abs(tele.longitude as number)<=180;
}
export default function BridgeSnapshotInspector(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [error,setError]=useState('');
 const [checkedAt,setCheckedAt]=useState(0);
 async function onFile(file?:File){
  if(!file)return;
  setError('');setSnapshot(null);
  if(file.size>120000){setError('Die Snapshot-Datei ist ungewöhnlich groß (max. 120 KB).');return;}
  try{
   const json=JSON.parse(await file.text()) as unknown;
   if(!valid(json)){setError('Nicht unterstütztes oder unvollständiges Bridge-JSON.');return;}
   const timestamp=Date.parse(json.timestampUtc);
   if(!Number.isFinite(timestamp)){setError('Bridge-Zeitstempel ist ungültig.');return;}
   setSnapshot(json);setCheckedAt(Date.now());
  }catch{setError('Die Datei ist kein gültiges JSON.');}
 }
 const age=snapshot?Math.round((checkedAt-Date.parse(snapshot.timestampUtc))/1000):null;
 const fresh=age!==null&&age>=-5&&age<=10;
 return <div style={{marginTop:18,border:'1px solid #356078',borderRadius:12,background:'#0b2538',padding:20}}>
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
   <RadioTower size={20} color="#83ccea"/>
   <strong style={{fontSize:14}}>Lokale Bridge-Diagnose</strong>
   <span style={{fontSize:11,color:'#93b9cd'}}>Nur Datei-Prüfung · keine Netzwerkverbindung</span>
  </div>
  <p style={{fontSize:12,lineHeight:1.6,color:'#a3bdce'}}>Wenn die Bridge auf deinem PC läuft, kannst du hier die lokal erzeugte <code>telemetry.json</code> auswählen. Die Datei wird nur in diesem Browser gelesen, nicht hochgeladen. Dies ist eine Momentaufnahme, kein Live-Tracking.</p>
  <input aria-label="Lokale telemetry.json auswählen" type="file" accept=".json,application/json" style={{color:'#d2edfd',fontSize:12,maxWidth:'100%'}} onChange={e=>{void onFile(e.target.files?.[0]);e.target.value='';}}/>
  {error&&<p role="alert" style={{fontSize:12,color:'#ffb6a6'}}><ShieldAlert size={14} style={{verticalAlign:'middle'}}/> {error}</p>}
  {snapshot&&<div style={{display:'grid',gap:12,marginTop:16}}>
   <div style={{border:'1px solid '+(fresh?'#247b69':'#8f6445'),padding:12,borderRadius:8,background:fresh?'#0a3434':'#322921',color:fresh?'#9cecd2':'#ffd4a3',fontSize:12}}>
    {fresh?'Snapshot beim Einlesen aktuell':'Snapshot beim Einlesen veraltet / Zeitabweichung'} · Zeitstempel: {new Date(snapshot.timestampUtc).toLocaleString('de-DE')} · {age} Sekunden Differenz
   </div>
   <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
    <span style={{fontSize:13,color:'#f2f9ff'}}><strong>Phase:</strong> {PHASE_LABELS[snapshot.phase]}</span>
    <span style={{fontSize:13,color:'#f2f9ff'}}><strong>Höhe:</strong> {Math.round(snapshot.telemetry.altitudeFt).toLocaleString('de-DE')} ft</span>
    <span style={{fontSize:13,color:'#f2f9ff'}}><strong>GS:</strong> {Math.round(snapshot.telemetry.groundSpeedKt)} kt</span>
    <span style={{fontSize:13,color:'#f2f9ff'}}><strong>VS:</strong> {Math.round(snapshot.telemetry.verticalSpeedFpm)} ft/min</span>
   </div>
   <p style={{fontSize:11,color:'#9bb9c8',lineHeight:1.6,margin:0}}>Die Datei wird nicht automatisch aktualisiert. Zum Prüfen einer neuen Flugphase bitte erneut auswählen. Eine echte, geschützte Live-Kopplung zu AERVELYS NEXT ist noch nicht eingerichtet.</p>
  </div>}
 </div>;
}
