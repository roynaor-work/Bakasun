import test from 'node:test';
import assert from 'node:assert/strict';

export function checkAdapter(id, importer) {
  test(`${id}: lazy import and mocked load`, async () => {
    let network = 0;
    const original = globalThis.fetch;
    globalThis.fetch = () => { network += 1; throw new Error('unexpected eager request'); };
    let module;
    try { module = await importer(); }
    finally { globalThis.fetch = original; }
    assert.equal(network, 0);
    assert.equal(module.metadata.id, id);
    assert.equal(module.ready(), false);
    const calls = [];
    const adapter = module.create({loadAsset(asset, {url}) {
      calls.push(asset.name);
      assert.equal(new URL(url).pathname.endsWith(`/assets/${id}/${asset.path}`), true);
      return {name: asset.name};
    }});
    const existing = {legacy: true};
    assert.equal(adapter.get(module.metadata.assets[0]?.name, existing), existing);
    assert.equal(adapter.ready(), false);
    assert.equal(calls.length, 0);
    const first = adapter.load();
    if (module.metadata.available) assert.equal(adapter.load(), first, 'concurrent callers share the attempt');
    const success = await first;
    assert.equal(success, module.metadata.available);
    assert.equal(adapter.ready(), success);
    assert.equal(calls.length, success ? module.metadata.assets.length : 0);
    for (const asset of module.metadata.assets) {
      assert.equal(adapter.get(asset.name, existing).name, success ? asset.name : undefined);
    }
    assert.equal(adapter.get('absent', existing), existing);
    adapter.dispose();
  });

  test(`${id}: failure stays silent and preserves the existing asset`, async () => {
    const module = await importer();
    const existing = {legacy: true};
    let attempts = 0;
    const adapter = module.create({loadAsset() { attempts += 1; throw new Error('simulated missing asset'); }});
    assert.equal(await adapter.load(), false);
    assert.equal(adapter.ready(), false);
    assert.equal(adapter.get(module.metadata.assets[0]?.name, existing), existing);
    assert.equal(await adapter.load(), false, 'failure may be retried');
    assert.equal(module.metadata.available ? attempts > 0 : attempts === 0, true);
    adapter.dispose();
  });

  test(`${id}: dispose releases owned values and allows reloading`, async () => {
    const module = await importer();
    const released = [];
    let made = 0;
    const adapter = module.create({
      loadAsset(asset) { made += 1; return {name: asset.name, dispose() {released.push(this);}}; },
    });
    assert.equal(await adapter.load(), module.metadata.available);
    const count = made;
    adapter.dispose();
    adapter.dispose();
    assert.equal(adapter.ready(), false);
    assert.equal(adapter.get(module.metadata.assets[0]?.name), null);
    assert.equal(released.length, count);
    assert.equal(new Set(released).size, count, 'each owned resource released once');
    assert.equal(await adapter.load(), module.metadata.available);
    assert.equal(made, 2 * count);
    adapter.dispose();
    assert.equal(released.length, made);
  });
}
