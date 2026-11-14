// Packaging only: crop generated atlas cells, resize, pad and encode PNG.
// Usage: SHARP_MODULE=/path/to/sharp node tools/build-assets.mjs HERO GAS FX
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const inputs = process.argv.slice(2);
if (inputs.length !== 3) throw new Error('Supply HERO, GAS and FX atlas PNG paths.');
for (const input of inputs) {
  const m = await sharp(input).metadata();
  if (m.width !== 1536 || m.height !== 1024 || !m.hasAlpha) {
    throw new Error('Expected a 1536×1024 RGBA atlas: ' + input);
  }
}
const ids = ['purple-nebula', 'ringed-planet', 'asteroid-field', 'earth-moon', 'sun-corona', 'galaxy'];
const names = ['נבולה סגולה', 'כוכב לכת טבעות', 'שדה אסטרואידים', 'ירח וכדור הארץ', 'שמש וקורונה', 'גלקסיה'];
const colors = ['#be85ff', '#e7c88d', '#8fbedc', '#70cdf5', '#ffb15d', '#a79aff'];
const bases = ['#0d071b', '#0d101a', '#07131d', '#061222', '#1a0b0b', '#090c23'];
const heroSizes = [500, 500, 500, 500, 500, 500];
const heroLeft = [456, 456, 456, 456, 456, 456];
const png = { palette: true, colours: 256, quality: 95, dither: 0.25, effort: 10, compressionLevel: 9 };
const blank = (width, height) => ({ create: { width, height, channels: 4, background: '#00000000' } });
const digest = b => createHash('sha256').update(b).digest('hex');
const fileInfo = async relative => {
  const b = await readFile(path.join(root, relative));
  const m = await sharp(b).metadata();
  const stats = await sharp(b).stats();
  const transparent = m.hasAlpha && stats.channels.at(-1).min < 255;
  return { path: relative, width: m.width, height: m.height, bytes: b.length, sha256: digest(b), alpha: transparent ? 'straight' : 'opaque' };
};
function random(seed) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}
function stars(seed, color) {
  const rand = random(seed);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#02040d"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="#03050e"/></linearGradient></defs><path fill="url(#bg)" d="M0 0h1024v512H0z"/>`;
  // Constant x-edge color and a 6px clear border make repeat-x exact.
  for (let n = 0; n < 340; n++) {
    const x = 6 + rand() * 1012, y = 6 + rand() * 500;
    const r = n % 31 === 0 ? 1.1 : 0.25 + rand() * 0.55;
    const c = ['#b1c9f4', '#dceaff', '#f8dfb9'][n % 3];
    svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${c}" opacity="${(.15 + rand() * .60).toFixed(2)}"/>`;
    if (n % 47 === 0) svg += `<path d="M${x-3} ${y}h6M${x} ${y-3}v6" stroke="${c}" stroke-width=".5" opacity=".25"/>`;
  }
  return Buffer.from(svg + '</svg>');
}
async function cell(input, index, inset = 16) {
  return sharp(input).extract({ left: (index % 3) * 512 + inset, top: Math.floor(index / 3) * 512 + inset, width: 512 - inset * 2, height: 512 - inset * 2 }).png().toBuffer();
}
async function starfield(seed, color, output) {
  const { data, info } = await sharp(stars(seed, color)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rand = random(seed + 8297);
  // Sub-byte, seeded dithering avoids wide visible bands in the dark gradient.
  // This is only applied to the original procedural starfield, never the art.
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width - 1; x++) {
      const n = rand() * 1.8 - .9, p = (y * info.width + x) * 4;
      for (let c = 0; c < 3; c++) data[p+c] = Math.max(0, Math.min(255, Math.round(data[p+c] + n)));
    }
    const first = y * info.width * 4, last = (y * info.width + info.width - 1) * 4;
    data.copy(data, last, first, first + 4);
  }
  await sharp(data, { raw: info }).png({ palette: false, compressionLevel: 9 }).toFile(output);
}
await mkdir(path.join(root, 'effects'), { recursive: true });
const explosionFrames = [];
for (let i = 0; i < 4; i++) {
  const sprite = await sharp(await cell(inputs[2], i, 8)).resize(120, 120).png().toBuffer();
  explosionFrames.push({ input: await sharp(blank(128, 128)).composite([{ input: sprite, left: 4, top: 4 }]).png().toBuffer(), left: i * 128, top: 0 });
}
await sharp(blank(512, 128)).composite(explosionFrames).png(png).toFile(path.join(root, 'effects/explosion.png'));
const shots = [];
for (let i = 0; i < 2; i++) {
  // Keep the shooting-star tail and alpha halo, discard empty atlas rows.
  const sprite = await sharp(inputs[2]).extract({ left: (i + 1) * 512 + 16, top: 512 + 128, width: 480, height: 256 }).resize(240, 128).png().toBuffer();
  shots.push({ input: sprite, left: i * 256 + 8, top: 0 });
}
await sharp(blank(512, 128)).composite(shots).png(png).toFile(path.join(root, 'effects/shooting-stars.png'));
const explosion = {
  ...await fileInfo('effects/explosion.png'), frameWidth: 128, frameHeight: 128, frameCount: 4,
  frames: [0, 1, 2, 3].map(x => ({ x: x * 128, y: 0, width: 128, height: 128 })),
  frameDurationsMs: [100, 140, 200, 280], loop: false, pivot: [.5, .5], blend: 'source-over',
  drawSize: [82, 82], opacity: .55, intervalSeconds: [12, 18], depth: .12, zIndex: 1
};
const shootingStars = {
  ...await fileInfo('effects/shooting-stars.png'), frameWidth: 256, frameHeight: 128, frameCount: 2,
  frames: [0, 1].map(x => ({ x: x * 256, y: 0, width: 256, height: 128 })),
  framesAre: 'independent-color-variants-not-animation', pivot: [.5, .5], blend: 'source-over',
  drawSize: [190, 95], velocityPxPerSecond: [350, 72], lifetimeMs: 1800,
  intervalSeconds: [4.8, 9.2], opacity: .65, zIndex: 4
};
const sharedBytes = explosion.bytes + shootingStars.bytes;
const themes = [];
for (let i = 0; i < ids.length; i++) {
  const dir = 'themes/' + ids[i];
  await mkdir(path.join(root, dir), { recursive: true });
  await starfield(3109 + i * 471, bases[i], path.join(root, dir, 'far.png'));
  const heroCell = await cell(inputs[0], i);
  const { data: heroData, info: heroInfo } = await sharp(heroCell).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let n = 0; n < heroInfo.width; n++) {
    for (const [x,y] of [[n,0], [n,heroInfo.height-1], [0,n], [heroInfo.width-1,n]]) {
      if (heroData[(y * heroInfo.width + x) * 4 + 3] > 8) throw new Error('Visible clipped halo at source cell edge: ' + ids[i]);
    }
  }
  const hero = await sharp(heroCell).resize(heroSizes[i], heroSizes[i]).png().toBuffer();
  await sharp(blank(1024, 512)).composite([{ input: hero, left: heroLeft[i], top: Math.floor((512 - heroSizes[i]) / 2) }]).png(png).toFile(path.join(root, dir, 'mid.png'));
  const gas = await sharp(inputs[1]).extract({ left: i % 3 * 512 + 16, top: Math.floor(i / 3) * 512 + 108, width: 480, height: 296 }).resize(952, 280, { fit: 'fill' }).png().toBuffer();
  await sharp(blank(1024, 512)).composite([{ input: gas, left: 36, top: 192 }]).png(png).toFile(path.join(root, dir, 'near.png'));
  const layers = [];
  for (const [j, layer] of ['far', 'mid', 'near'].entries()) {
    layers.push({ id: layer, ...await fileInfo(`${dir}/${layer}.png`), zIndex: [0, 2, 3][j],
      repeat: j === 0 ? 'x' : 'none', depth: [.06, .32, .8][j],
      opacity: [1, .88, .26][j], role: ['distant-starfield', 'celestial-landmark', 'gas-clouds'][j],
      maxCameraShiftPx: [2, 12, 30][j], driftAmplitudePx: [0, 3, 16][j],
      driftPeriodSeconds: [0, 66, 42][j], scrollPxPerSecond: j === 0 ? 1.6 : 0 });
  }
  const ownBytes = layers.reduce((sum, l) => sum + l.bytes, 0);
  if (ownBytes + sharedBytes > 800000) throw new Error('Theme budget exceeded: ' + ids[i]);
  themes.push({ id: ids[i], name: names[i], accent: colors[i], backgroundColor: bases[i],
    stages: [i * 5 + 1, i * 5 + 5], layers,
    effects: ['shooting-stars', 'explosion'], gasClouds: { layer: 'near', animated: 'bounded-drift' },
    ownTextureBytes: ownBytes, sharedTextureBytes: sharedBytes, totalTextureBytes: ownBytes + sharedBytes });
}
const levels = Array.from({ length: 30 }, (_, i) => {
  const variant = i % 5;
  return { level: i + 1, theme: ids[Math.floor(i / 5)], variant: variant + 1,
    camera: [[-.22, -.1], [.18, -.12], [0, .15], [-.15, .08], [.24, -.04]][variant],
    phaseSeconds: variant * 8.7, driftSpeed: [0.78, .90, 1, 1.12, 1.23][variant],
    gasOpacity: [.18, .22, .26, .29, .32][variant],
    shootingStarIntervalSeconds: [9.2, 8.1, 7, 5.9, 4.8][variant],
    shootingStarVariant: Math.floor(i / 5) % 2,
    explosionIntervalSeconds: [18, 16.5, 15, 13.5, 12][variant] };
});
const manifest = {
  schemaVersion: 1, id: 'alien-space-v1', version: '1.0.0', created: '2026-11-14',
  repository: 'roynaor-work/Bakasun', branch: 'codex/alien-space-v1',
  baseCommit: '11fef2fb98eec4173381346caee94f2930f9cffa',
  runtimeIntegration: 'design-package-only', license: 'CC0-1.0',
  viewport: { width: 844, height: 390 }, textureSize: { width: 1024, height: 512 },
  budget: { maxBytesPerTheme: 800000, unit: 'decimal-bytes', includes: 'all-three-layers-plus-both-complete-shared-effect-atlases', excludes: 'preview-tools-documentation-and-verification' },
  sampling: { format: 'image/png', colorSpace: 'sRGB', filter: 'linear', mipmaps: false, premultipliedAlpha: false, wrap: 'clamp-to-edge-unless-repeat-x' },
  coordinates: 'top-left pixels; layer origin is viewport minus texture size divided by two; frames are untrimmed row-major rectangles',
  camera: { inputRange: [-1, 1], layerTranslation: 'camera * maxCameraShiftPx + bounded sinusoidal drift; far scroll wraps on x', maxVerticalShiftPx: 6 },
  accessibility: { reducedMotion: 'freeze layers and omit shooting stars and explosions', pause: 'freeze full scene including effects', backgroundOnly: true },
  effects: { 'shooting-stars': shootingStars, explosion }, themes, levels
};
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(root, 'manifest-data.js'), '// Generated from manifest.json by tools/build-assets.mjs; do not edit separately.\nwindow.ALIEN_SPACE_MANIFEST=' + JSON.stringify(manifest) + ';\n');
const provenance = {
  generator: 'OpenAI image_gen', date: '2026-11-14',
  sources: await Promise.all(inputs.map(async (f, i) => ({ kind: ['celestial-atlas', 'gas-atlas', 'effects-atlas'][i], sha256: digest(await readFile(f)), width: 1536, height: 1024, alpha: 'straight', source: 'original generation in this Codex chat; source atlases kept outside the repository' }))),
  processing: 'Sharp: rectangular extraction, resizing, transparent padding, layer placement and indexed PNG encoding. No external stock, photographs, fonts, trademarks or branded assets.',
  procedural: 'far.png uses original seeded SVG star points and a vertical gradient, rasterized to PNG.',
  sourceArtIncluded: false, sourceArtReason: 'Only production PNGs are shipped; the generated source atlases are retained in the originating chat workspace.'
};
await writeFile(path.join(root, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ themes: themes.map(t => ({ id: t.id, bytes: t.totalTextureBytes })), uniqueTextureBytes: themes.reduce((n, t) => n + t.ownTextureBytes, 0) + sharedBytes }, null, 2));
