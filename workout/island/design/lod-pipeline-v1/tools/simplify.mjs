// Endpoint-only quadric error decimation. Every output vertex is a complete,
// unchanged source vertex, including all skin influences and morph deltas.
import {accessor, rawAccessor, widths} from './glb.mjs';

export class Heap {
  constructor(compare = (a, b) => a.cost - b.cost) {this.items = []; this.compare = compare;}
  push(value) {
    const a = this.items; let i = a.length; a.push(value);
    while (i) {const p = (i - 1) >> 1; if (this.compare(a[p], value) <= 0) break; a[i] = a[p]; i = p;}
    a[i] = value;
  }
  pop() {
    const a = this.items, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (2 * i + 1 < a.length) {
        let c = 2 * i + 1; if (c + 1 < a.length && this.compare(a[c + 1], a[c]) < 0) c++;
        if (this.compare(last, a[c]) <= 0) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return first;
  }
  get length() {return this.items.length;}
  get top() {return this.items[0];}
}

const sub = (a, b) => a.map((n, i) => n - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
const length = a => Math.sqrt(dot(a, a));
const dist2 = (a, b) => a.reduce((s, n, i) => s + (n - b[i]) ** 2, 0);
const plane = (q, p, weight) => {
  let k = 0;
  for (let r = 0; r < 4; r++) for (let c = r; c < 4; c++) q[k++] += p[r] * p[c] * weight;
};
const error = (a, b, v) => {
  const p = [...v, 1]; let sum = 0, k = 0;
  for (let r = 0; r < 4; r++) for (let c = r; c < 4; c++) {sum += (a[k] + b[k]) * p[r] * p[c] * (r === c ? 1 : 2); k++;}
  return Math.max(0, sum);
};

export function simplifyPrimitive(doc, primitive, ratio, {preserveTopology = true, criticalJoints = new Set()} = {}) {
  if ((primitive.mode ?? 4) !== 4) throw Error('Only TRIANGLES primitives can be simplified');
  const positions = accessor(doc, primitive.attributes.POSITION);
  const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key, index]) => [key, {values: accessor(doc, index), width: widths[doc.json.accessors[index].type]}]));
  const morphs = (primitive.targets || []).map(t => Object.fromEntries(Object.entries(t).map(([k, i]) => [k, accessor(doc, i)])));
  const sourceIndices = primitive.indices === undefined ? Uint32Array.from({length: positions.length / 3}, (_, i) => i) : rawAccessor(doc, primitive.indices);
  if (sourceIndices.length % 3) throw Error('Incomplete triangle');
  const originalTriangles = sourceIndices.length / 3;
  const target = Math.max(1, Math.round(originalTriangles * ratio));
  const boundsMin = [Infinity, Infinity, Infinity], boundsMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {boundsMin[i % 3] = Math.min(boundsMin[i % 3], positions[i]); boundsMax[i % 3] = Math.max(boundsMax[i % 3], positions[i]);}
  const weldEpsilon = Math.max(1e-9, Math.hypot(...boundsMin.map((v, i) => boundsMax[i] - v)) * 1e-7);
  const keyPosition = p => p.map(v => Math.round(v / weldEpsilon));
  const groups = [], lookup = new Map(), vertexGroup = [];
  const influence = i => {
    const result = new Map();
    for (let set = 0; attributes[`JOINTS_${set}`]; set++) {
      const js = attributes[`JOINTS_${set}`].values, ws = attributes[`WEIGHTS_${set}`].values;
      for (let k = 0; k < 4; k++) if (ws[i * 4 + k] > 0) result.set(js[i * 4 + k], (result.get(js[i * 4 + k]) || 0) + ws[i * 4 + k]);
    }
    return result;
  };
  for (let i = 0; i < positions.length / 3; i++) {
    const p = Array.from(positions.subarray(i * 3, i * 3 + 3));
    // Weld geometry at UV/normal seams, but never conflate skin or damage data.
    const key = JSON.stringify([keyPosition(p), ...Object.entries(attributes).filter(([k]) => /^(JOINTS|WEIGHTS)_/.test(k)).map(([, a]) => Array.from(a.values.subarray(i * a.width, (i + 1) * a.width))), ...morphs.map(t => t.POSITION ? keyPosition(Array.from(t.POSITION.subarray(i * 3, i * 3 + 3))) : null)]);
    let g = lookup.get(key);
    if (g === undefined) {
      g = groups.length; lookup.set(key, g);
      groups.push({p, aliases: [], q: new Float64Array(10), faces: new Set(), version: 0, live: true, influence: influence(i)});
    }
    groups[g].aliases.push(i); vertexGroup[i] = g;
  }
  const faces = [], components = []; let totalArea = 0;
  for (let i = 0; i < sourceIndices.length; i += 3) {
    const corners = Array.from(sourceIndices.subarray(i, i + 3));
    if (corners.some(v => v >= vertexGroup.length)) throw Error('Triangle index out of bounds');
    const g = corners.map(v => vertexGroup[v]), a = groups[g[0]].p, b = groups[g[1]].p, c = groups[g[2]].p;
    const n = cross(sub(b, a), sub(c, a)), magnitude = length(n);
    if (new Set(g).size < 3 || magnitude < 1e-16) continue;
    const normal = n.map(v => v / magnitude), area = magnitude / 2, id = faces.length;
    faces.push({g, corners, normal, area, live: true, component: -1}); totalArea += area;
    const p = [...normal, -dot(normal, a)];
    for (const v of g) {groups[v].faces.add(id); plane(groups[v].q, p, area);}
  }
  // Keep every disconnected geometric part, including hands, lights and eyes.
  for (let f = 0; f < faces.length; f++) if (faces[f].component === -1) {
    const id = components.length, pending = [f]; faces[f].component = id; let count = 0;
    while (pending.length) {
      const next = pending.pop(); count++;
      for (const g of faces[next].g) for (const n of groups[g].faces) if (faces[n].component === -1) {faces[n].component = id; pending.push(n);}
    }
    components.push({count, floor: Math.min(2, count)});
  }
  // Protect the largest geometric component controlled by each head/torso
  // joint. Small eyes, buttons and other details can become far silhouettes.
  const landmarkComponents = new Set();
  for (const bone of criticalJoints) {
    const scores = new Map();
    for (const face of faces) {
      const weight = face.g.reduce((s,g)=>s+(groups[g].influence.get(bone)||0),0)/3;
      if (weight>.1) scores.set(face.component,(scores.get(face.component)||0)+face.area*weight);
    }
    const best = [...scores].sort((a,b)=>b[1]-a[1])[0]; if (best) landmarkComponents.add(best[0]);
  }
  const neighbors = id => {
    const result = new Set();
    for (const f of groups[id].faces) if (faces[f].live) for (const g of faces[f].g) if (g !== id) result.add(g);
    return result;
  };
  const seen = new Set();
  for (let a = 0; a < groups.length; a++) for (const b of neighbors(a)) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`; if (seen.has(key)) continue; seen.add(key);
    const adjacent = [...groups[a].faces].filter(f => groups[b].faces.has(f));
    if (adjacent.length === 1) {
      const edge = sub(groups[b].p, groups[a].p), normal = cross(edge, faces[adjacent[0]].normal), l = length(normal);
      if (l) {const n = normal.map(v => v / l), p = [...n, -dot(n, groups[a].p)]; for (const v of [a, b]) plane(groups[v].q, p, totalArea / Math.max(1, faces.length) * 12);}
    }
  }
  const boneSupport = new Map();
  for (const g of groups) if (g.faces.size) for (const bone of g.influence.keys()) boneSupport.set(bone, (boneSupport.get(bone) || 0) + 1);
  const skinDistance = (a, b) => {
    const keys = new Set([...a.influence.keys(), ...b.influence.keys()]);
    return [...keys].reduce((s, k) => s + ((a.influence.get(k) || 0) - (b.influence.get(k) || 0)) ** 2, 0);
  };
  const aliasDistance = (a, b) => {
    let sum = 0;
    for (const key of ['NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
      const attr = attributes[key]; if (!attr) continue;
      for (let i = 0; i < attr.width; i++) sum += (attr.values[a * attr.width + i] - attr.values[b * attr.width + i]) ** 2 * (key === 'NORMAL' ? 0.2 : 1);
    }
    return sum;
  };
  const pickAlias = (from, to) => {
    let best = to.aliases[0], score = Infinity;
    for (const alias of to.aliases) {const next = aliasDistance(from, alias); if (next < score) {best = alias; score = next;}}
    return best;
  };
  const heap = new Heap(), areaScale = totalArea / Math.max(1, faces.length);
  const enqueue = (a, b) => {
    const ga = groups[a], gb = groups[b]; if (!ga.live || !gb.live) return;
    const extra = areaScale * dist2(ga.p, gb.p) * (0.015 + skinDistance(ga, gb) * 1.5);
    const ab = error(ga.q, gb.q, gb.p), ba = error(ga.q, gb.q, ga.p);
    heap.push({a, b, av: ga.version, bv: gb.version, cost: Math.min(ab, ba) + extra, reverse: ba < ab});
  };
  for (let a = 0; a < groups.length; a++) for (const b of neighbors(a)) if (a < b) enqueue(a, b);
  let count = faces.length, collapsed = 0;
  const valid = (from, to) => {
    const ga = groups[from], gb = groups[to];
    if (!ga.faces.size || !gb.faces.size) return false;
    const fullTopology = preserveTopology === true || preserveTopology === 'full';
    const landmark = [...ga.faces,...gb.faces].some(f=>landmarkComponents.has(faces[f].component));
    if (fullTopology) {
      const aNeighbors = neighbors(from), bNeighbors = neighbors(to), opposite = new Set();
      for (const f of ga.faces) if (gb.faces.has(f)) for (const g of faces[f].g) if (g !== from && g !== to) opposite.add(g);
      const common = [...aNeighbors].filter(g => bNeighbors.has(g));
      if (common.length !== opposite.size || common.some(g => !opposite.has(g))) return false;
    }
    if (fullTopology || preserveTopology === 'landmarks' && landmark) {
      const remaining = new Set([...gb.faces].filter(f => !faces[f].g.includes(from)).map(f => [...faces[f].g].sort((a,b)=>a-b).join(',')));
      for (const f of ga.faces) if (!faces[f].g.includes(to)) {
        const key = faces[f].g.map(g => g === from ? to : g).sort((a,b)=>a-b).join(',');
        if (remaining.has(key)) return false;
        remaining.add(key);
      }
    }
    for (const bone of ga.influence.keys()) if (!gb.influence.has(bone) && boneSupport.get(bone) <= 1) return false;
    const removed = new Map(); let delta = 0;
    for (const f of ga.faces) {
      const face = faces[f]; if (!face.live) continue;
      if (face.g.includes(to)) {removed.set(face.component, (removed.get(face.component) || 0) + 1); delta++; continue;}
      const p = face.g.map(g => groups[g === from ? to : g].p), n = cross(sub(p[1], p[0]), sub(p[2], p[0])), size = length(n);
      if (size < 1e-15 || dot(n, face.normal) < size * 0.05) return false;
    }
    if (!delta || count - delta < target - 1) return false;
    for (const [id, n] of removed) if (components[id].count - n < components[id].floor) return false;
    // Count simultaneous orphans together: two last vertices supporting one
    // bone must not both disappear in the same collapse (tennis's small rigs).
    const removedGroups = new Set([from]), removedSupport = new Map();
    for (const g of neighbors(from)) if (g !== to && [...groups[g].faces].every(f => faces[f].g.includes(from) && faces[f].g.includes(to))) removedGroups.add(g);
    if ([...ga.faces, ...gb.faces].every(f => faces[f].g.includes(from) && faces[f].g.includes(to))) removedGroups.add(to);
    for (const g of removedGroups) for (const bone of groups[g].influence.keys()) removedSupport.set(bone, (removedSupport.get(bone) || 0) + 1);
    for (const [bone, n] of removedSupport) if (boneSupport.get(bone) <= n) return false;
    return true;
  };
  while (count > target && heap.length) {
    const edge = heap.pop(), ga = groups[edge.a], gb = groups[edge.b];
    if (!ga.live || !gb.live || edge.av !== ga.version || edge.bv !== gb.version) continue;
    let from = edge.reverse ? edge.b : edge.a, to = edge.reverse ? edge.a : edge.b;
    if (!valid(from, to)) { [from, to] = [to, from]; if (!valid(from, to)) continue; }
    const a = groups[from], b = groups[to], affected = new Set([...neighbors(from), ...neighbors(to), to]);
    for (const f of [...a.faces]) {
      const face = faces[f]; if (!face.live) continue;
      if (face.g.includes(to)) {
        face.live = false; count--; components[face.component].count--;
        for (const g of face.g) groups[g].faces.delete(f);
      } else {
        for (let k = 0; k < 3; k++) if (face.g[k] === from) {face.g[k] = to; face.corners[k] = pickAlias(face.corners[k], b);}
        const p = face.g.map(g => groups[g].p), n = cross(sub(p[1], p[0]), sub(p[2], p[0])), size = length(n);
        face.normal = n.map(v => v / size); b.faces.add(f);
      }
    }
    a.faces.clear(); a.live = false;
    for (const bone of a.influence.keys()) boneSupport.set(bone, boneSupport.get(bone) - 1);
    for (let k = 0; k < 10; k++) b.q[k] += a.q[k];
    for (const g of affected) {
      const v = groups[g]; v.version++;
      if (v.live && !v.faces.size) {v.live = false; for (const bone of v.influence.keys()) boneSupport.set(bone, boneSupport.get(bone) - 1);}
    }
    for (const g of affected) if (groups[g].live) for (const n of neighbors(g)) enqueue(g, n);
    collapsed++;
  }
  const sourceVertices = [], vertexMap = new Map(), indices = [];
  for (const f of faces) if (f.live) for (const v of f.corners) {
    if (!vertexMap.has(v)) {vertexMap.set(v, sourceVertices.length); sourceVertices.push(v);}
    indices.push(vertexMap.get(v));
  }
  const retainedBones = new Set(sourceVertices.flatMap(v => [...influence(v).keys()]));
  const inputBones = new Set(Array.from(new Set(sourceIndices)).flatMap(v => [...influence(v).keys()]));
  const missingBones = [...inputBones].filter(b => !retainedBones.has(b));
  if (missingBones.length) throw Error(`Decimation would remove bone support: ${missingBones}`);
  if (!indices.length) throw Error('Refusing to emit an empty primitive');
  return {indices, sourceVertices, stats: {originalTriangles, target, triangles: indices.length / 3, collapsedEdges: collapsed, components: components.length, componentFloor: components.reduce((s, c) => s + c.floor, 0), targetReached: indices.length / 3 <= target + 1}};
}
