/** Official Khronos validation of the single, self-contained deliverable. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';
import assert from 'node:assert/strict';

const bytes = await readFile(new URL('./kid-full.glb', import.meta.url));
const validation = await validator.validateBytes(new Uint8Array(bytes), {
  uri: 'kid-full.glb', maxIssues: 100000,
  externalResourceFunction: () => Promise.reject(new Error('GLB must contain all resources')),
});
const expectedExpressions = ['happy', 'effort', 'surprised', 'victory', 'tired', 'thinking'];
const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().trim());
const facialMorphs = (json.meshes || []).filter(mesh => mesh.primitives.some(p => p.targets?.length)).map(mesh => ({
  name: mesh.name, expressionNames: mesh.extras?.targetNames,
  primitives: mesh.primitives.map(primitive => ({
    vertices: json.accessors[primitive.attributes.POSITION].count,
    targets: (primitive.targets || []).map(target => ({
      positionCount: json.accessors[target.POSITION]?.count,
      normalCount: json.accessors[target.NORMAL]?.count,
    })),
  })),
}));
const expressionFailures = [];
if (!facialMorphs.length) expressionFailures.push('No facial morph targets in delivered GLB');
for (const mesh of facialMorphs) {
  try { assert.deepEqual(mesh.expressionNames, expectedExpressions); }
  catch { expressionFailures.push(`${mesh.name}: expected six named expression morphs in stable order`); }
  for (const primitive of mesh.primitives) if (primitive.targets.length !== 6 || !primitive.targets.every(t => t.positionCount === primitive.vertices && t.normalCount === primitive.vertices)) expressionFailures.push(`${mesh.name}: every facial target needs complete POSITION and NORMAL accessors`);
}
const weightChannels = (json.animations || []).map(animation => ({ name: animation.name, facialWeightChannels: animation.channels.filter(channel => channel.target.path === 'weights').length }));
for (const animation of weightChannels) if (!animation.facialWeightChannels) expressionFailures.push(`${animation.name}: missing exported expression weight channel`);
const report = {
  validatorVersion: validator.version(),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  ...validation,
  expressions: { expectedExpressions, facialMorphs, animations: weightChannels, failures: expressionFailures, passed: expressionFailures.length === 0 },
};
await mkdir(new URL('./shots/', import.meta.url), { recursive: true });
await writeFile(new URL('./shots/glb-validation.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ version: report.validatorVersion, errors: validation.issues.numErrors, warnings: validation.issues.numWarnings, infos: validation.issues.numInfos, truncated: validation.issues.truncated, expressionChecksPassed: expressionFailures.length === 0, expressionFailures }, null, 2));
if (validation.issues.numErrors || validation.issues.truncated || expressionFailures.length) process.exitCode = 1;
