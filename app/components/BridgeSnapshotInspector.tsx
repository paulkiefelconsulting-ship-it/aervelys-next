'use client';
import {useState} from 'react';
import {FileJson2,ShieldAlert,RadioTower,PlugZap,Unplug,CheckCircle2,RefreshCw} from 'lucide-react';
import {parseBridgeSnapshot,BRIDGE_PHASE_LABELS,type BridgeSnapshot} from '../lib/localBridge';

type Props={
 snapshot:BridgeSnapshot|null;connected:boolean;isLive:boolean;error:string;
 connect:()=>Promise<void>;disconnect:()=>void;
};
export default function BridgeSnapshotInspector({snapshot,connected,isLive,error,connect,disconnect}:Props){
 const [manual,setManual]=useState<BridgeSnapshot|null>(null);
 const [manualError,setManualError]=useState('');
 const [inspectedAt,setInspectedAt]=useState(0);
 async function importSample(file?:File){
  if(!file)return;
  try{
   const raw=await file.text();
   // Manual inspector accepts old snapshots for debugging, but never calls them live.
   const parsed=JSON.parse(raw) as BridgeSnapshot;
   if(parsed?.schemaVersion!==1||parsed?.source!=='msfs2024-simconnect-local'||
      !parsed?.telemetry||typeof parsed.phase!=='string'||!(parsed.phase in BRIDGE_PHASE_LABELS))throw Error('Kein gültiger AERVELYS Snapshot.');
   setManual(parsed);setManualError('');setInspectedAt(Date.now());
  }catch(e){setManual(null);setManualError(e instanceof Error?e.message:'Ungültige Datei');}
 }
 const shown=isLive?snapshot:manual;
 return <section style={{marginTop:18,border:'1px solid rgba(109,197,195,.28)',borderRadius:16,background:'linear-gradient(145deg,#112b38,#0b1c2b)',padding:'clamp(17px,3vw,25px)'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:15,flexWrap:'wrap'}}>
   <div style={{display:'flex',gap:11,alignItems:'center'}}><RadioTower size={24} color="#94e9db"/><div><strong style={{fontSize:17}}>AERVELYS Local Flight Link</strong><p style={{fontSize:11,margin:'5px 0 0',color:'#9abdc9'}}>Echte MSFS-Flugphasen im Browser auf demselben Windows-PC</p></div></div>
   <span style={{border:'1px solid '+(isLive?'#388a7a':'#775f45'),borderRadius:999,padding:'8px 11px',fontWeight:800,fontSize:10,color:isLive?'#b1f8de':'#eabf9c'}}>{isLive?'● SIMCONNECT LIVE':connected?'● VERBINDUNG WARTET':'● NICHT VERBUNDEN'}</span>
  </div>
  <p style={{fontSize:12,lineHeight:1.8,color:'#b2cbd5'}}>Starte die <strong>neue Windows-Bridge</strong> und klicke dort auf <strong>Live-Datenordner öffnen</strong>. Danach hier <strong>Live-Ordner verbinden</strong> anklicken und den Ordner <code>%USERPROFILE%\AERVELYS\FlightBridge</code> auswählen (nicht die Datei selbst). Der Browser liest <code>telemetry.json</code> darin etwa jede Sekunde neu. Wähle nicht den alten AppData-Ordner – Chrome blockiert ihn.</p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',margin:'15px 0'}}>
   {!connected?<button type="button" onClick={()=>void connect()} style={{display:'flex',alignItems:'center',gap:9,border:'1px solid #95e4d5',borderRadius:9,padding:'12px 16px',background:'#1a6e76',color:'white',fontWeight:800,cursor:'pointer'}}><PlugZap size={17}/> Live-Ordner verbinden</button>:
   <><button type="button" onClick={disconnect} style={{display:'flex',alignItems:'center',gap:8,border:'1px solid #517384',borderRadius:9,padding:'12px 16px',background:'#192f42',color:'#d6eaf1',cursor:'pointer'}}><Unplug size={16}/> Trennen</button><span style={{fontSize:11,alignSelf:'center',color:'#a8d2cc'}}>Automatische Prüfung aktiv · 1 Sekunde</span></>}
  </div>
  {connected&&error&&<p role="alert" style={{display:'flex',gap:8,alignItems:'center',color:'#f4bf9f',fontSize:12}}><ShieldAlert size={16}/> {error}</p>}
  {shown&&<div style={{padding:15,border:'1px solid rgba(113,166,190,.25)',background:'#0b2431',borderRadius:12}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
    <span style={{fontSize:11,color:'#9cdddb',fontWeight:800}}>{isLive?'LIVE-SNAPSHOT':'MANUELL EINGELESENER SNAPSHOT'}</span>
    <strong style={{color:'#e3f8fc',fontSize:13}}>{BRIDGE_PHASE_LABELS[shown.phase]||shown.phase}</strong>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:8,marginTop:14}}>
    {([['ALTITUDE',Math.round(shown.telemetry.altitudeFt).toLocaleString('de-DE')+' ft'],['GROUND SPEED',Math.round(shown.telemetry.groundSpeedKt)+' kt'],['VERTICAL SPEED',Math.round(shown.telemetry.verticalSpeedFpm)+' ft/min'],['POSITION',shown.telemetry.latitude.toFixed(3)+'°, '+shown.telemetry.longitude.toFixed(3)+'°']] as const).map(([k,v])=><div key={k} style={{background:'#15374a',padding:12,borderRadius:8}}><small style={{display:'block',fontSize:9,color:'#89b8c9',letterSpacing:1,marginBottom:7}}>{k}</small><strong style={{fontSize:12}}>{v}</strong></div>)}
   </div>
   <p style={{fontSize:10,color:'#8db2c2'}}>Messung vom {new Date(shown.timestampUtc).toLocaleString('de-DE')}. {isLive?'Position und Flugphase stehen auch der Flugkarte und der Kabinensimulation zur Verfügung.':'Diese Datei wird nicht kontinuierlich aktualisiert.'}</p>
  </div>}
  <details style={{marginTop:17,paddingTop:15,borderTop:'1px solid rgba(127,167,196,.15)'}}>
   <summary style={{fontSize:12,color:'#98cde1',cursor:'pointer'}}>Alternativ: Einzelne Diagnose-Datei manuell prüfen</summary>
   <input type="file" accept=".json,application/json" aria-label="Einzelne Bridge-Diagnosedatei" style={{display:'block',margin:'12px 0',fontSize:11,color:'#d5e7ef'}} onChange={e=>{void importSample(e.target.files?.[0]);e.target.value='';}}/>
   {manualError&&<p style={{color:'#edb0a0',fontSize:11}}>{manualError}</p>}
   <p style={{color:'#809dac',fontSize:10}}>Eine einmal geladene Datei ist kein Beweis für eine aktive Live-Verbindung.</p>
  </details>
 </section>;
}
