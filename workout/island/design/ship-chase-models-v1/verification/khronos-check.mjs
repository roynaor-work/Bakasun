// Original runner, CC0-1.0. The external Khronos validator is not redistributed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const flag = process.argv.indexOf('--modules');
const require = flag >= 0 ? createRequire(resolve(process.argv[flag + 1], 'package.json')) : createRequire(import.meta.url);
const validator = require('gltf-validator');
const folder = new URL('../', import.meta.url);
const results = [];
for (const file of (await readdir(new URL('runtime/', folder))).filter(f => f.endsWith('.glb')).sort()) {
  const bytes = await readFile(new URL(`runtime/${file}`, folder));
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: file, maxIssues: 1000 });
  results.push({ file: `runtime/${file}`, errors: result.issues.numErrors, warnings: result.issues.numWarnings, infos: result.issues.numInfos, messages: result.issues.messages });
}
await writeFile(new URL('verification/gltf-results.json', folder), JSON.stringify({ validator: 'Khronos glTF Validator', version: validator.version(), allPassed: results.every(r => r.errors === 0 && r.warnings === 0), results }, null, 2) + '\n');
console.table(results.map(({file, errors, warnings, infos}) => ({file, errors, warnings, infos})));
assert(results.every(r => r.errors === 0 && r.warnings === 0), 'all models must have zero validator errors and warnings');
