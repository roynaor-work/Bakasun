import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

test('island active runtime including connected models stays within 15 MB', async () => {
  const files = (await filesIn(root)).filter(file => !/\/(?:verification|tests)\//.test(file.pathname));
  // The uploaded model library also contains deferred alternatives. Audit the
  // shipped runtime references rather than charging every unused GLB and PR
  // screenshot to the game's original 15 MB runtime budget.
  const connected = new Set();
  for (const file of files.filter(file => /\.(?:mjs|json|html)$/.test(file.pathname))) {
    for (const [model] of (await readFile(file, 'utf8')).matchAll(/assets\/models\/[\w-]+\.glb/g)) connected.add(new URL(model, root).href);
  }
  assert.ok(connected.has(new URL('assets/models/car-a-512.glb', root).href));
  assert.ok(connected.has(new URL('assets/models/adult-man-rigged-512.glb', root).href));
  for (const model of connected) await access(new URL(model));
  const active = files.filter(file => !file.pathname.includes('/assets/models/') || connected.has(file.href));
  const sizes = await Promise.all(active.map(async file => (await stat(file)).size));
  const bytes = sizes.reduce((sum, size) => sum + size, 0);
  assert.ok(bytes > 1_473_368, 'the delivery includes the full model and its runtime');
  assert.ok(bytes <= 15_000_000, `${bytes} bytes exceeds the requested 15 MB budget`);
});
