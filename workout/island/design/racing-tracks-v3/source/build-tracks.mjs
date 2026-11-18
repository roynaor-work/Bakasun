import { readFileSync, writeFileSync } from 'node:fs';
import { createTrack } from '../../../minigames/racing-tracks.mjs';
import { atLateral, runoffWidth, samplePit } from '../course.mjs';
import { circuits } from './circuits.mjs';

const root = new URL('../', import.meta.url);
const TAU = 2 * Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const round = (x, digits = 3) => +x.toFixed(digits);
const delta = (a, b) => [b[0] - a[0], b[1] - a[1]];
const distance = (a, b) => Math.hypot(...delta(a, b));
const unit = ([x, y]) => {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
};

function fillet(vertices, i) {
  const p = vertices[(i + vertices.length - 1) % vertices.length];
  const v = vertices[i];
  const n = vertices[(i + 1) % vertices.length];
  const u = unit(delta(v, p));
  const w = unit(delta(v, n));
  const angle = Math.acos(u[0] * w[0] + u[1] * w[1]);
  const tangent = Math.min(v[2] / Math.tan(angle / 2), 0.42 * Math.min(distance(v, p), distance(v, n)));
  const radius = tangent * Math.tan(angle / 2);
  const entry = [v[0] + tangent * u[0], v[1] + tangent * u[1]];
  const exit = [v[0] + tangent * w[0], v[1] + tangent * w[1]];
  const bisector = unit([u[0] + w[0], u[1] + w[1]]);
  const c = [v[0] + bisector[0] * radius / Math.sin(angle / 2), v[1] + bisector[1] * radius / Math.sin(angle / 2)];
  const a0 = Math.atan2(entry[1] - c[1], entry[0] - c[0]);
  const end = Math.atan2(exit[1] - c[1], exit[0] - c[0]);
  const sweep = Math.atan2(Math.sin(end - a0), Math.cos(end - a0));
  return { entry, exit, radius, sweep, length: Math.abs(sweep) * radius, at: (f) => [
    c[0] + radius * Math.cos(a0 + sweep * f),
    c[1] + radius * Math.sin(a0 + sweep * f),
  ] };
}

function straight(entry, exit) {
  return { length: distance(entry, exit), at: (f) => [lerp(entry[0], exit[0], f), lerp(entry[1], exit[1], f)] };
}

function model(spec) {
  const arcs = spec.vertices.map((_, i) => fillet(spec.vertices, i));
  const edges = arcs.map((arc, i) => straight(arc.exit, arcs[(i + 1) % arcs.length].entry));
  const main = edges.pop();
  const origin = main.at(0.61);
  const start = straight(origin, arcs[0].entry);
  const end = straight(arcs.at(-1).exit, origin);
  const segments = [start];
  arcs.forEach((arc, i) => {
    segments.push(arc);
    if (edges[i]) segments.push(edges[i]);
  });
  segments.push(end);
  let length = 0;
  for (const segment of segments) {
    segment.from = length;
    length += segment.length;
    segment.to = length;
  }

  const [base, rolling, local] = spec.height;
  const count = Math.ceil(length / 7.5);
  const points = Array.from({ length: count }, (_, i) => {
    const s = i * length / count;
    const segment = segments.find(({ to }) => s < to);
    const [x, z] = segment.at((s - segment.from) / segment.length);
    const turn = TAU * s / length;
    const y = base + rolling * Math.sin(turn - 0.46) + local * Math.sin(3 * turn + 0.4);
    return [round(x - origin[0], 4), round(y, 4), round(z - origin[1], 4)];
  });

  return { arcs, edges, start, end, length, points };
}

function weatherPreset([id, label, effect, density, visibilityM, grip, wetness, windMps, tint, cloudCover, drsEnabled]) {
  return { id, label, effect, density, visibilityM, grip, wetness, windMps, tint, cloudCover, drsEnabled };
}

function coordinates(course, track, s) {
  const laps = Math.floor(s / course.length);
  const sub = (s / course.length - laps) * track.points.length;
  const a = track.points[Math.floor(sub)];
  const b = track.points[Math.floor(sub) + 1];
  return round(laps * track.length + lerp(a.s, b?.s ?? track.length, sub % 1));
}

function placeProps(track, ids) {
  const occupied = [];
  const pit = track.pitLane;
  const restricted = [];
  for (let s = pit.entryS; s <= pit.exitS + 2; s += 2) {
    const point = samplePit(track, Math.min(s, pit.exitS));
    restricted.push({ ...point, radius: pit.width / 2 });
  }
  for (const zone of track.runoffs) {
    for (let s = zone.from; s <= zone.to + 2; s += 2) {
      const d = Math.min(s, zone.to);
      const radius = runoffWidth(zone, d) / 2;
      const point = atLateral(track, d, zone.side * (track.width / 2 + radius));
      restricted.push({ ...point, radius });
    }
  }

  const positions = [0.021, 0.049, 0.154, 0.274, 0.409, 0.598, 0.736, 0.888];
  const rotations = [-12, 18, 180, 58, -11, 91, 176, -52];
  return ids.map((id, i) => {
    const asset = `assets/props/${track.id}/${id}.glb`;
    const bytes = readFileSync(new URL(asset, root));
    const { extras: { footprintRadiusM } } = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const s = round(track.length * (id === 'sailboat' ? 0.192 : positions[i]));
    const afloat = track.theme === 'coast' && ['sailboat', 'buoy-pair'].includes(id);
    const dock = id === 'fishing-pier';
    const side = afloat || dock ? 1 : i % 2 ? Math.sign(pit.offset) : -Math.sign(pit.offset);
    const margin = 3;
    const firstGap = afloat ? 68 : dock ? 43 : i < 2 ? 5.5 : 6.5;
    for (let gap = firstGap; gap <= 99; gap += 2) {
      const lateralM = round(side * (track.width / 2 + footprintRadiusM + gap));
      const p = atLateral(track, s, lateralM);
      const clearance = track.project(p.x, p.z).distance - footprintRadiusM;
      if (clearance < (afloat ? 74 : track.width / 2 + margin)) continue;
      if ([...occupied, ...restricted].some((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.radius + footprintRadiusM + margin)) continue;
      occupied.push({ ...p, radius: footprintRadiusM });
      return { id, asset, s, lateralM, yawDeg: rotations[i], footprintRadiusM, surface: afloat ? 'water' : 'ground' };
    }
    throw new Error(`No clear roadside spot for ${track.id}/${id}`);
  });
}

function build(spec) {
  const course = model(spec);
  const [accent, terrain, verge, horizon, fog, water, kerb, lightColor] = spec.colors;
  const definition = {
    id: spec.id, name: spec.name, theme: spec.theme, themeLabel: spec.themeLabel, width: spec.width,
    landmark: spec.landmark, f1: true, samples: 4, points: course.points,
    sky: { asset: `assets/skies/${spec.id}.webp`, projection: 'equirectangular', width: 1536, height: 768 },
    palette: { accent, terrain, verge, horizon, fog, water, kerb, lightColor, light: spec.light },
    weather: spec.weather.map(weatherPreset),
  };
  const track = createTrack(definition);
  const at = (s) => coordinates(course, track, s);
  const corners = course.arcs.map((arc, i) => ({
    id: `T${i + 1}`, from: at(arc.from), apex: at(arc.from + arc.length / 2), to: at(arc.to),
    turn: arc.sweep > 0 ? 'left' : 'right', angleDeg: round(Math.abs(arc.sweep) * 180 / Math.PI, 1),
    radiusM: round(arc.radius, 1),
  }));
  const racingLine = corners.map(({ from, apex, to, turn }, i) => ({
    from: round(from - Math.min(16, (from - (corners[i - 1]?.to ?? 0)) / 2)),
    apex,
    to: round(to + Math.min(16, ((corners[i + 1]?.from ?? track.length) - to) / 2)),
    outside: turn === 'left' ? 1 : -1,
  }));
  const pitStraight = { from: at(-course.end.length + 16), to: at(course.start.length - 16) };
  const pitWidth = 5.6;
  const pitLane = {
    entryS: round(pitStraight.from + 17), limitFrom: round(pitStraight.from + 57),
    limitTo: round(pitStraight.to - 49), exitS: round(pitStraight.to - 11),
    width: pitWidth, offset: round(spec.pitSide * (spec.width / 2 + pitWidth / 2 + 2.6)), speedLimitKph: 60,
  };
  const bridges = spec.bridgeEdges.map(([i, crossing, minClearanceM], index) => {
    const edge = course.edges[i];
    const padding = Math.max(8, edge.length * 0.19);
    const from = at(edge.from + padding), to = at(edge.to - padding);
    const deckThicknessM = 1.25;
    let deckMinY = Infinity;
    const steps = Math.ceil(to - from);
    for (let j = 0; j <= steps; j++) deckMinY = Math.min(deckMinY, track.sample(lerp(from, to, j / steps)).y);
    return {
      id: `B${index + 1}`, from, to, crossing, deckWidthM: track.width + 1.2, deckThicknessM,
      minClearanceM, underpassY: Math.floor((deckMinY - deckThicknessM - minClearanceM) * 1000) / 1000,
    };
  });
  const drsZones = course.edges.map((edge, i) => ({ ...edge, i }))
    .filter(({ i, length }) => length >= 88 && spec.bridgeEdges.every(([bridgeEdge]) => bridgeEdge !== i))
    .sort((a, b) => b.length - a.length).slice(0, 2).sort((a, b) => a.from - b.from)
    .map((edge, index) => ({
      id: `DRS${index + 1}`, detectionS: at(edge.from + 16), from: at(edge.from + 24), to: at(edge.to - 16),
    }));
  const runoffs = [...corners].sort((a, b) => (b.angleDeg / b.radiusM) - (a.angleDeg / a.radiusM)).slice(0, 3)
    .sort((a, b) => a.from - b.from).map((corner, i) => ({
      id: `R${i + 1}`, cornerId: corner.id, side: corner.turn === 'left' ? 1 : -1,
      from: round(corner.from + 0.6), to: round(corner.to - 0.6),
      extraWidthM: 5.5 + i * 0.9, taperM: 11, surface: i === 1 ? 'asphalt' : 'gravel',
    }));

  const geometry = { lengthM: round(track.length), corners, racingLine, pitStraight, pitLane, runoffs, drsZones, bridges };
  const roadside = placeProps({ ...track, ...geometry }, spec.props);
  return { ...definition, ...geometry, roadside };
}

for (const spec of circuits) {
  const definition = build(spec);
  const json = JSON.stringify(definition, null, 2).replace(/\[\n      (-?[\d.]+),\n      (-?[\d.]+),\n      (-?[\d.]+)\n    \]/g, '[$1, $2, $3]');
  writeFileSync(new URL(`tracks/${spec.id}.json`, root), `${json}\n`);
  console.log(spec.id, definition.lengthM, definition.corners.length, definition.drsZones.map(({ from, to }) => round(to - from, 1)), definition.bridges.map(({ from, to }) => round(to - from, 1)));
}
