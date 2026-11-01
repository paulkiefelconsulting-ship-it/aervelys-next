# AERVELYS NEXT · schlanker Release-Prozess

## Warum

Am 1. November 2026 wurden für AERVELYS NEXT mindestens 100 Vercel-Deployments
innerhalb von knapp 20 Stunden registriert. Der größte Anteil waren Previews
für einzelne Feature-Commits. Vercel verweigerte zusätzliche API-Deployments
mit `402 api-deployments-free-per-day`.

## Dauerhafte Projekteinstellung

**Vercel Projekt:** `aervelys-next` (`prj_VrKLb6RvqZS4P0YS9XK0g1C92ORP`).

- `previewDeploymentsDisabled: true` über die offizielle
  Vercel-Projekteinstellung gesetzt.
- `main` bleibt der Produktionsbranch. Keine Änderung an
  bestehenden Live-Domains oder an der Windows-MSFS-Bridge.
- Für ein bewusst benötigtes visuelles Preview kann die Option
  **zeitweise** wieder aktiviert werden; vorher einen gesamten Feature-Stand
  zusammenfassen, damit nicht jeder Zwischencommit ein Deployment erzeugt.
- Das Abschalten zukünftiger Previews entfernt weder bestehende Deployments
  noch setzt es das Vercel-24-Stunden-Kontingent zurück.

## Standardablauf

1. Änderungen lokal oder in einem Feature-Branch sammeln. Keine
   `main`-Commits nur für Zwischenschritte.
2. Vor allem an der Windows-Bridge parallel arbeitende Chats prüfen, ob
   sich die Basisversion zwischenzeitlich verändert hat.
3. Einen Pull Request mit allen zusammengehörenden Änderungen erstellen.
4. GitHub Actions `AERVELYS NEXT release checks` prüft automatisch:
   `npx tsc --noEmit` und `npm run build`. Der Test verwendet nur
   synthetische öffentliche Build-Konfiguration – **keine Secrets** und
   verursacht **keinen Vercel-Deploy**.
5. Wenn die Checks grün sind, PR nach `main` mergen.
   Normalerweise genau **ein Production-Deployment** pro gebündeltem Merge.
6. In Vercel den auf die Produktionsdomain gebundenen **exakten Commit-SHA**
   kontrollieren. Erst dann eine neue Funktion als online melden.
7. Falls `402 api-deployments-free-per-day`: keine wiederholten
   Auslöseversuche. Warten, bis das rollierende Kontingent wieder frei ist,
   danach **einen** gezielten Produktionsbuild auslösen.
   **Keine kostenpflichtige Planänderung** ohne Nutzerfreigabe.

## Release-Checkliste

- [ ] Feature-Branch ist aktuell und Konflikte sind geklärt
- [ ] CI-TypeScript-Check erfolgreich
- [ ] CI-Next-Produktionsbuild erfolgreich
- [ ] Falls DB-Migrationen nötig: einzeln angewandt und getestet
- [ ] SIM-only/Rollenrechte und bestehende Daten unverändert geprüft
- [ ] Ein gebündelter Merge nach `main`
- [ ] Vercel-Produktionsdeployment READY und SHA stimmt mit `main` überein
- [ ] Browser-Check der tatsächlich ausgelieferten Funktionen

**Grenzen:** Ohne Vercel Preview ist ein visueller Live-E2E-Test vor dem
Merge nicht automatisch vorhanden. GitHub CI prüft Build und Typen,
aber keine Browserinteraktion. Für risikoreiche Änderungen muss ein
gezielter manueller E2E-Test eingeplant werden.
