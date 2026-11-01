'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';

export type BridgePhase='Unknown'|'Parked'|'TaxiOut'|'TakeoffRoll'|'Climb'|'Cruise'|'Descent'|'Approach'|'Landing'|'TaxiIn';
export type BridgeSnapshot={
 schemaVersion:1;source:'msfs2024-simconnect-local';timestampUtc:string;phase:BridgePhase;
 telemetry:{latitude:number;longitude:number;altitudeFt:number;aglFt:number;verticalSpeedFpm:number;groundSpeedKt:number;indicatedSpeedKt:number;onGround:boolean;parkingBrake:boolean};
};
const phases:BridgePhase[]=['Unknown','Parked','TaxiOut','TakeoffRoll','Climb','Cruise','Descent','Approach','Landing','TaxiIn'];
export const BRIDGE_PHASE_LABELS:Record<BridgePhase,string>={
 Unknown:'Noch nicht erkannt',Parked:'Am Stand',TaxiOut:'Rollen zum Start',TakeoffRoll:'Startlauf',
 Climb:'Steigflug',Cruise:'Reiseflug',Descent:'Sinkflug',Approach:'Anflug',Landing:'Landung',TaxiIn:'Rollen zum Stand'
};
export function parseBridgeSnapshot(raw:string,now:number):BridgeSnapshot {
 if(raw.length>120_000)throw Error('Bridge-Datei ist zu groß.');
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object')throw Error('Bridge-Snapshot fehlt.');
 const obj=value as Record<string,unknown>;
 const tele=obj.telemetry;
 if(obj.schemaVersion!==1||obj.source!=='msfs2024-simconnect-local'||
  !phases.includes(obj.phase as BridgePhase)||typeof obj.timestampUtc!=='string'||
  !tele||typeof tele!=='object')throw Error('Unerwartetes Bridge-Dateiformat.');
 const data=tele as Record<string,unknown>;
 for(const name of ['latitude','longitude','altitudeFt','aglFt','verticalSpeedFpm','groundSpeedKt','indicatedSpeedKt']){
  if(typeof data[name]!=='number'||!Number.isFinite(data[name]))throw Error('Ungültiger Messwert: '+name);
 }
 if(typeof data.onGround!=='boolean'||typeof data.parkingBrake!=='boolean'||
  Math.abs(data.latitude as number)>90||Math.abs(data.longitude as number)>180)throw Error('Bridge-Position oder Bodenstatus ungültig.');
 const age=now-Date.parse(obj.timestampUtc);
 if(!Number.isFinite(age)||age>10_000||age< -5_000)throw Error('Bridge-Snapshot veraltet oder die PC-Uhr stimmt nicht.');
 return value as BridgeSnapshot;
}
export function useLocalBridge(){
 const [directory,setDirectory]=useState<FileSystemDirectoryHandle|null>(null);
 const [snapshot,setSnapshot]=useState<BridgeSnapshot|null>(null);
 const [error,setError]=useState('');
 const [connectedAt,setConnectedAt]=useState<number|null>(null);
 const [clock,setClock]=useState(0);
 const lastSeen=useRef<string>('');
 const connected=directory!==null;
 const isLive=connected&&snapshot!==null;
 const connect=useCallback(async()=>{
  const picker=(window as Window & {showDirectoryPicker?:(
   options?:{mode?:'read'|'readwrite'}
  )=>Promise<FileSystemDirectoryHandle>}).showDirectoryPicker;
  if(typeof picker!=='function'){
   setError('Die sichere Ordnerverbindung wird hier nicht unterstützt. Verwende Edge oder Chrome am MSFS-PC.');
   return;
  }
  try{
   // Selecting one dedicated non-system directory avoids Chrome's AppData
   // restriction. Reacquire telemetry.json by its filename on each poll:
   // the Windows bridge updates the same telemetry file once per second.
   const selected=await picker({mode:'read'});
   await selected.getFileHandle('telemetry.json');
   setError('Verbinde lokale Bridge …');setSnapshot(null);setConnectedAt(null);lastSeen.current='';
   setDirectory(selected);
  }catch(err){
   if(err instanceof Error&&err.name==='AbortError')return;
   setError(err instanceof Error&&err.name==='NotFoundError'?'Im gewählten Ordner fehlt telemetry.json. Öffne den Datenordner über die Bridge und wähle genau diesen Ordner aus.':err instanceof Error?err.message:'Datenordner konnte nicht geöffnet werden.');
  }
 },[]);
 const disconnect=useCallback(()=>{
  setDirectory(null);setSnapshot(null);setError('');setConnectedAt(null);lastSeen.current='';
 },[]);
 useEffect(()=>{
  if(!directory)return;
  let closed=false;let reading=false;
  async function check(){
   if(closed||reading)return;
   reading=true;
   try{
    const fileHandle=await directory!.getFileHandle('telemetry.json');
    const file=await fileHandle.getFile();
    const value=parseBridgeSnapshot(await file.text(),Date.now());
    if(closed)return;
    setSnapshot(value);setError('');
    if(lastSeen.current!==value.timestampUtc){
     lastSeen.current=value.timestampUtc;
     setConnectedAt(old=>old??Date.now());
    }
    setClock(Date.now());
   }catch(err){
    if(closed)return;
    setSnapshot(null);
    setError(err instanceof Error?err.message:'Telemetrie kann nicht gelesen werden.');
    setClock(Date.now());
   }finally{reading=false;}
  }
  void check();
  const id=window.setInterval(()=>void check(),1000);
  return()=>{closed=true;window.clearInterval(id);};
 },[directory]);
 const elapsedMinutes=useMemo(()=>connectedAt&&isLive?Math.max(0,Math.floor((clock-connectedAt)/60_000)):0,[connectedAt,isLive,clock]);
 return {connect,disconnect,snapshot,connected,isLive,error,elapsedMinutes};
}
