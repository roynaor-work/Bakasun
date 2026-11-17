import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter } from '../src/runtime.mjs';

const baseURL = new URL('https://assets.invalid/island/assets/example/');
const asset = (name = 'data.json', type) => ({ name, path: name, ...(type ? { type } : {}) });
const spec = (...assets) => ({ id: 'example', assets });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function makeGLB(json = { asset: { version: '2.0' } }) {
  const text = JSON.stringify(json);
  const bytes = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
  const result = new ArrayBuffer(20 + bytes.length);
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, bytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20).set(bytes);
  return result;
}

test('import/create/ready/get are lazy; concurrent load shares work; loaded values remain stable', async () => {
  let calls = 0;
  const hold = deferred();
  const adapter = createAdapter(spec(asset()), { baseURL, loadAsset: async (entry, context) => {
    calls += 1;
    assert.equal(entry.name, 'data.json');
    assert.equal(context.url, `${baseURL}data.json`);
    assert.equal(context.signal.aborted, false);
    return hold.promise;
  } });
  assert.equal(calls, 0);
  assert.equal(adapter.ready(), false);
  const fallback = { legacy: true };
  assert.equal(adapter.get('data.json', fallback), fallback);
  assert.equal(adapter.get('unknown'), null);
  const first = adapter.load();
  assert.equal(adapter.load(), first);
  await tick();
  assert.equal(calls, 1);
  assert.equal(adapter.ready(), false);
  hold.resolve({ motion: [1, 2] });
  assert.equal(await first, true);
  assert.deepEqual(adapter.get('data.json'), { motion: [1, 2] });
  assert.equal(adapter.ready(), true);
  assert.equal(await adapter.load(), true);
  assert.equal(calls, 1);
  adapter.dispose();
});

test('a partial failure releases owned assets, preserves fallbacks and allows retry', async () => {
  const released = [];
  const old = { dispose() { throw new Error('Legacy object must not be disposed'); } };
  let failing = true;
  const adapter = createAdapter(spec(asset('one.json'), asset('two.json')), {
    baseURL, concurrency: 1,
    loadAsset: entry => {
      if (failing && entry.name === 'two.json') throw new Error('Offline');
      return { name: entry.name };
    },
    releaseAsset: value => released.push(value.name),
  });
  assert.equal(await adapter.load(), false);
  assert.equal(adapter.ready(), false);
  assert.equal(adapter.get('one.json', old), old);
  assert.deepEqual(released, ['one.json']);
  failing = false;
  assert.equal(await adapter.load(), true);
  assert.deepEqual(adapter.get('two.json'), { name: 'two.json' });
  adapter.dispose();
  adapter.dispose();
  assert.deepEqual(released, ['one.json', 'one.json', 'two.json']);
});

test('dispose cancels promptly, rejects stale publication and releases a late result once', async () => {
  const hold = deferred();
  const released = [];
  let signal;
  let attempt = 0;
  const adapter = createAdapter(spec(asset()), { baseURL,
    loadAsset: (_entry, context) => {
      signal = context.signal;
      attempt += 1;
      return attempt === 1 ? hold.promise : { attempt };
    },
    releaseAsset: value => released.push(value.attempt),
  });
  const first = adapter.load();
  await tick();
  const oldSignal = signal;
  adapter.dispose();
  assert.equal(oldSignal.aborted, true);
  assert.equal(await first, false);
  assert.equal(adapter.ready(), false);
  assert.equal(await adapter.load(), true);
  hold.resolve({ attempt: 1 });
  await tick();
  assert.equal(adapter.ready(), true);
  assert.equal(adapter.get('data.json').attempt, 2);
  assert.deepEqual(released, [1]);
  adapter.dispose();
  assert.deepEqual(released, [1, 2]);
});

test('a rejected old attempt cannot clear a subsequent successful load', async () => {
  const old = deferred();
  const failed = deferred();
  let first = true;
  const released = [];
  const adapter = createAdapter(spec(asset('a.json'), asset('b.json')), { baseURL,
    loadAsset: entry => first ? (entry.name === 'a.json' ? old.promise : failed.promise) : { new: entry.name },
    releaseAsset: value => released.push(value),
  });
  const initial = adapter.load();
  await tick();
  failed.reject(new Error('Network failed'));
  assert.equal(await initial, false);
  first = false;
  assert.equal(await adapter.load(), true);
  old.resolve({ old: true });
  await tick();
  assert.equal(adapter.ready(), true);
  assert.deepEqual(adapter.get('a.json'), { new: 'a.json' });
  assert.deepEqual(released, [{ old: true }]);
  adapter.dispose();
});

test('timeout resolves false and releases results from loaders ignoring abort', async () => {
  const hold = deferred();
  let released = 0;
  let signal;
  const adapter = createAdapter(spec(asset()), { baseURL, timeoutMs: 10,
    loadAsset: (_entry, context) => { signal = context.signal; return hold.promise; },
    releaseAsset: () => { released += 1; },
  });
  assert.equal(await adapter.load(), false);
  assert.equal(signal.aborted, true);
  assert.equal(adapter.ready(), false);
  hold.resolve({});
  await tick();
  assert.equal(released, 1);
});

test('bounded workers limit simultaneous work and finish every asset', async () => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const adapter = createAdapter(spec(...Array.from({ length: 20 }, (_, i) => asset(`${i}.json`))), {
    baseURL,
    loadAsset: async () => {
      active += 1;
      calls += 1;
      maximum = Math.max(maximum, active);
      await tick();
      active -= 1;
      return {};
    },
  });
  assert.equal(await adapter.load(), true);
  assert.equal(maximum, 6);
  assert.equal(calls, 20);
  adapter.dispose();
});

test('duplicate shared resources are released once and cleanup exceptions stay silent', async () => {
  const shared = {};
  let releases = 0;
  const adapter = createAdapter(spec(asset('a.json'), asset('b.json')), {
    baseURL, loadAsset: () => shared,
    releaseAsset: () => { releases += 1; throw new Error('Cleanup error'); },
  });
  assert.equal(await adapter.load(), true);
  assert.doesNotThrow(() => adapter.dispose());
  adapter.dispose();
  assert.equal(releases, 1);
});

test('default dispose and close swallow asynchronous cleanup rejections', async () => {
  const unhandled = [];
  const onRejection = error => unhandled.push(error);
  process.on('unhandledRejection', onRejection);
  try {
    for (const method of ['dispose', 'close']) {
      let releases = 0;
      const adapter = createAdapter(spec(asset()), {
        baseURL,
        loadAsset: () => ({
          [method]() {
            releases += 1;
            return Promise.reject(new Error(`${method} failed asynchronously`));
          },
        }),
      });
      assert.equal(await adapter.load(), true);
      adapter.dispose();
      adapter.dispose();
      await tick();
      assert.equal(releases, 1);
    }
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

test('default loader parses JSON and SVG, validates binary and returns GLB buffers', async () => {
  const glb = makeGLB();
  const adapter = createAdapter(spec(asset(), asset('icon.svg'), asset('model.glb'), asset('sound.ogg')), {
    baseURL,
    fetch: async url => {
      if (url.endsWith('.json')) return new Response('{"frames":[0,1]}', { headers: { 'content-type': 'application/json' } });
      if (url.endsWith('.svg')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      if (url.endsWith('.glb')) return new Response(glb);
      return new Response(new TextEncoder().encode('OggS\0mock'));
    },
  });
  assert.equal(await adapter.load(), true);
  assert.deepEqual(adapter.get('data.json'), { frames: [0, 1] });
  assert.match(adapter.get('icon.svg'), /^<svg/);
  assert.deepEqual(adapter.get('model.glb'), glb);
  assert.ok(adapter.get('sound.ogg') instanceof ArrayBuffer);
  adapter.dispose();
});

test('an explicit current-version cache hit loads WAV without a network request', async () => {
  let matches = 0;
  let requests = 0;
  const adapter = createAdapter(spec(asset('beep.wav')), {
    baseURL,
    cache: { match: async (url, options) => {
      matches += 1;
      assert.equal(url, `${baseURL}beep.wav`);
      assert.deepEqual(options, { ignoreSearch: true });
      return new Response(new TextEncoder().encode('RIFF\0\0\0\0WAVE'));
    } },
    fetch: () => { requests += 1; throw new Error('Offline'); },
  });
  assert.equal(await adapter.load(), true);
  assert.ok(adapter.get('beep.wav') instanceof ArrayBuffer);
  assert.equal(matches, 1);
  assert.equal(requests, 0);
  adapter.dispose();
});

test('a current-version cache miss fetches the asset normally', async () => {
  let requests = 0;
  const adapter = createAdapter(spec(asset()), {
    baseURL,
    cache: { match: async () => undefined },
    fetch: async url => {
      requests += 1;
      assert.equal(url, `${baseURL}data.json`);
      return new Response('{"network":true}');
    },
  });
  assert.equal(await adapter.load(), true);
  assert.deepEqual(adapter.get('data.json'), { network: true });
  assert.equal(requests, 1);
  adapter.dispose();
});

test('cached HTML fails validation and quietly preserves the legacy fallback', async () => {
  let requests = 0;
  const adapter = createAdapter(spec(asset('beep.wav')), {
    baseURL,
    cache: { match: async () => new Response('<!doctype html><html>Offline shell</html>') },
    fetch: () => { requests += 1; throw new Error('Should not fetch after a cache hit'); },
  });
  assert.equal(await adapter.load(), false);
  assert.equal(adapter.get('beep.wav', 'legacy'), 'legacy');
  assert.equal(requests, 0);
});

test('cache.match failure falls back to the ordinary network path', async () => {
  let requests = 0;
  const adapter = createAdapter(spec(asset()), {
    baseURL,
    cache: { match: async () => { throw new Error('Cache unavailable'); } },
    fetch: async () => { requests += 1; return new Response('{"network":true}'); },
  });
  assert.equal(await adapter.load(), true);
  assert.deepEqual(adapter.get('data.json'), { network: true });
  assert.equal(requests, 1);
  adapter.dispose();
});

test('custom loaders receive the explicit cache and unsupported assets never load', async () => {
  const cache = {};
  let calls = 0;
  const options = { baseURL, cache, loadAsset: (_entry, context) => {
    calls += 1;
    assert.equal(context.cache, cache);
    return {};
  } };
  const adapter = createAdapter(spec(asset()), options);
  assert.equal(await adapter.load(), true);
  assert.equal(calls, 1);
  adapter.dispose();
  const unsupported = createAdapter(spec({ ...asset('compressed.glb'), supported: false }), options);
  assert.equal(await unsupported.load(), false);
  assert.equal(unsupported.ready(), false);
  assert.equal(calls, 1);
});

for (const [description, response] of [
  ['HTTP failure', () => new Response('Missing', { status: 404 })],
  ['HTML MIME with status 200', () => new Response('Unexpected', { headers: { 'content-type': 'text/html' } })],
  ['HTML body with status 200', () => new Response('<!doctype html><html>Offline shell</html>')],
  ['malformed JSON', () => new Response('{no')],
  ['empty JSON', () => new Response('')],
]) {
  test(`default loader quietly falls back on ${description}`, async () => {
    const adapter = createAdapter(spec(asset()), { baseURL, fetch: async () => response() });
    assert.equal(await adapter.load(), false);
    assert.equal(adapter.ready(), false);
    assert.equal(adapter.get('data.json', 'legacy'), 'legacy');
    adapter.dispose();
  });
}

test('ES modules import lazily after fetch validation and failed imports resolve false', async () => {
  let fetched = 0;
  let imported = 0;
  let rejectImport = false;
  const namespace = { colors: ['white'] };
  const adapter = createAdapter(spec(asset('palette.mjs')), { baseURL,
    fetch: async () => { fetched += 1; return new Response('export const colors = ["white"];'); },
    importModule: async url => {
      imported += 1;
      assert.equal(url, `${baseURL}palette.mjs`);
      if (rejectImport) throw new Error('Module unavailable');
      return namespace;
    },
  });
  assert.equal(fetched, 0);
  assert.equal(imported, 0);
  assert.equal(await adapter.load(), true);
  assert.equal(adapter.get('palette.mjs'), namespace);
  assert.equal(imported, 1);
  adapter.dispose();
  rejectImport = true;
  assert.equal(await adapter.load(), false);
  assert.equal(adapter.get('palette.mjs'), null);
});

test('module source declaring WASM never executes', async () => {
  let imports = 0;
  const adapter = createAdapter(spec(asset('decoder.mjs')), { baseURL,
    fetch: async () => new Response('export const decoder = WebAssembly.instantiate;'),
    importModule: () => { imports += 1; return {}; },
  });
  assert.equal(await adapter.load(), false);
  assert.equal(imports, 0);
});

for (const extension of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) {
  test(`GLB requiring ${extension} falls back without decoder loading`, async () => {
    const adapter = createAdapter(spec(asset('compressed.glb')), { baseURL,
      fetch: async () => new Response(makeGLB({ asset: { version: '2.0' }, extensionsUsed: [extension] })),
    });
    assert.equal(await adapter.load(), false);
    assert.equal(adapter.ready(), false);
  });
}

test('GLB external resources and malformed binary signatures are rejected', async () => {
  for (const [path, buffer] of [
    ['external.glb', makeGLB({ asset: { version: '2.0' }, images: [{ uri: '../secret.png' }] })],
    ['bad.glb', new TextEncoder().encode('not a binary glTF')],
    ['bad.webp', new TextEncoder().encode('not a WebP image')],
    ['bad.svg', new TextEncoder().encode('not an SVG image')],
  ]) {
    const adapter = createAdapter(spec(asset(path)), { baseURL, fetch: async () => new Response(buffer) });
    assert.equal(await adapter.load(), false, path);
    assert.equal(adapter.get(path), null);
  }
});

test('invalid relative paths, duplicate names, null values and absent assets stay fallback', async () => {
  for (const entries of [
    [asset('../source.blend')], [asset('/private.json')], [asset('https://remote.invalid/data.json')],
    [asset('decoder.wasm')], [asset('folder\\secret.json')], [asset('a.json?query')],
    [asset('%2e%2e/private.json')], [asset('%2fprivate.json')], [asset('decoder%2ewasm')],
    [asset('one.json'), { name: 'one.json', path: 'two.json' }],
  ]) {
    const adapter = createAdapter(spec(...entries), { baseURL, loadAsset: () => ({}) });
    assert.equal(await adapter.load(), false, JSON.stringify(entries));
    assert.equal(adapter.ready(), false);
    adapter.dispose();
  }
  const nullAdapter = createAdapter(spec(asset()), { baseURL, loadAsset: () => null });
  assert.equal(await nullAdapter.load(), false);
  assert.equal(await createAdapter(spec(), { baseURL }).load(), false);
  assert.equal(await createAdapter({ ...spec(asset()), available: false }, { baseURL }).load(), false);
});
