export type CabinPhase='parked'|'taxi'|'takeoff'|'climb'|'cruise'|'descent'|'approach'|'landing';
export type ServiceKind='cold_drink'|'coffee'|'meal'|'snack'|'wc';
export type CabinGuest={id:string;label:string;thirst:number;hunger:number;wc:number;comfort:number;temperaturePreference:number;lastServedAt:number;wcVisitEnd:number|null;wcCount:number;drinks:number;meals:number};
export type CabinRequest={id:string;guestId:string;type:ServiceKind;createdAt:number;status:'open'|'done';completedAt:number|null};
export type CabinEvent={minute:number;label:string;kind:'service'|'safety'|'passenger'};
export type CabinState={minute:number;guests:CabinGuest[];requests:CabinRequest[];events:CabinEvent[];temperature:number;turbulence:'calm'|'light'|'moderate'|'severe'};
export const SERVICE_NAMES:Record<ServiceKind,string>={cold_drink:'Kaltgetränk',coffee:'Kaffee / Heißgetränk',meal:'Speisenservice',snack:'Snack',wc:'WC-Besuch'};
export function canMoveInCabin(phase:CabinPhase,turbulence:CabinState['turbulence']){
 return ['climb','cruise','descent'].includes(phase)&&turbulence!=='severe'&&turbulence!=='moderate';
}
export function canProvideHotFood(phase:CabinPhase,turbulence:CabinState['turbulence']){
 return phase==='cruise'&&turbulence==='calm';
}
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
function requestId(g:CabinGuest,kind:ServiceKind){return g.id+':'+kind;}
function needsRequest(g:CabinGuest,kind:ServiceKind){
 switch(kind){
 case 'cold_drink':return g.thirst>=57;
 case 'coffee':return g.thirst>=44&&g.temperaturePreference>21;
 case 'meal':return g.hunger>=64;
 case 'snack':return g.hunger>=48&&g.hunger<64;
 case 'wc':return g.wc>=70;
 }
}
function addRequests(state:CabinState):CabinState{
 const requests=state.requests.slice();
 for(const guest of state.guests){
  for(const kind of ['wc','meal','cold_drink','coffee','snack'] as ServiceKind[]){
   if(!needsRequest(guest,kind))continue;
   if(requests.some(r=>r.guestId===guest.id&&r.type===kind&&r.status==='open'))continue;
   // Avoid competing drink/food requests for one passenger.
   if((kind==='coffee'||kind==='cold_drink')&&requests.some(r=>r.guestId===guest.id&&['coffee','cold_drink'].includes(r.type)&&r.status==='open'))continue;
   if((kind==='meal'||kind==='snack')&&requests.some(r=>r.guestId===guest.id&&['meal','snack'].includes(r.type)&&r.status==='open'))continue;
   requests.push({id:requestId(guest,kind)+':'+state.minute,guestId:guest.id,type:kind,createdAt:state.minute,status:'open',completedAt:null});
  }
 }
 return {...state,requests:requests.slice(-100)};
}
export function initialCabin(count=5):CabinState{
 const n=Math.max(1,Math.min(8,Math.floor(count)));
 return {minute:0,temperature:22,turbulence:'calm',guests:Array.from({length:n},(_,i)=>({
  id:'P'+String(i+1).padStart(2,'0'),label:'Gast '+String(i+1).padStart(2,'0'),
  thirst:20+i*4,hunger:22+(i*13)%20,wc:8+(i*17)%29,comfort:86-(i*3)%12,
  temperaturePreference:20+(i%4)*1.4,lastServedAt:0,wcVisitEnd:null,wcCount:0,drinks:0,meals:0
 })),requests:[],events:[{minute:0,label:n+' simulierte Gäste an Bord · Kabine vorbereitet',kind:'passenger'}]};
}
export function guestSatisfaction(g:CabinGuest,temperature:number,turbulence:CabinState['turbulence']){
 const tempPenalty=Math.abs(temperature-g.temperaturePreference)*2.4;
 const turbulencePenalty=turbulence==='severe'?14:turbulence==='moderate'?7:turbulence==='light'?2:0;
 return Math.round(clamp(g.comfort-0.19*g.thirst-0.18*g.hunger-0.22*g.wc-tempPenalty-turbulencePenalty));
}
export function averageSatisfaction(s:CabinState){
 return Math.round(s.guests.reduce((sum,g)=>sum+guestSatisfaction(g,s.temperature,s.turbulence),0)/Math.max(s.guests.length,1));
}
export function cabinSummary(s:CabinState){
 const open=s.requests.filter(r=>r.status==='open');
 return {satisfaction:averageSatisfaction(s),openRequests:open.length,wcVisits:s.guests.reduce((sum,g)=>sum+g.wcCount,0),
  drinks:s.guests.reduce((sum,g)=>sum+g.drinks,0),meals:s.guests.reduce((sum,g)=>sum+g.meals,0)};
}
function tick(state:CabinState,phase:CabinPhase):CabinState{
 const minute=state.minute+1;
 const canMove=canMoveInCabin(phase,state.turbulence);
 const guests=state.guests.map(g=>{
  const inWc=g.wcVisitEnd!==null&&g.wcVisitEnd>minute;
  const doneWc=g.wcVisitEnd!==null&&g.wcVisitEnd<=minute;
  const heatPenalty=Math.max(0,Math.abs(state.temperature-g.temperaturePreference)-2)*0.065;
  return {...g,thirst:clamp(g.thirst+0.34+heatPenalty),
   hunger:clamp(g.hunger+0.17),wc:clamp(g.wc+(inWc?0:0.19)),
   comfort:clamp(g.comfort-(state.turbulence==='severe'?0.3:state.turbulence==='moderate'?0.15:0.025)),
   wcVisitEnd:doneWc?null:g.wcVisitEnd};
 });
 let events=state.events;
 if(canMove&&guests.every(g=>g.wcVisitEnd===null)){
  const next=guests.find(g=>g.wc>=83);
  if(next){
   const index=guests.findIndex(g=>g.id===next.id);
   guests[index]={...next,wc:5,wcCount:next.wcCount+1,wcVisitEnd:minute+4,comfort:clamp(next.comfort+4)};
   events=[{minute,label:next.label+' nutzt die Bordtoilette (4 Min.)',kind:'passenger' as const},...events];
  }
 }
 const requests=state.requests.map(r=>r.type==='wc'&&r.status==='open'&&guests.some(g=>g.id===r.guestId&&g.wcVisitEnd!==null&&g.wcVisitEnd>minute)?{...r,status:'done' as const,completedAt:minute}:r);
 const nextState={...state,minute,guests,requests,events:events.slice(0,35)};
 return addRequests(nextState);
}
export function advanceCabin(s:CabinState,targetMinute:number,phase:CabinPhase){
 const target=Math.min(1440,Math.max(0,Math.floor(targetMinute)));
 if(target<s.minute)return s; // The demo does not rewind passenger services.
 let state=s;
 for(let i=0;i<Math.min(target-state.minute,360);i++)state=tick(state,phase);
 return state;
}
export function adjustCabin(s:CabinState,temperature:number,turbulence:CabinState['turbulence']){
 const nextTemperature=Math.max(18,Math.min(27,temperature));
 const changed=s.turbulence!==turbulence;
 return {...s,temperature:nextTemperature,turbulence,
  events:changed?[{minute:s.minute,label:'Turbulenz: '+turbulence+' · Servicebeschränkung angepasst',kind:'safety' as const},...s.events].slice(0,35):s.events};
}
export function performCabinService(s:CabinState,kind:ServiceKind,phase:CabinPhase):{state:CabinState;error?:string}{
 if(!canMoveInCabin(phase,s.turbulence))return {state:s,error:'Service gesperrt: Anschnallzeichen / kritische Flugphase oder Turbulenz.'};
 if(['coffee','meal'].includes(kind)&&!canProvideHotFood(phase,s.turbulence))return {state:s,error:'Heißgetränke und Speisen erst im stabilen Reiseflug.'};
 const candidate=s.requests.find(r=>r.status==='open'&&r.type===kind);
 const guest= candidate?s.guests.find(g=>g.id===candidate.guestId):
  s.guests.filter(g=>g.wcVisitEnd===null).sort((a,b)=>
   kind==='wc'?b.wc-a.wc:kind==='meal'||kind==='snack'?b.hunger-a.hunger:b.thirst-a.thirst)[0];
 if(!guest)return {state:s,error:'Kein geeigneter Passagier für diesen Service.'};
 if(kind==='wc'){
  if(s.guests.some(g=>g.wcVisitEnd!==null&&g.wcVisitEnd>s.minute))return {state:s,error:'Bord-WC ist gerade belegt.'};
  if(guest.wc<15)return {state:s,error:'Aktuell besteht kein WC-Bedarf.'};
 }
 const guests=s.guests.map(g=>{
  if(g.id!==guest.id)return g;
  return {...g,thirst:kind==='cold_drink'?clamp(g.thirst-58):kind==='coffee'?clamp(g.thirst-42):g.thirst,
   hunger:kind==='meal'?clamp(g.hunger-76):kind==='snack'?clamp(g.hunger-36):g.hunger,
   wc:kind==='wc'?4:g.wc,wcVisitEnd:kind==='wc'?s.minute+4:g.wcVisitEnd,
   wcCount:g.wcCount+(kind==='wc'?1:0),
   drinks:g.drinks+(['coffee','cold_drink'].includes(kind)?1:0),
   meals:g.meals+(['meal','snack'].includes(kind)?1:0),
   lastServedAt:s.minute,comfort:clamp(g.comfort+(kind==='wc'?5:kind==='meal'?7:4))};
 });
 const requests=s.requests.map(r=>r.guestId===guest.id&&r.status==='open'&&
  (r.type===kind||(['coffee','cold_drink'].includes(kind)&&['coffee','cold_drink'].includes(r.type))||
   (['meal','snack'].includes(kind)&&['meal','snack'].includes(r.type)))?
  {...r,status:'done' as const,completedAt:s.minute}:r);
 return {state:{...s,guests,requests,
   events:[{minute:s.minute,label:guest.label+' · '+SERVICE_NAMES[kind]+' durchgeführt',kind:'service' as const},...s.events].slice(0,35)}};
}
