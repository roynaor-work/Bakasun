// Original island circuits. Distances are metres, Y is up, heading 0 faces +Z.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, length) => ((v % length) + length) % length;
export const RACING_TRACK_SCALE = 1.65;


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
  return ring.map(([x, z], i) => [(x - x0) / RACING_TRACK_SCALE, elevation(i / ring.length), (z - z0) / RACING_TRACK_SCALE]);
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
for (const [id, spec] of Object.entries(F1_TRACKS)) spec.points = filletCircuit(spec.vertices, 20, spec.elevation);

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
export const RACING_TRACK_SET = new URLSearchParams(globalThis.location?.search || '').get('racingTracks') === 'v1' ? 'v1' : 'f1';
export const TRACKS = Object.freeze(RACING_TRACK_SET === 'v1' ? CLASSIC_TRACKS : CLASSIC_LIST.map(track => F1_TRACKS[track.id] ? freezeTrack({ ...track, ...F1_TRACKS[track.id], vertices: undefined, elevation: undefined }) : freezeTrack(track)));

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
    // A local hint is optional. All segments are considered to make off-road recovery reliable.
    for (let index=0; index<points.length; index++) {
      const a=points[index], b=points[(index+1)%points.length], dx=b.x-a.x, dz=b.z-a.z;
      const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1);
      const px=a.x+dx*t, pz=a.z+dz*t, dist2=(x-px)**2+(z-pz)**2;
      const s=a.s+((index===points.length-1?length:b.s)-a.s)*t;
      // Break a rare geometric tie in favour of the caller's route neighbourhood.
      const nearHint = Number.isFinite(hint) ? Math.abs(wrap(s-hint+length/2,length)-length/2) : 0;
      if (!best || dist2 < best.dist2-0.0001 || (Math.abs(dist2-best.dist2)<0.0001 && nearHint<best.nearHint)) best={s:wrap(s,length),dist2,nearHint};
    }
    const p=sample(best.s), lateral=(x-p.x)*p.normal.x+(z-p.z)*p.normal.z;
    return {...p,lateral,distance:Math.sqrt(best.dist2)};
  }
  const offset = (stage?.pickupOffset || 0) * .35;
  const checkpoints=Array.from({length:16},(_,index)=>({...sample(index*length/16),index}));
  const boostPads=[0.46].map((fraction,index)=>({...sample((fraction+offset)%1*length),id:`pad-${index}`,length:10}));
  const pickups=[0.16,0.73].map((fraction,index)=>({...sample((fraction+offset)%1*length),id:`cell-${index}`,lane:index===0?0:3}));
  return { ...definition, width, length, points, stage, sample, project, checkpoints, boostPads, pickups };
}

export function wrapRacingDistance(value, length) { return wrap(value, length); }
export function racingAngle(value) { return wrap(value + Math.PI, TAU) - Math.PI; }
