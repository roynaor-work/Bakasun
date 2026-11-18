import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BUILDINGS } from '../data/catalog.mjs';

const assetRoot = new URL('../../city-buildings-v2/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', assetRoot), 'utf8'));
const stagedRows = Object.values(BUILDINGS).filter(row => row.assetId);

// Check both directions: a duplicate mapping cannot hide an omitted asset.
test('the city progression catalog maps the complete v2 pack exactly once', () => {
  assert.equal(manifest.buildings.length, 20);
  assert.deepEqual(
    stagedRows.map(row => row.assetId).sort(),
    manifest.buildings.map(row => row.id).sort(),
  );
});

test('all three stages and both palettes exist for each mapped building', async () => {
  assert.deepEqual(manifest.stages, ['foundation', 'half-built', 'complete']);
  const mappedAssets = new Set(stagedRows.map(row => row.assetId));
  await Promise.all(manifest.buildings.flatMap(building => {
    assert.ok(mappedAssets.has(building.id), building.id);
    assert.deepEqual(building.variants.map(variant => variant.palette).sort(), ['seabreeze', 'sunrise']);
    return building.variants.flatMap(variant => manifest.stages.map(async stage => {
      const asset = variant.assets[stage];
      const bytes = await readFile(new URL(asset.path, assetRoot));
      assert.equal(bytes.toString('ascii', 0, 4), 'glTF', asset.path);
      assert.equal(bytes.readUInt32LE(8), bytes.length, asset.path);
      const jsonLength = bytes.readUInt32LE(12);
      const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
      assert.deepEqual(document.extensionsUsed ?? [], [], asset.path);
      assert.ok(document.buffers.every(buffer => !buffer.uri), asset.path);
    }));
  }));
});
