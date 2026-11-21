import { clip, edit, mirror, shift } from './geometry.mjs';

// Hand-authored, normalized camera-plane observations of a fictional athlete.
// The file contains body joints only. There are no wall, ceiling or floor-contact labels.
const profile = {
  n: [.555, .227], ls: [.505, .343], le: [.472, .462], lw: [.512, .555],
  lh: [.494, .549], lk: [.493, .715], la: [.487, .869], lf: [.476, .889], lt: [.522, .899],
  rs: [.526, .344], re: [.546, .455], rw: [.557, .541],
  rh: [.509, .552], rk: [.510, .718], ra: [.509, .876], rf: [.495, .892], rt: [.543, .903],
};

const swapLimbs = pose => ({
  ...pose, le: pose.re, lw: pose.rw, lk: pose.rk, la: pose.ra, lf: pose.rf, lt: pose.rt,
  re: pose.le, rw: pose.lw, rk: pose.lk, ra: pose.la, rf: pose.lf, rt: pose.lt,
});

const sprintLeft = edit(profile, {
  n: [.575, .234], ls: [.527, .350], rs: [.548, .351],
  lk: [.629, .527], la: [.601, .685], lf: [.583, .696], lt: [.627, .714],
  rk: [.451, .710], ra: [.405, .857], rf: [.395, .872], rt: [.437, .903],
  le: [.430, .469], lw: [.489, .515], re: [.618, .436], rw: [.666, .370],
});
const sprintRight = swapLimbs(sprintLeft);
const walkLeft = edit(profile, {
  lk: [.555, .701], la: [.575, .867], lf: [.553, .888], lt: [.592, .901],
  rk: [.465, .723], ra: [.448, .857], rf: [.435, .865], rt: [.470, .899],
});
const walkRight = swapLimbs(walkLeft);

const load = edit(profile, {
  n: [.580, .310], ls: [.540, .413], rs: [.557, .415],
  lh: [.471, .615], rh: [.484, .619],
  lk: [.558, .699], la: [.534, .863], lf: [.517, .887], lt: [.562, .904],
  rk: [.396, .746], ra: [.351, .853], rf: [.341, .866], rt: [.385, .901],
  le: [.471, .476], lw: [.405, .531], re: [.578, .468], rw: [.630, .407],
});
const flight = edit(shift(profile, 0, -.146), {
  n: [.550, .104],
  lk: [.609, .506], la: [.617, .644], lf: [.604, .658], lt: [.645, .676],
  rk: [.579, .493], ra: [.596, .638], rf: [.580, .651], rt: [.620, .675],
  le: [.575, .254], lw: [.647, .210], re: [.603, .256], rw: [.673, .216],
});
const land = edit(profile, {
  n: [.567, .353], ls: [.534, .449], rs: [.558, .450],
  lh: [.471, .636], rh: [.490, .640],
  lk: [.575, .726], la: [.536, .866], lf: [.519, .887], lt: [.565, .902],
  rk: [.596, .728], ra: [.557, .869], rf: [.540, .891], rt: [.583, .905],
  le: [.590, .505], lw: [.648, .458], re: [.604, .505], rw: [.654, .472],
});

const highReach = edit(shift(profile, 0, -.143), {
  n: [.552, .102], le: [.525, .148], lw: [.555, .061],
  re: [.560, .296], rw: [.613, .349],
  lk: [.504, .542], rk: [.534, .563],
  la: [.514, .713], lf: [.504, .734], lt: [.542, .756],
  ra: [.531, .725], rf: [.523, .743], rt: [.552, .761],
});

const boundLeft = edit(shift(sprintLeft, 0, -.108), {
  lk: [.636, .516], la: [.686, .686], lf: [.673, .704], lt: [.710, .699],
  rk: [.407, .575], ra: [.352, .695], rf: [.345, .710], rt: [.382, .728],
});
const boundRight = swapLimbs(boundLeft);
const softLeft = edit(sprintLeft, {
  ra: [.419, .864], rf: [.409, .881], rt: [.449, .901],
});
const softRight = swapLimbs(softLeft);

const skipLeft = edit(shift(sprintLeft, 0, -.087), {
  re: [.569, .246], rw: [.603, .137],
  lk: [.617, .436], la: [.577, .596], lf: [.564, .612], lt: [.602, .630],
  rk: [.472, .651], ra: [.445, .763], rf: [.432, .781], rt: [.465, .809],
});
const skipRight = swapLimbs(skipLeft);

const touchWall = edit(profile, {
  ls: [.534, .353], rs: [.557, .356],
  le: [.625, .393], lw: [.710, .418],
  re: [.582, .469], rw: [.589, .538],
});
const touchFloor = edit(profile, {
  n: [.679, .584], ls: [.633, .644], rs: [.647, .649],
  lh: [.481, .670], rh: [.499, .674],
  le: [.616, .737], lw: [.607, .874], re: [.635, .756], rw: [.612, .856],
  lk: [.546, .757], la: [.497, .867], lf: [.481, .884], lt: [.526, .902],
  rk: [.560, .755], ra: [.514, .867], rf: [.495, .889], rt: [.544, .903],
});

const frontLow = {
  n: [.500, .270], ls: [.419, .397], rs: [.580, .397],
  lh: [.446, .588], rh: [.553, .588],
  le: [.388, .486], re: [.612, .486], lw: [.419, .565], rw: [.580, .565],
  lk: [.409, .718], rk: [.591, .718],
  la: [.452, .870], ra: [.549, .870], lf: [.444, .892], rf: [.557, .891],
  lt: [.434, .907], rt: [.567, .907],
};
const shuffleWide = edit(frontLow, {
  lk: [.356, .718], rk: [.648, .718],
  la: [.383, .870], ra: [.617, .862], lf: [.377, .889], rf: [.623, .881],
  lt: [.370, .903], rt: [.630, .896],
});
const shuffleLead = edit(shuffleWide, {
  rk: [.632, .682], ra: [.657, .803], rf: [.662, .822], rt: [.671, .843],
});
const shuffleFollow = edit(frontLow, {
  lk: [.423, .690], la: [.453, .803], lf: [.451, .823], lt: [.441, .839],
});
const crossFront = edit(frontLow, {
  lk: [.515, .735, -.07], la: [.565, .870, -.09], lf: [.554, .889, -.09], lt: [.584, .900, -.10],
  rk: [.487, .715, .07], ra: [.472, .861, .085], rf: [.484, .880, .085], rt: [.451, .893, .09],
});
const crossBehind = edit(frontLow, {
  lk: [.516, .713, .07], la: [.562, .860, .09], lf: [.553, .882, .09], lt: [.581, .894, .10],
  rk: [.482, .738, -.07], ra: [.469, .870, -.085], rf: [.482, .890, -.085], rt: [.449, .900, -.09],
});

const backLeft = edit(profile, {
  lk: [.567, .708], la: [.572, .861], lf: [.559, .885], lt: [.594, .901],
  rk: [.413, .650], ra: [.390, .802], rf: [.382, .815], rt: [.413, .828],
  le: [.545, .429], lw: [.591, .386], re: [.464, .449], rw: [.435, .498],
});
const backRight = swapLimbs(backLeft);

function at(pose, x, facing = 1) {
  const [noseX, noseY] = pose.n;
  const profileView = Math.abs(pose.ls[0] - pose.rs[0]) < .07;
  const head = edit(pose, {
    lear: [noseX - .048, noseY + .026],
    rear: [noseX + (profileView ? -.034 : .048), noseY + .026],
  });
  return shift(facing === 1 ? head : mirror(head), x - .5, 0);
}
const key = (pose, x, hold = 120, transition = 135, facing = 1) => [at(pose, x, facing), hold, transition];
const settle = (x, facing = 1) => key(profile, x, 500, 160, facing);
const reset = (from, to, facing = 1) => [
  key(walkLeft, from + (to - from) * .25, 135, 205, facing),
  key(walkRight, from + (to - from) * .50, 135, 205, facing),
  key(walkLeft, from + (to - from) * .75, 135, 205, facing),
  settle(to, facing),
];
const strideKeys = (start, end, facing = Math.sign(end - start)) =>
  [.17, .32, .48, .65, .81].map((t, i) => key(i % 2 ? sprintRight : sprintLeft, start + (end - start) * t, 125, 120, facing));

const start = .190;
const end = .790;
const runPass = [...strideKeys(start, end), settle(end)];
const jumpPass = (air, endX) => [
  ...strideKeys(start, .515), key(load, .518, 150, 130),
  key(air, (endX + .518) / 2, 170, 180), key(land, endX, 180, 175), settle(endX),
];
const boundsPass = [
  key(softLeft, .241), key(boundLeft, .306, 150, 150), key(softRight, .402),
  key(boundRight, .501, 150, 150), key(softLeft, .583), key(boundLeft, .659, 150, 150),
  key(softRight, .740), settle(end),
];
const skipPass = [
  key(softLeft, .218), key(skipLeft, .292, 135, 135), key(softRight, .373),
  key(skipRight, .452, 135, 135), key(softLeft, .533), key(skipLeft, .618, 135, 135),
  key(softRight, .697), key(skipRight, .752, 130, 125), settle(end),
];
const shuttlePass = (from, to) => {
  const sign = Math.sign(to - from);
  return [...strideKeys(from, to), key(touchWall, to - .045 * sign, 275, 165, sign), settle(to - .045 * sign, sign)];
};
const lateralPass = (poses, from, to) => [
  ...poses.map((pose, i) => key(pose, from + (to - from) * ((i + 1) / (poses.length + 1)), 120, 115)),
  key(frontLow, to, 490, 170),
];
const floorWallPass = (from, to) => {
  const sign = Math.sign(to - from);
  return [
    key(touchFloor, from, 475, 340, sign),
    key(profile, from, 90, 340, sign),
    ...strideKeys(from, to, sign),
    key(load, to - .025 * sign, 135, 130, sign), key(highReach, to, 170, 180, sign),
    key(land, to + .007 * sign, 170, 160, sign), settle(to + .007 * sign, sign),
  ];
};
const backPass = [
  ...[.14, .27, .42, .57, .72, .86].map((t, i) => key(i % 2 ? backRight : backLeft, end + (start - end) * t, 125, 120)),
  settle(start),
];

// One continuous visible traversal represents one repetition in these clips.
// Physical course length, surface contact and signal state are separate evidence.
const traversal = (id, initial, phases, count, { tags = [], wrong = initial } = {}) =>
  clip(id, {
    rest: initial, phases: [[initial, 450, 0], ...phases], expected: { count },
    wrong: Array.isArray(wrong) ? [[initial, 450, 0], ...wrong] : wrong,
    tags: ['hall', ...tags],
  });

const leftReady = at(profile, start);
const rightFacing = at(profile, end);
const broad = jumpPass(flight, .733);
const vertical = jumpPass(highReach, .604);
const sideSteps = [shuffleLead, shuffleFollow, shuffleLead, shuffleFollow, shuffleLead, shuffleFollow];
const crossSteps = [shuffleWide, crossFront, frontLow, crossBehind, shuffleWide, crossFront, frontLow, crossBehind];
const runningStart = at(load, start);

export const hallClips = [
  traversal('hall-sprint', leftReady, [...runPass, ...reset(end, start, -1), ...runPass], 2, {
    tags: ['walk-return'], wrong: reset(start, end),
  }),
  traversal('run-jump', leftReady, [...broad, ...reset(.733, start, -1), ...broad], 2, {
    tags: ['flight', 'landing'], wrong: runPass,
  }),
  traversal('run-vertical', leftReady, [...vertical, ...reset(.604, start, -1), ...vertical], 2, {
    tags: ['flight', 'reach', 'landing'], wrong: broad,
  }),
  traversal('bounding', leftReady, boundsPass, 1, {
    tags: ['repeated-flight'], wrong: runPass,
  }),
  traversal('shuttle-run', at(touchWall, start + .045, -1), [
    ...shuttlePass(start + .045, end), ...shuttlePass(end - .045, start),
  ], 2, { tags: ['turn', 'reach-proxy'], wrong: runPass }),
  traversal('reaction-sprint', runningStart, runPass, 1, {
    tags: ['signal-required'], wrong: reset(start, end),
  }),
  traversal('side-shuffle', at(frontLow, start), [
    ...lateralPass(sideSteps, start, end), ...lateralPass(sideSteps.map(mirror), end, start),
  ], 2, { tags: ['no-crossover'], wrong: lateralPass(crossSteps, start, end) }),
  traversal('carioca', at(frontLow, start), [
    ...lateralPass(crossSteps, start, end), ...lateralPass(crossSteps.map(mirror), end, start),
  ], 2, { tags: ['crossover'], wrong: lateralPass(sideSteps, start, end) }),
  traversal('skipping', leftReady, skipPass, 1, {
    tags: ['opposite-arm-knee'], wrong: runPass,
  }),
  traversal('floor-wall-run', at(touchFloor, start), [
    ...floorWallPass(start, end), ...floorWallPass(end, start),
  ], 2, { tags: ['floor-reach-proxy', 'flight', 'wall-reach-proxy'], wrong: runPass }),
  traversal('back-run', rightFacing, backPass, 1, {
    tags: ['facing-opposes-motion'], wrong: [...strideKeys(end, start), settle(start, -1)],
  }),
];
