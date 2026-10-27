"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url || !key) return setError("Authentifizierung noch nicht eingerichtet.");
    setLoading(true); setError("");
    try {
      const client = createBrowserClient(url, key);
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error) setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
      else window.location.assign("/");
    } catch { setError("Anmeldung aktuell nicht möglich."); }
    finally { setLoading(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-logo">AERVELYS <span>NEXT</span></div>
    <p className="auth-overline">SECURE OPERATIONS ACCESS</p>
    <h1>Willkommen zurück.</h1>
    <p className="auth-description">Melde dich an, um auf das AERVELYS Command Center zuzugreifen.</p>
    {!url || !key ? <div className="auth-error" role="alert">Die Supabase-Authentifizierung ist noch nicht konfiguriert. Das Dashboard bleibt gesperrt.</div> : null}
    <form onSubmit={submit}>
      <label htmlFor="email">E-Mail-Adresse</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@aervelys.com"/>
      <label htmlFor="password">Passwort</label>
      <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button disabled={loading || !url || !key} type="submit">{loading?"Anmeldung läuft …":"Sicher anmelden"}</button>
    </form>
    <small>Kein öffentlicher Registrierungszugang · Interne Testumgebung</small>
  </section></main>;
}
