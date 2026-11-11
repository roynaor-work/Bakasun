// Original island circuits. Distances are metres, Y is up, heading 0 faces +Z.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, length) => ((v % length) + length) % length;
export const RACING_TRACK_SCALE = 1.65;
export const RACING_LOOK = new URLSearchParams(globalThis.location?.search || '').get('racingLook') !== '0';


// racing-v10: Formula 1 style circuits. A circuit is a polygon of braking points [x, z, radius]; every corner is filleted with an arc of that radius,
// so straights, hairpins, chicanes (two close corners of opposite hand) and fast sweepers come from the layout itself. Metres, before the 1.65 scale
// is divided out again so the existing scaling pipeline keeps working. ?racingTracks=v1 (or config.tracks) selects the previous circuits.
function filletCircuit(vertices, step, elevation) {
  const n = vertices.length, arcs = vertices.map((vertex, i) => {
    const P = vertices[(i + n - 1) % n], N = vertices[(i + 1) % n], [vx, vz, R] = vertex;
    let ux = P[0] - vx, uz = P[1] - vz, wx = N[0] - vx, wz = N[1] - vz;
    const lu = Math.hypot(ux, uz), lw = Math.hypot(wx, wz); ux /= lu; uz /= lu; wx /= lw; wz /= lw;
    const theta = Math.acos(clamp(ux * wx + uz * wz, -1, 1));
    const t = Math.min(R / Math.tan(theta / 2), .48 * Math.min(lu, lw)), radius = t * Math.tan(theta / 2);
    const A = [vx + ux * t, vz + uz * t], B = [vx + wx * t, vz + wz * t];
    let bx = ux + wx, bz = uz + wz; const lb = Math.hypot(bx, bz), dc = radius / Math.sin(theta / 2), C = [vx + bx / lb * dc, vz + bz / lb * dc];
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]); let d = Math.atan2(B[1] - C[1], B[0] - C[0]) - a0;
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    return { A, B, C, radius, a0, d };
  });
  const out = [];
  arcs.forEach((arc, i) => {
    const m = Math.max(3, Math.ceil(Math.abs(arc.d) * arc.radius / step));
    for (let k = 0; k <= m; k++) { const a = arc.a0 + arc.d * k / m; out.push([arc.C[0] + Math.cos(a) * arc.radius, arc.C[1] + Math.sin(a) * arc.radius]); }
    const next = arcs[(i + 1) % n], length = Math.hypot(next.A[0] - arc.B[0], next.A[1] - arc.B[1]), parts = Math.floor(length / 26);
    for (let k = 1; k < parts; k++) out.push([arc.B[0] + (next.A[0] - arc.B[0]) * k / parts, arc.B[1] + (next.A[1] - arc.B[1]) * k / parts]);
  });
  // drop points that sit closer than 8 m to the previous one (two corners joined without a straight would otherwise make a cusp)
  for (let i = out.length - 1; i > 0; i--) if (Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]) < 8) out.splice(i, 1);
  // start in the middle of the last straight, so the grid sits on the main straight
  const last = arcs[n - 1], next = arcs[0], gap = Math.hypot(next.A[0] - last.B[0], next.A[1] - last.B[1]);
  let startIndex = 0, best = Infinity; const mid = [(last.B[0] + next.A[0]) / 2, (last.B[1] + next.A[1]) / 2];
  out.forEach((q, i) => { const d = Math.hypot(q[0] - mid[0], q[1] - mid[1]); if (d < best) { best = d; startIndex = i; } });
  const ring = out.slice(startIndex).concat(out.slice(0, startIndex)), x0 = ring[0][0], z0 = ring[0][1];
  // racing-look-v1: the road must never sink under the island surface (inland top -0.5, shore -1.0): at those spots the grass covered the asphalt.
  // Lift the whole circuit so its lowest point is 1 m; ?racingLook=0 keeps the old heights.
  const heights = ring.map((_, i) => elevation(i / ring.length)), lift = RACING_LOOK ? Math.max(0, 1 - Math.min(...heights)) : 0;
  return ring.map(([x, z], i) => [(x - x0) / RACING_TRACK_SCALE, heights[i] + lift, (z - z0) / RACING_TRACK_SCALE]);
}
const F1_TRACKS = {
  coast: { name: 'מפרץ הדקלים · גרנד פרי', width: 19.5, samples: 10, f1: true,
    vertices: [[345,0,420],[644,0,63],[736,173,44],[598,299,172],[391,290,40],[320,400,34],[385,500,50],[138,540,104],[-46,380,52],[-69,150,69]],
    elevation: f => 2 + 3 * Math.sin(f * TAU) + 1.5 * Math.sin(f * TAU * 3) },
  harbor: { name: 'רציף המרינה · גרנד פרי', width: 18.5, samples: 10, f1: true,
    vertices: [[0,0,120],[430,0,420],[490,-30,46],[560,14,46],[700,0,80],[810,162,38],[634,230,38],[580,405,32],[338,445,60],[270,270,32],[54,351,68],[-54,202,40]],
    elevation: f => 2 + 1.2 * Math.sin(f * TAU * 2) },
  ruins: { name: 'גני העתיקות · גרנד פרי', width: 18, samples: 10, f1: true,
    vertices: [[240,0,120],[648,0,84],[744,240,31],[576,312,84],[564,516,36],[360,564,29],[300,396,43],[120,456,60],[-60,312,34],[48,144,54]],
    elevation: f => 3 + 3 * Math.sin(f * TAU) + 1.5 * Math.sin(f * TAU * 2.5) }
};
// racing-look-v1 (Roy 07/11: "the car sits at top speed all the time"): the circuits must force braking and re-acceleration. Corners with a large radius
// (over 46 m: the car takes them flat out) are tightened to a 46 m limit at most, and every straight longer than 210 m gets a dog-leg (two opposite
// corners, a chicane) so only short straights remain. Off with ?racingLook=0 (the v10 circuits).
function tuneCircuit(vertices, { maxRadius = 46, straight = 230, offset = 20, kink = 40 } = {}) {
  const n = vertices.length, out = [];
  vertices.forEach((v, i) => {
    out.push([v[0], v[1], Math.min(v[2], maxRadius)]);
    const w = vertices[(i + 1) % n], dx = w[0] - v[0], dz = w[1] - v[1], len = Math.hypot(dx, dz), parts = Math.floor(len / straight);
    if (parts < 1) return;
    const nx = -dz / len, nz = dx / len;
    // one dog-leg per 'straight' metres, never closer than 70 m to a corner
    for (let k = 0; k < parts; k++) {
      const c = (k + .5) / parts, a = Math.max(70 / len, c - 55 / len), b = Math.min(1 - 70 / len, c + 55 / len), sign = (i + k) % 2 ? 1 : -1;
      if (b <= a) continue;
      out.push([v[0] + dx * a + nx * offset * sign, v[1] + dz * a + nz * offset * sign, kink]);
      out.push([v[0] + dx * b - nx * offset * sign, v[1] + dz * b - nz * offset * sign, kink]);
    }
  });
  return out;
}
for (const [id, spec] of Object.entries(F1_TRACKS)) spec.points = filletCircuit(RACING_LOOK ? tuneCircuit(spec.vertices) : spec.vertices, 20, spec.elevation);

const CLASSIC_LIST = [
  { id: 'coast', name: 'מפרץ הדקלים', theme: 'coast', width: 16, landmark: 'lighthouse',
    points: [[0,1,0],[60,2,35],[150,3,45],[220,4,5],[245,5,-80],[210,4,-150],[145,2,-175],[95,1,-140],[35,1,-160],[-35,2,-115],[-55,2,-45]] },
  { id: 'jungle', name: 'שבילי הג׳ונגל', theme: 'jungle', width: 15, landmark: 'waterfall',
    points: [[0,2,0],[75,3,30],[155,6,10],[190,9,-60],[135,11,-115],[165,8,-185],[105,5,-245],[25,3,-225],[-40,4,-175],[-5,6,-100],[-62,5,-70],[-50,4,-25]] },
  { id: 'volcano', name: 'טבעת הלוע', theme: 'volcano', width: 15, landmark: 'volcano',
    points: [[0,4,0],[80,7,10],[160,11,-30],[215,15,-100],[195,18,-185],[120,15,-230],[35,11,-215],[-40,8,-165],[-65,5,-90],[-35,4,-35]] },
  { id: 'harbor', name: 'רציף המרינה', theme: 'harbor', width: 15.5, landmark: 'harbor',
    points: [[0,2,0],[90,2,12],[185,3,0],[220,4,-50],[205,4,-115],[140,3,-125],[110,3,-180],[45,2,-205],[-30,2,-175],[-60,3,-125],[-30,3,-85],[-55,2,-50],[-30,2,-15]] },
  { id: 'summit', name: 'פסגת העננים', theme: 'summit', width: 14.5, landmark: 'bridge',
    points: [[0,3,0],[80,7,40],[160,13,5],[175,18,-65],[120,21,-115],[155,18,-185],[90,12,-240],[10,8,-215],[-60,5,-165],[-85,4,-80],[-50,3,-25]] },
  { id: 'ruins', name: 'גני העתיקות', theme: 'ruins', width: 15, landmark: 'temple',
    points: [[0,2,0],[75,3,30],[145,4,-5],[125,5,-70],[200,7,-110],[195,8,-185],[115,6,-225],[35,4,-195],[-35,3,-220],[-85,3,-160],[-75,2,-90],[-50,2,-35]] }
];
const freezeTrack = (track) => Object.freeze({ ...track, points: Object.freeze(track.points.map(([x,y,z]) => Object.freeze([x*RACING_TRACK_SCALE,y,z*RACING_TRACK_SCALE]))) });
/** The circuits before racing-v10 (also what ?racingTracks=v1 selects). */
export const CLASSIC_TRACKS = Object.freeze(CLASSIC_LIST.map(freezeTrack));
const TRACKS_PARAM = new URLSearchParams(globalThis.location?.search || '').get('racingTracks');
// racing-deep-m2 (11/11/2026): the Codex v2 circuits are the default set. Measured with tools/racing-topspeed.mjs: on the f1 set a skilled driver spent 57-100% of the lap
// above 95% of top speed (volcano, summit and jungle were the gentle classic curves), on v2 0-5% with 50-70% of the lap under 85%. ?racingTracks=f1 restores the previous
// default (the v10 polygons with tuneCircuit), ?racingTracks=v1 the circuits before racing-v10.
export const RACING_TRACK_SET = TRACKS_PARAM === 'v1' ? 'v1' : TRACKS_PARAM === 'f1' ? 'f1' : 'v2';
// racing-tracks-v2 (Codex, design/racing-tracks-v2): six circuits, opt-in with ?racingTracks=v2. Loaded only on that flag (top-level await), so the normal start-up
// does not fetch the 72 KB data file. The data is 7.5 m wide with 12 m corners, so the app calibrates it: X/Z scale and road width (V2_SCALE, V2_WIDTH),
// the same one-metre lift as the v10 circuits, and the original theme/landmark of each stage.
const V2_SCALE = Number(new URLSearchParams(globalThis.location?.search || '').get('v2scale')) || 0.9, V2_WIDTH = Number(new URLSearchParams(globalThis.location?.search || '').get('v2width')) || 16;
const CODEX_V2 = RACING_TRACK_SET === 'v2' ? (await import('../design/racing-tracks-v2/tracks.mjs')).default : null;
// racing-deep-m2: the longest straight of every v2 circuit stays straight (the main straight with the grid, the pits and the only place to reach top speed, like a
// Formula 1 pit straight); every other long straight still gets its chicane. ?racingKinkAll=1 kinks the main straight too, as the 07/11 build did.
const KINK_ALL = new URLSearchParams(globalThis.location?.search || '').get('racingKinkAll') === '1';
const KINK_FADE = Number(new URLSearchParams(globalThis.location?.search || '').get('racingKinkFade')) || 20;
// ?racingKink=0: the raw Codex geometry without any chicane (measurement only)
const NO_KINK = new URLSearchParams(globalThis.location?.search || '').get('racingKink');
// ?racingShortKink=0: no S on the medium straights (the 07/11 geometry apart from the main straight)
// radius (raw metres) at the peaks of the S on a medium straight; 11 measured: a skilled driver 47-59% of the lap under 85% of top speed on all six circuits (?racingShortR= to tune)
const SHORT_R = Number(new URLSearchParams(globalThis.location?.search || '').get('racingShortR')) || 11;
const SHORT_KINK = new URLSearchParams(globalThis.location?.search || '').get('racingShortKink') !== '0';
// Dog-legs for the long straights of the Codex circuits that a good driver still took flat out: a straight longer than `min` metres
// gets whole periods of a sine offset (about 22 m radius at this amplitude), faded to zero 30 m from each end. Units: metres before the 1.65 scale.
const V2_KINK = new Set(['coast', 'jungle', 'volcano', 'harbor', 'summit', 'ruins']);
/** Runs of collinear control points (heading change under .006 rad between neighbours): [{run:[indices], d:[cumulative metres], length}]. */
function straightRuns(points) {
  const n = points.length, wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const heading = i => { const a = points[i], b = points[(i + 1) % n]; return Math.atan2(b[0] - a[0], b[2] - a[2]); };
  const straight = Array.from({ length: n }, (_, i) => Math.abs(wrapA(heading(i) - heading((i + n - 1) % n))) < .006);
  const start = straight.findIndex(v => !v), runs = [], seen = new Set(); if (start < 0) return runs;
  for (let k = 0; k < n; k++) {
    const idx = (start + k) % n; if (!straight[idx] || seen.has(idx)) continue;
    const run = []; for (let j = idx; straight[j % n] && run.length < n && !seen.has(j % n); j++) { run.push(j % n); seen.add(j % n); }
    const d = [0]; for (let j = 1; j < run.length; j++) d.push(d[j - 1] + Math.hypot(points[run[j]][0] - points[run[j - 1]][0], points[run[j]][2] - points[run[j - 1]][2]));
    runs.push({ run, d, length: d[d.length - 1], heading: heading(run[0]) });
  }
  return runs;
}
function kinkStraights(points, { min = 110, period: fullPeriod = 70, amp: fullAmp = 10.5, margin = 22, keepLongest = !KINK_ALL, short = SHORT_KINK ? 78 : Infinity } = {}) {
  const out = points.map(p => p.slice()), runs = straightRuns(points);
  const longest = runs.reduce((best, r) => r.length > (best?.length || 0) ? r : best, null);
  for (const { run, d, length, heading: h } of runs) {
    if (length < Math.min(min, short) || (keepLongest && run === longest?.run)) continue;
    // racing-deep-m2: a medium straight (78-110 m raw, 115-165 m on the island) gets one gentler S (the same 13 m raw radius at the sine peaks as the long ones);
    // without it a skilled driver spent only 31-38% of the lap under 85% of top speed on jungle and volcano (target 40%).
    const period = length >= min ? fullPeriod : Math.min(fullPeriod, length - 2 * margin), amp = length >= min ? fullAmp : Math.min(fullAmp, (period / (2 * Math.PI)) ** 2 / SHORT_R);
    const periods = Math.floor((length - 2 * margin) / period); if (periods < 1 || period < 30) continue;
    const from = (length - periods * period) / 2, nx = Math.cos(h), nz = -Math.sin(h);
    // racing-deep-m2: a C1 fade (raised cosine over 20 m) instead of the linear min(1, u/15, ...) hinge. The hinge put a 0.6 rad cusp (radius about 5 m) in the centre line
    // at both ends of every chicane; the projection of a car 5 m inside such a cusp jumped 2-4 m in one frame, the gate sweep called it implausible and a drifting player
    // lost gate 8 of coast for good (recovery loop every 12 s in the measurement bot).
    const fade = u => { const r = Math.min(1, u / KINK_FADE, (periods * period - u) / KINK_FADE); return .5 - .5 * Math.cos(Math.PI * r); };
    for (let j = 0; j < run.length; j++) { const u = d[j] - from; if (u <= 0 || u >= periods * period) continue; const off = amp * Math.sin(2 * Math.PI * u / period) * fade(u); out[run[j]][0] += nx * off; out[run[j]][2] += nz * off; }
  }
  return out;
}
/** racing-deep-m2: the start/finish line sits on the main straight (62% of the way along it, so the grid of twelve stands on the straight behind the line and the
 * pit exit still has 38% of it ahead). The control points are rotated (a closed Catmull-Rom loop keeps its exact shape) and rebased to the new first point. */
function startOnMainStraight(points) {
  const runs = straightRuns(points), longest = runs.reduce((best, r) => r.length > (best?.length || 0) ? r : best, null);
  if (!longest || longest.length < 60) return points;
  const k = longest.run[Math.min(longest.run.length - 1, Math.round(0.62 * (longest.run.length - 1)))], ring = points.slice(k).concat(points.slice(0, k)), x0 = ring[0][0], z0 = ring[0][2];
  return ring.map(([x, y, z]) => [x - x0, y, z - z0]);
}
function codexTrack(spec, base) {
  const lift = Math.max(0, 1 - Math.min(...spec.points.map(p => p[1])));
  const shaped = V2_KINK.has(spec.id) && NO_KINK !== '0' ? kinkStraights(spec.points) : spec.points, placed = KINK_ALL ? shaped : startOnMainStraight(shaped);
  // f1: true gives the v2 circuits the Formula 1 trackside (pits, gantry, kerb paint) of racing-f1.mjs; set: 'v2' marks the data source
  return freezeTrack({ ...base, id: base.id, name: spec.name, width: V2_WIDTH, samples: spec.samples, f1: true, set: 'v2', points: placed.map(([x, y, z]) => [x * V2_SCALE, y + lift, z * V2_SCALE]) });
}

export const TRACKS = Object.freeze(RACING_TRACK_SET === 'v1' ? CLASSIC_TRACKS : RACING_TRACK_SET === 'v2' ? CLASSIC_LIST.map(track => codexTrack(CODEX_V2.find(c => c.id === track.id), track)) : CLASSIC_LIST.map(track => F1_TRACKS[track.id] ? freezeTrack({ ...track, ...F1_TRACKS[track.id], vertices: undefined, elevation: undefined }) : freezeTrack(track)));

const TIMES = ['day', 'golden', 'day', 'sunset', 'night'];
const TRACK_LENGTHS = new Map(TRACKS.map(track => [track.id, sampleCircuit(track.points, track.samples || 40).length]));
export const RACING_STAGES = Object.freeze(Array.from({ length: 30 }, (_, index) => {
  const tier = Math.floor(index / 6), circuit = TRACKS[index % 6];
  const laps = tier < 2 ? 2 : 3;
  return Object.freeze({ id: index + 1, trackId: circuit.id, name: circuit.name, tier, laps,
    timeOfDay: TIMES[tier], reverse: tier === 3, widthScale: 1 - tier * 0.025,
    aiSpeed: (34.5 + tier * 2.0 + (index % 6) * 0.18) * (circuit.id === 'volcano' ? 0.98 : 1), aiCorner: 17 + tier * 2.2,
    playerSpeed: 40 + tier * 0.75, targetRank: tier === 0 ? 3 : tier < 3 ? 2 : 1,
    // Allow an average 18 m/s plus recovery/learning margin; the clock is not a speed trap.
    timeLimit: Math.min(295, Math.ceil(TRACK_LENGTHS.get(circuit.id) * laps / 18 + 25)), // 295: the app result envelope is 300 s
    opponents: 4, pickupOffset: tier * 0.055, grid: tier === 4 ? 5 : 3 });
}));

export function getRacingStage(value = 1) {
  return RACING_STAGES[clamp(Math.floor(Number(value) || 1), 1, 30) - 1];
}

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((axis) => 0.5 * ((2 * b[axis]) + (-a[axis] + c[axis]) * t +
    (2*a[axis] - 5*b[axis] + 4*c[axis] - d[axis]) * t2 + (-a[axis] + 3*b[axis] - 3*c[axis] + d[axis]) * t3));
}

function sampleCircuit(controls, per = 40) {
  const points = [], distances = [];
  let length = 0, previous;
  for (let index = 0; index < controls.length; index++) {
    for (let part = 0; part < per; part++) {
      const point = catmull(controls[(index + controls.length - 1) % controls.length], controls[index], controls[(index+1) % controls.length], controls[(index+2) % controls.length], part / per);
      if (previous) length += Math.hypot(point[0] - previous.x, point[1] - previous.y, point[2] - previous.z);
      const row = { x: point[0], y: point[1], z: point[2], s: length };
      points.push(row); distances.push(length); previous = row;
    }
  }
  length += Math.hypot(points[0].x - previous.x, points[0].y - previous.y, points[0].z - previous.z);
  return {points,distances,length};
}

/** A closed, arc-length sampled track. sample() accepts unwrapped race metres. */
export function createTrack(value = 1) {
  const stage = typeof value === 'object' && value.trackId ? value : typeof value === 'number' ? getRacingStage(value) : null;
  const definition = (value && typeof value === 'object' && value.points && !value.trackId) ? value : TRACKS.find((item) => item.id === (stage?.trackId || value)) || TRACKS[0];
  const controls = stage?.reverse ? [definition.points[0], ...definition.points.slice(1).reverse()] : definition.points;
  const {points,distances,length}=sampleCircuit(controls,definition.samples||40);
  const width = definition.width * (stage?.widthScale ?? 1);
  function sample(distance) {
    const s = wrap(distance, length);
    let low = 0, high = points.length;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (distances[mid] <= s) low = mid; else high = mid; }
    const a = points[low], b = points[(low+1) % points.length];
    const segment = (low === points.length-1 ? length : b.s) - a.s;
    const t = (s - a.s) / Math.max(0.00001, segment), dx = b.x-a.x, dy = b.y-a.y, dz = b.z-a.z;
    const horizontal = Math.hypot(dx,dz) || 1;
    const tangent = {x: dx/horizontal, y: dy/horizontal, z: dz/horizontal};
    return {x:a.x+dx*t, y:a.y+dy*t, z:a.z+dz*t, s, width, heading:Math.atan2(dx,dz), tangent, normal:{x:tangent.z,y:0,z:-tangent.x}};
  }
  function project(x, z, hint) {
    let best = null;
    const scan = (from, count) => {
      for (let n=0; n<count; n++) {
        const index=(from+n)%points.length, a=points[index], b=points[(index+1)%points.length], dx=b.x-a.x, dz=b.z-a.z;
        const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1);
        const px=a.x+dx*t, pz=a.z+dz*t, dist2=(x-px)**2+(z-pz)**2;
        const s=a.s+((index===points.length-1?length:b.s)-a.s)*t;
        // Break a rare geometric tie in favour of the caller's route neighbourhood.
        const nearHint = Number.isFinite(hint) ? Math.abs(wrap(s-hint+length/2,length)-length/2) : 0;
        if (!best || dist2 < best.dist2-0.0001 || (Math.abs(dist2-best.dist2)<0.0001 && nearHint<best.nearHint)) best={s:wrap(s,length),dist2,nearHint};
      }
    };
    // racing-grid-v1: ten cars call this twice per step. With a hint, a window of about 130 m around it is scanned first (the car is on or beside the road);
    // only when nothing in the window is close, all segments are considered, as before, so off-road recovery stays reliable.
    if (Number.isFinite(hint)) {
      const target = wrap(hint-65,length); let low = 0, high = points.length;
      while (low+1 < high) { const mid=(low+high)>>1; if (distances[mid] <= target) low=mid; else high=mid; }
      scan(low, Math.min(points.length, Math.ceil(130/(length/points.length))+4));
      if (best.dist2 > (width*1.6)**2) { best = null; scan(0, points.length); }
    } else scan(0, points.length);
    const p=sample(best.s), lateral=(x-p.x)*p.normal.x+(z-p.z)*p.normal.z;
    return {...p,lateral,distance:Math.sqrt(best.dist2)};
  }
  const offset = (stage?.pickupOffset || 0) * .35;
  const checkpoints=Array.from({length:16},(_,index)=>({...sample(index*length/16),index}));
  const boostPads=[0.46].map((fraction,index)=>({...sample((fraction+offset)%1*length),id:`pad-${index}`,length:10}));
  const pickups=[0.16,0.73].map((fraction,index)=>({...sample((fraction+offset)%1*length),id:`cell-${index}`,lane:index===0?0:3}));
  // racing-grid-v1: share of the lap spent in corners (curvature above 1/160 per metre); the gearbox shifts up earlier on circuits with many corners
  let cornerLength=0;const step=8,count=Math.floor(length/step);
  for(let i=0;i<count;i++){const a=sample(i*step),b=sample(i*step+step),turn=Math.abs(racingAngle(b.heading-a.heading))/step;if(turn>1/160)cornerLength+=step;}
  const cornerFraction=cornerLength/Math.max(1,count*step);
  // racing-deep-m2: straights of the sampled circuit (heading change under 1/400 rad per metre over 8 m steps), as unwrapped s ranges [from, to] in metres, longest first;
  // mainStraight is the longest one. The pit lane, the grid markings and the AI's "where can I reach top speed" read them.
  const straights=[];{let run=null;const flat=[];for(let i=0;i<count;i++){const a=sample(i*step),b=sample(i*step+step);flat.push(Math.abs(racingAngle(b.heading-a.heading))/step<1/400);}
    const first=flat.findIndex(v=>!v);if(first>=0)for(let k=0;k<count;k++){const i=(first+k)%count;if(flat[i]){if(!run)run={from:(first+k)*step,to:(first+k+1)*step};else run.to=(first+k+1)*step;}else if(run){straights.push(run);run=null;}}if(run)straights.push(run);
    for(const r of straights){r.length=r.to-r.from;r.from=wrap(r.from,length);r.to=r.from+r.length;}straights.sort((a,b)=>b.length-a.length);}
  const mainStraight=straights[0]||null;
  /** racing-deep-m2: staggered Formula 1 grid behind the line: two columns 3.3 m off the centre, 9 m between rows, the second column half a row back. Slot 0 is pole. */
  const gridSlots=(count)=>Array.from({length:count},(_,k)=>{const row=Math.floor(k/2),col=k%2;return {slot:k,s:-9-row*9-col*4.5,lane:col?-3.3:3.3,row,col};});
  return { ...definition, width, length, points, stage, sample, project, checkpoints, boostPads, pickups, cornerFraction, straights, mainStraight, gridSlots };
}

export function wrapRacingDistance(value, length) { return wrap(value, length); }
export function racingAngle(value) { return wrap(value + Math.PI, TAU) - Math.PI; }
