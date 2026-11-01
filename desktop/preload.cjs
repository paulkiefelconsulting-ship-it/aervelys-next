'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// This preload is only used for packaged local.html, never for any remote content.
// Main process independently validates frame, request fields, and sender origin.
contextBridge.exposeInMainWorld('AERVELYS_LOCAL',Object.freeze({
 snapshot:()=>ipcRenderer.invoke('local:snapshot'),
 createPilot:(data)=>ipcRenderer.invoke('local:pilotCreate',data),
 selectPilot:(id)=>ipcRenderer.invoke('local:pilotSelect',id),
 backupPilots:()=>ipcRenderer.invoke('local:backup'),
 restorePilots:()=>ipcRenderer.invoke('local:restore'),
 renamePilot:(name)=>ipcRenderer.invoke('local:renamePilot',name),
 addMission:(data)=>ipcRenderer.invoke('local:addMission',data),
 marketList:()=>ipcRenderer.invoke('local:marketList'),
 marketAccept:(id)=>ipcRenderer.invoke('local:marketAccept',id),
 marketRefresh:()=>ipcRenderer.invoke('local:marketRefresh'),
 marketCancel:(id)=>ipcRenderer.invoke('local:marketCancel',id),
 trainingPlan:(type)=>ipcRenderer.invoke('local:trainingPlan',type),
 startBridge:()=>ipcRenderer.invoke('local:startBridge'),
 stopBridge:()=>ipcRenderer.invoke('local:stopBridge'),
 openCloud:()=>ipcRenderer.invoke('local:openCloud')
}));
