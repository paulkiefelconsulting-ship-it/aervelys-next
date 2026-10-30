import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCoordinationCases} from '../app/lib/agentCoordination.ts';

const now=Date.parse('2026-10-31T10:00:00Z');
const fixture=(overrides={})=>({
  cases:[{request_id:'s1',request_code:'AV-SIM-0001',customer_name:'Test GmbH',
    origin:'EDAZ',destination:'EDDB',departure:'2026-11-01T10:00:00Z',
    next_action_at:'2026-10-31T12:00:00Z',lifecycle:'inquired',last_offer_price_eur:null}],
  messages:[],plans:[],drafts:[],...overrides
});
test('ignores non-SIM cases and does not issue operational GO',()=>{
  const rows=buildCoordinationCases(fixture({cases:[...fixture().cases,
    {request_id:'real',request_code:'AV-REAL-01'}]}),now);
  assert.equal(rows.length,1);
  assert.equal(rows[0].code,'AV-SIM-0001');
  assert.equal(rows[0].steps.at(-1).state,'blocked');
  assert.equal(rows[0].nextOwner,'Vertrieb');
});
test('detects customer follow-up deadline, but does not invent conflicts',()=>{
  const rows=buildCoordinationCases(fixture({cases:[{...fixture().cases[0],
    next_action_at:'2026-10-30T12:00:00Z'}]}),now);
  assert.equal(rows[0].priority,'overdue');
  assert.deepEqual(rows[0].issues,[]);
});
test('prioritizes actual agent blockers over a late customer action',()=>{
  const rows=buildCoordinationCases(fixture({
    cases:[{...fixture().cases[0],next_action_at:'2026-10-30T12:00:00Z'}],
    plans:[{request_id:'s1',registration:'D-CPHE',status:'review_required',pic:'P',sic:'S',
      evidence:{ops_alert_codes:['aircraft_schedule_overlap','aircraft_schedule_overlap']}}]
  }),now);
  assert.equal(rows[0].priority,'conflict');
  assert.equal(rows[0].nextOwner,'OPS');
  assert.deepEqual(rows[0].issues,['Flugzeug-Zeitkonflikt']);
});
test('classifies documented sales reply and provisional crew only',()=>{
  const rows=buildCoordinationCases(fixture({
    cases:[{...fixture().cases[0],last_offer_price_eur:8000}],
    messages:[{request_id:'s1',kind:'sales_agent_reply'}],
    plans:[{request_id:'s1',registration:'D-CPHE',pic:'P',sic:'S',status:'suggested',evidence:{}}],
    drafts:[{request_id:'s1',registration:'D-CPHE'}]
  }),now);
  assert.equal(rows[0].nextOwner,'OPS');
  assert.equal(rows[0].steps.find(x=>x.name==='Crew').state,'done');
  assert.match(rows[0].steps.find(x=>x.name==='Crew').detail,/unbestätigter/);
  assert.equal(rows[0].steps.at(-1).state,'blocked');
});
test('closed cases never escalate even with obsolete blockers and deadlines',()=>{
  const rows=buildCoordinationCases(fixture({
    cases:[{...fixture().cases[0],lifecycle:'withdrawn',next_action_at:'2026-10-01T00:00:00Z'}],
    plans:[{request_id:'s1',status:'review_required',evidence:{ops_alert_codes:['aircraft_candidate_missing']}}]
  }),now);
  assert.equal(rows[0].priority,'closed');
  assert.equal(rows[0].nextOwner,'Keine');
});
test('sorts conflict before overdue, then open and closed',()=>{
  const c=fixture().cases[0];
  const rows=buildCoordinationCases(fixture({
    cases:[
      {...c,request_id:'closed',request_code:'AV-SIM-4',lifecycle:'closed'},
      {...c,request_id:'open',request_code:'AV-SIM-3'},
      {...c,request_id:'late',request_code:'AV-SIM-2',next_action_at:'2026-10-30T00:00:00Z'},
      {...c,request_id:'conflict',request_code:'AV-SIM-1'}],
    plans:[{request_id:'conflict',status:'review_required',evidence:{ops_alert_codes:[]}}]
  }),now);
  assert.deepEqual(rows.map(x=>x.id),['conflict','late','open','closed']);
});
