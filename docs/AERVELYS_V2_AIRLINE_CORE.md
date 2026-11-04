# AERVELYS NEXT 2.0 — Airline Core (Release 0.1)

## Zweck

Eigenständige virtuelle Business-Airline mit nachvollziehbarem
Geschäftsprozess statt Erweiterung des bisherigen MSFS-Trackers.
Die alte NEXT-Anwendung bleibt unter `/` vorhanden.
Der **isolierte Neustart** liegt unter `/v2` und nutzt denselben
bestehenden Login; Anmeldung und CEO-/OPS-Rechte werden weiterhin
serverseitig in Supabase geprüft.

**V2 wurde absichtlich nicht automatisch mit realen Spielständen
befüllt.** Nur der angemeldete CEO löst die Gründung aus.

## Was bereits funktioniert

1. **Airline gründen:** eine V2-Gesellschaft je CEO-Benutzer mit
   180.000 EUR rein fiktivem Anfangskapital, sechs virtuellen
   Mitarbeitenden, zwei eigenständigen simulierten Flugzeugen in EDAZ.
2. **Charteranfrage erstellen:** deterministische, ausdrücklich
   fiktive Geschäftskundenszenarien EDAZ–EDDM/EDDH/LOWI/LFMN.
3. **Mitarbeiter arbeiten lassen:** Eine transaktionale, begrenzte
   Simulationsrunde verarbeitet den gesamten verfügbaren Auftrag:
   - Sales kalkuliert Blockzeit, Modellbetriebskosten, Crew- und
     Handlingannahmen; stellt fiktives Preisangebot.
   - Der simulierte Kunde sagt auf Grundlage des zuvor festgelegten
     Budgets zu oder ab.
   - Dispatch wählt nur geeignete, an der richtigen Position
     befindliche verfügbare Flugzeuge und Piloten mit demselben
     Muster-Rating. Bereits reservierte Flugzeuge und Piloten
     werden nicht erneut verplant.
   - Der fiktive Chief Pilot stellt den Flug in den
     Status „bereit“; **keine reale Freigabe**.
4. **My Flights:** Der CEO kann einen disponierten Flug selbst
   übernehmen oder beim virtuellen Piloten belassen. Sim-Flüge
   werden ausdrücklich manuell gestartet und beendet.
5. **Finance:** Erst bei explizitem Flugabschluss werden **zwei**
   isolierte Ledger-Buchungen (fiktiver Erlös und geschätzte variable
   Flugkosten) erzeugt. Das Flugzeug wechselt dabei seinen
   simulierten Standort. Duplikate sind per Status und
   Unique-Constraint verhindert.
6. **CEO Dashboard:** echte V2-Daten für Aufträge, Liquidität,
   Bereitschaft und einen auditierbaren Entscheidungsverlauf.

## Bewusste Begrenzungen

- Keine generative KI für Kundendialoge oder Mitarbeiter; derzeit
  **deterministische, transparent geloggte Simulationslogik**.
- Keine autonome serverseitige Hintergrundausführung; das Büro
  arbeitet nach dem Knopfdruck „Mitarbeiter arbeiten lassen“.
- Keine Echtzeit-Flugverifikation oder automatische MSFS-Phase.
  Die **bestehende Windows-Bridge** bleibt unverändert in NEXT 1.0,
  bis eine getestete Integration für V2 eingerichtet wird.
- Keine echten Marktpreise: Flugkosten und Handling sind Modelle;
  keine bestätigten Flugstrecken-/Flugplatzgebühren.
- Crew-Musterratings sind nur **fiktive Datensätze**, keine echte
  Validierung der Pilotenberechtigung des Nutzers.
- Monatsgehälter sind im Team sichtbar, aber noch nicht periodisch
  gebucht. Leasing, Wartung, Finanzierung, Steuern, Auslastungs-
  und Flottenplanung fehlen. Darum wird **keine vollständige
  Gewinn-und-Verlust-Rechnung** behauptet.
- Keine automatische Positionierung: Flugzeuge stehen nach einem
  manuellen SIM-Flugabschluss am Ziel. Dispatch lehnt eine
  fiktionale Teleportation ab; Folgemissionen erfordern später
  explizite Ferry-Flüge.
- Noch kein Buchungskalender oder tatsächliches Abflugzeitfenster-
  / Flugwetter-/Crew-Duty-Time-Verfahren. Die Datumsfelder sind
  Planungshinweise, noch keine operative Rechtssicherheit.
- Keine echten Kundendaten, realen Flugfreigaben oder Banktransaktionen.

## Daten und Zugriff

- Private Tabellen ausschließlich unter `sim.v2_*`.
- Alle V2-Tabellen haben RLS und **keine direkten Browserrechte**.
- Browser ruft nur die folgenden serverseitig geschützten RPCs:
  - `public.aervelys_v2_overview()`
  - `public.aervelys_v2_initialize()`
  - `public.aervelys_v2_generate_inquiry()`
  - `public.aervelys_v2_run_office()`
  - `public.aervelys_v2_choose_pilot(uuid,text)`
  - `public.aervelys_v2_flight_action(uuid,text)`
- Überblick: aktive CEO-/OPS-Rolle + `auth.uid()`;
  alle Schreibaktionen ausschließlich aktive CEO-Rolle +
  `auth.uid()`, datensatzgebundene Gesellschaft.
- Keine Service-Role-Secrets oder externen KI-API-Keys im Browser.
- Bestehende `sim.aircraft`, `sim.charter_requests`,
  `sim.sim_customer_cases`, die Windows-Bridge und das
  ältere MSFS-Logbuch werden weder überschrieben noch migriert.

## Verifiziert

- SQL: `db/v2_airline_core_contract_test.sql` wurde mit
  **vollständigem Rollback synthetischer Daten** ausgeführt:
  idempotente Gründung, vier Kunden, Budget-Ablehnung, zwei
  disponierte Flüge, Kapazitätsbegrenzung, selbst gewählter
  Flug, expliziter Start/Abschluss, zwei Finanzbuchungen,
  Sperre doppelter Abschlüsse und Anon-Verweigerung.
- SQL: `db/v2_airline_core_security_audit.sql` hat
  private Berechtigungen und Null-Testdaten bestätigt.
- TypeScript / Next.js CI: vor dem Merge ausführen.
- Ein echter Browser- und MSFS-2024-E2E-Test mit deinem
  Benutzerkonto ist nach dem Deployment erforderlich.

## Nächste Entwicklung nach erstem Durchlauf

1. Einen V2-Auftrag als CEO in der Oberfläche durchspielen.
2. Einzeilige Änderung: V2-Pilotflug mit existierender MSFS-
   Bridge und SimBrief-Flugplanung verbinden.
3. Realistische Betriebszeit: Scheduler/Schichtmodelle,
   Hotel/Ferry, Slots, Wartung, Crew-Duty, mehrere Standorte.
4. Monatliche Finanzbuchhaltung mit Fixkosten, Cashflow,
   Rückstellungen und Investments.
5. Agenten mit Protokollierung, begrenzten Berechtigungen
   und konfigurierbaren Entscheidungsspielräumen.
