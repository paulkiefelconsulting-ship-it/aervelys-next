# AERVELYS NEXT – gemeinsames Integrationsziel

Stand: 2026-11-02. Diese Datei beschreibt die **Zielarchitektur**, nicht den Nachweis, dass alle Automationen bereits laufen.

## Produktgrenze

- `aervelys-ops` = bestehendes, separat betriebenes OPS. Keine automatische Migration, kein Schreibzugriff aus NEXT.
- `aervelys-next` = eigenständige **neue** Business-Airline-Simulation mit eigener Supabase-Datenbasis.
- SkyBridge = fachliche Funktionsreferenz, keine technische Abhängigkeit oder Übernahme geschützter Programmteile.
- Alle drei Entwicklungsthemen (Airline-Unternehmen, MSFS/Web-App, SkyBridge-inspirierter Markt) gehören in **ein** NEXT-Produkt.

## Ein durchgehender Geschäftsfall

```text
Kunden-/Charteranfrage (CRM)
  → Sales-Prüfung und simuliertes Angebot
  → Dispatch-Entwurf und verifizierbare Crew-/Flotten-Gates
  → angenommene SIM-Mission und verfügbare Maschine am Standort
  → Pilotenübernahme in MSFS ODER unabhängiger virtueller SIM-Flug
  → SIM-ACARS/Flugbericht + Kabinenservice
  → prüfbare simulierte Gebühren, Rechnung, Firmenledger
  → Kundenreputation / Crew-Zeiten / Wartungsvorgänge
```

Eine `request_id` verbindet die Arbeitsbereiche. Kein einzelner UI-Status darf einen anderen Bereich ohne explizite, geprüfte Bestätigung fortschreiben.

## Erster Integrationsbaustein: CEO Flight Lifecycle

`UnifiedFlightPipeline` ist ein **rein lesender**, gemeinsam nutzbarer Sichtbaustein aus vorhandenen, geschützten RPCs:

| Quelle | Bestehende RPC | Sichtbarer Schritt |
|---|---|---|
| Charter | `aervelys_charter_requests_list` | Anfrage erfasst |
| Disposition | `aervelys_dispatch_plans_list` | Dispositionsentwurf vorhanden |
| SIM-Mission | `aervelys_sim_missions_overview` | Missionsstatus und Flugphase (SIM) |
| Cloud-MSFS | `aervelys_msfs_charter_links_overview` | Sitzungszuordnung als Evidenz |

Sicherheitsregeln:
1. Auch eine bestehende Dispatch-Planung ist **keine** Flugfreigabe.
2. MSFS-Sitzungszuordnung ist **keine** automatische Phasensteuerung, Ankunftsbestätigung oder Abrechnung.
3. Bei einem fehlgeschlagenen RPC wird **„Nicht prüfbar“** statt „Nicht vorhanden“ gezeigt.
4. Nur anhand abgesicherter SIM-Quellen oder eines expliziten `AV-SIM-`-Vorgangscodes wird ein Fall als SIM gekennzeichnet. Nicht bestätigte Vorgänge dürfen nicht in die SIM-Berechnung rutschen.
5. Nur der bestehende Rollen-/RLS-geschützte Client darf Daten abrufen; kein neuer öffentlicher Schreibendpunkt.
6. Keine neuen Geschäftsdatensätze, Flugfreigaben, Mitarbeiterzuweisungen oder Finanzbuchungen durch diese Übersicht.
7. Kein zweiter Datenbestand und kein Kopieren von personenbezogenen Daten nach OPS.

## Nächste Integrations-Gates (in dieser Reihenfolge)

1. **Schema- und Ereignisvertrag:** In NEXT die IDs und Statusübergänge von Charter, Sales, Crew, Flugauftrag, SIM-Mission, MSFS-Evidenz und Finanzen eindeutig dokumentieren und kontraktgetestet lesen. In Konfliktfällen darf es nur einen autoritativen Besitzer des jeweiligen Status geben.
2. **Charter → Mission:** Bereits existierende Angebots- und Dispatch-RPCs wiederverwenden; nur nach geprüfter Annahme einen auditierbaren SIM-Auftrag erzeugen. Verfügbarkeiten, Flugzeugstandort, Reichweite und Type Ratings konservativ behandeln.
3. **Simulator → Nachweis:** Den Windows-Bridge-Client mit MSFS 2024 testen (inkl. Disconnect, Pause, Slew, SimRate, Go-around, falscher Maschine). Nur nach kontrolliertem Pairing aktualisieren; keine unbewiesene Flugphase.
4. **Kabine → Debrief:** Passagierbedürfnisse und Servicehistorie an die SIM-Mission binden; keine künstliche „Live“-Anzeige ohne Telemetrie; Services und Flugende idempotent protokollieren.
5. **Debrief → Firmenledger:** Simulierte Airport-Handling-/Fuel-Rechnungen und Crewkosten kontrolliert, mit Quellenangabe und einmaliger Buchungs-ID an denselben Flug hängen; keine realen Überweisungen.
6. **Autonome Airline:** Kunden, Agenten, Crewwechsel, Wartung, Training und Benachrichtigungen als deterministisch prüfbare, zeitgesteuerte Ereignisse. Menschliche Entscheidungen bei riskanten Freigaben beibehalten.
7. **Gesamttest / Ablösung:** Testfälle inklusive Normalflug, Abbruch, Insolvenz-/Liquiditätsgrenze in der Simulation, fehlendem Rating, überlappender Crew, Wartungssperre und doppelter Rechnung. Erst dann über Ersatz des alten OPS entscheiden.

## Zusammenarbeitsregeln für mehrere Chats/Branches

- Vor jeder Änderung den aktuellen `main` lesen und bestehende Implementierungen nach Funktion suchen.
- Kleine Feature-Branches und Pull Requests mit expliziten beteiligten RPCs, Risiken und Tests; keine parallelen Änderungen am selben Modul ohne Rebase.
- **Keine** neue `aervelys-ops*`-Version als Nebenprodukt eines NEXT-Auftrags.
- Neue Anforderungen erweitern die vorhandenen Module; kein zweites Kabinensystem, kein zweiter Chartermarkt und kein paralleles Firmenledger.
- `main` ist Integrationsquelle. Eine bestandene GitHub-CI bestätigt nur die getesteten Verträge, **keinen** kompletten MSFS-/Browser-/Supabase-End-to-End-Betrieb.
