'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {BookOpen,CalendarDays,CheckCircle2,Clock3,HardHat,
 Plane,Plus,RefreshCw,ShieldAlert,ShieldCheck,Users} from 'lucide-react';
import styles from './V2OperationsFoundation.module.css';

type Person={id:string;name:string;department:string;role:string;pilot_role:string|null;active:boolean;
 monthly_salary_eur:number;qualifications_verified:boolean};
type Aircraft={id:string;registration:string;type:string;home:string;location:string;
 operational_status:string;charter_released:boolean;charter_release_note:string};
type Training={id:string;person_id:string;title:string;category:string;start:string;end:string;
 cost_eur:number|null;status:string;notes:string};
type Duty={id:string;person_id:string;kind:string;start:string;end:string;
 status:string;base:string|null;notes:string};
type Facility={id:string;title:string;kind:string;status:string;site:string;
 monthly_rent_eur:number|null;planned_capex_eur:number|null;notes:string};
type OpsSnapshot={simulation_only:true;company_exists:boolean;legacy_dispatch_integrated:false;
 legacy_roster_integrated:true;real_crew_qualifications_verified:false;
 property_purchase_executed:false;people:Person[];aircraft:Aircraft[];
 training:Training[];roster:Duty[];facilities:Facility[];
 active_v2_fleet:{registration:string;type:string;charter_release_status:string;hold_reason:string|null}[]};
type Tab='fleet'|'people'|'training'|'roster'|'facilities';
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Supabase nicht konfiguriert');
 return createBrowserClient(url,key);
}
const euro=(n:number|null|undefined)=>n===null||n===undefined?'Nicht hinterlegt':
 new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n));
const when=(s:string)=>Number.isFinite(Date.parse(s))?
 new Date(s).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'—';
function toIso(s:string){
 const d=new Date(s);
 if(!s||!Number.isFinite(d.getTime()))throw Error('Bitte ein gültiges Datum mit Uhrzeit wählen.');
 return d.toISOString();
}
function numeric(s:string){
 if(!s.trim())return null;
 const n=Number(s.replace(',','.'));
 if(!Number.isFinite(n)||n<0)throw Error('Ungültiger Betrag.');
 return n;
}
const categories=[['type_rating','Type Rating / Muster'],['recurrent','Wiederholungsschulung'],
 ['safety','Safety & Emergency'],['service','Cabin & Service'],
 ['leadership','Management'],['other','Sonstige Weiterbildung']];
const kinds=[['duty','Dienst'],['standby','Rufbereitschaft'],['leave','Urlaub'],
 ['training','Schulung'],['rest','Geplante Ruhezeit']];
const facilities=[['hangar','Hangar'],['office_extension','Büroerweiterung'],
 ['terminal','Terminal / Lounge'],['land','Grundstück / Fläche'],
 ['leased_office','Mieträume'],['leased_parking','Mietstellplätze'],['other','Sonstiges']];
export default function V2OperationsFoundation({initialTab='people'}:{initialTab?:Tab}){
 const [tab,setTab]=useState<Tab>(initialTab);
 const [snapshot,setSnapshot]=useState<OpsSnapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [person,setPerson]=useState('');
 const [trainingTitle,setTrainingTitle]=useState('');
 const [category,setCategory]=useState('recurrent');
 const [cost,setCost]=useState('');
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [dutyKind,setDutyKind]=useState('standby');
 const [base,setBase]=useState('EDAZ');
 const [projectTitle,setProjectTitle]=useState('');
 const [projectKind,setProjectKind]=useState('hangar');
 const [projectSite,setProjectSite]=useState('Standort noch zu prüfen');
 const [projectBudget,setProjectBudget]=useState('');
 const [projectRent,setProjectRent]=useState('');
 const [notes,setNotes]=useState('');
 const fetchOps=useCallback(async()=>{
  try{
   const r=await client().rpc('aervelys_v2_ops_overview');
   const v=r.data as OpsSnapshot|null;
   if(r.error||!v||v.simulation_only!==true||!Array.isArray(v.aircraft)||
      !Array.isArray(v.people)||!Array.isArray(v.training)||!Array.isArray(v.roster)||
      !Array.isArray(v.facilities)||!Array.isArray(v.active_v2_fleet))
    throw Error(r.error?.message||'Stammdaten nicht verfügbar');
   setSnapshot(v);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Abruf fehlgeschlagen');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void fetchOps();},[fetchOps]);
 const people=useMemo(()=>snapshot?.people.filter(p=>p.active)||[],[snapshot]);
 const personName=useCallback((id:string)=>snapshot?.people.find(p=>p.id===id)?.name||'Unbekannt',[snapshot]);
 const activePerson=person||people[0]?.id||'';
 const call=async(name:string,fn:string,params:Record<string,unknown>)=>{
  if(busy)return;
  setBusy(name);setError('');setNotice('');
  try{
   const r=await client().rpc(fn,params);
   const a=r.data as Record<string,unknown>|null;
   if(r.error||!a||a.created!==true)throw Error(r.error?.message||'Aktion nicht bestätigt');
   setNotice(name+' im SIM-Plan eingetragen. Keine reale Freigabe oder Buchung.');
   await fetchOps();
  }catch(e){setError(e instanceof Error?e.message:'Anlegen nicht möglich');}
  finally{setBusy('');}
 };
 async function addTraining(){
  try{
   await call('Schulung','aervelys_v2_training_add',{
    p_person_id:activePerson,p_title:trainingTitle.trim(),p_category:category,
    p_start:toIso(from),p_end:toIso(to),p_cost:numeric(cost),p_notes:notes.trim()});
  }catch(e){setError(e instanceof Error?e.message:'Ungültiges Datum');}
 }
 async function addDuty(){
  try{
   await call('Dienstplaneintrag','aervelys_v2_duty_add',{
    p_person_id:activePerson,p_kind:dutyKind,p_start:toIso(from),
    p_end:toIso(to),p_base:base.trim().toUpperCase()||null,p_notes:notes.trim()});
  }catch(e){setError(e instanceof Error?e.message:'Ungültiges Datum');}
 }
 async function addFacility(){
  try{
   await call('Bau-/Flächenvorhaben','aervelys_v2_facility_add',{
    p_title:projectTitle.trim(),p_kind:projectKind,
    p_site:projectSite.trim()||'Standort noch zu prüfen',
    p_capex:numeric(projectBudget),p_monthly_rent:numeric(projectRent),
    p_notes:notes.trim()});
  }catch(e){setError(e instanceof Error?e.message:'Ungültiger Betrag');}
 }
 const menu:{id:Tab;name:string;count:number}[]=[
  {id:'fleet',name:'Bestandsflotte',count:snapshot?.aircraft.length||0},
  {id:'people',name:'Team',count:snapshot?.people.length||0},
  {id:'training',name:'Weiterbildungen',count:snapshot?.training.length||0},
  {id:'roster',name:'Dienstplan & Standby',count:snapshot?.roster.length||0},
  {id:'facilities',name:'Flächen & Bauvorhaben',count:snapshot?.facilities.length||0}
 ];
 return <section className={styles.root} aria-label="AERVELYS Bestandsflotte, Personal und Entwicklungsplanung">
  <header className={styles.head}>
   <div><span className={styles.eyebrow}>AIRLINE MASTER DATA · YOUR EXISTING AERVELYS</span>
    <h3><ShieldCheck size={20}/> Operations Foundation</h3>
    <p>Deine vorhandenen AERVELYS-Flugzeuge und Mitarbeiter bleiben erhalten. Schulungen, Dienstpläne und Bauideen werden im V2-Unternehmen erfasst.</p>
   </div>
   <button type="button" className={styles.refresh} disabled={!!busy} onClick={()=>void fetchOps()}
    aria-label="Stammdaten aktualisieren"><RefreshCw size={16}/></button>
  </header>
  {error&&<p className={styles.error} role="alert"><ShieldAlert size={16}/>{error}</p>}
  {notice&&<p className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</p>}
  <div className={styles.tabs} role="group" aria-label="Operations-Bereiche">
   {menu.map(m=><button key={m.id} type="button" aria-pressed={tab===m.id}
     className={tab===m.id?styles.tabActive:styles.tab}
     onClick={()=>{setTab(m.id);setError('');setNotice('');}}>
    {m.name}<span>{m.count}</span></button>)}
  </div>
  {loading&&!snapshot?<div className={styles.empty}>Bestandsdaten werden geladen …</div>:
   !snapshot?.company_exists?<div className={styles.empty}>V2-Unternehmen zunächst gründen.</div>:
  <>
   {tab==='fleet'&&<div className={styles.stack}>
    <p className={styles.note}>Originalflotte aus AERVELYS NEXT 1.0. Status „Onboarding“ ist keine Charterfreigabe. Die V2-Disposition verwendet bis zur überprüften Stammdatenzuordnung noch Beispieljets.</p>
    {snapshot.aircraft.map(a=><div key={a.id} className={styles.record}>
     <Plane size={19}/><div><strong>{a.registration} · {a.type}</strong>
      <small>Basis {a.home} · Aktuell {a.location} · Bestandsstatus {a.operational_status}</small>
      <small>{a.charter_release_note}</small></div>
     <span className={styles.hold}>Charterprüfung offen</span>
    </div>)}
    <div className={styles.sectionCaption}>Aktuell in V2 geführte Beispiel-Dispositionsflotte</div>
    {snapshot.active_v2_fleet.map(a=><div key={a.registration} className={styles.mini}>
     <strong>{a.registration} · {a.type}</strong>
     <span>{a.charter_release_status==='blocked'?'Charter gesperrt':
      a.charter_release_status==='sim_enabled'?'SIM-Charter ermöglicht':'Freigabe offen'}</span>
    </div>)}
   </div>}
   {tab==='people'&&<div className={styles.stack}>
    <p className={styles.note}>Die ursprüngliche AERVELYS-Belegschaft bleibt Stammdatenquelle. Bei derzeit nicht nachgewiesenen Type Ratings wird keine Einsatzberechtigung behauptet. Die V2-Dispatch-Beispielbesetzung ist noch nicht automatisch mit diesen Personen verknüpft.</p>
    <div className={styles.summary}>
     <span><Users size={16}/>{people.length} aktive Mitarbeiter</span>
     <span>{people.filter(p=>p.department==='Flight Crew').length} Flight Crew</span>
     <span>{people.filter(p=>p.department==='Operations').length} Operations</span>
    </div>
    {['Management','Operations','Flight Crew'].map(dept=><div key={dept} className={styles.group}>
      <h4>{dept}</h4>
      <div className={styles.staffGrid}>{people.filter(p=>p.department===dept).map(p=>
       <div key={p.id} className={styles.person}><strong>{p.name}</strong>
        <small>{p.role}</small>
        <span>{p.department==='Flight Crew'?
         (p.qualifications_verified?'Qualifikation im Bestand bestätigt':'Type Rating nicht bestätigt'):
         'Bestandsmitarbeiter'}</span></div>)}</div>
    </div>)}
   </div>}
   {(tab==='training'||tab==='roster')&&<div className={styles.columns}>
    <div className={styles.formPanel}>
     <h4>{tab==='training'?<><BookOpen size={18}/> Weiterbildung erfassen</>:
       <><CalendarDays size={18}/> Dienst oder Rufbereitschaft planen</>}</h4>
     <label>Mitarbeiter
      <select value={activePerson} onChange={e=>setPerson(e.target.value)} disabled={!!busy}>
       {people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
      </select></label>
     {tab==='training'?<>
      <label>Schulung / Weiterbildungsbezeichnung
       <input value={trainingTitle} onChange={e=>setTrainingTitle(e.target.value)}
        placeholder="z. B. Recurrent Training CJ4"/></label>
      <label>Schulungsart
       <select value={category} onChange={e=>setCategory(e.target.value)}>
        {categories.map(([v,k])=><option key={v} value={v}>{k}</option>)}</select></label>
      <label>Geplante SIM-Kosten (EUR, optional)
       <input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)}
        placeholder="Noch unbekannt"/></label>
     </>:<>
      <label>Planungsart
       <select value={dutyKind} onChange={e=>setDutyKind(e.target.value)}>
        {kinds.map(([v,k])=><option key={v} value={v}>{k}</option>)}</select></label>
      <label>Planungsbasis (ICAO, optional)
       <input value={base} onChange={e=>setBase(e.target.value)}
        placeholder="EDAZ" maxLength={4}/></label>
     </>}
     <div className={styles.two}>
      <label>Beginn
       <input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Ende
       <input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label>
     </div>
     <label>Notizen (optional)
      <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder="Trainer, Dienstwunsch, Bemerkungen …"/></label>
     <button type="button" className={styles.submit} disabled={!!busy||!activePerson||!from||!to||
      (tab==='training'&&!trainingTitle.trim())}
      onClick={()=>void (tab==='training'?addTraining():addDuty())}>
      <Plus size={16}/> {tab==='training'?'Schulung eintragen':'Dienstplanentwurf eintragen'}
     </button>
     <p className={styles.footnote}>{tab==='training'?
       'Eine geplante oder absolvierte Schulung erteilt kein Type Rating automatisch. Qualifikationsprüfung folgt separat.':
       'Entwurfsplanung bis zu 18 Monate im Voraus. Überschneidende Einträge werden blockiert. Echte Dienst-/Ruhezeitfreigabe ist noch nicht implementiert.'}</p>
    </div>
    <div className={styles.listPanel}>
     <h4><Clock3 size={18}/>{tab==='training'?'Gespeicherte Weiterbildungen':'Dienstplan / Rufbereitschaften'}</h4>
     {tab==='training'?snapshot.training.length===0?
      <div className={styles.empty}>Noch keine Schulungen im neuen Planungskalender.</div>:
      snapshot.training.map(t=><div key={t.id} className={styles.listItem}>
       <strong>{t.title}</strong><span>{personName(t.person_id)} · {t.category}</span>
       <span>{when(t.start)} – {when(t.end)}</span>
       <small>{t.status} · {euro(t.cost_eur)}</small>
      </div>):
      snapshot.roster.length===0?<div className={styles.empty}>Noch keine Dienstplanentwürfe. Du kannst auch Rufbereitschaft, Urlaub und Ruhezeiten planen.</div>:
      snapshot.roster.map(d=><div key={d.id} className={styles.listItem}>
       <strong>{personName(d.person_id)}</strong><span>{kinds.find(k=>k[0]===d.kind)?.[1]||d.kind} · {d.base||'keine Basis'}</span>
       <span>{when(d.start)} – {when(d.end)}</span><small>{d.status}</small>
      </div>)}
    </div>
   </div>}
   {tab==='facilities'&&<div className={styles.columns}>
    <div className={styles.formPanel}>
     <h4><HardHat size={18}/> Bau-/Flächenvorhaben anlegen</h4>
     <label>Projektname
      <input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)}
       placeholder="z. B. Eigener Hangar am Flugplatz"/></label>
     <label>Projektart
      <select value={projectKind} onChange={e=>setProjectKind(e.target.value)}>
       {facilities.map(([v,k])=><option key={v} value={v}>{k}</option>)}</select></label>
     <label>Standort / Bezeichnung
      <input value={projectSite} onChange={e=>setProjectSite(e.target.value)}
       placeholder="Noch zu prüfen"/></label>
     <div className={styles.two}>
      <label>Investitionsrahmen (EUR, optional)
       <input inputMode="decimal" value={projectBudget}
        onChange={e=>setProjectBudget(e.target.value)} placeholder="Noch offen"/></label>
      <label>Monatliche Miete (EUR, optional)
       <input inputMode="decimal" value={projectRent}
        onChange={e=>setProjectRent(e.target.value)} placeholder="Noch offen"/></label>
     </div>
     <label>Beschreibung / Projektstand
      <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder="Geplante Flächen, Ausbaustufen, Kostenannahmen …"/></label>
     <button type="button" className={styles.submit} disabled={!!busy||projectTitle.trim().length<3}
      onClick={()=>void addFacility()}><Plus size={16}/> Bauidee eintragen</button>
     <p className={styles.footnote}>Bauvorhaben starten im Status „Idee“; es werden keine Beträge abgebucht und keine echten Grundstücke erworben. Deine späteren Bauprojektbilder können als Grundlage für Lageplan, Phasen und Budget dienen.</p>
    </div>
    <div className={styles.listPanel}>
     <h4><HardHat size={18}/> Mietbestand & Ausbauplanung</h4>
     {snapshot.facilities.map(f=><div key={f.id} className={styles.listItem}>
      <strong>{f.title}</strong>
      <span>{facilities.find(k=>k[0]===f.kind)?.[1]||f.kind} · {f.status==='leased'?'Aktuell gemietet':'Projektidee'}</span>
      <span>{f.site}</span>
      <small>Miete: {euro(f.monthly_rent_eur)} · Budget: {euro(f.planned_capex_eur)}</small>
      {f.notes&&<small>{f.notes}</small>}
     </div>)}
    </div>
   </div>}
  </>}
  <footer className={styles.disclaimer}><ShieldCheck size={15}/>
   Planungssoftware für eine virtuelle Airline. Keine reale Crew-/Flugzeugfreigabe, kein Grundstücksgeschäft, keine automatischen Gehalts- oder Mietbuchungen.
  </footer>
 </section>;
}
