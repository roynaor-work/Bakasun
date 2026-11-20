import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const [, , checkout] = process.argv;
assert.ok(checkout, 'Usage: node verify.mjs /path/to/patched-checkout');

function nodeTests(files, {pattern, preload, stale = false} = {}) {
  const args = preload ? ['--import',fileURLToPath(new URL(preload,import.meta.url))] : [];
  args.push('--test');
  if (pattern) args.push('--test-name-pattern', pattern);
  args.push(...files);
  const result = spawnSync(process.execPath, args, {
    cwd:checkout, encoding:'utf8', timeout:120_000,
    env:{...process.env, ISLAND_CSP_BROWSER:'0', ISLAND_WORKOUT_BROWSER:'0',
      PATCH_TEST_VERSION:'island-v2-20991231-37', PATCH_TEST_STALE:stale?'1':'0'},
  });
  if (result.error) throw result.error;
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result;
}

const version = JSON.parse(readFileSync(path.resolve(checkout,'workout/island/release.json'),'utf8')).version;
assert.notEqual(version,'island-v2-20991231-37','the synthetic version differs from the checked-out release');

const tests=['tests/island-racing-v24-1.test.mjs','tests/island-tennis-crowd-v22.test.mjs'];
const pattern='session, view and style carry v24.1|tennis crowd v22: .*billboard crowd';
for (const preload of [undefined,'./release-overlay.mjs']) {
  const run=nodeTests(tests,{pattern,preload});
  assert.equal(run.status,0);
  assert.match(run.stdout,/^# pass 2$/m);
}
const stale=nodeTests(tests,{pattern,preload:'./release-overlay.mjs',stale:true});
assert.equal(stale.status,1);
assert.match(stale.stdout,/^# fail 2$/m);
assert.match(stale.stdout,/racing-pit\.mjs →/);
assert.match(stale.stdout,/stadium asset links →/);
assert.equal(nodeTests([
  'tests/island-fire-entry-lifecycle.test.mjs',
  'tests/island-boar-aim-acceptance.test.mjs',
  'tests/workout-royiki.test.mjs',
]).status,0);

const clock = nodeTests(['tests/island-fire-entry-lifecycle.test.mjs'], {
  pattern:'fire entry freezes the street clock',
  preload:'./fire-clock-overlay.mjs',
});
assert.equal(clock.status,1);
assert.match(clock.stdout,/^not ok 1 - fire entry freezes the street clock/m);
assert.match(clock.stdout,/^# fail 1$/m);
