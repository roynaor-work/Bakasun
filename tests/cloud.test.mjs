import { test } from 'node:test';
import assert from 'node:assert/strict';

/* The cloud module runs in the browser; here it gets a tiny localStorage, a fake fetch (routes by method + path) and a
   fake store with the same merge rule as js/store.js (newer 'updated' wins, tombstones remove). No real Supabase is called. */
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.location = { origin: 'https://app.test', pathname: '/' };

const calls = []; let routes = [];
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, headers: { get: h => (headers || {})[h] || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body == null ? '' : body)), json: async () => body, blob: async () => body });
globalThis.fetch = async (url, init) => {
  const path = url.replace('https://x.supabase.co', '');
  const body = init && init.body && typeof init.body === 'string' && /^[[{]/.test(init.body) ? JSON.parse(init.body) : init && init.body;
  const call = { method: (init && init.method) || 'GET', path, body, headers: (init && init.headers) || {} };
  calls.push(call);
  for (const r of routes) if (r.method === call.method && path.startsWith(r.path)) { const out = r.reply(call); if (r.once) routes = routes.filter(x => x !== r); return out; }
  if (path.startsWith('/rest/v1/docs') && call.method === 'GET') return res(200, []);
  if (path.startsWith('/rest/v1/settings') && call.method === 'GET') return res(200, []);
  if (call.method === 'POST' && /^\/rest\/v1\/(docs|settings)/.test(path)) return res(201, '');
  return res(404, 'no route ' + path);
};
const on = (method, path, reply, once) => routes.unshift({ method, path, reply, once });
const posts = col => calls.filter(c => c.method === 'POST' && c.path.startsWith('/rest/v1/' + col));
const sent = col => posts('docs').flatMap(c => c.body).filter(d => !col || d.col === col);

/* A fake store: what cloud.js uses of js/store.js, with the same merge semantics. */
function fakeStore() {
  const state = { settings: {} };
  const list = col => (state[col] = state[col] || []);
  return {
    state,
    get(col, id) { return list(col).find(x => x.id === id) || null; },
    list(col) { return list(col).slice(); },
    put(col, obj) { const a = list(col); const i = a.findIndex(x => x.id === obj.id); if (i >= 0) a[i] = Object.assign({}, a[i], obj); else a.push(obj); return obj.id; },
    settings() { return Object.assign({}, state.settings); },
    snapshot() { return state; },
    mergeRemote(rows, sets) {
      (rows || []).forEach(r => {
        const a = list(r.col); const i = a.findIndex(x => x.id === r.id);
        if (r.deleted) { if (i >= 0) a.splice(i, 1); return; }
        const local = i >= 0 ? a[i] : null;
        if (!local || String(r.data.updated || '') > String(local.updated || '')) { if (i >= 0) a[i] = r.data; else a.push(r.data); }
      });
      (sets || []).forEach(x => { if (x.key !== 'lang') state.settings[x.key] = x.value; });
    }
  };
}

let clock = Date.parse('2026-10-01T10:00:00.000Z');
const cloud = await import('../js/cloud.js');
const { hooks, status, merge3, backoffMs, encodeSetting, decodeSetting, isStaleHistory } = cloud;
hooks.now = () => clock;
const iso = (ms) => new Date(clock + (ms || 0)).toISOString();
const tick = (ms) => new Promise(r => setTimeout(r, ms || 10));
async function until(fn, ms) { const end = Date.now() + (ms || 1500); while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await tick(5); } }

/* Signs in through the password flow against the fake server. The store is fresh each time. */
async function signIn() {
  cloud.logout(); calls.length = 0; routes = [];
  const store = fakeStore(); hooks.db = store;
  on('POST', '/auth/v1/token?grant_type=password', () => res(200, { access_token: 'T1', refresh_token: 'R1', user: { id: 'u1', email: 'v@x.co' } }), true);
  on('GET', '/rest/v1/members', () => res(200, [{ org_id: 'org1' }]));
  await cloud.login('https://x.supabase.co', 'anon', 'v@x.co', 'pw');
  await until(() => status.queued === 0 && status.state === 'on');
  calls.length = 0;
  return store;
}

test('push: a change is queued with the base it started from, pushed without a client timestamp, and marked done', async () => {
  const store = await signIn();
  const rec = { id: 'c1', client: 'טבע', place: 'הרצליה', updated: iso() };
  store.put('cases', rec); cloud.enqueue({ col: 'cases', id: 'c1', data: rec });
  assert.equal(status.queued, 1);
  assert.equal(JSON.parse(mem['bakasun.cloud.queue'])[0].base, null); // a new record has no base
  await cloud.flush();
  const d = sent('cases');
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { id: 'c1', org_id: 'org1', col: 'cases', data: rec, deleted: false });
  assert.equal(posts('docs')[0].path, '/rest/v1/docs?on_conflict=org_id,col,id');
  assert.equal(posts('docs')[0].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(posts('docs')[0].headers.Authorization, 'Bearer T1');
  assert.equal(status.queued, 0); assert.equal(status.state, 'on'); assert.ok(status.last);
  // the next edit of the same record carries the pushed version as its base
  const rec2 = Object.assign({}, rec, { place: 'שפיים', updated: iso(1000) });
  store.put('cases', rec2); cloud.enqueue({ col: 'cases', id: 'c1', data: rec2 });
  assert.deepEqual(JSON.parse(mem['bakasun.cloud.queue'])[0].base, rec);
  await cloud.flush();
  assert.equal(sent('cases').length, 2);
});

test('pull: newest wins when nothing is pending here; the pull is paged and starts a little before the last row', async () => {
  const store = await signIn();
  store.put('tasks', { id: 't1', title: 'ישן', updated: '2026-09-01T00:00:00.000Z' });
  store.put('tasks', { id: 't2', title: 'חדש כאן', updated: '2026-09-30T00:00:00.000Z' });
  on('GET', '/rest/v1/docs', () => res(200, [
    { id: 't1', col: 'tasks', data: { id: 't1', title: 'מהענן', updated: '2026-09-20T00:00:00.000Z' }, deleted: false, updated: '2026-09-20T00:00:00+00:00' },
    { id: 't2', col: 'tasks', data: { id: 't2', title: 'ישן בענן', updated: '2026-09-10T00:00:00.000Z' }, deleted: false, updated: '2026-09-25T00:00:00+00:00' },
    { id: 't3', col: 'tasks', data: { id: 't3', title: 'רק בענן', updated: '2026-09-26T00:00:00.000Z' }, deleted: false, updated: '2026-09-26T00:00:00+00:00' }
  ]));
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't1').title, 'מהענן');
  assert.equal(store.get('tasks', 't2').title, 'חדש כאן');
  assert.equal(store.get('tasks', 't3').title, 'רק בענן');
  assert.equal(JSON.parse(mem['bakasun.cloud']).since, '2026-09-26T00:00:00+00:00');
  calls.length = 0;
  await cloud.pullAll();
  const q = calls.find(c => c.path.startsWith('/rest/v1/docs')).path;
  assert.ok(q.includes('updated=gt.' + encodeURIComponent('2026-09-25T55:00:00.000Z'.replace('55', '55')) ) === false); // sanity: not the raw stamp
  assert.ok(q.includes(encodeURIComponent('2026-09-25T23:55:00.000Z')), 'five minutes before the last row');
  assert.ok(q.includes('limit=1000') && q.includes('offset=0'));
});

test('merge: edited on both devices, different fields → both edits survive; same field → newer wins with a conflict note', async () => {
  const store = await signIn();
  const base = { id: 'c9', client: 'טבע', place: 'הרצליה', notes: '', updated: '2026-09-29T10:00:00.000Z' };
  store.put('cases', base);
  // the cloud knows this version: pull it so it becomes the base
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 'c9', col: 'cases', data: base, deleted: false, updated: '2026-09-29T10:00:00+00:00' }]), true);
  await cloud.pullAll();
  // offline here: she changes the place
  const mine = Object.assign({}, base, { place: 'שפיים', updated: '2026-09-30T09:00:00.000Z' });
  store.put('cases', mine); cloud.enqueue({ col: 'cases', id: 'c9', data: mine });
  // meanwhile on the computer: Roy adds a note
  const theirs = Object.assign({}, base, { notes: 'חוזה נחתם', updated: '2026-09-30T09:30:00.000Z' });
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 'c9', col: 'cases', data: theirs, deleted: false, updated: '2026-09-30T09:30:00+00:00' }]), true);
  await cloud.pullAll();
  const m = store.get('cases', 'c9');
  assert.equal(m.place, 'שפיים'); assert.equal(m.notes, 'חוזה נחתם'); assert.equal(m.client, 'טבע');
  assert.ok(m.updated > theirs.updated, 'the merged record is newer than both');
  assert.equal(status.conflicts.length, 0);
  await until(() => status.queued === 0);
  const pushed = sent('cases').pop();
  assert.equal(pushed.data.place, 'שפיים'); assert.equal(pushed.data.notes, 'חוזה נחתם');
  // same field on both sides: the newer edit wins and the conflict is noted
  const mine2 = Object.assign({}, m, { place: 'קיסריה', updated: '2026-09-30T11:00:00.000Z' });
  store.put('cases', mine2); cloud.enqueue({ col: 'cases', id: 'c9', data: mine2 });
  const theirs2 = Object.assign({}, m, { place: 'נתניה', updated: '2026-09-30T12:00:00.000Z' });
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 'c9', col: 'cases', data: theirs2, deleted: false, updated: '2026-09-30T12:00:00+00:00' }]), true);
  await cloud.pullAll();
  assert.equal(store.get('cases', 'c9').place, 'נתניה');
  assert.equal(status.conflicts[0].kind, 'both-changed'); assert.deepEqual(status.conflicts[0].fields, ['place']);
  assert.equal(JSON.parse(mem['bakasun.cloud']).conflicts.length, 1, 'the note survives a reload');
  await until(() => status.queued === 0);
});

test('merge3 is a plain three-way merge', () => {
  const r = merge3({ a: 1, b: 1, c: 1, updated: '1' }, { a: 2, b: 1, c: 3, updated: '3' }, { a: 1, b: 2, c: 4, updated: '2' });
  assert.deepEqual(r, { data: { a: 2, b: 2, c: 3, updated: '3' }, conflicts: ['c'] });
  assert.deepEqual(merge3(null, { a: 1, updated: '1' }, { a: 1, b: 2, updated: '2' }).data, { a: 1, b: 2, updated: '2' });
});

test('tombstones: a delete here is pushed as deleted=true; a newer delete there removes the local edit; an older one loses to it', async () => {
  const store = await signIn();
  const gone = { id: 'n1', text: 'x', updated: iso() };
  cloud.enqueue({ col: 'notes', id: 'n1', data: gone, deleted: true });
  await cloud.flush();
  assert.deepEqual(sent('notes')[0], { id: 'n1', org_id: 'org1', col: 'notes', data: gone, deleted: true });
  // edited here (pending), deleted there later: the delete wins, the queued edit is dropped
  const t1 = { id: 't1', title: 'a', updated: '2026-09-30T10:00:00.000Z' };
  store.put('tasks', t1); cloud.enqueue({ col: 'tasks', id: 't1', data: t1 });
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 't1', col: 'tasks', data: Object.assign({}, t1, { updated: '2026-09-30T11:00:00.000Z' }), deleted: true, updated: '2026-09-30T11:00:00+00:00' }]), true);
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't1'), null);
  assert.equal(status.queued, 0);
  assert.equal(status.conflicts[0].kind, 'deleted-elsewhere');
  // edited here after the delete there: the edit wins, stays queued and goes up as deleted=false
  const t2 = { id: 't2', title: 'b', updated: '2026-09-30T12:00:00.000Z' };
  store.put('tasks', t2); cloud.enqueue({ col: 'tasks', id: 't2', data: t2 });
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 't2', col: 'tasks', data: Object.assign({}, t2, { updated: '2026-09-30T11:00:00.000Z' }), deleted: true, updated: '2026-09-30T11:00:00+00:00' }]), true);
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't2').title, 'b');
  assert.equal(status.queued, 1);
  await cloud.flush();
  assert.equal(sent('tasks').find(d => d.id === 't2').deleted, false);
  // deleted here (pending), edited there later: the record comes back
  cloud.enqueue({ col: 'tasks', id: 't2', data: Object.assign({}, t2, { updated: '2026-09-30T13:00:00.000Z' }), deleted: true });
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 't2', col: 'tasks', data: Object.assign({}, t2, { title: 'c', updated: '2026-09-30T14:00:00.000Z' }), deleted: false, updated: '2026-09-30T14:00:00+00:00' }]), true);
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't2').title, 'c');
  assert.equal(status.queued, 0);
});

test('401: the session is refreshed once (single flight) and the request retried with the new token; a dead refresh token means expired', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'n2', data: { id: 'n2', updated: iso() } });
  on('POST', '/rest/v1/docs', c => c.headers.Authorization === 'Bearer T1' ? res(401, 'expired') : res(201, ''));
  on('POST', '/auth/v1/token?grant_type=refresh_token', () => res(200, { access_token: 'T2', refresh_token: 'R2' }), true);
  await cloud.flush();
  const rf = calls.filter(c => c.path.startsWith('/auth/v1/token?grant_type=refresh_token'));
  assert.equal(rf.length, 1);
  assert.deepEqual(rf[0].body, { refresh_token: 'R1' });
  assert.equal(rf[0].headers.Authorization, 'Bearer anon');
  assert.equal(posts('docs').length, 2);
  assert.equal(posts('docs')[1].headers.Authorization, 'Bearer T2');
  assert.equal(status.state, 'on'); assert.equal(status.queued, 0);
  assert.equal(JSON.parse(mem['bakasun.cloud']).refresh, 'R2');
  // the refresh token is dead: the queue is kept, the status says expired, and nothing is retried in a loop
  routes = []; calls.length = 0;
  on('POST', '/rest/v1/docs', () => res(401, 'expired'));
  on('POST', '/auth/v1/token?grant_type=refresh_token', () => res(400, 'invalid refresh'));
  cloud.enqueue({ col: 'notes', id: 'n3', data: { id: 'n3', updated: iso() } });
  await cloud.flush();
  assert.equal(status.expired, true); assert.equal(status.state, 'error'); assert.equal(status.error, 'session-expired');
  assert.equal(status.queued, 1);
  assert.equal(cloud.isOn(), true, 'the stored session stays until she signs in again');
  calls.length = 0; await cloud.flush(); await cloud.pullAll();
  assert.equal(calls.length, 0, 'nothing is sent while expired');
});

test('429 and no network: the queue waits with backoff (Retry-After honoured) and goes up when the time comes', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'n4', data: { id: 'n4', updated: iso() } });
  on('POST', '/rest/v1/docs', () => res(429, 'slow down', { 'Retry-After': '7' }), true);
  await cloud.flush();
  assert.equal(status.state, 'error'); assert.equal(status.attempt, 1); assert.equal(status.queued, 1);
  assert.equal(status.retryAt, clock + 7000);
  calls.length = 0;
  await cloud.flush();
  assert.equal(calls.length, 0, 'too early: nothing is sent');
  clock += 8000;
  on('POST', '/rest/v1/docs', () => { throw new TypeError('Failed to fetch'); }, true);
  await cloud.flush();
  assert.equal(status.attempt, 2); assert.equal(status.retryAt, clock + 4000); assert.equal(status.queued, 1);
  assert.ok(/network/.test(status.error));
  clock += 5000;
  await cloud.flush();
  assert.equal(status.state, 'on'); assert.equal(status.attempt, 0); assert.equal(status.retryAt, 0); assert.equal(status.queued, 1 - 1);
  assert.equal(backoffMs(1), 2000); assert.equal(backoffMs(5), 32000); assert.equal(backoffMs(20), 300000); assert.equal(backoffMs(3, 60), 60000);
});

test('a row the server refuses (400) is set aside, the rest of the batch still goes up', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'ok1', data: { id: 'ok1', updated: iso() } });
  cloud.enqueue({ col: 'notes', id: 'bad', data: { id: 'bad', updated: iso() } });
  on('POST', '/rest/v1/docs', c => c.body.some(d => d.id === 'bad') ? res(400, 'bad row') : res(201, ''));
  await cloud.flush();
  assert.equal(status.queued, 0); assert.equal(status.failed, 1); assert.equal(status.state, 'on');
  assert.equal(JSON.parse(mem['bakasun.cloud']).failed[0].id, 'bad');
});

test('the queue survives a reload: a fresh module instance pushes what was queued before', async () => {
  await signIn();
  cloud.enqueue({ col: 'clients', id: 'k1', data: { id: 'k1', name: 'לקוח', updated: iso() } });
  assert.equal(JSON.parse(mem['bakasun.cloud.queue']).length, 1);
  assert.equal(JSON.parse(mem['bakasun.cloud.queue'])[0].col, 'clients');
  calls.length = 0;
  const again = await import('../js/cloud.js?reload=1'); // the same file, a fresh instance: like the app opening again
  assert.equal(again.isOn(), true); assert.equal(again.status.queued, 1);
  again.hooks.now = () => clock;
  await until(() => again.status.queued === 0);
  assert.equal(sent('clients')[0].id, 'k1');
  assert.equal(JSON.parse(mem['bakasun.cloud.queue']).length, 0);
  again.logout();
});

test('changes made while a push is in flight are not lost', async () => {
  await signIn();
  let release; on('POST', '/rest/v1/docs', () => new Promise(r => { release = () => r(res(201, '')); }), true);
  cloud.enqueue({ col: 'notes', id: 'a', data: { id: 'a', updated: iso() } });
  const p = cloud.flush();
  await until(() => !!release);
  cloud.enqueue({ col: 'notes', id: 'b', data: { id: 'b', updated: iso() } });
  release(); await p;
  assert.equal(status.queued, 1);
  await until(() => status.queued === 0);
  assert.deepEqual(sent('notes').map(d => d.id), ['a', 'b']);
});

test('settings: strings as they are, objects as json:, per-device keys and garbage never travel, a huge value stays home', async () => {
  const store = await signIn();
  cloud.enqueue({ setting: 'signer', value: 'וירג׳יני' });
  cloud.enqueue({ setting: 'rules', value: { quietFrom: '21:00', on: true } });
  cloud.enqueue({ setting: 'taskSeq', value: 7 });
  cloud.enqueue({ setting: 'notifyCache', value: { at: 'x', items: [] } });
  cloud.enqueue({ setting: 'lang', value: 'fr' });
  cloud.enqueue({ setting: 'signaturePng', value: 'data:image/png;base64,' + 'A'.repeat(400 * 1024) });
  assert.equal(status.queued, 3);
  assert.deepEqual(status.skipped, ['signaturePng']);
  await cloud.flush();
  const s = Object.fromEntries(posts('settings')[0].body.map(x => [x.key, x.value]));
  assert.deepEqual(s, { signer: 'וירג׳יני', rules: 'json:{"quietFrom":"21:00","on":true}', taskSeq: 'json:7' });
  assert.equal(posts('settings')[0].body[0].org_id, 'org1');
  on('GET', '/rest/v1/settings', () => res(200, [{ key: 'rules', value: 'json:{"quietFrom":"22:00"}' }, { key: 'notifyCache', value: '[object Object]' }, { key: 'notifyState', value: '[object Object]' }, { key: 'travel', value: '{"on":true}' }, { key: 'lang', value: 'en' }]));
  await cloud.pullAll();
  assert.deepEqual(store.state.settings.rules, { quietFrom: '22:00' });
  assert.equal(store.state.settings.travel, '{"on":true}', 'a JSON string stays a string');
  assert.equal(store.state.settings.notifyCache, undefined); assert.equal(store.state.settings.notifyState, undefined); assert.equal(store.state.settings.lang, undefined);
  assert.equal(decodeSetting(encodeSetting({ a: [1] })).a[0], 1); assert.equal(encodeSetting('json:x'), 'json:x');
});

test('history: entries older than 30 days and their trimming stay on the device; recent ones travel', async () => {
  const store = await signIn();
  const old = { id: 'h1', at: iso(-40 * 864e5), summary: 'ישן' }, fresh = { id: 'h2', at: iso(-2 * 864e5), summary: 'טרי' };
  assert.equal(isStaleHistory(old), true); assert.equal(isStaleHistory(fresh), false);
  cloud.enqueue({ col: 'history', id: 'h1', data: old });
  cloud.enqueue({ col: 'history', id: 'h2', data: fresh });
  cloud.enqueue({ col: 'history', id: 'h2', data: fresh, deleted: true });
  cloud.enqueue({ col: 'history', id: 'h3', data: { id: 'h3', at: iso(), summary: 'עכשיו' } });
  assert.equal(status.queued, 1);
  await cloud.flush();
  assert.deepEqual(sent('history').map(d => d.id), ['h3']);
  on('GET', '/rest/v1/docs', () => res(200, [{ id: 'h1', col: 'history', data: old, deleted: false, updated: '2026-08-20T00:00:00+00:00' }, { id: 'h4', col: 'history', data: Object.assign({}, fresh, { id: 'h4' }), deleted: false, updated: '2026-09-29T00:00:00+00:00' }]), true);
  await cloud.pullAll();
  assert.equal(store.get('history', 'h1'), null); assert.equal(store.get('history', 'h4').summary, 'טרי');
});

test('files: a missing bucket is reported in status.fileError, a 401 on storage refreshes the session', async () => {
  await signIn();
  on('POST', '/storage/v1/object/receipts/', () => res(404, '{"error":"Bucket not found"}'), true);
  assert.equal(await cloud.uploadFile('receipts', 'org1/2026-10/r1.jpg', { type: 'image/jpeg' }), false);
  assert.ok(/Bucket not found/.test(status.fileError));
  on('POST', '/storage/v1/object/receipts/', c => c.headers.Authorization === 'Bearer T1' ? res(401, 'x') : res(200, '{}'));
  on('POST', '/auth/v1/token?grant_type=refresh_token', () => res(200, { access_token: 'T3', refresh_token: 'R3' }), true);
  assert.equal(await cloud.uploadFile('receipts', 'org1/2026-10/r1.jpg', { type: 'image/jpeg' }), true);
  assert.equal(status.fileError, '');
  on('GET', '/storage/v1/object/receipts/', () => res(200, 'bytes'), true);
  assert.equal(await cloud.downloadFileBlob('receipts', 'org1/2026-10/r1.jpg'), 'bytes');
  cloud.logout();
  assert.equal(cloud.isOn(), false); assert.equal(mem['bakasun.cloud'], undefined); assert.equal(status.state, 'off');
});
