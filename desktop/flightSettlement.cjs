'use strict';
/**
 * AERVELYS SIM economy and local flight-evidence gate.
 * SIMULATED costs, NOT real aviation costs or an airworthiness certificate.
 * Only an armed, same-session SimConnect trace can settle a local contract.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const storage=require('./localStore.cjs');
const pilots=require('./pilotProfiles.cjs');
const {AIRPORTS,distanceFrom,nmBetween}=require('./airports.cjs');

const ENGINE=Object.freeze({
 'Cessna 172 G1000':{litres:34,speed:112,price:2.65,identity:/\b(C172(?:SP|S|G1000)?|172(?:SP|S)?|SKYHAWK)\b/i},
 'Diamond DA40 NG':{litres:25,speed:125,price:2.65,identity:/\bDA[\s-]?40\b/i},
 'Piper PA-28':{litres:40,speed:115,price:2.65,identity:/\b(PA[\s-]?28|CHEROKEE|ARCHER)\b/i},
 'Cessna Citation CJ4':{litres:710,speed:405,price:2.25,identity:/\b(CJ[\s-]?4|C525C|CITATION CJ4)\b/i},
 'Embraer Phenom 300':{litres:640,speed:430,price:2.25,identity:/\b(PHENOM[\s-]?300|E55P|EMB[\s-]?505)\b/i},
 'Pilatus PC-24':{litres:650,speed:405,price:2.25,identity:/\b(PC[\s-]?24)\b/i},
 'Cirrus Vision Jet SF50':{litres:290,speed:290,price:2.25,identity:/\b(SF[\s-]?50|VISION JET)\b/i}
});
const LARGE=new Set(['EDDB','EDDH','EDDM','EDDK','LOWW','LSZH','LFPB']);
const MID=new Set(['EDDC','EDDP','EDDV','EDDN','EDDW','EDDS','LKPR','EDDG','EDDE']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const euros=n=>Math.round(n*100)/100;
function quote(contract,blockHours){
 const spec=ENGINE[contract?.aircraft];
 if(!spec)throw Error('Für dieses Muster ist noch keine SIM-Kostenberechnung verfügbar.');
 const distance=Number.isFinite(contract?.nm)?contract.nm:
  nmBetween(AIRPORTS[contract.departure],AIRPORTS[contract.destination]);
 if(!Number.isFinite(distance))throw Error('Keine Daten für diese Route.');
 const hours=blockHours===undefined?
  clamp(distance*1.16/spec.speed+0.23,0.32,14):
  Number(blockHours);
 if(!Number.isFinite(hours)||hours<0.1||hours>24)throw Error('Ungültige SIM-Blockzeit.');
 const fuelLitres=Math.round(hours*spec.litres);
 const fuel=euros(fuelLitres*spec.price);
 const landing=LARGE.has(contract.destination)?155:
  MID.has(contract.destination)?70:35;
 const handling=contract.category==='VIP'||contract.category==='MEDEVAC'||
  contract.sector==='VIP'||contract.sector==='MEDEVAC'?180:
  LARGE.has(contract.destination)?85:35;
 const gross=contract.gameReward??contract.payment;
 if(!Number.isSafeInteger(gross)||gross<0)throw Error('Unbekannte Vertragsvergütung.');
 return {basis:'simulated_tariff_v1',currency:contract.gameCurrency||contract.currency||'EUR',
  estimated:blockHours===undefined,blockHours:Math.round(hours*100)/100,
  fuelLitres,fuel,landing,handling,gross,net:euros(gross-fuel-landing-handling)};
}
function validateRecord(sample){
 const d=sample;
 return d&&typeof d==='object'&&
  typeof d.observed_at==='string'&&Number.isFinite(Date.parse(d.observed_at))&&
  typeof d.session_id==='string'&&/^[a-f0-9-]{36}$/i.test(d.session_id)&&
  typeof d.aircraft_title==='string'&&
  Number.isFinite(d.latitude)&&Math.abs(d.latitude)<=90&&
  Number.isFinite(d.longitude)&&Math.abs(d.longitude)<=180&&
  Number.isFinite(d.groundspeed_kt)&&d.groundspeed_kt>=0&&d.groundspeed_kt<800&&
  typeof d.on_ground==='boolean'&&
  (d.engine_running===null||typeof d.engine_running==='boolean')&&
  typeof d.phase==='string';
}
function matchesAircraft(mission,title){
 const spec=ENGINE[mission?.aircraft];
 return !!spec&&typeof title==='string'&&spec.identity.test(title.slice(0,140));
}
function activeState(root,missionId){
 const active=pilots.selected(root);
 if(!active)throw Error('Bitte zuerst das Pilotenprofil auswählen.');
 const mission=active.state.missions.find(m=>m.id===missionId);
 if(!mission)throw Error('Mission gehört nicht zum ausgewählten Piloten.');
 return {state:active.state,meta:active.meta,
  dir:pilots.profileDir(root,active.meta.id),mission};
}
function currentSample(appData){
 const info=storage.lastTelemetry(appData);
 const s=info?.latest;
 if(!info.connected||!validateRecord(s)||
   Date.now()-Date.parse(s.observed_at)>20000||
   Date.parse(s.observed_at)>Date.now()+5000)
  throw Error('Keine aktuelle, vollständige lokale SimConnect-Telemetrie.');
 return s;
}
function arm(root,appData,missionId){
 const {state,dir,mission}=activeState(root,missionId);
 if(mission.source!=='local_market'||mission.status!=='accepted'||
   mission.settled||mission.verified)
  throw Error('Nur ein angenommener, ungeflogener Marktauftrag kann gestartet werden.');
 if(mission.tracking)throw Error('Diese Mission wurde bereits für einen SIM-Flug aktiviert.');
 const sample=currentSample(appData);
 if(!AIRPORTS[mission.departure]||!AIRPORTS[mission.destination])
  throw Error('Für diese Flughäfen fehlen lokale Referenzkoordinaten.');
 if(!matchesAircraft(mission,sample.aircraft_title))
  throw Error('Das geladene Simulatorflugzeug entspricht nicht dem Vertrag.');
 if(distanceFrom(mission.departure,sample.latitude,sample.longitude)>3)
  throw Error('Der Simulator befindet sich nicht am vereinbarten Startflugplatz.');
 if(!sample.on_ground||sample.engine_running!==false||sample.groundspeed_kt>3||
   sample.phase!=='PARKED')
  throw Error('Vor Flugstart muss das Flugzeug am Boden stehen, Motor aus und Parkposition erreicht sein.');
 mission.tracking={sessionId:sample.session_id,armedAt:new Date().toISOString(),
  firstSampleAt:sample.observed_at,source:'local_simconnect',review:'pending'};
 storage.writeState(dir,state);
 return {missionId:mission.id,tracking:mission.tracking};
}
function utcFiles(fromMs,toMs){
 if(toMs-fromMs>36*3600*1000||toMs<fromMs)
  throw Error('Flugprüfung nur innerhalb von 36 Stunden nach dem Aktivieren.');
 const days=new Set();
 for(let t=fromMs;t<=toMs;t+=86400000)days.add(new Date(t).toISOString().slice(0,10));
 days.add(new Date(toMs).toISOString().slice(0,10));
 if(days.size>3)throw Error('Zu großer Telemetriezeitraum.');
 return [...days];
}
function readTelemetry(appData,session,fromMs,toMs){
 const dir=storage.telemetryDir(appData);
 const samples=[];
 let totalBytes=0;
 for(const date of utcFiles(fromMs,toMs)){
  const file=path.join(dir,date+'.jsonl');
  if(!fs.existsSync(file))continue;
  const stat=fs.statSync(file);
  totalBytes+=stat.size;
  if(totalBytes>32*1024*1024)throw Error('Lokale Telemetrie-Dateien überschreiten 32 MB.');
  const raw=fs.readFileSync(file,'utf8');
  for(const line of raw.split(/\r?\n/)){
   if(!line.trim())continue;
   let sample;try{sample=JSON.parse(line);}catch{continue;}
   if(sample?.session_id!==session)continue;
   if(!validateRecord(sample))continue;
   const ms=Date.parse(sample.observed_at);
   if(ms>=fromMs-15000&&ms<=toMs+5000)samples.push(sample);
   if(samples.length>22000)throw Error('Zu viele lokale Telemetrie-Samples.');
  }
 }
 return samples;
}
function evaluate(mission,samples){
 const reasons=[];
 if(!mission?.tracking?.sessionId)reasons.push('Auftrag wurde nicht vor dem Abflug aktiviert.');
 if(!AIRPORTS[mission?.departure]||!AIRPORTS[mission?.destination])
  reasons.push('Flughafenkoordinaten fehlen.');
 if(!Array.isArray(samples)||samples.length<15)
  reasons.push('Zu wenige SimConnect-Messwerte für eine Flugprüfung.');
 if(reasons.length)return {passed:false,reasons,sampleCount:samples?.length||0};
 const armed=Date.parse(mission.tracking.armedAt);
 const first=Date.parse(mission.tracking.firstSampleAt);
 if(!Number.isFinite(armed)||!Number.isFinite(first))reasons.push('Ungültige Aktivierungszeit.');
 const expectedSession=mission.tracking.sessionId;
 const initial=samples[0],last=samples.at(-1);
 if(samples.some(s=>!validateRecord(s)||s.session_id!==expectedSession))
  reasons.push('Ungültige Messwerte oder Wechsel der SimConnect-Sitzung.');
 if(!matchesAircraft(mission,initial.aircraft_title)||!matchesAircraft(mission,last.aircraft_title)||
    samples.some(s=>!matchesAircraft(mission,s.aircraft_title)))
  reasons.push('Flugzeugtyp hat sich geändert oder stimmt nicht mit dem Auftrag überein.');
 if(Math.abs(Date.parse(initial.observed_at)-first)>15000)
  reasons.push('Der Startdatensatz stammt nicht vom aktivierten Flug.');
 if(distanceFrom(mission.departure,initial.latitude,initial.longitude)>3 ||
    distanceFrom(mission.destination,last.latitude,last.longitude)>3)
  reasons.push('Start oder Landung liegen außerhalb der vereinbarten Flughäfen (3 NM).');
 if(!initial.on_ground||initial.engine_running!==false||initial.groundspeed_kt>3)
  reasons.push('Kein dokumentierter Cold-and-Dark-Start.');
 if(!last.on_ground||last.engine_running!==false||last.groundspeed_kt>5)
  reasons.push('Kein vollständiger Shutdown am Zielflugplatz.');
 const durationMs=Date.parse(last.observed_at)-Date.parse(initial.observed_at);
 if(durationMs<180000||durationMs>36*3600000)
  reasons.push('Flugdauer liegt außerhalb der gültigen Grenzen.');
 let lastMs=Date.parse(initial.observed_at),airborne=0,airborneStarted=null;
 let airborneSeconds=0,landed=false,trackNm=0;
 for(let i=1;i<samples.length;i++){
  const s=samples[i],ms=Date.parse(s.observed_at),prev=samples[i-1];
  const seconds=(ms-lastMs)/1000;
  if(seconds<=0||seconds>90){reasons.push('Telemetrie-Lücke, Zeitrücksprung oder Simulatorpause erkannt.');break;}
  const distance=nmBetween([prev.latitude,prev.longitude],[s.latitude,s.longitude]);
  const derivedKnots=distance/(seconds/3600);
  const maxTrackSpeed=mission.requiredRating==='SEP'?260:780;
  if(derivedKnots>maxTrackSpeed||distance>10){
   reasons.push('Unplausibler Positionssprung erkannt.');break;
  }
  trackNm+=distance;
  if(!s.on_ground){
   airborne++;
   airborneSeconds+=seconds;
   airborneStarted=airborneStarted??ms;
  }else if(airborne>=3&&distanceFrom(mission.destination,s.latitude,s.longitude)<=3){
   landed=true;
  }
  lastMs=ms;
 }
 if(airborne<6||airborneSeconds<45)reasons.push('Kein ausreichender tatsächlicher Flugabschnitt.');
 if(!landed)reasons.push('Keine nachvollziehbare Landung am Ziel.');
 const straight=nmBetween(AIRPORTS[mission.departure],AIRPORTS[mission.destination]);
 if(trackNm<Math.max(4,straight*0.6))
  reasons.push('Zurückgelegte Strecke passt nicht zur Route.');
 const unique=[...new Set(reasons)];
 return {passed:unique.length===0,reasons:unique,
  sampleCount:samples.length,
  durationHours:Math.round(durationMs/36000)/100,
  airborneSeconds:Math.round(airborneSeconds),
  routeDistanceNm:Math.round(trackNm),
  firstAt:initial.observed_at,lastAt:last.observed_at,
  source:'simconnect_local',sessionId:expectedSession};
}
function inspect(root,appData,missionId){
 const {mission}=activeState(root,missionId);
 if(!mission.tracking)
  return {passed:false,reasons:['Auftrag muss vor dem Flug am Startplatz aktiviert werden.']};
 const from=Date.parse(mission.tracking.firstSampleAt);
 const samples=readTelemetry(appData,mission.tracking.sessionId,from,Date.now());
 return evaluate(mission,samples);
}
function finalize(root,appData,missionId){
 const {state,dir,mission}=activeState(root,missionId);
 if(mission.source!=='local_market'||mission.status!=='accepted'||
   mission.settled||mission.verified)
  throw Error('Auftrag ist bereits abgerechnet oder nicht mehr aktiv.');
 const evidence=inspect(root,appData,missionId);
 if(!evidence.passed) return {settled:false,review:evidence};
 if(!state.finances||!Number.isFinite(state.finances.balance)||
  !Array.isArray(state.finances.transactions))
  throw Error('Keine gültige lokale SIM-Buchhaltung für dieses Profil.');
 if(state.finances.transactions.some(t=>t.missionId===missionId))
  throw Error('Dieser Auftrag besitzt bereits einen Buchungseintrag.');
 const receipt=quote(mission,evidence.durationHours);
 const net=receipt.net;
 const endBalance=euros(state.finances.balance+net);
 if(!Number.isSafeInteger(Math.round(endBalance*100)))
  throw Error('SIM-Kontostand zu groß.');
 const tx={id:crypto.randomUUID(),missionId,kind:'verified_sim_flight',
  createdAt:new Date().toISOString(),currency:receipt.currency,
  gross:receipt.gross,fuel:receipt.fuel,landing:receipt.landing,
  handling:receipt.handling,net,balanceAfter:endBalance,
  accountingBasis:receipt.basis,source:'simconnect_local_review'};
 state.finances.balance=endBalance;
 state.finances.transactions.push(tx);
 mission.status='completed';mission.verified=true;mission.settled=true;
 mission.completedAt=tx.createdAt;
 mission.settlement={...receipt,transactionId:tx.id,review:evidence};
 state.profile.verifiedFlightHours=euros((state.profile.verifiedFlightHours||0)+evidence.durationHours);
 storage.writeState(dir,state); // single atomic career-state replacement; no double payment.
 return {settled:true,receipt:mission.settlement,balance:endBalance};
}
module.exports={ENGINE,quote,validateRecord,matchesAircraft,currentSample,arm,
 readTelemetry,evaluate,inspect,finalize};
