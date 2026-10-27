# AERVELYS NEXT – Betriebs- und Freigabeplan

## Architektur
- Next.js-Frontend in diesem Repository
- Vercel für Preview/Deployment (Deployment Protection aktivieren)
- Separates Supabase-Projekt `riimypgvjzyfyzljerfs`
- Interne Unternehmensdaten bleiben im Schema `sim`
- Freigegebene Dashboard-Abfragen erfolgen ausschließlich über `public.aervelys_dashboard_snapshot()` und `public.aervelys_inbox_list()`, beide mit Berechtigungsprüfung `auth.uid()`.
- **Keine** Supabase-Service-Role-Keys, Datenbankpasswörter oder privaten Tokens im Browser.

## Startvoraussetzungen
1. Vercel-Umgebung: `NEXT_PUBLIC_SUPABASE_URL` und öffentlicher `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Niemals den Service-Role-Key eintragen.
2. Supabase Auth: Benutzer **administrativ** anlegen; offene Selbstregistrierung deaktivieren.
3. Ein Administrator ordnet die konkrete Auth-User-ID in `sim.app_user_roles` der passenden Rolle zu und setzt `active=true`. Keine automatische Vergabe von CEO-Rechten bei Registrierung.
4. Anschließend Anmeldung, Logout, Berechtigung und Fehlerfälle als reale Benutzer prüfen. Verifizieren, dass anonyme und nicht freigeschaltete Benutzer keine Daten abrufen können.
5. Vercel Deployment Protection prüfen, bevor das Projekt zugänglich gemacht wird.

## Rollen
CEO/OPS dürfen den Posteingang lesen; andere aktivierte Rollen sehen nur die für sie zugelassene Dashboard-Zusammenfassung. Alle Bearbeitungsaktionen sind **noch nicht** freigegeben. Keine Tabellen werden direkt dem Browser aus dem privaten Schema `sim` zugänglich gemacht.

## Derzeit sichtbare 13 Arbeitsbereiche
Flotte & Flugplanung; Crew & HR; Charter & Angebote; Posteingang; Wartung EDAZ; Finanzen & Verträge; Training Center; Hangars & Immobilien; KI & Automatisierung; CEO-Dashboard; Sicherheit & Benutzerverwaltung; Infrastruktur & Deployment; MSFS 2024.

## Noch nicht erfüllt
- Fachlich vollständige rollenbasierte Bearbeitung und nachvollziehbare Benutzer-Auditierung
- Authentifizierter Live-Test auf Vercel, automatisierter Next.js-Build und E2E-Tests
- E-Mail-Eingang, Anhänge, sichere Inbound-Verarbeitung
- Qualifikations-, Wartungs- und Performance-Freigaben
- Integrations- und Regressionstests sämtlicher Unternehmensmodule
- MSFS-Synchronisation, KI-Mitarbeiter und Hangarbau

Alle Flugzeuge bleiben im Onboarding, Betriebsfreigaben werden nicht erfunden.
