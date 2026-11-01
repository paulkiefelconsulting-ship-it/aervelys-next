# AERVELYS NEXT — Cloud MSFS Sitzung einer SIM-Chartermission zuordnen

Diese Umsetzung ist **nur** eine geschützte, rückverfolgbare
**Zuordnung von Simulator-Evidenz zu einem bestehenden AV-SIM-Charterflug**.
Sie ersetzt weder die vorhandene Windows-Bridge noch den gesonderten
90-Minuten-SIM-Missionsbridge-Kanal.

## Vorbereitungen

1. Starte MSFS 2024 und die vorhandene Windows-Bridge.
2. Sorge dafür, dass **Cloud-Telemetrie** über die bereits bestehende
   5-Minuten-Gerätekopplung an AERVELYS NEXT übermittelt wird.
   Die lokale Chrome-Dateianzeige von `telemetry.json` genügt **nicht**:
   NEXT muss eine echte `session_id` vom Gerät serverseitig empfangen.
3. Lege unter **SIM-Flugbetrieb & Kabine** aus einer bestehenden
   `AV-SIM-...`-Charteranfrage eine Trainingsmission mit
   deiner eingegebenen SimBrief-Route an und starte sie.
4. Unter **MSFS-Integration → MSFS-Sitzung mit Chartermission verbinden**
   werden ausschließlich frisch empfangene Gerätesitzungen angeboten.
5. Wähle eine Cloud-Sitzung und eine laufende SIM-Mission und klicke
   **Als SIM-Nachweis verbinden**.
6. Im Missionscockpit erscheint dann die verknüpfte Sitzung, ihre aktuelle
   serverseitige Flugphase, Geschwindigkeit über Grund und Flughöhe.
   Mit **Trennen** wird die Verbindung sauber geschlossen und protokolliert.

## Sicherheitsbedingungen

- Nur angemeldete Rollen **CEO** oder **OPS** können Zuordnungen lesen,
  anlegen oder trennen.
- Das Gerät muss dem angemeldeten Benutzer gehören und darf nicht widerrufen sein.
- Nur eine **serverseitig gespeicherte** Session mit frisch empfangenem
  Messwert (max. 120 Sekunden, plausible Zeitstempel) kann verknüpft werden.
  Die Benutzeroberfläche kann keine `session_id` frei erfinden.
- Es muss bereits eine **laufende** virtuelle SIM-Mission existieren.
  Charteranfragen ohne Mission dürfen nicht fälschlich als aktiv gelten.
- Pro SIM-Mission und pro (Gerät, Sitzung) darf nur eine aktive
  Zuordnung bestehen; Mehrfachzuordnung wird in der Datenbank abgelehnt.
- Zuordnung und Trennung schreiben ein Audit-Ereignis in private Tabellen.
  Die direkten Browser-Tabellenrechte bleiben gesperrt.
- Bei widerrufenem Gerät, Offline-Daten oder nicht mehr laufender
  Mission wird der Verbindungszustand sichtbar abgestuft.

## Technischer Vertrag

- `public.aervelys_msfs_charter_links_overview()`
  liest die eigenen Geräte, serverseitigen Sitzungen, laufenden
  SIM-Missionen und aktiven Verknüpfungen.
- `public.aervelys_msfs_charter_link(device_id,session_id,request_id)`
  stellt ausschließlich nach den obigen Prüfungen die Verbindung her.
- `public.aervelys_msfs_charter_unlink(link_id)` beendet sie.
- Der bestehende `aervelys_msfs_bridge_ingest` bleibt unverändert.
  Er fordert weiter die bestätigten Felder `observed_at`,
  `session_id`, `phase`, `latitude`, `longitude`,
  `altitude_ft` und `groundspeed_kt`.

**Ausdrücklich nicht enthalten:** automatische Übernahme der Cloud-Phase
in den missionsinternen Status, Auszahlung/Rechnung, Crew- oder
Flugzeug-Freigabe, Aufzeichnung echter Luftfahrtinformationen und
automatische Kabinenservice-Events. Diese Funktionen benötigen eine
gesonderte, vollständige Sicherheits- und Simulationsprüfung.

## Tests

Das SQL-Vertragsskript
`db/msfs_cloud_session_charter_link_contract_test.sql`
prüft mit **vollständig zurückgerollten** Fake-Daten eine aktive Mission,
eine serverseitige Gerätesitzung, eindeutige Zuordnung, Idempotenz,
Ablehnung doppelt belegter Missionen, anonyme Abweisung, Audit und
sauberes Trennen. Keine Test-Cloud-Geräte/-Missionen bleiben bestehen.

Der GitHub-Releasecheck prüft TypeScript und Next.js-Build, ohne
zusätzliche Vercel-Preview-Deployments.
