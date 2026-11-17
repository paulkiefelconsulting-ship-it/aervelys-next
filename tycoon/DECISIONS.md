# Umsetzungsstatus und Architekturentscheidungen

## Verbunden
- GitHub: aervelys-next, eigener Entwicklungszweig `feature/tycoon-core`.
- Bestehende OPS-Projekte bleiben unverändert.
- Supabase: bestehende Projekte gefunden, **keines als Tycoon-Ziel bestätigt**. Schema liegt nur im Repository.
- Vercel: Deployment-/Projektverknüpfung gesondert prüfen.

## Fertig in dieser Änderung
- Erster überprüfbarer Tycoon-Domänenkern: Preiskalkulation, Pilot-/Flughafenprüfung, fällige Ereignisse.
- Grundkatalog einschließlich aller fünf festgelegten Kandidatinnen und standortunabhängiger Immobilien.
- Isolierter PostgreSQL-Schemaentwurf mit RLS, idempotenten Ereignissen und Buchungsjournal.
- Der Startspielstand ist definiert (25.000 EUR, ATPL, ohne AOC).

## Nicht fertig
- UI-Integration und persistente API/Transaktionen
- Server-Worker für 24/7-Ereignisse und autonome Kunden
- Vollständige Simulation von Bank, Versicherung, Personal, Konkurrenz und Genehmigungen
- MSFS-2024-Desktop-Bridge und Flugvalidierung
- Geprüfte Live-Datenquellen sowie Betriebs- und Sicherheitsabnahmen

Keine öffentliche Schreib-API ohne Authentifizierung und Berechtigungsprüfung freischalten.
