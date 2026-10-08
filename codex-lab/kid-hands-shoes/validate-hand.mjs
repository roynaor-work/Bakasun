import { writeFile, mkdir } from 'node:fs/promises';
import { createHand } from './hand.js';

// Run from any working directory: node codex-lab/kid-hands-shoes/validate-hand.mjs
const records = ['open', 'fist', 'wave'].map((pose) => {
  const hand = createHand(pose);
  const geometry = hand.children[0].geometry;
  const report = {
    pose,
    revision: 'final',
    ...hand.userData.validation,
    geometryBuildMs: Number(hand.userData.buildMs.toFixed(2)),
    bounds: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() },
  };
  geometry.dispose(); hand.children[0].material.dispose();
  return report;
});
const report = {
  measuredAt: new Date().toISOString(),
  environment: `Node ${process.version}; procedural geometry, no renderer`,
  note: 'geometryBuildMs excludes topology validation; browser construction/FPS are measured separately in shots/metrics.json',
  pass: records.every((record) => record.continuousSurface),
  records,
};
const text = JSON.stringify(report, null, 2) + '\n';
await mkdir(new URL('./work/', import.meta.url), {recursive:true});
await writeFile(new URL('./work/hand-validation.json', import.meta.url), text);
console.log(text);
if (!report.pass) process.exitCode = 1;
