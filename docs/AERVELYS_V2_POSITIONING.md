# AERVELYS NEXT 2.1 — Dispatch, Ferry Flights und wirtschaftliche Transparenz

## Warum diese Erweiterung?

In V2.0 blieb ein angenommener Charterauftrag liegen, sobald das
passende Flugzeug an einem anderen Flughafen stand. Ein virtueller
Businessjet darf nicht einfach an den Kundenabflugort teleportiert
werden. V2.1 bildet **eigene Positionierungsflüge** ab.

## Arbeitsablauf

1. **Commercial** erstellt eine SIM-Charteranfrage. Sales berücksichtigt
   bei der unverbindlichen Preisberechnung auch die geschätzten Kosten
   für notwendige Leerpositionierungen.
2. Der fiktive Kunde nimmt das Angebot an oder lehnt es ab, wenn das
   individuelle Budget nicht reicht.
3. **Dispatch** prüft in Reihenfolge:
   - freie Businessjets mit ausreichenden Sitzen;
   - aktuelle tatsächliche **simulierte** Jet-Position;
   - mindestens einen verfügbaren virtuellen Captain mit passendem
     Muster-Rating;
   - exklusive Crew-/Jet-Reservierungen (Unique-Indexes und Sperren).
4. Befindet sich ein geeigneter Jet am Kundenstart, wird der
   Charterauftrag wie bisher disponiert. Andernfalls wird ein
   **eigener Leerflug** von der Jet-Position zum Kundenstart geplant.
5. Unter **My Flights** kannst du den Ferry Flight selbst übernehmen
   oder dem virtuellen Captain zuweisen. Der Flug muss explizit als
   gestartet und anschließend als angekommen bestätigt werden.
6. Erst die bestätigte **SIM-Ankunft** versetzt den Jet zum Ziel.
   Dabei werden nur geschätzte Positionierungskosten gebucht:
   **0 Passagiere, 0 Ferry-Erlöse**.
7. Danach startet die Büroautomatik erneut. Der Charterauftrag
   übernimmt denselben Jet und denselben zugewiesenen fiktiven Captain,
   wird für „My Flights“ freigegeben und kann seinerseits geflogen
   beziehungsweise delegiert werden.
8. Erst nach dem explizit bestätigten Charterabschluss entstehen
   Charterumsatz und direkte Charterflugkosten.

## Datenmodell

- `sim.v2_airport_reference`: Kuratierte Flughafenpositionen
  EDAZ, EDDB, EDDH, EDDM, LOWI und LFMN, auf Grundlage der frei
  nutzbaren OurAirports-Daten, **nur für ungefähre Spielplanung**.
- `sim.v2_estimate_ferry_hours(from,to)`: Großkreisentfernung und
  fiktive Zeitformel (0,30 h Boden-/Pufferzeit, 320 kt simulierte
  Reisegeschwindigkeit, in 15-Minuten-Schritten aufgerundet,
  mindestens 0,5 h). Nicht zur Flugnavigation geeignet.
- `sim.v2_ferry_legs`: Eigenständige, kundenseitig **unbezahlte**
  Leerflüge mit Captain, Flugzeug, Start/Ziel, Kostenannahme,
  CEO-Pilotwahl und Zustand `planned → in_flight → arrived → linked`.
- `sim.v2_ledger` wurde um `positioning` erweitert.
  Diese Kosten werden ausschließlich nach dem explizit bestätigten
  Leerflugabschluss gebucht.
- Eindeutige aktive Reservierungen verhindern doppelte Flotten- und
  Crewzuordnung zu Charterflügen und Ferry-Flügen.
- Bereits bestehende `sim.v2_requests` und alten NEXT-1.0-Tabellen
  bleiben erhalten.

## Was V2.1 bewusst nicht behauptet

- Airport-Koordinaten sind **keine aktuellen Flugplatzdaten**;
  keine IFR-Route, kein NOTAM, Wetter, Handling-Angebot, Treibstoff-
  /Payload-Berechnung oder bestätigter Luftfahrtpreis.
- Die Formel ist ein vereinfachter Kostentreiber; Monatsgehälter,
  Wartungen, Leasing, echte Gebühren, Dienstzeiten und
  buchhalterische Steuern werden noch nicht periodisch gebucht.
- Ein bestätigter SIM-Start beziehungsweise -Abschluss ist eine
  **manuelle Spielaktion**, keine durch MSFS 2024 verifizierte
  Flugbewegung. Bestehende Windows-Bridge bleibt unberührt.
- Fiktive Piloten-Ratings sind selbst angelegte SIM-Profile und
  keine echte Lizenzprüfung.
- Mitarbeiter arbeiten aktuell **regelbasiert auf Knopfdruck**.
  Eine künftige kontrollierte Mitarbeiterautomatik kann hierauf
  aufbauen. Neue reale Zahlungs- oder Reservierungsdienste
  werden nicht angesprochen.

## Tests

- `db/v2_airline_core_contract_test.sql`: bestehender V2.0
  Geschäftslauf bleibt erfolgreich.
- `db/v2_dispatch_positioning_contract_test.sql`:
  vier alte Kundenfälle, zwei reguläre Flüge zum Standortwechsel,
  zusätzliche preislich tragfähige Charteranfrage, ein separater
  kostender Ferry Flight, CEO-Pilotwahl, Start, Ankunft, nur
  Kostenerfassung, Schutz gegen doppelte Abrechnung, anschließend
  Charterdisposition und Charterabschluss. Alle künstlichen
  Testdaten vollständig per SQL-Rollback entfernt.
- `db/v2_dispatch_positioning_security_audit.sql`:
  private Tabelle, verweigerte anonyme RPCs, keine direkten
  Browser-Lese-/Schreibrechte, keine bleibenden Testdaten.
- GitHub führt TypeScript, Produktionsbuild und den zusätzlichen
  Offline-Codevertragstest aus.

## Weiterer Ausbau

Als nächstes: **Flottenverfügbarkeit nach Zeitfenster statt nur
gleichzeitigen offenen Aufträgen**, reale SimBrief-Flugplanung
an die vorhandene Bridge anschließen und nachvollziehbare
Monatsfixkosten/SIM-Dienstpläne. Nicht mehrere neue Systeme parallel.
