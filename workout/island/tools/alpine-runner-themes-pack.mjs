// Copies the runtime part of the Codex pack design/alpine-runner-themes-v2 (six themes for the three-lane ski
// runner) to assets/alpine-runner-themes-v2, the folder the published site and the offline pack read. The design
// pack itself is a review pack and is not published (.github/scripts/stage-pages.py, UNWIRED_DESIGN).
// Writes themes.json: what the game needs from the 7,800-line manifest (paths, placements, lighting, weather).
// Every copied file is checked against the SHA-256 the pack's manifest states. Run: node tools/alpine-runner-themes-pack.mjs
import {readFile, writeFile, mkdir, copyFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(island, 'design/alpine-runner-themes-v2'), target = path.join(island, 'assets/alpine-runner-themes-v2');
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
let bytes = 0, files = 0;

async function copy(item) {
  const relative = item.path.replace(/^assets\//, ''), data = await readFile(path.join(source, item.path));
  if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error('hash mismatch: ' + item.path);
  await mkdir(path.dirname(path.join(target, relative)), {recursive: true});
  await copyFile(path.join(source, item.path), path.join(target, relative));
  bytes += data.length; files++;
  return relative;
}

await rm(target, {recursive: true, force: true});
const themes = {};
for (const theme of manifest.themes) {
  const weatherFile = await readFile(path.join(source, theme.weather.path));
  if (createHash('sha256').update(weatherFile).digest('hex') !== theme.weather.sha256) throw new Error('hash mismatch: ' + theme.weather.path);
  const {schemaVersion, name, ...weather} = JSON.parse(weatherFile);
  const tiles = {}, props = {}, signs = {};
  for (const tile of theme.tiles) tiles[tile.id] = {path: await copy(tile), triangles: tile.triangles, placements: tile.placements.map(p => [p.prop, ...p.position, p.yawRadians])};
  for (const prop of theme.props) props[prop.id] = {path: await copy(prop), triangles: prop.triangles};
  for (const [id, sign] of Object.entries(theme.signs)) signs[id] = {path: await copy(sign), triangles: sign.triangles, y: sign.position[1]};
  const parallax = [];
  for (const layer of theme.parallax) parallax.push({id: layer.id, path: await copy(layer), pixelsPerMeter: layer.pixelsPerMeter, cameraOffsetFactor: layer.cameraOffsetFactor, width: layer.width, height: layer.height});
  themes[theme.id] = {title: theme.title, weatherName: theme.weather.label, lighting: theme.lighting, tiles, props, signs, parallax, weather};
}
const out = {schemaVersion: 1, source: 'design/alpine-runner-themes-v2', licence: manifest.assetLicense, referenceViewportWidth: 844, themes};
const json = JSON.stringify(out);
await writeFile(path.join(target, 'themes.json'), json + '\n');
await copyFile(path.join(source, 'LICENSES.md'), path.join(target, 'LICENSES.md'));
console.log(`${files} files, ${bytes} bytes, themes.json ${json.length} bytes`);
