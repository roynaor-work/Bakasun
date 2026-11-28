// SPDX-License-Identifier: CC0-1.0
// Prints the measurement tables of REPORT.md (markdown) from verification/measurements.json, to paste or redirect.
import fs from 'node:fs/promises';
const m = JSON.parse(await fs.readFile(new URL('../verification/measurements.json', import.meta.url)));
const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v);
const lines = ['| קליפ | GLB | משך | כניסה מ׳/ש | חלונות | החלקה מרבית ס״מ | סטיית גובה ס״מ | ברך | מרפק | ירך | פער רגליים מ׳ | נטיית גו |', '|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|'];
for (const c of m.clips) {
  const a = c.anatomy;
  lines.push(`| ${c.id.replace('hoops_', '')} | ${c.glb ? 'כן' : 'לא'} | ${f(c.durationSeconds)} | ${c.entrySpeedMps ?? ''} | ${c.windows} | ${f(c.slideCmMax, 3)} | ${f(c.floorDevCmMax, 2)} | ${f(a.kneeFlexMin, 0)}..${f(a.kneeFlexMax, 0)} | ${f(a.elbowFlexMin, 0)}..${f(a.elbowFlexMax, 0)} | ${f(a.hipFlexMin, 0)}..${f(a.hipFlexMax, 0)} | ${f(a.legGapMin)} | ${f(a.trunkLeanMax, 0)} |`);
}
lines.push('', '| GLB | בתים | ציון החלקה ב־GLB ס״מ | פער סיבוב מול motions.json (מעלות) | SHA מתאים |', '|---|---:|---:|---:|---|');
for (const g of m.glbEquivalence) lines.push(`| ${g.id.replace('hoops_', '')} | ${g.bytes} | ${f(g.glbSlideCmMax, 3)} | ${g.maxRotationDegVsMotions} | ${g.shaMatches ? 'כן' : 'לא'} |`);
lines.push('', '| קליפ | כיוון | ייחוס | שלב | קפיצת עצם בקצה (מעלות) | צעד מרבי ב־240 הרץ (מעלות) | עבר |', '|---|---|---|---|---:|---:|---|');
for (const b of m.bridges) lines.push(`| ${b.id.replace('hoops_', '')} | ${b.direction === 'entry' ? 'כניסה' : 'יציאה'} | ${b.declaredReference} | ${b.phaseKind} | ${Math.max(b.endpointStartDeg, b.endpointEndDeg).toFixed(6)} | ${b.maxStep240Deg} | ${b.pass ? 'כן' : 'לא'} |`);
console.log(lines.join('\n'));
