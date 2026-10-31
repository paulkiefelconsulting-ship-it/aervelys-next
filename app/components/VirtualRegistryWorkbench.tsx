'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {ClipboardCheck,RefreshCw,ShieldAlert} from 'lucide-react';
import styles from './VirtualRegistryWorkbench.module.css';

type Aircraft={id:string;registration:string;aircraft_type:string;operational_status:string;seats:number|null;range_nm:number|null;cost_hour_eur:number|null;source_reference:string|null;profile_status:string};
type Pilot={id:string;full_name:string;role:'PIC'|'SIC';hours_status:string;total_hours:number|null;pic_hours:number|null;hours_source:string|null};
type Qualification={person_id:string;aircraft_type:string;role:string;valid_until:string;verified:boolean};
type Proposal={id:number;subject_kind:'aircraft_profile'|'pilot_type_rating';subject_id:string;subject_label:string;target_key:string;proposal_data:Record<string,unknown>;source_reference:string;status:'submitted'|'approved'|'rejected';submitted_at:string;reviewed_at:string|null;review_note:string|null};
type Snapshot={aircraft:Aircraft[];pilots:Pilot[];types:string[];qualifications:Qualification[];proposals:Proposal[];can_review:boolean;simulation_only:true;operational_approval:false;source_review_required:true};
type Ack={proposal_id:number;status:'submitted';facts_verified:false;simulation_only:true;operational_approval:false};
type ReviewAck={reviewed:true;approved:boolean;source_registered:boolean;simulation_only:true;operational_approval:false;flights_released:0};
type HoursAck={person_id:string;status:'reported';type_rating_approved:false;source_verified_independently:false};
type HoursReviewAck={person_id:string;internal_hours_verified:true;type_rating_approved:false;licenses_issued:false};
const when=(value:string|null)=>{
 if(!value)return '—';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'—';
};
function supa(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase fehlt');
 return createBrowserClient(url,key);
}
export default function VirtualRegistryWorkbench(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [section,setSection]=useState<'aircraft'|'rating'|'hours'>('aircraft');
 const [aircraftId,setAircraftId]=useState('');
 const [personId,setPersonId]=useState('');
 const [type,setType]=useState('');
 const [seats,setSeats]=useState('');
 const [range,setRange]=useState('');
 const [hourCost,setHourCost]=useState('');
 const [source,setSource]=useState('');
 const [dateFrom,setDateFrom]=useState('');
 const [dateUntil,setDateUntil]=useState('');
 const [totalHours,setTotalHours]=useState('');
 const [picHours,setPicHours]=useState('');
 const [reviewId,setReviewId]=useState<number>(0);
 const [reviewNote,setReviewNote]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const reload=useCallback(async()=>{
  setLoading(true);
  try{
   const r=await supa().rpc('aervelys_registry_proposals_overview');
   const p=r.data as Snapshot|null;
   if(r.error||!p||!Array.isArray(p.aircraft)||!Array.isArray(p.pilots)||
     !Array.isArray(p.proposals)||!Array.isArray(p.types)||!Array.isArray(p.qualifications)||
     p.simulation_only!==true||p.operational_approval!==false||
     p.source_review_required!==true||typeof p.can_review!=='boolean')
    throw new Error('Ungültige SIM-Fachregisterdaten');
   setData(p);
   setAircraftId(prev=>p.aircraft.some(a=>a.id===prev)?prev:p.aircraft[0]?.id||'');
   setPersonId(prev=>p.pilots.some(a=>a.id===prev)?prev:p.pilots[0]?.id||'');
   setType(prev=>p.types.includes(prev)?prev:p.types[0]||'');
   setReviewId(prev=>p.proposals.some(v=>v.id===prev&&v.status==='submitted')?prev:
     p.proposals.find(v=>v.status==='submitted')?.id||0);
   setError('');
  }catch{
   setData(null);setError('Fachregister nicht erreichbar. Bitte CEO-/OPS-Rolle und Supabase prüfen.');
  }finally{setLoading(false);}
 },[]);
 useEffect(()=>{void reload();},[reload]);
 const activeAircraft=data?.aircraft.find(a=>a.id===aircraftId);
 const activePilot=data?.pilots.find(p=>p.id===personId);
 const pending=data?.proposals.filter(p=>p.status==='submitted')||[];
 const selectedReview=pending.find(p=>p.id===reviewId)||pending[0]||null;
 const applied=(data?.proposals||[]).filter(x=>x.status!=='submitted').slice(0,8);
 const validSource=source.trim().length>=12&&source.trim().length<=350;
 const profileValid=Number.isInteger(Number(seats))&&Number(seats)>=1&&Number(seats)<=30&&
  Number(range)>=50&&Number(range)<=12000&&Number(hourCost)>=1&&Number(hourCost)<=100000&&
  seats!==''&&range!==''&&hourCost!==''&&validSource;
 const ratingValid=!!activePilot&&!!type&&!!dateFrom&&!!dateUntil&&
  dateFrom<=dateUntil&&validSource;
 const hoursValid=!!activePilot&&totalHours!==''&&picHours!==''&&
  Number(totalHours)>=0&&Number(totalHours)<=100000&&
  Number(picHours)>=0&&Number(picHours)<=Number(totalHours)&&
  Math.round(Number(totalHours)*10)===Number(totalHours)*10&&
  Math.round(Number(picHours)*10)===Number(picHours)*10&&validSource;
 const distinctTypes=useMemo(()=>data?.types||[],[data]);
 async function submit(){
  if(!data||busy||!validSource)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(section==='aircraft'){
    if(!profileValid||!activeAircraft)throw Error('Bitte vollständiges Profil angeben');
    const r=await supa().rpc('aervelys_registry_profile_submit',{
     p_aircraft_id:activeAircraft.id,p_seats:Number(seats),p_range_nm:Number(range),
     p_cost_hour_eur:Number(hourCost),p_source:source.trim()
    });
    const a=r.data as Ack|null;
    if(r.error||!a||a.status!=='submitted'||a.facts_verified!==false||
      a.operational_approval!==false||a.simulation_only!==true)throw Error('Vorschlag konnte nicht bestätigt werden');
   }else if(section==='rating'){
    if(!ratingValid||!activePilot)throw Error('Bitte Piloten und Gültigkeit prüfen');
    const r=await supa().rpc('aervelys_registry_type_rating_submit',{
     p_person_id:activePilot.id,p_aircraft_type:type,p_role:activePilot.role,
     p_valid_from:dateFrom,p_valid_until:dateUntil,p_source:source.trim()
    });
    const a=r.data as Ack|null;
    if(r.error||!a||a.status!=='submitted'||a.facts_verified!==false||
     a.operational_approval!==false||a.simulation_only!==true)throw Error('Musterberechtigung nicht eingereicht');
   }else{
    if(!hoursValid||!activePilot||!data.can_review)throw Error('Nur CEO darf Logbucheinträge erfassen');
    const r=await supa().rpc('aervelys_virtual_pilot_hours_report',{
     p_person_id:activePilot.id,p_total_hours:Number(totalHours),
     p_pic_hours:Number(picHours),p_reference:source.trim()
    });
    const a=r.data as HoursAck|null;
    if(r.error||!a||a.status!=='reported'||a.type_rating_approved!==false||
      a.source_verified_independently!==false)throw Error('Stundenbericht nicht bestätigt');
   }
   setNotice(section==='hours'?'Flugstunden intern gemeldet, noch nicht bestätigt.':
    'Fachregistervorschlag gespeichert. Noch keine Verifizierung oder Einsatzfreigabe.');
   setSource('');setSeats('');setRange('');setHourCost('');setDateFrom('');setDateUntil('');
   setTotalHours('');setPicHours('');
   await reload();
  }catch(e){
   setError(e instanceof Error?e.message:'Fachregistereingabe fehlgeschlagen.');
  }finally{setBusy(false);}
 }
 async function review(approve:boolean){
  if(!selectedReview||!data?.can_review||busy||reviewNote.trim().length<15)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await supa().rpc('aervelys_registry_proposal_review',{
    p_proposal_id:selectedReview.id,p_approve:approve,p_review_note:reviewNote.trim()
   });
   const a=r.data as ReviewAck|null;
   if(r.error||!a||a.reviewed!==true||a.approved!==approve||
    a.source_registered!==approve||a.operational_approval!==false||
    a.flights_released!==0||a.simulation_only!==true)
    throw Error('CEO-Fachregisterprüfung fehlgeschlagen');
   setReviewNote('');
   setNotice(approve?'SIM-Fachregisterdaten nach CEO-Quellenprüfung übernommen. Keine Flugfreigabe.':
    'SIM-Fachregistervorschlag abgelehnt. Ursprüngliche Werte bleiben erhalten.');
   await reload();
  }catch(e){setError(e instanceof Error?e.message:'Prüfentscheidung nicht bestätigt.');}
  finally{setBusy(false);}
 }
 async function verifyHours(){
  if(!activePilot||busy||!data?.can_review||reviewNote.trim().length<15)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await supa().rpc('aervelys_virtual_pilot_hours_review',{
     p_person_id:activePilot.id,p_reference:reviewNote.trim()
   });
   const a=r.data as HoursReviewAck|null;
   if(r.error||!a||a.internal_hours_verified!==true||a.type_rating_approved!==false||
     a.licenses_issued!==false)throw Error('Interne Logbuchprüfung nicht bestätigt');
   setReviewNote('');setNotice('Flugstunden intern geprüft; keine Musterberechtigung oder Lizenz ausgestellt.');
   await reload();
  }catch(e){setError(e instanceof Error?e.message:'Interne Logbuchprüfung fehlgeschlagen.');}
  finally{setBusy(false);}
 }

 return <section className={'virtual-staff-block '+styles.root} aria-label="SIM-Fachregister-Editor">
  <div className={styles.heading}>
   <div>
    <div className="eyebrow">SOURCE REGISTRY / TWO-STAGE SIM REVIEW</div>
    <h3>Flotten- und Crew-Fachregister</h3>
    <p>Erfasse belegte Profildaten, Musterberechtigungen und interne Pilotenstunden. Die eigentliche Übernahme ins Fachregister erfolgt erst nach einer gesonderten CEO-Quellenprüfung.</p>
   </div>
   <button type="button" className="ops-refresh" disabled={busy||loading} onClick={()=>void reload()}>
    <RefreshCw size={15}/> Aktualisieren
   </button>
  </div>
  <div className={styles.guard}><ShieldAlert size={17}/><span>Nur fiktive NEXT-Unternehmensdaten. Selbst intern geprüfte Angaben ersetzen niemals Lizenzen, Lufttüchtigkeit, Versicherung, Medical, Duty-/Ruhezeit oder eine konkrete Flugfreigabe. Ohne echte Quellen bitte keine Werte als verifiziert bestätigen.</span></div>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {data&&<>
   <div className={styles.metrics}>
    <div><strong>{data.aircraft.length}</strong><span>Flugzeuge</span></div>
    <div><strong>{data.aircraft.filter(a=>a.profile_status==='verified').length}</strong><span>Geprüfte Profile</span></div>
    <div><strong>{data.pilots.length}</strong><span>Piloten</span></div>
    <div><strong>{data.qualifications.filter(q=>q.verified).length}</strong><span>Geprüfte Typberechtigungen</span></div>
    <div><strong>{pending.length}</strong><span>Offene Quellenprüfungen</span></div>
   </div>
   <div className={styles.tabs}>
    {([['aircraft','Flugzeugprofil'],['rating','Musterberechtigung'],['hours','Pilotenstunden']] as const).map(([key,label])=>
     <button type="button" key={key} aria-pressed={section===key}
      className={section===key?styles.active:''} onClick={()=>{setSection(key);setSource('');}}>
      {label}
     </button>)}
   </div>
   <div className={styles.columns}>
    <div className={styles.card}>
     <h4>{section==='aircraft'?'Flottenprofil vorschlagen':section==='rating'?'Typberechtigung zur Prüfung':'Virtuelles Logbuch'}</h4>
     {section==='aircraft'?<>
      <label htmlFor="reg-aircraft">Flugzeug</label>
      <select id="reg-aircraft" value={aircraftId} onChange={e=>setAircraftId(e.target.value)}>
       {data.aircraft.map(a=><option key={a.id} value={a.id}>{a.registration} · {a.aircraft_type}</option>)}
      </select>
      {activeAircraft&&<p className={styles.current}>Bisheriger Profilstatus: <strong>{activeAircraft.profile_status}</strong> · Betrieblicher Status: <strong>{activeAircraft.operational_status}</strong></p>}
      <div className={styles.three}>
       <div><label htmlFor="reg-seats">Passagiersitze</label>
        <input id="reg-seats" type="number" min={1} max={30} step={1} value={seats} onChange={e=>setSeats(e.target.value)} placeholder="1–30"/></div>
       <div><label htmlFor="reg-range">Reichweite (NM)</label>
        <input id="reg-range" type="number" min={50} max={12000} step={1} value={range} onChange={e=>setRange(e.target.value)} placeholder="z. B. 1800"/></div>
       <div><label htmlFor="reg-cost">Kosten je Blockstunde (€)</label>
        <input id="reg-cost" type="number" min={1} max={100000} step={1} value={hourCost} onChange={e=>setHourCost(e.target.value)} placeholder="EUR"/></div>
      </div>
     </>:<>
      <label htmlFor="reg-pilot">Pilot</label>
      <select id="reg-pilot" value={personId} onChange={e=>setPersonId(e.target.value)}>
       {data.pilots.map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.role}</option>)}
      </select>
      {section==='rating'?<>
       <label htmlFor="reg-type">Flugzeugmuster</label>
       <select id="reg-type" value={type} onChange={e=>setType(e.target.value)}>
        {distinctTypes.map(v=><option key={v} value={v}>{v}</option>)}
       </select>
       <div className={styles.two}>
        <div><label htmlFor="reg-from">Gültig ab</label>
         <input id="reg-from" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
        <div><label htmlFor="reg-until">Gültig bis</label>
         <input id="reg-until" type="date" value={dateUntil} onChange={e=>setDateUntil(e.target.value)}/></div>
       </div>
      </>:<>
       <p className={styles.current}>Gemeldeter Status: <strong>{activePilot?.hours_status||'fehlend'}</strong>. Gesamte Stunden: {activePilot?.total_hours??'—'}, PIC-Stunden: {activePilot?.pic_hours??'—'}.</p>
       <div className={styles.two}>
        <div><label htmlFor="reg-total">Gesamtstunden</label>
         <input id="reg-total" type="number" min={0} max={100000} step={0.1} value={totalHours} onChange={e=>setTotalHours(e.target.value)}/></div>
        <div><label htmlFor="reg-pic">PIC-Stunden</label>
         <input id="reg-pic" type="number" min={0} max={100000} step={0.1} value={picHours} onChange={e=>setPicHours(e.target.value)}/></div>
       </div>
      </>}
     </>}
     <label htmlFor="reg-source">Quellenreferenz (12–350 Zeichen)</label>
     <textarea id="reg-source" rows={3} maxLength={350} value={source} onChange={e=>setSource(e.target.value)}
      placeholder="Konkrete interne Dokumentennummer und Herkunft der geprüften Zahlen"/>
     <button type="button" className="ops-refresh" disabled={busy||loading||
      (section==='aircraft'?!profileValid:section==='rating'?!ratingValid:!hoursValid||!data.can_review)}
      onClick={()=>void submit()}>
      {section==='hours'?'Stunden intern melden':'Nur als Vorschlag einreichen'}
     </button>
     {section==='hours'&&activePilot?.hours_status==='reported'&&data.can_review&&
      <div className={styles.reviewHours}>
       <p>Bestehender Stundenbericht ist noch nicht geprüft. Verifikation erfordert einen separaten begründeten CEO-Vermerk.</p>
       <label htmlFor="reg-hours-review">CEO-Quellenprüfung (15–250 Zeichen)</label>
       <textarea id="reg-hours-review" rows={2} maxLength={250} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/>
       <button type="button" className="ops-refresh" disabled={busy||reviewNote.trim().length<15||reviewNote.trim().length>250}
        onClick={()=>void verifyHours()}>Internes Logbuch prüfen (keine Lizenz)</button>
      </div>}
    </div>
    <div className={styles.card}>
     <h4>Offene CEO-Quellenprüfungen ({pending.length})</h4>
     {pending.length===0?<p className={styles.current}>Keine offenen Fachregistervorschläge. Die Daten können nur mit dokumentierter Quellenprüfung übernommen werden.</p>:<>
      <label htmlFor="reg-pending">Vorschlag auswählen</label>
      <select id="reg-pending" value={selectedReview?.id||0} onChange={e=>{setReviewId(Number(e.target.value));setReviewNote('');}}>
       {pending.map(p=><option key={p.id} value={p.id}>#{p.id} · {p.subject_label} · {p.subject_kind==='aircraft_profile'?'Flottenprofil':'Typberechtigung'}</option>)}
      </select>
      {selectedReview&&<>
       <div className={styles.proposal}>
        <strong>{selectedReview.subject_label}</strong>
        <small>{selectedReview.subject_kind==='aircraft_profile'?'Flugzeug-Leistungsprofil':'Musterberechtigung'} · {when(selectedReview.submitted_at)}</small>
        {Object.entries(selectedReview.proposal_data).map(([key,value])=>
         <p key={key}><span>{key}</span><strong>{String(value)}</strong></p>)}
        <p className={styles.sourceText}>Referenz: {selectedReview.source_reference}</p>
       </div>
       {data.can_review?<>
        <label htmlFor="reg-review-note">CEO-Nachweisprüfung (15–500 Zeichen)</label>
        <textarea id="reg-review-note" rows={3} maxLength={500} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
         placeholder="Welche Unterlage wurde geprüft, von wem und welche Gültigkeit wurde belegt?"/>
        <div className={styles.actions}>
         <button type="button" className="ops-refresh" disabled={busy||reviewNote.trim().length<15}
          onClick={()=>void review(true)}><ClipboardCheck size={14}/> Ins Fachregister übernehmen</button>
         <button type="button" className="ops-refresh" disabled={busy||reviewNote.trim().length<15}
          onClick={()=>void review(false)}>Ablehnen</button>
        </div>
       </>:<p className={styles.current}>Eine Quellenübernahme darf nur der CEO bestätigen.</p>}
      </>}
     </>}
     {applied.length>0&&<div className={styles.history}>
      <h5>Zuletzt geprüfte Anträge</h5>
      {applied.map(v=><p key={v.id}><strong>{v.subject_label}</strong> · {v.status==='approved'?'Intern bestätigt':'Abgelehnt'} · {when(v.reviewed_at)}</p>)}
     </div>}
    </div>
   </div>
  </>}
  {!data&&!error&&<p className={styles.current}>{loading?'Lade Fachregister …':'Noch keine Daten vorhanden.'}</p>}
 </section>;
}
