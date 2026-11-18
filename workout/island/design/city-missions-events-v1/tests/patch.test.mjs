import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packagePath = 'workout/island/design/city-missions-events-v1';
const source = fileURLToPath(new URL('../../../../../', import.meta.url));
const packageDirectory = join(source, packagePath);
const patch = 'patches/island-integration.patch';

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd });
  if (result.error) throw result.error;
  return result;
}

function success(result) {
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

function fixture(t) {
  const target = mkdtempSync(join(tmpdir(), 'city missions patch '));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  success(command('git', ['init', '--quiet'], target));

  const stats = success(command('git', ['apply', '--numstat', '-z', join(packageDirectory, patch)], source));
  const records = stats.toString().split('\0').filter(Boolean);
  assert.ok(records.length > 0);
  const originals = new Map();
  for (const record of records) {
    const path = record.split('\t')[2];
    assert.ok(path?.startsWith('workout/island/') && !path.includes('/../') && !path.startsWith(`${packagePath}/`));
    const localPath = join(target, path);
    const baseline = success(command('git', ['show', `HEAD:${path}`], source));
    originals.set(localPath, baseline);
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, baseline);
  }

  const packageCopy = join(target, packagePath);
  mkdirSync(join(packageCopy, 'patches'), { recursive: true });
  cpSync(join(packageDirectory, patch), join(packageCopy, patch));
  const apply = join(packageCopy, 'apply.sh');
  cpSync(join(packageDirectory, 'apply.sh'), apply);
  // The same tests also run after an integrator commits the patch.
  if (command(apply, ['--reverse', '--check'], target).status === 0) {
    success(command(apply, ['--reverse'], target));
    for (const path of originals.keys()) originals.set(path, readFileSync(path));
  }
  return { target, originals, apply };
}

function assertFilesMatch(files) {
  for (const [path, content] of files) assert.deepEqual(readFileSync(path), content, path);
}

test('patch check, apply and reverse work in a disposable checkout', t => {
  const { target, originals, apply } = fixture(t);

  success(command(apply, ['--check', '--repo', target], tmpdir()));
  assertFilesMatch(originals);

  success(command(apply, [], tmpdir()));
  for (const [path, content] of originals) assert.notDeepEqual(readFileSync(path), content, path);
  const applied = new Map([...originals.keys()].map(path => [path, readFileSync(path)]));
  success(command(apply, ['--reverse', '--check', target], tmpdir()));
  assertFilesMatch(applied);

  success(command(apply, ['--reverse', target], tmpdir()));
  assertFilesMatch(originals);
});

test('an explicit checkout is used instead of the checkout containing the script', t => {
  const sourceCopy = fixture(t);
  const targetCopy = fixture(t);

  success(command(sourceCopy.apply, ['--repo', targetCopy.target], tmpdir()));
  assertFilesMatch(sourceCopy.originals);
  for (const [path, content] of targetCopy.originals) assert.notDeepEqual(readFileSync(path), content, path);

  success(command(sourceCopy.apply, ['--reverse', targetCopy.target], tmpdir()));
  assertFilesMatch(targetCopy.originals);
});

test('conflicting local edits cause the complete patch to fail without changing any file', t => {
  const { target, originals, apply } = fixture(t);
  const path = originals.keys().next().value;
  const localEdit = Buffer.from('// local work in the disposable checkout\n');
  writeFileSync(path, localEdit);
  originals.set(path, localEdit);

  assert.notEqual(command(apply, ['--repo', target], tmpdir()).status, 0);
  assertFilesMatch(originals);
});
