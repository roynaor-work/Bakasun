import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const delivery = fileURLToPath(new URL('../', import.meta.url));
const { baseCommit, packs } = JSON.parse(readFileSync(join(delivery, 'inventory.json'), 'utf8'));
const island = 'workout/island';
const manifestPath = `${island}/offline-manifest.json`;
const creditsPath = `${island}/ASSETS.md`;
const script = join(delivery, 'apply.sh');
const repoGit = (...args) => execFileSync('git', args, { encoding: 'utf8', cwd: delivery });
const baseManifest = JSON.parse(repoGit('show', `${baseCommit}:${manifestPath}`));
const baseCredits = repoGit('show', `${baseCommit}:${creditsPath}`);
const sharedPaths = selection => [...new Set([manifestPath, creditsPath, ...selection.flatMap(pack => pack.tests)])];
const assetPaths = pack => Object.keys(pack.files).map(name => `assets/${pack.id}/${name}`);

function fixture(t, selection) {
  const cwd = mkdtempSync(join(tmpdir(), 'island-patch-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  git('init', '--quiet');
  const alternates = join(cwd, '.git', 'objects', 'info');
  mkdirSync(alternates, { recursive: true });
  writeFileSync(join(alternates, 'alternates'), repoGit('rev-parse', '--path-format=absolute', '--git-path', 'objects'));
  git('update-ref', 'HEAD', baseCommit);
  git('read-tree', baseCommit);
  if (selection) git('checkout-index', '--index', '--', ...sharedPaths(selection));
  return { cwd, git };
}

function verifyIndex(git, selection, cwd) {
  const changes = git('diff', '--cached', '--name-status', '--no-renames', baseCommit).toString().trim().split('\n').sort();
  assert.deepEqual(changes, [
    ...sharedPaths(selection).map(path => `M\t${path}`),
    ...selection.flatMap(pack => assetPaths(pack).map(path => `A\t${island}/${path}`)),
  ].sort());

  const manifest = JSON.parse(git('show', `:${manifestPath}`));
  const credits = git('show', `:${creditsPath}`).toString('utf8');
  const expectedGroups = new Map([
    ['core', [...baseManifest.core]], ['shell', [...baseManifest.shell]],
    ...Object.entries(baseManifest.games).map(([bucket, paths]) => [bucket, [...paths]]),
  ]);
  const expectedFiles = { ...baseManifest.files };
  assert.equal(manifest.schema, baseManifest.schema);
  assert.equal(manifest.note, baseManifest.note);
  assert.ok(credits.startsWith(baseCredits));
  const addedCredits = credits.slice(baseCredits.length);
  assert.deepEqual([...addedCredits.matchAll(/^## (.+)$/gm)].map(match => match[1]), selection.map(pack => pack.id));

  for (const pack of selection) {
    const paths = assetPaths(pack);
    expectedGroups.set(pack.bucket, [...(expectedGroups.get(pack.bucket) ?? []), ...paths]);
    for (const [name, [sha256, bytes]] of Object.entries(pack.files)) {
      assert.doesNotMatch(name, /(?:^|\/)(?:sources?|screenshots?|verification|previews?|vendor|node_modules)(?:\/|$)/i);
      assert.doesNotMatch(name, /\.(?:blend|fbx|psd|kra|zip|wasm)$/i);
      const path = `assets/${pack.id}/${name}`;
      expectedFiles[path] = [sha256.slice(0, 16), bytes];
      const repoPath = `${island}/${path}`;
      const payload = cwd ? readFileSync(join(cwd, repoPath)) : git('show', `:${repoPath}`);
      assert.equal(payload.length, bytes, path);
      assert.equal(createHash('sha256').update(payload).digest('hex'), sha256, path);
    }
    assert.ok(addedCredits.includes(pack.sourceCommit), pack.id);
    for (const notice of pack.licenses) {
      assert.ok(Object.hasOwn(pack.files, notice), notice);
      assert.ok(addedCredits.includes(`[${notice}](assets/${pack.id}/${notice})`), notice);
    }
  }

  const actualGroups = new Map([['core', manifest.core], ['shell', manifest.shell], ...Object.entries(manifest.games)]);
  assert.equal(actualGroups.size, expectedGroups.size);
  for (const [bucket, paths] of expectedGroups) {
    assert.deepEqual(actualGroups.get(bucket), paths.sort(), bucket);
    assert.equal(new Set(paths).size, paths.length, bucket);
  }
  assert.deepEqual(manifest.files, expectedFiles);
  assert.deepEqual(Object.keys(manifest.files), Object.keys(expectedFiles).sort());
}

test('each selected inventory has one standalone Git patch', () => {
  const names = packs.map(({ id }) => id + '.patch').sort();
  assert.equal(names.length, 21);
  assert.deepEqual(readdirSync(join(delivery, 'patches')).sort(), names);
});

test('standalone patches apply to the pinned base and reproduce the audited payloads', async t => {
  const { git } = fixture(t);
  for (const pack of packs) {
    await t.test(pack.id, () => {
      git('read-tree', baseCommit);
      git('apply', '--cached', join(delivery, 'patches', pack.id + '.patch'));
      verifyIndex(git, [pack]);
    });
  }
});

test('apply.sh checks and composes packs that share registry, credits and test entries', t => {
  const ids = [
    'hoops-motion-v14', 'hoops-arena-v2', 'tennis-ui-v2', 'alpine-runner-v1',
    'boars-weapons-v2', 'racing-podium-v1', 'ui-sounds-v1', 'lighting-presets-v1',
  ];
  const selection = packs.filter(pack => ids.includes(pack.id));
  const { cwd, git } = fixture(t, selection);
  const reapply = (...args) => spawnSync(script, args, { cwd, encoding: 'utf8' });
  const staged = () => git('diff', '--cached', '--name-only').toString();
  const checkUnapplied = (credits = baseCredits) => {
    assert.equal(staged(), '');
    assert.equal(readFileSync(join(cwd, creditsPath), 'utf8'), credits);
    assert.equal(existsSync(join(cwd, island, 'assets/racing-podium-v1')), false);
  };

  const checked = reapply('--check', ...ids);
  assert.equal(checked.status, 0, checked.stderr);
  checkUnapplied();

  const localEdit = baseCredits + '\nLocal rehearsal edit.\n';
  writeFileSync(join(cwd, creditsPath), localEdit);
  const conflict = reapply(...ids);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /ASSETS\.md/);
  checkUnapplied(localEdit);
  git('checkout-index', '--force', '--index', '--', creditsPath);

  const applied = reapply(...ids);
  assert.equal(applied.status, 0, applied.stderr);
  verifyIndex(git, selection, cwd);
  const beforeRetry = staged();
  const retry = reapply(...ids);
  assert.equal(retry.status, 1);
  assert.equal(staged(), beforeRetry);
});
