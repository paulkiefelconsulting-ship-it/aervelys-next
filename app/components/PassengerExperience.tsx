'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowLeftRight,Clock3,CloudOff,Expand,MapPin,Pause,Plane,Play,RadioTower,RefreshCw,Route,ShieldAlert,ZoomIn,ZoomOut} from 'lucide-react';
import styles from './PassengerExperience.module.css';
import PassengerSections from './PassengerSections';
import {readPreparedPlan,type PassengerPlan,type RouteFix} from '../lib/passengerPlan';

type Geo={lat:number;lon:number;name:string};
type Point={lat:number;lon:number};
type Flight={id:string;request_code:string;registration:string|null;origin:string;destination:string;requested_departure:string;estimated_block_minutes:number|null;planning_status:string};
type MapView={lat:number;lon:number;zoom:number};
const AIRPORTS:Record<string,Geo>={
 EDAZ:{lat:52.203,lon:13.160,name:'Schönhagen'},EDDB:{lat:52.3667,lon:13.5033,name:'Berlin Brandenburg'},
 EDDF:{lat:50.0333,lon:8.5706,name:'Frankfurt'},EDDM:{lat:48.3538,lon:11.7861,name:'München'},
 EDDH:{lat:53.6304,lon:9.9882,name:'Hamburg'},EDDK:{lat:50.8659,lon:7.1427,name:'Köln/Bonn'},
 EDDL:{lat:51.2895,lon:6.7668,name:'Düsseldorf'},EDDS:{lat:48.6899,lon:9.2219,name:'Stuttgart'},
 EDDV:{lat:52.4611,lon:9.6851,name:'Hannover'},EDDN:{lat:49.4987,lon:11.078,name:'Nürnberg'},
 LOWW:{lat:48.1103,lon:16.5697,name:'Wien'},LOWI:{lat:47.2602,lon:11.3439,name:'Innsbruck'},
 LSZH:{lat:47.4581,lon:8.5555,name:'Zürich'},LSGG:{lat:46.2381,lon:6.109,name:'Genf'},
 LFPG:{lat:49.0097,lon:2.5479,name:'Paris CDG'},LFPB:{lat:48.9694,lon:2.4414,name:'Paris Le Bourget'},
 LFMN:{lat:43.6584,lon:7.2159,name:'Nizza'},LFML:{lat:43.4393,lon:5.2214,name:'Marseille'},
 EGLL:{lat:51.47,lon:-0.4543,name:'London Heathrow'},EGLC:{lat:51.5053,lon:0.0553,name:'London City'},
 EGGW:{lat:51.8747,lon:-0.3683,name:'London Luton'},EGKB:{lat:51.3308,lon:0.0325,name:'London Biggin Hill'},
 EHAM:{lat:52.3086,lon:4.7639,name:'Amsterdam'},EHRD:{lat:51.9569,lon:4.4372,name:'Rotterdam'},
 EBBR:{lat:50.9014,lon:4.4844,name:'Brüssel'},LEPA:{lat:39.5517,lon:2.7388,name:'Palma de Mallorca'},
 LEBL:{lat:41.2974,lon:2.0833,name:'Barcelona'},LEMD:{lat:40.4719,lon:-3.5626,name:'Madrid'},
 LPPT:{lat:38.7742,lon:-9.1342,name:'Lissabon'},LIRF:{lat:41.8003,lon:12.2389,name:'Rom'},
 LIMC:{lat:45.63,lon:8.723,name:'Mailand Malpensa'},LIME:{lat:45.6739,lon:9.7042,name:'Bergamo'},
 LIPZ:{lat:45.5053,lon:12.3519,name:'Venedig'},LGAV:{lat:37.9364,lon:23.9445,name:'Athen'},
 EKCH:{lat:55.6181,lon:12.656,name:'Kopenhagen'},ENGM:{lat:60.1939,lon:11.1004,name:'Oslo'},
 ESSA:{lat:59.6519,lon:17.9186,name:'Stockholm'},EFHK:{lat:60.3172,lon:24.9633,name:'Helsinki'},
 KJFK:{lat:40.6413,lon:-73.7781,name:'New York JFK'},KEWR:{lat:40.6895,lon:-74.1745,name:'Newark'},
 KLAX:{lat:33.9416,lon:-118.4085,name:'Los Angeles'},KMIA:{lat:25.7954,lon:-80.2906,name:'Miami'},
 KSFO:{lat:37.6213,lon:-122.379,name:'San Francisco'},OMDB:{lat:25.2532,lon:55.3657,name:'Dubai'},
 OMAA:{lat:24.433,lon:54.651,name:'Abu Dhabi'},VHHH:{lat:22.308,lon:113.9185,name:'Hongkong'},
 WSSS:{lat:1.3644,lon:103.9915,name:'Singapur'},RJTT:{lat:35.5494,lon:139.7798,name:'Tokio Haneda'}
};
const DEMO:Flight={id:'demo',request_code:'AV-DEMO-001',registration:'AERVELYS Demojet',origin:'EDAZ',destination:'LFMN',requested_departure:'',estimated_block_minutes:110,planning_status:'DEMO / nicht disponiert'};
const flightPhase=(progress:number)=>{
 if(progress<=0)return 'BEREIT';
 if(progress<6)return 'START';
 if(progress<18)return 'STEIGFLUG';
 if(progress<76)return 'REISEFLUG';
 if(progress<98)return 'SINKFLUG / ANFLUG';
 if(progress<100)return 'LANDUNG';
 return 'ANGEKOMMEN';
};
const simulatedTelemetry=(progress:number)=>{
 const climb=clamp(progress/18,0,1),descent=clamp((100-progress)/24,0,1);
 const altitude=Math.round(36000*Math.min(climb,descent)/100)*100;
 const speed=progress<=0||progress>=100?0:Math.round((progress<6?130+progress*25:progress>94?140+(100-progress)*22:420)/5)*5;
 return {altitude,speed};
};
const TILE_URL='https://tile.openstreetmap.org/';
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const wrap=(x:number)=>((x%1)+1)%1;
const lonX=(lon:number)=>wrap((lon+180)/360);
const latY=(lat:number)=>{const r=clamp(lat,-85.0511,85.0511)*Math.PI/180;return clamp((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2,0,1);};
const xLon=(x:number)=>wrap(x)*360-180;
const yLat=(y:number)=>Math.atan(Math.sinh(Math.PI*(1-2*clamp(y,0,1))))*180/Math.PI;
const dxWrap=(a:number,b:number)=>wrap(a-b+0.5)-0.5;
const radians=(n:number)=>n*Math.PI/180;

function greatCircle(a:Point,b:Point,t:number):Point{
 const aLat=radians(a.lat),aLon=radians(a.lon),bLat=radians(b.lat),bLon=radians(b.lon);
 const v=[Math.cos(aLat)*Math.cos(aLon),Math.cos(aLat)*Math.sin(aLon),Math.sin(aLat)];
 const w=[Math.cos(bLat)*Math.cos(bLon),Math.cos(bLat)*Math.sin(bLon),Math.sin(bLat)];
 const angle=Math.acos(clamp(v[0]*w[0]+v[1]*w[1]+v[2]*w[2],-1,1));
 if(angle<1e-7)return a;
 const den=Math.sin(angle),aa=Math.sin((1-t)*angle)/den,bb=Math.sin(t*angle)/den;
 const x=aa*v[0]+bb*w[0],y=aa*v[1]+bb*w[1],z=aa*v[2]+bb*w[2];
 return {lat:Math.atan2(z,Math.sqrt(x*x+y*y))*180/Math.PI,lon:Math.atan2(y,x)*180/Math.PI};
}
function routeLength(a:Point,b:Point){
 const dLat=radians(b.lat-a.lat),dLon=radians(b.lon-a.lon);
 const h=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLon/2)**2;
 return Math.round(6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));
}
function flightPath(a:Point,b:Point,via:Point[]=[]):Point[]{
 const stops=[a,...via,b];
 const list:Point[]=[stops[0]];
 for(let i=1;i<stops.length;i++){
  const prev=stops[i-1],next=stops[i];
  const segments=Math.max(1,Math.min(24,Math.ceil(routeLength(prev,next)/180)));
  for(let j=1;j<=segments;j++)list.push(greatCircle(prev,next,j/segments));
 }
 return list;
}
function routeDistance(points:Point[]):number{
 let distance=0;
 for(let i=1;i<points.length;i++)distance+=routeLength(points[i-1],points[i]);
 return Math.round(distance);
}
function positionAt(points:Point[],fraction:number):Point|null{
 if(!points.length)return null;
 if(points.length===1)return points[0];
 const legs=points.slice(1).map((pt,i)=>routeLength(points[i],pt));
 const total=legs.reduce((sum,d)=>sum+d,0);
 if(total<=0)return points[0];
 let remaining=clamp(fraction,0,1)*total;
 for(let i=0;i<legs.length;i++){
  if(remaining<=legs[i]||i===legs.length-1)
   return greatCircle(points[i],points[i+1],legs[i]?remaining/legs[i]:1);
  remaining-=legs[i];
 }
 return points.at(-1)!;
}
function viewForRoute(a:Point,b:Point,width:number,height:number,via:Point[]=[]):MapView{
 const pts=flightPath(a,b,via);
 const xx=pts.map(p=>dxWrap(lonX(p.lon),lonX(a.lon)));
 const yy=pts.map(p=>latY(p.lat));
 const xMin=Math.min(...xx),xMax=Math.max(...xx),yMin=Math.min(...yy),yMax=Math.max(...yy);
 const spanX=Math.max(0.045,xMax-xMin),spanY=Math.max(0.045,yMax-yMin);
 const zoom=clamp(Math.floor(Math.log2(Math.min(Math.max(320,width-135)/(spanX*256),Math.max(260,height-140)/(spanY*256)))),2,7);
 return {lat:yLat((yMin+yMax)/2),lon:xLon(lonX(a.lon)+(xMin+xMax)/2),zoom};
}
function shortDate(value:string){if(!value)return 'Nicht hinterlegt';const date=new Date(value);return Number.isNaN(date.getTime())?'Nicht hinterlegt':date.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});}
function safeName(code:string){return AIRPORTS[code]?.name||'Koordinaten unbekannt';}
function MapPanel({origin,destination,originCode,destinationCode,waypoints,demo,progress,fullscreen,onFullscreen}:{origin:Geo|undefined;destination:Geo|undefined;originCode?:string;destinationCode?:string;waypoints?:RouteFix[];demo:boolean;progress:number;fullscreen:boolean;onFullscreen:()=>void}){
 const ref=useRef<HTMLDivElement|null>(null);
 const start=useRef<{x:number;y:number;view:MapView}|null>(null);
 const [size,setSize]=useState({w:860,h:470});
 const [view,setView]=useState<MapView>({lat:48.4,lon:10.4,zoom:5});
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  const measure=()=>setSize({w:node.clientWidth||860,h:node.clientHeight||470});
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[fullscreen]);
 useEffect(()=>{
  if(origin&&destination)setView(viewForRoute(origin,destination,size.w,size.h,waypoints));
 },[origin?.lat,origin?.lon,destination?.lat,destination?.lon,waypoints,size.w,size.h]);
 const n=2**view.zoom;
 const centerX=lonX(view.lon)*n*256,centerY=latY(view.lat)*n*256;
 const project=(p:Point)=>({
  x:size.w/2+dxWrap(lonX(p.lon),lonX(view.lon))*n*256,
  y:size.h/2+(latY(p.lat)-latY(view.lat))*n*256
 });
 const tiles:React.ReactNode[]=[];
 const firstX=Math.floor((centerX-size.w/2)/256),lastX=Math.floor((centerX+size.w/2)/256);
 const firstY=Math.max(0,Math.floor((centerY-size.h/2)/256));
 const lastY=Math.min(n-1,Math.floor((centerY+size.h/2)/256));
 for(let x=firstX;x<=lastX;x++)for(let y=firstY;y<=lastY;y++){
  tiles.push(<img key={view.zoom+'-'+x+'-'+y} src={TILE_URL+view.zoom+'/'+((x%n+n)%n)+'/'+y+'.png'} alt="" draggable={false} className={styles.tile} style={{left:x*256-centerX+size.w/2,top:y*256-centerY+size.h/2}}/>);
 }
 const points=origin&&destination?flightPath(origin,destination,waypoints):[];
 const projected=points.map(project);
 const route=projected.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 const passed=demo?projected.slice(0,Math.max(1,Math.round(clamp(progress,0,100)/100*(projected.length-1))+1)):[];
 const completedRoute=passed.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 const originXY=origin&&project(origin),destinationXY=destination&&project(destination);
 const planePoint=demo&&points.length?positionAt(points,progress/100):null;
 const plane=planePoint?project(planePoint):null;
 const previousPoint=demo?positionAt(points,clamp(progress/100-0.005,0,1)):null;
 const nextPoint=demo?positionAt(points,clamp(progress/100+0.005,0,1)):null;
 const prev=previousPoint?project(previousPoint):null;
 const next=nextPoint?project(nextPoint):null;
 const heading=plane&&prev&&next?Math.atan2(next.y-prev.y,next.x-prev.x)*180/Math.PI+45:0;
 function zoom(delta:number){setView(old=>({...old,zoom:clamp(old.zoom+delta,2,8)}));}
 return <div className={styles.map} ref={ref}
  onPointerDown={e=>{if(e.button!==0)return;start.current={x:e.clientX,y:e.clientY,view};e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{if(!start.current)return;const s=start.current,scale=256*(2**s.view.zoom);setView({zoom:s.view.zoom,lon:xLon(lonX(s.view.lon)-(e.clientX-s.x)/scale),lat:yLat(latY(s.view.lat)-(e.clientY-s.y)/scale)});}}
  onPointerUp={()=>{start.current=null;}} onPointerCancel={()=>{start.current=null;}}
  onWheel={e=>{if(e.deltaY!==0)zoom(e.deltaY<0?1:-1);}}
  aria-label="Interaktive Flugkarte: ziehen zum Verschieben, Mausrad oder Plus/Minus zum Zoomen"
 >
  <div className={styles.tileLayer}>{tiles}</div>
  <svg className={styles.mapOverlay} viewBox={'0 0 '+size.w+' '+size.h} aria-hidden="true">
   {route&&<><path d={route} className={styles.routeHalo}/><path d={route} className={styles.routeLine}/>{completedRoute&&<path d={completedRoute} className={styles.routeCompleted}/>}</>}
   {waypoints&&waypoints.length>0&&waypoints.filter((_,i)=>i%Math.max(1,Math.ceil(waypoints.length/35))===0).map((fix,i)=>{
    const p=project(fix);
    return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#e7fcff" stroke="#145d85" strokeWidth={1.6}><title>{fix.ident}</title></circle>;
   })}
  </svg>
  {originXY&&<div className={styles.mapMarker} style={{left:originXY.x,top:originXY.y}}><span className={styles.pinDot}/><div className={styles.pinText}><strong>{originCode}</strong><small>{origin?.name}</small></div></div>}
  {destinationXY&&<div className={styles.mapMarker} style={{left:destinationXY.x,top:destinationXY.y}}><span className={styles.pinDot}/><div className={styles.pinText}><strong>{destinationCode}</strong><small>{destination?.name}</small></div></div>}
  {plane&&<div className={styles.planePin} style={{left:plane.x,top:plane.y}}><Plane size={23} style={{transform:'rotate('+heading+'deg)'}}/></div>}
  <div className={styles.mapCaption}>{waypoints?.length?'SIMBRIEF-WEGPUNKTE · NICHT LIVE':demo?'DEMO-ANIMATION · KEINE TELEMETRIE':'GEPLANTE ROUTE · KEIN LIVE-TRACKING'}</div>
  <div className={styles.mapTools} onPointerDown={e=>e.stopPropagation()}>
   <button type="button" onClick={()=>zoom(1)} aria-label="Karte vergrößern"><ZoomIn size={17}/></button>
   <button type="button" onClick={()=>zoom(-1)} aria-label="Karte verkleinern"><ZoomOut size={17}/></button>
   <button type="button" onClick={()=>{if(origin&&destination)setView(viewForRoute(origin,destination,size.w,size.h,waypoints));}} aria-label="Route zentrieren"><Route size={17}/></button>
   <button type="button" onClick={onFullscreen} aria-label={fullscreen?'Vollbild schließen':'Karte im Vollbild'}><Expand size={17}/></button>
  </div>
  {!origin||!destination?<div className={styles.noCoords}><MapPin size={22}/><strong>Route nicht auf der Karte verfügbar</strong><span>Für mindestens einen ICAO-Code fehlen derzeit Koordinaten. Die Dispatch-Daten bleiben sichtbar.</span></div>:null}
  <div className={styles.attribution}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap-Mitwirkende</a></div>
 </div>;
}

export default function PassengerExperience({publicDemo=false}:{publicDemo?:boolean}){
 const [mode,setMode]=useState<'demo'|'dispatch'>('demo');
 const [area,setArea]=useState<'map'|'cabin'|'connection'>('map');
 const [prepared,setPrepared]=useState<PassengerPlan|null>(null);
 const [playbackSpeed,setPlaybackSpeed]=useState(1);
 useEffect(()=>{
  if(!publicDemo)return;
  const load=()=>setPrepared(readPreparedPlan());
  load();window.addEventListener('storage',load);
  return()=>window.removeEventListener('storage',load);
 },[publicDemo]);
 const [drafts,setDrafts]=useState<Flight[]>([]);
 const [selected,setSelected]=useState('');
 const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [message,setMessage]=useState('');
 const [progress,setProgress]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [fullscreen,setFullscreen]=useState(false);
 const refresh=useCallback(async()=>{
  setState('loading');setMessage('');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key){setMessage('Supabase-Zugang nicht eingerichtet.');setState('error');return;}
  try{
   const result=await createBrowserClient(url,key).rpc('aervelys_dispatch_plans_list');
   if(result.error||!Array.isArray(result.data))throw new Error('Geschützter Dispatch-Zugriff nicht verfügbar.');
   const rows=(result.data as Flight[]).filter(row=>row&&typeof row.id==='string'&&typeof row.origin==='string'&&typeof row.destination==='string');
   setDrafts(rows);setSelected(old=>rows.some(row=>row.id===old)?old:rows[0]?.id||'');setState('ready');
  }catch{setMessage('Flugplanentwürfe konnten nicht gelesen werden. Anmeldung und Berechtigungen prüfen.');setState('error');}
 },[]);
 useEffect(()=>{if(!publicDemo)void refresh();},[refresh,publicDemo]);
 useEffect(()=>{if(!playing||mode!=='demo')return;const id=window.setInterval(()=>setProgress(p=>Math.min(100,p+playbackSpeed)),750);return()=>window.clearInterval(id);},[playing,mode,playbackSpeed]);
 useEffect(()=>{if(progress>=100&&playing)setPlaying(false);},[progress,playing]);
 const demoOrigin=publicDemo&&prepared?prepared.origin:'EDAZ';
 const demoDestination=publicDemo&&prepared?prepared.destination:'LFMN';
 const fromFix=publicDemo&&prepared?prepared.originPoint:null;
 const toFix=publicDemo&&prepared?prepared.destinationPoint:null;
 const demoA=fromFix??AIRPORTS[demoOrigin]??prepared?.fixes?.[0]??AIRPORTS.EDAZ;
 const demoB=toFix??AIRPORTS[demoDestination]??prepared?.fixes?.at(-1)??AIRPORTS.LFMN;
 const plannedPoints=publicDemo&&prepared?prepared.fixes:[];
 const demoDistance=routeDistance(flightPath(demoA,demoB,plannedPoints));
 const demoDuration=prepared?.durationMinutes??Math.max(40,Math.round((demoDistance/740*60+35)/5)*5);
 const demoFlight:Flight={...DEMO,origin:demoOrigin,destination:demoDestination,
  request_code:publicDemo&&prepared?(prepared.flightNumber||'SIMBRIEF OFP'):'AV-DEMO-001',
  registration:publicDemo&&prepared?(prepared.registration||'Nicht hinterlegt'):DEMO.registration,
  estimated_block_minutes:demoDuration};
 const flight=mode==='demo'?demoFlight:drafts.find(x=>x.id===selected);
 const origin=mode==='demo'?{...demoA,name:AIRPORTS[demoOrigin]?.name||'SimBrief Abflug'}:flight?AIRPORTS[flight.origin?.toUpperCase()]:undefined;
 const destination=mode==='demo'?{...demoB,name:AIRPORTS[demoDestination]?.name||'SimBrief Ziel'}:flight?AIRPORTS[flight.destination?.toUpperCase()]:undefined;
 const waypoints=mode==='demo'&&publicDemo&&prepared?prepared.fixes:undefined;
 const distance=origin&&destination?routeDistance(flightPath(origin,destination,waypoints)):null;
 const remaining=mode==='demo'?Math.round(demoDuration*(1-progress/100)):null;
 const elapsed=Math.round(demoDuration*progress/100);
 const telemetry=simulatedTelemetry(progress);
 return <div className={styles.screen}>
  <section className={styles.intro}>
   <div><div className="eyebrow">AERVELYS NEXT / DIGITAL CABIN</div><h2>Passenger Experience</h2><p>{publicDemo?'Öffentliche Demo der Passagierkarte – ohne Konto und ausschließlich mit fiktiven Flugdaten.':'Interaktive Fluginformationskarte für Chartergäste und Simulatorflüge. Geschützte NEXT-Integration im ersten Ausbauschritt.'}</p></div>
   <span className={styles.beta}>PASSENGER DISPLAY · BETA</span>
  </section>
  <div className={styles.areaTabs} role="tablist" aria-label="Bereiche der Passenger Experience">
   <button role="tab" type="button" aria-selected={area==='map'} className={area==='map'?styles.areaActive:styles.areaTab} onClick={()=>{setArea('map');setFullscreen(false);}}><MapPin size={18}/><span><strong>01 · Flugkarte</strong><small>Route & Flugfortschritt</small></span></button>
   <button role="tab" type="button" aria-selected={area==='cabin'} className={area==='cabin'?styles.areaActive:styles.areaTab} onClick={()=>{setArea('cabin');setFullscreen(false);}}><Plane size={18}/><span><strong>02 · Kabinendisplay</strong><small>Passagierinformationen</small></span></button>
   <button role="tab" type="button" aria-selected={area==='connection'} className={area==='connection'?styles.areaActive:styles.areaTab} onClick={()=>{setArea('connection');setFullscreen(false);}}><RadioTower size={18}/><span><strong>03 · Integration</strong><small>SimBrief · NEXT · MSFS</small></span></button>
  </div>
  {area==='map'&&<>
  <div className={styles.modeBar} role="group" aria-label="Datenquelle">
   <button type="button" className={mode==='demo'?styles.modeActive:styles.mode} onClick={()=>{setMode('demo');setPlaying(false);}}><Play size={15}/>{publicDemo&&prepared?'SimBrief-Route · Demo-Wiedergabe':'Demo-Flug'}</button>
   {!publicDemo&&<button type="button" className={mode==='dispatch'?styles.modeActive:styles.mode} onClick={()=>{setMode('dispatch');setPlaying(false);}}><ArrowLeftRight size={15}/>NEXT-Dispositionsentwürfe</button>}
   <span className={styles.liveStatus}><CloudOff size={15}/> SimConnect nicht verbunden</span>
  </div>
  {mode==='demo'&&<div className={styles.preparedStatus}>
   <div><strong>{publicDemo&&prepared?'SimBrief-Flugplan geladen':'Noch kein SimBrief-Flugplan hinterlegt'}</strong>
   <span>{publicDemo&&prepared?prepared.origin+' → '+prepared.destination+' · '+prepared.fixes.length+' Wegpunkte · nur geplante Route':'Platzhalterstrecke EDAZ → LFMN · keine Flugplandaten'}</span></div>
   <a href="/passenger-demo/setup" className={styles.routeLinkButton}>Flug in SimBrief vorbereiten / importieren</a>
  </div>}
  {mode==='dispatch'&&<div className={styles.selector}>
   <label htmlFor="passenger-flight">Gespeicherter Flugplan <select id="passenger-flight" value={selected} disabled={state!=='ready'||drafts.length===0} onChange={e=>setSelected(e.target.value)}>
    {drafts.length===0?<option value="">Keine Flugpläne verfügbar</option>:drafts.map(row=><option key={row.id} value={row.id}>{row.request_code} · {row.origin} → {row.destination}</option>)}
   </select></label>
   <button type="button" onClick={()=>void refresh()} disabled={state==='loading'}><RefreshCw size={15}/> Aktualisieren</button>
  </div>}
  {mode==='dispatch'&&state==='error'&&<p role="alert" className={styles.warning}>{message}</p>}
  {mode==='dispatch'&&state==='ready'&&!flight&&<p className={styles.warning}>Noch keine Dispositionsentwürfe vorhanden. Erstelle zunächst einen Flugplan in der Flugdisposition. Alternativ kannst du die Karte im Demo-Modus testen.</p>}
  </>}
  {area==='map'&&<div className={fullscreen?styles.fullscreen:styles.display}>
   <div className={styles.displayHeader}>
    <div className={styles.brand}><span className={styles.brandIcon}>A</span><span><strong>AERVELYS</strong><small>PRIVATE AVIATION</small></span></div>
    <div className={styles.flightId}><span>{mode==='demo'&&publicDemo&&prepared?'SIMBRIEF ROUTE / DEMO PLAYBACK':mode==='demo'?'ILLUSTRATION / DEMO':'DISPATCH DRAFT / PLANNING ONLY'}</span><strong>{flight?.request_code||'KEIN FLUG GEWÄHLT'}</strong></div>
   </div>
   <div className={styles.routeHeader}>
    <div><small>DEPARTURE</small><strong>{flight?.origin||'—'}</strong><span>{flight?safeName(flight.origin):'—'}</span></div>
    <div className={styles.travel}><Plane size={23}/><span>ROUTE PREVIEW</span></div>
    <div className={styles.arrival}><small>ARRIVAL</small><strong>{flight?.destination||'—'}</strong><span>{flight?safeName(flight.destination):'—'}</span></div>
   </div>
   <MapPanel origin={origin} destination={destination} originCode={flight?.origin} destinationCode={flight?.destination} waypoints={waypoints} demo={mode==='demo'} progress={progress} fullscreen={fullscreen} onFullscreen={()=>setFullscreen(v=>!v)}/>
   <div className={styles.flightStats}>
    <div><small>FLUGZEUG</small><strong>{flight?.registration||'—'}</strong></div>
    <div><small>{waypoints?.length?'ROUTENLÄNGE (SIMBRIEF)':'DISTANZ (LUFTLINIE)'}</small><strong>{distance!==null?distance.toLocaleString('de-DE')+' km':'—'}</strong></div>
    <div><small>{mode==='demo'?'SIMULIERTE RESTZEIT':'BLOCKZEIT (ENTWURF)'}</small><strong>{mode==='demo'?remaining+' min':flight?.estimated_block_minutes!=null?flight.estimated_block_minutes+' min':'—'}</strong></div>
    <div><small>{mode==='demo'?'SIM · HÖHE / SPEED':'HÖHE / SPEED'}</small><strong>{mode==='demo'?telemetry.altitude.toLocaleString('de-DE')+' ft · '+telemetry.speed+' kt':'— / —'}</strong></div>
   </div>
   {mode==='demo'&&<div className={styles.simPanel}>
    <div className={styles.simMeta}><span className={styles.simPhase}><Plane size={14}/> {flightPhase(progress)}</span><span>Verstrichen: {elapsed} min</span><span>Verbleibend: {remaining} min</span><span>Dauer: ca. {demoDuration} min*</span></div>
    <div className={styles.playback}>
     <button type="button" onClick={()=>{if(progress>=100){setProgress(0);setPlaying(true);}else setPlaying(v=>!v);}} aria-label={playing?'Demo pausieren':'Demo starten'}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause':'Demo abspielen'}</button>
     <input aria-label="Simulierter Flugfortschritt" type="range" min={0} max={100} step={1} value={progress} onChange={e=>{setProgress(Number(e.target.value));setPlaying(false);}}/>
     <span className={styles.progressLabel}>{progress}%</span>
     <label className={styles.speedLabel}>Animation <select aria-label="Animationsgeschwindigkeit" value={playbackSpeed} onChange={e=>setPlaybackSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
    </div>
    <small className={styles.simDisclaimer}>*Alle Zeiten, Flugphasen, Höhen und Geschwindigkeiten sind illustrativ, nicht aus MSFS gemessen und keine Flugplanung.</small>
   </div>}
   {mode==='dispatch'&&flight&&<div className={styles.dispatchNotice}><Clock3 size={15}/> Geplanter Abflug: {shortDate(flight.requested_departure)} · {flight.planning_status} · Keine Live-Position oder Flugfreigabe</div>}
   <div className={styles.disclaimer}><ShieldAlert size={15}/> Dieser Bildschirm stellt keine flugbetriebliche Freigabe dar. Für Live-Tracking sind ein gekoppelter MSFS-Connector und geprüfte Telemetrie erforderlich.</div>
  </div>}
  {area!=='map'&&<PassengerSections section={area==='cabin'?'cabin':'connection'} flight={flight??null} originName={origin?.name||'—'} destinationName={destination?.name||'—'} distance={distance} progress={mode==='demo'?progress:0} remaining={mode==='demo'?remaining:null} prepared={publicDemo?prepared:null} publicDemo={publicDemo} dispatchState={state} draftCount={drafts.length} onOpenMap={()=>setArea('map')}/>}
  <div className={styles.footerNote}>Kartendaten © OpenStreetMap-Mitwirkende. {publicDemo?'Der vorbereitete SimBrief-Plan wird ausschließlich lokal in diesem Browser gelesen. Es findet keine Synchronisierung auf weitere Geräte statt. Flugbewegung und Werte sind Demo-Animation, keine MSFS-Telemetrie.':'Die Flugplanliste wird nur mit bestehenden NEXT-Berechtigungen gelesen; es werden keine Flüge angelegt oder verändert.'}</div>
 </div>;
}
