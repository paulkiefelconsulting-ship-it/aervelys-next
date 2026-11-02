'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const profiles=require('../pilotProfiles.cjs');
const store=require('../localStore.cjs');
const market=require('../offlineMarket.cjs');

function setup(t,licence='CPL'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aervelys-market-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const pilot=profiles.create(dir,{name:'Offline Pilot',country:'DE',currency:'EUR',
  licence,capital:90000});
 return {dir,pilot};
}
test('offline board is deterministic, independent of internet and profile currency',t=>{
 const {dir}=setup(t);
 const first=market.list(dir);
 const second=market.list(dir);
 assert.deepEqual(second,first);
 assert.ok(first.length>=12);
 assert.ok(first.every(o=>o.isSimulation===true&&o.currency==='EUR'));
 assert.ok(first.every(o=>o.dep==='EDAZ'&&o.arr.length===4));
 assert.ok(first.every(o=>Number.isSafeInteger(o.payment)&&o.payment>=0));
 assert.ok(first.some(o=>o.eligible&&o.rating==='SEP'));
 assert.ok(first.some(o=>!o.eligible&&o.rating==='E55P'));
 const other=profiles.create(dir,{name:'Offline Pilot',country:'US',currency:'USD',
  licence:'CPL',capital:12000});
 assert.equal(market.list(dir)[0].currency,'USD');
 assert.notDeepEqual(market.list(dir).map(o=>o.payment),first.map(o=>o.payment));
 profiles.select(dir,other.entry.id);
 assert.equal(market.list(dir)[0].currency,'USD');
});
test('CPL can accept SEP mission; budget and ratings are unchanged until proven flight',t=>{
 const {dir}=setup(t);
 const offer=market.list(dir).find(o=>o.eligible&&o.payment>0&&o.rating==='SEP');
 assert.ok(offer);
 const entry=market.accept(dir,offer.id);
 assert.equal(entry.status,'accepted');
 assert.equal(entry.verified,false);
 assert.equal(entry.settled,false);
 assert.equal(entry.gameReward,offer.payment);
 const before=profiles.selected(dir).state;
 assert.equal(before.finances.balance,90000);
 assert.equal(before.profile.verifiedFlightHours,0);
 assert.throws(()=>market.accept(dir,offer.id),/bereits ein aktiver Auftrag/);
 assert.throws(()=>market.regenerate(dir),/aktiven Auftrag/);
 const canceled=market.cancel(dir,entry.id);
 assert.equal(canceled.status,'cancelled');
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
 assert.equal(profiles.selected(dir).state.missions[0].settled,false);
 assert.throws(()=>market.cancel(dir,entry.id));
 const refreshed=market.regenerate(dir);
 assert.equal(refreshed.round,1);
 assert.notDeepEqual(market.list(dir).map(o=>o.id),market.list(dir).map(o=>o.id.slice(4)));
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
});
test('all market ferries are paid; PPL cannot accept paid ferry or charter',t=>{
 const {dir}=setup(t,'PPL');
 const offers=market.list(dir);
 const ferry=offers.find(x=>x.kind==='ferry');
 assert.ok(ferry.payment>0);
 assert.equal(ferry.eligible,false);
 assert.ok(offers.every(x=>x.payment>0));
 assert.ok(offers.every(x=>!x.eligible));
 assert.throws(()=>market.accept(dir,ferry.id),/CPL oder Frozen ATPL/);
 assert.throws(()=>market.accept(dir,offers.find(x=>x.kind==='charter').id),/CPL oder Frozen ATPL/);
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
});
test('commercial CPL ferry pays a positive gross fee but is not auto-settled',t=>{
 const {dir}=setup(t,'CPL');
 const ferries=market.list(dir).filter(o=>o.sector==='FERRY'&&o.eligible);
 assert.ok(ferries.length>=3);
 assert.ok(ferries.every(o=>Number.isSafeInteger(o.payment)&&o.payment>0));
 const first=ferries[0];
 const accepted=market.accept(dir,first.id);
 assert.equal(accepted.gameReward,first.payment);
 assert.equal(accepted.paymentType,'gross_contract_fee');
 assert.equal(accepted.verified,false);
 assert.equal(accepted.settled,false);
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
 market.cancel(dir,accepted.id);
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
});
test('old accepted CPL ferry at 0 is repriced once without retroactive payout',t=>{
 const {dir,pilot}=setup(t,'CPL');
 const ferry=market.list(dir).find(o=>o.kind==='ferry'&&o.eligible);
 market.accept(dir,ferry.id);
 const saveDir=profiles.profileDir(dir,pilot.entry.id);
 const legacy=store.readState(saveDir);
 legacy.missions[0].gameReward=0; // simulate v0.5 saved assignment
 delete legacy.missions[0].paymentType;
 store.writeState(saveDir,legacy);
 const offers=market.list(dir); // safe reconciliation on first market refresh
 assert.ok(offers.some(o=>o.id===ferry.id));
 const fixed=store.readState(saveDir);
 assert.equal(fixed.missions[0].gameReward,ferry.payment);
 assert.equal(fixed.missions[0].pricingRevision,'paid_ferry_v051');
 assert.equal(fixed.missions[0].previousGameReward,0);
 assert.equal(fixed.missions[0].verified,false);
 assert.equal(fixed.missions[0].settled,false);
 assert.equal(fixed.finances.balance,90000);
 market.list(dir); // idempotent
 assert.equal(store.readState(saveDir).missions[0].gameReward,ferry.payment);
});
test('old noncommercial PPL ferry stays uncompensated',t=>{
 const {dir,pilot}=setup(t,'PPL');
 const ferry=market.list(dir).find(o=>o.kind==='ferry');
 const saveDir=profiles.profileDir(dir,pilot.entry.id);
 const state=store.readState(saveDir);
 state.missions.unshift({
  id:'legacy-ppl-ferry',offerId:ferry.id,source:'local_market',category:'FERRY',
  departure:ferry.dep,destination:ferry.arr,aircraft:ferry.aircraft,
  gameCurrency:'EUR',gameReward:0,status:'accepted',
  verified:false,settled:false
 });
 store.writeState(saveDir,state);
 market.list(dir);
 assert.equal(store.readState(saveDir).missions[0].gameReward,0);
 assert.equal(store.readState(saveDir).finances.balance,90000);
});
test('rating locks are enforceable on server, not only in UI',t=>{
 const {dir}=setup(t,'CPL');
 const jet=market.list(dir).find(x=>x.rating==='E55P');
 assert.equal(jet.eligible,false);
 assert.throws(()=>market.accept(dir,jet.id),/Type-Rating fehlt/);
 assert.throws(()=>market.accept(dir,'SIM-999-0'),/nicht mehr im aktuellen/);
 assert.throws(()=>market.accept(dir,'SIM-0-../../'));
 assert.throws(()=>market.accept(dir,{id:jet.id}));
});
test('E55P and CJ4 training is planned without granting certificates',t=>{
 const {dir}=setup(t);
 const ph=market.planTypeCheck(dir,'E55P');
 assert.equal(ph.departure,'EDAZ');
 assert.equal(ph.destination,'EDAZ');
 assert.deepEqual(ph.criteria,{takeoffs:2,landings:2});
 assert.equal(ph.verified,false);
 assert.equal(ph.certificateIssued,false);
 assert.equal(ph.settled,false);
 assert.equal(ph.status,'planned');
 assert.throws(()=>market.planTypeCheck(dir,'E55P'),/bereits ein Checkride/);
 const cj=market.planTypeCheck(dir,'CJ4');
 assert.equal(cj.requiredRating,'CJ4');
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
 assert.equal(market.list(dir).find(o=>o.rating==='E55P').eligible,false);
 assert.throws(()=>market.planTypeCheck(dir,'A320'));
});
test('pilot switching isolates all accepted missions and contract choices',t=>{
 const {dir,pilot}=setup(t);
 const chosen=market.list(dir).find(o=>o.eligible);
 market.accept(dir,chosen.id);
 const second=profiles.create(dir,{name:'Offline Pilot',country:'DE',currency:'EUR',licence:'CPL',capital:4000});
 assert.equal(profiles.selected(dir).state.missions.length,0);
 assert.equal(market.list(dir).filter(o=>o.alreadyTaken).length,0);
 const offer=market.list(dir).find(o=>o.eligible);
 market.accept(dir,offer.id);
 assert.equal(profiles.selected(dir).state.finances.balance,4000);
 profiles.select(dir,pilot.entry.id);
 assert.equal(profiles.selected(dir).state.finances.balance,90000);
 assert.equal(profiles.selected(dir).state.missions.length,1);
 assert.equal(market.list(dir).filter(o=>o.alreadyTaken).length,1);
 assert.notEqual(second.entry.id,pilot.entry.id);
});
