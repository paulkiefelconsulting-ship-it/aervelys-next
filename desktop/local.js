'use strict';
const bridge=window.AERVELYS_LOCAL;
const $=id=>document.getElementById(id);
const text=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'—');};
const format=s=>{const d=new Date(s);return Number.isFinite(d.valueOf())?d.toLocaleString('de-DE'):'—';};
let selectingPilot=true;
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
 small.textContent=(mission.kind==='checkride'?'SIM-Checkride':'SIM-Charter')+' · '+format(mission.createdAt)+' · Noch nicht verifiziert';
 left.append(strong,small);
 const tag=document.createElement('span');tag.className='mission-tag';tag.textContent='GEPLANT';
 div.append(left,tag);parent.append(div);
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
 $('pilotInput').value=profile.pilotName;
 text('baseHero',profile.homeBase);
 text('statMissions',state.missions.length);
 text('missionCount',state.missions.length+' lokal gespeichert');
 const p=data.selectedPilot;
 text('pilotDetails',p?'SIM-Lizenz: '+(p.licence==='LEGACY'?'0.3-Spielstand':p.licence)+
  ' · Startstunden: '+p.startingHours+' h · Land: '+p.country+' · Währung: '+p.currency:'');
 const balance=state.finances?.balance;
 text('statBudget',Number.isFinite(balance)?
  new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(balance)+' '+state.finances.currency:'—');
 const next=$('nextMission');next.replaceChildren();
 if(state.missions.length)row(next,state.missions[0]);
 else next.textContent='Noch keine lokale Mission angelegt.';
 const list=$('missionsList');list.replaceChildren();
 if(!state.missions.length)list.textContent='Noch keine Missionen. Plane einen Trainingsflug oder Charterauftrag.';
 else state.missions.slice(0,100).forEach(m=>row(list,m));
 const live=!!feed.connected;
 ['simStatus','statSim','simChip','acarsConnection'].forEach(id=>text(id,live?'LIVE':'OFFLINE'));
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
async function refresh(){
 try{
  const data=await bridge.snapshot();
  render(data);
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
