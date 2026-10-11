import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createVideoCloud } from '../workout/js/vids-cloud.js';

// Fetch-only contract double, not a PostgreSQL/RLS test. All codes/keys are fake.
const A = 'TESTAAAA', B = 'TESTBBBB', WRONG = 'WRONGXXX';
const BASE = 'https://storage.example.test', KEY = 'fake-public-key';
const hash = code => createHash('sha256').update(code).digest('hex');
function server() {
  const families = new Set([hash(A), hash(B)]), files = new Map(), calls = [];
  const secret = 'test-signing-secret-with-no-production-value';
  let now = Math.floor(Date.now() / 1000);
  const sign = payload => {
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const data = `${header}.${Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + 120 })).toString('base64url')}`;
    return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
  };
  const verify = token => {
    const [header, payload, signature] = token.split('.');
    if (signature !== createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')) throw Error('signature');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (claims.exp <= now) throw Error('expired');
    return claims;
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || 'GET';
    calls.push({ url, method, opts });
    if (u.pathname.includes('/object/list')) return json({ error: 'denied' }, 403);
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const body = JSON.parse(opts.body), { code, path, action } = body;
      if (!families.has(hash(code))) return json({ message: 'unknown family code' }, 401);
      if (u.pathname.endsWith('kidfit_vids_catalog')) {
        return json([...files].filter(([path]) => path.startsWith(code + '/')).map(([path, blob]) => ({ id: path.split('/')[1], mime: blob.type, updated: 'test-version' })));
      }
      if (!/^[A-Z0-9]{8,12}\/[a-z0-9][a-z0-9-]{0,79}$/.test(path) || path.split('/')[0] !== code) return json({ error: 'invalid family path' }, 403);
      if (!['download', 'upload', 'delete'].includes(action)) return json({}, 400);
      if (action === 'upload' && files.has(path)) return json({ message: 'video already exists' }, 409);
      if (action !== 'upload' && !files.has(path)) return json({}, 404);
      const token = sign({ url: `kidfit-vids/${path}`, scope: action,
        ...(action === 'upload' ? { upsert: false } : {}),
        ...(action === 'delete' ? { role: 'kidfit_vids_delete', kidfit_path: path } : {}),
      });
      const route = action === 'upload' ? 'upload/sign/' : action === 'download' ? 'sign/' : '';
      return json({ path: `/storage/v1/object/${route}kidfit-vids/${path}${action === 'delete' ? '' : '?token=' + token}`,
        ...(action === 'delete' ? { token } : {}), expires: now + 120 });
    }
    const match = u.pathname.match(/^\/storage\/v1\/object\/(upload\/sign\/|sign\/)?kidfit-vids\/(.+)$/);
    if (!match) return json({}, 404);
    const action = match[1] === 'upload/sign/' ? 'upload' : match[1] === 'sign/' ? 'download' : 'delete';
    const path = match[2];
    let claims;
    try { claims = verify(u.searchParams.get('token') || String(opts.headers?.Authorization).replace(/^Bearer /, '')); }
    catch { return json({ error: 'bad token' }, 403); }
    if (claims.scope !== action || claims.url !== `kidfit-vids/${path}`) return json({}, 403);
    if (action === 'upload') {
      if (method !== 'PUT' || claims.upsert !== false) return json({}, 403);
      if (files.has(path)) return json({ message: 'video already exists' }, 409);
      files.set(path, opts.body); return json({ Key: path });
    }
    if (action === 'delete') {
      if (method !== 'DELETE' || claims.role !== 'kidfit_vids_delete' || claims.kidfit_path !== path) return json({}, 403);
      files.delete(path); return json({});
    }
    return files.has(path) ? new Response(files.get(path)) : json({}, 404);
  };
  return { fetch, files, calls, advance: seconds => { now += seconds; },
    client: createVideoCloud({ baseUrl: BASE, publicKey: KEY, fetch }) };
}
const clip = () => new Blob(['fake video'], { type: 'video/mp4' });

test('catalog, upload, download and remove never call Storage list or public download', async () => {
  const s = server(); s.files.set(`${B}/squat`, clip());
  await s.client.upload(A, 'squat', clip());
  assert.deepEqual((await s.client.catalog(A)).map(v => v.id), ['squat']);
  const url = await s.client.download(A, 'squat');
  assert.match(url, /\/object\/sign\/kidfit-vids\/TESTAAAA\/squat\?token=/);
  assert.equal(await (await s.fetch(url)).text(), 'fake video');
  await s.client.remove(A, 'squat');
  assert.equal(s.files.has(`${A}/squat`), false);
  assert.equal(s.files.has(`${B}/squat`), true);
  assert.equal(s.calls.some(c => /\/object\/(list|public)\//.test(c.url)), false);
  const upload = s.calls.find(c => c.method === 'PUT');
  assert.equal(upload.opts.headers['x-upsert'], 'false');
  const remove = s.calls.find(c => c.method === 'DELETE');
  assert.notEqual(remove.opts.headers.Authorization, `Bearer ${KEY}`);
});

test('wrong family code rejects every operation before sending bytes or deleting', async () => {
  const s = server(); s.files.set(`${A}/squat`, clip());
  for (const operation of [() => s.client.catalog(WRONG), () => s.client.download(WRONG, 'squat'), () => s.client.upload(WRONG, 'squat', clip()), () => s.client.remove(WRONG, 'squat')]) {
    await assert.rejects(operation, /קוד המשפחה לא רשום/);
  }
  assert.equal(s.calls.some(c => c.url.includes('/storage/')), false);
  assert.equal(s.files.size, 1);
});

test('cross-family paths and traversal rejected by the client AND the server contract', async () => {
  const s = server(); s.files.set(`${B}/squat`, clip());
  for (const id of [`${B}/squat`, '../squat', '%2e%2e', 'squat?x=1']) await assert.rejects(() => s.client.remove(A, id), /נתיב/);
  assert.equal(s.calls.length, 0);
  for (const action of ['download', 'upload', 'delete']) {
    const r = await s.fetch(`${BASE}/rest/v1/rpc/kidfit_vids_access`, { method: 'POST', body: JSON.stringify({ code: A, path: `${B}/squat`, action }) });
    assert.equal(r.status, 403);
  }
  assert.equal(s.files.size, 1);
});

test('overwrite rejected at grant time and at signed PUT, including concurrent grants', async () => {
  const s = server();
  const body = JSON.stringify({ code: A, path: `${A}/squat`, action: 'upload' });
  const grants = await Promise.all([1, 2].map(async () => (await s.fetch(`${BASE}/rest/v1/rpc/kidfit_vids_access`, { method: 'POST', body })).json()));
  const put = grant => s.fetch(BASE + grant.path, { method: 'PUT', headers: { 'x-upsert': 'true' }, body: clip() });
  assert.equal((await put(grants[0])).status, 200);
  assert.equal((await put(grants[1])).status, 409);
  await assert.rejects(() => s.client.upload(A, 'squat', clip()), /כבר קיים/);
});

test('signed capability cannot change path or action and expires after 120 seconds', async () => {
  const s = server(); s.files.set(`${A}/squat`, clip()); s.files.set(`${B}/squat`, clip());
  const url = await s.client.download(A, 'squat');
  assert.equal((await s.fetch(url.replace(A, B))).status, 403);
  assert.equal((await s.fetch(url.replace('/object/sign/', '/object/upload/sign/'), { method: 'PUT', body: clip() })).status, 403);
  s.advance(121);
  assert.equal((await s.fetch(url)).status, 403);
});

test('client rejects grants that point at another family or contain an expired URL', async () => {
  for (const grant of [
    { path: `/storage/v1/object/sign/kidfit-vids/${B}/squat?token=fake`, expires: Date.now() / 1000 + 120 },
    { path: `/storage/v1/object/sign/kidfit-vids/${A}/squat?token=fake`, expires: 1 },
  ]) {
    const client = createVideoCloud({ baseUrl: BASE, publicKey: KEY, fetch: async () => new Response(JSON.stringify(grant)) });
    await assert.rejects(() => client.download(A, 'squat'), /הרשאת הסרטון/);
  }
});

test('vids module clears family metadata, ignores legacy cache and handles rejected requests', async () => {
  const s = server(), memory = new Map([['kidfit.cloudVids', JSON.stringify({ squat: {} })]]);
  globalThis.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  globalThis.window = { addEventListener() {} };
  const oldFetch = globalThis.fetch; globalThis.fetch = s.fetch;
  try {
    const vids = await import('../workout/js/vids.js');
    assert.deepEqual(vids.cloudVideos(), {});
    assert.equal(memory.has('kidfit.cloudVids'), false);
    s.files.set(`${A}/squat`, clip());
    await vids.refreshCloud(A);
    assert.equal(vids.sourceOf('squat'), 'cloud');
    assert.match((await vids.videoUrl('squat', A)).url, /\/object\/sign\//);
    assert.equal(await vids.videoUrl('squat', B), null);
    assert.deepEqual(vids.cloudVideos(), {});
    await vids.refreshCloud(WRONG);
    assert.match(vids.vidStatus.error, /קוד המשפחה לא רשום/);
    assert.equal(await vids.cloudUpload(WRONG, 'squat', clip()), false);
    assert.equal(await vids.cloudDelete(WRONG, 'squat'), false);
    assert.equal(s.files.has(`${A}/squat`), true);
    assert.equal(s.calls.some(c => c.url.includes('/object/list/')), false);
  } finally { globalThis.fetch = oldFetch; }
});

test('migration retains required security boundaries and app does not register typed codes', async () => {
  const sql = await readFile(new URL('../supabase/vids-private.sql', import.meta.url), 'utf8');
  for (const name of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`drop policy if exists kidfit_vids_${name}`));
  assert.match(sql, /set public = false/);
  assert.match(sql, /as restrictive for all to public/);
  assert.match(sql, /issued \+ 120/);
  assert.match(sql, /jsonb_build_object\('upsert', false\)/);
  assert.match(sql, /public\.family_known\(code\)/);
  assert.match(sql, /split_part\(path, '\/', 1\) <> family/);
  assert.match(sql, /'storage\.object\.delete', 'object\.delete'/);
  const app = await readFile(new URL('../workout/js/app.js', import.meta.url), 'utf8');
  const handler = app.split("$('#fam').oninput")[1].split('\n')[0];
  assert.doesNotMatch(handler, /cloud\.register/);
});
