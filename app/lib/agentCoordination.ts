/**
 * Read-only projection of existing AERVELYS NEXT simulation records.
 * This file does not issue offers, change crew assignments or release flights.
 */
export type SimCustomerCase = {
  request_id:string;
  request_code:string;
  customer_name?:string|null;
  origin?:string|null;
  destination?:string|null;
  departure?:string|null;
  lifecycle?:string|null;
  request_status?:string|null;
  next_action_at?:string|null;
  last_offer_price_eur?:number|null;
};
export type SimCustomerMessage = {request_id:string;kind:string;created_at?:string|null};
export type AgentPlan = {
  request_id:string;
  registration?:string|null;
  pic?:string|null;
  sic?:string|null;
  status?:string|null;
  evidence?:{ops_alert_codes?:unknown;[key:string]:unknown}|null;
};
export type DispatchDraft = {request_id:string;registration?:string|null;planning_status?:string|null};
export type CoordinationSources = {
  cases:SimCustomerCase[];
  messages:SimCustomerMessage[];
  plans:AgentPlan[];
  drafts:DispatchDraft[];
};
export type CaseStep = {name:string;state:'done'|'pending'|'blocked';detail:string};
export type CoordinationCase = {
  id:string;code:string;customer:string;route:string;departure:string|null;
  nextAction:string|null;closed:boolean;
  priority:'conflict'|'overdue'|'monitor'|'closed';
  nextOwner:'Vertrieb'|'Dispatch'|'Crewplanung'|'OPS'|'Keine';
  nextTask:string;issues:string[];steps:CaseStep[];
  lastOffer:number|null;
};
const closedStates=new Set(['withdrawn','cancelled','canceled','closed','lost','rejected']);
const labels:Record<string,string>={
  aircraft_candidate_missing:'Kein Flugzeugkandidat',
  aircraft_positioning_unverified:'Flugzeugpositionierung ungeprüft',
  pic_positioning_unverified:'PIC-Positionierung ungeprüft',
  sic_positioning_unverified:'SIC-Positionierung ungeprüft',
  aircraft_schedule_overlap:'Flugzeug-Zeitkonflikt',
  crew_provisional_rest_or_duty_gap:'Vorläufiger Crew-Dienst-/Ruhezeitkonflikt',
  crew_candidate_missing:'PIC oder SIC nicht gefunden'
};
function milliseconds(value:string|null|undefined):number|null{
  if(!value)return null;
  const t=Date.parse(value);
  return Number.isFinite(t)?t:null;
}
function isClosed(item:SimCustomerCase):boolean{
  return closedStates.has((item.lifecycle||'').toLowerCase())||
    closedStates.has((item.request_status||'').toLowerCase());
}
function warningCodes(plan:AgentPlan|undefined):string[]{
  if(!plan)return [];
  const raw=plan.evidence?.ops_alert_codes;
  if(!Array.isArray(raw))return [];
  return Array.from(new Set(raw.filter((v):v is string=>typeof v==='string'&&v.length>0))).slice(0,12);
}
function routeText(item:SimCustomerCase):string{
  return [item.origin,item.destination].every(x=>typeof x==='string'&&x.length>0)
    ?item.origin+' → '+item.destination:'Route nicht verfügbar';
}

/** Deterministic, side-effect-free case view. A proposal never counts as operational approval. */
export function buildCoordinationCases(sources:CoordinationSources,nowMs:number):CoordinationCase[]{
  const plans=new Map(sources.plans.map(x=>[x.request_id,x]));
  const drafts=new Map(sources.drafts.map(x=>[x.request_id,x]));
  const messagesByCase=new Map<string,Set<string>>();
  for(const m of sources.messages){
    if(!m.request_id||!m.kind)continue;
    if(!messagesByCase.has(m.request_id))messagesByCase.set(m.request_id,new Set());
    messagesByCase.get(m.request_id)!.add(m.kind);
  }
  const rows=sources.cases
    .filter(c=>typeof c.request_id==='string'&&c.request_id.length>0&&typeof c.request_code==='string'&&c.request_code.startsWith('AV-SIM-'))
    .map(c=>{
      const plan=plans.get(c.request_id);
      const draft=drafts.get(c.request_id);
      const closed=isClosed(c);
      const answered=messagesByCase.get(c.request_id)?.has('sales_agent_reply')??false;
      const priced=typeof c.last_offer_price_eur==='number'&&Number.isFinite(c.last_offer_price_eur)&&c.last_offer_price_eur>=0;
      const candidate=Boolean(plan?.registration||draft?.registration);
      const crew=Boolean(plan?.pic&&plan?.sic);
      const codes=warningCodes(plan);
      const reviewNeeded=plan?.status==='review_required'||codes.length>0;
      const issues=codes.map(x=>labels[x]||'Agentenhinweis: '+x.replaceAll('_',' '));
      if(reviewNeeded&&issues.length===0)issues.push('OPS-Prüfung des Agentenvorschlags erforderlich');
      const due=milliseconds(c.next_action_at);
      const overdue=!closed&&due!==null&&due<nowMs;
      const steps:CaseStep[]=[
        {name:'Kundenanfrage',state:'done',detail:'Fiktiver SIM-Vorgang liegt vor'},
        {name:'Vertrieb',state:answered?'done':'pending',detail:answered?'Automatische SIM-Antwort dokumentiert':'Automatische Antwort noch nicht dokumentiert'},
        {name:'SIM-Preis',state:priced?'done':'pending',detail:priced?'Unverbindliche Preisindikation vorhanden':'Keine SIM-Preisindikation nachgewiesen'},
        {name:'Flugzeug',state:reviewNeeded?'blocked':candidate?'done':'pending',
          detail:reviewNeeded?'Konfliktprüfung erforderlich':candidate?'Vorläufiger Kandidat/Entwurf – nicht reserviert':'Kein Flugzeugkandidat dokumentiert'},
        {name:'Crew',state:reviewNeeded?'blocked':crew?'done':'pending',
          detail:crew?'PIC/SIC als unbestätigter Vorschlag':'Crew-Vorprüfung offen'},
        {name:'Flugfreigabe',state:'blocked',detail:'In dieser Simulation grundsätzlich gesperrt; kein automatisches GO'}
      ];
      let nextOwner:CoordinationCase['nextOwner']='Vertrieb';
      let nextTask='SIM-Kundenanfrage durch Vertriebsagent bearbeiten';
      if(closed){nextOwner='Keine';nextTask='Kundenfall abgeschlossen oder zurückgezogen; keine weiteren automatischen Aktionen';}
      else if(reviewNeeded){nextOwner='OPS';nextTask='Planungskonflikte und fehlende Nachweise klären';}
      else if(!answered){nextOwner='Vertrieb';nextTask='Automatische Antwort im SIM-Vorgang ausstehend';}
      else if(!priced){nextOwner='Vertrieb';nextTask='Unverbindliche SIM-Preisindikation prüfen';}
      else if(!candidate){nextOwner='Dispatch';nextTask='Flugzeugkandidaten und Positionierung vorprüfen';}
      else if(!crew){nextOwner='Crewplanung';nextTask='PIC-/SIC-Vorschläge und Dienstzeiten vorprüfen';}
      else{nextOwner='OPS';nextTask='Offene Prüfungen zusammenführen – keine Flugfreigabe';}
      const priority:CoordinationCase['priority']=closed?'closed':reviewNeeded?'conflict':overdue?'overdue':'monitor';
      return {
        id:c.request_id,code:c.request_code,customer:c.customer_name||'Virtueller Kunde',
        route:routeText(c),departure:c.departure||null,nextAction:c.next_action_at||null,
        closed,priority,nextOwner,nextTask,issues,steps,
        lastOffer:priced?(c.last_offer_price_eur as number):null
      };
    });
  const order:Record<CoordinationCase['priority'],number>={conflict:0,overdue:1,monitor:2,closed:3};
  return rows.sort((a,b)=>{
    if(order[a.priority]!==order[b.priority])return order[a.priority]-order[b.priority];
    const ad=milliseconds(a.nextAction)??Number.MAX_SAFE_INTEGER;
    const bd=milliseconds(b.nextAction)??Number.MAX_SAFE_INTEGER;
    return ad-bd||a.code.localeCompare(b.code);
  });
}
