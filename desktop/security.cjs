'use strict';

// Only NEXT's real HTTPS origin is allowed to render inside the privileged app window.
// Allowlisted trusted services may be opened in the system browser, never embedded.
const NEXT_URL = 'https://aervelys-next-paulkiefelconsulting-9108.vercel.app/';
const HOME = new URL(NEXT_URL);
const TRUSTED_EXTERNAL_HOSTS = new Set([
  'simbrief.com', 'www.simbrief.com', 'dispatch.simbrief.com',
  'navigraph.com', 'www.navigraph.com',
  'github.com', 'www.github.com'
]);

function parseHttps(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function isInternal(raw) {
  const url = parseHttps(raw);
  return url !== null && url.origin === HOME.origin;
}

function isExternalAllowed(raw) {
  const url = parseHttps(raw);
  return url !== null && TRUSTED_EXTERNAL_HOSTS.has(url.hostname);
}

module.exports = {NEXT_URL, HOME, isInternal, isExternalAllowed};
