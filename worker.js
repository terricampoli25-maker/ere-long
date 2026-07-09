// Ere Long — gate worker.
// Serves the app only to browsers that have unlocked with a valid serial.
// Serials are issued by the serial-activation license service (Stripe webhook
// → serial emailed to buyer); this worker validates them against that
// service's /activate endpoint (which enforces the 2-device limit) and then
// sets a signed session cookie so the check happens only once per device.
//
// Bindings (see wrangler.jsonc): ASSETS, LICENSE_API, PRODUCT_CODE.
// Secret: SESSION_SECRET — set with `wrangler secret put SESSION_SECRET`.

const COOKIE = 'erelong_s';
const SESSION_DAYS = 365;

// Files the unlock page itself needs — everything else requires a session.
// ('/unlock' is the clean URL the asset server redirects /unlock.html to.)
const PUBLIC_FILES = new Set(['/unlock', '/unlock.html', '/unlock.js', '/styles.css', '/manifest.json', '/favicon.ico']);
const PUBLIC_DIRS = ['/fonts/', '/icons/'];

const enc = new TextEncoder();
const toHex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(value)));
}

async function makeSession(secret) {
  const payload = btoa(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${payload}.${await hmacHex(payload, secret)}`;
}

async function hasValidSession(request, secret) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)erelong_s=([^;]+)/);
  if (!m) return false;
  const dot = m[1].lastIndexOf('.');
  if (dot < 1) return false;
  const payload = m[1].slice(0, dot), sig = m[1].slice(dot + 1);
  if (await hmacHex(payload, secret) !== sig) return false;
  try { return JSON.parse(atob(payload)).exp > Date.now(); } catch { return false; }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

async function handleUnlock(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const serial = String(body?.serial || '').trim().toUpperCase();
  const machineId = String(body?.machineId || '').trim();
  if (!/^[A-Z0-9-]{10,64}$/.test(serial)) return json({ error: 'That does not look like a serial number' }, 400);
  if (!machineId || machineId.length > 100) return json({ error: 'Missing device id' }, 400);

  let res, data;
  try {
    res = await fetch(`${env.LICENSE_API}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, machineId }),
    });
    data = await res.json();
  } catch {
    return json({ error: 'The gatekeeper could not be reached. Try again shortly.' }, 502);
  }
  if (!res.ok) return json({ error: data?.error || 'Activation failed' }, res.status);
  if (env.PRODUCT_CODE && data.product !== env.PRODUCT_CODE) {
    return json({ error: 'That serial belongs to a different product' }, 403);
  }

  const session = await makeSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE}=${session}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/unlock') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleUnlock(request, env);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const isPublic = PUBLIC_FILES.has(path) || PUBLIC_DIRS.some(d => path.startsWith(d));
    if (!isPublic && !(await hasValidSession(request, env.SESSION_SECRET))) {
      const wantsPage = (request.headers.get('Accept') || '').includes('text/html');
      if (wantsPage) return Response.redirect(new URL('/unlock', url).toString(), 302);
      return json({ error: 'Locked' }, 403);
    }
    return env.ASSETS.fetch(request);
  },
};
