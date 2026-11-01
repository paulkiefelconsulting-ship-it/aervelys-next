# AERVELYS NEXT – Windows MSFS 2024 Bridge (lokaler Prototyp)

**Stand:** Flugphasen-Detektor und SimConnect-Leser als Quellcode. **Keine** Cloud-Anbindung, Geräte-Kopplung, Web-Telemetrie, aktive Airline-Freigabe oder getestete MSFS-2024-Laufzeitverbindung.

Die offizielle MSFS-2024-SimConnect-Schnittstelle unterstützt eigenständige Windows-Programme, die Simulatorwerte lesen. AERVELYS soll später über ein **zeitlich begrenztes, auf eine SIM-Mission beschränktes Pairing** Werte in das NEXT-System übertragen. Ein solches Pairing ist hier **noch nicht implementiert**.

## Lokale Voraussetzungen

- Windows-PC, auf dem MSFS 2024 läuft; MSFS-2024-SDK/SimConnect installiert.
- Python 3.11+ in 64 Bit.
- Optional für diesen Prototyp: Python-Paket `SimConnect` (von odwdinc / Python-SimConnect). **Wichtig:** Dieses Drittanbieterpaket wurde für MSFS 2020 entwickelt und trägt die AGPL-3.0-Lizenz; das Verhalten unter MSFS 2024 ist mit diesem Code noch **nicht** überprüft. Vor Weitergabe oder kommerzieller Nutzung Lizenz und Kompatibilität prüfen.
- Alternative für die Produktivfassung: offizielle Microsoft-SimConnect-Managed-API mit C#/.NET anhand des **SimvarWatcher**-Beispiels.

### Ausführen (lokal, ohne Cloud-Verbindung)

Auf dem Windows-PC im Repositoryverzeichnis:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install SimConnect
python -m unittest discover bridge/msfs2024/tests -v
python bridge/msfs2024/run_local.py --initial-phase boarding --output msfs_phase_events.jsonl
```

Wenn der virtuelle Flug bereits läuft, stattdessen `--initial-phase cruise` usw. verwenden. Das ist eine **manuelle Anfangsausrichtung**, keine ermittelte Flugphase. Die SimConnect-Bibliothek und MSFS müssen erreichbar sein; sonst bricht der lokale Reader mit einer Meldung ab.

## Flugphasenerkennung

Verwendete SimVars (lokal): `SIM ON GROUND`, `GROUND VELOCITY`, `PLANE ALT ABOVE GROUND`, `VERTICAL SPEED`, `AIRSPEED INDICATED` und optional `GENERAL ENG COMBUSTION:1`. An einem realen Flugzeugmodell können einzelne Variablen fehlen oder abweichen. In diesem Fall erfolgt **keine automatische Phasenfortsetzung**.

Detektor: Boarding → Taxi-out → Takeoff → Climb → Cruise → Descent → Approach → Landing → Taxi-in → Arrived. Ein durchgehender Go-Around führt von Approach wieder zu Climb. Für jede Phase wird eine Mindestdauer stabiler Messwerte verlangt. Fehlende, nicht plausible oder aus der Reihenfolge geratene Werte werden verworfen.

Der Status **Arrived** setzt einen bestätigten Engine-Off-Zustand voraus. Bei Flugzeugen, deren SimConnect-Engine-Bit nicht unterstützt wird, kann die Endphase **nicht** automatisch bestätigt werden. De-/Boarding- und Crewservice bleiben auch nach einer künftigen Koppelung separate Abläufe.

### Dateien

- `phase_detector.py`: zustandsbasierte Erkennung ohne Drittanbieterbibliothek; als eigenständiger Algorithmus testbar.
- `run_local.py`: Windows-SimConnect-Leser. Gibt ausschließlich lokal JSONL-Datei und Konsolenausgabe aus.
- `tests/test_phase_detector.py`: Tests für vollständige Flugphasenfolge, Signalrauschen, Go-Around, fehlendes Engine-Bit, ungültige und doppelte Samples.

### Datenschutz/Sicherheit

Keine API-Schlüssel, Passwörter oder personenbezogenen Passagierdaten werden verwendet oder im Repository hinterlegt. Das lokale Protokoll enthält nur Phase, Uhrzeit und ausgewählte Flugwerte. Es wird **nicht** automatisch in die Cloud hochgeladen. Im Produktivbetrieb sind für ein Geräte-Pairing Schlüsselrotation, scoped permissions, Telemetrievalidierung, Fehlertoleranz, Abbruch und Anti-Replay nötig.

### Offene Fertigstellungskriterien

1. Auf einem echten Windows-PC/MSFS 2024 mit dem verwendeten Flugzeugmodell testen.
2. Sicheren Pairing- und Authentifizierungsprozess für **eine** AERVELYS-SIM-Mission implementieren.
3. Serverseitige Telemetrievalidierung, Flugphasenspeicher und Live-Status im Dashboard anbinden.
4. Flugstart, Go-Around, Touch-and-Go, Pause, SimRate, Wetterdaten und Disconnects testen.
5. Erst danach „SimConnect verbunden“ oder „automatisch erkannte Flugphasen“ in NEXT anzeigen.

Quellen: [Offizielle SimConnect-SDK-Dokumentation](https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/simconnect-sdk/), [Microsoft SimvarWatcher](https://docs.flightsimulator.com/msfs2024/retail/samples-tutorials/samples/visualstudio/simvarwatcher/), [Python-SimConnect (Drittanbieter)](https://github.com/odwdinc/Python-SimConnect).


## Missionsgebundene MSFS-Bridge: erster Live-Übertragungsweg

Der lokale Reader kann über HTTPS nur eine aktive virtuelle Mission erreichen.
Der gesamte Zustand ist weiterhin ausdrücklich SIM-only und keine operative
Luftfahrzeugfreigabe. Die Windows-Laufzeitverbindung ist noch nicht erprobt.

### Bedienfolge
1. Im AERVELYS NEXT Browser: SIM-Flugbetrieb & Kabine öffnen.
2. Eine virtuelle Charteranfrage auswählen, die eigene SimBrief-Route
   einfügen, Trainingsmission anlegen und Boarding-Simulation starten.
3. Als CEO auf "Mission koppeln (90 Min)" klicken; einmaligen Code kopieren.
4. Über "Windows-Befehl kopieren" die PowerShell-Zeilen mit öffentlichen
   Projektwerten (Supabase-URL und Anon-Key) in Windows einfügen.
5. Lokale Abhängigkeiten installieren, dann aus dem Repositoryordner starten:
       python bridge/msfs2024/run_paired.py --initial-phase boarding
6. Den geheimen Code im verdeckten Prompt einfügen. Der Code wird nicht im
   Kommandoverlauf gespeichert; er wird nicht in die Logs geschrieben.
7. Geräteheartbeat im Web-Cockpit prüfen; nach dem Test "Gerät trennen".

Die Phase beim Start des Readers muss mit dem aktuellen SIM-Missionsstand
übereinstimmen; wenn der Flug bereits läuft, --initial-phase entsprechend
setzen. Neustart benötigt einen neuen Paarungscode.

### Technische Sicherheitsgrenzen
- Der Kopplungscode besteht aus 96 Hex-Zeichen mit kryptografisch
  zufälligen UUID-Anteilen; in der Datenbank wird nur SHA-256 gespeichert.
- Gültigkeitsfenster 10–180 Minuten, UI-Standard 90 Minuten.
- Ein neuer Code widerruft bestehende Kopplungen der Mission.
- Eingehende Werte haben streng steigende Sequenzen und mindestens
  500 ms Abstand; Dubletten, falsche Codes, ungültige Flugphasen,
  falsche SimVar-Messwerte sowie beendete Missionen werden zurückgewiesen.
- Es sind ausdrücklich keine realen Flug-, Crew-, Flotten- oder
  Firmenbuchungen zulässig.
- Eine eingetroffene Telemetrienachricht belegt NUR die erreichbare Bridge.
  Sie beweist nicht, dass ein echter MSFS-Flug erfolgreich verbunden ist.
- Das Projekt erfordert keine privaten Service-Role-Schlüssel im Windows-PC.
- Keine automatische Wiederholung nach unklaren Netzwerkfehlern, da
  andernfalls Flugphasen versehentlich mehrfach übertragen werden könnten.

### Offene Schritte
Das Python-Paket SimConnect stammt von einem Drittanbieter (AGPL),
dessen MSFS-2024-Kompatibilität noch unter Windows geprüft werden muss.
Dauerhaft sollte ein unterstützter C#/.NET-Connector mit offizieller
Microsoft-SimConnect-API eingesetzt werden. Auch dynamische SimRate,
Szenario-Neuladen, mehrere Triebwerke, Touch-and-Go und sichere
Gerätewiederverbindung sind noch nicht abschließend getestet.
