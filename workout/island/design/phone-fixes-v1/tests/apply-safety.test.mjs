import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(bundle, '../../../..');
const run = (...args) => spawnSync('bash', [path.join(bundle, 'apply.sh'), ...args], { encoding: 'utf8' });
const checkout = process.env.PHONE_FIX_CLEAN_COPY;
const applied = process.env.PHONE_FIX_APPLIED_COPY;
const status = root => spawnSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' }).stdout;
test('apply refuses the deliverable checkout', () => {
  const result = run(source);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deliverable checkout/);
});
test('apply --check validates every patch without altering a clean copy', { skip: !checkout }, () => {
  const result = run('--check', checkout);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(status(checkout), '');
});
test('apply refuses dirt and leaves it exactly intact', { skip: !checkout }, () => {
  const filename = path.join(checkout, 'package.json'), original = readFileSync(filename);
  try {
    writeFileSync(filename, Buffer.concat([original, Buffer.from('\n')]));
    const before = status(checkout), result = run(checkout);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be clean/);
    assert.equal(status(checkout), before);
    assert.deepEqual(readFileSync(filename), Buffer.concat([original, Buffer.from('\n')]));
  } finally { writeFileSync(filename, original); }
});
test('a tampered late patch is rejected before any earlier patch is applied', { skip: !checkout }, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'phone-apply-'));
  const copiedBundle = path.join(temporary, 'workout/island/design/phone-fixes-v1');
  mkdirSync(path.join(copiedBundle, 'patches'), { recursive: true });
  mkdirSync(path.join(copiedBundle, 'tests'));
  const manifest = JSON.parse(readFileSync(path.join(bundle, 'manifest.json')));
  for (const name of ['apply.sh', 'manifest.json', 'tests/apply.mjs', ...manifest.patches.map(p => p.file)]) copyFileSync(path.join(bundle, name), path.join(copiedBundle, name));
  const last = path.join(copiedBundle, manifest.patches.at(-1).file);
  writeFileSync(last, readFileSync(last, 'utf8') + '\ncorrupt\n');
  const result = spawnSync('bash', [path.join(copiedBundle, 'apply.sh'), checkout], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum mismatch/);
  assert.equal(status(checkout), '');
});
test('apply refuses an already applied copy', { skip: !applied }, () => {
  const before = status(applied), result = run(applied);
  assert.notEqual(result.status, 0);
  assert.equal(status(applied), before);
});
