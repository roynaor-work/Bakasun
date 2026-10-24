// Original island circuits. Distances are metres, Y is up, heading 0 faces +Z.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, length) => ((v % length) + length) % length;
export const RACING_TRACK_SCALE = 1.65;

export const TRACKS = Object.freeze([
  { id: 'coast', name: 'מפרץ הדקלים', theme: 'coast', width: 16, landmark: 'lighthouse',
    points: [[0,1,0],[60,2,35],[150,3,45],[220,4,5],[245,5,-80],[210,4,-150],[145,2,-175],[95,1,-140],[35,1,-160],[-35,2,-115],[-55,2,-45]] },
  { id: 'jungle', name: 'שבילי הג׳ונגל', theme: 'jungle', width: 14.5, landmark: 'waterfall',
    points: [[0,2,0],[75,3,30],[155,6,10],[190,9,-60],[135,11,-115],[165,8,-185],[105,5,-245],[25,3,-225],[-40,4,-175],[-5,6,-100],[-55,4,-45]] },
  { id: 'volcano', name: 'טבעת הלוע', theme: 'volcano', width: 15, landmark: 'volcano',
    points: [[0,4,0],[80,7,10],[160,11,-30],[215,15,-100],[195,18,-185],[120,15,-230],[35,11,-215],[-40,8,-165],[-65,5,-90],[-35,4,-35]] },
  { id: 'harbor', name: 'רציף המרינה', theme: 'harbor', width: 14, landmark: 'harbor',
    points: [[0,2,0],[90,2,12],[185,3,0],[220,4,-50],[205,4,-115],[140,3,-125],[110,3,-180],[45,2,-205],[-30,2,-175],[-55,3,-115],[-15,3,-75],[-40,2,-35]] },
  { id: 'summit', name: 'פסגת העננים', theme: 'summit', width: 14.5, landmark: 'bridge',
    points: [[0,3,0],[80,7,40],[160,13,5],[175,18,-65],[120,21,-115],[155,18,-185],[90,12,-240],[10,8,-215],[-60,5,-165],[-85,4,-80],[-50,3,-25]] },
  { id: 'ruins', name: 'גני העתיקות', theme: 'ruins', width: 14, landmark: 'temple',
    points: [[0,2,0],[75,3,30],[145,4,-5],[125,5,-70],[200,7,-110],[195,8,-185],[115,6,-225],[35,4,-195],[-35,3,-220],[-75,3,-150],[-35,2,-80],[-65,2,-30]] }
].map((track) => Object.freeze({ ...track, points: Object.freeze(track.points.map(([x,y,z]) => Object.freeze([x*RACING_TRACK_SCALE,y,z*RACING_TRACK_SCALE]))) })));

const TIMES = ['day', 'golden', 'day', 'sunset', 'night'];
const TRACK_LENGTHS = new Map(TRACKS.map(track => [track.id, sampleCircuit(track.points).length]));
export const RACING_STAGES = Object.freeze(Array.from({ length: 30 }, (_, index) => {
  const tier = Math.floor(index / 6), circuit = TRACKS[index % 6];
  const laps = tier < 2 ? 2 : 3;
  return Object.freeze({ id: index + 1, trackId: circuit.id, name: circuit.name, tier, laps,
    timeOfDay: TIMES[tier], reverse: tier === 3, widthScale: 1 - tier * 0.025,
    aiSpeed: 28.5 + tier * 2.2 + (index % 6) * 0.18,
    playerSpeed: 40 + tier * 0.75, targetRank: tier === 0 ? 3 : tier < 3 ? 2 : 1,
    // Allow an average 18 m/s plus recovery/learning margin; the clock is not a speed trap.
    timeLimit: Math.ceil(TRACK_LENGTHS.get(circuit.id) * laps / 18 + 25),
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

function sampleCircuit(controls) {
  const points = [], distances = [];
  let length = 0, previous;
  for (let index = 0; index < controls.length; index++) {
    for (let part = 0; part < 40; part++) {
      const point = catmull(controls[(index + controls.length - 1) % controls.length], controls[index], controls[(index+1) % controls.length], controls[(index+2) % controls.length], part / 40);
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
  const definition = TRACKS.find((item) => item.id === (stage?.trackId || value)) || TRACKS[0];
  const controls = stage?.reverse ? [definition.points[0], ...definition.points.slice(1).reverse()] : definition.points;
  const {points,distances,length}=sampleCircuit(controls);
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
