'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {CheckCircle2,FileUp,Plane,ShieldAlert,Trash2} from 'lucide-react';
import {parseSimbriefOfp,PLAN_STORAGE_KEY,readPreparedPlan,type PassengerPlan} from '../../lib/passengerPlan';
import styles from './setup.module.css';

export default function PassengerFlightPreparation(){
 const [plan,setPlan]=useState<PassengerPlan|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setPlan(readPreparedPlan());},[]);
 async function importFile(file:File|undefined){
  if(!file)return;
  setBusy(true);setError('');
  try{
   if(file.size>3_000_000)throw Error('Datei zu groß. Maximale Größe: 3 MB.');
   const parsed=parseSimbriefOfp(await file.text());
   localStorage.setItem(PLAN_STORAGE_KEY,JSON.stringify(parsed));
   setPlan(parsed);
  }catch(e){setError(e instanceof Error?e.message:'Der SimBrief-Flugplan konnte nicht gelesen werden.');}
  finally{setBusy(false);}
 }
 function clear(){localStorage.removeItem(PLAN_STORAGE_KEY);setPlan(null);setError('');}
 return <main className={styles.page}>
  <div className={styles.container}>
   <header className={styles.header}>
    <Link className={styles.logo} href="/passenger-demo">AERVELYS <span>NEXT</span></Link>
    <span>PILOT / PRE-FLIGHT SETUP</span>
   </header>
   <div className={styles.heading}>
    <div className={styles.eyebrow}>PASSENGER EXPERIENCE · FLUGVORBEREITUNG</div>
    <h1>Flugplan vor dem Start hinterlegen.</h1>
    <p>Du planst deinen Flug wie gewohnt in SimBrief. Importiere hier den <strong>SimBrief OFP als XML oder JSON v2</strong>. Das Passagierdisplay übernimmt danach Strecke und Wegpunkte automatisch – ohne Eingaben während des Flugs.</p>
   </div>
   <div className={styles.grid}>
    <section className={styles.card}>
     <div className={styles.eyebrow}>01 / SIMBRIEF OFP</div>
     <h2>Flugplan importieren</h2>
     <label className={styles.upload}>
      <FileUp size={27}/>
      <strong>{busy?'Datei wird gelesen …':'OFP-Datei auswählen'}</strong>
      <span>SimBrief XML oder JSON v2 · maximal 3 MB</span>
      <input type="file" accept=".xml,.json,application/xml,text/xml,application/json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/>
     </label>
     {error&&<div className={styles.error} role="alert"><ShieldAlert size={17}/>{error}</div>}
     <p className={styles.note}>Der Import erfolgt ausschließlich in deinem Browser. Die Datei wird nicht an AERVELYS-Server gesendet. Keine SimBrief-Account-Verknüpfung oder automatische Neuabfrage in dieser Version.</p>
    </section>
    <section className={styles.card}>
     <div className={styles.eyebrow}>02 / VORBEREITETER FLUG</div>
     <h2>{plan?'Flugplan übernommen':'Noch kein Flugplan importiert'}</h2>
     {plan?<div className={styles.summary}>
       <div className={styles.success}><CheckCircle2 size={17}/> SimBrief-Route lokal bereit</div>
       <div className={styles.airports}><strong>{plan.origin}</strong><Plane size={24}/><strong>{plan.destination}</strong></div>
       <div className={styles.details}><span>{plan.fixes.length} Navigationspunkte</span><span>{plan.flightNumber||'Keine Flugnummer'}</span><span>{plan.registration||'Registrierung nicht hinterlegt'}</span></div>
       {plan.routeText&&<p className={styles.routeText}>{plan.routeText}</p>}
       <p className={styles.note}>Vorbereitet am {new Date(plan.preparedAt).toLocaleString('de-DE')}. Die Karte verwendet die Koordinaten aus dem OFP einschließlich der Wegpunkte.</p>
       <button className={styles.delete} type="button" onClick={clear}><Trash2 size={15}/> Lokalen Flugplan entfernen</button>
      </div>:<p className={styles.empty}>Nach dem Import erscheint hier die Flugstrecke. Bis dahin zeigt die Passagierkarte lediglich eine deutlich markierte Beispielanimation.</p>}
     <Link href="/passenger-demo" className={styles.open}><Plane size={17}/> Passagierdisplay öffnen</Link>
    </section>
   </div>
   <div className={styles.warning}><ShieldAlert size={18}/><span>Die öffentliche Vorschau speichert die vorbereitete Route nur in diesem Browser auf diesem Gerät. Für andere Tablets, Gäste und den echten MSFS-Flug ist später eine geschützte OPS-Übertragung mit SimConnect vorgesehen. Keine echte Flugfreigabe oder Navigation.</span></div>
  </div>
 </main>;
}
