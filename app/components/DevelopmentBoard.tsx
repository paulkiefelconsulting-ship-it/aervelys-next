'use client';
import {useState} from 'react';
import {ChevronDown, ChevronUp, CheckCircle2, Clock3, ShieldAlert} from 'lucide-react';

type Workstream={title:string;phase:'backend'|'partial'|'planned';existing:string;next:string};
const workstreams:Workstream[]=[
{title:'Flotte & Flugplanung',phase:'partial',existing:'Fünf Jets, geschützte Live-Flottenkarten mit ICAO-Standorten und Dispositionsprüfungen in Supabase',next:'Verifizierte Flugzeugleistungen und operativer Dispatch'},
{title:'Crewplanung & HR',phase:'partial',existing:'31 Mitarbeiter, geschützte durchsuchbare Crewübersicht und Modelle für Crewrotationen',next:'Qualifikationsprüfung und vollständige Dienst-/Ruhezeitlogik'},
{title:'Charter & Angebote',phase:'backend',existing:'Anfrage-, Angebots- und Prüfdatenmodelle',next:'Angebotsbearbeitung bis zum fakturierten Flug'},
{title:'Posteingang & Anfragen',phase:'partial',existing:'Geschützte Liste, Zuweisung, Status und Verlauf',next:'Echte E-Mails, Anhänge und End-to-End-Test'},
{title:'Wartung EDAZ',phase:'backend',existing:'Wartungsaufträge und externe Dienstleistermodelle',next:'Wartungsworkflow und verifizierte Freigaben'},
{title:'Finanzen & Verträge',phase:'backend',existing:'Vertrags- und Buchungsstrukturen',next:'Rechnungs- und Zahlungsoberfläche'},
{title:'Training Center',phase:'backend',existing:'Drei Kurse und Qualifikationsstrukturen',next:'Trainingsplanung und Schulungsnachweise'},
{title:'Hangars & Immobilien',phase:'backend',existing:'Standort- und Mietmodelle',next:'Verträge und laufende Mietverwaltung'},
{title:'KI & Automatisierung',phase:'planned',existing:'Automatisierbare Prüfschritte in einzelnen Modulen',next:'Sichere KI-Agenten und Freigabeprozesse'},
{title:'CEO-Dashboard',phase:'partial',existing:'Login, Live-Kennzahlen und Firmen-Navigation',next:'Weitere operative Managementansichten'},
{title:'Sicherheit & Benutzerverwaltung',phase:'partial',existing:'Aktiver CEO-Zugang und abgesicherte RPC-Funktionen',next:'Benutzerverwaltung, Rollenoberfläche und End-to-End-Sicherheitstests'},
{title:'Infrastruktur & Deployment',phase:'partial',existing:'GitHub, Supabase und Vercel mit erfolgreichem Build',next:'Build-Tests im CI und kontinuierliches Monitoring'},
{title:'MSFS 2024',phase:'planned',existing:'Als eigenständiger Bereich vorgesehen',next:'Ereignisempfang und sichere Simulator-Synchronisation'}
];
const phaseInfo={backend:{text:'Backend vorhanden',color:'backend'},partial:{text:'Web-Ausbau läuft',color:'partial'},planned:{text:'Geplant',color:'planned'}};
export default function DevelopmentBoard(){
 const [open,setOpen]=useState<number|null>(null);
 const counts={backend:workstreams.filter(x=>x.phase==='backend').length,partial:workstreams.filter(x=>x.phase==='partial').length,planned:workstreams.filter(x=>x.phase==='planned').length};
 return <section className="panel development-board"><div className="panelhead"><div className="eyebrow">PROGRAM STATUS / 13 WORKSTREAMS</div><h2>Entwicklungsübersicht</h2><p className="lead">Transparenter Projektstand – eine vorhandene Datenbankfunktion bedeutet noch keine Betriebsfreigabe.</p><div className="development-summary"><span><CheckCircle2 size={15}/> {counts.partial} im Web-Ausbau</span><span><Clock3 size={15}/> {counts.backend} mit Backend-Grundlage</span><span><ShieldAlert size={15}/> {counts.planned} geplant</span></div></div><div className="development-list">{workstreams.map((item,index)=><div className="development-item" key={item.title}><button type="button" className="development-trigger" aria-expanded={open===index} onClick={()=>setOpen(open===index?null:index)}><span className="development-number">{String(index+1).padStart(2,'0')}</span><span className="development-name">{item.title}</span><span className={'development-state '+phaseInfo[item.phase].color}>{phaseInfo[item.phase].text}</span>{open===index?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>{open===index&&<div className="development-details"><p><strong>Vorhanden:</strong> {item.existing}</p><p><strong>Nächster Schritt:</strong> {item.next}</p></div>}</div>)}</div></section>
}
