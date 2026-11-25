import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditsPath, creditsWithPacks, island, offlinePath, offlineWithPacks } from './wiring.mjs';

const delivery = fileURLToPath(new URL('../', import.meta.url));
const inventory = JSON.parse(readFileSync(join(delivery, 'inventory.json'), 'utf8'));
const { baseCommit } = inventory;
const usage = `Usage: apply.sh [--check] [PACK ...]

Run from the target Git checkout. With no pack IDs, use all 21 patches.
--check  Validate the selection and its applicability to the target.
         The default applies the selection to the index and worktree.
--help   Show the available packs.

Patches were prepared against ${baseCommit}.

${inventory.packs.map(pack => pack.id).join('\n')}
`;

const git = (args, { env, input, cwd } = {}) => execFileSync('git', args, {
  cwd, env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
});

function argumentsFor(args) {
  const ids = new Set();
  let check = false;
  for (const arg of args) {
    if (arg === '--check') { check = true; continue; }
    if (!inventory.packs.some(pack => pack.id === arg)) throw new Error(`Unknown pack or option: ${arg}`);
    if (ids.has(arg)) throw new Error(`Repeated pack: ${arg}`);
    ids.add(arg);
  }
  const packs = inventory.packs.filter(pack => ids.size === 0 || ids.has(pack.id));
  return { check, packs };
}

function stageSelection(repo, scratch, packs) {
  const objects = join(scratch, 'objects');
  const repoObjects = git(['rev-parse', '--path-format=absolute', '--git-path', 'objects'], { cwd: repo });
  mkdirSync(join(objects, 'info'), { recursive: true });
  writeFileSync(join(objects, 'info', 'alternates'), repoObjects);
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index'), GIT_OBJECT_DIRECTORY: objects };
  const isolated = args => git(args, { cwd: repo, env });
  isolated(['read-tree', baseCommit]);

  // The individual patches share the registry, credits and some test hunks.
  // Stage their payloads and each test edit once, then write the merged registry and credits.
  const stagedTests = new Set();
  for (const { id, tests } of packs) {
    const testPaths = tests.filter(path => !stagedTests.has(path));
    const paths = [`${island}/assets/${id}/*`, ...testPaths];
    isolated(['apply', '--cached', '--whitespace=nowarn', ...paths.map(path => `--include=${path}`), join(delivery, 'patches', `${id}.patch`)]);
    testPaths.forEach(path => stagedTests.add(path));
  }
  const manifest = JSON.parse(isolated(['show', `${baseCommit}:${offlinePath}`]));
  const credits = isolated(['show', `${baseCommit}:${creditsPath}`]);
  for (const [path, contents] of [
    [offlinePath, offlineWithPacks(manifest, packs)],
    [creditsPath, creditsWithPacks(credits, packs)],
  ]) {
    const oid = git(['hash-object', '-w', '--stdin'], { cwd: repo, env, input: contents }).trim();
    isolated(['update-index', '--cacheinfo', `100644,${oid},${path}`]);
  }

  const assetPaths = packs.flatMap(({ id, files }) => Object.keys(files).map(name => `${island}/assets/${id}/${name}`));
  const expected = [offlinePath, creditsPath, ...stagedTests, ...assetPaths].sort();
  const actual = isolated(['diff', '--cached', '--name-only', '-z', baseCommit]).split('\0').filter(Boolean).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('The staged file list differs from the pack inventory.');

  const output = join(scratch, 'selection.patch');
  const attributes = join(scratch, 'attributes');
  writeFileSync(attributes, `${island}/assets/** binary\n`);
  isolated([
    '-c', `core.attributesFile=${attributes}`, 'diff', '--cached', '--binary', '--full-index',
    '--no-renames', '--no-ext-diff', '--no-textconv', `--output=${output}`, baseCommit,
  ]);
  return output;
}

function applySelection({ check, packs }) {
  const repo = git(['rev-parse', '--show-toplevel']).trim();
  const shared = [offlinePath, creditsPath, ...new Set(packs.flatMap(pack => pack.tests))];
  const changed = git(['diff', '--cached', '--name-only', baseCommit, '--', ...shared], { cwd: repo });
  if (changed.trim()) throw new Error(`The registry, credits and selected tests must match the base ${baseCommit}.\n${changed.trim()}`);

  const scratch = mkdtempSync(join(tmpdir(), 'island-pack-wiring-'));
  try {
    const patch = stageSelection(repo, scratch, packs);
    const apply = ['apply', '--index', '--whitespace=nowarn'];
    git([...apply, '--check', patch], { cwd: repo });
    if (!check) git([...apply, patch], { cwd: repo });
    console.log(`${check ? 'Checked' : 'Applied and staged'} ${packs.length} pack patch(es).`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) process.stdout.write(usage);
  else applySelection(argumentsFor(args));
} catch (error) {
  console.error(`pack wiring: ${error.message}`);
  process.exitCode = 1;
}
