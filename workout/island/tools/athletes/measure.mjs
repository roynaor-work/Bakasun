/** Measurements of the unified athletes layer: gait tables (soccer reference, basketball before and after, tennis), the standard check, ball-hand shift,
 * the Codex QA formulas before and after (needs CODEX_QA), and the 8-frame sheets as SVG.
 *   node workout/island/tools/athletes/measure.mjs [outDir]
 * Output: measure.json, tables.md, sheets/*.svg */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {decodeTallPack} from '../../minigames/hoops-tall.mjs';
import {unifyTallPack, tallPlanFor, ballArm} from '../../minigames/athletes-gait.mjs';
import {normaliseTallClip, gaitMetrics, checkGait, checkStand, jointWorld, sampleCanonical, ATHLETE_STANDARD} from '../../minigames/athletes-core.mjs';
import {loadLibraries} from './load-libs.mjs';
const root = new URL('../../', import.meta.url);
const out = process.argv[2] || new URL('verification/unified-athletes-v1/', root).pathname;
mkdirSync(out + 'sheets', {recursive: true});
const rawPack = () => decodeTallPack(JSON.parse(readFileSync(new URL('assets/hoops-tall/motion.json', root), 'utf8')));
const donor = JSON.parse(readFileSync(new URL('assets/athletes-v1/gait-donor.json', root), 'utf8'));
const before = rawPack(), after = rawPack(), summary = unifyTallPack(after, donor);
const L = loadLibraries();
const tallClip = (pack, id) => normaliseTallClip(id, pack.clips[id], pack.fps);
const metricsOf = (clip, id) => gaitMetrics(clip, 40, {skip: /ball|dribble/.test(id) ? ballArm(clip) : null});
const result = {summary: {gait: summary.gait.length, cap: summary.cap.length}, gaits: [], stand: [], ballHand: [], standard: ATHLETE_STANDARD};
const GAITS = ['walk', 'jog', 'run', 'sprint'];
for (const g of GAITS) {
  const rows = [['soccer (reference)', L[g === 'run' ? 'soccer-v10' : 'soccer-v9'][g]], ['basketball before', tallClip(before, g)], ['basketball after', tallClip(after, g)], ['basketball with ball before', tallClip(before, g + '_ball')], ['basketball with ball after', tallClip(after, g + '_ball')]];
  for (const [label, clip] of rows) {
    const ball = label.includes('with ball'), m = metricsOf(clip, ball ? g + '_ball' : g);
    result.gaits.push({gait: g, label, armAbdMax: +m.armAbdMax.toFixed(1), swing: +m.swingRange.toFixed(0), elbow: +m.elbowMean.toFixed(0), lean: +m.lean.toFixed(1), fails: checkGait(m, g)});
  }
}
const standIds = ['idle_ready', 'idle_ready_ball', 'idle_relaxed', 'idle_weight_shift', 'brake', 'brake_ball', 'cut_90_left', 'cut_90_left_ball', 'cut_180_right', 'basket_cut_left', 'dribble_walk_right'];
for (const id of standIds) {
  const b = metricsOf(tallClip(before, id), id), a = metricsOf(tallClip(after, id), id);
  result.stand.push({id, before: +b.armAbdMax.toFixed(0), after: +a.armAbdMax.toFixed(0), fails: checkStand(a)});
}
// the hand that holds the ball must not leave the ball: how far the hand moved because of the trunk lean
for (const id of Object.keys(before.clips).filter(id => /ball|dribble/.test(id) && tallPlanFor(id))) {
  const A = tallClip(before, id), B = tallClip(after, id), arm = ballArm(A);
  let mx = 0; A.frames.forEach((f, i) => { const h = jointWorld({rot: f.rot, hips: f.hips})[arm + 'Hand'].p, g = jointWorld({rot: B.frames[i].rot, hips: B.frames[i].hips})[arm + 'Hand'].p; mx = Math.max(mx, Math.hypot(h[0] - g[0], h[1] - g[1], h[2] - g[2])); });
  result.ballHand.push({id, arm, maxShiftCm: +(mx * 100).toFixed(1)});
}
// every planned clip against the standard
result.allPlanned = {gait: [], stand: []};
for (const id of Object.keys(after.clips)) {
  const plan = tallPlanFor(id); if (!plan) continue;
  const m = metricsOf(tallClip(after, id), id);
  const fails = plan.kind === 'gait' ? checkGait(m, plan.gait) : checkStand(m);
  (plan.kind === 'gait' ? result.allPlanned.gait : result.allPlanned.stand).push({id, fails});
}
result.untouched = Object.keys(after.clips).filter(id => !tallPlanFor(id)).length;
// Codex formulas, relative (before and after the same clip, same metadata)
if (process.env.CODEX_QA) {
  const {loadAnalyze, score} = await import('./qa-bridge.mjs'), analyze = await loadAnalyze();
  result.codex = [];
  for (const id of ['walk', 'jog', 'run', 'sprint', 'run_ball', 'brake', 'cut_90_left', 'idle_ready']) {
    const b = score(analyze, tallClip(before, id), {height: 1.88}), a = score(analyze, tallClip(after, id), {height: 1.88});
    result.codex.push({id, before: b.score, after: a.score, coverage: a.coverage});
  }
}
// sheets
const BONE_LINES = [['Hips', 'Spine'], ['Spine', 'Chest'], ['Chest', 'Neck'], ['Neck', 'Head'], ['Chest', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['Chest', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot']];
const CELL = 120, PAD = 6;
function figure(clip, u, view, ox, oy, color) {
  const w = jointWorld(sampleCanonical(clip, u * clip.dur * (clip.loop ? 1 : .999))), hx = w.Hips.p[0], hz = w.Hips.p[2];
  const P = p => view === 'front' ? [ox + (p[0] - hx) * -70 + CELL / 2, oy + CELL - 8 - p[1] * 62] : [ox + (p[2] - hz) * 70 + CELL / 2, oy + CELL - 8 - p[1] * 62];
  let s = '';
  for (const [a, b] of BONE_LINES) { const A = P(w[a].p), B = P(w[b].p); const arm = /Arm|Hand/.test(a + b); s += `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${arm ? '#d4321f' : color}" stroke-width="${arm ? 3 : 2.4}" stroke-linecap="round"/>`; }
  const H = P(w.Head.p); s += `<circle cx="${H[0].toFixed(1)}" cy="${(H[1] - 4).toFixed(1)}" r="5" fill="${color}"/>`;
  return s;
}
function sheet(name, title, rows) {
  const width = 8 * CELL + 2 * PAD, labelW = 190, height = rows.length * (2 * CELL + 10) + 30;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + labelW}" height="${height}" viewBox="0 0 ${width + labelW} ${height}" font-family="Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="8" y="18" font-size="14" font-weight="bold">${title}</text>`;
  rows.forEach(([label, clip], r) => {
    const y0 = 28 + r * (2 * CELL + 10);
    s += `<text x="8" y="${y0 + CELL}" font-size="12">${label}</text><text x="8" y="${y0 + CELL + 14}" font-size="10" fill="#666">front / side</text>`;
    for (let k = 0; k < 8; k++) {
      const u = k / 8, ox = labelW + PAD + k * CELL;
      s += `<rect x="${ox}" y="${y0}" width="${CELL}" height="${2 * CELL}" fill="none" stroke="#ddd"/><line x1="${ox}" y1="${y0 + CELL - 8 + 0}" x2="${ox + CELL}" y2="${y0 + CELL - 8}" stroke="#ccc"/><line x1="${ox}" y1="${y0 + 2 * CELL - 8}" x2="${ox + CELL}" y2="${y0 + 2 * CELL - 8}" stroke="#ccc"/>`;
      s += figure(clip, u, 'front', ox, y0, '#222') + figure(clip, u, 'side', ox, y0 + CELL, '#222');
    }
  });
  writeFileSync(out + 'sheets/' + name + '.svg', s + '</svg>');
}
const S9 = L['soccer-v9'], S10 = L['soccer-v10'];
sheet('run', 'ריצה: 8 פריימים לאורך מחזור (זרועות באדום)', [['soccer run (reference)', S10.run], ['basketball run, before', tallClip(before, 'run')], ['basketball run, after', tallClip(after, 'run')], ['basketball run with ball, before', tallClip(before, 'run_ball')], ['basketball run with ball, after', tallClip(after, 'run_ball')]]);
sheet('sprint', 'Sprint', [['soccer sprint (reference)', S9.sprint], ['basketball sprint, before', tallClip(before, 'sprint')], ['basketball sprint, after', tallClip(after, 'sprint')]]);
sheet('brake', 'Braking', [['soccer run_brake (reference)', S9.run_brake], ['basketball brake, before', tallClip(before, 'brake')], ['basketball brake, after', tallClip(after, 'brake')]]);
sheet('cut', 'Cut 90 left', [['soccer cut_90_left (reference)', S10.cut_90_left], ['basketball cut_90_left, before', tallClip(before, 'cut_90_left')], ['basketball cut_90_left, after', tallClip(after, 'cut_90_left')]]);
sheet('idle', 'Idle', [['soccer idle_relaxed (reference)', S9.idle_relaxed], ['basketball idle_ready, before', tallClip(before, 'idle_ready')], ['basketball idle_ready, after', tallClip(after, 'idle_ready')]]);
writeFileSync(out + 'measure.json', JSON.stringify(result, null, 1));
const md = ['| gait | clip | arm out (max °) | swing (°) | elbow (°) | lean (°) | against the standard |', '|---|---|---:|---:|---:|---:|---|', ...result.gaits.map(r => `| ${r.gait} | ${r.label} | ${r.armAbdMax} | ${r.swing} | ${r.elbow} | ${r.lean} | ${r.fails.length ? r.fails.join('; ') : 'passes'} |`)];
writeFileSync(out + 'tables.md', md.join('\n') + '\n');
console.log(md.join('\n'));
console.log('stand', JSON.stringify(result.stand));
console.log('ballHand', JSON.stringify(result.ballHand));
console.log('planned fails', JSON.stringify([...result.allPlanned.gait, ...result.allPlanned.stand].filter(r => r.fails.length)));
console.log('codex', JSON.stringify(result.codex || null));
