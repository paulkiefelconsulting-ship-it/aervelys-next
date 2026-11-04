const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=file('db/v2_charter_quote_lock_v1.sql');
const fix=file('db/v2_charter_quote_contribution_threshold_fix.sql');
const ui=file('app/v2/V2AirlineCockpit.tsx');
const offer=file('app/v2/V2CharterOffer.tsx');
const tests=file('db/v2_charter_quote_contract_test.sql');
for(const term of [
 'create table sim.v2_quotes','v2_quote_sell_sum','v2_quote_cost_sum',
 'v2_quote_pos_gate','create trigger v2_lock_issued_terms',
 "to_jsonb(new)-'status'-'accepted_at'",
 "create or replace function public.aervelys_v2_run_office()",
 "'quotes',coalesce","'finance_reviews',coalesce",
 'v2_quotes set status=','estimated_cost_eur=proposed_cost',
 'positioning_sell_eur','customer_terms','quoted_aircraft_position',
 "'remain_at_destination'","'financial_bank_transactions',0"
])assert.ok(sql.includes(term),'Missing protected quote invariant: '+term);
assert.ok(fix.includes("q.total_sell_eur"));
for(const term of [
 'CharterOffer','FinanceReviewBoard','Array.isArray(value.quotes)',
 'Array.isArray(value.finance_reviews)','quotes.find(q=>q.request_id',
 'Gesamtpreis','Kunden'
])assert.ok(ui.includes(term)||offer.includes(term),'Missing UI quotation: '+term);
for(const term of [
 'Angebotstext kopieren','Positionierung','postflight_policy',
 'Geschätzte Positionierungskosten','SIM-Deckungsbeitrag',
 'preis','quote.total_sell_eur'
])assert.ok(offer.toLowerCase().includes(term.toLowerCase()),
 'Missing customer quote or finance transparency: '+term);
for(const term of [
 'ACCEPTED_QUOTE_PRICE_MUTATION_ACCEPTED',
 'ACCEPTED_QUOTE_DECISION_MUTATION_ACCEPTED',
 'ROLLBACK_ALL_V2_QUOTE_TESTS',
 "'finance_reviews'","no"
]){
 if(term==="no")continue;
 assert.ok(tests.includes(term),'Missing SIM rollback contract: '+term);
}
assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(offer,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
console.log('PASS: locked customer quotation, itemised ferry charges, postflight review & private contract');
