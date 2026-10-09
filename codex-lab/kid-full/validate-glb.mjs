/** Official Khronos validation of the single, self-contained deliverable. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';
import { EXPRESSION_IDS } from './expressions.mjs';

const bytes = await readFile(new URL('./kid-full.glb', import.meta.url));
const validation = await validator.validateBytes(new Uint8Array(bytes), {
  uri: 'kid-full.glb', maxIssues: 100000,
  externalResourceFunction: () => Promise.reject(new Error('GLB must contain all resources')),
});
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().trim());
const morphMeshes = (json.meshes || []).filter(mesh => mesh.primitives.some(p => p.targets?.length));
const expressionErrors = [];
if (!morphMeshes.length) expressionErrors.push('GLB has no expression morph meshes');
for (const mesh of morphMeshes) {
  if (mesh.extras?.targetNames?.join(',') !== EXPRESSION_IDS.join(',')) expressionErrors.push(`${mesh.name}: six named morph targets missing`);
  for (const primitive of mesh.primitives) if (primitive.targets?.length !== 6 || primitive.targets.some(target => target.POSITION === undefined || target.NORMAL === undefined)) expressionErrors.push(`${mesh.name}: incomplete position/normal expression targets`);
}
for (const animation of json.animations || []) if (!animation.channels.some(c => c.target.path === 'weights')) expressionErrors.push(`${animation.name}: no morph weight animation`);
const report = {
  validatorVersion: validator.version(),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  ...validation,
  expressionTargets: { required: EXPRESSION_IDS, meshNames: morphMeshes.map(m => m.name), errors: expressionErrors },
};
await mkdir(new URL('./shots/', import.meta.url), { recursive: true });
await writeFile(new URL('./shots/glb-validation.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ version: report.validatorVersion, errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, truncated: validation.issues.truncated, expressionErrors }, null, 2));
if (validation.issues.numErrors || validation.issues.truncated || expressionErrors.length) process.exitCode = 1;
