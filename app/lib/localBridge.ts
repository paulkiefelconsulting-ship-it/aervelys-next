'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {bridgeLinkStatus} from './bridgeLinkHealth';

export type BridgePhase='Unknown'|'Parked'|'TaxiOut'|'TakeoffRoll'|'Climb'|'Cruise'|'Descent'|'Approach'|'Landing'|'TaxiIn';
export type BridgeSnapshot={
 schemaVersion:1;source:'msfs2024-simconnect-local';timestampUtc:string;phase:BridgePhase;flightStartedAtUtc?:string|null;
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
 if(obj.flightStartedAtUtc!==undefined&&obj.flightStartedAtUtc!==null){
  if(typeof obj.flightStartedAtUtc!=='string'||!Number.isFinite(Date.parse(obj.flightStartedAtUtc))||
   Date.parse(obj.flightStartedAtUtc)>Date.parse(obj.timestampUtc)+5_000||
   Date.parse(obj.timestampUtc)-Date.parse(obj.flightStartedAtUtc)>48*3600_000)
   throw Error('Ungültige oder unplausible Startzeit in der Bridge-Datei.');
 }
 const age=now-Date.parse(obj.timestampUtc);
 if(!Number.isFinite(age)||age>10_000||age< -5_000)throw Error('Bridge-Snapshot veraltet oder die PC-Uhr stimmt nicht.');
 return value as BridgeSnapshot;
}
export function useLocalBridge(){
 const [directory,setDirectory]=useState<FileSystemDirectoryHandle|null>(null);
 const [snapshot,setSnapshot]=useState<BridgeSnapshot|null>(null);
 const [error,setError]=useState('');
 const [connectedAt,setConnectedAt]=useState<number|null>(null);
 const [linked,setLinked]=useState(false);
 const [lastGoodReadAt,setLastGoodReadAt]=useState(0);
 const lastGoodReadRef=useRef(0);
 const [clock,setClock]=useState(0);
 const lastSeen=useRef<string>('');
 const connected=directory!==null;
 const rawStatus=bridgeLinkStatus(connected,linked,lastGoodReadAt,clock);
 const isLive=rawStatus==='live'&&snapshot!==null&&Math.abs(clock-Date.parse(snapshot.timestampUtc))<=10_000;
 const status=linked&&!isLive&&connected?'interrupted':rawStatus;
 // A committed tracking session never falls back to DEMO until manually disconnected.
 const sessionActive=connected&&linked;
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
   setError('Verbinde lokale Bridge …');setSnapshot(null);setConnectedAt(null);setLinked(false);setLastGoodReadAt(0);lastGoodReadRef.current=0;lastSeen.current='';
   setDirectory(selected);
  }catch(err){
   if(err instanceof Error&&err.name==='AbortError')return;
   setError(err instanceof Error&&err.name==='NotFoundError'?'Im gewählten Ordner fehlt telemetry.json. Öffne den Datenordner über die Bridge und wähle genau diesen Ordner aus.':err instanceof Error?err.message:'Datenordner konnte nicht geöffnet werden.');
  }
 },[]);
 const disconnect=useCallback(()=>{
  setDirectory(null);setSnapshot(null);setError('');setConnectedAt(null);setLinked(false);setLastGoodReadAt(0);lastGoodReadRef.current=0;lastSeen.current='';
 },[]);
 useEffect(()=>{
  if(!directory)return;
  let closed=false;let reading=false;
  async function check(){
   if(closed||reading)return;
   reading=true;
   try{
    let value:BridgeSnapshot|null=null;
    let readError:unknown=null;
    // The bridge rewrites the JSON in-place to retain browser file permission.
    // A read may land in the middle of a write; retry without losing live state.
    for(let attempt=0;attempt<3&&!closed;attempt++){
     try{
      const fileHandle=await directory!.getFileHandle('telemetry.json');
      const file=await fileHandle.getFile();
      value=parseBridgeSnapshot(await file.text(),Date.now());
      break;
     }catch(e){
      readError=e;
      if(attempt<2)await new Promise<void>(resolve=>window.setTimeout(resolve,120));
     }
    }
    if(closed)return;
    const now=Date.now();
    if(value){
     setSnapshot(value);
     setLinked(true);
     setError('');
     if(lastSeen.current!==value.timestampUtc){
      lastSeen.current=value.timestampUtc;
      lastGoodReadRef.current=now;
      setLastGoodReadAt(now);
      setConnectedAt(old=>old??now);
     }
    }else if(!lastGoodReadRef.current||now-lastGoodReadRef.current>3500){
     setError(readError instanceof Error?readError.message:'Telemetrie kann vorübergehend nicht gelesen werden.');
    }
    setClock(now);
   }catch(err){
    if(closed)return;
    // Keep the last valid telemetry and tracked-flight identity even on errors.
    const now=Date.now();
    if(!lastGoodReadRef.current||now-lastGoodReadRef.current>3500)
     setError(err instanceof Error?err.message:'Telemetrie kann vorübergehend nicht gelesen werden.');
    setClock(now);
   }finally{reading=false;}
  }
  void check();
  const id=window.setInterval(()=>void check(),1000);
  return()=>{closed=true;window.clearInterval(id);};
 },[directory]);
 // Do not claim a real airborne duration if the bridge was connected mid-flight.
 // For old bridge snapshots without flightStartedAtUtc use "since live link".
 const hasObservedTakeoff=Boolean(snapshot?.flightStartedAtUtc);
 const elapsedBasis:'takeoff'|'connection'=hasObservedTakeoff?'takeoff':'connection';
 const elapsedMinutes=useMemo(()=>{
  if(!sessionActive||!snapshot)return 0;
  const start=hasObservedTakeoff?Date.parse(snapshot.flightStartedAtUtc!):(connectedAt??clock);
  return Math.max(0,Math.floor((Date.parse(snapshot.timestampUtc)-start)/60_000));
 },[sessionActive,snapshot,hasObservedTakeoff,connectedAt,clock]);
 return {connect,disconnect,snapshot,connected,isLive,status,sessionActive,error,elapsedMinutes,elapsedBasis};
}
