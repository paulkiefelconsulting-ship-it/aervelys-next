'use strict';
/**
 * AERVELYS NEXT private OFFLINE simulation market.
 * All route/client names and payouts are local game content, not live offers.
 * This module does not call the network and cannot settle flights or issue ratings.
 */
const crypto=require('node:crypto');
const storage=require('./localStore.cjs');
const profiles=require('./pilotProfiles.cjs');

const CATALOG=[
 {dep:'EDAZ',arr:'EDDB',nm:24,aircraft:'Cessna 172 G1000',rating:'SEP',sector:'FERRY',client:'Brandenburg Flight School',title:'Aircraft relocation to BER'},
 {dep:'EDAZ',arr:'EDDC',nm:82,aircraft:'Diamond DA40 NG',rating:'SEP',sector:'FERRY',client:'Aero Service Lausitz',title:'Post-maintenance ferry'},
 {dep:'EDAZ',arr:'EDDP',nm:72,aircraft:'Piper PA-28',rating:'SEP',sector:'FERRY',client:'Aviation Partner Leipzig',title:'Training aircraft transfer'},
 {dep:'EDAZ',arr:'EDDE',nm:108,aircraft:'Cessna 172 G1000',rating:'SEP',sector:'FERRY',client:'Airfield Services Erfurt',title:'Regional fleet repositioning'},
 {dep:'EDAZ',arr:'EDDH',nm:152,aircraft:'Diamond DA40 NG',rating:'SEP',sector:'CHARTER',client:'Northland Aviation Services',title:'Regional priority delivery'},
 {dep:'EDAZ',arr:'EDDV',nm:128,aircraft:'Piper PA-28',rating:'SEP',sector:'CHARTER',client:'Northern Air Logistics',title:'Small-business transfer'},
 {dep:'EDAZ',arr:'EDDN',nm:182,aircraft:'Cessna Citation CJ4',rating:'CJ4',sector:'VIP',client:'Summit Advisory Aviation',title:'Executive board connection'},
 {dep:'EDAZ',arr:'EDDM',nm:243,aircraft:'Embraer Phenom 300',rating:'E55P',sector:'VIP',client:'Bavarian Business Travel',title:'Private investor delegation'},
 {dep:'EDAZ',arr:'EDDK',nm:241,aircraft:'Pilatus PC-24',rating:'PC24',sector:'VIP',client:'Rhineland Aviation Group',title:'Corporate transfer to Cologne'},
 {dep:'EDAZ',arr:'EDDW',nm:181,aircraft:'Cirrus Vision Jet SF50',rating:'SF50',sector:'CHARTER',client:'Weser Executive Travel',title:'Short-notice charter request'},
 {dep:'EDAZ',arr:'EDDS',nm:280,aircraft:'Embraer Phenom 300',rating:'E55P',sector:'CHARTER',client:'Neckar Business Aviation',title:'Consulting project transfer'},
 {dep:'EDAZ',arr:'LOWW',nm:303,aircraft:'Embraer Phenom 300',rating:'E55P',sector:'VIP',client:'Danube Executive Partners',title:'Business delegation to Vienna'},
 {dep:'EDAZ',arr:'LKPR',nm:148,aircraft:'Cessna Citation CJ4',rating:'CJ4',sector:'CHARTER',client:'Prague Flight Services',title:'Cross-border executive charter'},
 {dep:'EDAZ',arr:'LSZH',nm:401,aircraft:'Pilatus PC-24',rating:'PC24',sector:'MEDEVAC',client:'Alpine Medical Logistics',title:'Non-emergency patient transfer'},
 {dep:'EDAZ',arr:'LFPB',nm:464,aircraft:'Embraer Phenom 300',rating:'E55P',sector:'VIP',client:'European Film Logistics',title:'Production management charter'},
 {dep:'EDAZ',arr:'EDDG',nm:205,aircraft:'Cirrus Vision Jet SF50',rating:'SF50',sector:'FERRY',client:'Westfalen Aircraft Exchange',title:'Aircraft handover and ferry'}
];
const CATEGORIES=Object.freeze({FERRY:'Ferry',CHARTER:'Charter',VIP:'VIP',MEDEVAC:'Medevac'});
const RATINGS=Object.freeze({SEP:'Single-engine piston (simulated start privilege)',
 CJ4:'Citation CJ4 type rating',E55P:'Embraer Phenom 100/300 type rating',
 PC24:'Pilatus PC-24 type rating',SF50:'Cirrus Vision Jet SF50 type rating'});
function numberHash(value){
 return crypto.createHash('sha256').update(value).digest().readUInt32BE(0);
}
function board(meta,state){
 const round=Number.isSafeInteger(state.marketCycle)&&state.marketCycle>=0?state.marketCycle:0;
 const currency=meta.currency||'EUR';
 return CATALOG.map((item,i)=>{
  const val=numberHash(meta.id+'|'+round+'|'+i);
  const distance=item.nm;
  // Fictional game economy in native profile currency units, not an FX conversion.
  const factor=item.sector==='VIP'?23:item.sector==='MEDEVAC'?28:item.sector==='CHARTER'?15:9;
  const base=Math.round((distance*factor+350)*(0.87+(val%27)/100)/10)*10;
  // Ferry missions are paid aircraft-delivery contracts, not private repositioning.
  // A self-funded private ferry is a manual flight outside the charter board.
  const fee=base;
  return {...item,id:'SIM-'+round+'-'+i,category:CATEGORIES[item.sector],
   payment:fee,currency,round,isSimulation:true,kind:item.sector==='FERRY'?'ferry':'charter',
   customer:item.client,
   ratingName:RATINGS[item.rating]||item.rating};
 });
}
function profileRef(root){
 const sel=profiles.selected(root);
 if(!sel)throw Error('Bitte zunächst ein Pilotenprofil auswählen.');
 return {meta:sel.meta,state:sel.state,
  dir:profiles.profileDir(root,sel.meta.id)};
}
function eligibility(state,offer){
 const licence=state.profile?.simLicence||'LEGACY';
 const ratings=Array.isArray(state.profile?.ratings)?state.profile.ratings:[];
 const isCommercial=licence==='CPL'||licence==='FROZEN_ATPL';
 // All paid contracts (including ferry deliveries) require a commercial licence.
 if(offer.payment>0&&!isCommercial)return {
  eligible:false,reason:'Bezahlter SIM-Auftrag (auch Ferry) benötigt CPL oder Frozen ATPL.'};
 if(offer.rating!=='SEP'&&!ratings.includes(offer.rating))
  return {eligible:false,reason:'SIM-Type-Rating fehlt: '+offer.ratingName};
 if(offer.rating==='SEP'&&!['PPL','CPL','FROZEN_ATPL'].includes(licence) &&
    !ratings.includes('SEP'))
  return {eligible:false,reason:'SIM-Klassenberechtigung SEP nicht hinterlegt.'};
 return {eligible:true,reason:'SIM-Karrierevoraussetzungen erfüllt (keine echte Flugfreigabe).'};
}
function list(root){
 const {meta,state}=profileRef(root);
 const taken=new Set(state.missions.filter(m=>m.source==='local_market')
  .map(m=>m.offerId));
 return board(meta,state).map(offer=>({
  ...offer,...eligibility(state,offer),
  alreadyTaken:taken.has(offer.id)
 }));
}
function accept(root,offerId){
 if(typeof offerId!=='string'||!/^(SIM-\d+-\d{1,2})$/.test(offerId))
  throw Error('Unbekannter Marktauftrag.');
 const {meta,state,dir}=profileRef(root);
 if(state.missions.some(m=>m.status==='accepted'))
  throw Error('Es ist bereits ein aktiver Auftrag vorhanden.');
 const offer=board(meta,state).find(x=>x.id===offerId);
 if(!offer)throw Error('Angebot ist nicht mehr im aktuellen Markt enthalten.');
 if(state.missions.some(m=>m.offerId===offerId))
  throw Error('Dieser Auftrag wurde bereits übernommen.');
 const access=eligibility(state,offer);
 if(!access.eligible)throw Error(access.reason);
 if(state.missions.length>=500)throw Error('Maximale Zahl lokaler Missionen erreicht.');
 const mission={
  id:crypto.randomUUID(),kind:offer.kind,departure:offer.dep,destination:offer.arr,
  aircraft:offer.aircraft,category:offer.sector,client:offer.customer,
  title:offer.title,offerId:offer.id,source:'local_market',
  gameReward:offer.payment,gameCurrency:offer.currency,
  paymentType:'gross_contract_fee',
  requiredRating:offer.rating,
  createdAt:new Date().toISOString(),
  status:'accepted',verified:false,certificateIssued:false,settled:false
 };
 state.missions.unshift(mission);
 storage.writeState(dir,state);
 return mission;
}
function cancel(root,missionId){
 if(typeof missionId!=='string')throw Error('Ungültige Mission.');
 const {state,dir}=profileRef(root);
 const found=state.missions.find(m=>m.id===missionId);
 if(!found||found.status!=='accepted')throw Error('Kein aktiver Auftrag mit dieser Kennung.');
 found.status='cancelled';
 found.cancelledAt=new Date().toISOString();
 // There are no cancellation fees in the alpha, so no ledger mutation.
 storage.writeState(dir,state);
 return found;
}
function regenerate(root){
 const {state,dir}=profileRef(root);
 if(state.missions.some(m=>m.status==='accepted'))
  throw Error('Während eines aktiven Auftrags kann der Markt nicht aktualisiert werden.');
 const next=Number.isSafeInteger(state.marketCycle)?state.marketCycle+1:1;
 if(next>10000)throw Error('Maximale Anzahl von Marktdurchläufen erreicht.');
 state.marketCycle=next;
 storage.writeState(dir,state);
 return {round:next,count:CATALOG.length};
}
function planTypeCheck(root,type){
 if(typeof type!=='string'||!['CJ4','E55P','PC24','SF50'].includes(type))
  throw Error('Nicht unterstützter SIM-Checkride.');
 const {state,dir}=profileRef(root);
 if(state.missions.length>=500)throw Error('Maximale Zahl lokaler Missionen erreicht.');
 if(state.missions.some(m=>m.kind==='checkride'&&m.requiredRating===type&&
   ['planned','accepted'].includes(m.status)))
  throw Error('Für diesen Flugzeugtyp ist bereits ein Checkride geplant.');
 const aircraft=type==='E55P'?'Embraer Phenom 300':
  type==='PC24'?'Pilatus PC-24':type==='CJ4'?'Cessna Citation CJ4':'Cirrus Vision Jet SF50';
 const mission={id:crypto.randomUUID(),kind:'checkride',
   departure:'EDAZ',destination:'EDAZ',aircraft,requiredRating:type,
   source:'local_training',createdAt:new Date().toISOString(),
   title:'SIM-Checkride · 2 Starts und 2 Landungen',
   status:'planned',verified:false,certificateIssued:false,settled:false,
   criteria:{takeoffs:2,landings:2}};
 state.missions.unshift(mission);
 storage.writeState(dir,state);
 return mission;
}
module.exports={CATALOG,RATINGS,CATEGORIES,board,eligibility,list,accept,cancel,regenerate,planTypeCheck};
