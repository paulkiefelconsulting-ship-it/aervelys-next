/**
 * Direct, documented Navigraph/SimBrief Dispatch Options redirect.
 * No SimBrief API key, no credential collection, no OFP-generation claims.
 * No route is invented: SimBrief chooses a suggested route if omitted.
 * Reference: Navigraph Dispatch Redirect Guide.
 */
export type SimBriefLeg={
 origin:string;destination:string;aircraftType:string;
 departureAt?:string|null;estimatedHours?:number|null;passengers?:number|null;
 registration?:string|null;route?:string|null;
};
const ICAO=/^[A-Z]{4}$/;
const TYPE:Record<string,string>={
 'Cessna Citation CJ4':'C25C',
 'Embraer Phenom 300E':'E55P',
 'Cessna Citation Longitude':'C700',
 'Cirrus Vision Jet G2':'SF50'
};
export function simbriefUrlForLeg(leg:SimBriefLeg):string|null{
 const orig=leg.origin?.trim().toUpperCase(),dest=leg.destination?.trim().toUpperCase();
 const type=TYPE[leg.aircraftType];
 if(!ICAO.test(orig)||!ICAO.test(dest)||orig===dest||!type)return null;
 const url=new URL('https://dispatch.simbrief.com/options/custom');
 const p=url.searchParams;
 p.set('airline','AVF');p.set('orig',orig);p.set('dest',dest);p.set('type',type);
 p.set('units','KGS');
 const pax=leg.passengers;
 if(Number.isInteger(pax)&&pax!==null&&pax!==undefined&&pax>=0&&pax<=30)
  p.set('pax',String(pax));
 const hours=leg.estimatedHours;
 if(typeof hours==='number'&&Number.isFinite(hours)&&hours>0&&hours<=24){
  const minutes=Math.round(hours*60);
  p.set('steh',String(Math.floor(minutes/60)));
  p.set('stem',String(minutes%60).padStart(2,'0'));
 }
 if(leg.departureAt){
  const date=new Date(leg.departureAt);
  if(Number.isFinite(date.getTime())){
   const month=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getUTCMonth()];
   const year=String(date.getUTCFullYear()).slice(-2);
   p.set('date',String(date.getUTCDate()).padStart(2,'0')+month+year);
   p.set('deph',String(date.getUTCHours()).padStart(2,'0'));
   p.set('depm',String(date.getUTCMinutes()).padStart(2,'0'));
  }
 }
 // The old V2 example registration AVF-CJ4 is NOT a verified real airframe.
 // Only pass registration when in normal aircraft registration syntax.
 const reg=leg.registration?.trim().toUpperCase();
 if(reg && /^(?:[A-Z]-[A-Z0-9]{4}|[A-Z0-9]{4,7})$/.test(reg)&&!reg.startsWith('AVF-')){
  p.set('reg',reg);
 }
 const route=leg.route?.trim();
 if(route&&route.length<=700&&/^[A-Za-z0-9 /.+-]+$/.test(route))p.set('route',route);
 return url.toString();
}
