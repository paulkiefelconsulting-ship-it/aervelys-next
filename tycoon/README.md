# AERVELYS-Tycoon · Simulationskern

Dies ist die **neue, vom bestehenden OPS-Frontend isolierte** Tycoon-Domäne. Die vorhandenen Demo-Komponenten werden nicht überschrieben.

## Leitplanken
- Ein persistenter Spielstand je virtuellem Unternehmen.
- Echtzeit (UTC gespeichert, Europe/Berlin angezeigt), keine künstliche Zeitbeschleunigung.
- Alle Aktionen werden als verifizierte Transaktionen verbucht; Ereignisse idempotent.
- Reale Quellen und **simulierte** Marktwerte getrennt kennzeichnen.
- Keine virtuelle Lizenz gilt als tatsächliche Luftfahrtberechtigung.
- Aervelys startet mit 25.000 EUR, ATPL(A) als virtuelle Ausgangsannahme, 0 Mitarbeitern, 0 Flugzeugen, ohne eigenes AOC.
- Drei getrennte Bereiche: Pilot Services, Charter Brokerage, Private Flying & Training.
- EDAZ ist Startbasis, keine geografische Beschränkung.
- Keine echte automatische MSFS-Anbindung, bis der lokale Connector implementiert und getestet ist.

## Architektur
`schema.sql`: PostgreSQL-Tabellen in separatem Schema `tycoon`. **Noch nicht auf Bestands-Supabase angewandt**.
`engine.ts`: deterministische Domänenfunktionen für Angebote, Berechtigungen und Fälligkeiten (ohne DB-Schreibzugriff).
`catalog.ts`: Grundkatalog für Investitionen, Entwicklung, Genehmigungen und personalbezogene Bedingungen.
`DECISIONS.md`: dokumentierter Umsetzungsstand und weitere Integrationsschritte.

## Sicherheit
Serverseitige Datenbanktransaktionen und Rollenprüfung sind Pflicht, bevor APIs schreibend veröffentlicht werden. Frontend-Code darf keinen Service-Role-Schlüssel enthalten. Für direkte Data-API-Zugriffe muss RLS vollständig konfiguriert sein; dieses Schema erhält zunächst keine öffentlichen Tabellenrechte.
