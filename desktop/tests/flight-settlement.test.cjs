'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const pilots=require('../pilotProfiles.cjs');
const market=require('../offlineMarket.cjs');
const store=require('../localStore.cjs');
const flights=require('../flightSettlement.cjs');
const {AIRPORTS}=require('../airports.cjs');
const SESSION='dce1691d-2f0a-401c-84be-3d6d60dbda64';
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-v06-home-'));
 const appData=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-v06-app-'));
 t.after(()=>{fs.rmSync(home,{recursive:true,force:true});fs.rmSync(appData,{recursive:true,force:true});});
 const pilot=pilots.create(home,{name:'Flight Tester',country:'DE',currency:'EUR',licence:'CPL',capital:90000});
 const offer=market.list(home).find(o=>o.dep==='EDAZ'&&o.arr==='EDDB'&&o.eligible);
 const mission=market.accept(home,offer.id);
 return {home,appData,pilot,mission,offer};
}
function samplesFor(mission,{wrongArrival=false,session=SESSION,short=false,wrongAircraft=false}={}){
 const start=AIRPORTS[mission.departure],end=AIRPORTS[mission.destination];
 const origin=Date.now()-(short?90000:12*60000);
 const duration=short?12:145;
 const output=[];
 for(let i=0;i<=duration;i++){
  const ratio=Math.max(0,Math.min(1,(i-3)/(duration-8)));
  let pos=[start[0]+(end[0]-start[0])*ratio,
           start[1]+(end[1]-start[1])*ratio];
  if(wrongArrival&&i>=duration-8)pos=[51.1,10.2];
  const parked=i<3||i>=duration-5;
  const last=i>=duration-2;
  output.push({
   observed_at:new Date(origin+i*5000).toISOString(),session_id:session,
   aircraft_title:wrongAircraft?'Boeing 787-10':'Cessna Skyhawk 172 G1000',
   latitude:pos[0],longitude:pos[1],
   altitude_ft:parked?160:2800,
   groundspeed_kt:parked?0:95,
   on_ground:parked,engine_running:!(i===0||last),
   phase:parked?'PARKED':'CRUISE'
  });
 }
 return output;
}
function saveSamples(appData,samples){
 const byDay=new Map();
 for(const s of samples){
  const day=s.observed_at.slice(0,10);
  if(!byDay.has(day))byDay.set(day,[]);
  byDay.get(day).push(JSON.stringify(s));
 }
 const dir=store.telemetryDir(appData);
 fs.mkdirSync(dir,{recursive:true});
 for(const [day,lines] of byDay){
  fs.writeFileSync(path.join(dir,day+'.jsonl'),lines.join('\n')+'\n','utf8');
 }
}
function makeArmed(home,pilot,mission,samples){
 const dir=pilots.profileDir(home,pilot.entry.id);
 const state=store.readState(dir);
 state.missions.find(m=>m.id===mission.id).tracking={
  source:'local_simconnect',sessionId:SESSION,
  firstSampleAt:samples[0].observed_at,
  armedAt:new Date(Date.parse(samples[0].observed_at)+1000).toISOString()
 };
 store.writeState(dir,state);
}
test('transparent quote reconciles gross, fuel, landing and handling',t=>{
 const f=fixture(t);
 const quoted=flights.quote(f.mission,0.9);
 assert.equal(quoted.gross,f.offer.payment);
 assert.equal(quoted.currency,'EUR');
 assert.equal(quoted.estimated,false);
 assert.ok(quoted.fuel>0&&quoted.fuelLitres>0);
 assert.ok(quoted.landing>0&&quoted.handling>0);
 assert.equal(quoted.net,Math.round((quoted.gross-quoted.fuel-quoted.landing-quoted.handling)*100)/100);
 assert.equal(flights.quote({...f.offer,departure:f.offer.dep,destination:f.offer.arr}).estimated,true);
 assert.throws(()=>flights.quote({...f.mission,gameReward:NaN}));
});
test('wrong aircraft, wrong destination, gaps and missing shutdown never pass',t=>{
 const {mission}=fixture(t);
 const make=samplesFor(mission);
 const tracking={sessionId:SESSION,firstSampleAt:make[0].observed_at,
  armedAt:new Date(Date.parse(make[0].observed_at)+1000).toISOString()};
 assert.equal(flights.evaluate({...mission,tracking},make).passed,true);
 assert.equal(flights.evaluate({...mission,tracking},samplesFor(mission,{wrongAircraft:true})).passed,false);
 assert.equal(flights.evaluate({...mission,tracking},samplesFor(mission,{wrongArrival:true})).passed,false);
 const noShutdown=make.map(x=>({...x}));
 noShutdown[noShutdown.length-1].engine_running=true;
 assert.equal(flights.evaluate({...mission,tracking},noShutdown).passed,false);
 const wrongSession=make.map(x=>({...x,session_id:'a0000000-0000-4000-8000-000000000000'}));
 assert.equal(flights.evaluate({...mission,tracking},wrongSession).passed,false);
 const withGap=make.filter((_,i)=>i<40||i>100);
 assert.equal(flights.evaluate({...mission,tracking},withGap).passed,false);
});
test('preflight activation requires actual live parked engine-off sample at departure',t=>{
 const f=fixture(t);
 assert.throws(()=>flights.arm(f.home,f.appData,f.mission.id),/Telemetrie/);
 const sample=samplesFor(f.mission)[0];
 sample.observed_at=new Date().toISOString();
 saveSamples(f.appData,[sample]);
 const armed=flights.arm(f.home,f.appData,f.mission.id);
 assert.equal(armed.tracking.sessionId,SESSION);
 assert.throws(()=>flights.arm(f.home,f.appData,f.mission.id),/bereits/);
 const before=pilots.selected(f.home).state;
 assert.equal(before.finances.balance,90000);
 assert.equal(before.missions[0].settled,false);
});
test('complete same-session route settles exactly once with atomic ledger entry',t=>{
 const f=fixture(t),samples=samplesFor(f.mission);
 makeArmed(f.home,f.pilot,f.mission,samples);
 saveSamples(f.appData,samples);
 const review=flights.inspect(f.home,f.appData,f.mission.id);
 assert.equal(review.passed,true,JSON.stringify(review.reasons));
 assert.ok(review.routeDistanceNm>4);
 const settled=flights.finalize(f.home,f.appData,f.mission.id);
 assert.equal(settled.settled,true);
 assert.equal(settled.receipt.gross,f.offer.payment);
 const state=pilots.selected(f.home).state;
 assert.equal(state.missions[0].status,'completed');
 assert.equal(state.missions[0].settled,true);
 assert.equal(state.missions[0].verified,true);
 assert.equal(state.missions[0].certificateIssued,false);
 assert.equal(state.finances.transactions.length,1);
 assert.equal(state.finances.balance,90000+settled.receipt.net);
 assert.ok(state.profile.verifiedFlightHours>0);
 assert.throws(()=>flights.finalize(f.home,f.appData,f.mission.id),/bereits abgerechnet/);
 assert.equal(pilots.selected(f.home).state.finances.transactions.length,1);
 assert.equal(pilots.selected(f.home).state.finances.balance,90000+settled.receipt.net);
});
test('failed evidence does not create any credit, flight hours or certificate',t=>{
 const f=fixture(t);
 const samples=samplesFor(f.mission,{wrongArrival:true});
 makeArmed(f.home,f.pilot,f.mission,samples);
 saveSamples(f.appData,samples);
 const result=flights.finalize(f.home,f.appData,f.mission.id);
 assert.equal(result.settled,false);
 assert.ok(result.review.reasons.length>0);
 const state=pilots.selected(f.home).state;
 assert.equal(state.finances.balance,90000);
 assert.equal(state.profile.verifiedFlightHours,0);
 assert.equal(state.finances.transactions.length,0);
 assert.equal(state.missions[0].verified,false);
});
test('cannot arm manually planned missions or settle with a different pilot',t=>{
 const f=fixture(t);
 pilots.addMission(f.home,{kind:'charter',departure:'EDAZ',destination:'EDDB',aircraft:'Cessna 172 G1000'});
 const custom=pilots.selected(f.home).state.missions[0];
 assert.throws(()=>flights.arm(f.home,f.appData,custom.id),/Marktauftrag/);
 pilots.create(f.home,{name:'Other',country:'DE',currency:'EUR',licence:'CPL',capital:1000});
 assert.throws(()=>flights.finalize(f.home,f.appData,f.mission.id),/gehört nicht/);
 assert.equal(pilots.selected(f.home).state.finances.balance,1000);
});
