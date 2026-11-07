// Pinhole simulation: a 120 cm child at distance d from a portrait phone.
// Not a phone measurement; it shows what the placement logic decides at each distance.
// Usage: node workout/cam-lab/tools/range-sim.mjs [vFovDeg=63] [camHeightCm=70]
import { placementDistance } from '../placement.mjs';
import { bodyReport } from '../counter.mjs';
const vFov = Number(process.argv[2] || 63), camH = Number(process.argv[3] || 70), H = 120, aspect = .75;
const tv = Math.tan(vFov * Math.PI / 360), th = tv * aspect;
// landmark id -> [height fraction of body, lateral fraction (+ = child's image right)]
const BODY = { 0: [.93, 0], 7: [.94, -.04], 8: [.94, .04], 11: [.82, -.1], 12: [.82, .1], 13: [.66, -.14], 14: [.66, .14],
  15: [.52, -.15], 16: [.52, .15], 23: [.52, -.06], 24: [.52, .06], 25: [.28, -.06], 26: [.28, .06], 27: [.04, -.07], 28: [.04, .07] };
export function project(d, { x = 0, arms = null } = {}) {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: .05, presence: .05 }));
  for (const [i, [h, l]] of Object.entries(BODY)) {
    let hh = h * H, ll = l * H;
    if (arms && [13, 14, 15, 16].includes(+i)) { hh = (i < 15 ? 1.05 : 1.25) * H * 1; ll = (i % 2 ? 1 : -1) * (i < 15 ? .3 : .45) * H; }
    const px = .5 + (x + ll) / (d * 200 * th), py = .5 - (hh - camH) / (d * 200 * tv);
    const inside = px >= 0 && px <= 1 && py >= 0 && py <= 1;
    Object.assign(p[i], { x: px, y: py, visibility: inside ? 1 : .05, presence: inside ? 1 : .05 });
  }
  return p;
}
const truth = d => { const p = project(d), pts = [0, 27, 28].map(i => p[i]);
  const full = pts.every(q => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1); const span = p[27].y - p[0].y;
  return full ? (span < .24 ? 'closer' : span > .85 ? 'away' : null) : (p[27].y > 1 || p[0].y < 0 ? 'away' : 'closer'); };
const rows = [], ds = []; for (let d = .5; d <= 6.01; d += .25) ds.push(+d.toFixed(2));
const summary = { before: [], after: [], squats: [], 'jumping-jacks': [], 'high-knees': [] };
for (const d of ds) {
  const p = project(d), pa = project(d, { arms: true });
  const old = placementDistance(p, { aspect, range: false }), neu = placementDistance(p, { aspect });
  const t = truth(d), name = v => v ?? 'בטווח';
  const guided = r => r.span != null && (r.direction ?? null) === t;
  const okOld = guided(old), okNew = guided(neu);
  if (okOld) summary.before.push(d); if (okNew) summary.after.push(d);
  for (const ex of ['squats', 'jumping-jacks', 'high-knees']) {
    const pts = ex === 'jumping-jacks' ? pa : p;
    if (bodyReport(pts, aspect, ex).ok && (ex !== 'jumping-jacks' || [13, 14, 15, 16].every(i => pa[i].visibility > .5))) summary[ex].push(d);
  }
  rows.push(`| ${d.toFixed(2)} | ${name(t)} | ${old.span == null ? 'שקט (אין הוראה)' : name(old.direction)} | ${name(neu.direction)}${neu.partial ? ' (חלקי)' : ''} |`);
}
const rng = a => a.length ? `${a[0]}–${a.at(-1)} מ׳ (${a.length} מתוך ${ds.length} נקודות)` : 'אין';
console.log(`זווית אנכית ${vFov}°, מצלמה בגובה ${camH} ס״מ, ילד ${H} ס״מ\n`);
console.log('| מרחק (מ׳) | האמת | לפני | אחרי |\n|---|---|---|---|\n' + rows.join('\n'));
console.log(`\nהוראה נכונה (או "בטווח" נכון): לפני ${rng(summary.before)}; אחרי ${rng(summary.after)}`);
for (const ex of ['squats', 'jumping-jacks', 'high-knees']) console.log(`נקודות החובה נראות, ${ex}: ${rng(summary[ex])}`);
