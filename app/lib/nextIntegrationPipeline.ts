/**
 * AERVELYS NEXT / unified read-only flight lifecycle.
 * Never assumes a missing source means an absent record. Never treats
 * an MSFS evidence link as a flight release or a financial posting.
 */
export type Stage='present'|'absent'|'unavailable'|'not_applicable';
export type CharterRow={
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 requested_departure?:string|null;request_status?:string|null;
};
export type DispatchRow={
 id:string;request_id:string;request_code:string;planning_status:string;
 registration?:string|null;
};
export type SimRequestRow={
 request_id:string;request_code:string;origin_icao:string;destination_icao:string;
 requested_departure?:string|null;
};
export type MissionRow={
 request_id:string;phase:string;lifecycle:string;elapsed_minutes?:number;
};
export type LinkRow={
 request_id:string;status:string;device_name?:string|null;
 last_sample?:{received_at?:string|null}|null;
};
export type LifecycleFeeds={
 charters:CharterRow[]|null;dispatch:DispatchRow[]|null;
 simRequests:SimRequestRow[]|null;missions:MissionRow[]|null;links:LinkRow[]|null;
};
export type LifecycleFlight={
 id:string;code:string;origin:string;destination:string;departure:string|null;
 isSim:boolean;charter:Stage;planning:Stage;mission:Stage;evidence:Stage;
 charterStatus:string|null;planningStatus:string|null;registration:string|null;
 missionPhase:string|null;missionLifecycle:string|null;linkStatus:string|null;
};
const hasId=(v:{request_id:string})=>typeof v.request_id==='string'&&v.request_id.trim().length>0;
const state=(available:boolean,present:boolean):Stage=>!available?'unavailable':present?'present':'absent';
const validCode=(code:unknown):code is string=>typeof code==='string'&&code.trim().length>0;
const safeLabel=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;

export function composeLifecycle(feeds:LifecycleFeeds):LifecycleFlight[]{
 const base=new Map<string,{id:string;code:string;origin:string;destination:string;
  departure:string|null;isSim:boolean;fromCharter:boolean}>();
 for(const c of feeds.charters||[]){
  if(!hasId(c)||!validCode(c.request_code))continue;
  base.set(c.request_id,{id:c.request_id,code:c.request_code,origin:safeLabel(c.origin_icao)||'—',
   destination:safeLabel(c.destination_icao)||'—',departure:safeLabel(c.requested_departure),
   isSim:c.request_code.startsWith('AV-SIM-'),fromCharter:true});
 }
 for(const r of feeds.simRequests||[]){
  if(!hasId(r)||!validCode(r.request_code))continue;
  const prior=base.get(r.request_id);
  if(prior){prior.isSim=true;continue;}
  base.set(r.request_id,{id:r.request_id,code:r.request_code,
   origin:safeLabel(r.origin_icao)||'—',destination:safeLabel(r.destination_icao)||'—',
   departure:safeLabel(r.requested_departure),isSim:true,fromCharter:false});
 }
 const dispatchByRequest=new Map((feeds.dispatch||[]).filter(hasId).map(p=>[p.request_id,p]));
 const missionsByRequest=new Map((feeds.missions||[]).filter(hasId).map(m=>[m.request_id,m]));
 const linksByRequest=new Map((feeds.links||[]).filter(hasId).map(l=>[l.request_id,l]));
 return [...base.values()].map(c=>{
  const dispatch=dispatchByRequest.get(c.id);
  const mission=c.isSim?missionsByRequest.get(c.id):undefined;
  const link=c.isSim?linksByRequest.get(c.id):undefined;
  return {
   id:c.id,code:c.code,origin:c.origin,destination:c.destination,departure:c.departure,
   isSim:c.isSim,
   charter:c.fromCharter?'present':state(feeds.charters!==null,false),
   planning:state(feeds.dispatch!==null,Boolean(dispatch)),
   mission:c.isSim?state(feeds.missions!==null,Boolean(mission)):'not_applicable',
   evidence:c.isSim?state(feeds.links!==null,Boolean(link)):'not_applicable',
   charterStatus:safeLabel((feeds.charters||[]).find(x=>x.request_id===c.id)?.request_status),
   planningStatus:safeLabel(dispatch?.planning_status),
   registration:safeLabel(dispatch?.registration),
   missionPhase:safeLabel(mission?.phase),
   missionLifecycle:safeLabel(mission?.lifecycle),
   linkStatus:safeLabel(link?.status)
  };
 }).sort((a,b)=>{
  const weight=(v:LifecycleFlight)=>v.missionLifecycle==='running'?0:
   v.missionLifecycle==='paused'?1:v.planning==='present'?2:3;
  const rank=weight(a)-weight(b);if(rank!==0)return rank;
  const x=a.departure?Date.parse(a.departure):NaN;
  const y=b.departure?Date.parse(b.departure):NaN;
  if(Number.isFinite(x)&&Number.isFinite(y)&&x!==y)return x-y;
  if(Number.isFinite(x))return -1;if(Number.isFinite(y))return 1;
  return a.code.localeCompare(b.code,'de');
 });
}
