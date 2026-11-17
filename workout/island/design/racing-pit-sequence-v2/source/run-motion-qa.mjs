// CC0-1.0. Run the original upstream CLI with a library input adapter only.
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..');
const repo = path.resolve(assets, '../../../..');
const PIN = '5eb4f093bc22523ee417a7f2345c3b813bffba24';
const TOOL = 'workout/island/design/motion-qa-v1';
const MODULES = ['run.mjs', 'glb.mjs', 'metrics.mjs', 'report.mjs', 'sheets.mjs', 'licenses.mjs'];
const REQUIRED = ['jack_up', 'loosen', 'remove_old', 'mount_new', 'tighten', 'jack_down', 'signal'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// The original six modules are vendored byte-for-byte so a fresh checkout is
// sufficient, including one that has never fetched the upstream QA branch.
const localUpstream = path.join(here, 'qa-upstream');
const authoritative = JSON.parse(await readFile(path.join(localUpstream, 'provenance.sha256.json'), 'utf8'));
if (authoritative.commit !== PIN || authoritative.files.length !== MODULES.length) {
  throw new Error('Unexpected vendored QA provenance.');
}
const temporary = await mkdtemp(path.join(tmpdir(), 'pit-sequence-v2-motion-qa-'));
try {
  const qaRoot = path.join(temporary, TOOL);
  await mkdir(qaRoot, { recursive: true });
  const upstreamFiles = [];
  for (const file of MODULES) {
    const bytes = await readFile(path.join(localUpstream, file));
    const expected = authoritative.files.find(entry => entry.name === file);
    if (!expected || expected.upstreamPath !== `${TOOL}/${file}` || bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) {
      throw new Error(`Vendored upstream integrity check failed: ${file}`);
    }
    await writeFile(path.join(qaRoot, file), bytes);
    upstreamFiles.push({ file: `${TOOL}/${file}`, localFile: `source/qa-upstream/${file}`, sha256: expected.sha256 });
  }
  const vendor = 'workout/island/design/soccer-motion-v8/runtime/vendor/three.module.js';
  const vendorPath = path.join(temporary, vendor);
  await mkdir(path.dirname(vendorPath), { recursive: true });
  await copyFile(path.join(repo, vendor), vendorPath);
  const loaderSource = `import path from 'node:path';\nimport {fileURLToPath} from 'node:url';\nexport async function resolve(specifier, context, nextResolve) {\n  const parent = context.parentURL && fileURLToPath(context.parentURL);\n  if (parent === path.join(process.env.PIT_QA_ROOT, 'run.mjs') && specifier === './sources.mjs') return {url: ${JSON.stringify(new URL('./qa-sources.mjs', import.meta.url).href)}, shortCircuit: true};\n  return nextResolve(specifier, context);\n}\n`;
  const loader = path.join(temporary, 'qa-loader.mjs');
  await writeFile(loader, loaderSource);
  const status = (await exec('git', ['status', '--porcelain', '--', path.relative(repo, path.join(assets, 'clips'))], { cwd: repo })).stdout.trim();
  const commit = status ? 'working-tree' : (await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const output = path.join(temporary, 'output');
  const { stdout } = await exec(process.execPath, [
    '--loader', loader, path.join(qaRoot, 'run.mjs'),
    '--library', 'racing-pit-sequence-v2', '--fps', '60', '--out', output,
  ], { cwd: repo, env: { ...process.env, PIT_QA_ROOT: qaRoot, PIT_ASSET_COMMIT: commit }, maxBuffer: 1024 * 1024 });
  for (const entry of upstreamFiles) {
    if (hash(await readFile(path.join(temporary, entry.file))) !== entry.sha256) {
      throw new Error(`Upstream code changed: ${entry.file}`);
    }
  }
  const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
  const all = report.libraries.flatMap(library => library.clips);
  const minimum = Math.min(...all.map(clip => clip.score));
  const missing = all.flatMap(clip => Object.values(clip.metrics)).filter(metric => metric.status === 'insufficient-data').length;
  const provenance = {
    upstreamRepository: 'https://github.com/roynaor-work/Bakasun',
    upstreamBranch: 'codex/motion-qa-v1',
    upstreamCommit: PIN,
    upstreamEntryPoint: `${TOOL}/run.mjs`,
    upstreamFiles,
    upstreamUnmodified: true,
    offlineUpstream: 'source/qa-upstream; exact original bytes verified against provenance.sha256.json before and after execution',
    inputAdapter: { file: 'source/qa-sources.mjs', sha256: hash(await readFile(path.join(here, 'qa-sources.mjs'))) },
    temporaryLoader: { purpose: 'replace only the upstream library source module', sha256: hash(loaderSource) },
    vendor: { file: vendor, sha256: hash(await readFile(vendorPath)), license: 'MIT; local verification dependency' },
    assetsGitCommit: commit,
    scoring: 'all original upstream metrics, thresholds, weights and continuity idle selection unchanged',
    sampleRateHz: 60,
    scope: 'all delivered pit-actions.glb animations at their actual game-time durations, including exact support and event times',
    minimumRequiredExclusive: 88,
    minimumObserved: minimum,
    coverage: Math.min(...all.map(clip => clip.coverage)),
    insufficientDataMetrics: missing,
    passed: REQUIRED.every(name => all.some(clip => clip.motionId === name)) && minimum > 88 && missing === 0 && all.every(clip => clip.coverage === 1),
    limitations: ['Skeleton and declared sole corners, not full mesh collision or perceived animation quality.', 'Scene attachments and stage transitions are verified separately from this clip-level QA.'],
    cliStdout: stdout.trim(),
  };
  await mkdir(path.join(assets, 'verification'), { recursive: true });
  await copyFile(path.join(output, 'report.json'), path.join(assets, 'verification/motion-qa.json'));
  await writeFile(path.join(assets, 'verification/motion-qa-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ clips: all.length, minimum, coverage: provenance.coverage, redMetrics: report.libraries[0].summary.redMetrics, passed: provenance.passed, scores: all.map(clip => ({ name: clip.motionId, score: clip.score, reasons: clip.reasons })) }, null, 2));
  if (!provenance.passed) throw new Error(`Motion QA failed: minimum ${minimum}; missing applicable metrics ${missing}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
