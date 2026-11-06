// Shared helpers for the Project Hub API (Vercel serverless functions).
// All secrets and company-specific values come from environment variables:
//   LARK_APP_ID, LARK_APP_SECRET  - from your Lark Custom App (Open Platform)
//   LARK_BASE_TOKEN               - the base's app token (bascn...) OR its wiki node token
//   BASE_URL (optional)           - link to open the base in Lark, used when clicking a card
//   FORM_URL (optional)           - link to the request form, used by "+ New Request"
//   LARK_DOMAIN (optional)        - defaults to https://open.larksuite.com

import crypto from 'node:crypto';

export const OPEN = process.env.LARK_DOMAIN || 'https://open.larksuite.com';
const COOKIE = 'ph_session';

// ---------- small cookie helpers (session is encrypted with a key derived from the app secret) ----------
function key() { return crypto.createHash('sha256').update('ph:' + (process.env.LARK_APP_SECRET || '')).digest(); }
export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}
export function unseal(s) {
  try {
    const b = Buffer.from(s, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}
export function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
export function setCookie(res, name, value, maxAge) {
  const prev = res.getHeader('Set-Cookie') || [];
  const list = Array.isArray(prev) ? prev : [prev];
  list.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  res.setHeader('Set-Cookie', list);
}
export function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ---------- Lark auth ----------
export async function appAccessToken() {
  const r = await fetch(`${OPEN}/open-apis/auth/v3/app_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
  });
  const j = await r.json();
  if (!j.app_access_token) throw new Error('Lark app token failed: ' + (j.msg || r.status));
  return j.app_access_token;
}

export async function exchangeCode(code) {
  const app = await appAccessToken();
  const r = await fetch(`${OPEN}/open-apis/authen/v1/oidc/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${app}` },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('Lark login failed: ' + (j.msg || r.status));
  return j.data; // access_token, refresh_token, expires_in, refresh_expires_in
}

async function refresh(sess) {
  const app = await appAccessToken();
  const r = await fetch(`${OPEN}/open-apis/authen/v1/oidc/refresh_access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${app}` },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: sess.rt }),
  });
  const j = await r.json();
  if (j.code !== 0) return null;
  return { at: j.data.access_token, rt: j.data.refresh_token, exp: Date.now() + (j.data.expires_in - 60) * 1000 };
}

export function saveSession(res, d) {
  const sess = { at: d.access_token || d.at, rt: d.refresh_token || d.rt, exp: d.exp || Date.now() + ((d.expires_in || 7200) - 60) * 1000 };
  setCookie(res, COOKIE, seal(sess), 60 * 60 * 24 * 30);
  return sess;
}

// Returns a valid user access token, or sends 401 and returns null.
export async function userToken(req, res) {
  let sess = unseal(readCookie(req, COOKIE) || '');
  if (!sess) { res.status(401).send('login'); return null; }
  if (Date.now() > sess.exp) {
    const n = sess.rt ? await refresh(sess) : null;
    if (!n) { res.status(401).send('login'); return null; }
    sess = saveSession(res, n);
  }
  return sess.at;
}

// ---------- Lark Base reads (as the signed-in user) ----------
export async function lark(token, path, init = {}) {
  const r = await fetch(`${OPEN}/open-apis${path}`, {
    ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (j.code !== 0) { const e = new Error(`Lark API ${path.split('?')[0]}: ${j.msg || r.status}`); e.status = (j.code === 99991668 || j.code === 99991677) ? 401 : 502; throw e; }
  return j.data;
}

let cachedApp = null;
export async function appToken(token) {
  if (cachedApp) return cachedApp;
  const t = process.env.LARK_BASE_TOKEN;
  if (!t) throw new Error('LARK_BASE_TOKEN is not set');
  try {
    const d = await lark(token, `/wiki/v2/spaces/get_node?token=${encodeURIComponent(t)}`);
    if (d?.node?.obj_type === 'bitable' && d.node.obj_token) return (cachedApp = d.node.obj_token);
  } catch { /* not a wiki token, use as-is */ }
  return (cachedApp = t);
}

const DATE_TYPES = new Set([5, 1001, 1002]);
const fmtDate = ms => { const d = new Date(Number(ms) + 7 * 3600e3); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`; };
export function cellToString(v, type) {
  if (v == null) return '';
  if (DATE_TYPES.has(type) && (typeof v === 'number' || /^\d{10,}$/.test(String(v)))) return fmtDate(v);
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const isRichText = v.every(x => x && typeof x === 'object' && 'text' in x && !('name' in x));
    return v.map(x => cellToString(x, type)).filter(Boolean).join(isRichText ? '' : ', ');
  }
  if (typeof v === 'object') {
    if ('value' in v) return cellToString(v.value, type);
    return v.text ?? v.name ?? v.en_name ?? v.link ?? v.full_address ?? '';
  }
  return '';
}

export function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { if (!res.headersSent) res.status(e.status || 500).send(String(e.message || e)); }
  };
}
