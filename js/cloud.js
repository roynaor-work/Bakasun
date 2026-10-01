/* The cloud backend (Supabase over plain HTTPS, no library). Local-first: every change is saved on the device at once,
   queued (the queue survives a reload), and pushed to the cloud; the cloud is pulled on start, on focus, and every minute.
   Two devices at once (her phone and her computer, Roy's phone):
   - a record edited on both sides is merged field by field against the version both started from (the 'base' kept with
     the queued change); when both touched the same field the newer edit wins and a conflict note is kept in status.conflicts;
   - a delete is a tombstone (deleted=true row); a newer tombstone beats an older edit and the other way round;
   - a 401 refreshes the session once (refresh token, single flight); when that fails the session is 'expired' and the
     queue waits for the next sign-in; a 429 / 5xx / no network retries with backoff (Retry-After honoured);
   - 'history' entries older than 30 days and their trimming (tombstones) stay on the device; a setting over 300 KB too;
   - 'updated' is never sent: the server stamps it, so a device with a wrong clock cannot hide rows from the others.
   Until she logs in, nothing here runs. */
import { db as localDb } from './store.js';

const CFG_KEY = 'bakasun.cloud';
const Q_KEY = 'bakasun.cloud.queue';
export const HISTORY_DAYS = 30;            // history entries older than this are not synced
export const SETTING_MAX = 300 * 1024;     // a setting value longer than this (a huge signature image) stays on the device
const CHUNK = 200;                         // docs per POST
const PAGE = 1000;                         // rows per pull page
const OVERLAP_MS = 5 * 60 * 1000;          // every pull starts this much before the last seen row: a row that landed with an earlier stamp is not missed
const MAX_BACKOFF = 5 * 60 * 1000;
const MAX_NOTES = 20;
/* Settings that belong to one device: the UI language, the notification cache (rebuilt every five minutes). */
export const SKIP_SETTINGS = ['lang', 'notifyCache'];
const JSON_MARK = 'json:';                 // a non-string setting travels as 'json:' + JSON, and comes back with its type
/* What the tests swap: the store, the clock. fetch is read from globalThis at call time for the same reason. */
export const hooks = { db: localDb, now: () => Date.now() };
const now = () => hooks.now();
const nowIso = () => new Date(now()).toISOString();

let cfg = null, queue = [], timer = null, busy = false, listening = false, refreshing = null, flushTimer = null;
const shadow = new Map(); // col:id → JSON of the last version seen in sync with the cloud: the base of a three-way merge
const listeners = new Set();
export const status = { state: 'off', last: '', error: '', queued: 0, attempt: 0, retryAt: 0, expired: false, conflicts: [], failed: 0, skipped: [], fileError: '' };
function emit() { status.queued = queue.length; listeners.forEach(fn => { try { fn(status); } catch (e) { /* a screen must not break the sync */ } }); }
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function loadCfg() {
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); queue = JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { cfg = null; queue = []; }
  if (!Array.isArray(queue)) queue = [];
  status.conflicts = (cfg && cfg.conflicts) || []; status.failed = ((cfg && cfg.failed) || []).length; status.queued = queue.length;
}
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* blocked */ } }
function saveQueue() { status.queued = queue.length; try { localStorage.setItem(Q_KEY, JSON.stringify(queue)); } catch (e) { /* blocked or full: the queue lives on in memory */ } }
const unref = t => { if (t && typeof t.unref === 'function') t.unref(); return t; };
function scheduleFlush(ms) { clearTimeout(flushTimer); flushTimer = unref(setTimeout(() => flush(), Math.max(0, ms || 0))); }

export function config() { return cfg ? { url: cfg.url, email: cfg.email, orgId: cfg.orgId, on: !!cfg.token } : null; }
export function isOn() { return !!(cfg && cfg.token && cfg.orgId); }
export function orgId() { return cfg && cfg.orgId; }
const base = () => cfg.url.replace(/\/$/, '');
const fetchFn = (url, opts) => globalThis.fetch(url, opts);

/* ---------------- requests, session, retry ---------------- */
function fail(msg, code, retryAfter) {
  const e = new Error(msg); e.status = code || 0; e.retryAfter = Number(retryAfter) || 0;
  e.retryable = !code || code === 408 || code === 425 || code === 429 || code >= 500;
  return e;
}
const expiredErr = () => { const e = fail('session-expired', 401); e.retryable = false; return e; };
function markExpired() { status.expired = true; status.state = 'error'; status.error = 'session-expired'; }
/** Retry delay: Retry-After when the server names one, else 2s, 4s, 8s... up to five minutes. */
export function backoffMs(attempt, retryAfterSec) {
  if (retryAfterSec > 0) return Math.min(MAX_BACKOFF, retryAfterSec * 1000);
  return Math.min(MAX_BACKOFF, 2000 * Math.pow(2, Math.max(0, (attempt || 1) - 1)));
}

async function api(path, opts) {
  opts = opts || {};
  let r;
  try {
    r = await fetchFn(base() + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + (opts.token || cfg.token || cfg.key), 'Content-Type': 'application/json' }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) { throw fail(path + ' network: ' + (e && e.message || e), 0); }
  if (r.status === 401 && !opts.retried && !opts.token) { await refreshToken(); return api(path, Object.assign({}, opts, { retried: true })); }
  if (!r.ok) throw fail(path + ' ' + r.status + ' ' + String(await r.text()).slice(0, 200), r.status, r.headers && r.headers.get ? r.headers.get('Retry-After') : 0);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
/** One refresh at a time: two requests that hit 401 together share it (a refresh token is single-use). */
function refreshToken() {
  if (refreshing) return refreshing;
  const p = (async () => {
    if (!cfg || !cfg.refresh) { markExpired(); throw expiredErr(); }
    let r;
    try { r = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cfg.refresh }, token: cfg.key, retried: true }); }
    catch (e) { if (e.retryable) throw e; markExpired(); throw expiredErr(); }
    if (!r || !r.access_token) { markExpired(); throw expiredErr(); }
    cfg.token = r.access_token; if (r.refresh_token) cfg.refresh = r.refresh_token; status.expired = false; saveCfg();
  })();
  refreshing = p; p.then(() => { refreshing = null; }, () => { refreshing = null; });
  return p;
}
async function afterLogin(r) {
  cfg.token = r.access_token; cfg.refresh = r.refresh_token; cfg.userId = r.user && r.user.id;
  const m = await api('/rest/v1/members?select=org_id&limit=1');
  if (!m || !m.length) { cfg = null; throw new Error('no-org'); }
  cfg.orgId = m[0].org_id; saveCfg();
  status.state = 'on'; status.error = ''; status.expired = false; status.attempt = 0; status.retryAt = 0; emit();
  initShadow();
  await pullAll(); pushLocal(); start();
}

/** Logs in with e-mail and password, finds her org, pulls everything. */
export async function login(url, key, email, password) {
  cfg = { url: url.trim(), key: key.trim(), email: email.trim() };
  const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: cfg.email, password }, token: cfg.key, retried: true });
  await afterLogin(r);
}
/** Sends her the one-tap sign-in mail (Supabase magic link). Nothing else changes until she taps it. */
export async function sendLink(url, key, email) {
  const r = await fetchFn(url.replace(/\/$/, '') + '/auth/v1/otp', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), create_user: false, options: { email_redirect_to: location.origin + location.pathname } }) });
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
  cfg.email = (r.user && r.user.email) || '';
  await afterLogin(r);
  return cfg.email;
}
export function logout() {
  cfg = null; queue = []; shadow.clear();
  try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(Q_KEY); } catch (e) { /* */ }
  clearInterval(timer); clearTimeout(flushTimer);
  Object.assign(status, { state: 'off', last: '', error: '', queued: 0, attempt: 0, retryAt: 0, expired: false, conflicts: [], failed: 0, skipped: [], fileError: '' }); emit();
}

/* ---------------- the queue ---------------- */
const keyOf = it => it.col + ':' + it.id;
/** The server's own 'updated' stamp of each record as we last saw it: a write is accepted only against that stamp. */
const seenOf = key => (cfg && cfg.seen && cfg.seen[key]) || '';
const markSeen = (key, upd) => { if (!cfg) return; cfg.seen = cfg.seen || {}; if (upd) cfg.seen[key] = upd; else delete cfg.seen[key]; };
const same = (a, b) => a.col === b.col && a.id === b.id && a.setting === b.setting;
/** True for a history entry too old to travel. */
export function isStaleHistory(h) { const at = h && h.at ? Date.parse(h.at) : NaN; return !isNaN(at) && at < now() - HISTORY_DAYS * 864e5; }
export function encodeSetting(v) { return typeof v === 'string' ? v : v == null ? '' : JSON_MARK + JSON.stringify(v); }
export function decodeSetting(s) {
  if (typeof s !== 'string') return s == null ? '' : s;
  if (s.slice(0, JSON_MARK.length) !== JSON_MARK) return s;
  try { return JSON.parse(s.slice(JSON_MARK.length)); } catch (e) { return s; }
}
/** The base of every record as it stands now, except the ones with a change still queued (their base is unknown). */
function initShadow() {
  shadow.clear();
  const snap = hooks.db.snapshot() || {};
  const queued = new Set(queue.filter(q => q.col).map(keyOf));
  Object.keys(snap).forEach(col => { if (Array.isArray(snap[col])) snap[col].forEach(o => { if (o && o.id && !queued.has(col + ':' + o.id)) shadow.set(col + ':' + o.id, JSON.stringify(o)); }); });
}
function add(item) {
  if (!item) return false;
  if (item.setting !== undefined) {
    if (SKIP_SETTINGS.includes(item.setting)) return false;
    if (encodeSetting(item.value).length > SETTING_MAX) { if (!status.skipped.includes(item.setting)) status.skipped.push(item.setting); return false; }
  } else {
    if (!item.col || !item.id) return false;
    if (item.col === 'history' && item.deleted) { queue = queue.filter(q => !same(q, item)); return false; } // trimmed before it went up: forget it
    if (item.col === 'history' && isStaleHistory(item.data)) return false;
  }
  const old = queue.find(q => same(q, item));
  queue = queue.filter(q => !same(q, item));
  const it = item.setting !== undefined ? { setting: item.setting, value: item.value } : { col: item.col, id: item.id, data: item.data, deleted: !!item.deleted };
  if (it.col) it.base = old ? old.base || null : shadow.has(keyOf(it)) ? JSON.parse(shadow.get(keyOf(it))) : null;
  queue.push(it); return true;
}
/** The store's change hook: {col, id, data, deleted} or {setting, value}. Saved on the device first, pushed shortly after. */
export function enqueue(item) {
  if (!isOn()) return;
  const n = queue.length;
  if (!add(item)) { if (queue.length !== n) saveQueue(); return; }
  saveQueue(); emit(); scheduleFlush(400);
}
/** Everything on the device that the cloud may not have (first login on a phone that already has data). */
function pushLocal() {
  const snap = hooks.db.snapshot() || {};
  Object.keys(snap).forEach(col => { if (Array.isArray(snap[col])) snap[col].forEach(o => add({ col, id: o && o.id, data: o })); });
  Object.keys(snap.settings || {}).forEach(k => add({ setting: k, value: snap.settings[k] }));
  saveQueue(); emit(); flush();
}
const toRow = q => ({ id: q.id, org_id: cfg.orgId, col: q.col, data: q.data || {}, deleted: !!q.deleted });
/** Writes the items. A record the cloud already holds is written only if its server stamp is still the one we saw
   (PATCH ... &updated=eq.<seen>); a new record only if nobody created it meanwhile. Whatever the server refused for
   that reason is returned as conflicts: the caller pulls (merging against the base) and pushes again. */
async function pushItems(items) {
  const conflicts = [];
  const docs = items.filter(q => q.col);
  const fresh = docs.filter(q => !seenOf(keyOf(q))), known = docs.filter(q => seenOf(keyOf(q)));
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK);
    const got = await api('/rest/v1/docs?on_conflict=org_id,col,id', { method: 'POST', body: chunk.map(toRow), headers: { Prefer: 'resolution=ignore-duplicates,return=representation' } });
    const back = new Map((Array.isArray(got) ? got : []).map(r => [r.col + ':' + r.id, r.updated]));
    chunk.forEach(q => { const u = back.get(keyOf(q)); if (u) { markSeen(keyOf(q), u); q.ok = true; } else conflicts.push(q); });
  }
  for (const q of known) {
    const key = keyOf(q);
    const got = await api('/rest/v1/docs?org_id=eq.' + cfg.orgId + '&col=eq.' + encodeURIComponent(q.col) + '&id=eq.' + encodeURIComponent(q.id) + '&updated=eq.' + encodeURIComponent(seenOf(key)),
      { method: 'PATCH', body: { data: q.data || {}, deleted: !!q.deleted }, headers: { Prefer: 'return=representation' } });
    const row = Array.isArray(got) && got[0];
    if (row && row.updated) { markSeen(key, row.updated); q.ok = true; } else conflicts.push(q);
  }
  const sets = items.filter(q => q.setting !== undefined).map(q => ({ org_id: cfg.orgId, key: q.setting, value: encodeSetting(q.value) }));
  if (sets.length) await api('/rest/v1/settings?on_conflict=org_id,key', { method: 'POST', body: sets, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  items.forEach(q => { if (q.setting !== undefined) q.ok = true; });
  return conflicts;
}
/** Items that reached the cloud leave the queue (not the ones re-queued meanwhile) and become the base of the next edit. */
function done(items) {
  const ok = items.filter(q => q.ok);
  queue = queue.filter(q => !ok.includes(q));
  ok.forEach(q => { delete q.ok; if (!q.col) return; if (q.deleted) { shadow.delete(keyOf(q)); markSeen(keyOf(q), seenOf(keyOf(q))); } else shadow.set(keyOf(q), JSON.stringify(q.data)); });
}
function note(entry, key) {
  const cap = key === 'failed' ? 50 : MAX_NOTES;
  const arr = (cfg[key] = cfg[key] || []);
  arr.unshift(entry); if (arr.length > cap) arr.length = cap;
  if (key === 'conflicts') status.conflicts = arr; else status.failed = arr.length;
}
const isBad = e => e && e.status && !e.retryable && e.status !== 401; // the server refused the content: retrying will not help
/** Pushes the queue. Returns true when everything that was queued went up. */
export async function flush(opts) {
  opts = opts || {};
  if (!isOn() || busy || !queue.length || status.expired) return false;
  if (status.retryAt && now() < status.retryAt && !opts.force) { scheduleFlush(status.retryAt - now()); return false; }
  busy = true; status.state = 'syncing'; emit();
  let err = null;
  // what the other device wrote comes in first and is merged (field by field, against the base), then we write
  if (!opts.noPull) { try { await pullAll({ settings: false, inFlush: true }); } catch (e) { err = e; } }
  let batch = err ? [] : queue.slice();
  for (let round = 0; !err && batch.length && round < 3; round++) {
    let conflicts = [];
    try { conflicts = await pushItems(batch); done(batch); } catch (e) { err = e; break; }
    if (!conflicts.length) break;
    // the server stamp moved under us: take the newer copy, merge, and write the merged record
    try { await pullAll({ settings: false, inFlush: true }); } catch (e) { err = e; break; }
    batch = queue.filter(q => conflicts.some(c => same(c, q)) || !q.col);
  }
  if (err && isBad(err)) { // find the item the server refuses, keep the rest moving
    const bad = err; err = null;
    const refuse = (q, e) => { note({ col: q.col, id: q.id, setting: q.setting, error: String(e.message || e), at: nowIso() }, 'failed'); queue = queue.filter(x => x !== q); };
    if (batch.length === 1) refuse(batch[0], bad);
    else for (const q of batch) {
      try { await pushItems([q]); done([q]); }
      catch (e) { if (isBad(e)) refuse(q, e); else { err = e; break; } }
    }
  }
  saveQueue();
  if (!err) { status.state = 'on'; status.last = nowIso(); status.error = ''; status.attempt = 0; status.retryAt = 0; saveCfg(); }
  else {
    status.state = 'error'; status.error = String(err.message || err);
    if (err.retryable) { status.attempt++; status.retryAt = now() + backoffMs(status.attempt, err.retryAfter); scheduleFlush(status.retryAt - now()); }
  }
  busy = false; emit();
  if (!err && queue.length) scheduleFlush(400); // changes made while this batch was in flight
  return !err && !queue.length;
}

/* ---------------- pull and merge ---------------- */
/** Three-way merge of one record: a field changed on one side only takes that side; changed on both, the side that is
   writing now (local) wins the field, since the other write already reached the server earlier, and the field is listed
   in conflicts. Device clocks play no part: the server's stamps order the writes. */
export function merge3(baseRec, local, remote) {
  baseRec = baseRec || {}; local = local || {}; remote = remote || {};
  const keys = new Set(Object.keys(baseRec).concat(Object.keys(local), Object.keys(remote)));
  const localNewer = true;
  const out = {}; const conflicts = [];
  keys.forEach(k => {
    if (k === 'updated') return;
    const b = JSON.stringify(baseRec[k]), l = JSON.stringify(local[k]), r = JSON.stringify(remote[k]);
    let v;
    if (l === r) v = local[k];
    else if (l === b) v = remote[k];
    else if (r === b) v = local[k];
    else { v = localNewer ? local[k] : remote[k]; conflicts.push(k); }
    if (v !== undefined) out[k] = v;
  });
  out.updated = localNewer ? local.updated : remote.updated;
  return { data: out, conflicts };
}
const bump = iso => { const t = Date.parse(iso); return isNaN(t) ? nowIso() : new Date(t + 1).toISOString(); };
/** Decides, row by row, what the store applies and what the queue keeps. */
function reconcile(rows) {
  const out = [], after = []; let pushes = false, qChanged = false;
  const drop = q => { queue = queue.filter(x => x !== q); qChanged = true; };
  rows.forEach(r => {
    if (!r || !r.col || !r.id) return;
    const data = r.data && typeof r.data === 'object' ? r.data : null;
    if (!r.deleted && !data) return;
    if (r.col === 'history' && (r.deleted || isStaleHistory(data))) return;
    const key = r.col + ':' + r.id;
    const q = queue.find(x => x.col === r.col && x.id === r.id) || null;
    const local = hooks.db.get(r.col, r.id);
    let rUpd = String((data && data.updated) || r.updated || '');
    const remember = () => after.push(() => { if (r.deleted) shadow.delete(key); else shadow.set(key, JSON.stringify(data)); });
    if (!q) {
      // written there after the version we synced, by a device whose clock is behind ours: the server's order wins, so the store must take it
      const seen = seenOf(key);
      if (!r.deleted && local && seen && Date.parse(r.updated) > Date.parse(seen) && rUpd < String(local.updated || '')) { data.updated = bump(local.updated); rUpd = data.updated; }
      out.push(r); if (r.deleted || !local || rUpd >= String(local.updated || '')) remember(); return;
    }
    const qUpd = String((q.data && q.data.updated) || '');
    if (r.deleted) { // deleted there, edited here: the newer action wins
      if (rUpd > qUpd) { out.push(r); drop(q); remember(); note({ col: r.col, id: r.id, kind: 'deleted-elsewhere', at: nowIso() }, 'conflicts'); }
      return;
    }
    if (q.deleted) { // deleted here, edited there
      if (rUpd > qUpd) { out.push(r); drop(q); remember(); note({ col: r.col, id: r.id, kind: 'edited-elsewhere', at: nowIso() }, 'conflicts'); }
      return;
    }
    if (q.base && JSON.stringify(q.base) === JSON.stringify(data)) return; // nothing new there (the overlap window)
    if (q.base && local) { // edited on both sides: merge against the common base, push the result
      const m = merge3(q.base, local, data);
      const t = nowIso(); m.data.updated = t > m.data.updated ? t : bump(m.data.updated);
      out.push({ col: r.col, id: r.id, data: m.data, deleted: false });
      drop(q); queue.push({ col: q.col, id: q.id, data: m.data, deleted: false, base: data }); pushes = true; remember();
      if (m.conflicts.length) note({ col: r.col, id: r.id, kind: 'both-changed', fields: m.conflicts, at: nowIso() }, 'conflicts');
      return;
    }
    if (rUpd > qUpd) { out.push(r); drop(q); remember(); note({ col: r.col, id: r.id, kind: 'lost-local', at: nowIso() }, 'conflicts'); } // no base: newest wins
    else note({ col: r.col, id: r.id, kind: 'lost-remote', at: nowIso() }, 'conflicts');
  });
  return { rows: out, after: () => after.forEach(f => f()), pushes, qChanged };
}
/** Settings from the cloud that are worth applying: not per-device, not pending here, not garbage, actually different. */
function pickSettings(sets) {
  const cur = hooks.db.settings();
  return (sets || []).filter(x => x && x.key && !SKIP_SETTINGS.includes(x.key) && x.value !== '[object Object]' && !queue.some(q => q.setting === x.key))
    .map(x => ({ key: x.key, value: decodeSetting(x.value) }))
    .filter(x => JSON.stringify(cur[x.key]) !== JSON.stringify(x.value));
}
/** Pulls what changed since the last pull (or everything) and merges it in. opts.settings=false skips the settings table. */
export async function pullAll(opts) {
  if (!isOn() || status.expired) return;
  opts = opts || {};
  if (busy && !opts.inFlush) return; // a flush is pulling already
  try {
    const sinceT = cfg.since ? Date.parse(cfg.since) : NaN;
    const since = isNaN(sinceT) ? '' : '&updated=gt.' + encodeURIComponent(new Date(sinceT - OVERLAP_MS).toISOString());
    const rows = []; let page;
    do {
      page = await api('/rest/v1/docs?select=id,col,data,deleted,updated&org_id=eq.' + cfg.orgId + since + '&order=updated.asc,col.asc,id.asc&limit=' + PAGE + '&offset=' + rows.length);
      page = Array.isArray(page) ? page : [];
      rows.push.apply(rows, page);
    } while (page.length === PAGE && rows.length < 50 * PAGE);
    const sets = opts.settings === false ? [] : await api('/rest/v1/settings?select=key,value&org_id=eq.' + cfg.orgId);
    const plan = reconcile(rows);
    hooks.db.mergeRemote(plan.rows, pickSettings(sets));
    plan.after();
    rows.forEach(r => { if (r && r.col && r.id && r.updated) markSeen(r.col + ':' + r.id, r.updated); });
    if (plan.qChanged) saveQueue();
    let last = cfg.since || '', lastT = isNaN(sinceT) ? -1 : sinceT;
    rows.forEach(r => { const t = Date.parse(r.updated); if (!isNaN(t) && t > lastT) { lastT = t; last = r.updated; } });
    cfg.since = last; saveCfg();
    if (status.state !== 'syncing') status.state = 'on';
    status.last = nowIso(); if (!status.expired) status.error = '';
    emit();
    if (plan.pushes && !opts.inFlush) scheduleFlush(50);
  } catch (e) {
    status.state = 'error'; status.error = String(e.message || e);
    if (e.retryable && !status.retryAt && !opts.inFlush) { status.attempt++; status.retryAt = now() + backoffMs(status.attempt, e.retryAfter); } // inside a flush the flush counts the attempt
    emit(); throw e;
  }
}
function start() {
  clearInterval(timer); let tick = 0;
  timer = unref(setInterval(() => { tick++; pullAll({ settings: tick % 5 === 0 }).catch(() => {}); flush(); }, 60000));
  if (listening || typeof window === 'undefined' || !window.addEventListener) return;
  listening = true;
  const wake = () => { pullAll().catch(() => {}); flush(); };
  window.addEventListener('focus', wake);
  window.addEventListener('online', () => { status.retryAt = 0; status.attempt = 0; wake(); });
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
}

loadCfg(); initShadow();
if (isOn()) { status.state = 'on'; pullAll().catch(() => {}); flush(); start(); }

/* ---- files in the cloud (Supabase Storage): receipts, invoices and event files ---- */
async function storageFetch(path, init, retried) {
  const r = await fetchFn(base() + '/storage/v1/object/' + path, Object.assign({}, init, { headers: Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + cfg.token }, init.headers || {}) }));
  if (r.status === 401 && !retried) { await refreshToken(); return storageFetch(path, init, true); }
  if (!r.ok) { status.fileError = r.status + ' ' + String(await r.text().catch(() => '')).slice(0, 120); } else status.fileError = '';
  return r;
}
/** Uploads a blob to bucket/path (overwrites). Returns true when it is there; status.fileError says why not (e.g. 'Bucket not found'). */
export async function uploadFile(bucket, path, blob) {
  if (!isOn() || status.expired) return false;
  try { const r = await storageFetch(bucket + '/' + path, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob }); return r.ok; }
  catch (e) { status.fileError = String(e.message || e); return false; }
}
/** A link that opens the file for `seconds` (default 14 days), for the mail to the accountant. */
export async function signedUrl(bucket, path, seconds) {
  if (!isOn()) return '';
  const r = await api('/storage/v1/object/sign/' + bucket + '/' + path, { method: 'POST', body: { expiresIn: seconds || 14 * 24 * 3600 } });
  return r && r.signedURL ? base() + '/storage/v1' + r.signedURL : '';
}
export async function downloadFileBlob(bucket, path) {
  if (!isOn() || status.expired) return null;
  try { const r = await storageFetch(bucket + '/' + path, { method: 'GET' }); return r.ok ? r.blob() : null; }
  catch (e) { status.fileError = String(e.message || e); return null; }
}
