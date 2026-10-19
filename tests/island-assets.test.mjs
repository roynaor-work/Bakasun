import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../workout/island/', import.meta.url);
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    return entry.isDirectory() ? filesIn(url) : [url];
  }));
  return nested.flat();
}

test('island ships unchanged local copies of its model, Three.js runtime and original MIT license', async () => {
  const copies = [
    ['assets/kid-full.glb', 'kid-full.glb'],
    ['vendor/three.module.js', 'vendor/three.module.js'],
    ['vendor/GLTFLoader.js', 'vendor/GLTFLoader.js'],
    ['vendor/BufferGeometryUtils.js', 'vendor/BufferGeometryUtils.js'],
    ['vendor/LICENSE.three', 'vendor/LICENSE.three'],
  ];
  for (const [delivery, original] of copies) {
    const [actual, expected] = await Promise.all([
      readFile(new URL(delivery, root)),
      readFile(new URL(`../codex-lab/kid-full/${original}`, import.meta.url)),
    ]);
    assert.ok(actual.equals(expected), `${delivery} must be byte-identical to the existing source`);
  }
  assert.match(await readFile(new URL('vendor/LICENSE.three', root), 'utf8'), /The MIT License/);
});

test('island view imports and model URLs resolve to existing files inside the deployable island folder', async () => {
  const islandPath = path.resolve(fileURLToPath(root));
  let references = 0;
  for (const file of (await filesIn(new URL('view/', root))).filter(url => /\.(?:mjs|js)$/.test(url.pathname))) {
    const source = await readFile(file, 'utf8');
    const modulePaths = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    const assetPaths = [...source.matchAll(/new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)].map(match => match[1]);
    for (const relative of [...modulePaths, ...assetPaths]) {
      assert.match(relative, /^\.\.?\//, `local relative reference in ${file.pathname}`);
      const target = new URL(relative, file);
      const targetPath = path.resolve(fileURLToPath(target));
      assert.ok(targetPath === islandPath || targetPath.startsWith(islandPath + path.sep), `deployment must not depend on ${relative} outside workout/island/`);
      await access(target);
      references++;
    }
  }
  assert.ok(references >= 8, 'audit includes the real view modules, Three imports and GLB URL');
});

test('every bundled island GLB stays within 2 MB', async () => {
  const models = (await filesIn(root)).filter(file => file.pathname.endsWith('.glb'));
  for (const model of models) {
    const bytes = (await stat(model)).size;
    assert.ok(bytes > 0 && bytes <= 2_000_000, `${model.pathname}: ${bytes} bytes exceeds the 2 MB model budget`);
  }
});

test('island bundles only referenced game models and preserves their audited bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/models/manifest.json', root), 'utf8'));
  const referenced = new Set();
  function collect(value) {
    if (typeof value === 'string' && /^assets\/models\/[^/]+\.glb$/.test(value)) referenced.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  }
  for (const name of ['config', 'buildings']) {
    collect(JSON.parse(await readFile(new URL(`data/${name}.json`, root), 'utf8')));
  }
  const bundled = (await filesIn(new URL('assets/models/', root)))
    .filter(file => file.pathname.endsWith('.glb'))
    .map(file => path.relative(fileURLToPath(root), fileURLToPath(file)));
  assert.deepEqual(bundled.sort(), [...referenced].sort(), 'unconnected models must stay out of the deployable folder');
  assert.deepEqual(Object.keys(manifest).sort(), bundled);
  for (const model of bundled) {
    const bytes = await readFile(new URL(model, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest[model], `${model} changed from its visual audit`);
  }
});
