import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(bundle, '../../../..');
const prefix = 'workout/island/design/phone-fixes-v1/';
const args = process.argv.slice(2);
const check = args[0] === '--check';
if (check) args.shift();
function fail(message) { throw Error(message); }
function git(root, ...argv) {
  const result = spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8' });
  if (result.status !== 0) fail(`git ${argv[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
try {
  if (args.length !== 1) fail('Usage: bash apply.sh [--check] /absolute/path/to/clean-copy');
  const target = realpathSync(args[0]);
  if (target === realpathSync(source)) fail('Refusing to apply patches to the deliverable checkout. Use a separate clean copy.');
  if (realpathSync(git(target, 'rev-parse', '--show-toplevel')) !== target) fail('Target must be a Git checkout root.');
  if (git(target, 'status', '--porcelain=v1', '--untracked-files=all')) fail('Target must be clean (including untracked files).');
  const manifest = JSON.parse(readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  // A clean checkout of the bundle branch is accepted only when its source tree
  // still equals the pinned base; bundle-only additions do not affect runtime.
  const differences = git(target, 'diff', '--name-only', manifest.base, 'HEAD', '--').split('\n').filter(Boolean);
  if (differences.some(file => !file.startsWith(prefix))) fail('Target source tree differs from the pinned v24.1 base.');
  const patches = manifest.patches.map(entry => {
    const file = path.join(bundle, entry.file);
    if (sha256(file) !== entry.sha256) fail(`Patch checksum mismatch: ${entry.file}`);
    for (const item of entry.targets) {
      const sourceFile = path.join(target, item.file);
      if (!existsSync(sourceFile) || sha256(sourceFile) !== item.sha256) fail(`Source checksum mismatch: ${item.file}`);
    }
    return file;
  });
  git(target, 'apply', '--check', '--whitespace=error-all', ...patches);
  if (!check) git(target, 'apply', '--whitespace=error-all', ...patches);
  console.log(JSON.stringify({ status: check ? 'checked' : 'applied', target, base: manifest.base, patches: manifest.patches.map(p => p.id) }));
} catch (error) {
  console.error(`phone-fixes-v1: ${error.message}`);
  process.exitCode = 1;
}
