/** Investment definitions: prices are *simulated starting assumptions*, not live vendor quotes. */
export type CatalogEntry={id:string; title:string; category:'staff'|'real_estate'|'compliance'|'fleet'|'operations'; prerequisites:string[]; upFrontCents:number|null; durationDays:number|null; notes:string};
export const catalog: CatalogEntry[]=[
{id:'broker-contract',title:'Charterpartner-Vertrag',category:'operations',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Angebote und Betreiberzulassungen sind einzeln zu verifizieren'},
{id:'pilot-contractor',title:'Externe Pilotenregistrierung',category:'operations',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Ein ATPL allein ersetzt keine Betreiberfreigabe'},
{id:'office-rental',title:'Büro an beliebigem Standort mieten',category:'real_estate',prerequisites:['location-search'],upFrontCents:null,durationDays:null,notes:'Echte Angebote recherchieren oder deutlich als simuliert kennzeichnen'},
{id:'location-search',title:'Standort- und Flächensuche',category:'real_estate',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Nicht auf EDAZ begrenzt'},
{id:'architect-study',title:'Architektur- und Machbarkeitsstudie',category:'real_estate',prerequisites:['location-search'],upFrontCents:null,durationDays:null,notes:'Individuelles Angebot und Prüfung erforderlich'},
{id:'sophie',title:'Sophie Brandt – Operations',category:'staff',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Einstellung nach Arbeitslast und Budget'},
{id:'nora',title:'Nora Falk – Empfang',category:'staff',prerequisites:['office-rental'],upFrontCents:null,durationDays:null,notes:'Arbeitsplatz und Finanzierung erforderlich'},
{id:'leonie',title:'Leonie Berger – OPS-Stellvertretung',category:'staff',prerequisites:['sophie'],upFrontCents:null,durationDays:null,notes:'Passende Position erforderlich'},
{id:'hannah',title:'Hannah Wolf – First Officer',category:'staff',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Crew-Bedarf und Musterqualifikation erforderlich'},
{id:'marie',title:'Marie Seidel – Captain',category:'staff',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Crew-Bedarf und Musterqualifikation erforderlich'},
{id:'aoc-readiness',title:'AOC-Vorbereitungsprogramm',category:'compliance',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Echte Anforderungen aus geltendem Recht ableiten; keine automatische Genehmigung'},
{id:'aoc-application',title:'Virtuellen AOC-Antrag stellen',category:'compliance',prerequisites:['aoc-readiness'],upFrontCents:null,durationDays:null,notes:'Qualifiziertes Personal, Betriebshandbuch, Flotte, Managementsystem und finanzielle Tragfähigkeit prüfen'},
{id:'aircraft-lease',title:'Flugzeugleasing beantragen',category:'fleet',prerequisites:[],upFrontCents:null,durationDays:null,notes:'Lufttüchtigkeit, Betrieb und finanzieller Rahmen müssen passen'},
{id:'airport-project',title:'Eigener Flugplatz – Machbarkeitsphase',category:'real_estate',prerequisites:['architect-study'],upFrontCents:null,durationDays:null,notes:'Langfristige Finanzierung, Planung und Genehmigungen erforderlich'}
];
export function availableOptions(completedIds:readonly string[]) {
 const done=new Set(completedIds);
 return catalog.map(item=>({...item,unmet:item.prerequisites.filter(x=>!done.has(x)),available:item.prerequisites.every(x=>done.has(x))}));
}
