'use client';

import {Activity,Gauge,Navigation,RadioTower,TrendingDown,TrendingUp,WifiOff} from 'lucide-react';
import styles from './SimFlightInstruments.module.css';

export type SimSample={
 on_ground:boolean;groundspeed_kt:number;agl_ft:number;
 vertical_speed_fpm:number;indicated_airspeed_kt:number;
 engine_running:boolean|null;
};
function valid(value:unknown,min:number,max:number):value is number{
 return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
}
function show(value:unknown,min:number,max:number,decimals=0){
 return valid(value,min,max)?value.toLocaleString('de-DE',{maximumFractionDigits:decimals}):'—';
}
export default function SimFlightInstruments({sample,recent,lastSeen,connectedPhase}:{
 sample:SimSample|null;recent:boolean;lastSeen:string|null;connectedPhase:string|null;
}){
 const validSample=recent&&sample!==null&&typeof sample.on_ground==='boolean'&&
  valid(sample.groundspeed_kt,0,900)&&valid(sample.agl_ft,-100,120000)&&
  valid(sample.vertical_speed_fpm,-15000,15000)&&valid(sample.indicated_airspeed_kt,0,900);
 const active=validSample?sample:null;
 const vertical=active?active.vertical_speed_fpm:null;
 const time=lastSeen&&Number.isFinite(new Date(lastSeen).getTime())?
  new Date(lastSeen).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
 return <section className={styles.root} aria-label="MSFS SIM-Telemetrieinstrumente">
  <div className={styles.header}>
   <div>
    <div className="eyebrow">FLIGHT DATA / LOCAL SIMCONNECT</div>
    <h4><Gauge size={19}/> Flight instruments</h4>
    <p>Geprüft auf Messwertplausibilität – nicht auf flugbetriebliche Korrektheit.</p>
   </div>
   <div className={validSample?styles.connected:styles.disconnected}>
    {validSample?<RadioTower size={16}/>:<WifiOff size={16}/>}
    <span>{validSample?'Aktueller SIM-Gerätestream':'Keine aktuellen Live-Messwerte'}</span>
   </div>
  </div>
  <div className={styles.instrumentGrid}>
   <div className={styles.instrument}>
    <div className={styles.instrumentTitle}><Navigation size={17}/><span>GROUND SPEED</span></div>
    <div className={styles.readout}><strong>{show(active?.groundspeed_kt,0,900,1)}</strong><small>KTS</small></div>
    <div className={styles.instrumentNote}>Geschwindigkeit über Grund</div>
   </div>
   <div className={styles.instrument}>
    <div className={styles.instrumentTitle}><Gauge size={17}/><span>INDICATED AIRSPEED</span></div>
    <div className={styles.readout}><strong>{show(active?.indicated_airspeed_kt,0,900,1)}</strong><small>KIAS</small></div>
    <div className={styles.instrumentNote}>Anzeige-Geschwindigkeit</div>
   </div>
   <div className={styles.instrument}>
    <div className={styles.instrumentTitle}><Activity size={17}/><span>ALTITUDE AGL</span></div>
    <div className={styles.readout}><strong>{show(active?.agl_ft,-100,120000)}</strong><small>FT</small></div>
    <div className={styles.instrumentNote}>Höhe über Grund, nicht MSL</div>
   </div>
   <div className={styles.instrument}>
    <div className={styles.instrumentTitle}>
     {vertical!==null&&vertical<0?<TrendingDown size={17}/>:<TrendingUp size={17}/>}
     <span>VERTICAL SPEED</span></div>
    <div className={styles.readout}><strong>{show(vertical,-15000,15000)}</strong><small>FT/MIN</small></div>
    <div className={styles.instrumentNote}>{vertical===null?'Steigen / Sinken nicht verfügbar':vertical>100?'Steigflug':vertical< -100?'Sinkflug':'Vertikalrate nahezu null'}</div>
   </div>
  </div>
  <div className={styles.footer}>
   <span>GROUND: <strong>{active?(active.on_ground?'JA':'NEIN'):'—'}</strong></span>
   <span>ENGINE 1: <strong>{active?.engine_running===true?'AN':active?.engine_running===false?'AUS':'—'}</strong></span>
   <span>PHASE: <strong>{validSample?(connectedPhase||'—'):'—'}</strong></span>
   <span>LETZTES SIGNAL: <strong>{validSample?time:'Nicht aktuell'}</strong></span>
  </div>
  <p className={styles.disclaimer}>Die Anzeigen stammen ausschließlich aus dem letzten akzeptierten lokalen SIM-Bridge-Datensatz. Ohne frischen Heartbeat werden keine Zahlen angezeigt. Keine zertifizierte Flugdatenerfassung.</p>
 </section>;
}
