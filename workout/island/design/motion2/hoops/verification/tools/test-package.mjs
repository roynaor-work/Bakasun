#!/usr/bin/env node
// Runs the repository's UNMODIFIED viewer CLI. No game or viewer file is edited.
import {readFile, readdir, mkdir, mkdtemp, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const island = resolve(packageRoot, '../../..');
const repository = resolve(island, '../..');
const viewer = resolve(island, 'design/viewer/test-viewer.mjs');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index+1];
};
const output = resolve(option('--out', resolve(packageRoot, 'verification/viewer')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = async path => JSON.parse(await readFile(path, 'utf8'));
const basePath = resolve(island, 'design/motion/hoops.json');
const original = await readFile(basePath);
const pack = JSON.parse(original);
const skeletonJSON = JSON.stringify(pack.skeleton);
const clips = [];
const hashes = {};
const overridden = [];

for (const file of (await readdir(packageRoot)).filter(file => file.endsWith('.json')).sort()) {
  const path = resolve(packageRoot, file);
  const bytes = await readFile(path);
  const asset = JSON.parse(bytes);
  if (asset.kind !== 'authored-skeletal-motion' || !asset.states) continue;
  if (JSON.stringify(asset.skeleton) !== skeletonJSON) throw Error(`${file}: canonical skeleton differs`);
  hashes[relative(repository, path)] = hash(bytes);
  for (const [name, state] of Object.entries(asset.states)) {
    if (clips.some(clip => clip.name === name)) throw Error(`Duplicate new clip ${name}`);
    if (pack.states[name]) overridden.push(name);
    pack.states[name] = state;
    clips.push({name, file:relative(repository,path), durationSeconds:state.durationSeconds,
      loop:state.loop, recommendation:state.transitionRecommendations || asset.transitionRecommendations || {}});
  }
}
if (!clips.length) throw Error('No authored motion clip files found');
if (overridden.length) throw Error(`New clips must have unique names: ${overridden.join(', ')}`);
const makeEdge = (source, target, on, duration=.18, priority=30) => ({
  source, target, on, priority, crossfadeSeconds:duration, visualBlendSeconds:duration,
  blendCurve:'smoothstep', sourcePose:'current-displayed',
  sourceContinuation:'velocity-extrapolation', targetTime:0, footLock:'carry-until-release',
});
for (const clip of clips) {
  const recommendation = clip.recommendation;
  const duration = recommendation.entry?.visualBlendSeconds
    ?? recommendation.visualBlendSeconds ?? recommendation.minimumVisualBlendSeconds ?? .18;
  if (duration < .12 || duration > .24) throw Error(`${clip.name}: unsupported recommended blend ${duration}`);
  const entryFrom = [...new Set(['idle','run',...(recommendation.entryFrom || recommendation.entry?.from || [])])]
    .filter(source=>source!==clip.name);
  const exitTo = Array.isArray(recommendation.exit) ? recommendation.exit
    : (recommendation.exitTo || recommendation.exit?.to || ['idle'])
      .map(target=>({target,visualBlendSeconds:recommendation.exit?.visualBlendSeconds ?? duration}));
  for (const source of entryFrom) {
    if (!pack.states[source]) throw Error(`${clip.name}: missing entry source ${source}`);
    pack.transitions.push(makeEdge(source,clip.name,`presentation:${clip.name}`,duration));
  }
  for (const exit of exitTo.filter(exit=>exit.target!==clip.name)) {
    const target = exit.target;
    const exitDuration = exit.visualBlendSeconds ?? duration;
    if (exitDuration < .12 || exitDuration > .24) throw Error(`${clip.name}: invalid exit blend ${exitDuration}`);
    if (!pack.states[target]) throw Error(`${clip.name}: missing exit target ${target}`);
    // Explicit presentation requests remain exercisable for looping clips too.
    pack.transitions.push(makeEdge(clip.name,target,`presentation:return:${target}`,exitDuration,10));
  }
  if (!clip.loop) {
    const first = exitTo.find(exit=>exit.target!==clip.name);
    pack.transitions.push(makeEdge(clip.name,first?.target ?? 'idle', 'clip_finished', first?.visualBlendSeconds ?? duration,10));
  }
}
pack.eventInputs = [...new Set([...pack.eventInputs, ...pack.transitions.map(edge=>edge.on)])];
pack.authorship = {...pack.authorship, verificationComposition:
  'Original baseline states plus the new clip files, supplied to the unmodified viewer as one asset response.'};
const body = JSON.stringify(pack);
const temporary = await mkdtemp(resolve(tmpdir(), 'hoops-viewer-'));
const injected = resolve(temporary, 'hoops.json');
const requests = resolve(temporary, 'requests.jsonl');
await writeFile(injected, body);
await writeFile(requests, '');
await mkdir(output,{recursive:true});
const originals = ['design/viewer/test-viewer.mjs','design/viewer/checks.js','design/viewer/animation.js',
  'design/viewer/retarget.js','design/viewer/viewer.js','design/viewer/retarget-map.json',
  'design/characters/rig.json','design/motion/hoops.json',
  ...['soccer-player','goalkeeper','basketball-player','skier'].map(id=>`design/characters/${id}.glb`)];
const originalHashes = Object.fromEntries(await Promise.all(originals.map(async path=>
  [path,hash(await readFile(resolve(island,path)))])));
const candidates = [process.env.HOOPS_PLAYWRIGHT_PATH,
  '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
  '/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs'];
let playwrightPath;
for (const path of candidates.filter(Boolean)) {
  try { if ((await stat(path)).isFile()) {playwrightPath=path;break;} } catch {}
}
if (!playwrightPath) throw Error('Set HOOPS_PLAYWRIGHT_PATH to the installed playwright/index.mjs');
const command = [viewer, '--game','hoops','--out',output];
for (const name of ['--character','--executable','--channel']) {
  const value = option(name,null);
  if (value) command.push(name,value);
}
const executableDefault = option('--executable', process.env.PLAYWRIGHT_EXECUTABLE_PATH);
if (!executableDefault && !option('--channel',null)) {
  try { await stat('/usr/bin/chromium');command.push('--executable','/usr/bin/chromium'); } catch {}
}
const provenance = {schemaVersion:1,generatedAt:new Date().toISOString(),
  test:'workout/island/design/viewer/test-viewer.mjs', testFileUnmodified:true,
  substitution:{pathname:'/design/motion/hoops.json', sha256:hash(body),
    reason:'The original viewer has a fixed asset list; only this JSON response is composed.'},
  baselineTransfers:'Canonical local GLBs are fulfilled with byte-identical buffers and explicit Content-Length to avoid Chromium transfer cancellation; failures remain fatal.',
  sourceSha256:hashes,originalSourceSha256:originalHashes,clips,
  transitions:pack.transitions, baselineClips:Object.keys(JSON.parse(original).states),
  modifiedThresholds:false,command:['node',...command.map(path=>path.startsWith(repository)?relative(repository,path):path)],
};
await writeFile(resolve(output,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
const exitCode = await new Promise((accept,reject)=>{
  const child = spawn(process.execPath,command,{stdio:'inherit',env:{...process.env,
    PLAYWRIGHT_MODULE:resolve(here,'playwright-pack.mjs'),HOOPS_PLAYWRIGHT_PATH:playwrightPath,
    HOOPS_CHECK_PACK:injected,HOOPS_CHECK_REQUESTS:requests,HOOPS_ISLAND:island}});
  child.on('error',reject);child.on('exit',code=>accept(code ?? 1));
});
const report = await parse(resolve(output,'report.json'));
const served = (await readFile(requests,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const failures = [];
for (const path of originals) if (hash(await readFile(resolve(island,path))) !== originalHashes[path])
  failures.push(`Original source changed: ${path}`);
for (const [path,before] of Object.entries(hashes)) if (hash(await readFile(resolve(repository,path))) !== before)
  failures.push(`Clip changed during test: ${path}`);
const hoopsResponses=served.filter(request=>request.pathname==='/design/motion/hoops.json');
if (hoopsResponses.length !== 2 || hoopsResponses.some(request=>request.sha256!==hash(body)))
  failures.push(`Expected two matching hoops JSON responses, received ${hoopsResponses.length}`);
for(const request of served.filter(request=>request.pathname.endsWith('.glb'))) {
  if(request.sha256!==originalHashes[request.pathname.slice(1)])failures.push(`GLB transfer hash differs: ${request.pathname}`);
}
for (const result of report.cases) for (const clip of clips) {
  if (!result.report?.checks?.support?.clips?.some(item=>item.clip===clip.name))
    failures.push(`${result.character}/${result.viewport.width}: missing support/floor traversal ${clip.name}`);
  if (clip.loop && !result.report?.checks?.loop?.cases?.some(item=>item.clip===clip.name))
    failures.push(`${result.character}/${result.viewport.width}: missing loop traversal ${clip.name}`);
}
provenance.servedResponses=served;
provenance.coverage={newClipCount:clips.length,cases:report.cases.length,
  expectedClipCaseCount:clips.length*report.cases.length,failures,pass:failures.length===0};
provenance.pass=exitCode===0&&report.pass===true&&failures.length===0;
if (args.includes('--previews')) {
  const {capturePreviews}=await import('./capture-previews.mjs');
  const previews=await capturePreviews({viewer,packPath:injected,output:resolve(output,'previews'),
    playwrightPath,clips,executablePath:executableDefault || '/usr/bin/chromium'});
  provenance.previews={file:'previews/previews.json',pass:previews.pass};
  provenance.pass=provenance.pass&&previews.pass;
}
await writeFile(resolve(output,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(`${provenance.pass?'PASS':'FAIL'} injected package: ${clips.length} new clips × ${report.cases.length} cases`);
process.exitCode=provenance.pass?0:1;
