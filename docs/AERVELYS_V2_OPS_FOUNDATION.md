# AERVELYS NEXT V2.3 – Airline Operations Foundation

## Geschäftsregeln der virtuellen Airline

Diese Version führt **keine zusätzliche Werbewebsite** ein. AERVELYS bleibt
eine private virtuelle Business-Airline. Alle bekannten Daten erhalten
ihre ursprüngliche Identität und bestehende V2-Flüge bleiben bestehen.

### 1. Freigabe der Phenom 300E

CEO-Vorgabe: **Phenom 300E ist derzeit NICHT für Charter freigegeben**.

- V2 hat ein feldgestütztes Charterrelease pro Flugzeug.
- Der bestehende V2-Demojet AVF-P300 ist \`blocked\`.
- Der bestehende V2-CJ4-Demojet darf für bereits begonnene
  SIM-Abläufe weiterhin \`sim_enabled\` sein; das ist KEINE
  reale luftfahrtrechtliche Freigabe.
- Sales, Kundenpositionierung und Dispatch suchen nur
  \`charter_release_status='sim_enabled'\`.
- Zwei unabhängige Datenbank-Trigger blockieren direkte
  Charterzuweisung und Charterferry mit gesperrten Jets.
- Die **originale Phenom D-CPHE** bleibt auf dem bisherigen
  Status \`onboarding\`; die Bestandsanzeige kennzeichnet ihre
  ausdrückliche CEO-Chartersperre.
- Private Trainings- und Übungsflüge werden **nicht**
  als Charter klassifiziert. Eine eigene Trainingsflugverwaltung
  fehlt noch.

### 2. Bestandsflotte und echte Mitarbeiter

Bestandsquelle bleibt die bisherige NEXT-Datenbank:

- **5 Flugzeuge:** D-BLNG, D-CJPK, D-CPHE, D-CPLK, N551VG.
- **31 Mitarbeiter:** 20 Flight Crew, 10 Operations, 1 Management;
  identische Namen, Positionen und gespeicherte Gehälter.
- Bereich **Airline Administration → Operations Foundation**
  zeigt diese Bestandsdaten unverändert.
- V2 benutzt seine **sechs früheren Beispielrollen** für
  einen bereits laufenden CJ4-Testauftrag. Sie wurden nicht
  gelöscht oder überschrieben. Die Oberfläche kennzeichnet
  sie jetzt als *technischen Übergangsbestand*.
- **Noch offen:** kontrollierte FK-Zuordnung der originalen
  31 Mitarbeiter und fünf Flugzeuge zu V2-Dispatch, inklusive
  Freigaben, Sitzkonfigurationen und echten Crew-Ratings.
  Bestehende \`sim.pilot_qualifications\` enthalten
  derzeit **0** hinterlegte Nachweise; Ratings werden nicht
  erfunden und Qualifikation wird nicht als gültig behauptet.

### 3. Schulungen und Weiterbildungen

Neue private Tabelle \`sim.v2_training_records\`, mit
Fremdschlüssel auf bestehende \`sim.people\`:
- Mitarbeiter, Bezeichnung, Type Rating/Recurrent/Safety/
  Service/Leadership, von/bis, optionales Budget und Notizen.
- Planungsfenster bis **18 Monate**.
- Speichert nur Schulungsplanung, nicht eine echte Lizenz.
- Schulungen überschreiben weder vorhandene Mitarbeiter
  noch erteilen sie automatisch Musterberechtigungen.
- Kollision mit existierenden Dienst-/Standby-/Urlaubs-/
  Ruhezeiteinträgen wird bei Eintragung abgelehnt.

### 4. Dienstpläne und Rufbereitschaft

Neue private Tabelle \`sim.v2_duty_roster\` für
- Dienst
- Rufbereitschaft
- Urlaub
- Schulung im Dienstplan
- Geplante Ruhezeit.

Eintrag für jeden originalen Mitarbeiter bis zu
**18 Monate im Voraus**; maximal 31 Tage je zusammenhängendem
Eintrag. Überlappende Intervalle werden durch serielle
Datenbanksperre abgewiesen, auch bei konkurrierenden
Anfragen. Entwürfe sind ausdrücklich **keine real gültigen
FTL-/Dienstzeitfreigaben**.

**Noch offen:** automatische Monats-/Wochenplanerstellung,
Rufbereitschaftsrotation, Soll-Besetzung, Diensttausch,
Genehmigung, Schichtveröffentlichung, echte Crew Duty /
Rest-Time-Gates und Einbindung in V2-Dispatch.

### 5. Gemietete Flächen und Bauprojekte

Neue private Tabelle \`sim.v2_facility_projects\`.
Der aktuelle V2-Unternehmensbestand erhält zwei
Einträge:
- **Bestehende Mieträume**
- **Bestehende Mietstellplätze**

Mietbeträge, Anzahl Stellplätze, Grundstücksgrenzen
und Vertragsdaten sind derzeit **nicht bekannt**:
keine erfundenen Mietkosten.
CEO kann Hangar-, Büro-, Terminal- und Grundstücks-
Bauideen mit Ort, Investitionsrahmen, optionaler Miete
und Notizen erfassen. Neue Ideen lösen **keine
Bautätigkeit oder Bankbuchung** aus.

Sobald die angekündigten **Baupläne/Bilder**
hochgeladen werden, können Lagepläne und Bauabschnitte
für ein konkret ausgewähltes Projekt geplant werden.
Es gibt derzeit noch keine Bildzuordnung/-speicherung
in V2; bitte keine Bilder als "bereits eingebaut" behaupten.

### 6. Dispatch → SimBrief

Ein auf SimBrief abgestimmter, **offiziell dokumentierter
Dispatch-Options-Redirect**:
\`https://dispatch.simbrief.com/options/custom\`.

- In **Flight Operations → Aktuelle Flugplanung** für
  disponierte Charter.
- In **My Flights** für Charter- und Ferry-Legs.
- Vorbefüllte Felder aus der vorhandenen
  SIM-Dispatchakte: Airline \`AVF\`, origin, destination,
  Flugzeugtyp, PAX, Abflug in UTC und geplante Blockzeit.
- Vom Typ aktuell verifizierte SimBrief-Kennung:
  Citation CJ4 \`C25C\`; weitere eindeutige Typcodes
  E55P, C700 und SF50 als Mapping.
- **Keine erfundene Route**, Flugnummer, Alternate,
  Flugplatzfreigabe, Reiseflughöhe oder Fuel-Planung.
- **Keine automatisch erfundene Flugzeug-Registrierung**:
  \`AVF-CJ4\` ist ein V2-Democode und wird nicht als
  tatsächlich registriertes Luftfahrzeug übermittelt.
- SimBrief erstellt den OFP erst auf seiner eigenen
  Website, nach Nutzeranmeldung und manueller Prüfung.
  Dieser direkte Redirect benötigt **keinen
  Navigraph-Developer-API-Key**.
- Eine vollständige Zwei-Wege-Integration (OFP
  zurück in AERVELYS) benötigt später die korrekte
  Navigraph/SimBrief API-Freigabe und Nutzerkontrolle.

Dokumentation:
https://forum.navigraph.com/t/dispatch-redirect-guide/5299
https://developers.navigraph.com/docs/simbrief/introduction

### Sicherheit und Prüfungen

- CEO-/OPS-gesicherte Überblicks-RPC; nur CEO
  darf Einträge anlegen.
- Alle neuen Tabellen liegen privat unter \`sim\`,
  haben RLS und sind **nicht direkt aus dem Browser
  lesbar oder beschreibbar**.
- Training, Rufbereitschaft und Facility-Ideen
  schreiben keinerlei Realdaten oder tatsächliche
  Flug-/Lohn-/Grundstückskosten.
- \`db/v2_ops_foundation_rollback_test.sql\` prüft
  die bestehende 31/5-Flotte, Charter-Sperre, Schulung,
  Rufbereitschaft und bidirektionale Konflikte,
  reine Projektideen, fehlende falsche Berechtigungen
  und anonymen Zugriff, mit vollständigem Rollback.
- \`db/v2_ops_foundation_security_audit.sql\` prüft
  die vorhandene CJ4-In-Flight-Mission, Rolle,
  Tabellenrechte und fehlende Testartefakte.
- \`scripts/test-v2-ops-foundation.cjs\` validiert
  die SimBrief-Parameter, automatische Datums-
  und Einheitentransformation, keine erfundene
  Registrierung, privaten SQL-Vertrag und UI-Wiring.
