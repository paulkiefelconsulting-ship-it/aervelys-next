export type LatestSimbriefOfp={
 origin_icao:string;destination_icao:string;route_text:string;
 route_distance_nm:number;block_minutes:number;
 ofp_aircraft_registration:string|null;
 source_reference:string;retrieved_at:string;
 operational_verified:false;
};
type Rec=Record<string,unknown>;
const object=(v:unknown):Rec=>v&&typeof v==='object'&&!Array.isArray(v)?v as Rec:{};
const string=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const icao=(v:unknown)=>string(v).toUpperCase();
const finite=(v:unknown):number|null=>{
 const raw=string(v);
 if(!/^(?:\d{1,6})(?:\.\d{1,3})?$/.test(raw))return null;
 const n=Number(raw);
 return Number.isFinite(n)?n:null;
};
export function simbriefBlockMinutes(value:unknown):number|null{
 const s=string(value);
 const match=/^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
 if(!match)return null;
 const hours=Number(match[1]),minutes=Number(match[2]),seconds=Number(match[3]);
 if(hours>24||minutes>59||seconds>59)return null;
 const total=Math.ceil((hours*3600+minutes*60+seconds)/60);
 return total>=10&&total<=1440?total:null;
}
export function decodeLatestSimbrief(data:unknown,retrievedAt:string):LatestSimbriefOfp{
 const root=object(data);
 const fetchData=object(root.fetch);
 if(fetchData.status&&string(fetchData.status).toLowerCase()!=='success')
  throw Error('SimBrief meldet keinen gültigen OFP.');
 const origin=icao(object(root.origin).icao),destination=icao(object(root.destination).icao);
 const general=object(root.general),times=object(root.times);
 const route=string(general.route).replace(/\s+/g,' ').toUpperCase();
 const distance=finite(general.route_distance);
 const block=simbriefBlockMinutes(times.est_block);
 if(!/^[A-Z]{4}$/.test(origin)||!/^[A-Z]{4}$/.test(destination)||
   route.length<3||route.length>1500||distance===null||distance<1||distance>12000||
   block===null)throw Error('Der letzte SimBrief-OFP enthält nicht alle benötigten Strecken-/Blockzeitangaben.');
 const registration=string(object(root.aircraft).reg)||string(object(root.aircraft).registration);
 const param=object(root.params);
 const sourceRef='SimBrief JSON v2 latest OFP / '+origin+'-'+destination+
  ' / '+retrievedAt.slice(0,19)+' UTC'+
  (string(param.request_id)?' / '+string(param.request_id).slice(0,22):'');
 return {origin_icao:origin,destination_icao:destination,route_text:route,
  route_distance_nm:distance,block_minutes:block,
  ofp_aircraft_registration:registration.slice(0,30)||null,
  source_reference:sourceRef.slice(0,250),retrieved_at:retrievedAt,
  operational_verified:false};
}
