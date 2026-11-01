'use strict';
const bridge=window.AERVELYS_LOCAL;
const $=id=>document.getElementById(id);
const text=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'—');};
const format=(s)=>{try{return new Date(s).toLocaleString('de-DE');}catch{return '—';}};
function toast(message){const node=$('toast');node.textContent=message;node.classList.add('visible');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>node.classList.remove('visible'),4500);}
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
 strong.textContent=mission.departure+' → '+mission.destination+'  ·  '+mission.aircraft;
 const small=document.createElement('p');
 small.textContent=(mission.kind==='checkride'?'SIM-Checkride':'SIM-Charter')+' · '+format(mission.createdAt)+' · Noch nicht verifiziert';
 left.append(strong,small);
 const tag=document.createElement('span');tag.className='mission-tag';tag.textContent='GEPLANT';
 div.append(left,tag);parent.append(div);
}
function render(data){
 const state=data.state,feed=data.telemetry;
 text('pilotHero',state.profile.pilotName);
 text('pilotInput',state.profile.pilotName);
 $('pilotInput').value=state.profile.pilotName;
 text('baseHero',state.profile.homeBase);
 text('statMissions',state.missions.length);
 text('missionCount',state.missions.length+' lokal gespeichert');
 const next=$('nextMission');next.textContent='';
 if(state.missions.length)row(next,state.missions[0]);
 else next.textContent='Noch keine lokale Mission angelegt.';
 const list=$('missionsList');list.textContent='';
 if(!state.missions.length)list.textContent='Noch keine lokalen Missionen. Du kannst oben einen Trainingsflug oder Charterauftrag planen.';
 else state.missions.slice(0,100).forEach(m=>row(list,m));
 const live=!!feed.connected;
 ['simStatus','statSim','simChip','acarsConnection'].forEach(id=>text(id,live?'LIVE':'OFFLINE'));
 text('simSummary',live?'Lokale MSFS-Messwerte werden empfangen.':'Keine aktuelle SimConnect-Telemetrie auf diesem PC.');
 const last=feed.latest;
 text('acarsPhase',last?.phase||'—');
 text('acarsAltitude',typeof last?.altitude_ft==='number'?Math.round(last.altitude_ft).toLocaleString('de-DE'):'—');
 text('acarsSpeed',typeof last?.groundspeed_kt==='number'?Math.round(last.groundspeed_kt):'—');
 text('telemetryDetail',last?
  ['Flugzeug: '+(last.aircraft_title||'—'),
   'Zeit: '+format(last.observed_at),
   'Position: '+Number(last.latitude).toFixed(4)+' / '+Number(last.longitude).toFixed(4),
   'Phase: '+last.phase,
   'Höhe: '+Math.round(Number(last.altitude_ft))+' ft',
   'Groundspeed: '+Math.round(Number(last.groundspeed_kt))+' kt',
   'Motor: '+(last.engine_running===true?'läuft':last.engine_running===false?'aus':'unbekannt'),
   'Status: '+(live?'Daten aktuell':'Aufzeichnung unterbrochen')].join('\n'):
  'Noch keine lokalen MSFS-Messwerte. Die Bridge schreibt bei laufendem MSFS neue Messwerte in die lokale Telemetrie-Datei.');
}
async function refresh(){
 try{render(await bridge.snapshot());}
 catch(err){toast('Lokale Daten nicht lesbar: '+String(err?.message||err));}
}
async function action(operation){
 try{
  const result=await operation();
  if(result?.error)throw Error(result.error);
  await refresh();
 }catch(err){toast('Aktion fehlgeschlagen: '+String(err?.message||err));}
}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-view]').forEach(node=>node.addEventListener('click',()=>navigate(node.dataset.view)));
 $('goMissions').addEventListener('click',()=>navigate('missions'));
 $('bridgeHome').addEventListener('click',()=>action(()=>bridge.startBridge()));
 $('startBridge').addEventListener('click',()=>action(()=>bridge.startBridge()));
 $('stopBridge').addEventListener('click',()=>action(()=>bridge.stopBridge()));
 $('openCloud').addEventListener('click',()=>action(()=>bridge.openCloud()));
 $('missionForm').addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  action(async()=>{const result=await bridge.addMission(data);form.reset();toast('SIM-Mission lokal gespeichert.');return result;});
 });
 $('profileForm').addEventListener('submit',event=>{
  event.preventDefault();action(()=>bridge.renamePilot($('pilotInput').value));
 });
 const updateClock=()=>text('clock',new Date().toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}));
 updateClock();setInterval(updateClock,60000);
 void refresh();setInterval(()=>void refresh(),5000);
});
