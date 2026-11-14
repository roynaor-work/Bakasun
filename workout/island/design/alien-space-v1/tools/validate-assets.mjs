// Asset contract validation. SHARP_MODULE may point to an installed sharp package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFile(path.join(root, p));
const manifest = JSON.parse(await read('manifest.json'));
const companion = (await read('manifest-data.js')).toString();
assert.deepEqual(JSON.parse(companion.split('window.ALIEN_SPACE_MANIFEST=')[1].trim().slice(0, -1)), manifest, 'file-compatible preview data equals manifest');
assert.equal(manifest.themes.length, 6);
assert.equal(manifest.levels.length, 30);
assert.deepEqual(manifest.viewport, { width: 844, height: 390 });
assert.equal(manifest.budget.maxBytesPerTheme, 800000);
const textures = [...manifest.themes.flatMap(t => t.layers), ...Object.values(manifest.effects)];
assert.equal(new Set(textures.map(t => t.path)).size, 20);
let uniqueTextureBytes = 0;
for (const texture of textures) {
  assert(!path.isAbsolute(texture.path) && !texture.path.split('/').includes('..'));
  const b = await read(texture.path), meta = await sharp(b).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(b.length, texture.bytes, texture.path + ' byte count');
  assert.equal(createHash('sha256').update(b).digest('hex'), texture.sha256, texture.path + ' checksum');
  assert.equal(meta.width, texture.width);
  assert.equal(meta.height, texture.height);
  const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  let minAlpha = 255, maxAlpha = 0, hasSoftAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    minAlpha = Math.min(minAlpha, data[i]); maxAlpha = Math.max(maxAlpha, data[i]);
    if (data[i] > 0 && data[i] < 255) hasSoftAlpha = true;
  }
  assert(maxAlpha > 16, texture.path + ' contains visible pixels');
  assert.equal(texture.alpha, minAlpha < 255 ? 'straight' : 'opaque');
  if (texture.id === 'far') {
    assert.equal(minAlpha, 255, 'far is fully opaque');
    for (let y = 0; y < info.height; y++) {
      for (let c = 0; c < 4; c++) assert.equal(data[y * info.width * 4 + c], data[(y * info.width + info.width - 1) * 4 + c], 'repeat-x seam');
    }
  } else {
    assert.equal(minAlpha, 0, texture.path + ' has genuine transparent pixels');
    assert(maxAlpha > 128 && hasSoftAlpha, 'generated content retains soft straight alpha');
  }
  if (texture.id === 'mid' || texture.id === 'near') {
    for (let x = 0; x < info.width; x++) { assert.equal(alpha(x, 0), 0); assert.equal(alpha(x, info.height - 1), 0); }
    for (let y = 0; y < info.height; y++) { assert.equal(alpha(0, y), 0); assert.equal(alpha(info.width - 1, y), 0); }
  }
  // No text-bearing PNG metadata chunks are shipped.
  let at = 8;
  while (at < b.length) {
    const length = b.readUInt32BE(at), kind = b.toString('ascii', at + 4, at + 8);
    assert(!['tEXt', 'zTXt', 'iTXt'].includes(kind), 'text-free PNG metadata');
    at += length + 12;
  }
  uniqueTextureBytes += b.length;
}
const sharedBytes = Object.values(manifest.effects).reduce((n, e) => n + e.bytes, 0);
const budgets = [];
for (const [i, theme] of manifest.themes.entries()) {
  assert.deepEqual(theme.stages, [i * 5 + 1, i * 5 + 5]);
  assert.deepEqual(theme.layers.map(l => l.id), ['far', 'mid', 'near']);
  assert.deepEqual(theme.layers.map(l => l.role), ['distant-starfield', 'celestial-landmark', 'gas-clouds']);
  for (const l of theme.layers) { assert.equal(l.width, 1024); assert.equal(l.height, 512); }
  assert(theme.layers[0].depth < theme.layers[1].depth && theme.layers[1].depth < theme.layers[2].depth);
  assert.deepEqual(theme.effects, ['shooting-stars', 'explosion']);
  assert.equal(theme.sharedTextureBytes, sharedBytes);
  assert.equal(theme.ownTextureBytes, theme.layers.reduce((n, l) => n + l.bytes, 0));
  assert.equal(theme.totalTextureBytes, theme.ownTextureBytes + sharedBytes);
  assert(theme.totalTextureBytes <= 800000, theme.id + ' full theme budget');
  const levels = manifest.levels.filter(l => l.theme === theme.id);
  assert.deepEqual(levels.map(l => l.level), Array.from({ length: 5 }, (_, j) => i * 5 + j + 1));
  assert.equal(new Set(levels.map(l => JSON.stringify({ ...l, level: null, variant: null }))).size, 5, 'five distinct visual configurations');
  for (const l of levels) {
    assert(l.camera.every(v => v >= -1 && v <= 1));
    assert(l.gasOpacity >= 0 && l.gasOpacity <= 1);
    assert(l.shootingStarIntervalSeconds >= 4.8 && l.explosionIntervalSeconds >= 12);
  }
  budgets.push({ id: theme.id, levels: theme.stages, bytes: theme.totalTextureBytes, limit: 800000, passed: true });
}
for (const effect of Object.values(manifest.effects)) {
  assert.equal(effect.frames.length, effect.frameCount);
  assert.equal(effect.frames.length * effect.frameWidth, effect.width);
  for (const f of effect.frames) {
    assert(f.x >= 0 && f.y >= 0 && f.x + f.width <= effect.width && f.y + f.height <= effect.height);
  }
}
assert.equal(manifest.effects.explosion.frameCount, 4);
assert.equal(manifest.effects.explosion.loop, false);
assert.equal(manifest.effects.explosion.frameDurationsMs.length, 4);
assert.equal(manifest.effects.explosion.frameDurationsMs.reduce((a, b) => a + b), 720);
const files = await readdir(root, { recursive: true });
assert.equal(files.filter(f => f.endsWith('.png')).length, 20, 'no unbudgeted PNGs');
const result = { passed: true, themes: 6, levels: 30, pngFiles: 20, sharedEffectBytes: sharedBytes, uniqueTextureBytes, budgets,
  checks: ['PNG dimensions and checksums', 'real straight alpha', 'transparent outer layer margins', 'far horizontal seam pixel equality', '20 PNGs and no text metadata', 'all 30 level mappings and five configurations per theme', 'complete theme budget including full shared atlases', 'four untrimmed explosion frames and duration', 'preview companion equals JSON manifest'] };
await mkdir(path.join(root, 'verification'), { recursive: true });
await writeFile(path.join(root, 'verification/assets.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
