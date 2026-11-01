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
