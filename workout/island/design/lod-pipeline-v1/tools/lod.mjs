#!/usr/bin/env node
// Rebuilds from immutable LOD0 copies, never from the previous reduced level.
// Usage: node tools/lod.mjs [--only asset-id] [--quick]
// The committed source-lock and LOD0 copies make this entirely offline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGLB, writeGLB, replacePrimitive, triangleCount, sceneTriangleCount, uniqueGeometryTriangleCount, invariantFingerprint, rawAccessor, sha256, widths} from './glb.mjs';
import {simplifyPrimitive} from './simplify.mjs';
import {sceneGeometry, clipDuration} from './geometry.mjs';
import {hausdorff} from './hausdorff.mjs';
import {authoredVariant} from './authored.mjs';
import {calibratePolicy} from './calibrate-policy.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const writeJSON = (name, data) => fs.writeFile(path.join(root, name), JSON.stringify(data, null, name==='manifest.json'||name.startsWith('verification/')?0:2) + '\n');

export function outputPath(relative) {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root) || resolved === root || relative.split(/[\\/]/).includes('..')) throw Error('Output must stay inside this package');
  return resolved;
}

export function decimate(sourceBytes, ratio) {
  if (!(ratio > 0 && ratio < 1)) throw Error('Expected a ratio between zero and one');
  const source = parseGLB(sourceBytes), sourceDefaultTriangles = sceneTriangleCount(source), target = Math.round(sourceDefaultTriangles * ratio);
  let internalRatio = ratio, best = null;
  // Tiny material/damage parts have irreducible floors. Redistribute the budget
  // over reducible parts instead of adding every floor on top of the target.
  for (let pass = 0; pass < 6; pass++) {
    const doc = parseGLB(sourceBytes), maps = [], stats = [];
    for (let mi = 0; mi < doc.json.meshes.length; mi++) {
      maps[mi] = [];
      const skinIndex = doc.json.nodes.find(n=>n.mesh===mi&&n.skin!==undefined)?.skin;
      const criticalJoints = new Set(skinIndex===undefined ? [] : doc.json.skins[skinIndex].joints.map((id,i)=>/head|chest|spine|hips|body|torso|pelvis/i.test(doc.json.nodes[id].name||'')?i:-1).filter(i=>i>=0));
      for (const primitive of doc.json.meshes[mi].primitives) {
        const preserveTopology = ratio > 0.3 ? 'full' : primitive.attributes.JOINTS_0 !== undefined ? 'landmarks' : false;
        const result = simplifyPrimitive(doc, primitive, internalRatio, {preserveTopology,criticalJoints});
        maps[mi].push(result.sourceVertices); stats.push(result.stats);
        replacePrimitive(doc, primitive, result.indices, result.sourceVertices);
      }
    }
    const count = triangleCount(doc), primaryCount = sceneTriangleCount(doc), candidate = {doc, maps, stats, internalRatio, target, count, primaryCount, passes: pass + 1};
    if (!best || Math.abs(primaryCount - target) < Math.abs(best.primaryCount - target)) best = candidate;
    if (Math.abs(primaryCount - target) <= Math.max(2, sourceDefaultTriangles * 0.003)) break;
    if (primaryCount < target) break;
    internalRatio *= Math.max(0.25, target / primaryCount * 0.95);
  }
  const bytes = writeGLB(best.doc), parsed = parseGLB(bytes);
  if (invariantFingerprint(source) !== invariantFingerprint(parsed)) throw Error('Skeleton, animation, scene, material or morph contract changed');
  verifyVertexCopies(source, parsed, best.maps);
  return {...best, doc: parsed, bytes, method: 'endpoint-QEM'};
}

export function verifyVertexCopies(source, output, maps, reference = null) {
  for (let mi = 0; mi < source.json.meshes.length; mi++) for (let pi = 0; pi < source.json.meshes[mi].primitives.length; pi++) {
    const a = source.json.meshes[mi].primitives[pi], b = output.json.meshes[mi].primitives[pi], map = maps[mi][pi];
    const guide = reference?.json.meshes[map.sourceMesh]?.primitives[map.sourcePrimitive || 0];
    for (const [setA, setB, setG] of [[a.attributes, b.attributes, guide?.attributes], ...(a.targets || []).map((t, i) => [t, b.targets[i], guide?.targets?.[i]])]) for (const key of Object.keys(setA)) {
      const input = rawAccessor(source, setA[key]), guideInput = setG ? rawAccessor(reference, setG[key]) : null, result = rawAccessor(output, setB[key]), width = widths[source.json.accessors[setA[key]].type];
      for (let v = 0; v < map.length; v++) for (let k = 0; k < width; k++) if (!Object.is((map.references?.[v] ? guideInput : input)[map[v] * width + k], result[v * width + k])) throw Error(`Changed vertex data: ${mi}/${pi}/${key}/${v}`);
    }
  }
}

function compareAnimatedVertices(sourceGeometry, targetGeometry, maps, guideGeometry = null) {
  const sourceRecords = new Map(sourceGeometry.vertexRecords.map(r => [`${r.node}:${r.mesh}:${r.primitive}`, r]));
  const guideRecords = new Map((guideGeometry?.vertexRecords || []).map(r => [`${r.mesh}:${r.primitive}`, r]));
  let compared = 0, maxDrift = 0;
  for (const r of targetGeometry.vertexRecords) {
    const s = sourceRecords.get(`${r.node}:${r.mesh}:${r.primitive}`), map = maps[r.mesh][r.primitive], guide = guideRecords.get(`${map.sourceMesh}:${map.sourcePrimitive || 0}`);
    if (!s) throw Error('Changed animated scene structure');
    for (let v = 0; v < map.length; v++) {
      const reference = map.references?.[v] ? guide : s;
      if (!reference) throw Error('Missing authored animation reference');
      const drift = Math.hypot(...[0, 1, 2].map(k => r.positions[v * 3 + k] - reference.positions[map[v] * 3 + k]));
      if (!Number.isFinite(drift) || drift > 1e-9) throw Error(`Animated vertex drift ${drift}`);
      maxDrift = Math.max(maxDrift, drift); compared++;
    }
  }
  return {compared, maxDrift};
}

function surfaceMetric(sourceGeometry, targetGeometry, measurement, animated = false) {
  const tolerance = Math.max(1e-7, sourceGeometry.diagonal * (animated ? measurement.animatedSurfaceToleranceDiagonalFraction : measurement.hausdorffToleranceDiagonalFraction));
  const result = hausdorff(sourceGeometry.triangles, targetGeometry.triangles, {tolerance, maxSamples: animated ? measurement.animatedSurfaceMaxSamplesPerDirection : measurement.maxSamplesPerDirection});
  return {...result, diagonalMetres: sourceGeometry.diagonal, lowerDiagonalFraction: result.lowerMetres / sourceGeometry.diagonal, upperDiagonalFraction: result.upperMetres / sourceGeometry.diagonal};
}

export function measure(source, result, config, quick = false) {
  const output = result.doc, j = source.json, scenes = [], animatedSurfaces = [];
  let comparedVertices = 0, maxDriftMetres = 0, poseSamples = 0;
  const account = (sg, tg, clip = null, time = 0) => {
    const referenceClip = clip === null ? null : result.referenceDoc?.json.animations.findIndex(a => a.name === j.animations[clip].name);
    const guide = result.referenceDoc ? sceneGeometry(result.referenceDoc, result.referenceScene, referenceClip, time) : null;
    const check = compareAnimatedVertices(sg, tg, result.maps, guide); comparedVertices += check.compared; maxDriftMetres = Math.max(maxDriftMetres, check.maxDrift); poseSamples++;
  };
  for (let scene = 0; scene < j.scenes.length; scene++) {
    const sg = sceneGeometry(source, scene), tg = sceneGeometry(output, scene);
    account(sg, tg);
    scenes.push({scene, name: j.scenes[scene].name || `scene-${scene}`, sourceTriangles: sg.renderedTriangles, triangles: tg.renderedTriangles, ratio: tg.renderedTriangles / sg.renderedTriangles, hausdorff: surfaceMetric(sg, tg, config.measurement)});
    if (!quick) for (let clip = 0; clip < (j.animations || []).length; clip++) {
      const duration = clipDuration(source, j.animations[clip]);
      for (const fraction of config.measurement.animationVertexSampleFractions) {
        const time = duration * fraction, a = sceneGeometry(source, scene, clip, time), b = sceneGeometry(output, scene, clip, time);
        account(a, b, clip, time);
        if (config.measurement.animationSurfaceSampleFractions.includes(fraction)) animatedSurfaces.push({scene, clip: j.animations[clip].name || String(clip), time, hausdorff: surfaceMetric(a, b, config.measurement, true)});
      }
    }
  }
  const worst = entries => entries.reduce((best, e) => !best || e.hausdorff.upperMetres > best.hausdorff.upperMetres ? e : best, null);
  return {scenes, animation: {complete: !quick, clips: (j.animations || []).length, poseSamples, comparedVertices, maxDriftMetres, vertexReference: result.referenceDoc ? 'Authored LOD vertices under their original matching rig, plus unchanged LOD0 joint-support triangles' : 'Retained LOD0 vertices', exactVertexAttributes: true, exactMorphDeltas: true, invariantFingerprint: invariantFingerprint(output)}, animatedSurfaces, worstRestSurface: worst(scenes), worstSampledAnimatedSurface: worst(animatedSurfaces)};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {console.log('node tools/lod.mjs [--only ASSET_ID] [--quick]\nRebuilds native GLB LOD1/2 from SHA-256-locked LOD0 copies. No installs or network.\n--quick skips animated surface QA and must not be used for a release.'); return;}
  const onlyIndex = args.indexOf('--only'), only = onlyIndex < 0 ? null : args[onlyIndex + 1], quick = args.includes('--quick');
  const allowed = new Set(['--quick', '--only', only].filter(Boolean));
  if (args.some(a => !allowed.has(a)) || (onlyIndex >= 0 && !only)) throw Error('Unknown option or missing --only value; see --help');
  const lock = await readJSON('source-lock.json'), config = await readJSON('lod-config.json'), assets = [];
  const selected = only ? lock.assets.filter(a => a.id === only) : lock.assets;
  if (!selected.length) throw Error(`Unknown asset ${only}`);
  for (const [index, entry] of selected.entries()) {
    const sourcePath = outputPath(entry.copy), sourceBytes = await fs.readFile(sourcePath);
    if (sha256(sourceBytes) !== entry.sha256) throw Error(`Source hash mismatch: ${entry.copy}`);
    const source = parseGLB(sourceBytes), fingerprint = invariantFingerprint(source), variants = [];
    for (const [level, ratio] of [[1, 0.4], [2, 0.12]]) {
      const guide = entry.guides?.find(g => g.level === level);
      let result;
      if (guide) {
        const guideBytes = await fs.readFile(outputPath(guide.copy));
        if (sha256(guideBytes) !== guide.sha256) throw Error(`Authored guide hash mismatch: ${guide.copy}`);
        result = authoredVariant(sourceBytes, guideBytes, ratio, guide);
        verifyVertexCopies(source, result.doc, result.maps, result.referenceDoc);
      } else result = decimate(sourceBytes, ratio);
      const metrics = measure(source, result, config, quick);
      const file = entry.copy.replace(/-lod0\.glb$/, `-lod${level}.glb`);
      if (file === entry.copy || outputPath(file) === sourcePath) throw Error('Refusing to overwrite source');
      await fs.writeFile(outputPath(file), result.bytes);
      variants.push({level, file, sha256: sha256(result.bytes), bytes: result.bytes.length, method: result.method, authoredGuide: guide || null, defaultSceneTriangles: result.primaryCount, defaultSceneRatio: result.primaryCount / sceneTriangleCount(source), storedTriangles: result.count, uniqueGeometryTriangles: uniqueGeometryTriangleCount(result.doc), storedRatio: result.count / triangleCount(source), requestedRatio: ratio, withinThreePercentagePoints: Math.abs(result.primaryCount / sceneTriangleCount(source) - ratio) <= 0.03, internalRatio: result.internalRatio, budgetPasses: result.passes, primitiveStats: result.stats, ...metrics});
    }
    const asset = {...entry, source: {bytes: sourceBytes.length, defaultSceneTriangles: sceneTriangleCount(source), defaultScene: source.json.scene || 0, storedTriangles: triangleCount(source), uniqueGeometryTriangles: uniqueGeometryTriangleCount(source), sceneCount: source.json.scenes.length, skinCount: source.json.skins?.length || 0, clips: (source.json.animations || []).map(a => ({name: a.name, duration: clipDuration(source, a)})), fingerprint}, variants};
    assets.push(asset);
    await writeJSON(`verification/${entry.id.replaceAll('/', '__')}.json`, asset);
    console.log(`${index + 1}/${selected.length} ${entry.id}: ${asset.source.storedTriangles} -> ${variants.map(v => v.storedTriangles).join(' / ')} triangles; animation vertex drift ${Math.max(...variants.map(v => v.animation.maxDriftMetres))}m`);
  }
  if (!only) {
    const manifest = {schemaVersion: 1, id: 'lod-pipeline-v1', repository: 'roynaor-work/Bakasun', branch: 'codex/lod-pipeline-v1', baseCommit: lock.baseCommit, created: lock.created, scope: 'New package only; models only; no runtime integration', nativeFormat: {glTF: '2.0 GLB', wasm: false, geometryCompression: false, textureCompression: false, externalResources: false}, preview: {file: 'preview.html', viewport: [844, 390], offline: true, server: 'node tools/serve.mjs'}, config: 'lod-config.json', sourceLock: 'source-lock.json', excludedSources: lock.excludedSources, assets, summary: {models: assets.length, glbs: assets.length * 3, inputTriangles: assets.reduce((n, a) => n + a.source.storedTriangles, 0), lod1Triangles: assets.reduce((n, a) => n + a.variants[0].storedTriangles, 0), lod2Triangles: assets.reduce((n, a) => n + a.variants[1].storedTriangles, 0), sourceBytes: assets.reduce((n, a) => n + a.source.bytes, 0), lodBytes: assets.reduce((n, a) => n + a.variants.reduce((s, v) => s + v.bytes, 0), 0), allAnimationInvariantsPreserved: assets.every(a => a.variants.every(v => v.animation.invariantFingerprint === a.source.fingerprint && v.animation.maxDriftMetres === 0 && v.animation.complete)), complete: !quick}};
    manifest.summary.authoredGuideGlbs=lock.authoredGuideGlbs||0;
    manifest.summary.defaultSceneTriangles=[assets.reduce((n,a)=>n+a.source.defaultSceneTriangles,0),... [0,1].map(i=>assets.reduce((n,a)=>n+a.variants[i].defaultSceneTriangles,0))];
    manifest.summary.uniqueGeometryTriangles=[assets.reduce((n,a)=>n+a.source.uniqueGeometryTriangles,0),... [0,1].map(i=>assets.reduce((n,a)=>n+a.variants[i].uniqueGeometryTriangles,0))];
    calibratePolicy(manifest,config);
    await writeJSON('lod-config.json',config);
    await writeJSON('manifest.json', manifest);
    console.log(JSON.stringify(manifest.summary, null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
