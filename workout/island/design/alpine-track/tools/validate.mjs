// Validate only delivered bytes. Dependencies stay outside this asset folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : null;
const modules = option('--modules');
if (!modules) throw Error('--modules must name an external tools directory containing node_modules');
const require = createRequire(path.resolve(modules, 'package.json'));
const sharp = require('sharp');
const assert = (value, message) => { if (!value) throw Error(message); };
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    assert(!entry.isSymbolicLink(), 'Symbolic links are not self-contained delivery files');
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(filename));
    else if (entry.isFile()) result.push(filename);
  }
  return result.sort();
}

const files = await walk(root);
const glbs = [], images = [];
for (const filename of files) {
  const name = relative(filename);
  const bytes = await fs.readFile(filename);
  if (name.endsWith('.glb')) {
    assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67, `${name}: invalid GLB header`);
    assert(bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, `${name}: invalid GLB size/version`);
    assert(bytes.readUInt32LE(16) === 0x4e4f534a, `${name}: JSON must be first GLB chunk`);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert(json.extensionsRequired?.includes('KHR_draco_mesh_compression'), `${name}: Draco is not required`);
    assert(json.buffers?.length === 1 && !json.buffers[0].uri, `${name}: external or missing geometry buffer`);
    assert(!(json.images || []).some(image => image.uri && !image.uri.startsWith('data:')), `${name}: external image dependency`);
    let triangles = 0, primitives = 0;
    for (const mesh of json.meshes || []) for (const primitive of mesh.primitives) {
      primitives++;
      assert((primitive.mode ?? 4) === 4, `${name}: non-triangle primitive`);
      const draco = primitive.extensions?.KHR_draco_mesh_compression;
      assert(draco && Number.isInteger(draco.bufferView), `${name}: uncompressed primitive`);
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
        assert(Number.isInteger(primitive.attributes?.[attribute]), `${name}: missing ${attribute}`);
        assert(Number.isInteger(draco.attributes?.[attribute]), `${name}: ${attribute} not Draco encoded`);
      }
      const count = json.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
      assert(count > 0 && count % 3 === 0, `${name}: invalid triangle count`);
      triangles += count / 3;
    }
    assert(primitives > 0, `${name}: no primitives`);
    const assetRoot = json.nodes?.find(node => node.name === 'asset_root');
    assert(assetRoot, `${name}: no asset_root`);
    assert((assetRoot.translation || [0, 0, 0]).every(x => x === 0), `${name}: root translation`);
    assert((assetRoot.rotation || [0, 0, 0, 1]).every((x, i) => x === (i === 3 ? 1 : 0)), `${name}: root rotation`);
    assert((assetRoot.scale || [1, 1, 1]).every(x => x === 1), `${name}: root scale`);
    assert(!assetRoot.matrix || assetRoot.matrix.every((x, i) => x === (i % 5 === 0 ? 1 : 0)), `${name}: root matrix`);
    glbs.push({file: name, bytes: bytes.length, sha256: digest(bytes), triangles, primitives,
      requiredDracoEveryPrimitive: true, attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']});
  }
  if (/\.(webp|png)$/i.test(name) && !name.startsWith('previews/')) {
    const metadata = await sharp(bytes).metadata();
    assert(metadata.width > 0 && metadata.height > 0, `${name}: invalid image dimensions`);
    assert(metadata.width <= 512 && metadata.height <= 512, `${name}: texture exceeds 512px`);
    const image = {file: name, width: metadata.width, height: metadata.height,
      bytes: bytes.length, sha256: digest(bytes), hasAlpha: metadata.hasAlpha};
    if (name.startsWith('textures/')) {
      const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      let edgeDifferences = 0;
      for (let y = 0; y < info.height; y++) for (let c = 0; c < 4; c++)
        edgeDifferences += data[(y * info.width) * 4 + c] !== data[(y * info.width + info.width - 1) * 4 + c];
      for (let x = 0; x < info.width; x++) for (let c = 0; c < 4; c++)
        edgeDifferences += data[x * 4 + c] !== data[((info.height - 1) * info.width + x) * 4 + c];
      assert(edgeDifferences === 0, `${name}: opposite decoded edges differ (${edgeDifferences} channels)`);
      image.oppositeDecodedEdgesIdentical = true;
    }
    images.push(image);
  }
}
assert(glbs.length > 0 && images.some(image => image.file.startsWith('textures/')), 'Missing models or surfaces');

const modelManifest = JSON.parse(await fs.readFile(path.join(root, 'models.json'), 'utf8'));
assert(modelManifest.models.length === glbs.length, 'Model manifest inventory differs');
for (const model of modelManifest.models) {
  const actual = glbs.find(record => record.file === model.file);
  assert(actual && ['bytes', 'sha256', 'triangles', 'primitives'].every(key => model[key] === actual[key]), `${model.file}: model manifest differs`);
  assert(model.units === 'metres' && model.up === '+Y' && model.forward === '+Z', `${model.file}: coordinate contract differs`);
}
const surfaces = JSON.parse(await fs.readFile(path.join(root, 'surfaces.json'), 'utf8'));
const textureManifest = surfaces.surfaces.flatMap(surface => [surface, surface.normal].filter(Boolean));
assert(textureManifest.length === images.filter(image => image.file.startsWith('textures/')).length, 'Surface manifest inventory differs');
for (const texture of textureManifest) {
  const actual = images.find(image => image.file === texture.file);
  assert(actual && ['bytes', 'sha256', 'width', 'height'].every(key => texture[key] === actual[key]), `${texture.file}: surface manifest differs`);
}

const alphaChecks = [];
for (const name of ['vfx/cloud-atlas', 'vfx/ski-powder-atlas', 'decals/footprint-treads', 'decals/snow-groove']) {
  const contract = JSON.parse(await fs.readFile(path.join(root, name + '.json'), 'utf8'));
  const imagePath = path.posix.join(path.posix.dirname(name), contract.image);
  const image = images.find(record => record.file === imagePath);
  assert(image?.hasAlpha, `${imagePath}: missing alpha channel`);
  assert(contract.sha256 === image.sha256 && contract.fileBytes === image.bytes, `${imagePath}: effect manifest differs`);
  const {data, info} = await sharp(path.join(root, imagePath)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const frame = contract.frameSize || contract.imageSize;
  const columns = contract.columns || 1, rows = contract.rows || 1;
  assert(frame.width * columns === info.width && frame.height * rows === info.height, `${imagePath}: frame geometry differs`);
  const padding = typeof contract.paddingPixels === 'number' ? {x: contract.paddingPixels, y: contract.paddingPixels} : contract.paddingPixels;
  let visiblePixels = 0, transparentPixels = 0, transparentColorBleedPixels = 0, fractionalAlphaPixels = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4, alpha = data[i + 3];
    if (alpha === 0) { transparentPixels++; if (data[i] || data[i + 1] || data[i + 2]) transparentColorBleedPixels++; }
    else { visiblePixels++; if (alpha < 255) fractionalAlphaPixels++; }
    const fx = x % frame.width, fy = y % frame.height;
    if (fx < padding.x || fx >= frame.width - padding.x || fy < padding.y || fy >= frame.height - padding.y)
      assert(alpha === 0, `${imagePath}: nontransparent frame padding`);
  }
  assert(visiblePixels > 0 && transparentPixels > 0 && fractionalAlphaPixels > 0, `${imagePath}: absent content or soft alpha`);
  if (contract.loop) {
    const last = contract.frameCount - 1, bx = (last % columns) * frame.width, by = Math.floor(last / columns) * frame.height;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) for (let c = 0; c < 4; c++)
      assert(data[(y * info.width + x) * 4 + c] === data[((by + y) * info.width + bx + x) * 4 + c], `${imagePath}: loop endpoint differs`);
  }
  if (name === 'decals/snow-groove') for (let x = 0; x < info.width; x++) for (let c = 0; c < 4; c++)
    assert(data[x * 4 + c] === data[((info.height - 1) * info.width + x) * 4 + c], `${imagePath}: longitudinal repeat differs`);
  alphaChecks.push({file: imagePath, visiblePixels, transparentPixels, transparentColorBleedPixels, fractionalAlphaPixels,
    transparentFramePadding: true, transparentRgbPolicy: 'Straight-alpha RGB bleed is allowed; transparent alpha is required at cell gutters.', loopEndpointsIdentical: contract.loop || null,
    longitudinalRepeatIdentical: name === 'decals/snow-groove' || null});
}

const preview = await fs.readFile(path.join(root, 'preview.html'), 'utf8');
const previewHash = digest(Buffer.from(preview));
const browserProof = JSON.parse(await fs.readFile(path.join(root, 'browser-validation.json'), 'utf8'));
assert(browserProof.allPassed && browserProof.previewSha256 === previewHash, 'Offline browser evidence is failed or stale');
const embeddedAssets = JSON.parse(preview.slice(preview.indexOf('const ASSETS=') + 'const ASSETS='.length, preview.indexOf(',TEXTURES=')));
const embeddedColorChecks = [];
for (const [name, asset] of Object.entries(embeddedAssets)) {
  let minimum = 255, maximum = 0;
  for (const primitive of asset.primitives) for (const value of Buffer.from(primitive.colors, 'base64')) {
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
  }
  assert(maximum > 100 && maximum > minimum, `${name}: black or invariant embedded palette`);
  embeddedColorChecks.push({asset: name, minimum, maximum});
}
const textureStart = preview.indexOf(',TEXTURES=') + ',TEXTURES='.length;
const embeddedTextures = JSON.parse(preview.slice(textureStart, preview.indexOf(';\n', textureStart)));
for (const image of images.filter(image => !image.file.includes('normal'))) {
  const name = path.posix.basename(image.file).replace(/\.(png|webp)$/, '');
  assert(embeddedTextures[name], `${image.file}: missing embedded image`);
  const embedded = Buffer.from(embeddedTextures[name].split(',')[1], 'base64');
  assert(digest(embedded) === image.sha256, `${image.file}: embedded image is stale`);
}
const scripts = [...preview.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert(scripts.length > 0, 'Preview must contain its local renderer');
for (const [, attributes, script] of scripts) {
  assert(!/\bsrc\s*=|\btype\s*=\s*["']module/i.test(attributes), 'Preview depends on external/module script');
  assert(!/\bfetch\s*\(|\bimport\s*\(|\bnew\s+Worker\s*\(/.test(script), 'Preview depends on runtime fetch/module/worker');
}

let repo = root;
const git = (...gitArgs) => execFileSync('git', gitArgs, {cwd: repo, encoding: 'utf8'}).trim();
repo = git('rev-parse', '--show-toplevel');
const prefix = path.relative(repo, root).replaceAll('\\', '/') + '/';
const base = git('rev-parse', option('--base') || 'e67c6566');
assert(git('ls-tree', '-r', '--name-only', base, '--', prefix) === '', 'Delivery folder existed at base commit');
const changes = git('diff', '--name-status', '--no-renames', base).split('\n').filter(Boolean);
for (const line of changes) {
  const [status, filename] = line.replace(/\r$/, '').split('\t');
  assert(status === 'A' && filename.startsWith(prefix), `Existing/out-of-scope change: ${line}`);
}
for (const filename of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean))
  assert(filename.replace(/\r$/, '').startsWith(prefix), `Out-of-scope untracked file: ${filename}`);

const blender = option('--blender');
if (blender) execFileSync(blender, ['--background', '--factory-startup', '--threads', '2', '--python-exit-code', '1', '--python',
  path.join(root, 'tools', 'validate-models.py'), '--', '--out', path.join(root, 'validation-models.json')], {stdio: 'inherit'});
const decoded = JSON.parse(await fs.readFile(path.join(root, 'validation-models.json'), 'utf8'));
assert(decoded.allPassed && decoded.models.length === glbs.length, 'Independent decoder validation incomplete');
for (const model of glbs) {
  const other = decoded.models.find(record => record.file === model.file);
  assert(other?.triangles === model.triangles, `${model.file}: decoded triangle count differs`);
  const authored = modelManifest.models.find(record => record.file === model.file);
  const span = Math.max(...authored.bounds[0].map((minimum, i) => authored.bounds[1][i] - minimum));
  const tolerance = span / 65535 * 1.6 + 1e-5; // final 16-bit Draco position quantization.
  for (let i = 0; i < 3; i++) {
    assert(Math.abs(other.boundsGltf.min[i] - authored.bounds[0][i]) <= tolerance, `${model.file}: decoded minimum bound differs`);
    assert(Math.abs(other.boundsGltf.max[i] - authored.bounds[1][i]) <= tolerance, `${model.file}: decoded maximum bound differs`);
  }
  for (const [name, position] of Object.entries(authored.anchors))
    assert(other.anchorsGltf[name]?.every((value, i) => Math.abs(value - position[i]) < 2e-5), `${model.file}: decoded anchor ${name} differs`);
}

const output = path.join(root, 'validation.json');
const result = {allPassed: true, baseCommit: base, scope: 'New files only in ' + prefix,
  budgetBytes: 2000000, folderBytes: 0, fileCount: 0, models: glbs, images, alphaChecks,
  independentDecoder: decoded.decoder, independentDecoderVersion: decoded.blenderVersion,
  offlinePreviewStaticChecks: {inlineClassicRenderer: true, noRuntimeFetchModulesWorkers: true},
  previewSha256: previewHash, embeddedColorChecks,
  limitations: 'Geometry, pixels and package checks only; see browser-validation.json for actual file:// phone viewport evidence. No game or physical-device performance claim.'};
// Include this report's own bytes in the package budget; its decimal length converges.
for (let iteration = 0; iteration < 8; iteration++) {
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  const finalFiles = await walk(root);
  const sizes = await Promise.all(finalFiles.map(file => fs.stat(file).then(stat => stat.size)));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert(total <= result.budgetBytes, `Whole folder exceeds 2MB: ${total}`);
  if (total === result.folderBytes && finalFiles.length === result.fileCount) break;
  result.folderBytes = total; result.fileCount = finalFiles.length;
}
console.log(JSON.stringify({allPassed: true, folderBytes: result.folderBytes, fileCount: result.fileCount,
  models: glbs.length, images: images.length}));
