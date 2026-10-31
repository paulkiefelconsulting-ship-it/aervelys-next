// Read-only SimBrief OFP route normalization for the browser's pilot preparation page.
// This does not submit flight plans, authenticate users or persist any operational data.
export type RouteFix = {ident:string;lat:number;lon:number};
export type PassengerPlan = {
 source:'simbrief'; origin:string;destination:string;
 originPoint:RouteFix|null;destinationPoint:RouteFix|null;
 fixes:RouteFix[];flightNumber:string;registration:string;routeText:string;
 durationMinutes:number|null;preparedAt:string;
};
export const PLAN_STORAGE_KEY='aervelys_passenger_prepared_plan_v1';
const asText=(value:unknown)=>typeof value==='string'?value:String(value??'');
const text=(value:unknown)=>asText(value).trim();
function icao(value:unknown){
 const code=text(value).toUpperCase();
 if(!/^[A-Z0-9]{4}$/.test(code))throw Error('Im SimBrief-Flugplan fehlen gültige ICAO-Codes für Start oder Ziel.');
 return code;
}
function coords(lat:unknown,lon:unknown,ident:unknown):RouteFix|null {
 const a=Number(lat),b=Number(lon);
 if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>90||Math.abs(b)>180||
  (text(lat)===''||text(lon)===''))return null;
 const name=text(ident).slice(0,30).replace(/[^A-Za-z0-9 -]/g,'');
 return {ident:name||'FIX',lat:a,lon:b};
}
function normalizeFixes(rows:unknown[]):RouteFix[]{
 const seen=new Set<string>();
 const result:RouteFix[]=[];
 for(const entry of rows.slice(0,600)){
  if(!entry||typeof entry!=='object')continue;
  const row=entry as Record<string,unknown>;
  const fix=coords(row.pos_lat??row.lat,row.pos_long??row.lon,row.ident??row.name);
  if(!fix)continue;
  const key=fix.ident+':'+fix.lat.toFixed(5)+':'+fix.lon.toFixed(5);
  if(seen.has(key))continue;
  seen.add(key);result.push(fix);
  if(result.length>=250)break;
 }
 if(result.length<1)throw Error('Im OFP sind keine Wegpunkte mit Koordinaten enthalten. Bitte SimBrief Navlog/XML oder JSON v2 exportieren.');
 return result;
}
function duration(input:unknown):number|null{
 const value=text(input);
 if(!value)return null;
 // SimBrief JSON v2 uses HH:MM:SS; XML uses seconds.
 if(/^\d{1,3}:\d\d(?::\d\d)?$/.test(value)){
  const p=value.split(':').map(Number);
  const seconds=p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];
  return seconds>0&&seconds<48*3600?Math.round(seconds/60):null;
 }
 const sec=Number(value);
 return Number.isFinite(sec)&&sec>0&&sec<48*3600?Math.round(sec/60):null;
}
function finish(info:{
 origin:unknown;destination:unknown;
 originLat:unknown;originLon:unknown;destLat:unknown;destLon:unknown;
 rawFixes:unknown[];flightNumber:unknown;registration:unknown;routeText:unknown;
 duration:unknown;
}):PassengerPlan{
 const origin=icao(info.origin),destination=icao(info.destination);
 if(origin===destination)throw Error('Start und Ziel müssen unterschiedlich sein.');
 return {
  source:'simbrief',origin,destination,
  originPoint:coords(info.originLat,info.originLon,origin),
  destinationPoint:coords(info.destLat,info.destLon,destination),
  fixes:normalizeFixes(info.rawFixes),
  flightNumber:text(info.flightNumber).slice(0,25),
  registration:text(info.registration).slice(0,25),
  routeText:text(info.routeText).slice(0,3000),
  durationMinutes:duration(info.duration),
  preparedAt:new Date().toISOString()
 };
}
export function parseSimbriefOfp(data:string):PassengerPlan{
 if(data.length>3_000_000)throw Error('Die OFP-Datei ist zu groß (maximal 3 MB).');
 const raw=data.trim();
 if(raw.startsWith('{')){
  let obj:Record<string,unknown>;
  try{obj=JSON.parse(raw);}catch{throw Error('Die JSON-Datei ist ungültig.');}
  const o=obj.origin as Record<string,unknown>|undefined;
  const d=obj.destination as Record<string,unknown>|undefined;
  const g=obj.general as Record<string,unknown>|undefined;
  const a=obj.aircraft as Record<string,unknown>|undefined;
  const t=obj.times as Record<string,unknown>|undefined;
  const atc=obj.atc as Record<string,unknown>|undefined;
  const nav=obj.navlog;
  const rawFixes=Array.isArray(nav)?nav:
    nav&&typeof nav==='object'?((nav as Record<string,unknown>).fix??[]):[];
  return finish({
   origin:o?.icao_code??o?.icao,destination:d?.icao_code??d?.icao,
   originLat:o?.pos_lat,originLon:o?.pos_long,destLat:d?.pos_lat,destLon:d?.pos_long,
   rawFixes:Array.isArray(rawFixes)?rawFixes:[],
   flightNumber:atc?.callsign??g?.flight_number,registration:a?.reg??a?.registration,
   routeText:g?.route??atc?.route,duration:t?.est_block??t?.est_time_enroute
  });
 }
 if(!raw.startsWith('<')&&!raw.startsWith('<?xml'))throw Error('Bitte eine SimBrief XML- oder JSON-v2-OFP-Datei auswählen.');
 const doc=new DOMParser().parseFromString(raw,'application/xml');
 if(doc.querySelector('parsererror')||!doc.querySelector('OFP'))throw Error('Die XML-Datei ist kein gültiges SimBrief OFP.');
 const get=(path:string)=>doc.querySelector(path)?.textContent??'';
 const fixes=Array.from(doc.querySelectorAll('navlog > fix')).map(node=>({
  ident:node.querySelector('ident')?.textContent,
  pos_lat:node.querySelector('pos_lat')?.textContent,
  pos_long:node.querySelector('pos_long')?.textContent
 }));
 return finish({
  origin:get('origin > icao_code')||get('origin > icao'),
  destination:get('destination > icao_code')||get('destination > icao'),
  originLat:get('origin > pos_lat'),originLon:get('origin > pos_long'),
  destLat:get('destination > pos_lat'),destLon:get('destination > pos_long'),
  rawFixes:fixes,flightNumber:get('atc > callsign')||get('general > flight_number'),
  registration:get('aircraft > reg')||get('aircraft > registration'),
  routeText:get('general > route')||get('atc > route'),
  duration:get('times > est_block')||get('times > est_time_enroute')
 });
}
export function readPreparedPlan():PassengerPlan|null{
 try{
  const raw=localStorage.getItem(PLAN_STORAGE_KEY);
  if(!raw)return null;
  const plan=JSON.parse(raw) as PassengerPlan;
  if(plan?.source!=='simbrief'||!/^[A-Z0-9]{4}$/.test(plan.origin)||
   !/^[A-Z0-9]{4}$/.test(plan.destination)||!Array.isArray(plan.fixes)||
   plan.fixes.length>250||!plan.fixes.every(f=>!!coords(f.lat,f.lon,f.ident)))return null;
  return plan;
 }catch{return null;}
}
