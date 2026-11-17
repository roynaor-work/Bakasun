import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(bundle, '../../../..');
const base = '43b27dc235387e3cb737aee9558cdf9d5fd5a262';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const patches = readdirSync(path.join(bundle, 'patches')).filter(name => /^[A-F]-.*\.patch$/.test(name)).sort().map(name => {
  const bytes = readFileSync(path.join(bundle, 'patches', name));
  const targets = [...bytes.toString().matchAll(/^--- a\/(.+)$/gm)].map(([, file]) => ({
    file,
    sha256: hash(execFileSync('git', ['show', `${base}:${file}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 })),
  }));
  if (!targets.length) throw Error(`No existing source targets in ${name}`);
  return { id: name[0], flag: `phoneFix${name[0]}`, file: `patches/${name}`, sha256: hash(bytes), targets };
});
if (patches.map(p => p.id).join('') !== 'ABCDEF') throw Error('Exactly one patch A through F is required.');
writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ base, rollback: 'phoneFixes=0', patches }, null, 2) + '\n');
console.log(`Pinned ${patches.length} patches against ${base}`);
