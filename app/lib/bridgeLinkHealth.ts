/** Pure state machine for noisy MSFS-to-browser local-file telemetry. */
export type BridgeLinkStatus='disconnected'|'connecting'|'live'|'interrupted';
export function bridgeLinkStatus(connected:boolean,linked:boolean,lastGoodReadAt:number,now:number,graceMs=6000):BridgeLinkStatus{
 if(!connected)return 'disconnected';
 if(!linked)return 'connecting';
 if(!lastGoodReadAt||!Number.isFinite(lastGoodReadAt)||!Number.isFinite(now))return 'interrupted';
 const age=now-lastGoodReadAt;
 return age>=0&&age<=graceMs?'live':'interrupted';
}
