'use client';
import {useCallback,useEffect,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ClipboardCopy, RadioTower, RefreshCw, ShieldCheck, Unplug, XCircle} from 'lucide-react';

type Sample={observed_at:string;session_id:string;phase:string;aircraft_title?:string;latitude:number;longitude:number;altitude_ft:number;groundspeed_kt:number};
type Device={id:string;device_name:string;paired_at:string;last_seen_at:string|null;online:boolean;last_sample:Sample|null};
function supabase(){
 const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!u||!k)throw new Error('Supabase nicht konfiguriert');
 return createBrowserClient(u,k);
}
function date(value:string|null|undefined){
 return value?new Date(value).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'medium'}):'Noch nie';
}
const field={background:'var(--notice)',border:'1px solid var(--line)',borderRadius:8,padding:14} as const;
const btn={background:'var(--notice)',border:'1px solid var(--brand)',borderRadius:8,padding:'10px 14px',cursor:'pointer',color:'var(--primary)',display:'inline-flex',alignItems:'center' as const,gap:8,fontSize:12};
export default function MsfsBridgePanel(){
 const [devices,setDevices]=useState<Device[]>([]);
 const [code,setCode]=useState(''),[expiry,setExpiry]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  try{
   const {data,error}=await supabase().rpc('aervelys_msfs_bridge_status');
   if(error||!Array.isArray(data))throw new Error('Bridge-Status nicht verfügbar: Datenbankmigration oder Rechte prüfen.');
   setDevices(data as Device[]);setMessage('');
  }catch(e){setMessage(e instanceof Error?e.message:'Bridge-Status nicht verfügbar');}
 },[]);
 useEffect(()=>{void refresh();const t=window.setInterval(()=>void refresh(),10000);return()=>window.clearInterval(t);},[refresh]);
 async function pair(){
  setBusy(true);setMessage('');setCode('');
  try{
   const {data,error}=await supabase().rpc('aervelys_msfs_bridge_pair_begin');
   if(error||typeof data?.code!=='string')throw new Error('Kopplungscode konnte nicht erzeugt werden.');
   setCode(data.code);setExpiry(data.expires_at);
  }catch(e){setMessage(e instanceof Error?e.message:'Kopplung fehlgeschlagen');}
  finally{setBusy(false);}
 }
 async function revoke(id:string){
  if(!window.confirm('Bridge-Gerät wirklich entkoppeln? Sein Token wird sofort ungültig.'))return;
  setBusy(true);
  try{
   const {data,error}=await supabase().rpc('aervelys_msfs_bridge_revoke',{p_device_id:id});
   if(error||data!==true)throw new Error('Gerät konnte nicht entfernt werden');
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'Entkoppeln fehlgeschlagen');}
  finally{setBusy(false);}
 }
 return <section className="panel" style={{marginBottom:20}}>
  <div className="panelhead">
   <div className="eyebrow">MSFS 2024 / SECURE DEVICE LINK</div>
   <h2><RadioTower size={20} style={{display:'inline-block',verticalAlign:'middle'}}/> Simulator Live Bridge</h2>
   <p className="lead">SimConnect-Telemetrie vom eigenen PC. Nur Simulator-Evidenz, keine Flug- oder Wartungsfreigabe.</p>
  </div>
  <div style={{padding:'0 24px 24px',display:'grid',gap:14}}>
   <div style={field}>
    <strong style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><ShieldCheck size={17}/> Windows-PC koppeln</strong>
    <p style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>Bridge starten, NEXT-Adresse und einmaligen Code eingeben. Der Code ist fünf Minuten gültig und kann nur einmal verwendet werden.</p>
    <button type="button" style={btn} disabled={busy} onClick={()=>void pair()}>Kopplungscode erzeugen</button>
    {code&&<div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12,marginTop:15}}>
     <code style={{fontSize:16,color:'var(--brand)',overflowWrap:'anywhere'}}>{code}</code>
     <button type="button" aria-label="Code kopieren" style={btn} onClick={()=>void navigator.clipboard.writeText(code)}><ClipboardCopy size={16}/></button>
     <small>Gültig bis {date(expiry)}</small>
    </div>}
   </div>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
    <strong style={{fontSize:13}}>Gekoppelte Geräte ({devices.length})</strong>
    <button type="button" style={btn} onClick={()=>void refresh()}><RefreshCw size={15}/> Status aktualisieren</button>
   </div>
   {message&&<p role="status" style={{fontSize:12,color:'var(--muted)'}}>{message}</p>}
   {!devices.length&&<p style={{fontSize:12,color:'var(--muted)',display:'flex',alignItems:'center',gap:8}}><Unplug size={17}/> Noch keine Bridge gekoppelt – keine Live-Daten.</p>}
   {devices.map(d=><article key={d.id} style={field}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
     <strong style={{fontSize:13}}>{d.device_name}</strong>
     <span style={{fontSize:11,fontWeight:700,color:d.online?'#70d8b2':'#e5ac86'}}>{d.online?'LIVE · TELEMETRIE':'OFFLINE'}</span>
    </div>
    <small style={{color:'var(--muted)'}}>Gekoppelt {date(d.paired_at)} · letzter Empfang {date(d.last_seen_at)}</small>
    {d.last_sample?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10,margin:'14px 0'}}>
     {[
      ['Flugphase',d.last_sample.phase],
      ['Flugzeug',d.last_sample.aircraft_title||'—'],
      ['Höhe',Math.round(d.last_sample.altitude_ft)+' ft'],
      ['Groundspeed',Math.round(d.last_sample.groundspeed_kt)+' kt'],
      ['Position',d.last_sample.latitude.toFixed(4)+' / '+d.last_sample.longitude.toFixed(4)],
     ].map(([label,value])=><div key={label} style={{border:'1px solid var(--line)',borderRadius:6,padding:10}}>
      <small style={{display:'block',color:'var(--muted)',marginBottom:7}}>{label}</small><strong style={{fontSize:12,overflowWrap:'anywhere'}}>{value}</strong>
     </div>)}
    </div>:<p style={{fontSize:12,color:'var(--muted)'}}>Warte auf erste echte SimConnect-Daten.</p>}
    <button type="button" style={{...btn,borderColor:'#b87571',marginTop:10}} disabled={busy} onClick={()=>void revoke(d.id)}><XCircle size={15}/> Trennen</button>
   </article>)}
  </div>
 </section>;
}
