/* The cloud backend (Supabase over plain HTTPS, no library). Local-first: every change is saved on the device at once,
   queued, and pushed to the cloud; the cloud is pulled on start, on focus, and every minute. Last write wins, by 'updated'.
   Until she logs in, nothing here runs. */
import { db } from './store.js';

const CFG_KEY = 'bakasun.cloud';
const Q_KEY = 'bakasun.cloud.queue';
let cfg = null, queue = [], timer = null, busy = false;
const listeners = new Set();
export const status = { state: 'off', last: '', error: '' };
function emit() { listeners.forEach(fn => fn(status)); }
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function loadCfg() { try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); queue = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { cfg = null; queue = []; } }
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* blocked */ } }
function saveQueue() { try { localStorage.setItem(Q_KEY, JSON.stringify(queue)); } catch (e) { /* blocked */ } }

export function config() { return cfg ? { url: cfg.url, email: cfg.email, orgId: cfg.orgId, on: !!cfg.token } : null; }
export function isOn() { return !!(cfg && cfg.token && cfg.orgId); }

async function api(path, opts) {
  opts = opts || {};
  const r = await fetch(cfg.url.replace(/\/$/, '') + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + (opts.token || cfg.token || cfg.key), 'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (r.status === 401 && cfg.refresh && !opts.retried) { await refresh(); return api(path, Object.assign({}, opts, { retried: true })); }
  if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function refresh() {
  const r = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cfg.refresh }, token: cfg.key, retried: true });
  cfg.token = r.access_token; cfg.refresh = r.refresh_token; saveCfg();
}

/** Logs in with e-mail and password, finds her org, pulls everything. */
export async function login(url, key, email, password) {
  cfg = { url: url.trim(), key: key.trim(), email: email.trim() };
  const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: cfg.email, password }, token: cfg.key, retried: true });
  cfg.token = r.access_token; cfg.refresh = r.refresh_token; cfg.userId = r.user && r.user.id;
  const m = await api('/rest/v1/members?select=org_id&limit=1');
  if (!m || !m.length) throw new Error('no-org');
  cfg.orgId = m[0].org_id; saveCfg();
  status.state = 'on'; emit();
  await pullAll(); pushLocal(); start();
}
/** Sends her the one-tap sign-in mail (Supabase magic link). Nothing else changes until she taps it. */
export async function sendLink(url, key, email) {
  const r = await fetch(url.replace(/\/$/, '') + '/auth/v1/otp', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), create_user: false, options: { email_redirect_to: location.origin + location.pathname } }) });
  if (!r.ok) throw new Error('otp ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return true;
}
/** A session that arrived without a password: from the pasted mail link (token hash) or from the URL hash after the redirect. */
export async function loginWithLink(url, key, link) {
  cfg = { url: url.trim(), key: key.trim(), email: '' };
  let r;
  if (link.tokenHash) r = await api('/auth/v1/verify', { method: 'POST', body: { type: link.type || 'magiclink', token_hash: link.tokenHash }, token: cfg.key, retried: true });
  else if (link.accessToken) { r = { access_token: link.accessToken, refresh_token: link.refreshToken }; r.user = await api('/auth/v1/user', { token: link.accessToken, retried: true }); }
  else throw new Error('no-link');
  cfg.token = r.access_token; cfg.refresh = r.refresh_token; cfg.userId = r.user && r.user.id; cfg.email = (r.user && r.user.email) || '';
  const m = await api('/rest/v1/members?select=org_id&limit=1');
  if (!m || !m.length) { cfg = null; throw new Error('no-org'); }
  cfg.orgId = m[0].org_id; saveCfg();
  status.state = 'on'; emit();
  await pullAll(); pushLocal(); start();
  return cfg.email;
}
export function logout() { cfg = null; queue = []; try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(Q_KEY); } catch (e) { /* */ } clearInterval(timer); status.state = 'off'; emit(); }

/** Everything on the device that the cloud may not have (first login on a phone that already has data). */
function pushLocal() {
  const snap = db.snapshot();
  Object.keys(snap).forEach(col => { if (Array.isArray(snap[col])) snap[col].forEach(o => enqueue({ col, id: o.id, data: o })); });
  Object.keys(snap.settings || {}).forEach(k => enqueue({ setting: k, value: snap.settings[k] }));
  flush();
}
export function enqueue(item) {
  if (!isOn()) return;
  queue = queue.filter(q => !(q.col === item.col && q.id === item.id && q.setting === item.setting));
  queue.push(item); saveQueue();
  clearTimeout(enqueue._t); enqueue._t = setTimeout(flush, 400);
}
export async function flush() {
  if (!isOn() || busy || !queue.length) return;
  busy = true; status.state = 'syncing'; emit();
  try {
    const docs = queue.filter(q => q.col).map(q => ({ id: q.id, org_id: cfg.orgId, col: q.col, data: q.data, deleted: !!q.deleted, updated: q.data && q.data.updated ? q.data.updated : new Date().toISOString() }));
    if (docs.length) await api('/rest/v1/docs?on_conflict=org_id,col,id', { method: 'POST', body: docs, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    const sets = queue.filter(q => q.setting).map(q => ({ org_id: cfg.orgId, key: q.setting, value: q.value == null ? '' : String(q.value) }));
    if (sets.length) await api('/rest/v1/settings?on_conflict=org_id,key', { method: 'POST', body: sets, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    queue = []; saveQueue(); status.state = 'on'; status.last = new Date().toISOString(); status.error = '';
  } catch (e) { status.state = 'error'; status.error = String(e.message || e); }
  busy = false; emit();
}
/** Pulls what changed since the last pull (or everything) and merges it in, newest 'updated' wins. */
export async function pullAll() {
  if (!isOn()) return;
  const since = cfg.since ? '&updated=gt.' + encodeURIComponent(cfg.since) : '';
  const rows = await api('/rest/v1/docs?select=id,col,data,deleted,updated&org_id=eq.' + cfg.orgId + since + '&order=updated.asc&limit=5000');
  const sets = await api('/rest/v1/settings?select=key,value&org_id=eq.' + cfg.orgId);
  db.mergeRemote(rows || [], sets || []);
  if (rows && rows.length) { cfg.since = rows[rows.length - 1].updated; saveCfg(); }
}
function start() {
  clearInterval(timer);
  timer = setInterval(() => { pullAll().catch(() => {}); flush(); }, 60000);
  window.addEventListener('focus', () => { pullAll().catch(() => {}); flush(); });
  window.addEventListener('online', flush);
}

loadCfg();
if (isOn()) { status.state = 'on'; pullAll().catch(e => { status.state = 'error'; status.error = String(e.message || e); emit(); }); flush(); start(); }

/* ---- files in the cloud (Supabase Storage): receipts and invoices she photographs ---- */
/** Uploads a blob to bucket/path (overwrites). Returns true when it is there. */
export async function uploadFile(bucket, path, blob) {
  if (!isOn()) return false;
  const r = await fetch(cfg.url.replace(/\/$/, '') + '/storage/v1/object/' + bucket + '/' + path, { method: 'POST', headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.token, 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob });
  if (r.status === 401 && cfg.refresh) { await refresh(); return uploadFile(bucket, path, blob); }
  return r.ok;
}
/** A link that opens the file for `seconds` (default 14 days), for the mail to the accountant. */
export async function signedUrl(bucket, path, seconds) {
  if (!isOn()) return '';
  const r = await api('/storage/v1/object/sign/' + bucket + '/' + path, { method: 'POST', body: { expiresIn: seconds || 14 * 24 * 3600 } });
  return r && r.signedURL ? cfg.url.replace(/\/$/, '') + '/storage/v1' + r.signedURL : '';
}
export async function downloadFileBlob(bucket, path) {
  if (!isOn()) return null;
  const r = await fetch(cfg.url.replace(/\/$/, '') + '/storage/v1/object/' + bucket + '/' + path, { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.token } });
  return r.ok ? r.blob() : null;
}
export function orgId() { return cfg && cfg.orgId; }
