# AERVELYS NEXT — optionaler SIM-Cloud-Phasenabgleich

Diese Funktion verbindet den **bereits bestehenden Cloud-MSFS-Gerätekopplungskanal**
mit einer laufenden **AV-SIM-Chartermission**. Sie baut **keine zusätzliche
Windows-Bridge** und steuert keine realen Luftfahrzeug- oder Finanzdaten.

## Bedienung

1. MSFS 2024 und deine vorhandene Windows-Bridge starten.
2. In **MSFS-Integration** das Gerät über den bestehenden 5-Minuten-Code
   an die Cloud koppeln. Die lokale `telemetry.json` alleine reicht nicht.
3. In **SIM-Flugbetrieb & Kabine** aus einer vorhandenen virtuellen Anfrage
   eine Mission vorbereiten, starten und die **serverseitig empfangene**
   MSFS-Sitzung zuordnen.
4. Unter **MSFS-Phasenabgleich & Kabinenstatus** wird die gespeicherte
   Missionsphase mit der letzten Cloud-Phase verglichen.
5. **Einmal abgleichen** oder **Auto-Sync aktivieren** drücken.
   Auto-Sync läuft nur solange die Webansicht offen und das Opt-in aktiv ist.
6. Bei fehlender oder widersprüchlicher Evidenz bleibt die Missionsphase
   unverändert. **Auto-Sync stoppen** beendet die Abgleichaufrufe sofort.

## Welche Flugphasen übernommen werden

- TAXI_OUT → taxi_out
- TAKEOFF → takeoff
- CLIMB → climb
- CRUISE → cruise
- DESCENT → descent
- APPROACH → approach
- LANDING → landing
- TAXI_IN → taxi_in

Es werden nur **direkte nächste Schritte** übernommen. `PARKED` und
`UNKNOWN` starten **keine** Mission, und es gibt **keine automatische
Ankunft oder Debrief**. Fehlende Zwischenschritte benötigen eine manuelle
Prüfung. Bei Durchstarten, Rücksprung oder inkonsistenter Reihenfolge
ändert AERVELYS keine Phasen.

## Geprüfte Voraussetzungen pro Schreibzugriff

- Authentifizierte, aktive CEO-/OPS-Rolle.
- Laufende AV-SIM-Mission, exklusiv auf Datensatzebene gesperrt.
- Aktive Cloud-Geräteverknüpfung zum eingeloggten Benutzer; Gerät darf
  nicht widerrufen sein.
- **Zwei aktuellste Cloud-Samples** derselben Gerät-/Session-ID mit
  identischer Flugphase, beide nicht älter als 45 Sekunden und
  plausiblen `observed_at`-Zeitstempeln.
- Eine parallel laufende lokale Trainings-Bridge mit frischem Heartbeat
  darf die Mission nicht gleichzeitig steuern.
- Es darf ausschließlich ein unmittelbar auf die bestehende Missionsphase
  folgender Schritt geschrieben werden.
- Jeder gültige Phasenwechsel wird im bestehenden SIM-Missionsprotokoll
  mit Gerät, Session, Messwert-IDs, vorheriger/folgender Phase und
  `source=cloud_msfs_opt_in_unverified` protokolliert.
- Kein Passagier-, Crew-, Standort-, Freigabe- oder Finanz-Update aus
  einem Cloud-Phasenwechsel. Die schon vorhandene separate Kabinenuhr
  arbeitet unabhängig weiter.

## Kabinenstatus

Im Flight-Experience-Panel wird eine eventuelle Abweichung zwischen
AERVELYS-SIM-Phase und frischer Cloud-Phase sichtbar. Bei Abweichung
wird empfohlen, den Service zurückzustellen. Die bestehende
serverseitige Service-RPC erzwingt unabhängig davon die üblichen
Boarding-/Cruise-Regeln.

Noch **nicht** vorhanden sind geprüfte Turbulenz- und Anschnallzeichen-
Informationen, Kabinentemperatur, Simulatorpausen-/SimRate-Synchronisierung,
automatischer Ankunftsnachweis sowie flugbetriebliche Freigaben.

## Tests

- `db/sim_cloud_phase_sync_contract_test.sql` wurde gegen die echte
  NEXT-Supabase-Datenbank ausgeführt, aber alle synthetischen Daten per
  Rollback zurückgenommen.
- Prüft: keine Session, nur eine Sample, zwei bestätigte Samples,
  idempotente Wiederausführung, unzulässiger Phasensprung, alte
  Zeitstempel, pausierte Mission, anonyme Ablehnung, Audit.
- `db/sim_cloud_phase_sync_audit.sql` kontrolliert direkte Browserrechte
  und unveränderten bisherigen SIM-Cron.
- GitHub führt den TypeScript- und Next.js-Produktionsbuild aus.
- Ein tatsächlicher Windows-/MSFS-2024-Liveflug ist noch erforderlich.
