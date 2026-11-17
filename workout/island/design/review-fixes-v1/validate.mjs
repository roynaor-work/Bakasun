#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {cp, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {dirname, extname, isAbsolute, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const bundle = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const root = resolve(option('--root') || '.');
const output = resolve(option('--output') || '/tmp/review-fixes-v1-evidence');
const testsOnly = args.includes('--tests-only');
const manifest = JSON.parse(await readFile(resolve(bundle, 'manifest.json'), 'utf8'));
const git = argv => execFileSync('git', ['-C', root, ...argv], {encoding: 'utf8'}).trim();
assert.equal(git(['rev-parse', 'HEAD']), manifest.base, 'Validation requires the pinned main commit');
assert.equal(git(['branch', '--show-current']), '', 'Validation requires a detached worktree');
assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'Validation requires a clean index and tracked files');
assert.notEqual(root, git(['rev-parse', '--path-format=absolute', '--git-common-dir']).replace(/\/.git$/, ''), 'Refuse the primary checkout');
await mkdir(output, {recursive: true});
const results = {base: manifest.base, audit: manifest.audit, node: process.version, started: new Date().toISOString(), testsOnly, commands: []};
const persist = () => writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');

async function run(name, executable, argv, {expected = 0, allowedCodes = [0, 1], timeoutMs = 300000} = {}) {
  console.log(`${name}: running`);
  const started = Date.now();
  let timedOut = false;
  let text = `$ ${executable} ${argv.map(x => JSON.stringify(x)).join(' ')}\n# cwd: ${root}\n`;
  const child = spawn(executable, argv, {cwd: root, detached: true, env: {...process.env, REVIEW_FIX_ROOT: root, V241_REPRO_OUTPUT: resolve(output, name + '-artifacts')}});
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1500).unref();
  }, timeoutMs);
  child.stdout.on('data', bytes => { text += bytes; });
  child.stderr.on('data', bytes => { text += bytes; });
  const exit = await new Promise((done, reject) => { child.on('error', reject); child.on('close', (code, signal) => done({code, signal})); });
  clearTimeout(timer);
  const result = {name, executable, argv, ...exit, timedOut, durationMs: Date.now() - started, log: name + '.log'};
  await writeFile(resolve(output, result.log), text + `\n# result: ${JSON.stringify(result)}\n`);
  results.commands.push(result);
  await persist();
  console.log(`${name}: exit=${exit.code}${timedOut ? ' timeout' : ''} (${(result.durationMs / 1000).toFixed(1)}s)`);
  if (expected === 'failure') {
    assert.ok(!timedOut && exit.code !== null && exit.code !== 0, `${name}: regression test must fail on the base`);
    assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|Executable doesn't exist|browserType\.launch:/.test(text), `${name}: environment failure is not a reproduced defect`);
  } else if (expected === 'observe') {
    assert.ok(!timedOut && exit.code !== null && allowedCodes.includes(exit.code), `${name}: original probe did not complete; see its log`);
    assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|Executable doesn't exist|ModuleNotFoundError|browserType\.launch:/.test(text), `${name}: environment failure is not an observation`);
  } else {
    assert.ok(!timedOut && exit.code === expected, `${name}: see ${resolve(output, result.log)}`);
  }
  return result;
}

const testDir = resolve(root, 'workout/island/design/review-fixes-v1/tests');
await mkdir(dirname(testDir), {recursive: true});
await cp(resolve(bundle, 'tests'), testDir, {recursive: true});
for (const finding of manifest.findings) {
  const bytes = await readFile(resolve(bundle, finding.patch));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), finding.sha256, `${finding.id}: patch digest`);
  await run('base-apply-check-' + finding.id, 'git', ['apply', '--check', resolve(bundle, finding.patch)]);
}
const existing = [...new Set(manifest.findings.flatMap(x => x.existingTests))].sort();
await run('before-existing', process.execPath, ['--test', '--test-concurrency=2', ...existing], {timeoutMs: 1200000});
for (const finding of manifest.findings) {
  await run('before-new-' + finding.id, process.execPath, ['--test', resolve(testDir, finding.test)], {expected: 'failure', timeoutMs: 300000});
}

let server;
async function startReproductions() {
  // Extract the ORIGINAL audit fixtures from their pinned commit; do not alter them.
  try { git(['cat-file', '-e', manifest.audit + '^{commit}']); }
  catch { execFileSync('git', ['-C', root, 'fetch', '--no-tags', 'origin', manifest.audit], {stdio: 'inherit'}); }
  const archive = execFileSync('git', ['-C', root, 'archive', manifest.audit, 'workout/island/design/external-review-v241'], {maxBuffer: 16 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', root], {input: archive});
  const mime = {'.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary'};
  server = createServer(async (req, res) => {
    try {
      let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      const rel = relative(root, path);
      if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
      let info = await stat(path);
      if (info.isDirectory()) { path = resolve(path, 'index.html'); info = await stat(path); }
      res.writeHead(200, {'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store'});
      createReadStream(path).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(8766, '127.0.0.1', done); });
}
async function reproduce(phase) {
  for (const probe of manifest.reproductions) {
    await run(`${phase}-repro-${probe.name}`, probe.executable === 'node' ? process.execPath : probe.executable,
      [resolve(root, 'workout/island/design/external-review-v241/repro', probe.file), ...(probe.args || [])],
      {expected: 'observe', allowedCodes: probe[phase + 'Codes'] || [0], timeoutMs: probe.timeoutMs || 240000});
  }
}
try {
  if (!testsOnly) { await startReproductions(); await reproduce('before'); }
  for (const finding of manifest.findings) {
    await run('apply-' + finding.id, 'git', ['apply', '--3way', '--index', resolve(bundle, finding.patch)]);
  }
  for (const finding of manifest.findings) {
    await run('after-new-' + finding.id, process.execPath, ['--test', resolve(testDir, finding.test)], {timeoutMs: 300000});
  }
  await run('after-existing', process.execPath, ['--test', '--test-concurrency=2', ...existing], {timeoutMs: 1200000});
  if (!testsOnly) await reproduce('after');
  results.success = true;
  results.finished = new Date().toISOString();
  await persist();
  console.log('All 16 base failures, all 16 patched test files, and the existing test set verified.');
  console.log(testsOnly ? 'Original probes were skipped (--tests-only).' : 'Original probes completed; some intentionally assert the old defect. Read their logs with REPORT.md.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
}
