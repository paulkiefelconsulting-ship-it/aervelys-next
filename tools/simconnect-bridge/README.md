# AERVELYS Flight Bridge · Windows x64 (MVP)

Die Flight Bridge ist eine lokale Windows-Anwendung für Microsoft Flight Simulator 2024. Sie überwacht ausschließlich das eigene Flugzeug und schreibt jede Sekunde Position, Höhe, Geschwindigkeit und erkannte Flugphase in eine lokale Datei. Kein Server und keine Datenübermittlung.

## Installation ohne Programmierung

1. Gehe zur GitHub-Aktion **AERVELYS Windows Bridge build** im Repository **paulkiefelconsulting-ship-it/aervelys-next**. Wähle einen erfolgreichen Lauf auf dem Entwicklungszweig **feature/passenger-experience-map**.
2. Lade das Artifact **AERVELYS-Flight-Bridge-Windows-x64** herunter und entpacke es. Enthalten sind die EXE sowie **Install-und-Starten.cmd**.
3. Voraussetzung: Der offizielle **MSFS 2024 SDK** ist auf deinem Windows-PC installiert. Er enthält die beiden Microsoft-Dateien **Microsoft.FlightSimulator.SimConnect.dll** (managed) und **SimConnect.dll** (native).
4. Doppelklick auf **Install-und-Starten.cmd**. Das Skript kopiert die DLLs aus deinem **lokalen SDK** in den Bridge-Ordner und startet die Anwendung. Es lädt keine Microsoft-Dateien herunter oder überträgt Daten ins Netz.
5. Starte MSFS 2024. Im Bridge-Fenster erscheinen Verbindungsstatus, Flughöhe und erkannte Flugphase. Falls MSFS noch nicht geöffnet ist, verbindet sich die Bridge nach dem Start automatisch.

**Fehlerbehebung:** Falls das Skript die Dateien nicht findet, setze die Umgebungsvariable **MSFS2024_SDK** auf das SDK-Hauptverzeichnis. Alternativ kopiere beide DLLs von Hand in den Ordner der EXE:
- aus dem SDK-Unterordner **SimConnect SDK\lib\managed**: Microsoft.FlightSimulator.SimConnect.dll
- aus dem SDK-Unterordner **SimConnect SDK\lib**: SimConnect.dll

Die zwei Microsoft-SDK-Dateien sind **nicht im GitHub-Paket enthalten**. Ihre externe Weiterverteilung ist rechtlich nicht geklärt, deshalb müssen sie vom eigenen SDK stammen.

## Live im selben Browser-PC ansehen

1. Öffne AERVELYS NEXT Passenger Experience auf **demselben Windows-PC** in Microsoft Edge oder Google Chrome.
2. Gehe zu **03 · Flight Connect / Integration**.
3. Klicke in der **neuen Bridge** auf **Live-Datenordner öffnen**. Das öffnet den normalen Benutzerordner
   **%USERPROFILE%\AERVELYS\FlightBridge**. Dort muss bei erfolgreicher SimConnect-Verbindung die Datei **telemetry.json** vorhanden sein.
4. Klicke in AERVELYS NEXT auf **Live-Ordner verbinden**. Wähle in Edge/Chrome **genau diesen Ordner** aus (nicht die JSON-Datei und nicht AppData), und gewähre den Zugriff.
5. Der Browser sucht innerhalb dieses freigegebenen Ordners jede Sekunde erneut nach **telemetry.json**. Die Bridge aktualisiert dieselbe Datei kontinuierlich. Die Daten werden nicht durch AERVELYS ins Netz hochgeladen.
6. Bei aktuellen Messungen erscheinen Position und Flugphase als **MSFS LIVE**.
7. Die Flugkarte verwendet die tatsächliche MSFS-Position. Die Kabinensimulation nutzt die erkannte Phase für die Servicefreigabe.

Chromium blockiert den Zugriff auf geschützte Ordner wie AppData. Verwende daher **die neue Bridge-EXE und die zugehörige neue AERVELYS-NEXT-Testversion**. Die alte Bridge schreibt weiterhin unter AppData und ist für die neue Ordnerverbindung ungeeignet. Der neue Ordner liegt standardmäßig im lokalen Benutzerprofil außerhalb des OneDrive-Dokumentenordners; falls dein System eigene Synchronisationsregeln hat, prüfe diese bitte für Standortdaten.

Die SimBrief-Route bleibt ein geplanter Flugweg. Für ein **anderes** Tablet/Smartphone fehlen weiterhin die sichere serverseitige Geräte- und Flugzuordnung sowie eine authentifizierte Live-Übertragung. Firefox und mobile Browser unterstützen eventuell keinen automatischen Dateizugriff.

## Entwicklerversion, Tests und Quellcode

- **BridgeForm.cs:** sichtbare Windows-Oberfläche; SimConnect-Wrapper erst zur Laufzeit laden (kein lizenzierter SDK-Download oder Linkzeit-Dependency).
- **FlightPhaseDetector.cs:** Phasenerkennung mit Bodenstatus, Höhe über Grund, Vertikal-/Bodengeschwindigkeit und Zeit-Hysterese.
- **FlightPhaseScenarios.cs:** Tests für Parken, Rollen, Startlauf, Steigen, Reise-, Sink- und Anflug, Landung und Taxiin.
- **PhaseEngine.Tests.csproj:** automatisierte C#-Tests auf GitHub Actions.
- **windows-bridge-build.yml:** automatischer Windows-x64-Build mit herunterladbarem ZIP ohne Microsoft-DLLs.

Kompilieren (wenn Visual Studio/.NET Framework 4.8 Targeting Pack installiert sind):

    dotnet build tools/simconnect-bridge/AERVELYS.SimConnectBridge.csproj -c Release -p:Platform=x64

## Sicherheit und Grenzen

- Keine offenen Netzwerk-Ports, kein cloudbasierter Telemetrie-Upload und kein Zugriff auf OPS-Kundendaten.
- Lokale Datei: **%USERPROFILE%\AERVELYS\FlightBridge\telemetry.json**.
- Die Browseranzeige verwirft Messungen, deren Zeitstempel älter als 10 Sekunden ist.
- Die Flugphasen werden anhand SimConnect-Messwerten **heuristisch** erkannt, nicht vom Simulator als fertige Phasen gemeldet.
- Der Windows-Build und die Phasentests ersetzen **keinen echten Flugtest** mit MSFS 2024. Besonders Go-around, Touch-and-go, Flugzeug-Add-ons und On-Ground-Messungen müssen getestet werden.
- Die Bridge ist noch **kein freigegebenes produktives ACARS-System**.

