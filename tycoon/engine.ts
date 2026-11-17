/** Pure, deterministic Tycoon domain logic. No timestamps or network read inside functions. */
export type CurrencyCents = number;
export type Activity = 'pilot_services'|'charter_brokerage'|'private_flying';
export type Evidence = { source: 'verified' | 'simulation' | 'manual'; observedAt: string; note?: string };
export type Offer = { operatorQuoteCents: CurrencyCents; clientQuoteCents: CurrencyCents; additionalCostsCents: CurrencyCents };
export type Eligibility = { allowed: boolean; failures: string[] };

export function computeOffer(offer: Offer) {
  for (const n of Object.values(offer)) if (!Number.isSafeInteger(n) || n < 0) throw new Error('Amounts must be nonnegative integer cents');
  return { spreadCents: offer.clientQuoteCents - offer.operatorQuoteCents,
    estimatedContributionCents: offer.clientQuoteCents - offer.operatorQuoteCents - offer.additionalCostsCents };
}
export type Qualification = { code: string; expiresAt: string | null; verified: boolean };
export type PilotProfile = { license: 'ATPL'|'CPL'|'PPL'; qualifications: Qualification[]; available: boolean };
export function checkPilot(profile: PilotProfile, requiredCodes: string[], nowISO: string): Eligibility {
  const failures: string[] = [];
  if (!profile.available) failures.push('Pilot nicht verfügbar');
  for (const code of requiredCodes) {
    const q = profile.qualifications.find(x=>x.code===code);
    if (!q) failures.push('Berechtigung fehlt: '+code);
    else if (!q.verified) failures.push('Berechtigung nicht bestätigt: '+code);
    else if (q.expiresAt && q.expiresAt <= nowISO) failures.push('Berechtigung abgelaufen: '+code);
  }
  return { allowed: failures.length===0, failures };
}
export type FlightSuitability = { runwayAvailableM: number; requiredRunwayM: number; aircraftMassKg: number; limitMassKg: number; airportOpen: boolean; permissionGranted: boolean };
export function checkAirport(input: FlightSuitability): Eligibility {
  const failures: string[]=[];
  if (![input.runwayAvailableM,input.requiredRunwayM,input.aircraftMassKg,input.limitMassKg].every(x=>Number.isFinite(x) && x>=0)) failures.push('Ungültige Leistungsdaten');
  if (input.requiredRunwayM>input.runwayAvailableM) failures.push('Start- oder Landestrecke nicht ausreichend');
  if (input.aircraftMassKg>input.limitMassKg) failures.push('Masse über Flugplatzgrenze');
  if (!input.airportOpen) failures.push('Außerhalb genehmigter Betriebszeiten');
  if (!input.permissionGranted) failures.push('Erforderliche Genehmigung fehlt');
  return {allowed: failures.length===0,failures};
}
export type ScheduledEvent = { id:string; dueAt:string; status:'pending'|'running'|'completed'|'failed' };
export function dueEvents(events:ScheduledEvent[], nowISO:string): ScheduledEvent[] {
 return events.filter(x=>x.status==='pending' && x.dueAt<=nowISO).sort((a,b)=>a.dueAt.localeCompare(b.dueAt)||a.id.localeCompare(b.id));
}
export function initialCompany() {
 return { name:'Aervelys Business Aviation', homeIcao:'EDAZ', capitalCents:2500000,
   ownAircraft:0, employees:0, aocStatus:'not_applied' as const,
   pilotLicense:'ATPL' as const, difficulty:'realistic' as const, activities:['pilot_services','charter_brokerage','private_flying'] as Activity[] };
}
