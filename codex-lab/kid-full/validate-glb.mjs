/** Official Khronos validation of the single, self-contained deliverable. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';

const bytes = await readFile(new URL('./kid-full.glb', import.meta.url));
const validation = await validator.validateBytes(new Uint8Array(bytes), {
  uri: 'kid-full.glb', maxIssues: 100000,
  externalResourceFunction: () => Promise.reject(new Error('GLB must contain all resources')),
});
const report = {
  validatorVersion: validator.version(),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  ...validation,
};
await mkdir(new URL('./shots/', import.meta.url), { recursive: true });
await writeFile(new URL('./shots/glb-validation.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ version: report.validatorVersion, errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, truncated: validation.issues.truncated }, null, 2));
if (validation.issues.numErrors || validation.issues.truncated) process.exitCode = 1;
