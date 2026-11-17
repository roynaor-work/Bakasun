/** Small, allocation-based math helpers; no renderer or mutable globals. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export function finite(v, label, min = -Infinity) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) throw new RangeError(`${label} must be finite and >= ${min}`);
  return v;
}
export function normalize(q) {
  const n = Math.hypot(...q);
  if (n < 1e-12) throw new RangeError('zero quaternion');
  return q.map(v => v / n);
}
export function slerp(a, b, t) {
  a = normalize(a); b = normalize(b);
  let dot = a.reduce((v, n, i) => v + n * b[i], 0);
  if (dot < 0) { b = b.map(v => -v); dot = -dot; }
  if (dot > .9995) return normalize(lerp(a, b, t));
  const angle = Math.acos(clamp(dot, -1, 1)), denominator = Math.sin(angle);
  return a.map((v, i) => (v * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / denominator);
}
export function multiply(a, b) {
  const [x,y,z,w] = a, [X,Y,Z,W] = b;
  return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z];
}
export function rotate(q, v) {
  const [x,y,z,w] = q, [a,b,c] = v;
  const tx=2*(y*c-z*b), ty=2*(z*a-x*c), tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export function angleDegrees(a, b) {
  const aa=normalize(a), bb=normalize(b);
  return 2*Math.acos(clamp(Math.abs(aa.reduce((s,v,i)=>s+v*bb[i],0)),0,1))*180/Math.PI;
}
