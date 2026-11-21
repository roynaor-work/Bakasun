const EPSILON = 1e-7;

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function axesOverlap(a, b, c, d) {
  return Math.max(a.x, b.x) + EPSILON >= Math.min(c.x, d.x)
    && Math.max(c.x, d.x) + EPSILON >= Math.min(a.x, b.x)
    && Math.max(a.z, b.z) + EPSILON >= Math.min(c.z, d.z)
    && Math.max(c.z, d.z) + EPSILON >= Math.min(a.z, b.z);
}

function sameSide(a, b, p, q) {
  const ca = cross(a, b, p), cb = cross(a, b, q);
  return (ca > EPSILON && cb > EPSILON) || (ca < -EPSILON && cb < -EPSILON);
}

export function segmentsIntersect(a, b, c, d) {
  return axesOverlap(a, b, c, d) && !sameSide(a, b, c, d) && !sameSide(c, d, a, b);
}

export function firstIntersection(a, b = a, closed = true) {
  const self = a === b;
  const n = closed ? a.length : a.length - 1;
  const m = closed ? b.length : b.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = self ? i + 2 : 0; j < m; j++) {
      if (self && closed && i === 0 && j === m - 1) continue;
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return [i, j];
    }
  }
  return null;
}

export function positiveStrip(left, right, closed = true) {
  const count = closed ? left.length : left.length - 1;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % left.length;
    const a = left[i], b = right[i], c = right[next], d = left[next];
    if (cross(a, b, c) <= 0 || cross(b, c, d) <= 0 || cross(c, d, a) <= 0 || cross(d, a, b) <= 0) return i;
  }
  return -1;
}

export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2));
  return Math.hypot(a.x + t * dx - p.x, a.z + t * dz - p.z);
}

export function nearestNonlocal(points, length, gap) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const end = i === points.length - 1 ? length : b.s;
    for (let j = i + 1; j < points.length; j++) {
      const c = points[j], d = points[(j + 1) % points.length];
      if (c.s - end < gap || length + a.s - (j === points.length - 1 ? length : d.s) < gap) continue;
      const x = Math.max(a.x, b.x, c.x, d.x) - Math.min(a.x, b.x, c.x, d.x)
        - Math.abs(a.x - b.x) - Math.abs(c.x - d.x);
      const z = Math.max(a.z, b.z, c.z, d.z) - Math.min(a.z, b.z, c.z, d.z)
        - Math.abs(a.z - b.z) - Math.abs(c.z - d.z);
      if (x > best || z > best) continue;
      best = Math.min(best, pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
        pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
    }
  }
  return best;
}
