import { test } from 'node:test';
import assert from 'node:assert/strict';

/* The cloud module runs in the browser. Here every device (a module instance) gets its own localStorage, its own
   store (the merge rule of js/store.js: newer 'updated' wins, tombstones remove) and its own clock, and all devices
   talk to one in-memory Supabase: a docs table keyed by org_id+col+id whose 'updated' stamp the server sets itself
   (a counter, strictly increasing per write, nothing to do with any device clock), the conditional insert
   (resolution=ignore-duplicates) and the conditional PATCH (updated=eq.<stamp>) the module relies on, merge-duplicates
   for settings, password/refresh sessions, /auth/v1/user and /rest/v1/members. Timers the module sets are collected
   and fired on demand, so nothing runs between the steps of a test. No real Supabase is called. */
const SB = 'https://x.supabase.co';
const BASE = Date.parse('2026-10-01T10:00:00.000Z');
globalThis.location = { origin: 'https://app.test', pathname: '/' };

/* ---- timers: what the module schedules waits until a test fires it ---- */
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let timers = []; let tseq = 0;
globalThis.setTimeout = function (fn, ms) { const h = { fake: true, id: ++tseq, fn, ms: ms || 0, dev: current, unref() { return this; }, ref() { return this; } }; timers.push(h); return h; };
globalThis.clearTimeout = h => { if (h && h.fake) timers = timers.filter(x => x !== h); else realClearTimeout(h); };
globalThis.setInterval = () => ({ fake: true, unref() { return this; }, ref() { return this; } });
globalThis.clearInterval = () => {};
const tick = ms => new Promise(r => realSetTimeout(r, ms || 5));
async function until(fn, ms) { const end = Date.now() + (ms || 1500); while (!fn()) { if (Date.now() > end) throw new Error('timeout'); await tick(5); } }
/** Fires the timers pending now (not the ones they schedule in turn) and returns how many ran. */
async function runTimers() { const batch = timers; timers = []; for (const h of batch) { current = h.dev; await h.fn(); } return batch.length; }

/* ---- per-device localStorage ---- */
function fakeStorage() {
  const mem = {};
  const s = { mem, fail: false, getItem: k => (k in mem ? mem[k] : null), setItem(k, v) { if (s.fail) throw new Error('QuotaExceededError'); mem[k] = String(v); }, removeItem(k) { delete mem[k]; } };
  return s;
}
let current = null; // the device whose code is running: its localStorage answers
Object.defineProperty(globalThis, 'localStorage', { get: () => current.storage, configurable: true });

/* ---- per-device store: what cloud.js uses of js/store.js, with the same merge semantics ---- */
function fakeStore() {
  const state = { settings: {} };
  const list = col => (state[col] = state[col] || []);
  return {
    state,
    get(col, id) { return list(col).find(x => x.id === id) || null; },
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

/* ---- the fake Supabase ---- */
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, headers: { get: h => (headers || {})[h] || null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body == null ? '' : body)), json: async () => body, blob: async () => body });
const clone = x => JSON.parse(JSON.stringify(x));
function fakeServer() {
  const T0 = Date.parse('2026-10-01T12:00:00.000Z'); let n = 0;
  /* The server clock: one second per write, always forward, whatever the devices think the time is. Postgres style. */
  const stamp = () => new Date(T0 + ++n * 1000).toISOString().replace('Z', '000+00:00');
  const docs = new Map(), settings = new Map();
  const users = { 'v@x.co': { id: 'u1', password: 'pw', orgs: ['org1'] } };
  const sessions = new Map(), refreshes = new Map(); let seq = 0;
  const issue = email => { seq++; sessions.set('T' + seq, email); refreshes.set('R' + seq, email); return { access_token: 'T' + seq, refresh_token: 'R' + seq, token_type: 'bearer', user: { id: users[email].id, email } }; };
  const key = (org, col, id) => org + '|' + col + '|' + id;
  const srv = {
    docs, settings, sessions, refreshes, issue, stamp,
    /** What another device (or the past) left on the server. */
    put(org, col, id, data, deleted, upd) { const row = { id, org_id: org, col, data: clone(data), deleted: !!deleted, updated: upd || stamp() }; docs.set(key(org, col, id), row); return row; },
    row(col, id, org) { return docs.get(key(org || 'org1', col, id)) || null; },
    revoke(t) { sessions.delete(t); },
    killRefresh() { refreshes.clear(); },
    handle(c) {
      const [p, qs] = c.path.split('?'); const q = new URLSearchParams(qs || '');
      const bearer = String(c.headers.Authorization || '').replace('Bearer ', '');
      if (p === '/auth/v1/token') {
        if (q.get('grant_type') === 'password') { const u = users[c.body.email]; return u && u.password === c.body.password ? res(200, issue(c.body.email)) : res(400, { error: 'invalid_grant' }); }
        if (q.get('grant_type') === 'refresh_token') { const email = refreshes.get(c.body.refresh_token); if (!email) return res(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); refreshes.delete(c.body.refresh_token); return res(200, issue(email)); }
        return res(400, { error: 'unsupported_grant_type' });
      }
      if (p === '/auth/v1/user') { const email = sessions.get(bearer); return email ? res(200, { id: users[email].id, email }) : res(401, { message: 'invalid JWT' }); }
      if (p === '/auth/v1/otp') return res(200, {});
      if (!p.startsWith('/rest/v1/')) return res(404, 'no route ' + c.path);
      const email = sessions.get(bearer); if (!email) return res(401, { message: 'JWT expired' });
      const org = users[email].orgs[0];
      if (p === '/rest/v1/members') return res(200, users[email].orgs.map(o => ({ org_id: o })));
      const filters = [...q.entries()].filter(([, v]) => /^(eq|gt|gte|lt|lte)\./.test(v)).map(([k, v]) => ({ k, op: v.slice(0, v.indexOf('.')), v: v.slice(v.indexOf('.') + 1) }));
      const match = row => filters.every(f => {
        const a = f.k === 'updated' ? Date.parse(row[f.k]) : String(row[f.k]), b = f.k === 'updated' ? Date.parse(f.v) : f.v;
        return f.op === 'eq' ? a === b : f.op === 'gt' ? a > b : f.op === 'gte' ? a >= b : f.op === 'lt' ? a < b : a <= b;
      });
      const prefer = String(c.headers.Prefer || ''), represent = /return=representation/.test(prefer);
      if (p === '/rest/v1/docs') {
        if (c.method === 'GET') {
          let rows = [...docs.values()].filter(r => r.org_id === org && match(r));
          const order = (q.get('order') || '').split(',').filter(Boolean).map(s => { const [k, dir] = s.split('.'); return { k, desc: dir === 'desc' }; });
          rows.sort((a, b) => { for (const o of order) { const x = o.k === 'updated' ? Date.parse(a.updated) : a[o.k], y = o.k === 'updated' ? Date.parse(b.updated) : b[o.k]; if (x < y) return o.desc ? 1 : -1; if (x > y) return o.desc ? -1 : 1; } return 0; });
          const off = Number(q.get('offset') || 0), lim = q.has('limit') ? Number(q.get('limit')) : rows.length;
          rows = rows.slice(off, off + lim);
          const sel = q.get('select'); if (sel && sel !== '*') rows = rows.map(r => Object.fromEntries(sel.split(',').map(f => [f, r[f]])));
          return res(200, rows);
        }
        if (c.method === 'POST') {
          const out = [];
          for (const d of (Array.isArray(c.body) ? c.body : [c.body])) {
            if (d.org_id !== org) return res(403, { code: '42501', message: 'row-level security' });
            if ('updated' in d) return res(400, { message: 'updated is set by the server' });
            const k = key(d.org_id, d.col, d.id), ex = docs.get(k);
            if (ex) {
              if (/ignore-duplicates/.test(prefer)) continue; // ON CONFLICT DO NOTHING: not returned
              if (/merge-duplicates/.test(prefer)) { ex.data = clone(d.data); ex.deleted = !!d.deleted; ex.updated = stamp(); out.push(ex); continue; }
              return res(409, { code: '23505', message: 'duplicate key' });
            }
            const row = { id: d.id, org_id: d.org_id, col: d.col, data: clone(d.data), deleted: !!d.deleted, updated: stamp() };
            docs.set(k, row); out.push(row);
          }
          return represent ? res(201, clone(out)) : res(201, '');
        }
        if (c.method === 'PATCH') {
          if ('updated' in c.body) return res(400, { message: 'updated is set by the server' });
          const rows = [...docs.values()].filter(r => r.org_id === org && match(r));
          rows.forEach(r => { if ('data' in c.body) r.data = clone(c.body.data); if ('deleted' in c.body) r.deleted = !!c.body.deleted; r.updated = stamp(); });
          return represent ? res(200, clone(rows)) : res(204, '');
        }
      }
      if (p === '/rest/v1/settings') {
        if (c.method === 'GET') return res(200, [...settings.values()].filter(r => r.org_id === org && match(r)).map(r => ({ key: r.key, value: r.value })));
        if (c.method === 'POST') {
          for (const d of (Array.isArray(c.body) ? c.body : [c.body])) {
            if (d.org_id !== org) return res(403, { code: '42501', message: 'row-level security' });
            const k = d.org_id + '|' + d.key;
            if (settings.has(k) && !/merge-duplicates/.test(prefer)) return res(409, { code: '23505', message: 'duplicate key' });
            settings.set(k, { org_id: d.org_id, key: d.key, value: d.value });
          }
          return res(201, '');
        }
      }
      return res(404, { message: 'no such table' });
    }
  };
  return srv;
}

/* fetch: overrides first (to inject 401 / 429 / 400 / slow answers), then the model */
let server = fakeServer();
const calls = []; let routes = [];
globalThis.fetch = async (url, init) => {
  const path = String(url).replace(SB, '');
  const body = init && typeof init.body === 'string' && /^[[{]/.test(init.body) ? JSON.parse(init.body) : init && init.body;
  const call = { method: (init && init.method) || 'GET', path, body, headers: (init && init.headers) || {} };
  calls.push(call);
  for (const r of routes) if (r.method === call.method && path.startsWith(r.path)) { if (r.once) routes = routes.filter(x => x !== r); const out = await r.reply(call); if (out) return out; }
  return server.handle(call);
};
const on = (method, path, reply, once) => routes.unshift({ method, path, reply, once });
const ofMethod = (m, table) => calls.filter(c => c.method === m && c.path.startsWith('/rest/v1/' + (table || 'docs')));
const posts = table => ofMethod('POST', table);
const sent = col => posts('docs').flatMap(c => c.body).filter(d => !col || d.col === col);

/* ---- devices ---- */
const main = { name: 'main', storage: fakeStorage(), store: fakeStore(), clock: BASE };
current = main;
const cloud = await import('../js/cloud.js');
const { hooks, status, merge3, backoffMs, encodeSetting, decodeSetting, isStaleHistory } = cloud;
hooks.now = () => main.clock;
const isoAt = t => new Date(t).toISOString();
const iso = ms => isoAt(main.clock + (ms || 0));
const seenStamp = (dev, key) => ((JSON.parse(dev.storage.mem['bakasun.cloud'] || '{}').seen) || {})[key] || '';

/** Signs the main instance in through the password flow against a fresh fake server; a fresh store and storage too. */
async function signIn() {
  current = main; cloud.logout(); timers = []; calls.length = 0; routes = [];
  main.storage = fakeStorage(); main.store = fakeStore(); hooks.db = main.store; main.clock = BASE;
  server = fakeServer();
  await cloud.login(SB, 'anon', 'v@x.co', 'pw');
  await until(() => status.queued === 0 && status.state === 'on');
  calls.length = 0;
  return main.store;
}
/** A second (third...) device: a fresh module instance with its own storage, store and clock, signed into the same org. */
let devSeq = 0;
async function device(name) {
  const dev = { name, storage: fakeStorage(), store: fakeStore(), clock: BASE };
  current = dev;
  dev.mod = await import('../js/cloud.js?dev=' + name + '-' + (++devSeq));
  dev.mod.hooks.db = dev.store; dev.mod.hooks.now = () => dev.clock;
  await dev.mod.login(SB, 'anon', 'v@x.co', 'pw');
  await until(() => dev.mod.status.queued === 0 && dev.mod.status.state === 'on');
  return dev;
}
const edit = (dev, col, rec, deleted) => { current = dev; dev.store.put(col, rec); dev.mod.enqueue({ col, id: rec.id, data: rec, deleted }); };
const flushOf = dev => { current = dev; return dev.mod.flush(); };
const pullOf = dev => { current = dev; return dev.mod.pullAll(); };

/* ================================================================ tests */

test('a flush pulls before it pushes: the first request is a GET of docs, the write comes after it', async () => {
  const store = await signIn();
  const rec = { id: 'p1', title: 'x', updated: iso() };
  store.put('tasks', rec); cloud.enqueue({ col: 'tasks', id: 'p1', data: rec });
  assert.equal(await cloud.flush(), true);
  assert.equal(calls[0].method, 'GET'); assert.ok(calls[0].path.startsWith('/rest/v1/docs?select=id,col,data,deleted,updated&org_id=eq.org1'));
  assert.equal(calls[1].method, 'POST'); assert.ok(calls[1].path.startsWith('/rest/v1/docs'));
  assert.equal(calls.filter(c => c.path.startsWith('/rest/v1/settings')).length, 0, 'the pull inside a flush skips the settings table');
});

test('push: a new record is a conditional insert, a known one a PATCH against the stamp we saw; the row carries no client timestamp', async () => {
  const store = await signIn();
  const rec = { id: 'c1', client: 'טבע', place: 'הרצליה', updated: iso() };
  store.put('cases', rec); cloud.enqueue({ col: 'cases', id: 'c1', data: rec });
  assert.equal(status.queued, 1);
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud.queue'])[0].base, null); // a new record has no base
  await cloud.flush();
  const d = sent('cases');
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { id: 'c1', org_id: 'org1', col: 'cases', data: rec, deleted: false });
  assert.equal('updated' in d[0], false, 'the server stamps the row');
  assert.equal(posts('docs')[0].path, '/rest/v1/docs?on_conflict=org_id,col,id');
  assert.equal(posts('docs')[0].headers.Prefer, 'resolution=ignore-duplicates,return=representation');
  assert.equal(posts('docs')[0].headers.Authorization, 'Bearer T1');
  assert.equal(status.queued, 0); assert.equal(status.state, 'on'); assert.ok(status.last);
  const s1 = server.row('cases', 'c1').updated;
  assert.ok(/^2026-10-01T12:00:\d\d\.000000\+00:00$/.test(s1), 'the stamp is the server\'s');
  assert.equal(seenStamp(main, 'cases:c1'), s1, 'the stamp the server returned is remembered');
  // the next edit of the same record carries the pushed version as its base and goes up as a PATCH against that stamp
  const rec2 = Object.assign({}, rec, { place: 'שפיים', updated: iso(1000) });
  store.put('cases', rec2); cloud.enqueue({ col: 'cases', id: 'c1', data: rec2 });
  assert.deepEqual(JSON.parse(main.storage.mem['bakasun.cloud.queue'])[0].base, rec);
  calls.length = 0;
  await cloud.flush();
  assert.equal(posts('docs').length, 0, 'a known record is not inserted again');
  const patch = ofMethod('PATCH');
  assert.equal(patch.length, 1);
  assert.equal(patch[0].path, '/rest/v1/docs?org_id=eq.org1&col=eq.cases&id=eq.c1&updated=eq.' + encodeURIComponent(s1));
  assert.equal(patch[0].headers.Prefer, 'return=representation');
  assert.deepEqual(patch[0].body, { data: rec2, deleted: false });
  const s2 = server.row('cases', 'c1').updated;
  assert.ok(s2 > s1); assert.deepEqual(server.row('cases', 'c1').data, rec2);
  assert.equal(seenStamp(main, 'cases:c1'), s2);
  assert.equal(status.queued, 0);
});

test('pull: newest wins when nothing is pending here; the pull is paged and the next one starts five minutes before the last row', async () => {
  const store = await signIn();
  store.put('tasks', { id: 't1', title: 'ישן', updated: '2026-09-01T00:00:00.000Z' });
  store.put('tasks', { id: 't2', title: 'חדש כאן', updated: '2026-09-30T00:00:00.000Z' });
  const at = i => new Date(Date.parse('2026-09-20T00:00:00.000Z') + i * 1000).toISOString().replace('Z', '+00:00');
  server.put('org1', 'tasks', 't1', { id: 't1', title: 'מהענן', updated: '2026-09-20T00:00:00.000Z' }, false, at(1));
  server.put('org1', 'tasks', 't2', { id: 't2', title: 'ישן בענן', updated: '2026-09-10T00:00:00.000Z' }, false, at(2));
  server.put('org1', 'tasks', 't3', { id: 't3', title: 'רק בענן', updated: '2026-09-26T00:00:00.000Z' }, false, at(3));
  for (let i = 4; i <= 1001; i++) server.put('org1', 'tasks', 't' + i, { id: 't' + i, title: 'מילוי ' + i, updated: '2026-09-21T00:00:00.000Z' }, false, at(i));
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't1').title, 'מהענן');
  assert.equal(store.get('tasks', 't2').title, 'חדש כאן');
  assert.equal(store.get('tasks', 't3').title, 'רק בענן');
  assert.equal(store.state.tasks.length, 1001, 'both pages arrived');
  const gets = ofMethod('GET');
  assert.equal(gets.length, 2);
  assert.ok(gets[0].path.includes('order=updated.asc,col.asc,id.asc&limit=1000&offset=0'));
  assert.ok(gets[1].path.includes('limit=1000&offset=1000'));
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud']).since, at(1001));
  calls.length = 0;
  await cloud.pullAll();
  const q2 = ofMethod('GET')[0].path;
  assert.ok(q2.includes('updated=gt.' + encodeURIComponent(new Date(Date.parse(at(1001)) - 5 * 60 * 1000).toISOString())), 'five minutes before the last row');
  assert.equal(ofMethod('GET').length, 1, 'the overlap window holds fewer than a page');
  assert.equal(store.state.tasks.length, 1001);
});

test('two devices: different fields merge with no conflict, the same field goes to the later writer with a note, a clock in the past is no obstacle', async () => {
  current = main; cloud.logout(); timers = []; calls.length = 0; routes = []; server = fakeServer();
  const A = await device('a'), B = await device('b');
  assert.notEqual(A.mod, B.mod); assert.notEqual(A.mod.status, B.mod.status);
  assert.equal(server.sessions.size, 2, 'two sessions of the same user');
  // A creates the case; B gets it with the next pull
  const rec = { id: 'c1', client: 'טבע', place: 'הרצליה', notes: '', updated: isoAt(BASE) };
  edit(A, 'cases', rec); assert.equal(await flushOf(A), true);
  await pullOf(B);
  assert.deepEqual(B.store.get('cases', 'c1'), rec);
  const s1 = server.row('cases', 'c1').updated;
  assert.equal(seenStamp(A, 'cases:c1'), s1); assert.equal(seenStamp(B, 'cases:c1'), s1);
  // A edits the notes, B edits the place thirty seconds later; B flushes first
  A.clock = BASE + 10e3; edit(A, 'cases', Object.assign({}, rec, { notes: 'חוזה נחתם', updated: isoAt(A.clock) }));
  B.clock = BASE + 40e3; edit(B, 'cases', Object.assign({}, rec, { place: 'שפיים', updated: isoAt(B.clock) }));
  calls.length = 0; B.clock = BASE + 50e3;
  assert.equal(await flushOf(B), true);
  const s2 = server.row('cases', 'c1').updated;
  assert.ok(s2 > s1);
  assert.equal(server.row('cases', 'c1').data.place, 'שפיים'); assert.equal(server.row('cases', 'c1').data.notes, '');
  assert.equal(ofMethod('PATCH').length, 1); assert.ok(ofMethod('PATCH')[0].path.endsWith('updated=eq.' + encodeURIComponent(s1)));
  // A flushes: pulls B's write, merges field by field against the base, writes the merge
  calls.length = 0; A.clock = BASE + 60e3;
  assert.equal(await flushOf(A), true);
  assert.equal(calls[0].method, 'GET');
  assert.equal(ofMethod('PATCH').length, 1); assert.ok(ofMethod('PATCH')[0].path.endsWith('updated=eq.' + encodeURIComponent(s2)), 'written against the stamp B left');
  const onServer = server.row('cases', 'c1').data;
  assert.equal(onServer.place, 'שפיים'); assert.equal(onServer.notes, 'חוזה נחתם'); assert.equal(onServer.client, 'טבע');
  assert.equal(A.store.get('cases', 'c1').place, 'שפיים'); assert.equal(A.store.get('cases', 'c1').notes, 'חוזה נחתם');
  assert.equal(A.mod.status.conflicts.length, 0); assert.equal(A.mod.status.queued, 0);
  await pullOf(B);
  assert.equal(B.store.get('cases', 'c1').place, 'שפיים'); assert.equal(B.store.get('cases', 'c1').notes, 'חוזה נחתם');
  assert.equal(B.mod.status.conflicts.length, 0); assert.equal(B.mod.status.queued, 0);
  const s3 = server.row('cases', 'c1').updated;
  assert.equal(seenStamp(A, 'cases:c1'), s3); assert.equal(seenStamp(B, 'cases:c1'), s3);
  // the same field on both sides: B writes first, A (the later writer) wins it and notes the conflict; B follows the server
  A.clock = BASE + 70e3; edit(A, 'cases', Object.assign({}, A.store.get('cases', 'c1'), { place: 'קיסריה', updated: isoAt(A.clock) }));
  B.clock = BASE + 100e3; edit(B, 'cases', Object.assign({}, B.store.get('cases', 'c1'), { place: 'נתניה', updated: isoAt(B.clock) }));
  B.clock = BASE + 110e3; assert.equal(await flushOf(B), true);
  assert.equal(server.row('cases', 'c1').data.place, 'נתניה');
  A.clock = BASE + 120e3; assert.equal(await flushOf(A), true);
  assert.equal(server.row('cases', 'c1').data.place, 'קיסריה', 'the later writer wins the field');
  assert.equal(server.row('cases', 'c1').data.notes, 'חוזה נחתם', 'the rest is untouched');
  assert.equal(A.mod.status.conflicts.length, 1);
  assert.equal(A.mod.status.conflicts[0].kind, 'both-changed'); assert.deepEqual(A.mod.status.conflicts[0].fields, ['place']); assert.equal(A.mod.status.conflicts[0].id, 'c1');
  assert.equal(JSON.parse(A.storage.mem['bakasun.cloud']).conflicts.length, 1, 'the note survives a reload');
  await pullOf(B);
  assert.equal(B.store.get('cases', 'c1').place, 'קיסריה', 'the losing side takes the server\'s version');
  assert.equal(B.mod.status.conflicts.length, 0, 'B had nothing pending: its write went through and was then overwritten');
  // B's clock is years behind: the server's stamp decides, the edit is accepted and A receives it
  B.clock = Date.parse('2019-01-01T00:00:00.000Z');
  edit(B, 'cases', Object.assign({}, B.store.get('cases', 'c1'), { notes: 'מהעבר', updated: isoAt(B.clock) }));
  const before = server.row('cases', 'c1').updated;
  assert.equal(await flushOf(B), true);
  assert.equal(server.row('cases', 'c1').data.notes, 'מהעבר'); assert.ok(server.row('cases', 'c1').updated > before);
  assert.equal(B.mod.status.queued, 0); assert.equal(B.mod.status.state, 'on'); assert.equal(B.mod.status.conflicts.length, 0);
  A.clock = BASE + 130e3; await pullOf(A);
  assert.equal(A.store.get('cases', 'c1').notes, 'מהעבר', 'A takes it although its own stamp is newer: the server ordered the writes');
  assert.equal(A.store.get('cases', 'c1').place, 'קיסריה');
  assert.equal(seenStamp(A, 'cases:c1'), server.row('cases', 'c1').updated);
  current = A; A.mod.logout(); current = B; B.mod.logout(); current = main;
});

test('conflict on create: the record was created there between our pull and our insert → newest wins, the other way is a PATCH', async () => {
  const store = await signIn();
  // ours is newer: the other side loses, our version goes up with a PATCH against the stamp of theirs
  const mine = { id: 'n1', text: 'שלי', updated: iso(5000) };
  store.put('notes', mine); cloud.enqueue({ col: 'notes', id: 'n1', data: mine });
  on('POST', '/rest/v1/docs', () => { server.put('org1', 'notes', 'n1', { id: 'n1', text: 'שלהם', updated: iso(0) }); return null; }, true);
  assert.equal(await cloud.flush(), true);
  assert.equal(posts('docs').length, 1); assert.equal(ofMethod('PATCH').length, 1); assert.equal(ofMethod('GET').length, 2, 'pulled again after the conflict');
  assert.equal(server.row('notes', 'n1').data.text, 'שלי');
  assert.equal(status.conflicts[0].kind, 'lost-remote'); assert.equal(status.queued, 0); assert.equal(status.state, 'on');
  // theirs is newer: ours is dropped, the store takes theirs, nothing more is written
  calls.length = 0;
  const mine2 = { id: 'n2', text: 'שלי', updated: iso(0) };
  store.put('notes', mine2); cloud.enqueue({ col: 'notes', id: 'n2', data: mine2 });
  on('POST', '/rest/v1/docs', () => { server.put('org1', 'notes', 'n2', { id: 'n2', text: 'שלהם', updated: iso(5000) }); return null; }, true);
  assert.equal(await cloud.flush(), true);
  assert.equal(ofMethod('PATCH').length, 0);
  assert.equal(server.row('notes', 'n2').data.text, 'שלהם'); assert.equal(store.get('notes', 'n2').text, 'שלהם');
  assert.equal(status.conflicts[0].kind, 'lost-local'); assert.equal(status.queued, 0);
});

test('conflict on update: the stamp moved under us → pull, merge, write again; after three rounds it waits for the next flush', async () => {
  const store = await signIn();
  const base = { id: 'c5', client: 'טבע', place: 'הרצליה', notes: '', updated: '2026-09-29T10:00:00.000Z' };
  server.put('org1', 'cases', 'c5', base);
  await cloud.pullAll();
  assert.deepEqual(store.get('cases', 'c5'), base);
  const mine = Object.assign({}, base, { place: 'שפיים', updated: iso(1000) });
  store.put('cases', mine); cloud.enqueue({ col: 'cases', id: 'c5', data: mine });
  let hits = 0; // the other device writes a note just before each of our writes, three times
  on('PATCH', '/rest/v1/docs', () => { if (hits < 3) { hits++; server.put('org1', 'cases', 'c5', Object.assign({}, base, { notes: 'הערה ' + hits, updated: iso(500) })); } return null; });
  calls.length = 0;
  assert.equal(await cloud.flush(), false);
  assert.equal(ofMethod('PATCH').length, 3); assert.equal(ofMethod('GET').length, 4);
  assert.equal(status.queued, 1); assert.equal(status.state, 'on'); assert.equal(status.error, '');
  assert.equal(server.row('cases', 'c5').data.place, 'הרצליה', 'nothing of ours was written over theirs');
  assert.equal(store.get('cases', 'c5').place, 'שפיים'); assert.equal(store.get('cases', 'c5').notes, 'הערה 3', 'their notes were merged in');
  assert.equal(timers.length, 1, 'another flush is scheduled');
  calls.length = 0;
  await runTimers();
  assert.equal(ofMethod('PATCH').length, 1); assert.equal(status.queued, 0);
  assert.equal(server.row('cases', 'c5').data.place, 'שפיים'); assert.equal(server.row('cases', 'c5').data.notes, 'הערה 3');
  assert.equal(status.conflicts.length, 0, 'different fields: no conflict note');
});

test('merge3 is a three-way merge where the side writing now wins a field both changed, whatever the clocks say', () => {
  const r = merge3({ a: 1, b: 1, c: 1, updated: '1' }, { a: 2, b: 1, c: 3, updated: '3' }, { a: 1, b: 2, c: 4, updated: '2' });
  assert.deepEqual(r, { data: { a: 2, b: 2, c: 3, updated: '3' }, conflicts: ['c'] });
  assert.deepEqual(merge3({ c: 1, updated: '1' }, { c: 3, updated: '2' }, { c: 4, updated: '9' }), { data: { c: 3, updated: '2' }, conflicts: ['c'] });
  const gone = merge3({ a: 1, b: 1, updated: '1' }, { a: 1, updated: '2' }, { a: 1, b: 1, updated: '1' });
  assert.equal('b' in gone.data, false); assert.deepEqual(gone.conflicts, []);
  assert.deepEqual(merge3(null, { a: 1, updated: '1' }, { a: 1, b: 2, updated: '2' }).data, { a: 1, b: 2, updated: '1' });
});

test('tombstones: a delete here goes up as deleted=true; a newer delete there removes the local edit; an older one loses to it; an edit there revives a delete here', async () => {
  const store = await signIn();
  const gone = { id: 'n1', text: 'x', updated: iso() };
  cloud.enqueue({ col: 'notes', id: 'n1', data: gone, deleted: true });
  await cloud.flush();
  assert.deepEqual(sent('notes')[0], { id: 'n1', org_id: 'org1', col: 'notes', data: gone, deleted: true });
  assert.equal(server.row('notes', 'n1').deleted, true);
  // edited here (pending), deleted there later: the delete wins, the queued edit is dropped
  const t1 = { id: 't1', title: 'a', updated: '2026-09-30T10:00:00.000Z' };
  store.put('tasks', t1); cloud.enqueue({ col: 'tasks', id: 't1', data: t1 });
  server.put('org1', 'tasks', 't1', Object.assign({}, t1, { updated: '2026-09-30T11:00:00.000Z' }), true);
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't1'), null);
  assert.equal(status.queued, 0);
  assert.equal(status.conflicts[0].kind, 'deleted-elsewhere');
  // edited here after the delete there: the edit wins, stays queued and goes up as deleted=false against the tombstone's stamp
  const t2 = { id: 't2', title: 'b', updated: '2026-09-30T12:00:00.000Z' };
  store.put('tasks', t2); cloud.enqueue({ col: 'tasks', id: 't2', data: t2 });
  const tombStamp = server.put('org1', 'tasks', 't2', Object.assign({}, t2, { updated: '2026-09-30T11:00:00.000Z' }), true).updated;
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't2').title, 'b');
  assert.equal(status.queued, 1);
  calls.length = 0;
  await cloud.flush();
  assert.ok(ofMethod('PATCH')[0].path.endsWith('id=eq.t2&updated=eq.' + encodeURIComponent(tombStamp)));
  assert.ok(server.row('tasks', 't2').updated > tombStamp, 'the server stamped the write');
  assert.equal(server.row('tasks', 't2').deleted, false); assert.equal(server.row('tasks', 't2').data.title, 'b');
  // deleted here (pending), edited there later: the record comes back
  cloud.enqueue({ col: 'tasks', id: 't2', data: Object.assign({}, t2, { updated: '2026-09-30T13:00:00.000Z' }), deleted: true });
  server.put('org1', 'tasks', 't2', Object.assign({}, t2, { title: 'c', updated: '2026-09-30T14:00:00.000Z' }));
  await cloud.pullAll();
  assert.equal(store.get('tasks', 't2').title, 'c');
  assert.equal(status.queued, 0);
  assert.equal(status.conflicts[0].kind, 'edited-elsewhere');
});

test('401: one refresh (single flight) and the requests retried with the new token; a dead refresh token means expired; a session from a link', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'n2', data: { id: 'n2', updated: iso() } });
  server.revoke('T1'); // the access token died on the server
  await Promise.all([cloud.pullAll(), cloud.flush()]); // two requests hit the 401 together
  const rf = calls.filter(c => c.path.startsWith('/auth/v1/token?grant_type=refresh_token'));
  assert.equal(rf.length, 1, 'one refresh for both');
  assert.deepEqual(rf[0].body, { refresh_token: 'R1' });
  assert.equal(rf[0].headers.Authorization, 'Bearer anon');
  assert.equal(ofMethod('GET').filter(c => c.headers.Authorization === 'Bearer T1').length, 2, 'both first tries went with the old token');
  assert.equal(posts('docs').length, 1); assert.equal(posts('docs')[0].headers.Authorization, 'Bearer T2');
  assert.equal(status.state, 'on'); assert.equal(status.queued, 0); assert.equal(server.row('notes', 'n2').id, 'n2');
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud']).refresh, 'R2');
  assert.equal(server.refreshes.has('R1'), false, 'a refresh token is single-use');
  // the refresh token is dead: the queue is kept, the status says expired, and nothing is retried in a loop
  server.revoke('T2'); server.killRefresh(); calls.length = 0;
  cloud.enqueue({ col: 'notes', id: 'n3', data: { id: 'n3', updated: iso() } });
  timers = []; // the flush the enqueue scheduled
  assert.equal(await cloud.flush(), false);
  assert.equal(status.expired, true); assert.equal(status.state, 'error'); assert.equal(status.error, 'session-expired');
  assert.equal(status.queued, 1);
  assert.equal(cloud.isOn(), true, 'the stored session stays until she signs in again');
  assert.equal(timers.length, 0, 'no retry is scheduled');
  calls.length = 0; await cloud.flush(); await cloud.pullAll();
  assert.equal(calls.length, 0, 'nothing is sent while expired');
  // a session that arrived from the mail link (URL hash): /auth/v1/user names the user, then the usual login
  const s = server.issue('v@x.co');
  assert.equal(await cloud.loginWithLink(SB, 'anon', { accessToken: s.access_token, refreshToken: s.refresh_token }), 'v@x.co');
  assert.equal(cloud.config().email, 'v@x.co'); assert.equal(status.expired, false);
  await until(() => status.queued === 0 && status.state === 'on');
  assert.equal(server.row('notes', 'n3').id, 'n3', 'the queue waited for the sign-in and went up');
});

test('429 and no network: the queue waits with backoff (Retry-After honoured, one attempt per failed flush) and goes up when the time comes', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'n4', data: { id: 'n4', updated: iso() } });
  on('GET', '/rest/v1/docs', () => res(429, 'slow down', { 'Retry-After': '7' }), true);
  assert.equal(await cloud.flush(), false);
  assert.equal(status.state, 'error'); assert.equal(status.attempt, 1); assert.equal(status.queued, 1);
  assert.equal(status.retryAt, main.clock + 7000);
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 7000);
  calls.length = 0;
  assert.equal(await cloud.flush(), false);
  assert.equal(calls.length, 0, 'too early: nothing is sent');
  main.clock += 8000; timers = [];
  on('POST', '/rest/v1/docs', () => { throw new TypeError('Failed to fetch'); }, true);
  await cloud.flush();
  assert.equal(status.attempt, 2); assert.equal(status.retryAt, main.clock + 4000); assert.equal(status.queued, 1);
  assert.ok(/network/.test(status.error));
  main.clock += 5000;
  assert.equal(await cloud.flush(), true);
  assert.equal(status.error, '');
  assert.equal(status.state, 'on'); assert.equal(status.attempt, 0); assert.equal(status.retryAt, 0); assert.equal(status.queued, 0);
  assert.equal(server.row('notes', 'n4').id, 'n4');
  assert.equal(backoffMs(1), 2000); assert.equal(backoffMs(5), 32000); assert.equal(backoffMs(20), 300000); assert.equal(backoffMs(3, 60), 60000);
});

test('a row the server refuses (400) is set aside, the rest of the batch still goes up', async () => {
  await signIn();
  cloud.enqueue({ col: 'notes', id: 'ok1', data: { id: 'ok1', updated: iso() } });
  cloud.enqueue({ col: 'notes', id: 'bad', data: { id: 'bad', updated: iso() } });
  on('POST', '/rest/v1/docs', c => (c.body.some(d => d.id === 'bad') ? res(400, 'bad row') : null));
  await cloud.flush();
  assert.equal(status.queued, 0); assert.equal(status.failed, 1); assert.equal(status.state, 'on');
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud']).failed[0].id, 'bad');
  assert.equal(server.row('notes', 'ok1').id, 'ok1'); assert.equal(server.row('notes', 'bad'), null);
});

test('the queue survives a reload: a fresh module instance pushes what was queued before and keeps the stamps it saw', async () => {
  await signIn();
  cloud.enqueue({ col: 'clients', id: 'k1', data: { id: 'k1', name: 'לקוח', updated: iso() } });
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud.queue']).length, 1);
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud.queue'])[0].col, 'clients');
  calls.length = 0; timers = [];
  const again = await import('../js/cloud.js?reload=1'); // the same file, a fresh instance: like the app opening again
  assert.equal(again.isOn(), true);
  again.hooks.now = () => main.clock;
  await until(() => again.status.queued === 0 && again.status.state === 'on');
  assert.equal(sent('clients')[0].id, 'k1');
  assert.equal(server.row('clients', 'k1').data.name, 'לקוח');
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud.queue']).length, 0);
  assert.equal(seenStamp(main, 'clients:k1'), server.row('clients', 'k1').updated);
  again.logout();
  assert.equal(main.storage.mem['bakasun.cloud'], undefined);
});

test('changes made while a push is in flight are not lost', async () => {
  await signIn();
  let release; on('POST', '/rest/v1/docs', () => new Promise(r => { release = () => r(null); }), true);
  cloud.enqueue({ col: 'notes', id: 'a', data: { id: 'a', updated: iso() } });
  const p = cloud.flush();
  await until(() => !!release);
  cloud.enqueue({ col: 'notes', id: 'b', data: { id: 'b', updated: iso() } });
  release(); await p;
  assert.equal(status.queued, 1);
  assert.equal(server.row('notes', 'a').id, 'a'); assert.equal(server.row('notes', 'b'), null);
  assert.ok(timers.length >= 1, 'the next flush is scheduled');
  await runTimers();
  assert.equal(status.queued, 0);
  assert.deepEqual(sent('notes').map(d => d.id), ['a', 'b']);
  assert.equal(server.row('notes', 'b').id, 'b');
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
  assert.equal(posts('settings')[0].path, '/rest/v1/settings?on_conflict=org_id,key');
  assert.equal(posts('settings')[0].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  const s = Object.fromEntries(posts('settings')[0].body.map(x => [x.key, x.value]));
  assert.deepEqual(s, { signer: 'וירג׳יני', rules: 'json:{"quietFrom":"21:00","on":true}', taskSeq: 'json:7' });
  assert.equal(posts('settings')[0].body[0].org_id, 'org1');
  assert.equal(server.settings.get('org1|rules').value, 'json:{"quietFrom":"21:00","on":true}');
  assert.equal(server.settings.size, 3);
  // a second push of the same key merges (no duplicate error)
  cloud.enqueue({ setting: 'taskSeq', value: 8 }); await cloud.flush();
  assert.equal(server.settings.get('org1|taskSeq').value, 'json:8'); assert.equal(server.settings.size, 3);
  // what comes down
  server.settings.set('org1|rules', { org_id: 'org1', key: 'rules', value: 'json:{"quietFrom":"22:00"}' });
  server.settings.set('org1|notifyCache', { org_id: 'org1', key: 'notifyCache', value: '[object Object]' });
  server.settings.set('org1|notifyState', { org_id: 'org1', key: 'notifyState', value: '[object Object]' });
  server.settings.set('org1|travel', { org_id: 'org1', key: 'travel', value: '{"on":true}' });
  server.settings.set('org1|lang', { org_id: 'org1', key: 'lang', value: 'en' });
  server.settings.set('org1|signer', { org_id: 'org1', key: 'signer', value: 'מישהו אחר' });
  cloud.enqueue({ setting: 'signer', value: 'וירג׳יני ב' }); // pending here: the cloud's value is not taken meanwhile
  await cloud.pullAll();
  assert.deepEqual(store.state.settings.rules, { quietFrom: '22:00' });
  assert.equal(store.state.settings.travel, '{"on":true}', 'a JSON string stays a string');
  assert.equal(store.state.settings.notifyCache, undefined); assert.equal(store.state.settings.notifyState, undefined); assert.equal(store.state.settings.lang, undefined);
  assert.equal(store.state.settings.signer, undefined, 'a setting pending here is not overwritten from the cloud');
  assert.equal(decodeSetting(encodeSetting({ a: [1] })).a[0], 1); assert.equal(encodeSetting('json:x'), 'json:x'); assert.equal(decodeSetting('json:{broken'), 'json:{broken');
  await cloud.flush();
  assert.equal(server.settings.get('org1|signer').value, 'וירג׳יני ב');
});

test('history: entries older than 30 days and their trimming stay on the device; recent ones travel', async () => {
  const store = await signIn();
  const old = { id: 'h1', at: iso(-40 * 864e5), summary: 'ישן' }, fresh = { id: 'h2', at: iso(-2 * 864e5), summary: 'טרי' };
  assert.equal(isStaleHistory(old), true); assert.equal(isStaleHistory(fresh), false); assert.equal(isStaleHistory({ id: 'x' }), false);
  cloud.enqueue({ col: 'history', id: 'h1', data: old });
  cloud.enqueue({ col: 'history', id: 'h2', data: fresh });
  cloud.enqueue({ col: 'history', id: 'h2', data: fresh, deleted: true });
  cloud.enqueue({ col: 'history', id: 'h3', data: { id: 'h3', at: iso(), summary: 'עכשיו' } });
  assert.equal(status.queued, 1);
  await cloud.flush();
  assert.deepEqual(sent('history').map(d => d.id), ['h3']);
  assert.equal(server.row('history', 'h3').data.summary, 'עכשיו'); assert.equal(server.row('history', 'h2'), null);
  server.put('org1', 'history', 'h1', old);
  server.put('org1', 'history', 'h4', Object.assign({}, fresh, { id: 'h4' }));
  server.put('org1', 'history', 'h5', Object.assign({}, fresh, { id: 'h5' }), true);
  await cloud.pullAll();
  assert.equal(store.get('history', 'h1'), null); assert.equal(store.get('history', 'h4').summary, 'טרי'); assert.equal(store.get('history', 'h5'), null);
});

test('storage errors: a localStorage that throws does not stop the sync; files: a missing bucket is reported, a 401 on storage refreshes the session', async () => {
  await signIn();
  main.storage.fail = true;
  cloud.enqueue({ col: 'notes', id: 'q1', data: { id: 'q1', updated: iso() } });
  assert.equal(status.queued, 1);
  assert.equal(main.storage.mem['bakasun.cloud.queue'], '[]', 'could not be saved: the queue lives on in memory');
  assert.equal(await cloud.flush(), true);
  assert.equal(server.row('notes', 'q1').id, 'q1'); assert.equal(status.state, 'on');
  assert.equal(main.storage.mem['bakasun.cloud.queue'], '[]');
  main.storage.fail = false;
  on('POST', '/storage/v1/object/receipts/', () => res(404, '{"error":"Bucket not found"}'), true);
  assert.equal(await cloud.uploadFile('receipts', 'org1/2026-10/r1.jpg', { type: 'image/jpeg' }), false);
  assert.ok(/Bucket not found/.test(status.fileError));
  on('POST', '/storage/v1/object/receipts/', c => (c.headers.Authorization === 'Bearer T1' ? res(401, 'x') : res(200, '{}')));
  assert.equal(await cloud.uploadFile('receipts', 'org1/2026-10/r1.jpg', { type: 'image/jpeg' }), true);
  assert.equal(status.fileError, '');
  assert.equal(JSON.parse(main.storage.mem['bakasun.cloud']).refresh, 'R2');
  on('GET', '/storage/v1/object/receipts/', () => res(200, 'bytes'), true);
  assert.equal(await cloud.downloadFileBlob('receipts', 'org1/2026-10/r1.jpg'), 'bytes');
  cloud.logout();
  assert.equal(cloud.isOn(), false); assert.equal(main.storage.mem['bakasun.cloud'], undefined); assert.equal(status.state, 'off');
});
