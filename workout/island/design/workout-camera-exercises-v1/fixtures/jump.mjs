// Synthetic landmark keyframes drawn in normalized image coordinates. The
// floor line stays fixed unless the feet leave it. Each rep includes a recovery
// frame so it can be separated from the next movement.
import { clip, edit, front, shift, side } from './geometry.mjs';

const repeat = (phases, n) => Array.from({ length: n }, () => phases).flat();

const armRunners = {
  le: [.465, .455], lw: [.420, .510], re: [.554, .410], rw: [.604, .352],
};
const jogLeft = edit(side, {
  ...armRunners,
  lk: [.620, .555], la: [.530, .684], lf: [.514, .706], lt: [.558, .712],
});
const kneeLeft = edit(side, {
  ...armRunners,
  lk: [.643, .467], la: [.621, .625], lf: [.603, .648], lt: [.648, .653],
});
const switchLimbs = pose => edit(pose, Object.fromEntries(
  ['e', 'w', 'k', 'a', 'f', 't'].flatMap(joint => ['l', 'r'].map(sideName => {
    const name = sideName + joint;
    const other = (sideName === 'l' ? 'r' : 'l') + joint;
    return [name, side[name].map((value, i) => value + pose[other][i] - side[other][i])];
  })),
));
const alternate = (left, count, between = side) => repeat([
  [left, 95, 125], [between, 55, 100], [switchLimbs(left), 95, 125], [between, 55, 100],
], count);

const circleArm = angle => {
  const size = .225;
  // A partly turned view makes the vertical and out-of-plane motion visible
  // as a narrow ellipse. Both arms turn in the same direction.
  const arm = (shoulder, sideSign, fraction) => [
    shoulder[0] + sideSign * size * .09 * fraction + Math.sin(angle) * size * .78 * fraction,
    shoulder[1] - Math.cos(angle) * size * fraction,
  ];
  return edit(side, {
    le: arm(side.ls, -1, .52), lw: arm(side.ls, -1, 1),
    re: arm(side.rs, 1, .52), rw: arm(side.rs, 1, 1),
  });
};
const armCircle = direction => Array.from({ length: 8 }, (_, i) => [
  circleArm(direction * i * Math.PI / 4), 15, 125,
]);

const springDip = edit(shift(front, 0, .022), {
  lk: [.437, .745], rk: [.563, .745],
  la: front.la, lf: front.lf, lt: front.lt, ra: front.ra, rf: front.rf, rt: front.rt,
});
const springAir = shift(front, 0, -.094);
const springDipSide = edit(shift(side, 0, .022), {
  lk: [.538, .659], rk: [.552, .665],
  la: side.la, lf: side.lf, lt: side.lt, ra: side.ra, rf: side.rf, rt: side.rt,
});
const pogo = [
  [springDipSide, 40, 70], [shift(side, 0, -.094), 100, 110], [side, 55, 120],
];

const jackArms = {
  le: [.344, .198], lw: [.370, .119], re: [.656, .198], rw: [.630, .119],
};
const jackFeet = {
  lk: [.344, .654], la: [.302, .797], lf: [.314, .817], lt: [.281, .833],
  rk: [.656, .654], ra: [.698, .797], rf: [.686, .817], rt: [.719, .833],
};
const jackOpen = edit(front, { ...jackArms, ...jackFeet });
const jackAir = shift(jackOpen, 0, -.054);
const jackCycle = [
  [jackAir, 85, 180], [jackOpen, 280, 75], [jackAir, 25, 90], [front, 320, 155],
];

const squat = edit(side, {
  n: [.574, .432], ls: [.522, .509], rs: [.537, .512],
  le: [.629, .529], re: [.646, .533], lw: [.725, .510], rw: [.742, .514],
  lh: [.402, .656], rh: [.417, .660], lk: [.529, .738], rk: [.544, .742],
});
const reachJump = edit(shift(side, 0, -.157), {
  le: [.466, .146], re: [.487, .149],
  lw: [.482, .064], rw: [.504, .069],
});
const squatJump = [[squat, 230, 260], [reachJump, 100, 230], [squat, 100, 230], [side, 250, 150]];

const tuck = edit(shift(side, 0, -.130), {
  lh: [.470, .361], rh: [.486, .365],
  lk: [.613, .337], rk: [.627, .345],
  la: [.564, .480], lf: [.553, .500], lt: [.598, .507],
  ra: [.580, .486], rf: [.569, .508], rt: [.613, .516],
  le: [.583, .265], lw: [.629, .329], re: [.603, .270], rw: [.648, .340],
});
const tuckCycle = [[squat, 110, 165], [tuck, 120, 155], [squat, 110, 170], [side, 250, 150]];

const lateralHop = (from, to) => [
  [shift(front, from, 0), 80, 100],
  [shift(springAir, (from + to) / 2, 0), 120, 140],
  [shift(front, to, 0), 100, 140],
];
const sideHops = [
  ...lateralHop(0, -.140), ...lateralHop(-.140, .140), ...lateralHop(.140, -.140),
  ...lateralHop(-.140, .140), ...lateralHop(.140, 0),
];

const ropeRest = edit(front, {
  le: [.395, .465], re: [.605, .465], lw: [.344, .540], rw: [.656, .540],
});
const ropeDip = edit(springDip, {
  le: [.395, .487], re: [.605, .487], lw: [.328, .560], rw: [.672, .560],
});
const ropeAir = edit(springAir, {
  le: [.395, .371], re: [.605, .371], lw: [.351, .407], rw: [.649, .407],
});
const ropeCycle = [[ropeDip, 40, 85], [ropeAir, 95, 105], [ropeRest, 60, 115]];

const crouch = edit(squat, {
  n: [.579, .515], ls: [.553, .592], rs: [.567, .594],
  lh: [.401, .730], rh: [.414, .733], lk: [.516, .744], rk: [.530, .747],
  le: [.587, .720], re: [.606, .722], lw: [.601, .833], rw: [.621, .834],
});
const plank = edit(crouch, {
  n: [.660, .662], ls: [.582, .712], rs: [.602, .718],
  lh: [.405, .756], rh: [.418, .763], lk: [.262, .800], rk: [.276, .806],
  la: [.117, .793], lf: [.096, .798], lt: [.130, .832],
  ra: [.133, .796], rf: [.112, .805], rt: [.146, .834],
  le: [.595, .774], re: [.613, .779],
});
const burpee = [
  [crouch, 230, 275], [plank, 330, 260], [crouch, 230, 260],
  [reachJump, 110, 230], [side, 300, 210],
];

const starDip = edit(springDip, {
  n: [.500, .362], ls: [.422, .452], rs: [.578, .452],
  lh: [.453, .654], rh: [.547, .654],
  lk: [.362, .732], rk: [.638, .732],
  le: [.410, .545], re: [.590, .545], lw: [.450, .690], rw: [.550, .690],
});
const starAir = edit(shift(jackOpen, 0, -.162), {
  le: [.304, .192], lw: [.207, .130], re: [.696, .192], rw: [.793, .130],
});
const starCycle = [[starDip, 180, 165], [starAir, 125, 150], [starDip, 115, 170], [front, 220, 130]];

const launchPose = edit(squat, {
  le: [.437, .586], re: [.455, .590], lw: [.327, .650], rw: [.345, .654],
});
const broadAir = edit(shift(side, 0, -.140), {
  n: [.593, .162], ls: [.540, .239], rs: [.553, .242],
  lh: [.467, .421], rh: [.481, .425],
  lk: [.587, .498], rk: [.601, .501],
  la: [.546, .622], lf: [.524, .642], lt: [.583, .649],
  ra: [.561, .625], rf: [.540, .646], rt: [.598, .651],
  le: [.659, .202], re: [.676, .207], lw: [.735, .126], rw: [.754, .131],
});
const walkBack = [
  [shift(jogLeft, .118, 0), 90, 150], [switchLimbs(jogLeft), 90, 150],
  [shift(jogLeft, -.111, 0), 90, 150], [shift(side, -.175, 0), 460, 155],
];
const broadCycle = [
  [shift(launchPose, -.175, 0), 250, 220],
  [broadAir, 125, 220],
  [shift(squat, .141, 0), 240, 218],
  [shift(side, .141, 0), 300, 175],
  ...walkBack,
];

const onLeft = edit(side, {
  // The ankle of each support leg remains in its original position. The
  // opposite foot stays raised before and after the hop.
  rk: [.520, .656], ra: [.425, .719], rf: [.411, .732], rt: [.443, .740],
});
const onRight = edit(side, {
  lk: [.508, .647], la: [.417, .715], lf: [.402, .730], lt: [.442, .738],
});
const oneLegCycle = base => [
  [base, 260, 170], [shift(base, 0, -.133), 110, 150], [base, 320, 150],
];

const stepRest = shift(side, -.130, 0);
const stepTop = shift(side, .080, -.125);
const stepAir = shift(broadAir, .035, -.036);
const walkOff = edit(stepTop, {
  lk: [.454, .694], la: [.399, .798], lf: [.378, .816], lt: [.431, .835],
});
const stepCycle = [
  [shift(launchPose, -.130, 0), 260, 210], [stepAir, 110, 180],
  [stepTop, 550, 155], [walkOff, 200, 260], [stepRest, 300, 215],
];

export const jumpClips = [
  clip('jog', { phases: alternate(jogLeft, 5, shift(side, 0, -.024)), expected: { activeMs: [1900, 4300] } }),
  clip('arm-circles', {
    phases: [...armCircle(1), ...armCircle(1), ...armCircle(-1), ...armCircle(-1)],
    expected: { activeMs: [1800, 5000] },
  }),
  clip('ankle-hops', { phases: repeat(pogo, 7), expected: { activeMs: [1400, 4000] } }),
  clip('jumping-jacks', { rest: front, phases: repeat(jackCycle, 2), expected: { count: 2 } }),
  clip('squat-jumps', { phases: repeat(squatJump, 2), expected: { count: 2 } }),
  clip('high-knees', { phases: alternate(kneeLeft, 5), expected: { activeMs: [1700, 4300] } }),
  clip('tuck-jumps', { phases: repeat(tuckCycle, 2), expected: { count: 2 } }),
  clip('side-hops', { rest: front, phases: sideHops, expected: { activeMs: [1000, 3900] } }),
  clip('jump-rope', { rest: ropeRest, phases: repeat(ropeCycle, 7), expected: { activeMs: [1400, 4000] } }),
  clip('burpees', {
    rest: shift(side, .070, 0),
    phases: repeat(burpee.map(([pose, hold, transition]) => [shift(pose, .070, 0), hold, transition]), 2),
    expected: { count: 2 },
  }),
  clip('star-jumps', { rest: front, phases: repeat(starCycle, 2), expected: { count: 2 } }),
  clip('broad-jump', { rest: shift(side, -.175, 0), phases: repeat(broadCycle, 2), expected: { count: 2 } }),
  clip('single-leg-hops', {
    phases: [...oneLegCycle(onLeft), [side, 360, 140], ...oneLegCycle(onRight), [side, 320, 140]],
    expected: { count: 2 },
  }),
  // Landmarks can attest to the jump and elevated landing. The step itself
  // and its stability are outside the scope of this recording.
  clip('step-jumps', { rest: stepRest, phases: repeat(stepCycle, 2), expected: { count: 2 } }),
];

// These superficially resemble the named exercise enough to challenge a
// single-landmark or single-stage counter.
export const jumpNearMisses = [
  clip('jog', {
    phases: alternate(edit(side, armRunners), 4),
    expected: { activeMs: [0, 0] }, tags: ['arms-only'],
  }),
  clip('high-knees', {
    phases: repeat([[kneeLeft, 160, 165], [side, 180, 155]], 4),
    expected: { activeMs: [0, 0] }, tags: ['same-side-repeated'],
  }),
  clip('jumping-jacks', {
    rest: front, phases: repeat([[edit(front, jackArms), 350, 200], [front, 280, 200]], 2),
    expected: { count: 0 }, tags: ['arms-only'],
  }),
  clip('squat-jumps', {
    phases: repeat([[squat, 300, 240], [side, 300, 240]], 2),
    expected: { count: 0 }, tags: ['no-airborne-phase'],
  }),
  clip('tuck-jumps', {
    phases: repeat(squatJump, 2),
    expected: { count: 0 }, tags: ['straight-knees-in-air'],
  }),
  clip('burpees', {
    phases: repeat([[crouch, 300, 300], [reachJump, 125, 230], [side, 300, 200]], 2),
    expected: { count: 0 }, tags: ['missing-plank'],
  }),
  clip('broad-jump', {
    phases: repeat(squatJump, 2),
    expected: { count: 0 }, tags: ['no-horizontal-travel'],
  }),
  clip('single-leg-hops', {
    phases: repeat(pogo, 4),
    expected: { count: 0 }, tags: ['two-foot-hops'],
  }),
  clip('step-jumps', {
    rest: stepRest, phases: repeat([[walkOff, 350, 200], [stepTop, 500, 220], [walkOff, 300, 240], [stepRest, 360, 240]], 2),
    expected: { count: 0 }, tags: ['walk-up-without-jump'],
  }),
];
