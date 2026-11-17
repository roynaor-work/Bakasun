// Reject incomplete/stale browser results before publishing this review bundle.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = process.env.PHONE_FIX_EVIDENCE || path.join(bundle, 'evidence');
const json = name => JSON.parse(readFileSync(path.join(evidence, name), 'utf8'));
const clean = list => assert.deepEqual(list, []);
const regressions = json('regressions.json');
assert.equal(regressions.passed, true);
assert.ok(regressions.regressions.every(r => r.expected && r.signal === null));
const progression = json('C-progression.json');
for (const mode of ['baseline', 'after', 'rollback']) assert.equal(progression[mode].wins, 90);
const modern = json('C-progression-integrated.json');
assert.equal(modern.runs, 90); assert.equal(modern.wins, 90);
for (const name of ['apply-safety.tap', 'C-progression-integrated.tap']) {
  const text = readFileSync(path.join(evidence, name), 'utf8');
  assert.match(text, /^# fail 0$/m); assert.match(text, /^# pass [1-9]\d*$/m);
}
for (const mode of ['before', 'after', 'rollback', 'global-rollback']) {
  const b = json(`B-${mode}-browser.json`);
  assert.equal(b.pass, mode !== 'before');
  clean(b.pageerrors); clean(b.wasmRequests); clean(b.cspViolations);
}
const c = json('C-browser-results.json');
assert.equal(c.reports.length, 4);
for (const r of c.reports) {
  clean(r.pageErrors); clean(r.wasmRequests); clean(r.cspViolations);
  assert.deepEqual(r.viewport, {width:844,height:390}); assert.equal(r.hasTouch, true);
  assert.equal(r.WebAssemblyAvailable, 'undefined');
  if (r.mode === 'after') {
    assert.equal(r.rearDamage, 0); assert.equal(r.shotsRemaining, 0);
    assert.ok(r.frontDamage > 2, 'Final laser upgrade compensation must be present in browser evidence.');
    assert.equal(r.hits, 1); assert.equal(r.impactCountAtContact, 1);
  } else { assert.equal(r.rearDamage, 1); assert.equal(r.hits, 2); }
}
for (const mode of ['before', 'after', 'rollback', 'individual']) {
  const ad = json(`AD-${mode}-browser.json`); assert.equal(ad.cases.length, 2);
  for (const r of ad.cases) {
    clean(r.errors); clean(r.wasmRequests); assert.equal(r.wasmCalls, 0);
    if (r.game === 'A') assert.equal(r.wasmAvailable, false);
    if (mode === 'after') assert.equal(r.desiredPass, true);
    else assert.equal(r.legacyPass, true);
  }
}
const e = json('E-after-browser.json'); assert.equal(e.cases.length, 3);
assert.ok(e.assertions.length >= 10 && e.assertions.every(a => a.passed));
for (const r of e.cases) { clean(r.errors); clean(r.wasmRequests); clean(r.served.csp); }
const f = json('F-after-browser.json'); assert.equal(f.cases.length, 3);
assert.ok(f.assertions.length >= 11 && f.assertions.every(a => a.pass));
for (const r of f.cases) { clean(r.errors); clean(r.wasm); clean(r.failed); }
for (const name of ['repository-baseline.log', 'repository-after.log']) {
  const text = readFileSync(path.join(evidence, name), 'utf8');
  assert.match(text, /ℹ fail 0\b|^# fail 0$/m); assert.doesNotMatch(text, /^✖|^not ok /m);
}
const screenshots = readdirSync(evidence).filter(name => name.endsWith('.png'));
for (const name of screenshots) {
  const bytes = readFileSync(path.join(evidence, name));
  assert.equal(bytes.readUInt32BE(16), 844, name); assert.equal(bytes.readUInt32BE(20), 390, name);
}
const manifest = JSON.parse(readFileSync(path.join(bundle, 'manifest.json')));
for (const p of manifest.patches) assert.equal(createHash('sha256').update(readFileSync(path.join(bundle, p.file))).digest('hex'), p.sha256);
const result = {base:manifest.base, passed:true, modelAfter:regressions.regressions.filter(r => r.mode === 'after').reduce((n,r) => n+r.pass, 0),
  progressionWins:modern.wins, screenshots:screenshots.length, browserViewport:{width:844,height:390}, noNewWasm:true,
  existingBasketballWasmDependency:true, patches:manifest.patches.map(p => ({id:p.id,sha256:p.sha256}))};
writeFileSync(path.join(evidence, 'AUDIT.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
