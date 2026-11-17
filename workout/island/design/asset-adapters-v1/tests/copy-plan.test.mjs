import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../tools/copy-assets.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'asset-copy-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repository with spaces');
  const destination = join(root, 'island');
  const catalogPath = join(root, 'catalog.json');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  const sourceRoot = 'workout/island/design/sample-v1';
  const payloads = [
    ['models/player.glb', Buffer.from('test binary payload\0\xff')],
    ['LICENSE.txt', Buffer.from('Synthetic test notice')],
  ];
  for (const [path, bytes] of payloads) {
    const file = join(repo, sourceRoot, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  git('add', '.');
  git('-c', 'user.name=Asset test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'Synthetic asset payloads');
  const commit = git('rev-parse', 'HEAD');
  const catalog = {
    schema: 1,
    packs: [{
      id: 'sample-v1',
      game: 'core',
      source: { root: sourceRoot, branch: 'codex/sample-v1', commit },
      dependencies: ['Injected renderer'],
      missing: ['Connect renderer in a future change'],
      assets: payloads.map(([path, bytes]) => ({
        name: path, path, sourcePath: `${sourceRoot}/${path}`,
        bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        blob: git('rev-parse', `${commit}:${sourceRoot}/${path}`),
      })),
    }],
  };
  const save = () => writeFileSync(catalogPath, JSON.stringify(catalog));
  save();
  const run = (...args) => spawnSync(process.execPath, [cli, '--catalog', catalogPath, '--repo', repo, '--destination', destination, ...args], { encoding: 'utf8' });
  const target = path => join(destination, 'assets/sample-v1', path);
  return { root, repo, catalog, save, run, destination, target, payloads, git };
}

test('copy plan defaults to validated dry run without creating destination', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN sample-v1: 2 files/);
  assert.match(result.stdout, /No files written/);
  assert.match(result.stdout, /Dependencies.*Injected renderer/);
  assert.equal(existsSync(f.destination), false);
});

test('apply copies exact pinned binary and license payloads, then verify and repeat are idempotent', t => {
  const f = fixture(t);
  assert.equal(f.run('--apply').status, 0);
  for (const [path, bytes] of f.payloads) assert.deepEqual(readFileSync(f.target(path)), bytes);
  assert.equal(f.run('--verify').status, 0);
  assert.equal(f.run('--apply').status, 0);
  assert.equal(f.run('--dry-run', '--pack', 'sample-v1').status, 0);
});

test('verify detects missing destination files and writes nothing', t => {
  const f = fixture(t);
  const result = f.run('--verify');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing destination file/);
  assert.equal(existsSync(f.destination), false);
});

test('all payload conflicts are discovered before any new files are written', t => {
  const f = fixture(t);
  mkdirSync(dirname(f.target('LICENSE.txt')), { recursive: true });
  writeFileSync(f.target('LICENSE.txt'), 'Unrelated existing notice');
  const result = f.run('--apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite differing file/);
  assert.equal(existsSync(f.target('models/player.glb')), false);
  assert.equal(readFileSync(f.target('LICENSE.txt'), 'utf8'), 'Unrelated existing notice');
});

test('altered content hash and wrong Git provenance reject the entire plan', t => {
  const f = fixture(t);
  f.catalog.packs[0].assets[1].sha256 = '0'.repeat(64);
  f.save();
  assert.match(f.run('--apply').stderr, /Byte\/hash mismatch/);
  assert.equal(existsSync(f.destination), false);
  f.catalog.packs[0].assets[1].blob = '0'.repeat(40);
  f.save();
  assert.match(f.run('--apply').stderr, /Pinned Git tree does not match catalog/);
  assert.equal(existsSync(f.destination), false);
});

test('missing source commit prints an exact fetch instruction without selecting a moving branch', t => {
  const f = fixture(t);
  const missing = '1'.repeat(40);
  f.catalog.packs[0].source.commit = missing;
  f.save();
  const result = f.run('--apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`fetch origin ${missing}`));
  assert.match(result.stderr, /repository with spaces'/);
  assert.equal(existsSync(f.destination), false);
});

test('path traversal, duplicate paths and excluded source/screenshots/WASM are rejected', t => {
  const f = fixture(t);
  const asset = f.catalog.packs[0].assets[0];
  const original = { ...asset };
  for (const path of ['../escape.glb', '/absolute.glb', 'models\\escape.glb', 'source/build.mjs', 'screenshots/view.png', 'decoder.wasm']) {
    asset.path = path;
    f.save();
    const result = f.run('--apply');
    assert.equal(result.status, 1, path);
    assert.equal(existsSync(f.destination), false, path);
  }
  Object.assign(asset, original);
  f.catalog.packs[0].assets.push({ ...asset });
  f.save();
  assert.match(f.run('--apply').stderr, /Duplicate destination/);
  assert.equal(existsSync(f.destination), false);
});

test('destination symlink and dangling target symlink cannot redirect writes', t => {
  const f = fixture(t);
  const outside = join(f.root, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, f.destination, 'dir');
  assert.match(f.run('--apply').stderr, /symbolic link/);
  assert.equal(existsSync(join(outside, 'assets')), false);
  rmSync(f.destination);
  mkdirSync(dirname(f.target('LICENSE.txt')), { recursive: true });
  symlinkSync(join(outside, 'missing'), f.target('LICENSE.txt'));
  assert.match(f.run('--apply').stderr, /symbolic link/);
  assert.equal(existsSync(join(outside, 'missing')), false);
  assert.equal(existsSync(f.target('models/player.glb')), false);
});

test('unknown pack, duplicate pack id, and conflicting modes fail before writes', t => {
  const f = fixture(t);
  assert.match(f.run('--pack', 'unlisted').stderr, /Unknown pack/);
  assert.match(f.run('--apply', '--verify').stderr, /Choose only one/);
  f.catalog.packs.push({ ...f.catalog.packs[0] });
  f.save();
  assert.match(f.run('--apply').stderr, /Invalid or duplicate pack/);
  assert.equal(existsSync(f.destination), false);
});

test('only the audited tennis grip reference GLB can be remapped out of source/', t => {
  const f = fixture(t);
  const pack = f.catalog.packs[0];
  const bytes = Buffer.from('Synthetic runtime reference GLB');
  const sourcePath = `${pack.source.root}/source/reference/grip-player.glb`;
  mkdirSync(dirname(join(f.repo, sourcePath)), { recursive: true });
  writeFileSync(join(f.repo, sourcePath), bytes);
  f.git('add', '.');
  f.git('-c', 'user.name=Asset test', '-c', 'user.email=asset-test@example.invalid', 'commit', '-qm', 'Runtime reference');
  pack.source.commit = f.git('rev-parse', 'HEAD');
  pack.id = 'tennis-motion-v2';
  pack.assets = [{
    name: 'reference/grip-player.glb', path: 'reference/grip-player.glb', sourcePath,
    copyNote: 'Runtime reference model remapped out of source/',
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    blob: f.git('rev-parse', `${pack.source.commit}:${sourcePath}`),
  }];
  f.save();
  assert.equal(f.run('--apply').status, 0);
  assert.deepEqual(readFileSync(join(f.destination, 'assets/tennis-motion-v2/reference/grip-player.glb')), bytes);
  delete pack.assets[0].copyNote;
  f.save();
  assert.match(f.run().stderr, /Excluded source/);
  pack.assets[0].copyNote = 'Runtime reference model remapped out of source/';
  pack.id = 'different-pack';
  f.save();
  assert.match(f.run().stderr, /Excluded source/);
});
