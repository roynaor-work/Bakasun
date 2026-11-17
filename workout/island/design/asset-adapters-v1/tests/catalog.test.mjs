import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isManagedPath,pathsFor} from '../../../ui/offline.mjs';
import {packs as registry} from '../src/index.mjs';
const catalog = JSON.parse(await readFile(new URL('../catalog.json', import.meta.url)));
const offline = JSON.parse(await readFile(new URL('../offline-entries.json', import.meta.url)));
const expected = 'hoops-realism-v2 hoops-motion-v14 hoops-arena-v2 tennis-motion-v2 tennis-ui-v2 tennis-crowd-people-v2 soccer-crowd-people-v2 soccer-run-cycles-v3 soccer-keeper-motion-v3 soccer-celebrations-v1 soccer-kits-venues-v1 fire-multifloor-v2 fire-rescue-people-v2 fire-fx-v2 alpine-runner-v1 alpine-content-v1 aliens-weapons-v2 alien-hits-v1 alien-enemies-v2 boars-weapons-v2 boars-world-v1 catch-vehicles-v2 catch-city-v1 naval-sinking-v1 naval-sea-v2 racing-themes-v1 racing-customize-v1 racing-podium-v1 city-citizens-v1 city-buildings-v2 avatar-customization-v1 coach-mascot-v1 ui-sounds-v1 lighting-presets-v1'.split(' ');

test('catalog covers exactly the requested 34 packs and pins copy provenance', async () => {
  assert.deepEqual(catalog.packs.map(p => p.id), expected);
  assert.deepEqual(Object.keys(registry), expected);
  const flags = new Set();
  for (const pack of catalog.packs) {
    assert.equal(pack.connection.status, 'not-connected', pack.id);
    assert.match(pack.source.commit, /^[a-f0-9]{40}$/);
    assert.equal(pack.source.branch, `codex/${pack.id}`);
    assert.match(pack.flag, /^\?asset[A-Za-z0-9]+=1$/);
    assert.equal(flags.has(pack.flag), false);
    flags.add(pack.flag);
    assert.equal(pack.bytes, pack.assets.reduce((sum,a) => sum + a.bytes,0));
    const names = new Set();
    for (const a of pack.assets) {
      assert.equal(names.has(a.name), false);
      names.add(a.name);
      assert.equal(a.name, a.path);
      assert.match(a.sha256, /^[a-f0-9]{64}$/);
      assert.match(a.blob, /^[a-f0-9]{40}$/);
      assert.ok(a.sourcePath.startsWith(pack.source.root+'/'));
      assert.ok(!/(^|\/)(source|src|screenshots?|verification|previews?|vendor)(\/|$)|\.(wasm|blend|fbx|py|ts|zip)$/.test(a.path), a.path);
      if (/\.(mjs|js)$/.test(a.path)) assert.equal(a.type, 'text', 'source helpers never execute');
      assert.equal(a.role === 'license', pack.license.files.includes(a.path));
    }
    for (const file of pack.license.files) assert.ok(pack.assets.some(a=>a.path===file&&a.role==='license'));
    const module = await import(`../src/${pack.id}.mjs`);
    assert.deepEqual(module.metadata.assets, pack.assets.filter(a=>a.role==='asset').map(({name,path,type,bytes,sha256})=>({name,path,type,bytes,sha256})));
    assert.equal(module.metadata.bytes, pack.bytes);
    assert.equal(module.metadata.available, pack.available);
  }
});

test('offline fragment uses existing schema and includes exact copy paths and lazy modules', () => {
  assert.equal(offline.schema,1);
  const paths = pathsFor(offline,undefined,{shell:true});
  const expectedPayload = catalog.packs.flatMap(p=>p.assets.map(a=>`assets/${p.id}/${a.path}`));
  assert.equal(paths.length, expectedPayload.length + catalog.packs.length + 2);
  for (const p of catalog.packs) {
    const bucket = p.game==='core' ? offline.core : offline.games[p.game];
    assert.deepEqual(bucket.filter(path=>path.startsWith(`assets/${p.id}/`)), p.assets.map(a=>`assets/${p.id}/${a.path}`));
    assert.ok(offline.shell.includes(`design/asset-adapters-v1/src/${p.id}.mjs`));
  }
  for (const path of paths) {
    assert.equal(path.startsWith('/'),false);
    assert.ok(!path.includes('..') && !path.endsWith('.wasm'));
  }
  // Licenses are cached for completeness, but do not block load(); the active worker
  // does not route their extensions. Explicit options.cache can serve such files.
  for (const p of catalog.packs) for (const a of p.assets.filter(a=>a.role==='asset')) {
    assert.ok(isManagedPath(`/workout/island/assets/${p.id}/${a.path}`) || /\.(?:mjs|js|css)$/.test(a.path), a.path);
  }
});

test('Draco-only kits pack remains unavailable; blocked binaries cannot enter offline/copy lists', () => {
  const pack = catalog.packs.find(p=>p.id==='soccer-kits-venues-v1');
  assert.equal(pack.available,false);
  assert.equal(pack.unsupported.length,12);
  assert.ok(pack.unsupported.every(a=>!pack.assets.some(allowed=>allowed.path===a.path)));
  assert.ok(!pack.assets.some(a=>a.type==='glb'));
});
