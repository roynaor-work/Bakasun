// SPDX-License-Identifier: CC0-1.0
// Original keyframes in metres and degrees. The child's prop origin is the pelvis.
const seated = [0, .35, .38, 0, -8, -15, 0];
export const cradle = [0, 1.14, .34, 0, 0, -86, 1];
export const cradlePosition = { hip: [0, .82, 0], spine: [4, 0, 0], chest: [-2, 0, 0], head: [3, 0, 0],
  L: [.193, 1.101, .265], R: [-.181, 1.079, .407], props: { child: cradle } };
const child = { id: 'child', model: 'child' };
const seat = { id: 'seat', model: 'seat' };
const pickupSeat = [0, 0, .365, 0, 0, 0];
const safeSeat = [.013, .024, .384, 0, 0, 0];
const safeMat = [0, 0, .51, 0, 0, 0];
export const cradleSupport = [
  { hand: 'L', prop: 'child', offset: [.052, .19, -.075] },
  { hand: 'R', prop: 'child', offset: [.048, -.185, .067] },
];
const catSupport = [
  { hand: 'L', prop: 'cat', offset: [.128, .028, -.071] },
  { hand: 'R', prop: 'cat', offset: [-.132, .030, -.062] },
];
const gripsDuring = (supports, start, end, ramp) => supports.map(support => ({ ...support, start, end, ramp }));
const neutral = { hip: [0, .82, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
  L: [.25, .91, .09], R: [-.25, .91, .09] };

// The walking clips use the same planted start and finish footprint as the lift and release.
const carrySteps = {
  L: [[.25, .72, [.14, .225], .075], [1.30, 1.80, [.14, .625], .078]],
  R: [[.78, 1.25, [-.14, .365], .069], [1.86, 2.36, [-.14, .565], .059]],
};
const travel = [
  // time, forward displacement, lateral weight transfer, hip height
  [0, 0, 0, .82], [.23, .016, -.022, .809], [.47, .067, -.028, .806],
  [.72, .142, 0, .809], [.98, .245, .025, .810], [1.25, .327, .020, .811],
  [1.54, .431, -.025, .806], [1.80, .518, -.012, .806], [2.10, .575, .021, .807],
  [2.36, .6, .006, .817], [2.6, .6, 0, .82],
];
const carryArmsKeys = travel.map(([t, z, x, y]) => ({
  t, root: [0, 0, z], hip: [x, y, z], spine: [4, 0, -x * 85], chest: [-2, 0, x * 36], head: [3, x * 50, 0],
  L: [.193 + x * .65, 1.101 + y - .82, .265 + z], R: [-.181 + x * .65, 1.079 + y - .82, .407 + z],
  props: { child: [cradle[0] + x * .65, cradle[1] + y - .82, cradle[2] + z, 0, x * 34, -86, 1] },
}));
const shoulderKeys = travel.map(([t, z, x, y]) => ({
  t, root: [0, 0, z], hip: [x + .019, y - .017, z], spine: [10, -6, 5 - x * 85],
  chest: [1, -3, -2 + x * 35], head: [-7, 7, -4],
  L: [.246 + x, 1.098 + y - .82, .31 + z], R: [.012 + x, 1.135 + y - .82, .338 + z],
  props: { child: [.224 + x, 1.279 + y - .82, .157 + z, -110, -4, 8 + x * 40, 1] },
}));

export const carryActions = [
  {
    id: 'lift-child', duration: 2.4, props: [child, seat], entryStance: 'ready', exitStance: 'cradle',
    keys: [
      { t: 0, ...neutral, props: { child: seated, seat: pickupSeat } },
      { t: .27, hip: [.012, .785, -.02], spine: [11, -2, 0], head: [16, 0, 0], L: [.247, .86, .145], R: [-.245, .815, .15] },
      { t: .64, hip: [.006, .48, -.028], spine: [34, -3, 0], chest: [9, 0, -3], head: [4, 0, 0], L: [.196, .57, .282], R: [-.165, .346, .321] },
      { t: .95, hip: [.023, .311, .019], spine: [65, -3, 0], chest: [17, 1, -4], head: [-25, 0, 0], L: [.105, .52, .316], R: [-.01, .16, .447], props: { child: seated } },
      { t: 1.16, hip: [.016, .335, .022], spine: [62, -2, 0], chest: [15, 1, -3], head: [-22, 0, 0], props: { child: [.014, .413, .383, 0, -8, -25, .2] } },
      { t: 1.45, hip: [-.008, .50, .014], spine: [38, -2, 0], chest: [9, 0, -2], head: [-10, 0, 0], props: { child: [.024, .638, .395, 0, -5, -57, .62] } },
      { t: 1.80, hip: [-.007, .739, .012], spine: [11, 0, 0], chest: [3, 0, -1], head: [5, 0, 0], props: { child: [.01, 1.015, .361, 0, -2, -78, .91] } },
      { t: 2.18, ...cradlePosition },
      { t: 2.4, ...cradlePosition, props: { child: cradle, seat: pickupSeat } },
    ],
    grips: gripsDuring(cradleSupport, .83, 2.4, .20),
    events: [
      { time: 1.03, id: 'grip-child', label: 'אחיזה בילד' },
      { time: 1.16, id: 'lift-child', label: 'הרמה' },
      { time: 2.18, id: 'child-in-arms', label: 'הילד נתמך בשתי הידיים' },
    ],
  },
  {
    id: 'carry-shoulder', duration: 2.6, props: [{ id: 'child', model: 'child-shoulder' }],
    entryStance: 'shoulder-loaded', exitStance: 'shoulder-loaded', steps: carrySteps, keys: shoulderKeys,
    grips: gripsDuring([
      { hand: 'L', prop: 'child', offset: [.10, -.16, -.13] },
      { hand: 'R', prop: 'child', offset: [-.088, -.16, -.13] },
    ], 0, 2.6, 0),
    events: [
      { time: 0, id: 'shoulder-child-secured', label: 'הילד נתמך על הכתף' },
      { time: .25, id: 'carry-start', label: 'תחילת נשיאה' },
      { time: 2.36, id: 'carry-stop', label: 'עצירה עם תמיכה' },
    ],
  },
  {
    id: 'carry-arms', duration: 2.6, props: [child], entryStance: 'cradle', exitStance: 'cradle',
    steps: carrySteps, keys: carryArmsKeys, grips: gripsDuring(cradleSupport, 0, 2.6, 0),
    events: [
      { time: 0, id: 'child-in-arms', label: 'הילד נתמך בשתי הידיים' },
      { time: .25, id: 'carry-start', label: 'תחילת נשיאה' },
      { time: 2.36, id: 'carry-stop', label: 'עצירה עם תמיכה' },
    ],
  },
  {
    id: 'set-down', duration: 2.6, props: [child, { id: 'mat', model: 'mat' }, seat],
    entryStance: 'cradle', exitStance: 'ready',
    keys: [
      { t: 0, ...cradlePosition, props: { child: cradle, mat: safeMat, seat: safeSeat } },
      { t: .30, hip: [.005, .80, -.015], spine: [8, -2, 0], chest: [1, 1, 0], head: [12, 0, 0], props: { child: [0, 1.113, .345, 0, -2, -85, 1] } },
      { t: .72, hip: [.027, .685, -.009], spine: [20, -3, 1], chest: [6, 0, 1], head: [6, 0, 0], props: { child: [.01, .924, .373, 0, -3, -70, .83] } },
      { t: 1.08, hip: [.018, .450, .014], spine: [48, -4, 0], chest: [12, 1, -4], head: [-12, 0, 0], props: { child: [.015, .589, .403, 0, -6, -42, .43] } },
      { t: 1.43, hip: [.028, .312, .021], spine: [66, -3, 0], chest: [17, 1, -4], head: [-26, 0, 0], L: [.123, .54, .32], R: [.0, .195, .449], props: { child: [.013, .365, .399, 0, -8, -12, 0] } },
      { t: 1.64, hip: [.021, .328, .01], spine: [65, -2, 0], chest: [15, 1, -4], head: [-25, 0, 0], L: [.138, .54, .334], R: [-.065, .213, .405] },
      { t: 1.90, hip: [-.012, .48, -.047], spine: [32, -1, 0], chest: [9, 0, -2], head: [0, 0, 0], L: [.20, .59, .271], R: [-.22, .436, .245] },
      { t: 2.36, ...neutral },
      { t: 2.6, ...neutral, props: { child: [.013, .365, .399, 0, -8, -12, 0], mat: safeMat, seat: safeSeat } },
    ],
    grips: [
      ...gripsDuring([cradleSupport[0]], 0, 1.83, .16),
      ...gripsDuring([cradleSupport[1]], 0, 1.67, .16),
    ],
    events: [
      { time: 1.43, id: 'child-supported-by-seat', label: 'הילד מונח על המושב' },
      { time: 1.83, id: 'release-child', label: 'שחרור ידיים' },
    ],
  },
  {
    id: 'lift-cat', duration: 2.5, props: [{ id: 'cat', model: 'cat-cradle' }],
    entryStance: 'ready', exitStance: 'cat-loaded',
    feet: { L: [.165, .052], R: [-.143, -.014] },
    keys: [
      { t: 0, ...neutral, props: { cat: [0, 0, .395, 0, 14, 0] } },
      { t: .30, hip: [.012, .763, -.042], spine: [14, -1, 0], chest: [4, 0, 0], head: [14, 0, 0], L: [.25, .774, .15], R: [-.23, .801, .137] },
      { t: .62, hip: [.007, .484, -.057], spine: [35, -2, 0], chest: [15, 0, -2], head: [0, 0, 0], L: [.186, .412, .253], R: [-.176, .44, .239] },
      { t: 1.00, hip: [-.003, .245, -.018], spine: [76, -3, 2], chest: [19, 0, -4], head: [-32, 0, 0], L: [.109, .03, .296], R: [-.145, .034, .367], props: { cat: [0, 0, .395, 0, 14, 0] } },
      { t: 1.22, hip: [-.006, .29, -.009], spine: [69, -3, 1], chest: [17, 0, -3], head: [-26, 0, 0], props: { cat: [.004, .105, .404, -2, 9, 2] } },
      { t: 1.58, hip: [-.002, .524, -.009], spine: [31, -2, 0], chest: [9, 0, 0], head: [-9, 0, 0], props: { cat: [.008, .51, .438, -5, 2, 5] } },
      { t: 1.95, hip: [0, .735, -.003], spine: [13, 1, 0], chest: [2, 0, 0], head: [2, -6, 0], props: { cat: [.006, .902, .415, -7, -4, 7] } },
      { t: 2.25, hip: [0, .821, 0], spine: [5, 0, 0], chest: [0, 0, 0], head: [9, -9, 0], L: [.139, 1.079, .30], R: [-.118, 1.046, .293], props: { cat: [.007, 1.049, .366, -8, -5, 7] } },
      { t: 2.5, hip: [0, .821, 0], spine: [5, 0, 0], chest: [0, 0, 0], head: [9, -9, 0], L: [.139, 1.079, .30], R: [-.118, 1.046, .293], props: { cat: [.007, 1.049, .366, -8, -5, 7] } },
    ],
    grips: gripsDuring(catSupport, .93, 2.5, .16),
    events: [
      { time: 1.09, id: 'grip-cat', label: 'תמיכה בחזה וברגליים' },
      { time: 1.22, id: 'lift-cat', label: 'הרמה' },
      { time: 2.25, id: 'cat-in-arms', label: 'החתול נתמך בידיים' },
    ],
  },
];
