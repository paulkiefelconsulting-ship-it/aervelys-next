'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// This preload is only used for packaged local.html, never for any remote content.
// Main process independently validates frame, request fields, and sender origin.
contextBridge.exposeInMainWorld('AERVELYS_LOCAL',Object.freeze({
 snapshot:()=>ipcRenderer.invoke('local:snapshot'),
 renamePilot:(name)=>ipcRenderer.invoke('local:renamePilot',name),
 addMission:(data)=>ipcRenderer.invoke('local:addMission',data),
 startBridge:()=>ipcRenderer.invoke('local:startBridge'),
 stopBridge:()=>ipcRenderer.invoke('local:stopBridge'),
 openCloud:()=>ipcRenderer.invoke('local:openCloud')
}));
