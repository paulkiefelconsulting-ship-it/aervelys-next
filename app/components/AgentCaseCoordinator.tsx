'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {AlertTriangle,ArrowRight,Clock3,Inbox,RefreshCw,ShieldAlert} from 'lucide-react';
import {buildCoordinationCases} from '../lib/agentCoordination';
import type {AgentPlan,CoordinationCase,DispatchDraft,SimCustomerCase,SimCustomerMessage} from '../lib/agentCoordination';
import styles from './AgentCaseCoordinator.module.css';

type Filter='all'|'conflict'|'overdue'|'monitor'|'closed';
type CustomerResponse={cases:SimCustomerCase[];messages:SimCustomerMessage[]};
type AgentResponse={plans:AgentPlan[]};
function dbClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw Error('Supabase-Zugang fehlt');
  return createBrowserClient(url,key);
}
function date(value:string|null){
  if(!value)return 'Nicht hinterlegt';
  const d=new Date(value);
  return Number.isFinite(d.getTime())?'Nicht hinterlegt':d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function euros(value:number|null){
  return value===null?'Noch nicht vorhanden':value.toLocaleString('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0});
}
const statuses:Record<CoordinationCase['priority'],string>={
  conflict:'OPS-Konflikt',overdue:'Frist überschritten',monitor:'Automatischer Ablauf',closed:'Beendet'
};
const filters:Array<{key:Filter;label:string}>=[
  {key:'all',label:'Alle'},{key:'conflict',label:'OPS-Konflikte'},
  {key:'overdue',label:'Überfällig'},{key:'monitor',label:'Im Ablauf'},{key:'closed',label:'Beendet'}
];
export default function AgentCaseCoordinator(){
  const [rows,setRows]=useState<CoordinationCase[]|null>(null);
  const [filter,setFilter]=useState<Filter>('all');
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState<string>('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [lastSync,setLastSync]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const db=dbClient();
      const [customers,agents,dispatch]=await Promise.all([
        db.rpc('aervelys_sim_customers_dashboard'),
        db.rpc('aervelys_virtual_agents_overview'),
        db.rpc('aervelys_dispatch_plans_list')
      ]);
      const customerData=customers.data as CustomerResponse|null;
      const agentData=agents.data as AgentResponse|null;
      if(customers.error||agents.error||dispatch.error||
        !Array.isArray(customerData?.cases)||!Array.isArray(customerData?.messages)||
        !Array.isArray(agentData?.plans)||!Array.isArray(dispatch.data)){
        throw Error('Unvollständiger oder unberechtigter RPC-Snapshot');
      }
      const data=buildCoordinationCases({
        cases:customerData.cases,messages:customerData.messages,
        plans:agentData.plans,drafts:dispatch.data as DispatchDraft[]
      },Date.now());
      setRows(data);
      setSelected(old=>data.some(r=>r.id===old)?old:data[0]?.id||'');
      setLastSync(new Date().toISOString());
      setError('');
    }catch{
      // Fail closed: stale/partial data must not look like a healthy agent workflow.
      setRows(null);
      setSelected('');
      setLastSync(null);
      setError('Kein vollständiger, autorisierter Vorgangssnapshot. Bitte Zugriff und die drei Supabase-Schnittstellen prüfen.');
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},90000);
    return ()=>window.clearInterval(timer);
  },[refresh]);

  const counts=useMemo(()=>{
    const all=rows||[];
    return {all:all.length,conflict:all.filter(x=>x.priority==='conflict').length,
      overdue:all.filter(x=>x.priority==='overdue').length,
      monitor:all.filter(x=>x.priority==='monitor').length,
      closed:all.filter(x=>x.priority==='closed').length};
  },[rows]);
  const shown=useMemo(()=>rows?.filter(x=>
    (filter==='all'||x.priority===filter)&&
    (x.code+' '+x.customer+' '+x.route).toLowerCase().includes(search.trim().toLowerCase())
  )||[],[rows,filter,search]);
  const current=shown.find(x=>x.id===selected)||shown[0]||null;
  return <section className={'virtual-staff-block '+styles.coordinator} aria-label="Agenten-Vorgangskoordination">
    <div className={styles.header}>
      <div><div className="eyebrow">SIMULATION / CROSS-DEPARTMENT HANDOFF</div>
        <h3>Agenten-Vorgangsmonitor</h3>
        <p>Gemeinsame, automatisch aktualisierte Leseansicht für fiktive Kunden, Vertrieb, Dispatch und Crewplanung.</p></div>
      <button type="button" className="ops-refresh" disabled={loading} onClick={()=>void refresh()}>
        <RefreshCw size={15}/>{loading?'Lädt …':'Aktualisieren'}
      </button>
    </div>
    <div className={styles.disclaimer}><ShieldAlert size={18}/>
      <span>Die Übergaben und nächsten Schritte sind aus bestehenden Daten <strong>berechnet</strong>, nicht als neue Mitarbeiter-Nachrichten gespeichert.
        Keine E-Mails, Angebote, Reservierungen, Flüge oder Freigaben werden hier ausgelöst.</span>
    </div>
    {lastSync&&<p className={styles.synced}>Letzter vollständiger Datenabgleich: {date(lastSync)} · automatisch alle 90 Sekunden</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {rows!==null&&<>
      <div className={styles.metrics}>
        <div><strong>{counts.all}</strong><span>SIM-Vorgänge im Snapshot</span></div>
        <div><strong>{counts.conflict}</strong><span>OPS-Konflikte</span></div>
        <div><strong>{counts.overdue}</strong><span>Überfällige Kundenaktionen</span></div>
        <div><strong>{counts.monitor}</strong><span>Im Ablauf</span></div>
      </div>
      <div className={styles.controls}>
        <div className={styles.filters}>{filters.map(f=><button key={f.key} type="button"
          className={filter===f.key?styles.active:''} aria-pressed={filter===f.key}
          onClick={()=>setFilter(f.key)}>{f.label} ({counts[f.key]})</button>)}</div>
        <input aria-label="SIM-Vorgänge suchen" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}
          placeholder="Vorgangsnummer, Kunde oder Route"/>
      </div>
      {shown.length===0?<p className={styles.empty}><Inbox size={18}/> Keine passenden SIM-Vorgänge vorhanden.</p>:
        <div className={styles.layout}>
          <div className={styles.list} aria-label="SIM-Vorgänge">
            {shown.slice(0,80).map(row=><button key={row.id} type="button"
              className={row.id===current?.id?styles.selected:''}
              aria-pressed={row.id===current?.id} onClick={()=>setSelected(row.id)}>
              <span className={styles.listHead}><strong>{row.code}</strong>
                <span className={styles[row.priority]}>{statuses[row.priority]}</span></span>
              <span>{row.customer} · {row.route}</span>
              <small><ArrowRight size={12}/> Nächster Bereich: {row.nextOwner}</small>
            </button>)}
            {shown.length>80&&<p className={styles.synced}>Weitere {shown.length-80} Treffer – Suche eingrenzen.</p>}
          </div>
          {current&&<article className={styles.detail}>
            <div className="eyebrow">CASE HANDOFF / {current.code}</div>
            <h4>{current.customer}</h4>
            <p>{current.route} · Abflug: {date(current.departure)}</p>
            <p>SIM-Preisindikation: {euros(current.lastOffer)}</p>
            <div className={styles.next}><strong>Nächste Zuständigkeit: {current.nextOwner}</strong>
              <span>{current.nextTask}</span>
              <small><Clock3 size={13}/> Nächste Kundenaktion: {date(current.nextAction)}</small>
            </div>
            {current.issues.length>0&&<div className={styles.issues}>
              <strong><AlertTriangle size={16}/> Klärung erforderlich</strong>
              <ul>{current.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>
            </div>}
            <h5>Abteilungsstatus</h5>
            <ol className={styles.steps}>{current.steps.map(step=><li key={step.name}>
              <span className={styles.stepHead}><strong>{step.name}</strong>
                <small className={styles[step.state]}>{step.state==='done'?'SIM-Nachweis':step.state==='blocked'?'Gesperrt / Prüfung':'Ausstehend'}</small></span>
              <p>{step.detail}</p>
            </li>)}</ol>
          </article>}
        </div>}
    </>}
    {rows===null&&!error&&<p className={styles.empty}>Vorgangssnapshot wird geladen …</p>}
  </section>;
}
