'use client';

import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ArrowRight,ClipboardList,RefreshCw,ShieldAlert,Plane,Clock3,Save} from 'lucide-react';

type RequestItem={request_id:string;request_code:string;origin_icao:string;destination_icao:string;requested_departure:string;passengers:number;request_status:string};
type Aircraft={id:string;registration:string;aircraft_type:string;current_icao:string;operational_status:string};
type Candidate={registration:string;aircraft_type:string;current_icao:string|null;positioning_needed:boolean;conflicting_flights:number;dispatch_status:string;reasons:string[]};
type Review={request_id:string;request_code:string;origin:string;destination:string;departure:string;estimated_block_minutes:number;aircraft_candidates:Candidate[];dispatch_evidence?:{integrated_dispatch_review?:{issues?:string[];status?:string}};dispatch_approved:boolean;notice:string};
type Draft={id:string;request_id:string;request_code:string;aircraft_id:string;registration:string;origin:string;destination:string;requested_departure:string;estimated_block_minutes:number;coordinator_note:string|null;planning_status:string;updated_at:string};

function supabaseClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase environment is not configured.');
 return createBrowserClient(url,key);
}
function dateText(value:string){
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
const readableReasons:Record<string,string>={
 aircraft_unavailable:'Flugzeug noch nicht freigegeben',
 positioning_required:'Positionierungsflug erforderlich',
 aircraft_schedule_conflict:'Flugplan-Konflikt',
 crew_maintenance_performance_checks_pending:'Crew, Wartung und Leistungsdaten nicht abschließend geprüft'
};
export default function DispatchWorkbench({initialRequestId,onOpenCrew}:{initialRequestId?:string;onOpenCrew:(requestId:string)=>void}){
 const [requests,setRequests]=useState<RequestItem[]>([]);
 const [fleet,setFleet]=useState<Aircraft[]>([]);
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [requestId,setRequestId]=useState('');
 const [aircraftId,setAircraftId]=useState('');
 const [blockMinutes,setBlockMinutes]=useState('120');
 const [note,setNote]=useState('');
 const [review,setReview]=useState<Review|null>(null);
 const [loading,setLoading]=useState(true);
 const [checking,setChecking]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selectedDraft,setSelectedDraft]=useState<string|null>(null);

 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const c=supabaseClient();
   const [req,planes,draft]=await Promise.all([
    c.rpc('aervelys_charter_requests_list'),
    c.rpc('aervelys_fleet_roster'),
    c.rpc('aervelys_dispatch_plans_list')
   ]);
   if(req.error||planes.error||draft.error||!Array.isArray(req.data)||!Array.isArray(planes.data)||!Array.isArray(draft.data)){
    throw new Error('Missing access or unexpected data');
   }
   setRequests(req.data as RequestItem[]);
   setFleet(planes.data as Aircraft[]);
   setDrafts(draft.data as Draft[]);
   setRequestId(old=>initialRequestId&&req.data.some((r:RequestItem)=>r.request_id===initialRequestId)
    ?initialRequestId:old&&req.data.some((r:RequestItem)=>r.request_id===old)?old:(req.data[0]?.request_id||''));
  }catch{
   setError('Dispositionsdaten nicht abrufbar. Bitte Anmeldung, Rollenrechte und Supabase prüfen.');
  }finally{setLoading(false);}
 },[initialRequestId]);

 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
  const draft=drafts.find(d=>d.request_id===requestId);
  setAircraftId(draft?.aircraft_id||'');
  setBlockMinutes(draft?String(draft.estimated_block_minutes):'120');
  setNote(draft?.coordinator_note||'');
  setSelectedDraft(draft?.id||null);
  setReview(null);setNotice('');
 },[requestId]);

 const selectedRequest=requests.find(r=>r.request_id===requestId);
 const currentDraft=drafts.find(d=>d.request_id===requestId);
 const minutes=Number(blockMinutes);
 const canReview=!!selectedRequest&&Number.isInteger(minutes)&&minutes>=1&&minutes<=1440;
 const checkedCurrent=review?.request_id===requestId&&review?.estimated_block_minutes===minutes;
 const candidateFleet=new Map(fleet.map(a=>[a.registration,a]));

 async function screen(){
  if(!canReview)return;
  setChecking(true);setError('');setNotice('');setReview(null);
  try{
   const {data,error:rpcError}=await supabaseClient().rpc('aervelys_dispatch_review',{p_request_id:requestId,p_block_minutes:minutes});
   if(rpcError||!data||!Array.isArray(data.aircraft_candidates))throw new Error('Review failed');
   setReview(data as Review);
  }catch{
   setError('Die Dispositionsprüfung konnte nicht ausgeführt werden. Bitte den Vorgang prüfen.');
  }finally{setChecking(false);}
 }

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setNotice('');
  if(!checkedCurrent||!aircraftId||!canReview){setError('Bitte erst Flugzeug und Dauer prüfen.');return;}
  if(note.length>2000){setError('Notiz darf höchstens 2000 Zeichen enthalten.');return;}
  setSaving(true);
  try{
   const c=supabaseClient();
   const {data,error:rpcError}=await c.rpc('aervelys_dispatch_draft_save',{
    p_request_id:requestId,p_aircraft_id:aircraftId,p_block_minutes:minutes,p_note:note.trim()||null
   });
   if(rpcError||!data)throw new Error('Save failed');
   setNotice('Dispositionsentwurf gespeichert: '+String(data.registration)+'. Kein Flug und keine Crew wurde reserviert.');
   const plans=await c.rpc('aervelys_dispatch_plans_list');
   if(!plans.error&&Array.isArray(plans.data))setDrafts(plans.data as Draft[]);
  }catch{
   setError('Entwurf konnte nicht gespeichert werden. Bitte prüfen, ob die Anfrage noch offen ist.');
  }finally{setSaving(false);}
 }

 return <div className="dispatch-workspace">
  <section className="panel dispatch-review">
   <div className="panelhead">
    <div className="eyebrow">FLIGHT OPS / PRE-DISPATCH</div><h2>Flugdisposition</h2>
    <p className="lead">Vorläufige Machbarkeitsprüfung für einen Chartervorgang – keine Reservierung und keine Betriebsfreigabe.</p>
   </div>
   <div className="ops-warning"><ShieldAlert size={17}/><span>Alle Flugzeuge stehen im Onboarding. Diese Prüfung liefert deshalb <strong>keine freigegebenen Jets</strong>.</span></div>
   <div className="dispatch-form">
    <label>Chartervorgang
     <select value={requestId} disabled={loading} onChange={e=>setRequestId(e.target.value)}>
      {requests.length===0?<option value="">Noch keine Charteranfrage erfasst</option>:requests.map(r=><option key={r.request_id} value={r.request_id}>{r.request_code}: {r.origin_icao} → {r.destination_icao}</option>)}
     </select>
    </label>
    {selectedRequest&&<div className="dispatch-route"><div><span>STRECKE</span><strong>{selectedRequest.origin_icao} <ArrowRight size={18}/> {selectedRequest.destination_icao}</strong></div><div><span>GEWÜNSCHTER ABFLUG</span><strong>{dateText(selectedRequest.requested_departure)}</strong></div><div><span>PASSAGIERE</span><strong>{selectedRequest.passengers}</strong></div></div>}
    <label>Geschätzte Blockzeit (Minuten)
     <input type="number" value={blockMinutes} min={1} max={1440} onChange={e=>{setBlockMinutes(e.target.value);setReview(null);}}/>
    </label>
    <button className="charter-submit" type="button" disabled={!canReview||checking||loading} onClick={()=>void screen()}>
     <RefreshCw size={16}/> {checking?'Prüfung läuft …':'Alle Flugzeuge prüfen'}
    </button>
    {error&&<p className="charter-error" role="alert">{error}</p>}
    {notice&&<p className="charter-success" role="status">{notice}</p>}
    {loading&&<p className="lead">Lade Dispositionsdaten …</p>}
    {!loading&&requests.length===0&&!error&&<div className="charter-offer-empty">Noch keine Anfrage vorhanden. Erstelle zuerst einen Vorgang unter Charter & Angebote.</div>}
   </div>
   {review&&checkedCurrent&&<div className="dispatch-results">
    <div className="eyebrow">AIRCRAFT SCREENING</div><h3>Prüfergebnis für {review.request_code}</h3>
    <p className="dispatch-blocked"><ShieldAlert size={17}/> Einsatzfreigabe: NICHT ERTEILT</p>
    <div className="dispatch-candidates">{review.aircraft_candidates.map(c=><article key={c.registration} className="dispatch-candidate">
     <div className="charter-item-top"><strong><Plane size={15}/> {c.registration}</strong><span className="pill">{c.dispatch_status}</span></div>
     <p>{c.aircraft_type} · Standort {c.current_icao||'—'}</p>
     <p>{c.conflicting_flights} bekannte Flugplankonflikte</p>
     <div className="dispatch-reasons">{c.reasons.length===0?<span>Weitergehende Prüfung erforderlich</span>:c.reasons.map(reason=><span key={reason}>{readableReasons[reason]||reason.replaceAll('_',' ')}</span>)}</div>
    </article>)}</div>
    {review.dispatch_evidence?.integrated_dispatch_review?.issues?.length?<div className="dispatch-evidence"><strong>Offene Dispatch-Nachweise</strong><p>{review.dispatch_evidence.integrated_dispatch_review.issues.map(i=>i.replaceAll('_',' ')).join(' · ')}</p></div>:null}
   </div>}
  </section>
  <section className="panel dispatch-draft">
   <div className="panelhead"><div className="eyebrow">PLANNING / UNCOMMITTED</div><h2>Dispositionsentwurf</h2><p className="lead">Ein Flugzeug als Planungsoption vormerken. Es wird keine Flugbuchung erzeugt.</p></div>
   <form className="charter-form" onSubmit={save}>
    <label>Vorgesehenes Flugzeug
     <select value={aircraftId} onChange={e=>setAircraftId(e.target.value)} disabled={!checkedCurrent||!fleet.length}>
      <option value="">Flugzeug auswählen</option>
      {review?.aircraft_candidates.map(c=>{
       const a=candidateFleet.get(c.registration);
       return a?<option key={a.id} value={a.id}>{a.registration} · {a.aircraft_type} ({c.dispatch_status})</option>:null;
      })}
     </select>
    </label>
    <label>Notiz für OPS
     <textarea rows={4} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Positionierungsbedarf, offene Genehmigungen, Crewplanung …"/>
    </label>
    <div className="dispatch-blocked"><ShieldAlert size={17}/> Status bleibt „Entwurf gesperrt“ bis zur vollständigen Prüfung.</div>
    <button className="charter-submit" type="submit" disabled={!checkedCurrent||!aircraftId||saving}><Save size={16}/>{saving?'Speichern …':'Entwurf speichern'}</button>
    {currentDraft&&<p className="dispatch-saved"><Clock3 size={15}/> Bestehender Entwurf: {currentDraft.registration} · {currentDraft.estimated_block_minutes} Min. · {dateText(currentDraft.updated_at)}</p>}
   </form>
   {currentDraft&&<div className="dispatch-nextstep"><strong>Nächster Schritt</strong><p>Plane PIC, SIC und mehrteilige Flugroute. Die Crewfreigabe bleibt offen.</p><button type="button" className="charter-open-inbox" onClick={()=>onOpenCrew(requestId)}>Crew-Vorplanung öffnen <ArrowRight size={16}/></button></div>}
   <div className="dispatch-draft-list"><div className="eyebrow">SAVED PLANNING DRAFTS</div><h3>Gespeicherte Entwürfe ({drafts.length})</h3>
    {drafts.length===0?<p>Keine Dispositionsentwürfe vorhanden.</p>:drafts.map(d=><button className={'dispatch-saved-item '+(selectedDraft===d.id?'active':'')} key={d.id} type="button" onClick={()=>setRequestId(d.request_id)}>
     <span><ClipboardList size={16}/> {d.request_code} · {d.registration}</span><small>Nur Planung · {dateText(d.updated_at)}</small>
    </button>)}
   </div>
  </section>
 </div>;
}
