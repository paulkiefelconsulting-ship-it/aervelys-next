# AERVELYS NEXT – SIM BRIDGE v0.1

Read-only SimConnect-Telemetrie aus Microsoft Flight Simulator 2024 in NEXT. Keine Flugfreigabe, keine Steuerbefehle, keine automatische Flugabrechnung.

## Windows-Build

Voraussetzungen: MSFS 2024 SDK, Visual Studio 2022 mit .NET Desktop Development und .NET Framework 4.8 Developer Pack, installierte Microsoft.FlightSimulator.SimConnect-Assembly.

PowerShell (SDK-Pfad an deinen PC anpassen):

    $env:MSFS_SDK = 'C:\MSFS 2024 SDK'
    msbuild .\bridge\Aervelys.SimBridge\Aervelys.SimBridge.csproj /p:Configuration=Release /p:Platform=x64

Das Projekt erwartet im SDK-Unterordner SimConnect SDK\lib\managed die Assembly Microsoft.FlightSimulator.SimConnect.dll. Die entsprechende Runtime bzw. SDK-Installation muss vorhanden sein. Kein geprüftes Windows-Binary liegt im Repository.

## Koppeln

1. NEXT öffnen, als CEO/OPS anmelden, MSFS-Integration wählen, Kopplungscode erzeugen.
2. Aervelys.SimBridge.exe unter Windows starten und NEXT-HTTPS-Webadresse sowie den 32-stelligen Einmalcode eingeben (fünf Minuten gültig).
3. MSFS 2024 starten und einen Flug laden. Die Bridge sucht alle acht Sekunden nach SimConnect.
4. NEXT zeigt Geräte online/offline und nach dem ersten Empfang die tatsächliche Simulator-Telemetrie. Aktualisierung alle zehn Sekunden.
5. Auf Wunsch Gerät im NEXT-Modul trennen. Für eine erneute Kopplung lokal die Datei %APPDATA%\AERVELYS\SimBridge\bridge.txt löschen.

Das Gerätetoken wird mit Windows DPAPI benutzergebunden verschlüsselt gespeichert. Kein Supabase-Service-Role-Key ist im Client nötig. Die Pair/Telemetry-Endpunkte sind keine direkten Schreibrechte auf den privaten Tabellen; die Postgres-Funktionen prüfen Code/Token und Autorisierung. Codes sind 128-Bit, Geräteschlüssel 256-Bit stark, und nur deren SHA-256-Hashes werden serverseitig gespeichert.

## Grenzen der ersten Version

Flugphasen sind heuristisch und nicht als verbindlicher Nachweis geeignet. Pause, Slew/Teleport, Zeitbeschleunigung, Flugzeugwechsel und Reconnect müssen auf Windows geprüft und verbessert werden. Es gibt noch keine Zuordnung zu einem Charterauftrag, keine SimBrief-Verknüpfung, keine Passagiersimulation und keine automatische Finanzbuchung. Flugzeug-/Crew-Freigaben in NEXT bleiben unberührt.

Die Speicherung der Messwerte erfolgt in sim.msfs_bridge_samples. Vor einem Dauerbetrieb ist eine Aufbewahrungs-/Löschroutine zu implementieren. Die native Managed SDK-Assembly ist auf dem Linux-CI-Runner nicht verfügbar; C#-Build und SimConnect-E2E-Test müssen unter Windows stattfinden.

Backend: db/msfs_bridge_v1.sql im AERVELYS NEXT Supabase-Projekt, nicht OPS/OPS5. Es genügt die bisherige öffentliche Supabase-URL plus Publishable/Anon Key im NEXT-Server; kein Service-Role-Key nötig.

Negativtests: Telemetrie ohne Bearer-Token -> HTTP 401; abgelaufener Paircode -> abgelehnt; Status ohne CEO/OPS -> abgelehnt; widerrufener Geräteschlüssel -> HTTP 401.

Offizielle SDK-Dokumentation: https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/simconnect-sdk/
