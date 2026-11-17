#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepo = resolve(bundleRoot, '../../../..');
const objectId = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
const excludedSegments = /^(?:source|sources|screenshots?|verification|previews?|node_modules|vendor)$/i;
const excludedFile = /(?:\.wasm|\.blend\d*|\.fbx|\.psd|\.kra|\.ai|\.zip|\.tar|\.gz|\.py|\.pyc|\.ts|\.tsx|\.map)$/i;

function usage() {
  return `Usage: sh copy-plan.sh [--dry-run | --apply | --verify] [--pack ID] [--destination ISLAND_ROOT]

Default is --dry-run: validate every pinned Git blob and print the exact copy sizes.
--apply       Create assets/<pack>/ beneath ISLAND_ROOT; never overwrite differing files.
--verify      Require every planned destination file to exist with its audited bytes/hash.
--pack ID     Select one pack; repeat to select several. Default: all catalog packs.
--destination ISLAND_ROOT
              Default: <repository>/workout/island. Use a temporary directory for rehearsal.
--catalog FILE  Override catalog.json (useful for isolated verification).
--repo DIR      Git repository containing the catalog's pinned source commits.
--help          Show this message.

Only catalog-listed runtime payloads and license notices are copied. No network fetch is
performed. Fetch missing source commits using the command printed in an error, then retry.
Existing identical files are kept. Validation completes before any destination is created.
`;
}

function argumentsFor(argv) {
  const options = { mode: 'dry-run', packs: [], catalog: join(bundleRoot, 'catalog.json'), repo: defaultRepo };
  let explicitMode;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (['--dry-run', '--apply', '--verify'].includes(argument)) {
      const mode = argument.slice(2);
      if (explicitMode && explicitMode !== mode) throw new Error('Choose only one of --dry-run, --apply, --verify.');
      options.mode = explicitMode = mode;
      continue;
    }
    const match = /^(--pack|--destination|--catalog|--repo)(?:=(.*))?$/.exec(argument);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    const value = match[2] ?? argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${match[1]}.`);
    if (match[1] === '--pack') options.packs.push(value);
    else options[match[1].slice(2)] = value;
  }
  options.repo = resolve(options.repo);
  options.catalog = resolve(options.catalog);
  options.destination = resolve(options.destination ?? join(options.repo, 'workout/island'));
  return options;
}

function git(repo, args, binary = false) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: binary ? undefined : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function safePath(path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || /[\r\n]/.test(path)
      || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe ${label}: ${String(path)}`);
  }
  return path;
}

function checkedPayloadPath(path) {
  safePath(path, 'payload path');
  if (path.split('/').some(part => excludedSegments.test(part)) || excludedFile.test(path)) {
    throw new Error(`Excluded source, screenshot or unsupported payload: ${path}`);
  }
}

function checkedSourcePath(pack, asset) {
  // This GLB is a playable reference model, despite its location in the authoring tree.
  // Preserve an explicit, narrowly scoped audit exception rather than enabling source/.
  const runtimeReference = pack.id === 'tennis-motion-v2'
    && asset.path === 'reference/grip-player.glb'
    && asset.sourcePath === `${pack.source.root}/source/reference/grip-player.glb`
    && asset.copyNote === 'Runtime reference model remapped out of source/';
  if (runtimeReference) safePath(asset.sourcePath, 'runtime reference source');
  else checkedPayloadPath(asset.sourcePath);
}

function noSymlinks(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Refusing destination through a symbolic link: ${current}`);
    if (current !== absolute && !stat.isDirectory()) throw new Error(`Destination ancestor is not a directory: ${current}`);
  }
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sourceTree(repo, source) {
  if (!source || !objectId.test(source.commit)) throw new Error('Each pack needs a pinned 40-character source.commit.');
  safePath(source.root, 'source root');
  if (typeof source.branch !== 'string' || !/^codex\/[a-zA-Z0-9._/-]+$/.test(source.branch)) {
    throw new Error('Each pack needs a codex/ source branch.');
  }
  try { git(repo, ['cat-file', '-e', `${source.commit}^{commit}`]); }
  catch {
    throw new Error(`Missing pinned source commit ${source.commit}. Fetch before retrying:\ngit -C ${shellQuote(repo)} fetch origin ${source.commit}\nSource branch: ${source.branch}`);
  }
  const files = new Map();
  const listing = git(repo, ['ls-tree', '-r', '-z', '-l', source.commit, '--', source.root]);
  for (const record of listing.split('\0').filter(Boolean)) {
    const match = /^(\d+) blob ([a-f0-9]{40})\s+(\d+)\t([\s\S]+)$/.exec(record);
    if (match) files.set(match[4], { mode: match[1], blob: match[2], bytes: Number(match[3]) });
  }
  return files;
}

function preflight(options) {
  const catalog = JSON.parse(readFileSync(options.catalog, 'utf8'));
  if (catalog.schema !== 1 || !Array.isArray(catalog.packs)) throw new Error('Unsupported catalog; expected schema 1 with packs.');
  const ids = new Set();
  for (const pack of catalog.packs) {
    if (!pack || typeof pack.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id) || ids.has(pack.id)) {
      throw new Error(`Invalid or duplicate pack id: ${pack?.id}`);
    }
    ids.add(pack.id);
  }
  for (const id of options.packs) if (!ids.has(id)) throw new Error(`Unknown pack: ${id}`);
  const packs = catalog.packs.filter(pack => !options.packs.length || options.packs.includes(pack.id));
  const plans = [];
  const outputPaths = new Set();
  noSymlinks(options.destination);
  for (const pack of packs) {
    if (!Array.isArray(pack.assets)) throw new Error(`Missing assets list: ${pack.id}`);
    const tree = pack.assets.length ? sourceTree(options.repo, pack.source) : new Map();
    const files = [];
    for (const asset of pack.assets) {
      checkedPayloadPath(asset.path);
      checkedSourcePath(pack, asset);
      if (!asset.sourcePath.startsWith(`${pack.source.root}/`)) throw new Error(`Source outside audited pack root: ${asset.sourcePath}`);
      if (!objectId.test(asset.blob) || !sha256.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) {
        throw new Error(`Missing byte/hash provenance: ${pack.id}/${asset.path}`);
      }
      const source = tree.get(asset.sourcePath);
      if (!source || !['100644', '100755'].includes(source.mode) || source.blob !== asset.blob || source.bytes !== asset.bytes) {
        throw new Error(`Pinned Git tree does not match catalog: ${asset.sourcePath}`);
      }
      const destination = resolve(options.destination, 'assets', pack.id, asset.path);
      if (outputPaths.has(destination)) throw new Error(`Duplicate destination: ${destination}`);
      outputPaths.add(destination);
      noSymlinks(destination);
      const bytes = git(options.repo, ['cat-file', 'blob', asset.blob], true);
      if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`Byte/hash mismatch: ${asset.sourcePath}`);
      let exists = false;
      if (existsSync(destination)) {
        if (!lstatSync(destination).isFile()) throw new Error(`Destination is not a regular file: ${destination}`);
        const current = readFileSync(destination);
        if (current.length !== asset.bytes || digest(current) !== asset.sha256) throw new Error(`Refusing to overwrite differing file: ${destination}`);
        exists = true;
      } else if (options.mode === 'verify') throw new Error(`Missing destination file: ${destination}`);
      files.push({ asset, destination, bytes, exists });
    }
    plans.push({ pack, files, bytes: files.reduce((sum, file) => sum + file.bytes.length, 0) });
  }
  return plans;
}

function apply(plans) {
  for (const plan of plans) for (const file of plan.files) {
    if (file.exists) continue;
    noSymlinks(file.destination);
    mkdirSync(dirname(file.destination), { recursive: true });
    noSymlinks(file.destination);
    const fd = openSync(file.destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o644);
    try { writeFileSync(fd, file.bytes); }
    finally { closeSync(fd); }
  }
}

try {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) process.stdout.write(usage());
  else {
    const plans = preflight(options);
    if (options.mode === 'apply') apply(plans);
    for (const { pack, files, bytes } of plans) {
      process.stdout.write(`${options.mode.toUpperCase()} ${pack.id}: ${files.length} files, ${bytes} bytes -> ${join(options.destination, 'assets', pack.id)}\n`);
      if (pack.flag) process.stdout.write(`  Proposed URL flag: ${pack.flag}\n`);
      if (pack.available === false) process.stdout.write('  Availability: incomplete; runtime keeps its fallback.\n');
      if (pack.dependencies?.length) process.stdout.write(`  Dependencies (not added by this script): ${pack.dependencies.join('; ')}\n`);
      if (pack.missing?.length) process.stdout.write(`  Missing/integration work: ${pack.missing.join('; ')}\n`);
    }
    const count = plans.reduce((sum, plan) => sum + plan.files.length, 0);
    const bytes = plans.reduce((sum, plan) => sum + plan.bytes, 0);
    process.stdout.write(`TOTAL: ${plans.length} packs, ${count} files, ${bytes} bytes. ${options.mode === 'dry-run' ? 'No files written.' : options.mode === 'verify' ? 'All destination hashes verified.' : 'Copy complete.'}\n`);
  }
} catch (error) {
  process.stderr.write(`copy-plan: ${error.message}\n`);
  process.exitCode = 1;
}
