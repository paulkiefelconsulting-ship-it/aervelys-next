# AERVELYS NEXT Desktop 0.6 – SimConnect-Prüfung und Flugabrechnung (Alpha)

## Neu

Der lokale Charter-/Ferry-Markt zeigt für jeden Auftrag ein **geschätztes SIM-Ergebnis**:
Bruttohonorar – modellierter Treibstoff – modellierte Landegebühr – modelliertes Handling = voraussichtliches Netto.
Die Werte sind **fiktive Spieltarife**, keine echten Flughafenpreise und keine Flugplanung für reale Luftfahrt.
Die Treibstoffmenge wird aus Flugzeugtyp, Streckenlänge und geschätzter Blockzeit abgeleitet. Bei einer Abrechnung nach einem Simulatorflug ersetzt die **tatsächlich aufgezeichnete Blockzeit** diesen Zeitansatz, nicht jedoch eine fehlende Messung des echten Treibstoffverbrauchs.

### Lokaler Flugablauf

1. Angemessenen, zugelassenen Auftrag im Charter Board annehmen.
2. MSFS 2024 mit der AERVELYS SimConnect-Bridge im **Offline-Modus** starten.
3. Mit dem vereinbarten Flugzeug auf dem Startflugplatz am Gate parken (Engines OFF, Groundspeed unter 3 Knoten).
4. Bei diesem Auftrag **Flug am Gate aktivieren** klicken. Der Auftrag wird an eine aktuelle SimConnect-Sitzung und einen Startmesswert gebunden.
5. Engine Start, Taxi, Takeoff, Flight, Landing und Shutdown in derselben Sitzung durchführen.
6. **Flug prüfen** klicken. Nur bei passender Start- und Endposition, konsistenter Telemetrie, Flugzeugtyp, Flugstrecke und abgeschalteten Triebwerken wird der Button **Geprüften SIM-Flug abrechnen** eingeblendet.
7. Nach diesem bewussten Klick wird der Auftrag einmalig verbucht; das lokale SIM-Konto wird um den errechneten Netto-Betrag verändert. Ein Buchungseintrag und eine Abrechnungsquittung werden in **Airline & Finanzen** gespeichert.

### Schutzmaßnahmen

- Route wird mit lokal hinterlegten Flughafenzentren aus **OurAirports** (Public Domain, https://ourairports.com/data/) verglichen, nur zur SIM-Auswertung, nicht zur realen Navigation.
- Der Start muss innerhalb von 3 NM des Abflugflugplatzes Cold and Dark dokumentiert sein.
- Telemetrie muss aus **derselben** SimConnect-Sitzung stammen; Zeitlücken, Zeitrücksprünge, zu große Positionssprünge, falsche Flugzeugtypen und fehlender Shutdown verhindern die Abrechnung.
- Der Zielort muss innerhalb von 3 NM des Ziel-Flugplatzreferenzpunkts liegen, Groundspeed und Triebwerksstatus müssen passen.
- Eine Mission kann nur einmal ausgezahlt werden. Auftrag, Flugstunden, SIM-Konto und Ledger werden im selben lokalen JSON-Spielstand atomar gespeichert.
- Missionen anderer Piloten können nicht abgerechnet werden.
- Ein frei erstellter Flug oder ein Checkride erhält **keine** automatische Auszahlung und kein Rating.
- Die Prüfung ist ein **heuristischer SIM-Spielnachweis**, keine fälschungssichere Telemetrie oder echte fliegerische Qualifikation. Lokale Spielstanddateien können von PC-Besitzern verändert werden.

## Wichtige Grenzen

- Die native Bridge braucht auf deinem Rechner weiterhin das Microsoft MSFS 2024 SDK und die C#-Entwicklungswerkzeuge. Der Windows-Echtflug-End-to-End-Test ist noch ausstehend.
- Ohne echte lokale Telemetrie ist weder Flugaktivierung noch Abrechnung möglich.
- Die bisherigen alten Marktaufträge können ebenfalls aufgerufen werden. Fehlende Kostenangebote werden beim Flugabschluss aus den gleichen Spieltarifen berechnet.
- Der lokale Checkride ist nur eine Planung; Type-Rating-Freischaltung folgt erst nach einer gesonderten zuverlässigen Trainingsprüfung.
- Keine Online-Synchronisation, keine externen Rechnungen und keine echte Bezahlung.
- Keine automatische Flughafenpreis-, Fuel- oder Wetterabfrage, keine SimBrief-OFP-basierte Verbrauchsrechnung.
- Erst nach einem erfolgreichen Windows/MSFS-Flugtest kann ein vollautomatischer Abschluss ohne manuelles „Flug prüfen“ sinnvoll freigeschaltet werden.

Der 0.6-Installer aktualisiert die bisherige Windows-App mit identischer App-ID. Bestehende Pilotenprofile und SIM-Konten bleiben erhalten. Vor dem Update über **Profile sichern** ein Backup anlegen.

---

# AERVELYS NEXT Desktop 0.5.1 – Bezahlte Ferry-Verträge

**Behobener Fehler:** In 0.5 wurden alle Ferry-Aufträge mit 0 SIM-Währung angezeigt, obwohl diese als Aufträge einer fiktiven Flugzeugüberführungsfirma organisiert sind.

- Ferry-Aufträge haben jetzt eine **positive Bruttovergütung**. Diese wird wie andere SIM-Aufträge aus Strecke, Auftragsart und simulierter Angebotsvariation ermittelt, ist kein echter Marktpreis und keine garantierte Nettosumme.
- Für alle **bezahlten** Ferry-Aufträge gilt eine simulierte gewerbliche Pilotenberechtigung: CPL oder Frozen ATPL. PPL kann weiterhin private Flüge im separaten Missionsplaner planen, aber keine bezahlten Marktaufträge übernehmen.
- Noch nicht geflogene, bisher mit 0 vergütete **aktive CPL-Ferry-Aufträge** aus 0.5 werden beim Öffnen des lokalen Charter Board sicher nachberechnet (mit Kennzeichnung im Spielstand). Keine Auszahlung wird vorzeitig verbucht; ein bereits beendeter/abgebrochener Flug wird nicht rückwirkend bezahlt.
- Vorhandene alte unbezahlte PPL-Ferry-Missionen bleiben unverändert, statt rückwirkend in gewerbliche Aufträge verwandelt zu werden.
- Akzeptierte SIM-Verträge zeigen das Bruttohonorar ausdrücklich an. **Fuel/Handling/Operator-Gebühren werden in diesem Alpha-Stand noch nicht berechnet**.
- Der Bankkontostand verändert sich nicht beim Annehmen eines Ferry-Auftrags. Die automatische Auszahlung nach erfolgreich geprüftem MSFS-Flug ist weiterhin ein späterer Entwicklungsschritt.

Bestehende lokale Pilotenprofile, Spielstände und AERVELYS-Cloud-Daten bleiben erhalten. Windows Installer Version 0.5.1 aktualisiert 0.5 mit unveränderter App-ID. Für die MSFS-Telemetrie gilt weiterhin: nur mit echter lokal funktionierender SimConnect-Bridge.

---

# AERVELYS NEXT Desktop 0.5 – Offline Charter Board Alpha

## What was added

- A real, **offline-only simulated charter board** with 16 self-contained local example offers. These are generated inside AERVELYS NEXT; they are not live contracts, real-time availability, real charter rates, or copied SkyBridge contracts.
- Filter by category and eligibility; regenerate the offer values for a fresh game market without contacting a server.
- Routes include EDAZ to regional Germany and nearby European destinations. Payouts are explicitly fictional SIM amounts denominated in the pilot's selected game currency; there is no live exchange rate conversion.
- A local job can be accepted once, stored only under the selected pilot's career ID, and cancelled without a fee. At most one accepted job is active.
- Career prerequisites affect access. CPL and Frozen ATPL can accept simulated commercial SEP jobs; PPL can plan noncommercial ferry jobs only. Jet offers remain locked until a future reliably verified simulation rating system is available.
- A planned Phenom 100/300, CJ4, PC-24 or SF50 checkride can be created from Pilot & Training. The mission asks for two takeoffs and two landings at EDAZ, but is **only a plan** — there is still no automatic rating issuance.
- The home screen shows the accepted job; SIM company account shows the same unchanged starting balance. No fake settlements or unverified flight-hours are credited.
- Existing profiles and manual missions are kept. The career state format remains backwards-compatible, with optional new \`marketCycle\` and \`source:'local_market'\` fields.

## Still missing

- Genuine SimConnect end-to-end validation against a running MSFS 2024 aircraft
- Cold start and landing verification linked to a chosen mission
- Training certificate issuance with proper integrity controls
- Fuel and handling invoices, complete bank ledger and variable operating cost calculation
- A worldwide procedural market, timed contract expiry and dynamic market economy
- Offline AI customer negotiation, fleet purchasing, employees and corporate operations

## Install and test

Download Windows Setup 0.5 from the GitHub Actions **AERVELYS NEXT Windows Desktop** workflow. Test with your existing offline CPL profile: go to Charter & Trips, choose an eligible SEP contract, accept it, restart the app, and confirm that it is still in your profile. Check that the 90,000 EUR initial SIM budget does not change before a verified flight. Type ratings are still locked, and a planned Phenom checkride will not issue a certificate.

This build still ships an unsigned Windows installer and requires the official SDK on the local PC for live SimConnect recording. Back up pilots before upgrading.

---

# AERVELYS NEXT Desktop 0.4 — Multiple local pilots

This release introduces a true **offline pilot selection / pilot career onboarding** flow inspired by the *workflow* of SkyBridge, without copying its proprietary code, graphics or data.

## Pilot selection

- On every app start, choose an existing pilot or create a new one.
- Pilot creation: name, country, home currency, one simulated starting licence (PPL 50h, CPL 200h, Frozen ATPL 240h) and capital preset/custom amount.
- These starting hours represent simulated background experience; they are **not verified logbook hours** or real-world certificates.
- Separate stable UUID identifiers and independent career/mission files mean that identically named pilots do not share a mission list or balance.
- Change pilots via **Profil wechseln** in the desktop sidebar.
- Every profile is local. No internet, cloud login or NEXT/Supabase account is needed.

## Backups and upgrading from 0.3

- **Profile sichern** creates an explicit JSON export of all local pilot careers using a user-selected file path. Protect that export as personal data.
- **Backup wiederherstellen** imports validated AERVELYS backups as *additional* profiles with fresh IDs. It never silently overwrites an existing profile.
- An existing 0.3 \`local-career.json\` is copied into a dedicated legacy profile on the first 0.4 launch. The original 0.3 career file is **preserved untouched**. Legacy profiles do not get invented licences, hours or opening capital.
- New storage is \`pilots-index.json\` plus \`pilots/<UUID>/local-career.json\` in the app's Electron user-data directory.
- The SIM bank balance is an **initial capital only** in this release. It is not a ledger and is never changed automatically by flight playback.

## Limitations

- No real aircraft type rating is granted, no automatic contract verification and no payout. The MSFS SimConnect connection still needs a real Windows/SDK flight test.
- The local profiles are independent of the existing AERVELYS NEXT Cloud airline, employees, customer database and charter portfolio.
- We intentionally do not delete pilot profiles through the UI yet. Use backup/export before future profile removal.
- Automatic cloud sync and conflict-free import of online careers are not implemented.

## Installation

Download the unsigned NSIS Windows x64 Setup 0.4 from the GitHub Actions **AERVELYS NEXT Windows Desktop** run. Update over version 0.3; the app ID remains unchanged and the local profile folder remains on disk. Review the build checksum before installing.

---

# AERVELYS NEXT Desktop 0.3 — Offline-First Alpha

**Kurskorrektur nach dem SkyBridge-Vergleich:** AERVELYS NEXT Desktop ist jetzt eine **lokal startende Anwendung**, nicht mehr lediglich eine Web-App-Hülle. Die bestehenden Cloud-Module sind weiter separat verfügbar, aber nicht erforderlich, um das Windows-Programm zu öffnen oder einen lokalen SIM-Spielstand zu bearbeiten.

## In 0.3 vorhanden

- Ein eigenes, modernes AERVELYS-Desktop-Command-Center als gebündelte HTML/CSS/JS-Anwendung (kein Webhosting nötig)
- Lokales Pilotenprofil mit speicherbarem Namen und EDAZ als Start-Homebase
- Lokale SIM-Charter- und Checkride-Planungsaufträge mit Route und Flugzeug
- Lokale persistente JSON-Datei unter dem Electron-Benutzerprofil, ohne NEXT-Login
- ACARS-Ansicht mit **echten lokal empfangenen** Messwerten, soweit die SimConnect-Bridge gestartet und verbunden ist
- Native Bridge kann mit --offline betrieben werden und schreibt dann JSONL unter dem Windows-Benutzerprofil
- Optionaler Link zu NEXT Cloud im externen Browser; niemals als Voraussetzung zum Desktop-Start

## Was noch NICHT umgesetzt ist

- Keine lokale Kopie der kompletten Cloud-Airline (5 Flugzeuge, Mitarbeiter, Kunden, Rechnungen, Firmenkonten)
- Keine serverfreie KI-Kundenwirtschaft, kein autonomer Airline-Betrieb und keine vollständige lokale Chartergenerierung
- Kein automatischer Flugabschluss, Flugstunden-/Type-Rating-Nachweis oder Auszahlung aus ACARS
- Noch kein echter Windows/MSFS-2024-SimConnect-End-to-End-Test; die Bridge muss gegen das auf dem PC installierte offizielle Microsoft SDK kompiliert werden
- Kein installierter SQLite-Datenbankdienst: Die aktuelle Offline-Alpha speichert kleine lokale Spielstände in einer versionierten JSON-Datei; später ist eine lokale SQL-Datenbank vorgesehen
- Keine gesicherte Cloud-Synchronisation. **Niemals parallel denselben Flug in Cloud und Offline-Spielstand automatisch abrechnen.**
- Keine digital signierten Installer oder automatische Updates

## So startet 0.3

1. Den aktuellen Windows-Installer über GitHub Actions herunterladen.
2. Vorherige AERVELYS Desktop 0.2 kann installiert bleiben bzw. wird vom Installer mit derselben App-ID aktualisiert.
3. AERVELYS NEXT öffnen. Das **lokale Command Center** startet sofort, auch ohne Internet.
4. Unter **Charter & Trips** einen lokalen SIM-Auftrag anlegen. Er bleibt im lokalen Profil gespeichert.
5. Unter **Pilot & Training** einen Pilotenamen hinterlegen.
6. Optional MSFS 2024 starten und im Menü **Simulator → MSFS 2024 Bridge starten / einrichten** verwenden.

Für die native Bridge ist auf dem PC vorerst weiterhin das Microsoft Flight Simulator 2024 SDK inklusive Managed SimConnect Assembly und ein .NET-Framework-Compiler erforderlich. Die SDK-Dateien werden nicht von AERVELYS weiterverteilt. Unter **Live Tracking & ACARS** erscheinen echte empfangene Messwerte, sobald sie lokal gespeichert werden. Wenn MSFS nicht läuft oder die Bridge nicht funktioniert, bleibt der Status ausdrücklich OFFLINE.

## Technischer Aufbau

- Electron lädt immer lokal gebündeltes **local.html**, **local.css** und **local.js**, nicht die Vercel-Webseite.
- Der lokale Renderer bekommt über einen isolierten Preload nur eine eng definierte API. Die Main-Process-IPC-Prüfung validiert Fenster, Frame und genaue lokale Datei-URL.
- Node.js und systemnahe Electron-APIs bleiben im Renderer gesperrt.
- Lokaler SIM-Karrierestand: \`%APPDATA%\\aervelys-next-desktop\\local-career.json\` (genauer Windows-Pfad kann je nach Electron-App-Namen abweichen).
- ACARS-Rohdaten: \`%APPDATA%\\AERVELYS NEXT\\Telemetry\\YYYY-MM-DD.jsonl\` (lokale Messwertdatei mit Zeitstempel, Flugphase, Position, Höhe und Geschwindigkeit).
- Ein Menü-Klick startet den nativen, von AERVELYS geschriebenen C#-Reader im strikt lokalen Modus \`--offline\`, nicht mit Supabase-Token oder Web-Upload.
- Der Link zur bisherigen NEXT-Cloud öffnet einen externen Browser und ist ausdrücklich optional.
- Keine SkyBridge-Dateien, Assets, Marken oder proprietären Codeanteile enthalten.

## Desktop-Entwicklung

Windows 10/11, Node 22 und Python 3.12:

    cd desktop
    python scripts/make-icon.py
    npm install --no-audit --no-fund
    npm test
    npm run build:win

Den Installer erzeugt auch der GitHub-Actions-Workflow **AERVELYS NEXT Windows Desktop**. Prüfe die SHA-256-Prüfsumme des Build-Artefakts vor der Installation. Dieser Build ist nicht digital signiert.

## Nächste Meilensteine

1. Windows-Live-Test des lokalen Command Centers und der SimConnect-Bridge
2. Lokale SQLite-Wirtschaftsdatenbank, Import-/Export- und Backup-Funktion
3. Offline-Chartermarkt mit klar als SIM markierten Aufträgen, Rating- und Flottenregeln
4. Vollständiges ACARS-Logbook, Startup-/Shutdown-Prüfung und sicherer Flight Lifecycle
5. Optional synchronisierter Cloud-Airline-Betrieb mit Konfliktlösung und Audit-Log

Die neue Richtung ist **Offline-First mit optionaler Cloud**, nicht Cloud-First als bloße Desktop-Hülle.
