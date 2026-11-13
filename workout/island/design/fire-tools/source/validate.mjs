// Khronos validator: optional first argument is an absolute gltf-validator module path.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const validator = await import(process.argv[2] || 'gltf-validator');
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const reports = [];
for (const model of manifest.models) {
  const bytes = await fs.readFile(new URL(model.file, root));
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: model.file });
  delete result.validatedAt;
  reports.push({ file: model.file, ...result });
  console.log(`${model.file}: ${result.issues.numErrors} errors, ${result.issues.numWarnings} warnings`);
}
const output = new URL('gltf-validation.json', root);
await fs.writeFile(output, JSON.stringify(reports, null, 2) + '\n');
console.log(fileURLToPath(output));
if (reports.some(report => report.issues.numErrors || report.issues.numWarnings)) process.exitCode = 1;
