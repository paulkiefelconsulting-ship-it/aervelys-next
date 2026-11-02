'use strict';
const bridge=window.AERVELYS_LOCAL;
const $=id=>document.getElementById(id);
const text=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'—');};
const format=s=>{const d=new Date(s);return Number.isFinite(d.valueOf())?d.toLocaleString('de-DE'):'—';};
let selectingPilot=true;
let marketOffers=[];
let marketSignature='';
let hasActiveMarketMission=false;
const money=(value,currency)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:currency||'EUR',maximumFractionDigits:0}).format(value);
function toast(message){
 const node=$('toast');node.textContent=message;node.classList.add('visible');
 clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>node.classList.remove('visible'),4800);
}
function showChooser(){$('pilotChoose').hidden=false;$('pilotCreate').hidden=true;}
function gateway(show){selectingPilot=show;$('pilotGateway').hidden=!show;if(show)showChooser();}
function showCreator(){$('pilotChoose').hidden=true;$('pilotCreate').hidden=false;$('newPilotForm').elements.name.focus();}
function navigate(page){
 document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===page));
 document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===page));
 const names={home:'COMMAND CENTER',missions:'CHARTER & TRIPS',acars:'LIVE TRACKING & ACARS',career:'PILOT CAREER',company:'AIRLINE'};
 text('crumb',names[page]||page);
}
function row(parent,mission){
 const div=document.createElement('div');div.className='mission-row';
 const left=document.createElement('div');
 const strong=document.createElement('strong');
 strong.textContent=mission.departure+' → '+mission.destination+' · '+mission.aircraft;
 const small=document.createElement('p');
 small.textContent=(mission.kind==='checkride'?'SIM-Checkride':mission.kind==='ferry'?'SIM-Ferry':'SIM-Charter')+' · '+
  format(mission.createdAt)+' · '+(mission.status==='cancelled'?'abgebrochen':
   mission.status==='completed'?'geflogen und gebucht':mission.status==='accepted'?'angenommen, noch nicht abgerechnet':'geplant, nicht verifiziert')+
  (Number.isFinite(mission.gameReward)?
   ' · Bruttohonorar: '+money(mission.gameReward,mission.gameCurrency||'EUR')+' (noch nicht ausgezahlt)':'');
 left.append(strong,small);
 const tag=document.createElement('span');tag.className='mission-tag';tag.textContent='GEPLANT';
 div.append(left,tag);
 if(mission.source==='local_market'&&mission.status==='accepted'){
  const flightAction=document.createElement('button');
  flightAction.className='primary';flightAction.type='button';
  flightAction.textContent=mission.tracking?'Flug prüfen':'Flug am Gate aktivieren';
  flightAction.addEventListener('click',()=>{void action(async()=>{
   if(!mission.tracking){
    const result=await bridge.flightArm(mission.id);
    if(result)toast('Auftrag an aktuellen Simulatorflug gebunden. Starte jetzt die Triebwerke.');
    return result;
   }
   const review=await bridge.flightReview(mission.id);
   showFlightReview(review,mission);
   return review;
  });});
  div.append(flightAction);
  const button=document.createElement('button');button.className='secondary';button.type='button';
  button.textContent='Auftrag abbrechen';
  button.addEventListener('click',()=>{
   if(!window.confirm('Diesen lokalen SIM-Auftrag ohne Auszahlung abbrechen?'))return;
   void action(async()=>{
    const result=await bridge.marketCancel(mission.id);
    toast('SIM-Auftrag abgebrochen. Keine Finanzbuchung.');
    return result;
   });
  });
  div.append(button);
 }
 parent.append(div);
}
function renderPilots(profiles){
 const node=$('pilotList');node.replaceChildren();
 if(!profiles.length){
  const empty=document.createElement('p');empty.className='gateway-empty';
  empty.textContent='Noch kein Pilotenprofil vorhanden. Erstelle deinen ersten lokalen SIM-Piloten.';
  node.append(empty);
 }
 for(const p of profiles){
  const button=document.createElement('button');button.type='button';button.className='pilot-choice';
  const avatar=document.createElement('span');avatar.className='pilot-avatar';
  avatar.textContent=p.name.trim().split(/\s+/).map(x=>x.charAt(0)).slice(0,2).join('').toUpperCase();
  const label=document.createElement('span');
  const name=document.createElement('strong');name.textContent=p.name;
  const sub=document.createElement('small');
  const licence=p.licence==='LEGACY'?'Bisheriger Spielstand':p.licence.replace('_',' ');
  sub.textContent=licence+' · '+p.currency+' · Profil '+p.id.slice(0,8);
  label.append(name,sub);button.append(avatar,label);
  button.addEventListener('click',()=>{void action(async()=>{
   const result=await bridge.selectPilot(p.id);
   if(result){gateway(false);navigate('home');}
   return result;
  });});
  node.append(button);
 }
}
function render(data){
 renderPilots(data.pilots||[]);
 const state=data.state;if(!state)return;
 const profile=state.profile,feed=data.telemetry;
 text('pilotHero',profile.pilotName);
 if(document.activeElement!==$('pilotInput'))$('pilotInput').value=profile.pilotName;
 text('baseHero',profile.homeBase);
 text('statMissions',state.missions.length);
 text('missionCount',state.missions.length+' lokal gespeichert');
 const p=data.selectedPilot;
 text('pilotDetails',p?'SIM-Lizenz: '+(p.licence==='LEGACY'?'0.3-Spielstand':p.licence)+
  ' · Startstunden: '+p.startingHours+' h · Land: '+p.country+' · Währung: '+p.currency:'');
 const balance=state.finances?.balance;
 text('statBudget',Number.isFinite(balance)?
  new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(balance)+' '+state.finances.currency:'—');
 text('companyBalance',Number.isFinite(balance)?money(balance,state.finances.currency):'Kein lokales SIM-Budget');
 renderLedger(state);
 const next=$('nextMission');next.replaceChildren();
 if(state.missions.length)row(next,state.missions[0]);
 else next.textContent='Noch keine lokale Mission angelegt.';
 const list=$('missionsList');list.replaceChildren();
 if(!state.missions.length)list.textContent='Noch keine Missionen. Plane einen Trainingsflug oder Charterauftrag.';
 else state.missions.slice(0,100).forEach(m=>row(list,m));
 const live=!!feed.connected;
 text('simStatus',live?'SIM LIVE':'SIM OFFLINE');
 ['statSim','simChip','acarsConnection'].forEach(id=>text(id,live?'LIVE':'OFFLINE'));
 text('simSummary',live?'Lokale MSFS-Messwerte werden empfangen.':'Keine aktuelle SimConnect-Telemetrie.');
 const last=feed.latest;
 text('acarsPhase',last?.phase||'—');
 text('acarsAltitude',typeof last?.altitude_ft==='number'?Math.round(last.altitude_ft).toLocaleString('de-DE'):'—');
 text('acarsSpeed',typeof last?.groundspeed_kt==='number'?Math.round(last.groundspeed_kt):'—');
 text('telemetryDetail',last?
  ['Flugzeug: '+(last.aircraft_title||'—'),'Zeit: '+format(last.observed_at),
   'Position: '+Number(last.latitude).toFixed(4)+' / '+Number(last.longitude).toFixed(4),
   'Phase: '+last.phase,'Höhe: '+Math.round(Number(last.altitude_ft))+' ft',
   'Groundspeed: '+Math.round(Number(last.groundspeed_kt))+' kt',
   'Motor: '+(last.engine_running===true?'läuft':last.engine_running===false?'aus':'unbekannt'),
   'Status: '+(live?'Daten aktuell':'Aufzeichnung unterbrochen')].join('\n'):
  'Noch keine lokalen MSFS-Messwerte. Im Offline-Modus schreibt die SimConnect-Bridge auf diesen PC.');
}

function showFlightReview(review,mission){
 const box=$('flightReviewBox');
 if(!box)return;
 box.replaceChildren();
 const title=document.createElement('strong');
 title.textContent=review.passed?
  'SIM-Flugprüfung erfolgreich – Abrechnung kann gebucht werden':
  'Flugprüfung noch nicht erfüllt';
 box.append(title);
 const content=document.createElement('p');
 content.textContent=review.passed?
  'SimConnect-Sitzung, Muster, Start/Flug/Landung und Shutdown sind stimmig. '+
  'Samples: '+review.sampleCount+' · aufgezeichnet: '+review.durationHours+' h.':
  (review.reasons||['Keine gültigen Flugdaten']).join(' · ');
 box.append(content);
 if(review.passed){
  const button=document.createElement('button');
  button.type='button';button.className='primary';
  button.textContent='Geprüften SIM-Flug abrechnen';
  button.addEventListener('click',()=>{void action(async()=>{
   const result=await bridge.flightSettle(mission.id);
   if(!result?.settled){
    showFlightReview(result?.review||{passed:false,reasons:['Belegprüfung fehlgeschlagen.']},mission);
    return result;
   }
   box.replaceChildren();
   const receipt=document.createElement('p');
   receipt.textContent='Gebucht: '+money(result.receipt.net,result.receipt.currency)+
    ' · Neuer SIM-Kontostand: '+money(result.balance,result.receipt.currency)+
    '. Details unter Airline & Finanzen.';
   box.append(receipt);
   toast('Flugabrechnung sicher verbucht.');
   return result;
  });});
  box.append(button);
 }
}
function renderLedger(state){
 const node=$('ledgerList');node.replaceChildren();
 const transactions=state.finances?.transactions||[];
 if(!transactions.length){node.textContent='Noch keine abgerechneten SIM-Flüge.';return;}
 for(const tx of transactions.slice(-25).reverse()){
  const wrap=document.createElement('article');wrap.className='ledger-row';
  const heading=document.createElement('strong');
  heading.textContent='SimConnect-Flug '+tx.missionId.slice(0,8)+' · '+format(tx.createdAt);
  const details=document.createElement('p');
  details.textContent='Brutto '+money(tx.gross,tx.currency)+
   ' − Treibstoff '+money(tx.fuel,tx.currency)+
   ' − Landegebühr '+money(tx.landing,tx.currency)+
   ' − Handling '+money(tx.handling,tx.currency);
  const total=document.createElement('strong');
  total.textContent='SIM-Ergebnis: '+money(tx.net,tx.currency);
  wrap.append(heading,details,total);node.append(wrap);
 }
}
function marketCard(offer){
 const article=document.createElement('article');article.className='market-card';
 const main=document.createElement('div');
 const header=document.createElement('div');header.className='offer-header';
 const category=document.createElement('span');category.className='mission-tag';
 category.textContent=offer.category;
 const route=document.createElement('strong');route.textContent=offer.dep+' → '+offer.arr;
 header.append(category,route);
 const title=document.createElement('h4');title.textContent=offer.title;
 const caption=document.createElement('p');caption.className='muted';
 caption.textContent=offer.customer+' · '+offer.aircraft+' · '+offer.nm+' nm';
 main.append(header,title,caption);
 const requirement=document.createElement('p');requirement.className='offer-requirement';
 requirement.textContent=(offer.eligible?'✓ ':'🔒 ')+offer.reason;
 requirement.classList.toggle('locked',!offer.eligible);
 main.append(requirement);
 const side=document.createElement('div');side.className='offer-actions';
 const value=document.createElement('strong');
 value.className='offer-value';
 value.textContent=money(offer.payment,offer.currency);
 const hint=document.createElement('small');
 const preview=offer.costPreview;
 hint.textContent=preview?
  'Treibstoff '+money(preview.fuel,preview.currency)+
  ' · Landing '+money(preview.landing,preview.currency)+
  ' · Handling '+money(preview.handling,preview.currency):
  'Betriebskosten noch nicht verfügbar';
 const projected=document.createElement('strong');
 projected.className='offer-net';
 projected.textContent=preview?'Voraussichtlich netto: '+money(preview.net,preview.currency):'';

 const actionButton=document.createElement('button');
 actionButton.type='button';actionButton.className=offer.eligible?'primary':'secondary';
 actionButton.disabled=!offer.eligible||offer.alreadyTaken||hasActiveMarketMission;
 actionButton.textContent=offer.alreadyTaken?'Bereits übernommen':
  !offer.eligible?'Nicht freigegeben':
  hasActiveMarketMission?'Auftrag aktiv':'Auftrag annehmen';
 actionButton.addEventListener('click',()=>{void action(async()=>{
  const result=await bridge.marketAccept(offer.id);
  toast('SIM-Auftrag gespeichert – noch kein Flugabschluss oder Geldeingang.');
  return result;
 });});
 side.append(value,hint,projected,actionButton);
 article.append(main,side);
 return article;
}
function drawMarket(){
 const section=$('marketOffers');section.replaceChildren();
 const sector=$('marketSector').value,availability=$('marketEligibility').value;
 const visible=marketOffers.filter(offer=>
  (sector==='ALL'||offer.sector===sector)&&
  (availability==='ALL'||(availability==='ELIGIBLE'&&offer.eligible)||
   (availability==='LOCKED'&&!offer.eligible)));
 text('marketCount',visible.length+' von '+marketOffers.length+' SIM-Angeboten');
 if(!visible.length){
  const empty=document.createElement('p');empty.className='empty';
  empty.textContent='Keine Aufträge für diese Filter. Passe die Auswahl an.';
  section.append(empty);
 } else visible.forEach(o=>section.append(marketCard(o)));
}
async function refreshMarket(snapshot,force=false){
 if(!snapshot.state)return;
 const missionIds=snapshot.state.missions.map(m=>m.id+':'+m.status).join(',');
 const key=snapshot.activeId+'|'+(snapshot.state.marketCycle||0)+'|'+missionIds;
 if(!force&&key===marketSignature)return;
 const incoming=await bridge.marketList();
 if(!Array.isArray(incoming))throw Error('Offline-Chartermarkt nicht verfügbar.');
 marketOffers=incoming;
 hasActiveMarketMission=snapshot.state.missions.some(m=>m.status==='accepted');
 marketSignature=key;
 drawMarket();
}
async function refresh(){
 try{
  const data=await bridge.snapshot();
  render(data);
  await refreshMarket(data);
  if(!data.pilots?.length&&!selectingPilot)gateway(true);
 }catch(err){toast('Lokale Daten nicht lesbar: '+String(err?.message||err));}
}
async function action(operation){
 try{const result=await operation();if(result?.error)throw Error(result.error);await refresh();return result;}
 catch(err){toast('Aktion fehlgeschlagen: '+String(err?.message||err));return null;}
}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-view]').forEach(node=>node.addEventListener('click',()=>navigate(node.dataset.view)));
 $('goMissions').addEventListener('click',()=>navigate('missions'));
 $('switchPilot').addEventListener('click',()=>gateway(true));
 $('createPilotOpen').addEventListener('click',showCreator);
 $('pilotBack').addEventListener('click',showChooser);
 $('backupProfiles').addEventListener('click',()=>{void action(async()=>{
  const r=await bridge.backupPilots();
  if(!r?.cancelled)toast('Lokale Profile gesichert.');
  return r;
 });});
 $('restoreProfiles').addEventListener('click',()=>{void action(async()=>{
  const r=await bridge.restorePilots();
  if(r?.count)toast(r.count+' Profil(e) wiederhergestellt.');
  return r;
 });});
 const byCountry={DE:'EUR',AT:'EUR',CH:'CHF',GB:'GBP',US:'USD',FR:'EUR',
  NL:'EUR',ES:'EUR',IT:'EUR',CA:'CAD'};
 $('newCountry').addEventListener('change',event=>{
  $('newCurrency').value=byCountry[event.target.value]||'EUR';
 });
 document.querySelectorAll('[data-capital]').forEach(button=>
  button.addEventListener('click',()=>{
   $('newCapital').value=button.dataset.capital;
   document.querySelectorAll('[data-capital]').forEach(b=>b.classList.toggle('selected',b===button));
  }));
 $('newCapital').addEventListener('input',()=>{
  document.querySelectorAll('[data-capital]').forEach(b=>
   b.classList.toggle('selected',b.dataset.capital===$('newCapital').value));
 });
 $('newPilotForm').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  void action(async()=>{
   const r=await bridge.createPilot(data);
   if(!r)throw Error('Profil konnte nicht erstellt werden');
   form.reset();gateway(false);navigate('home');
   toast('SIM-Pilotenkarriere lokal angelegt.');
   return r;
  });
 });
 $('bridgeHome').addEventListener('click',()=>{void action(()=>bridge.startBridge());});
 $('startBridge').addEventListener('click',()=>{void action(()=>bridge.startBridge());});
 $('stopBridge').addEventListener('click',()=>{void action(()=>bridge.stopBridge());});
 $('openCloud').addEventListener('click',()=>{void action(()=>bridge.openCloud());});
 $('marketSector').addEventListener('change',drawMarket);
 $('marketEligibility').addEventListener('change',drawMarket);
 $('regenerateMarket').addEventListener('click',()=>{
  void action(async()=>{
   const result=await bridge.marketRefresh();
   toast('Neue lokale SIM-Angebote erstellt.');
   return result;
  });
 });
 document.querySelectorAll('[data-training]').forEach(button=>{
  button.addEventListener('click',()=>{void action(async()=>{
   const result=await bridge.trainingPlan(button.dataset.training);
   toast('SIM-Checkride EDAZ → EDAZ geplant. Keine Berechtigung erteilt.');
   navigate('missions');
   return result;
  });});
 });
 $('missionForm').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  void action(async()=>{
   const r=await bridge.addMission(data);
   form.reset();toast('SIM-Mission lokal gespeichert.');return r;
  });
 });
 $('profileForm').addEventListener('submit',event=>{
  event.preventDefault();void action(()=>bridge.renamePilot($('pilotInput').value));
 });
 const clock=()=>text('clock',new Date().toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}));
 clock();setInterval(clock,60000);
 void refresh();setInterval(()=>{void refresh();},5000);
});
