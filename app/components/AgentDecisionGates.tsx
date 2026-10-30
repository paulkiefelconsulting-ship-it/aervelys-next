'use client';
import {useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,LockKeyhole,ShieldCheck} from 'lucide-react';

type Plan={request_id:string;request_code:string;registration:string|null;pic:string|null;sic:string|null;status:string;evidence:Record<string,unknown>};
type Training={id:string;person:string;course:string;hours_verified:boolean;status:string};
type Props={enabled:boolean;plans:Plan[];training:Training[];modelConnected:boolean;verifiedCrewAssignments:boolean};

type Gate={id:string;area:string;activity:string;state:'sim'|'blocked'|'review';reason:string};
export default function AgentDecisionGates({enabled,plans,training,modelConnected,verifiedCrewAssignments}:Props){
 const [filter,setFilter]=useState<'all'|'blocked'|'review'|'sim'>('all');
 const gates=useMemo<Gate[]>(()=>{
  const pending=plans.filter(p=>p.status==='review_required'||!p.registration||!p.pic||!p.sic);
  const unverified=plans.filter(p=>p.evidence?.pic_type_rating_verified!==true||p.evidence?.sic_type_rating_verified!==true||p.evidence?.passenger_capacity_verified!==true);
  return [
   {id:'customers',area:'Vertrieb',activity:'Fiktive Kundenanfragen und Antworten',state:enabled?'sim':'review',reason:enabled?'Regelbasierter SIM-Betrieb; kein externer E-Mail-Versand.':'Automatik pausiert.'},
   {id:'pricing',area:'Vertrieb',activity:'Unverbindliche SIM-Preisindikation',state:enabled?'sim':'review',reason:'Nur Simulation; keine realen Preiszusagen, Verträge oder Zahlungen.'},
   {id:'aircraft',area:'Disposition',activity:'Flugzeug-Vorschläge',state:pending.length?'review':'sim',reason:pending.length?pending.length+' Vorschläge mit Konflikt oder fehlender Besetzung.':'Vorläufige Vorschläge; Standort und Positionierung müssen nachgewiesen werden.'},
   {id:'crew',area:'Crew',activity:'Verbindliche Crew-Zuteilung',state:'blocked',reason:verifiedCrewAssignments?'Verifizierte Daten allein sind keine Freigabe; Dienst-/Ruhezeit und konkrete Mission prüfen.':'Keine verifizierte autonome Crew-Zuteilung; Qualifikationen, Ruhezeiten und Positionierung prüfen.'},
   {id:'safety',area:'Dispatch',activity:'Operative Flugfreigabe (GO)',state:'blocked',reason:unverified.length+' Vorschläge mit unvollständigen Kapazitäts-/Ratingnachweisen; GO nur im gesonderten geprüften Release-Prozess.'},
   {id:'training',area:'Personal',activity:'Weiterbildungswünsche erfassen',state:enabled?'sim':'review',reason:training.filter(t=>!t.hours_verified).length+' Anfragen ohne verifizierte Stundenbasis. Anfragen sind keine Genehmigungen.'},
   {id:'rating',area:'Personal',activity:'Type Rating / Zertifikat automatisch erteilen',state:'blocked',reason:'Ausbildungsnachweis, berechtigter Anbieter und autorisierte Prüfung zwingend erforderlich.'},
   {id:'external',area:'System',activity:'Externe Sprachmodell-Entscheidungen',state:'blocked',reason:modelConnected?'Externe Modellantworten dürfen Freigabegates nicht umgehen.':'Kein Sprachmodell verbunden; vorhandene Agenten arbeiten regelbasiert.'}
  ];
 },[enabled,plans,training,modelConnected,verifiedCrewAssignments]);
 const visible=gates.filter(g=>filter==='all'||g.state===filter);
 const count=(s:Gate['state'])=>gates.filter(g=>g.state===s).length;
 return <section className="virtual-staff-block" aria-label="Autonomie- und Entscheidungskontrolle">
  <div className="eyebrow">AGENT GOVERNANCE / SIMULATION</div>
  <h3>Was die Agenten selbst entscheiden dürfen</h3>
  <p>Diese Übersicht zeigt technische Sicherheitsgrenzen, keine nachträglich erteilten Freigaben. Zustände beruhen auf dem aktuellen Agenten-Snapshot.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'14px 0'}}>
   {([['all','Alle'],['sim','SIM erlaubt'],['review','Prüfung nötig'],['blocked','Gesperrt']] as const).map(([key,label])=>
    <button key={key} type="button" className="ops-refresh" aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label} ({key==='all'?gates.length:count(key)})</button>)}
  </div>
  <div style={{display:'grid',gap:10}}>
   {visible.map(g=><article key={g.id} style={{border:'1px solid var(--border, #3c4656)',borderRadius:10,padding:14}}>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
     {g.state==='blocked'?<LockKeyhole size={17}/>:g.state==='review'?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}
     <strong>{g.activity}</strong><small>{g.area} · {g.state==='blocked'?'Gesperrt':g.state==='review'?'Prüfung nötig':'Nur SIM'}</small>
    </div>
    <p style={{marginTop:8}}>{g.reason}</p>
   </article>)}
  </div>
  <p style={{marginTop:12}}><ShieldCheck size={15} style={{verticalAlign:'middle'}}/> Buchungsabsicht ist keine Flugfreigabe. Auch bei grünen SIM-Zuständen erfolgen keine echten Buchungen oder Betriebsfreigaben.</p>
 </section>;
}
