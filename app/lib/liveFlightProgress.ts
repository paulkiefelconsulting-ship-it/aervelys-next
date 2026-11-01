/**
 * Read-only live progress along the *pilot-imported* SimBrief polyline.
 * This is distance-on-route, NOT a dispatch calculation or airborne navigation tool.
 */
export type Coordinate={lat:number;lon:number};
export type LiveRouteMetrics={
 status:'on-route'|'off-route'|'no-plan';
 progress:number|null;
 completedKm:number|null;
 remainingKm:number|null;
 routeKm:number|null;
 crossTrackKm:number|null;
 etaMinutes:number|null;
 etaAtUtc:string|null;
};
const EARTH_KM=6371.0088;
const rad=(deg:number)=>deg*Math.PI/180;
const deltaLon=(a:number,b:number)=>((b-a+540)%360)-180;
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
function valid(p:Coordinate){return Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
export function greatCircleDistanceKm(a:Coordinate,b:Coordinate){
 const lat=rad(b.lat-a.lat),lon=rad(deltaLon(a.lon,b.lon));
 const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;
 return EARTH_KM*2*Math.asin(Math.sqrt(clamp(h,0,1)));
}
/** Spherical interpolation prevents 500-km leg shortcuts at higher latitudes. */
function interpolate(a:Coordinate,b:Coordinate,t:number):Coordinate{
 const d=greatCircleDistanceKm(a,b)/EARTH_KM;
 if(d<1e-8)return a;
 const sa=Math.sin((1-t)*d)/Math.sin(d),sb=Math.sin(t*d)/Math.sin(d);
 const latA=rad(a.lat),latB=rad(b.lat),lonA=rad(a.lon),lonB=rad(b.lon);
 const x=sa*Math.cos(latA)*Math.cos(lonA)+sb*Math.cos(latB)*Math.cos(lonB);
 const y=sa*Math.cos(latA)*Math.sin(lonA)+sb*Math.cos(latB)*Math.sin(lonB);
 const z=sa*Math.sin(latA)+sb*Math.sin(latB);
 return {lat:Math.atan2(z,Math.hypot(x,y))*180/Math.PI,lon:Math.atan2(y,x)*180/Math.PI};
}
function routeSegments(stops:Coordinate[]){
 const pts:Coordinate[]=[stops[0]];
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i],segments=Math.max(1,Math.min(60,Math.ceil(greatCircleDistanceKm(a,b)/45)));
  for(let j=1;j<=segments;j++)pts.push(interpolate(a,b,j/segments));
 }
 return pts;
}
/** No inferred 0% when the aircraft is nowhere near the imported flight plan. */
export function liveRouteProgress(stops:Coordinate[],position:Coordinate,groundSpeedKt:number,
 nowUtc:string,onGround:boolean,offRouteLimitKm=40):LiveRouteMetrics{
 const empty:LiveRouteMetrics={status:'no-plan',progress:null,completedKm:null,remainingKm:null,routeKm:null,crossTrackKm:null,etaMinutes:null,etaAtUtc:null};
 if(stops.length<2||!stops.every(valid)||!valid(position))return empty;
 const points=routeSegments(stops);
 let totalKm=0;
 const segments:number[]=[];
 for(let i=1;i<points.length;i++){const length=greatCircleDistanceKm(points[i-1],points[i]);segments.push(length);totalKm+=length;}
 if(totalKm<0.05)return empty;
 let nearest=Infinity,alongKm=0,cumulative=0;
 for(let i=1;i<points.length;i++){
  const start=points[i-1],end=points[i],length=segments[i-1];
  if(length<=0.001){cumulative+=length;continue;}
  const cosine=Math.cos(rad((start.lat+end.lat+position.lat)/3));
  const sx=deltaLon(start.lon,end.lon)*cosine*111.195,sy=(end.lat-start.lat)*111.195;
  const px=deltaLon(start.lon,position.lon)*cosine*111.195,py=(position.lat-start.lat)*111.195;
  const t=clamp((px*sx+py*sy)/Math.max(1e-9,sx*sx+sy*sy),0,1);
  const candidate={lat:start.lat+(end.lat-start.lat)*t,lon:((start.lon+deltaLon(start.lon,end.lon)*t+540)%360)-180};
  const distance=greatCircleDistanceKm(position,candidate);
  if(distance<nearest){nearest=distance;alongKm=cumulative+t*length;}
  cumulative+=length;
 }
 const onRoute=nearest<=offRouteLimitKm;
 if(!onRoute)return {...empty,status:'off-route',routeKm:Math.round(totalKm),crossTrackKm:Math.round(nearest)};
 const completed=clamp(alongKm,0,totalKm),left=Math.max(0,totalKm-completed);
 const speedValid=!onGround&&Number.isFinite(groundSpeedKt)&&groundSpeedKt>=60&&groundSpeedKt<=950;
 const eta=speedValid?Math.round(left/(groundSpeedKt*1.852)*60):null;
 const validEta=eta!==null&&eta>=0&&eta<=24*60&&Number.isFinite(Date.parse(nowUtc));
 return {
  status:'on-route',progress:Math.round(completed/totalKm*1000)/10,
  completedKm:Math.round(completed),remainingKm:Math.round(left),
  routeKm:Math.round(totalKm),crossTrackKm:Math.round(nearest*10)/10,
  etaMinutes:validEta?eta:null,etaAtUtc:validEta?new Date(Date.parse(nowUtc)+eta!*60000).toISOString():null
 };
}
