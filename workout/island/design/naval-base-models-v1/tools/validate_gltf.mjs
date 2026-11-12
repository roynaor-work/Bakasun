// Optional independent Khronos validation. Install outside the repository:
// npm install --prefix /tmp/naval-base-validator gltf-validator@2.0.0-dev.3.10
// node tools/validate_gltf.mjs /tmp/naval-base-validator/node_modules/gltf-validator
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const validator = require(process.argv[2] || 'gltf-validator');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const reports = [];
for (const asset of manifest.assets || manifest.models) {
  const filename = asset.file || asset.path;
  const bytes = new Uint8Array(await readFile(path.join(root, filename)));
  const result = await validator.validateBytes(bytes, { uri: filename, maxIssues: 100 });
  reports.push({
    id: asset.id, file: filename, bytes: bytes.length,
    errors: result.issues.numErrors, warnings: result.issues.numWarnings,
    infos: result.issues.numInfos, hints: result.issues.numHints,
    messages: result.issues.messages, info: result.info,
  });
}
const output = {
  validator: 'Khronos glTF-Validator', version: validator.version(),
  assets: reports.length,
  errors: reports.reduce((sum, item) => sum + item.errors, 0),
  warnings: reports.reduce((sum, item) => sum + item.warnings, 0),
  reports,
};
await writeFile(path.join(root, 'verification/gltf-validation.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ validator: output.version, assets: output.assets, errors: output.errors, warnings: output.warnings }));
if (output.errors || output.warnings) process.exitCode = 1;
