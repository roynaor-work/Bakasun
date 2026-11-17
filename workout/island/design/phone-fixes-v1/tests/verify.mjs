import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Uses isolated source checkouts. It never applies a patch in the bundle repo.
const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(bundle, '../../../..');
const evidence = path.resolve(process.env.PHONE_FIX_EVIDENCE || path.join(bundle, 'evidence'));
const base = '43b27dc235387e3cb737aee9558cdf9d5fd5a262';
mkdirSync(evidence, { recursive: true });
const scratch = process.env.PHONE_FIX_SCRATCH || mkdtempSync(path.join(tmpdir(), 'phone-fixes-'));
mkdirSync(scratch, { recursive: true });
const result = { base, scratch, node: process.version, regressions: [] };
function command(executable, args, options = {}) {
  return spawnSync(executable, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
function required(executable, args, options) {
  const run = command(executable, args, options);
  if (run.status !== 0) throw Error(`${executable} ${args[0]}: ${run.stderr || run.stdout}`);
  return run;
}
for (const mode of ['before', 'after']) {
  const target = path.join(scratch, mode);
  required('git', ['clone', '--shared', '--no-checkout', root, target]);
  required('git', ['-C', target, 'checkout', '--detach', base]);
  if (mode === 'after') required('bash', [path.join(bundle, 'apply.sh'), target]);
  for (const letter of 'ABCDEF') {
    const run = command(process.execPath, ['--test', '--test-reporter=tap', path.join(bundle, 'tests', `${letter}.test.mjs`)], {
      cwd: target, env: { ...process.env, PHONE_FIX_ROOT: target, PHONE_FIX_ROLLBACK: mode === 'after' ? '1' : '0' },
    });
    writeFileSync(path.join(evidence, `${letter}-${mode}.tap`), `${run.stdout || ''}${run.stderr || ''}`);
    const pass = Number(run.stdout.match(/^# pass (\d+)/m)?.[1] ?? 0);
    const fail = Number(run.stdout.match(/^# fail (\d+)/m)?.[1] ?? 0);
    const assertionFailure = /ERR_ASSERTION/.test(run.stdout);
    const setupFailure = /ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module/.test(run.stdout + run.stderr);
    const expected = mode === 'after' ? run.status === 0 && pass > 0 : run.status !== 0 && fail > 0 && assertionFailure && !setupFailure;
    result.regressions.push({ patch: letter, mode, exit: run.status, expected, signal: run.signal,
      pass, fail });
    console.log(`${letter} ${mode}: exit ${run.status} ${expected ? 'expected' : 'UNEXPECTED'}`);
  }
}
result.passed = result.regressions.every(item => item.expected && item.signal === null);
writeFileSync(path.join(evidence, 'regressions.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, scratch }));
if (!result.passed) process.exitCode = 1;
