/** Direction rules for the arrows drawn on the snow. Local frame of a course object: -z is downhill, +x is the rider's right.
 * Pure data, no three.js, so the tests can check that every floor arrow points the way the rider goes. */

/** Boost pad chevrons: each row is two bars that meet at the pad centre line. The tip of the "V" must sit on the downhill side,
 * so the outer end of every bar is uphill of its inner end (a ">" for a rider travelling toward -z).
 * A bar of length L rotated by ry about y runs along (cos ry, 0, -sin ry); the outer end is at +L/2 for side = +1. */
export function padChevrons({rows = 3, rowGap = 1.25, firstRow = -1.5, centreOffset = .39, length = 1.22, angle = .6} = {}) {
  const bars = [];
  for (let i = 0; i < rows; i++) for (const side of [-1, 1]) bars.push({x: side * centreOffset, z: i * rowGap + firstRow, ry: -side * angle, side, length});
  return bars;
}
/** World-local ends of a chevron bar: {inner, outer} as [x, z]. */
export function barEnds(bar) {
  const dx = Math.cos(bar.ry) * bar.length / 2, dz = -Math.sin(bar.ry) * bar.length / 2, k = bar.side;
  return {inner: [bar.x - k * dx, bar.z - k * dz], outer: [bar.x + k * dx, bar.z + k * dz]};
}
/** Corners of one decal quad on the snow: course distance s (downhill = larger s), lateral x, and the image UV.
 * The atlas keeps "top of the image = downhill", so the corners with fv = 1 sit at s + half. */
export function decalCorners({s, x, size, uv}) {
  const h = size / 2, [u0, v0, u1, v1] = uv;
  return [[s - h, x - h, 0, 0], [s - h, x + h, 1, 0], [s + h, x - h, 0, 1], [s + h, x + h, 1, 1]].map(([ss, xx, fu, fv]) => ({s: ss, x: xx, u: u0 + (u1 - u0) * fu, v: v0 + (v1 - v0) * fv, fv}));
}
