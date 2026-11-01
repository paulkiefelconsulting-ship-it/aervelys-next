/**
 * MSFS simulator evidence reconstruction from server-stored samples.
 * Pure/read-only; never changes a qualification, license, mission or ledger.
 * Transitions are indicative, not tamper-proof: a device token can be replayed
 * by its holder, and the simulator can be paused, slewed or accelerated.
 */
export type AcarsRawSample={
 id:number;observed_at:string;received_at:string;phase:string;
 sample:Record<string,unknown>;
};
export type EvidenceEvent={
 kind:'start'|'takeoff'|'landing'|'shutdown'|'interruption'|'aircraft_change';
 at:string;detail:string;vertical_speed_fpm:number|null;
};
export type FlightEvidence={
 total_samples:number;rejected_samples:number;takeoffs:number;landings:number;
 cold_start_confirmed:boolean;shutdown_confirmed:boolean;
 interruptions:number;aircraft_changes:number;aircraft_title:string|null;
 engine_information_available:boolean;events:EvidenceEvent[];
 checkride:'waiting'|'in_progress'|'needs_review';
 warnings:string[];
};
const num=(v:unknown,min:number,max:number):number|null=>
 typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const truth=(v:unknown):boolean|null=>typeof v==='boolean'?v:null;
const date=(v:string)=>{const n=Date.parse(v);return Number.isFinite(n)?n:null;};
function distanceKm(a:{lat:number;lon:number},b:{lat:number;lon:number}):number{
 const rad=Math.PI/180;
 const dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
 const v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(Math.max(0,v))));
}
export function analyseMsfsEvidence(raw:AcarsRawSample[],truncated=false):FlightEvidence{
 const ordered=raw.slice().sort((a,b)=>
  (date(a.observed_at)??0)-(date(b.observed_at)??0)||a.id-b.id);
 const events:EvidenceEvent[]=[];
 let rejected=0,interruptions=0,aircraftChanges=0,takeoffs=0,landings=0;
 let stable:boolean|null=null,candidate:boolean|null=null,consecutive=0;
 let prior:{time:number;lat:number;lon:number}|null=null;
 let aircraft:string|null=null,lastObserved=-Infinity;
 let cleanParked=0,shutdown=0,coldStart=false,shutdownConfirmed=false;
 let engineAvailable=false;
 let everAirborne=false;
 for(const entry of ordered){
  const s=entry.sample;
  const at=date(entry.observed_at);
  const latitude=num(s.latitude,-90,90),longitude=num(s.longitude,-180,180);
  const ground=truth(s.on_ground),gs=num(s.groundspeed_kt,0,1500);
  const agl=num(s.altitude_agl_ft,-500,100000);
  const vs=num(s.vertical_speed_fpm,-20000,20000);
  const parking=truth(s.parking_brake),engine=truth(s.engine_running);
  if(engine!==null)engineAvailable=true;
  if(at===null||at<=lastObserved||latitude===null||longitude===null||
    ground===null||gs===null){rejected++;continue;}
  lastObserved=at;
  const title=typeof s.aircraft_title==='string'?s.aircraft_title.trim().slice(0,120):'';
  if(title){
   if(aircraft===null)aircraft=title;
   else if(title.toLowerCase()!==aircraft.toLowerCase()){
    aircraftChanges++;
    events.push({kind:'aircraft_change',at:entry.observed_at,
      detail:'Anderes Flugzeugmodell erkannt – Sitzung nicht als Checkride freigegeben',
      vertical_speed_fpm:null});
    aircraft=title;
    stable=null;candidate=null;consecutive=0;cleanParked=0;
   }
  }
  if(prior!==null){
   const seconds=(at-prior.time)/1000;
   const movement=distanceKm({lat:prior.lat,lon:prior.lon},{lat:latitude,lon:longitude});
   // Allow up to 800 kt plus 3 km GPS tolerance. Not a perfect anti-cheat mechanism.
   const impossible=movement>3+seconds*0.41156;
   if(seconds>25||impossible){
    interruptions++;
    events.push({kind:'interruption',at:entry.observed_at,
      detail:impossible?'Unplausibler Positionssprung':'Telemetrieunterbrechung > 25 s',
      vertical_speed_fpm:null});
    stable=null;candidate=null;consecutive=0;cleanParked=0;shutdown=0;
   }
  }
  prior={time:at,lat:latitude,lon:longitude};
  if(!coldStart && !everAirborne){
   if(ground && gs<=3 && parking===true && engine===false){
    cleanParked++;
    if(cleanParked>=3){
     coldStart=true;
     events.push({kind:'start',at:entry.observed_at,
       detail:'Drei aufeinanderfolgende Messwerte: am Boden, Bremse gesetzt, Motor aus',
       vertical_speed_fpm:null});
    }
   } else if(!ground)cleanParked=0;
  }
  if(everAirborne && ground && gs<2 && parking===true && engine===false){
   shutdown++;
   if(shutdown>=3&&!shutdownConfirmed){
    shutdownConfirmed=true;
    events.push({kind:'shutdown',at:entry.observed_at,
      detail:'Abstellzustand in drei Messwerten erkannt',
      vertical_speed_fpm:null});
   }
  }else shutdown=0;
  if(stable===null){
   if(candidate===ground)consecutive++;else{candidate=ground;consecutive=1;}
   if(consecutive>=2){stable=ground;candidate=null;consecutive=0;}
   continue;
  }
  if(stable===ground){candidate=null;consecutive=0;continue;}
  if(candidate===ground)consecutive++;else{candidate=ground;consecutive=1;}
  if(consecutive<2)continue;
  stable=ground;candidate=null;consecutive=0;
  if(!ground){
   if(gs>=40 || (agl!==null&&agl>=40)){
    takeoffs++;everAirborne=true;shutdownConfirmed=false;shutdown=0;
    events.push({kind:'takeoff',at:entry.observed_at,
      detail:'Boden → Luft, zwei stabile Flug-Messwerte',vertical_speed_fpm:null});
   }else rejected++;
  }else if(everAirborne){
   if(gs<=180){
    landings++;
    events.push({kind:'landing',at:entry.observed_at,
      detail:'Luft → Boden, zwei stabile Boden-Messwerte; keine präzise Touchdown-Rate',
      vertical_speed_fpm:vs});
   }else rejected++;
  }
 }
 const warnings:string[]=[];
 if(!ordered.length)warnings.push('Keine Simulator-Messwerte vorhanden.');
 if(!engineAvailable)warnings.push('Triebwerkszustand fehlt – Cold-and-Dark-Nachweis nicht möglich.');
 if(!coldStart)warnings.push('Kein bestätigter Start aus Parkposition mit abgeschalteten Triebwerken.');
 if(!shutdownConfirmed)warnings.push('Kein bestätigter Shutdown am Flugende.');
 if(interruptions)warnings.push(interruptions+' Telemetrie-Unterbrechung(en) oder Positionssprung/Sprünge.');
 if(aircraftChanges)warnings.push('Flugzeugwechsel während der Sitzung erkannt.');
 if(truncated)warnings.push('Messwerte begrenzt – möglicherweise unvollständige Flugaufzeichnung.');
 warnings.push('Flugplatz, Luftfahrzeug-Identität, Pausen/Slew und SIM-Integrität sind noch nicht abschließend verifiziert.');
 const checkride=takeoffs>=2&&landings>=2&&coldStart&&shutdownConfirmed
  &&!interruptions&&!aircraftChanges&&!truncated?'needs_review':
  (takeoffs||landings||everAirborne?'in_progress':'waiting');
 return {total_samples:raw.length,rejected_samples:rejected,takeoffs,landings,
  cold_start_confirmed:coldStart,shutdown_confirmed:shutdownConfirmed,
  interruptions,aircraft_changes:aircraftChanges,aircraft_title:aircraft,
  engine_information_available:engineAvailable,events,
  checkride,warnings};
}
