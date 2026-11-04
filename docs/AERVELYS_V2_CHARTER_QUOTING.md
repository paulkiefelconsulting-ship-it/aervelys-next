# AERVELYS NEXT 2.2 – Kommerzieller Charterprozess

## Ziel: Ein kompletter Kundenauftrag statt einzelner Flight-Tracker-Funktionen

In der Business-Aviation wird der Charterpreis aus der gesamten erforderlichen
Flugzeugdisposition kalkuliert: verfügbare Maschine, notwendige Anflug-
oder Folgepositionierungen, kundenführender Flug, Crew, Handling,
sonstige variable Kosten, Risiko sowie beabsichtigter Deckungsbeitrag.

AERVELYS 2.2 baut einen **simulierten**, deterministischen und
nachprüfbaren Ausschnitt daraus. Es werden ausdrücklich keine echten
AOC-, Wetter-, FTL-, Slot- oder Fluggenehmigungsprüfungen behauptet.

## 1. Sales: vollständige, transparente Offerte VOR Annahme

`public.aervelys_v2_run_office` erstellt eine private V2-Angebotsakte in
`sim.v2_quotes` mit folgenden getrennten **Kundenpreiszeilen**:

- Passagier-Charterflug (Blockzeit und variable Modellflugkosten).
- Handling / simuliertes Catering.
- **Notwendiger Anflug-Leerflug** vom tatsächlichen simulierten
  Flugzeugstandort zum Kundenstart (0 PAX), falls erforderlich.
- Gesamtpreis in EUR und klar markierte, unberechnete Steuerbehandlung.

Es ist **ein Gesamtangebot**; ein notwendiger Ferry Flight wird nicht
nach Akzeptanz plötzlich zusätzlich berechnet. Der Angebotstext lässt
sich im Bereich Commercial kopieren, ohne die internen Kosten offenzulegen.

Der Flugzeugtyp und die aktuelle Position werden als **Kalkulationsbasis**,
nicht als bereits real freigegebene Flugzeugregistrierung dargestellt.
Das Angebot ist ein fiktives Angebot mit 48 Stunden Gültigkeit.

**Beispiel (nur Schema, keine echten Preise):**
  Positionierung EDDM–EDAZ; Charter EDAZ–LOWI;
  Handling/Catering; Gesamtpreis; Gültigkeit; SIM-Bedingungen.

Die Positionierung ist erst im Spiel durchzuführen, wenn der Kunde
den gesamten Preis akzeptiert und Dispatch sie tatsächlich disponiert.

## 2. Dispatch: Flugzeugrotation statt Teleportation

- Dispatch bevorzugt einen geeigneten, freien Jet am Kundenabflugort.
- Andernfalls wird eine separate, notwendige Anflugpositionierung
  mit eigenem Jet/Captain und Kosten geplant.
- Ein simuliert abgeschlossener Leerflug versetzt die Maschine erst
  nach manueller Ankunft zum Kundenstart.
- Der ursprüngliche Charter bleibt bis dahin **angenommen**, aber
  nicht unberechtigt als **ready** markiert.
- Exklusive Jet- und Captain-Reservierungen und simuliertes
  Typerating bleiben aktiv.
- Ein Jet kann nach dem Charter am Ziel für einen Folgeauftrag
  bleiben. **Kein pauschal unterstellter Rückflug nach EDAZ**:
  neuer Kunde -> neue benötigte Anflugpositionierung zum aktuellen
  realen SIM-Standort. So wird keine Leerkilometer-Pauschale doppelt
  verkauft.
- Wenn die ausführbare Alternative die intern angesetzte
  Mindestdeckungsbeitragsgrenze von **5 % vor Fixkosten** unterschreitet,
  erstellt Finance eine Prüfmeldung. Dispatch rechnet **nicht**
  den Kundenpreis ungefragt hoch.

### Noch fehlend für vollständige Realitätsnähe

- Zeitfenster mit paralleler Planung, Anschlussflug / echte
  Rückpositionierung als Entscheidungsoption, Slots, NOTAMs,
  Flugdurchführbarkeit, Reichweite, Wetter, Crews mit Duty-/Rest-Times
  sowie reale Flughafen- oder Handlingpreise.
- Eine konsequente sichere Vorschau für alle Flugbewegungen über
  mehrere Tage; in dieser Version nur die notwendige vorangehende
  Positionierung und der nachgelagerte Standortwechsel.
- Keine garantierte Verfügbarkeit beim **Angebot**: nach dem Akzeptieren
  kann Dispatch bei Ressourcenänderungen den Auftrag zurückhalten,
  aber niemals ohne Zustimmung des Kunden nachberechnen.

## 3. Commercial: unveränderlicher akzeptierter Kundenpreis

- Jeder simulierte Auftrag besitzt eine eigene
  `sim.v2_quotes`-Angebotsakte mit Angebotspositionen und Gültigkeit.
- Kundenzusage gilt ausschließlich für den ausgewiesenen
  **Gesamtpreis** und vor Ablauf der Frist.
- Per SQL-Trigger sind sämtliche ausgegebenen
  Angebotskonditionen unveränderlich. Nur der einmalige Übergang
  `offered → accepted / declined / expired` ist erlaubt.
- `sim.v2_requests.quoted_eur` und die akzeptierte Angebotsakte
  werden beim Dispatch gemeinsam geprüft; keine unbemerkte
  Preisänderung oder Nachforderung bei nachträglichem
  Flugzeugwechsel.
- Eine spätere echte Neuverhandlung oder Stornobedingung wird in
  einer Folgeversion als **neue Angebotsrevision** modelliert, nie
  durch rückwirkendes Überschreiben der bestehenden Version.

## 4. Finance: geplante versus gebuchte SIM-Wirtschaftlichkeit

Das Finanzmodul zeigt je abgeschlossenem Charter:
- den ursprünglichen **fixierten Verkaufspreis**,
- die zum Angebotszeitpunkt geschätzten direkten Kosten,
- die nach dem Ferry- und Charterabschluss tatsächlich
  **im SIM-Ledger verbuchten** Positionierungs- und Charterkosten,
- die Kostenabweichung und den daraus folgenden
  **Deckungsbeitrag vor Gemeinkosten**.

**Wichtig:** Diese "gebuchten" Kosten sind bislang **modellierte**
Werte. Sie sind keine tatsächlichen Treibstoffrechnungen oder
bestätigten Kosten des MSFS-Flugs. Auch Monatsgehälter, Leasing,
Versicherungen, Wartungsrücklagen, Steuern und Finanzierung sind
nicht vollumfänglich gebucht. Das Ergebnis ist deshalb
**kein Unternehmensgewinn**.

## Rollen, Sicherheit und Tests

- Browser: nur authentifizierte CEO-/OPS-Überblicks-RPC;
  Schreibaktionen nur aktive CEO-Rolle des jeweiligen
  V2-Unternehmens.
- RLS und keine direkten Browserrechte auf Angebotsakten.
- Datenbank-Trigger verhindert nachträgliche Quote-Manipulation.
- SQL-Kontraktprüfung `db/v2_charter_quote_contract_test.sql`:
  vier Angebotsakten, Budgetentscheidung, geschützte Preisbindung,
  Ferry vor Kundenflug, genau drei Ledger-Buchungen,
  erwartete Marge und Null-Anonym-Zugriff.
- Bestehende V2.0- und V2.1-SQL-Kontraktprüfungen wurden nach
  Migration erneut erfolgreich ausgeführt.
- Testdaten wurden vollständig über Rollback zurückgenommen.
  Es sind keine Kundenangebote ohne Nutzeraktion erstellt worden.
- GitHub CI prüft Quote-/Frontend-Vertrag, TypeScript und
  kompletten Next.js-Produktionsbuild.

## Nächste Ausbaupriorität

1. Ein echtes V2-Szenario im Browser einmal vom Angebot bis Finance
   durchspielen.
2. **Zeitabhängige Rotation:** Flugpläne, Anschlusscharter,
   Rückflug versus "am Ziel bleiben", blockierte Zeitfenster,
   Crew-Dienstplan und operative Freigabestufen.
3. Weitere Angebotsrevisionen und Kundenänderungen mit
   nachvollziehbarer Neukalkulation.
4. Vorläufige Handling-/Airport-Fee-Rates je Flughafen
   mit ausgewiesener Unsicherheit.
5. Erfassung der tatsächlich im SIM gemessenen Verbrauchs-/
   Flugzeiten aus der bestehenden Bridge – **ohne neue Bridge**.
