# AERVELYS-Tycoon · UI-Vorschau

Die neue Corporate-Design-Vorschau liegt unter **/tycoon-preview** (Next.js App Router).
Sie ist absichtlich getrennt von der bestehenden OPS-Startseite, damit bisherige Datenwege nicht unterbrochen werden.

## Design
- Benutzerbereitgestelltes A-Markenlogo (verlustarm als kleine PNG-Daten-URI für die Vorschau)
- Farbpalette: Navy #102A4A; White #FFFFFF; Silver #B9BEC6; Accent Blue #2EA7E0
- Desktop und mobile Navigation, klare Hauptbereiche
- Startwerte: 25.000 EUR, 0 eigene Flugzeuge, 0 Mitarbeiter, kein AOC
- Alle Zahlen und Beispiele aus der vereinbarten virtuellen Gründungsakte; nicht live mit Datenbank verbunden
- Navigierbare Funktionsvorschau und lokale, nicht gespeicherte Aufgabenmarkierungen

## Noch ausstehend
- Vollständiger Build- und Browser-Test in einer installierten Next.js-Umgebung
- Authentifizierung und Firmenzuordnung
- Tycoon-Schema-Migration in ein **gesondert bestätigtes** Supabase-Ziel
- Serveraktionen und persistente Spielprozesse
- Vercel-Projekt: API-Zugriff zur Anlage aktuell 403 Forbidden
- Aktive 24/7-Simulation, MSFS-Connector und echte Operator-Marktdaten

**Keine Produktionsfreigabe:** Die Vorschau darf keine echten Finanztransaktionen, Genehmigungen oder Flugbetriebsvorgänge auslösen.
