// Symmetric continuous-surface Hausdorff distance, with a conservative interval.
// The nearest-surface query is exact (triangle BVH). The maximum is bounded by
// adaptive longest-edge subdivision and the distance function's 1-Lipschitz bound.
import {Heap} from './simplify.mjs';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function segmentDistance(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a), n = dot(ab, ab), t = n ? Math.max(0, Math.min(1, dot(ab, ap) / n)) : 0;
  return d2(p, a.map((v, i) => v + ab[i] * t));
}

export function triangleDistanceSquared(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2v = dot(ac, ap);
  const area = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  if (dot(area, area) < 1e-30) return Math.min(segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a));
  if (d1 <= 0 && d2v <= 0) return d2(p, a);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return d2(p, b);
  const vc = d1 * d4 - d3 * d2v;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {const v = d1 / (d1 - d3); return d2(p, a.map((n, i) => n + ab[i] * v));}
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return d2(p, c);
  const vb = d5 * d2v - d1 * d6;
  if (vb <= 0 && d2v >= 0 && d6 <= 0) {const w = d2v / (d2v - d6); return d2(p, a.map((n, i) => n + ac[i] * w));}
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {const w = (d4 - d3) / (d4 - d3 + d5 - d6); return d2(p, b.map((n, i) => n + (c[i] - n) * w));}
  const sum = va + vb + vc;
  if (Math.abs(sum) < 1e-30) return Math.min(segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a));
  const v = vb / sum, w = vc / sum;
  return d2(p, a.map((n, i) => n + ab[i] * v + ac[i] * w));
}

export class TriangleBVH {
  constructor(triangles) {
    if (!triangles.length || triangles.length % 9) throw Error('Expected a nonempty triangle surface');
    this.triangles = triangles;
    const build = ids => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const id of ids) for (let k = 0; k < 9; k++) {const v = triangles[id * 9 + k]; min[k % 3] = Math.min(min[k % 3], v); max[k % 3] = Math.max(max[k % 3], v);}
      const node = {min, max};
      if (ids.length <= 8) node.ids = ids;
      else {
        const extents = min.map((v, i) => max[i] - v), axis = extents.indexOf(Math.max(...extents));
        const center = id => triangles[id * 9 + axis] + triangles[id * 9 + 3 + axis] + triangles[id * 9 + 6 + axis];
        ids.sort((a, b) => center(a) - center(b));
        const middle = ids.length >> 1; node.left = build(ids.slice(0, middle)); node.right = build(ids.slice(middle));
      }
      return node;
    };
    this.root = build(Array.from({length: triangles.length / 9}, (_, i) => i));
  }
  nearest(point) {
    const boxDistance = n => point.reduce((s, v, i) => s + (v < n.min[i] ? n.min[i] - v : v > n.max[i] ? v - n.max[i] : 0) ** 2, 0);
    let best = Infinity; const stack = [this.root], t = this.triangles;
    while (stack.length) {
      const n = stack.pop(); if (boxDistance(n) > best) continue;
      if (n.ids) for (const id of n.ids) {
        const offset = id * 9;
        best = Math.min(best, triangleDistanceSquared(point, t.subarray(offset, offset + 3), t.subarray(offset + 3, offset + 6), t.subarray(offset + 6, offset + 9)));
      } else {
        const a = boxDistance(n.left), b = boxDistance(n.right);
        if (a < b) {if (b <= best) stack.push(n.right); if (a <= best) stack.push(n.left);}
        else {if (a <= best) stack.push(n.left); if (b <= best) stack.push(n.right);}
      }
    }
    return Math.sqrt(Math.max(0, best));
  }
}

function directed(source, targetBVH, tolerance, maxSamples) {
  const heap = new Heap((a, b) => b.upper - a.upper); let lower = 0, samples = 0;
  const add = (a, b, c) => {
    const center = a.map((v, i) => (v + b[i] + c[i]) / 3), distance = targetBVH.nearest(center);
    samples++; lower = Math.max(lower, distance);
    const radius = Math.sqrt(Math.max(d2(center, a), d2(center, b), d2(center, c)));
    heap.push({a, b, c, upper: distance + radius});
  };
  const visited = new Set();
  for (let i = 0; i < source.length; i += 3) {
    const point = Array.from(source.subarray(i, i + 3)), key = point.join(',');
    if (!visited.has(key)) {visited.add(key); lower = Math.max(lower, targetBVH.nearest(point)); samples++;}
  }
  for (let i = 0; i < source.length; i += 9) add(Array.from(source.subarray(i, i + 3)), Array.from(source.subarray(i + 3, i + 6)), Array.from(source.subarray(i + 6, i + 9)));
  while (heap.top.upper - lower > tolerance && samples + 2 <= maxSamples) {
    const {a, b, c} = heap.pop(), lengths = [d2(a, b), d2(b, c), d2(c, a)], longest = lengths.indexOf(Math.max(...lengths));
    const [p, q, r] = longest === 0 ? [a, b, c] : longest === 1 ? [b, c, a] : [c, a, b];
    const midpoint = p.map((v, i) => (v + q[i]) / 2);
    add(p, midpoint, r); add(midpoint, q, r);
  }
  return {lower, upper: Math.max(lower, heap.top.upper), samples, toleranceReached: heap.top.upper - lower <= tolerance};
}

export function hausdorff(source, target, {tolerance, maxSamples = 30000} = {}) {
  if (!(tolerance > 0)) throw Error('A positive Hausdorff tolerance is required');
  const forward = directed(source, new TriangleBVH(target), tolerance, maxSamples);
  const reverse = directed(target, new TriangleBVH(source), tolerance, maxSamples);
  const lower = Math.max(forward.lower, reverse.lower), upper = Math.max(forward.upper, reverse.upper);
  return {lowerMetres: lower, upperMetres: upper, intervalWidthMetres: upper - lower, toleranceMetres: tolerance, toleranceReached: upper - lower <= tolerance, samples: forward.samples + reverse.samples, directed: {sourceToLod: forward, lodToSource: reverse}};
}
