'use strict';
// AERVELYS NEXT local SIM pilots, deliberately separate from the online airline.
// Profile IDs, not display names, isolate careers and dispatch missions.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const store=require('./localStore.cjs');

const LICENCES=Object.freeze({
 PPL:{title:'Private Pilot',startingHours:50},
 CPL:{title:'Commercial Pilot',startingHours:200},
 FROZEN_ATPL:{title:'Frozen ATPL (simulated)',startingHours:240}
});
const COUNTRIES=Object.freeze({DE:'Deutschland',AT:'Österreich',CH:'Schweiz',
 GB:'Vereinigtes Königreich',US:'Vereinigte Staaten',FR:'Frankreich',
 NL:'Niederlande',ES:'Spanien',IT:'Italien',CA:'Kanada'});
const CURRENCIES=Object.freeze(['EUR','USD','GBP','CHF','CAD']);
const ISO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const indexPath=root=>path.join(root,'pilots-index.json');
const profileDir=(root,id)=>{
 if(!ISO_ID.test(id))throw Error('Invalid profile ID');
 return path.join(root,'pilots',id);
};
function writeAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');
 try{fs.renameSync(temp,file);}
 catch(err){try{fs.unlinkSync(temp);}catch{}throw err;}
}
function cleanName(value){
 if(typeof value!=='string'||value.trim().length<2||value.trim().length>70||
    /[\u0000-\u001f<>]/.test(value))
  throw Error('Pilotennamen mit 2–70 Zeichen ohne Steuerzeichen eingeben.');
 return value.trim();
}
function safeIndex(value){
 if(!value||value.schema!==1||!Array.isArray(value.pilots)||value.pilots.length>24||
  !value.pilots.every(p=>p&&ISO_ID.test(p.id)&&typeof p.name==='string')||
  new Set(value.pilots.map(p=>p.id)).size!==value.pilots.length||
  (value.activeId!==null&&!value.pilots.some(p=>p.id===value.activeId)))
  throw Error('Lokaler Pilotenindex beschädigt. Deine Dateien bleiben unverändert.');
 return value;
}
function loadIndex(root){
 const file=indexPath(root);
 if(fs.existsSync(file)){
  if(fs.statSync(file).size>512*1024)throw Error('Pilotenindex ist zu groß.');
  try{return safeIndex(JSON.parse(fs.readFileSync(file,'utf8')));}
  catch(err){throw Error('Pilotenindex konnte nicht gelesen werden: '+String(err.message));}
 }
 // Keep any pre-0.4 0.3 career intact; import a COPY, not a destructive move.
 const legacy=path.join(root,'local-career.json');
 const value={schema:1,activeId:null,pilots:[]};
 if(fs.existsSync(legacy)){
  const old=store.readState(root);
  const id=crypto.randomUUID();
  const name=cleanName(old.profile?.pilotName||'Pilot');
  const meta={id,name,country:'DE',currency:'EUR',licence:'LEGACY',
   startingCapital:0,startingHours:0,createdAt:old.createdAt||new Date().toISOString(),
   migrated:true};
  const folder=profileDir(root,id);
  // If a partial migration fails, the old source remains untouched.
  store.writeState(folder,old);
  value.pilots.push(meta);
  value.activeId=id;
 }
 writeAtomic(file,value);
 return value;
}
function list(root){
 const index=loadIndex(root);
 return {pilots:index.pilots,activeId:index.activeId};
}
function validateNew(data){
 const name=cleanName(data?.name);
 const country=typeof data?.country==='string'?data.country.toUpperCase():'';
 const currency=typeof data?.currency==='string'?data.currency.toUpperCase():'';
 const licence=data?.licence;
 const capital=Number(data?.capital);
 if(!Object.prototype.hasOwnProperty.call(COUNTRIES,country))throw Error('Ungültiges Wohnsitzland.');
 if(!CURRENCIES.includes(currency))throw Error('Ungültige Spielwährung.');
 if(!Object.prototype.hasOwnProperty.call(LICENCES,licence))throw Error('Ungültige SIM-Startlizenz.');
 if(!Number.isSafeInteger(capital)||capital<0||capital>10000000)
  throw Error('SIM-Startkapital muss 0–10.000.000 betragen.');
 return {name,country,currency,licence,capital};
}
function create(root,data){
 const clean=validateNew(data),index=loadIndex(root);
 if(index.pilots.length>=24)throw Error('Maximal 24 lokale Pilotenprofile.');
 const id=crypto.randomUUID();
 const defaults=store.defaultState();
 defaults.profile={
  pilotName:clean.name,homeBase:'EDAZ',country:clean.country,
  simLicence:clean.licence,startingHours:LICENCES[clean.licence].startingHours,
  verifiedFlightHours:0
 };
 defaults.company.currency=clean.currency;
 defaults.finances={initialCapital:clean.capital,currency:clean.currency,
  balance:clean.capital,transactions:[]};
 const entry={id,name:clean.name,country:clean.country,currency:clean.currency,
  licence:clean.licence,startingCapital:clean.capital,
  startingHours:LICENCES[clean.licence].startingHours,
  createdAt:defaults.createdAt,migrated:false};
 store.writeState(profileDir(root,id),defaults);
 index.pilots.push(entry);index.activeId=id;
 writeAtomic(indexPath(root),index);
 return {entry,state:defaults};
}
function select(root,id){
 const index=loadIndex(root);
 if(typeof id!=='string'||!index.pilots.some(p=>p.id===id))
  throw Error('Unbekanntes Pilotenprofil.');
 const state=store.readState(profileDir(root,id));
 index.activeId=id;
 writeAtomic(indexPath(root),index);
 return state;
}
function selected(root){
 const index=loadIndex(root);
 if(!index.activeId)return null;
 const meta=index.pilots.find(p=>p.id===index.activeId);
 if(!meta)throw Error('Pilotenprofil fehlt.');
 return {meta,state:store.readState(profileDir(root,meta.id))};
}
function updateName(root,name){
 const index=loadIndex(root);
 const item=index.pilots.find(p=>p.id===index.activeId);
 if(!item)throw Error('Bitte zuerst ein Profil auswählen.');
 const sanitized=cleanName(name);
 const folder=profileDir(root,item.id);
 const previous=store.readState(folder);
 store.setPilotName(folder,sanitized);
 item.name=sanitized;
 try{writeAtomic(indexPath(root),index);}
 catch(error){store.writeState(folder,previous);throw error;}
 return store.readState(folder);
}
function addMission(root,data){
 const index=loadIndex(root);
 if(!index.activeId)throw Error('Bitte zuerst ein Profil auswählen.');
 return store.addMission(profileDir(root,index.activeId),data);
}
function exportData(root){
 const index=loadIndex(root);
 return {format:'AERVELYS_LOCAL_PILOTS_BACKUP',version:1,
  exportedAt:new Date().toISOString(),
  activeId:index.activeId,
  pilots:index.pilots.map(meta=>({meta,state:store.readState(profileDir(root,meta.id))}))};
}
function importData(root,raw){
 if(!raw||raw.format!=='AERVELYS_LOCAL_PILOTS_BACKUP'||raw.version!==1||
  !Array.isArray(raw.pilots)||raw.pilots.length<1||raw.pilots.length>24)
  throw Error('Unbekanntes oder ungültiges AERVELYS-Backup.');
 const index=loadIndex(root);
 if(index.pilots.length+raw.pilots.length>24)throw Error('Maximal 24 Profile inklusive Backup.');
 const drafts=raw.pilots.map(({meta,state})=>{
  const name=cleanName(meta?.name);
  if(!state||state.schema!==1||!Array.isArray(state.missions)||state.missions.length>500||
    !state.profile||!state.company)
   throw Error('Backup enthält ungültigen Karriere-Spielstand.');
  if(state.missions.some(m=>!m||typeof m!=='object'||
    typeof m.departure!=='string'||typeof m.destination!=='string'||
    typeof m.aircraft!=='string'))throw Error('Ungültige Mission im Backup.');
  const currency=CURRENCIES.includes(meta?.currency)?meta.currency:'EUR';
  const country=Object.prototype.hasOwnProperty.call(COUNTRIES,meta?.country)?meta.country:'DE';
  const licence=Object.prototype.hasOwnProperty.call(LICENCES,meta?.licence)?meta.licence:'LEGACY';
  const id=crypto.randomUUID();
  const entry={id,name,country,currency,licence,
   startingCapital:Number.isFinite(meta?.startingCapital)?meta.startingCapital:0,
   startingHours:Number.isFinite(meta?.startingHours)?meta.startingHours:0,
   createdAt:new Date().toISOString(),migrated:!!meta.migrated};
  return {entry,state:JSON.parse(JSON.stringify(state))};
 });
 // Refuse huge nested values, avoid bloating local career storage.
 for(const item of drafts){
  if(Buffer.byteLength(JSON.stringify(item.state),'utf8')>2*1024*1024)
   throw Error('Backup-Spielstand überschreitet 2 MB.');
 }
 for(const item of drafts)store.writeState(profileDir(root,item.entry.id),item.state);
 index.pilots.push(...drafts.map(x=>x.entry));
 index.activeId=drafts[0].entry.id;
 writeAtomic(indexPath(root),index);
 return {count:drafts.length,activeId:index.activeId};
}
module.exports={LICENCES,COUNTRIES,CURRENCIES,cleanName,loadIndex,list,
 create,select,selected,updateName,addMission,exportData,importData,profileDir,validateNew};
