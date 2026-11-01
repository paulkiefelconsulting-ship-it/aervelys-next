/**
 * AERVELYS NEXT / Cabin Experience Director
 * Deterministic suggestions from existing virtual passenger state only.
 * NEVER generates fictional passengers, sends services, or changes flight phases.
 */
export type CabinService='water'|'coffee'|'meal'|'snack'|'restroom'|'blanket'|'conversation';
export type CabinPassengerState={
 id:string;request_id:string;seat_index:number;satisfaction:number;
 hunger:number;thirst:number;restroom_need:number;comfort:number;fatigue:number;
};
export type CabinEventState={
 id:number;request_id:string;event_kind:string;created_at:string;
 payload:Record<string,unknown>;
};
export type CabinRecommendation={
 seat_index:number;service:CabinService;reason:string;
 priority:'critical'|'attention'|'routine';score:number;
 metric:string;value:number;available:boolean;
};
export type CabinAssessment={
 total:number;averageSatisfaction:number|null;critical:number;attention:number;
 serviceAvailable:boolean;forecastMinutes:number;recommendations:CabinRecommendation[];
 forecast:{satisfaction:number|null;hunger:number|null;thirst:number|null;
  restroom_need:number|null;fatigue:number|null};
};
const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const isNeed=(value:number)=>Number.isFinite(value)&&value>=0&&value<=100;
const valid=(p:CabinPassengerState)=>
 Number.isInteger(p.seat_index)&&p.seat_index>=1&&p.seat_index<=30&&
 [p.satisfaction,p.hunger,p.thirst,p.restroom_need,p.comfort,p.fatigue].every(isNeed);
const eligible=(phase:string,lifecycle:string)=>lifecycle==='running'&&
 (phase==='boarding'||phase==='cruise');
const canService=(service:CabinService,phase:string,lifecycle:string)=>
 eligible(phase,lifecycle)&&!(phase!=='cruise'&&(service==='coffee'||service==='meal'));
const rules:(p:CabinPassengerState,phase:string)=>CabinRecommendation[] =
 (p,phase)=>{
 const suggestions:CabinRecommendation[]=[];
 const add=(service:CabinService,metric:string,value:number,threshold:number,
  reason:string,descending=false)=>{
  const excess=descending?threshold-value:value-threshold;
  if(excess<0)return;
  const score=clamp(50+excess*1.5+(descending?12:0));
  suggestions.push({
   seat_index:p.seat_index,service,reason,score,metric,value,
   priority:score>=84?'critical':score>=65?'attention':'routine',
   available:false
  });
 };
 add('restroom','WC',p.restroom_need,55,'WC-Bedürfnis steigt; Toilettengang anbieten');
 add('water','Durst',p.thirst,55,'Durst steigt; Wasser anbieten');
 add(phase==='cruise'?'meal':'snack','Hunger',p.hunger,55,
  phase==='cruise'?'Mahlzeit anbieten':'Snack vor dem Abflug anbieten');
 add('blanket','Komfort',p.comfort,48,'Komfort niedrig; Decke anbieten',true);
 add('conversation','Zufriedenheit',p.satisfaction,48,
  'Geringe Zufriedenheit; persönliche Betreuung anbieten',true);
 if(phase==='cruise'&&p.restroom_need<75)
  add('coffee','Müdigkeit',p.fatigue,70,'Hohe Müdigkeit; Kaffee optional anbieten');
 return suggestions;
};
function recentSameService(p:CabinPassengerState,service:CabinService,events:CabinEventState[],now:number){
 return events.some(e=>e.event_kind==='service'&&
  e.request_id===p.request_id&&Number(e.payload.seat)===p.seat_index&&
  e.payload.service===service&&
  Number.isFinite(Date.parse(e.created_at))&&
  now-Date.parse(e.created_at)>=0&&now-Date.parse(e.created_at)<2*60*1000);
}
const roundedAverage=(items:number[]):number|null=>
 items.length?Math.round(items.reduce((s,n)=>s+n,0)/items.length*10)/10:null;
/** Only a projection of the existing SIM needs model; no write, no actual prediction. */
export function projectCabinNeeds(p:CabinPassengerState,minutes:number):CabinPassengerState{
 const t=Number.isFinite(minutes)?Math.round(clamp(minutes)):0;
 const deltaH=Math.ceil(t*0.23),deltaT=Math.ceil(t*0.32);
 const deltaW=Math.ceil(t*0.24),deltaF=Math.ceil(t*0.16);
 const penalty=(p.hunger>=60?Math.ceil(t*0.12):0)+
  (p.thirst>=60?Math.ceil(t*0.17):0)+
  (p.restroom_need>=65?Math.ceil(t*0.16):0)+
  (p.comfort<40?Math.ceil(t*0.10):0);
 return {...p,hunger:clamp(p.hunger+deltaH),thirst:clamp(p.thirst+deltaT),
  restroom_need:clamp(p.restroom_need+deltaW),fatigue:clamp(p.fatigue+deltaF),
  satisfaction:clamp(p.satisfaction-penalty)};
}
/** Needs are actual saved SIM state; "forecast" is conditional on zero service and passage of SIM time. */
export function assessCabin(passengers:CabinPassengerState[],events:CabinEventState[],
 phase:string,lifecycle:string,minutes=20,now=Date.now()):CabinAssessment{
 const members=passengers.filter(valid);
 const t=Number.isFinite(minutes)?Math.max(0,Math.min(60,Math.round(minutes))):20;
 const forecast=members.map(p=>projectCabinNeeds(p,t));
 const serviceAvailable=eligible(phase,lifecycle);
 const opportunities=members.flatMap(p=>rules(p,phase).map(r=>({
  ...r,available:canService(r.service,phase,lifecycle)
 })));
 const candidates=opportunities.filter(r=>{
  const p=members.find(x=>x.seat_index===r.seat_index);
  return p&&!recentSameService(p,r.service,events,now);
 });
 // Return one highest-priority recommendation per passenger to avoid contradictory duplicate tasks.
 const seen=new Set<number>();
 const recommendations=candidates.sort((a,b)=>b.score-a.score||
  a.seat_index-b.seat_index).filter(r=>{
  if(seen.has(r.seat_index))return false;
  seen.add(r.seat_index);return true;
 });
 return {
  total:members.length,
  averageSatisfaction:roundedAverage(members.map(p=>p.satisfaction)),
  critical:recommendations.filter(r=>r.priority==='critical').length,
  attention:recommendations.filter(r=>r.priority==='attention').length,
  serviceAvailable,forecastMinutes:t,recommendations,
  forecast:{
   satisfaction:roundedAverage(forecast.map(p=>p.satisfaction)),
   hunger:roundedAverage(forecast.map(p=>p.hunger)),
   thirst:roundedAverage(forecast.map(p=>p.thirst)),
   restroom_need:roundedAverage(forecast.map(p=>p.restroom_need)),
   fatigue:roundedAverage(forecast.map(p=>p.fatigue))
  }
 };
}
