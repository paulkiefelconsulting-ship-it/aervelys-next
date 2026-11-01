/* AERVELYS NEXT — local Chrome file telemetry, read-only and untrusted.
 * Actual v0.4 Windows Bridge JSON field names have not yet been verified.
 * This adapter reports missing fields instead of inventing telemetry/units.
 */
type RecordValue=Record<string,unknown>;
const object=(v:unknown):RecordValue|null=>
 v!==null&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:null;
const scopeKeys=['telemetry','sample','data','state','aircraft','flight',
 'sim','simconnect','payload','latest','position','instruments'] as const;
const candidates=(root:unknown)=>{
 const out:RecordValue[]=[];
 const seen=new Set<object>();
 const walk=(v:unknown,depth:number)=>{
  const rec=object(v);
  if(!rec||seen.has(rec)||depth>2||out.length>=32)return;
  seen.add(rec);
  out.push(rec);
  for(const k of scopeKeys)walk(rec[k],depth+1);
 };
 walk(root,0);
 return out;
};
function pick(objects:RecordValue[],aliases:string[]):unknown{
 for(const o of objects){
  for(const k of aliases)if(Object.prototype.hasOwnProperty.call(o,k)&&o[k]!==null&&o[k]!==undefined)
   return o[k];
 }
 return null;
}
const finite=(v:unknown,min:number,max:number)=>{
 const n=typeof v==='number'?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())?Number(v.trim()):NaN;
 return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const str=(v:unknown,max=120)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
export type LocalBridgeTelemetry={
 phase:string|null;latitude:number|null;longitude:number|null;
 groundspeed_kt:number|null;indicated_airspeed_kt:number|null;
 altitude_ft:number|null;agl_ft:number|null;vertical_speed_fpm:number|null;
 on_ground:boolean|null;engine_running:boolean|null;
 observed_at:string|null;session_id:string|null;request_id:string|null;
 rawKeys:string[];missingForCloudBridge:string[];
 missingForSimMission:string[];
};
function flag(v:unknown):boolean|null{
 if(typeof v==='boolean')return v;
 if(v===0||v==='0'||v==='false'||v==='False')return false;
 if(v===1||v==='1'||v==='true'||v==='True')return true;
 return null;
}
function time(v:unknown):string|null{
 if(typeof v!=='string'&&typeof v!=='number')return null;
 const d=new Date(v);
 return Number.isFinite(d.getTime())?d.toISOString():null;
}
export function decodeLocalBridgeTelemetry(input:unknown):LocalBridgeTelemetry{
 const rec=object(input);
 if(!rec)throw Error('Die ausgewählte Datei enthält kein JSON-Objekt.');
 const scopes=candidates(rec);
 const value=(...aliases:string[])=>pick(scopes,aliases);
 const phase=str(value('phase','flight_phase','flightPhase','phase_name'),60);
 const latitude=finite(value('latitude','lat','plane_latitude'),-90,90);
 const longitude=finite(value('longitude','lon','lng','long','plane_longitude'),-180,180);
 const groundspeed_kt=finite(value('groundspeed_kt','ground_speed_kt','groundSpeedKnots','gs_kt','groundspeedKts'),0,1500);
 const indicated_airspeed_kt=finite(value('indicated_airspeed_kt','ias_kt','airspeed_indicated_kt','iasKnots'),0,900);
 // altitude_ft and AGL are intentionally separate: MSL/pressure altitude MUST NOT be treated as AGL.
 const altitude_ft=finite(value('altitude_ft','alt_ft','altitudeFeet','altitude_msl_ft'),-2500,110000);
 const agl_ft=finite(value('agl_ft','altitude_agl_ft','height_above_ground_ft'),-100,120000);
 const vertical_speed_fpm=finite(value('vertical_speed_fpm','verticalSpeedFpm','vs_fpm','vsi_fpm'),-15000,15000);
 const on_ground=flag(value('on_ground','is_on_ground','sim_on_ground'));
 const engine_running=flag(value('engine_running','engine1_running','engine_1_running'));
 const observed_at=time(value('observed_at','observedAt','sample_timestamp','timestamp_utc'));
 const session_id=str(value('session_id','sessionId'),80);
 const request_id=str(value('request_id','charter_request_id','mission_request_id'),80);
 const rawKeys=[...new Set(scopes.flatMap(o=>Object.keys(o).slice(0,80)))]
  .filter(k=>/^[a-zA-Z][\w.-]{0,63}$/.test(k)).slice(0,50).sort();
 const cloudRequired:{key:keyof LocalBridgeTelemetry;label:string}[]=[
  {key:'observed_at',label:'observed_at (ISO-Zeitstempel)'},
  {key:'session_id',label:'session_id (Flugsitzung)'},
  {key:'phase',label:'phase (PARKED/TAXI_OUT/TAKEOFF/...)'},
  {key:'latitude',label:'latitude (-90…90)'},
  {key:'longitude',label:'longitude (-180…180)'},
  {key:'altitude_ft',label:'altitude_ft (ft)'},
  {key:'groundspeed_kt',label:'groundspeed_kt (kt)'},
 ];
 const simRequired:{key:keyof LocalBridgeTelemetry;label:string}[]=[
  {key:'on_ground',label:'on_ground (bool)'},
  {key:'groundspeed_kt',label:'groundspeed_kt (kt)'},
  {key:'agl_ft',label:'agl_ft (Höhe über Grund, ft)'},
  {key:'vertical_speed_fpm',label:'vertical_speed_fpm (ft/min)'},
  {key:'indicated_airspeed_kt',label:'indicated_airspeed_kt (KIAS)'}
 ];
 return {phase,latitude,longitude,groundspeed_kt,indicated_airspeed_kt,altitude_ft,
  agl_ft,vertical_speed_fpm,on_ground,engine_running,observed_at,session_id,request_id,
  rawKeys,
  missingForCloudBridge:cloudRequired.filter(f=>inputMissing(f.key)).map(f=>f.label),
  missingForSimMission:simRequired.filter(f=>inputMissing(f.key)).map(f=>f.label)
 };
 function inputMissing(k:keyof LocalBridgeTelemetry){
  switch(k){
   case 'phase':return phase===null;
   case 'observed_at':return observed_at===null;
   case 'session_id':return session_id===null;
   case 'latitude':return latitude===null;
   case 'longitude':return longitude===null;
   case 'altitude_ft':return altitude_ft===null;
   case 'groundspeed_kt':return groundspeed_kt===null;
   case 'on_ground':return on_ground===null;
   case 'agl_ft':return agl_ft===null;
   case 'vertical_speed_fpm':return vertical_speed_fpm===null;
   case 'indicated_airspeed_kt':return indicated_airspeed_kt===null;
   default:return true;
  }
 }
}
