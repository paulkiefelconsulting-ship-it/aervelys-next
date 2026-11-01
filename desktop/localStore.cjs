'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const defaultState=()=>({
 schema:1,profile:{pilotName:'Pilot',homeBase:'EDAZ'},
 company:{name:'AERVELYS',currency:'EUR'},
 missions:[],createdAt:new Date().toISOString()
});
function validIcao(value){
 return typeof value==='string'&&/^[A-Z]{4}$/.test(value.toUpperCase())?value.toUpperCase():null;
}
function readState(dir){
 const location=path.join(dir,'local-career.json');
 if(!fs.existsSync(location))return defaultState();
 // Never silently discard or replace a damaged existing career file.
 const stat=fs.statSync(location);
 if(stat.size>2*1024*1024)throw Error('Lokaler Spielstand zu groß. Bitte zuerst eine Sicherung erstellen.');
 let value;
 try {value=JSON.parse(fs.readFileSync(location,'utf8'));}
 catch{throw Error('Lokaler Spielstand beschädigt. Datei bleibt unverändert.');}
 if(value?.schema!==1||!Array.isArray(value.missions)||!value.profile||!value.company)
  throw Error('Unbekanntes Spielstandformat. Datei bleibt unverändert.');
 return value;
}
function writeState(dir,data){
 fs.mkdirSync(dir,{recursive:true});
 const destination=path.join(dir,'local-career.json');
 const staging=destination+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(staging,JSON.stringify(data,null,2),'utf8');
 try { fs.renameSync(staging,destination); }
 catch(err){try{fs.unlinkSync(staging);}catch{}throw err;}
}
function setPilotName(dir,name){
 if(typeof name!=='string'||name.trim().length<2||name.trim().length>70)
  throw Error('Pilotenname muss 2–70 Zeichen enthalten.');
 const state=readState(dir);
 state.profile.pilotName=name.trim().replace(/[\u0000-\u001f]/g,'');
 writeState(dir,state);
 return state;
}
function addMission(dir,payload){
 const departure=validIcao(payload?.departure),destination=validIcao(payload?.destination);
 if(!departure||!destination)throw Error('Bitte gültige vierstellige ICAO-Codes eingeben.');
 if(payload?.kind!=='checkride'&&payload?.kind!=='charter')throw Error('Unbekannter Missionstyp');
 const kind=payload.kind;
 const aircraft=typeof payload?.aircraft==='string'?payload.aircraft.trim():'';
 if(aircraft.length<2||aircraft.length>80)throw Error('Flugzeugbezeichnung: 2–80 Zeichen.');
 const state=readState(dir);
 if(state.missions.length>=500)throw Error('Maximale Zahl lokaler Missionen erreicht.');
 const mission={
  id:crypto.randomUUID(),kind,departure,destination,
  aircraft:aircraft.replace(/[\u0000-\u001f]/g,''),
  createdAt:new Date().toISOString(),
  status:'planned',source:'local_sim',
  verified:false,certificateIssued:false,settled:false
 };
 state.missions.unshift(mission);
 writeState(dir,state);
 return state;
}
function telemetryDir(appData){
 return path.join(appData,'AERVELYS NEXT','Telemetry');
}
function lastTelemetry(appData){
 const folder=telemetryDir(appData);
 try {
  const files=fs.readdirSync(folder)
   .filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().reverse();
  if(!files.length)return {latest:null,samples:0,source:'local'};
  const filepath=path.join(folder,files[0]);
  const stat=fs.statSync(filepath);
  const size=Math.min(stat.size,65536);
  const fd=fs.openSync(filepath,'r');
  const buffer=Buffer.alloc(size);
  try {fs.readSync(fd,buffer,0,size,stat.size-size);}
  finally {fs.closeSync(fd);}
  const text=buffer.toString('utf8');
  const lines=text.split('\n').filter(Boolean);
  const valid=[];
  for(const line of lines.slice(-120)){
   try {
    const record=JSON.parse(line);
    if(record&&typeof record==='object'&&
       typeof record.observed_at==='string'&&typeof record.phase==='string'&&
       typeof record.latitude==='number'&&typeof record.longitude==='number')valid.push(record);
   }catch{}
  }
  const latest=valid.at(-1)||null;
  return {latest,samples:valid.length,source:'local',
   connected:!!latest&&Date.now()-Date.parse(latest.observed_at)<20000};
 }catch{return {latest:null,samples:0,source:'local',connected:false};}
}
module.exports={defaultState,readState,writeState,setPilotName,addMission,
 validIcao,telemetryDir,lastTelemetry};
