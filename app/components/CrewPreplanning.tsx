'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowRight,CalendarClock,Plus,RefreshCw,Save,ShieldAlert,Trash2,Users} from 'lucide-react';

type RequestItem={request_id:string;request_code:string;origin_icao:string;destination_icao:string;requested_departure:string};
type DispatchDraft={request_id:string;aircraft_id:string;registration:string;estimated_block_minutes:number};
type Candidate={person_id:string;full_name:string;eligible:boolean;reasons:string[]};
type Leg={origin:string;destination:string;departure:string;arrival:string;purpose:'charter'|'positioning'};
type StoredLeg={origin:string;destination:string;departure:string;arrival:string;purpose:'charter'|'positioning'};
type CrewCheck={role:string;person_id:string;eligible:boolean;reasons:string[]};
type Review={
 status:string;request_code?:string;aircraft_id?:string;aircraft_registration?:string;
 requested_departure?:string;origin?:string;destination?:string;block_minutes?:number;
 draft?:{pic_id:string;sic_id:string;legs:StoredLeg[];note:string|null;updated_at:string;planning_status:string}|null;
 pic_candidates?:Candidate[];sic_candidates?:Candidate[];
 crew_checks?:CrewCheck[];rest_issues?:Array<string|{leg?:number;issue?:string;remaining_rest_minutes?:number}>;
 crew_policy_approved?:boolean;crew_approved:false;dispatch_approved:false;
};
const labels:Record<string,string>={
 policy_not_approved:'Betriebsrichtlinie nicht freigegeben',
 qualification_missing:'Musterberechtigung fehlt oder unbestätigt',
 absence:'Genehmigte Abwesenheit',
 duty_rest_conflict:'Konflikt mit Dienst-/Ruhezeit',
 flight_rest_conflict:'Konflikt mit bestehendem Flug',
 positioning_conflict:'Konflikt mit Positionierung',
 location_unconfirmed:'Meldeort nicht bestätigt',
 rest_below_provisional_minimum:'Vorläufige Mindestruhezeit unterschritten',
 overlapping_duty:'Überlappende Dienstzeiten',
 dispatch_aircraft_changed:'Ausgewähltes Flugzeug wurde geändert',
 route_discontinuity:'Die Teilstrecken sind nicht verbunden'
};
function readable(value:string){return labels[value]||value.replaceAll('_',' ');}
function localDate(value:string){
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,16);
}
function getClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase missing');
 return createBrowserClient(url,key);
}
function defaultLeg(r:RequestItem,d:DispatchDraft):Leg{
 const from=new Date(r.requested_departure);
 return {origin:r.origin_icao,destination:r.destination_icao,departure:localDate(r.requested_departure),
  arrival:localDate(new Date(from.getTime()+d.estimated_block_minutes*60000).toISOString()),purpose:'charter'};
}
export default function CrewPreplanning({initialRequestId}:{initialRequestId?:string}){
 const [requests,setRequests]=useState<RequestItem[]>([]);
 const [dispatches,setDispatches]=useState<DispatchDraft[]>([]);
 const [requestId,setRequestId]=useState('');
 const [review,setReview]=useState<Review|null>(null);
 const [pic,setPic]=useState('');
 const [sic,setSic]=useState('');
 const [legs,setLegs]=useState<Leg[]>([]);
 const [note,setNote]=useState('');
 const [loading,setLoading]=useState(true);
 const [reviewing,setReviewing]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');

 const current=useMemo(()=>requests.find(r=>r.request_id===requestId),[requests,requestId]);
 const dispatch=useMemo(()=>dispatches.find(d=>d.request_id===requestId),[dispatches,requestId]);

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const c=getClient();
   const [a,b]=await Promise.all([c.rpc('aervelys_charter_requests_list'),c.rpc('aervelys_dispatch_plans_list')]);
   if(a.error||b.error||!Array.isArray(a.data)||!Array.isArray(b.data))throw Error('List failure');
   const r=a.data as RequestItem[];
   const d=b.data as DispatchDraft[];
   setRequests(r);setDispatches(d);
   const eligible=r.filter(x=>d.some(y=>y.request_id===x.request_id));
   setRequestId(prev=>initialRequestId&&eligible.some(x=>x.request_id===initialRequestId)?initialRequestId:
    prev&&eligible.some(x=>x.request_id===prev)?prev:(eligible[0]?.request_id||''));
  }catch{
   setError('Crew-Vorplanung konnte nicht geladen werden. Bitte CEO-/OPS-Rechte und Anmeldung prüfen.');
  }finally{setLoading(false);}
 },[initialRequestId]);

 useEffect(()=>{void load();},[load]);

 useEffect(()=>{
  if(!requestId)return;
  let active=true;
  setReview(null);setError('');setMessage('');setReviewing(true);
  const r=requests.find(x=>x.request_id===requestId);
  const d=dispatches.find(x=>x.request_id===requestId);
  if(r&&d){setLegs([defaultLeg(r,d)]);setPic('');setSic('');setNote('');}
  void (async()=>{
   try{
    const {data,error:rpcError}=await getClient().rpc('aervelys_crew_preplan_review',{p_request_id:requestId});
    if(!active)return;
    if(rpcError||!data||data.status!=='planning_only'){setError('Crewprüfung derzeit nicht verfügbar.');return;}
    const v=data as Review;
    setReview(v);
    if(v.draft){
     setPic(v.draft.pic_id);setSic(v.draft.sic_id);setNote(v.draft.note||'');
     setLegs(v.draft.legs.map(l=>({...l,departure:localDate(l.departure),arrival:localDate(l.arrival)})));
    }
   }catch{
    if(active)setError('Crewprüfung derzeit nicht verfügbar.');
   }finally{
    if(active)setReviewing(false);
   }
  })();
  return()=>{active=false;};
 },[requestId,requests,dispatches]);

 function patchLeg(index:number,field:keyof Leg,value:string){
  setLegs(old=>old.map((l,i)=>i===index?({...l,[field]:value} as Leg):l));
  setMessage('');
 }
 function addLeg(){
  if(legs.length>=6)return;
  const last=legs[legs.length-1];
  if(!last)return;
  const lastArrival=new Date(last.arrival);
  const next=Number.isNaN(lastArrival.getTime())?new Date():new Date(lastArrival.getTime()+14*60*60000);
  setLegs(old=>[...old,{origin:last.destination,destination:last.origin,departure:localDate(next.toISOString()),
   arrival:localDate(new Date(next.getTime()+2*60*60000).toISOString()),purpose:'positioning'}]);
 }
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');setMessage('');
  if(!current||!dispatch||!pic||!sic||pic===sic){setError('Bitte einen unterschiedlichen PIC und SIC auswählen.');return;}
  const isICAO=(x:string)=>/^[A-Z]{4}$/.test(x);
  for(let i=0;i<legs.length;i++){
   const l=legs[i],start=new Date(l.departure),end=new Date(l.arrival);
   if(!isICAO(l.origin)||!isICAO(l.destination)||l.origin===l.destination||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start){
    setError('Ungültiger Flughafen oder Zeitraum in Abschnitt '+(i+1)+'.');return;
   }
   if(i>0&&(l.origin!==legs[i-1].destination||new Date(l.departure)<new Date(legs[i-1].arrival))){
    setError('Abschnitt '+(i+1)+' muss am vorherigen Zielflughafen beginnen und zeitlich folgen.');return;
   }
  }
  setSaving(true);
  try{
   const payload=legs.map(l=>({...l,departure:new Date(l.departure).toISOString(),arrival:new Date(l.arrival).toISOString()}));
   const c=getClient();
   const {error:rpcError}=await c.rpc('aervelys_crew_preplan_save',{
    p_request_id:requestId,p_pic_id:pic,p_sic_id:sic,p_legs:payload,p_note:note.trim()||null
   });
   if(rpcError)throw rpcError;
   const result=await c.rpc('aervelys_crew_preplan_review',{p_request_id:requestId});
   if(!result.error&&result.data)setReview(result.data as Review);
   setMessage('Crew- und Routenentwurf gespeichert. Keine Crew reserviert, kein Flug freigegeben.');
  }catch{
   setError('Vorplanung konnte nicht gespeichert werden. Bitte ersten Charterabschnitt, Uhrzeit und Nachweise prüfen.');
  }finally{setSaving(false);}
 }

 return <section className="panel crew-planning">
  <div className="panelhead">
   <div className="eyebrow">CREW OPERATIONS / ROTATION PREPLANNING</div>
   <h2>Crew & Mehrflugrotationen</h2>
   <p className="lead">PIC/SIC und bis zu sechs Flugabschnitte vorplanen. Die Berechtigungs-, Ruhezeit- und Standortprüfung bleibt sichtbar.</p>
  </div>
  <div className="ops-warning"><ShieldAlert size={17}/><span>Die Crew-Betriebsrichtlinie ist nicht freigegeben. Dieser Bereich schreibt ausschließlich Planungsentwürfe, keine Crew-Einsätze oder Flüge.</span></div>
  <div className="crew-planning-toolbar">
   <label>Charteranfrage mit Dispositionsentwurf
    <select value={requestId} onChange={e=>setRequestId(e.target.value)} disabled={loading}>
     {requests.filter(r=>dispatches.some(d=>d.request_id===r.request_id)).length===0?<option value="">Noch keine Dispositionsentwürfe</option>:
      requests.filter(r=>dispatches.some(d=>d.request_id===r.request_id)).map(r=><option key={r.request_id} value={r.request_id}>{r.request_code} · {r.origin_icao} → {r.destination_icao}</option>)}
    </select>
   </label>
   <button type="button" className="ops-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Aktualisieren</button>
  </div>
  {loading&&<div className="ops-loading">Crew-Vorplanung wird geladen …</div>}
  {error&&<div className="charter-error crew-feedback" role="alert">{error}</div>}
  {message&&<div className="charter-success crew-feedback" role="status">{message}</div>}
  {!loading&&!dispatch&&<div className="ops-loading">Bitte zuerst unter Flugdisposition einen Flugzeugentwurf zu einer Charteranfrage speichern.</div>}
  {dispatch&&current&&<div className="crew-planning-content">
   <div className="crew-summary"><div><span>VORGANG</span><strong>{current.request_code}</strong></div><div><span>VORGESCHLAGENES FLUGZEUG</span><strong>{dispatch.registration}</strong></div><div><span>ERSTER ABFLUG</span><strong>{new Date(current.requested_departure).toLocaleString('de-DE')}</strong></div></div>
   <form className="crew-form" onSubmit={save}>
    <div className="crew-pilot-fields">
     <label>Pilot in Command (PIC)
      <select required value={pic} onChange={e=>setPic(e.target.value)} disabled={reviewing||!review}>
       <option value="">PIC auswählen</option>
       {(review?.pic_candidates||[]).map(p=><option key={p.person_id} value={p.person_id}>{p.full_name} · {p.eligible?'vorläufig geprüft':'Nachweise offen'}</option>)}
      </select>
     </label>
     <label>Second in Command (SIC)
      <select required value={sic} onChange={e=>setSic(e.target.value)} disabled={reviewing||!review}>
       <option value="">SIC auswählen</option>
       {(review?.sic_candidates||[]).map(p=><option key={p.person_id} value={p.person_id}>{p.full_name} · {p.eligible?'vorläufig geprüft':'Nachweise offen'}</option>)}
      </select>
     </label>
    </div>
    <div className="crew-qualification-grid">
     {(['PIC','SIC'] as const).map(role=>{
      const candidate=(role==='PIC'?review?.pic_candidates:review?.sic_candidates)?.find(x=>x.person_id===(role==='PIC'?pic:sic));
      return <div className="crew-qualification" key={role}><strong>{role} – {candidate?.full_name||'Noch nicht ausgewählt'}</strong>
       {!candidate?<span>Nachweise noch nicht ausgewählt</span>:candidate.reasons.length===0?<span>Basisprüfung bestanden, weitere Nachweise erforderlich</span>:
       candidate.reasons.map(reason=><span key={reason}>{readable(reason)}</span>)}
      </div>;
     })}
    </div>
    <div className="crew-legs-header"><div><div className="eyebrow">PROPOSED ROTATION</div><h3>Flugabschnitte ({legs.length}/6)</h3></div><button type="button" className="ops-refresh" onClick={addLeg} disabled={legs.length>=6||!legs.length}><Plus size={15}/> Abschnitt hinzufügen</button></div>
    <div className="crew-legs">{legs.map((leg,i)=><div className="crew-leg" key={i}>
     <div className="crew-leg-top"><strong><CalendarClock size={16}/> Abschnitt {i+1}</strong>{i>0&&<button type="button" className="crew-remove" onClick={()=>setLegs(old=>old.filter((_,n)=>n!==i))} aria-label={'Abschnitt '+(i+1)+' entfernen'}><Trash2 size={16}/></button>}</div>
     <div className="crew-leg-fields">
      <label>Start ICAO<input required maxLength={4} value={leg.origin} onChange={e=>patchLeg(i,'origin',e.target.value.toUpperCase())} readOnly={i===0}/></label>
      <label>Ziel ICAO<input required maxLength={4} value={leg.destination} onChange={e=>patchLeg(i,'destination',e.target.value.toUpperCase())} readOnly={i===0}/></label>
      <label>Abflug (Ortszeit)<input required type="datetime-local" value={leg.departure} onChange={e=>patchLeg(i,'departure',e.target.value)}/></label>
      <label>Ankunft (Ortszeit)<input required type="datetime-local" value={leg.arrival} onChange={e=>patchLeg(i,'arrival',e.target.value)}/></label>
      <label>Abschnittstyp<select value={leg.purpose} disabled={i===0} onChange={e=>patchLeg(i,'purpose',e.target.value)}><option value="charter">Charter</option><option value="positioning">Positionierung</option></select></label>
     </div>
    </div>)}</div>
    <label>Notiz zur Crew- und Routenplanung<textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Meldeort, Hotel, Standby, offene Crewqualifikationen …"/></label>
    <div className="dispatch-blocked"><ShieldAlert size={17}/> Jede Speicherung bleibt „Nachweise offen“. Keine operative Reservierung.</div>
    <button type="submit" className="charter-submit" disabled={saving||reviewing||!review}><Save size={16}/>{saving?'Wird gespeichert …':'Crew- und Rotationsentwurf speichern'}</button>
   </form>
   {review?.draft&&<div className="crew-review-summary"><div className="eyebrow">SAVED PLAN / REVIEW</div>
    <h3><Users size={18}/> Gespeicherte Crewprüfung</h3>
    <p>Status: {review.draft.planning_status} · letzte Änderung {new Date(review.draft.updated_at).toLocaleString('de-DE')}</p>
    <p>Richtlinie freigegeben: <strong>{review.crew_policy_approved?'Ja':'Nein'}</strong> · Crewfreigabe: <strong>Nein</strong></p>
    {(review.crew_checks||[]).map(c=><div className="crew-check" key={c.role}><strong>{c.role}: {c.eligible?'Basisprüfung ohne Treffer':'Nachweise offen'}</strong><span>{c.reasons.map(readable).join(' · ')||'Weitere Betriebsnachweise bleiben erforderlich'}</span></div>)}
    {(review.rest_issues||[]).length>0&&<div className="crew-rest-issues"><strong>Prüfhinweise für die gesamte Rotation</strong>
     {review.rest_issues?.map((v,i)=><p key={i}>{typeof v==='string'?readable(v):'Abschnitt '+v.leg+': '+readable(v.issue||'')+(v.remaining_rest_minutes!==undefined?' ('+Math.round(v.remaining_rest_minutes)+' min nach Vor-/Nachbereitung)':'')}</p>)}
    </div>}
    <p><ShieldAlert size={14}/> Ruhezeiten sind eine konservative Simulation und keine rechtliche Dienstzeitfreigabe.</p>
   </div>}
  </div>}
 </section>;
}
