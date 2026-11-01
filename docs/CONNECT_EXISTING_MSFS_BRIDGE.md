# AERVELYS NEXT × bestehende MSFS 2024 Flight Bridge

**Gilt für die Bridge aus „Web App Bauen“**, insbesondere den Chrome-Datei-Fix v0.4.
Bitte **keine zweite Bridge installieren oder bauen**.

## Sofort nutzbarer lokaler Anschluss

1. Die vorhandene Windows-Bridge starten und MSFS 2024 verbinden.
2. Prüfen, ob die Bridge die Datei `%USERPROFILE%\AERVELYS\FlightBridge\telemetry.json` fortlaufend aktualisiert.
3. AERVELYS NEXT in **Chrome auf demselben Windows-PC** öffnen.
4. **MSFS-Integration → Lokale Bridge direkt in NEXT anzeigen → telemetry.json auswählen**.
5. Die Datei aus dem Ordner `%USERPROFILE%\AERVELYS\FlightBridge` wählen.
6. Aktuelle lokale Messwerte, Dateialter und das Datenlücken-Protokoll ansehen.

Bei aktuellen Chrome-Versionen liest der Browser die einmal ausgewählte Datei
über den File-System-Access-Handle wiederholt, solange das NEXT-Tab geöffnet
ist. Andere Browser nutzen gegebenenfalls nur einen einmaligen Snapshot.
Beim Ersetzen der Datei durch atomisches Rename kann eine erneute Auswahl nötig sein.

**Wichtig:** Dieser lokale Anschluss schreibt **keine** Daten in Supabase.
Er verknüpft auch noch keine Charteranfrage und erteilt keinerlei Freigaben.

## Vollständige Cloud-Gerätekopplung (besteht bereits separat)

Die bestehende NEXT-Oberfläche enthält unter **MSFS-Integration** zusätzlich
„Simulator Live Bridge → Windows-PC koppeln“. Sie stellt einen
einmaligen **5-Minuten-Gerätekopplungscode** bereit.

Damit das bisherige Windows-Programm **direkt an die Cloud sendet**, muss sein
Programmcode die vorhandene Server-Schnittstelle unterstützen:

- Claim: `public.aervelys_msfs_bridge_pair_claim(p_code text,p_device_name text)`.
- Speichert das daraus empfangene **64-stellige Gerätetoken** ausschließlich lokal
  und sicher; niemals in Chat, Website-URL oder GitHub.
- Senden: `public.aervelys_msfs_bridge_ingest(p_token text,p_sample jsonb)`.
- Der Server begrenzt die Rate auf ungefähr **eine akzeptierte Nachricht alle
  3 Sekunden**; schneller gesendete Nachrichten können
  `{accepted:false,reason:"rate_limited"}` zurückgeben.
- Das Cloud-Panel zeigt nur Geräte dieses angemeldeten CEO/OPS-Benutzers.
- Gerätekopplung ist **nicht** gleichbedeutend mit der Zuordnung einer
  Flugsitzung zu einem bestimmten Charterauftrag.

Für diesen Cloud-Eingang sind diese exakten JSON-Schlüssel Pflicht:

| Feld | Typ / Bedeutung |
|---|---|
| `observed_at` | ISO-8601 Zeitstempel, max. ±120 s vom Server |
| `session_id` | UUID der Simulatorsitzung |
| `phase` | `PARKED`, `TAXI_OUT`, `TAKEOFF`, `CLIMB`, `CRUISE`, `DESCENT`, `APPROACH`, `LANDING`, `TAXI_IN`, `UNKNOWN` |
| `latitude` | Dezimalgrad −90 bis +90 |
| `longitude` | Dezimalgrad −180 bis +180 |
| `altitude_ft` | Fuß, −2500 bis +110000 |
| `groundspeed_kt` | Knoten, 0 bis 1500 |

Der JSON-Adapter in NEXT zeigt an, welche dieser Felder die lokale Datei
**tatsächlich** besitzt. Weitere mögliche, aber nicht für Cloud-Ingest
verlangte Daten: `aircraft_title`, `on_ground`,
`vertical_speed_fpm`, `indicated_airspeed_kt`, `agl_ft`,
`engine_running`, `parking_brake`, `sim_paused`, `sim_rate`.

**Achtung:** Das ist der technische Zielschema-Vertrag der vorhandenen
Datenbank, **keine bestätigte Aussage** über die Feldnamen, die das aktuelle
v0.4-Windows-Paket schon schreibt. Dazu muss eine reale telemetry.json
mit der Diagnose in NEXT geprüft werden.

## Geschützte SIM-Missionskopplung: anderer, ebenfalls bestehender Weg

In **SIM-Flugbetrieb & Kabine → Windows-Bridge koppeln** existiert ein
**missionsgebundener 90-Minuten-Code**. Das ist **nicht** derselbe Code wie
die 5-Minuten-Gerätekopplung in „MSFS-Integration“!

Dieser separate Server-Endpunkt heißt
`public.aervelys_sim_bridge_ingest(p_token text,p_seq bigint,p_phase text,p_sample jsonb)`.
Dafür wird ein **96-stelliger Sitzungscode**, eine monoton steigende
Sequenz und eine laufende SIM-Mission benötigt. Sein Messwertsatz erfordert:

- `on_ground` (boolean)
- `groundspeed_kt` (Knoten)
- `agl_ft` (Höhe **über Grund** in Fuß, nicht mit `altitude_ft` verwechseln)
- `vertical_speed_fpm` (Fuß pro Minute)
- `indicated_airspeed_kt` (KIAS)
- `engine_running` für den automatischen Abschluss nach dem Ausrollen

Dieser Endpunkt erlaubt nur plausible Phasenwechsel; ein SIM-Datei-Reader
allein ist **noch kein** solcher angeschlossener Missionsclient.

## Was wir vor automatischer Flugverknüpfung noch prüfen müssen

- Welches JSON-Schema die aktuelle Windows-Bridge tatsächlich schreibt
  (über die neue NEXT-Diagnose sichtbar).
- Ob `session_id` bei einem Neustart stabil und eindeutig ist.
- Ob Koordinaten, Groundspeed, Höhen und Phase zuverlässig aktualisiert werden.
- Ob die Bridge ISA / AGL / Vertikalrate / Bodenkontakt / Triebwerksstatus
  bereitstellt und die Einheiten eindeutig sind.
- Welcher gewählte SIM-Charterauftrag (`AV-SIM-…`) zu welcher Sitzung
  (`session_id`) gehört. **Diese Verknüpfung fehlt derzeit.**
- Für Passagier- und Bordservice: SimRate, Pause, Anschnallzeichen,
  Turbulenzen, Kabinentemperatur und Zeit seit Abflug, soweit verfügbar.
- Mindestens ein tatsächlicher Windows/MSFS-2024-Test mit anschließendem
  Nachweis, welche Felder live eingetroffen sind.

**Sicherheitsgrenze:** Kein automatischer Zugriff auf dein Windows-Dateisystem
durch Vercel. Die Datei bleibt im Browser; nur der gesondert gekoppelte
Windows-Client kann die Server-Dateneingänge verwenden.
