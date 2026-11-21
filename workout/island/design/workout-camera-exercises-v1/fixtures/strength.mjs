import { clip, edit, front, mirror, shift, side } from './geometry.mjs';

// Positions in the sagittal plane are written as coordinates, independent of detector features.
// For floor exercises the top or bottom edge of the frame isn't a substitute for the floor.
const plank = {
  n: [.773, .579], ls: [.677, .612], le: [.669, .721], lw: [.659, .829],
  rs: [.703, .624], re: [.698, .729], rw: [.690, .835],
  lh: [.504, .656], lk: [.358, .710], la: [.219, .762], lf: [.190, .764], lt: [.244, .828],
  rh: [.524, .671], rk: [.377, .726], ra: [.235, .780], rf: [.203, .781], rt: [.260, .836],
};
const prone = edit(plank, {
  n: [.777, .790], ls: [.682, .807], le: [.775, .816], lw: [.874, .819],
  rs: [.696, .812], re: [.788, .821], rw: [.885, .828],
  lh: [.508, .808], lk: [.357, .810], la: [.215, .816], lf: [.186, .804], lt: [.173, .830],
  rh: [.522, .825], rk: [.372, .830], ra: [.227, .826], rf: [.198, .819], rt: [.184, .849],
});
const flat = mirror(edit(prone, {
  n: [.781, .817], ls: [.684, .805], le: [.585, .820], lw: [.489, .824],
  rs: [.705, .818], re: [.611, .834], rw: [.511, .842],
  lf: [.197, .826], lt: [.214, .771], rf: [.216, .846], rt: [.241, .794],
}));

const sit = edit(front, {
  n: [.50, .405], ls: [.435, .52], le: [.426, .627], lw: [.484, .593],
  rs: [.565, .52], re: [.574, .627], rw: [.516, .593],
  lh: [.454, .698], lk: [.437, .645], la: [.423, .811], lf: [.433, .831], lt: [.403, .839],
  rh: [.546, .698], rk: [.563, .645], ra: [.577, .811], rf: [.565, .831], rt: [.597, .839],
});

const squat = edit(side, {
  n: [.574, .409], ls: [.520, .490], le: [.575, .530], lw: [.643, .491],
  rs: [.547, .499], re: [.616, .541], rw: [.675, .501],
  lh: [.382, .609], lk: [.530, .652], rh: [.409, .621], rk: [.552, .665],
});
const shallowSquat = edit(squat, {
  n: [.552, .271], ls: [.500, .375], rs: [.520, .386],
  lh: [.453, .540], rh: [.474, .551], lk: [.505, .661], rk: [.533, .670],
});

const split = edit(side, {
  lh: [.471, .495], lk: [.543, .644], la: [.614, .799], lf: [.589, .819], lt: [.655, .832],
  rh: [.491, .509], rk: [.441, .654], ra: [.379, .803], rf: [.353, .811], rt: [.407, .832],
});
const lunge = edit(split, {
  n: [.558, .388], ls: [.500, .499], rs: [.516, .511], le: [.570, .568], lw: [.600, .502],
  re: [.572, .578], rw: [.618, .519], lh: [.474, .655], rh: [.500, .665],
  lk: [.613, .657], rk: [.478, .804], ra: [.379, .801], rf: [.349, .785],
});
const heels = edit(shift(side, 0, -.066), { lt: side.lt, rt: side.rt });

const shoulderLift = edit(flat, {
  n: [.271, .665], ls: [.345, .725], le: [.311, .659], lw: [.250, .687],
  rs: [.326, .737], re: [.288, .686], rw: [.247, .708],
});
const bentLegs = edit(flat, {
  lk: [.627, .670], la: [.744, .805], lf: [.737, .832], lt: [.788, .832],
  rk: [.604, .651], ra: [.724, .799], rf: [.704, .818], rt: [.771, .829],
});
const crunchRest = edit(bentLegs, {
  le: [.249, .744], lw: [.225, .784], re: [.27, .742], rw: [.238, .772],
});
const crunch = edit(crunchRest, {
  n: shoulderLift.n, ls: shoulderLift.ls, le: shoulderLift.le, lw: shoulderLift.lw,
  rs: shoulderLift.rs, re: shoulderLift.re, rw: shoulderLift.rw,
});

const raisedLegs = edit(flat, {
  lk: [.558, .680], la: [.625, .526], lf: [.635, .548], lt: [.678, .519],
  rk: [.537, .674], ra: [.607, .512], rf: [.600, .534], rt: [.657, .497],
});
const beam = edit(flat, {
  n: [.244, .76], ls: [.325, .776], rs: [.308, .765],
  le: [.213, .769], lw: [.132, .745], re: [.201, .749], rw: [.107, .731],
  lk: [.641, .755], la: [.777, .719], lf: [.788, .726], lt: [.835, .701],
  rk: [.629, .753], ra: [.771, .697], rf: [.788, .705], rt: [.837, .686],
});
const vUp = edit(beam, {
  n: [.355, .54], ls: [.399, .631], le: [.492, .610], lw: [.590, .55],
  rs: [.378, .627], re: [.464, .604], rw: [.565, .540],
  lk: [.586, .681], la: [.680, .565], lf: [.710, .574], lt: [.728, .526],
  rk: [.569, .663], ra: [.660, .554], rf: [.679, .547], rt: [.689, .504],
});
const curlLeg = edit(beam, {
  lk: [.513, .670], la: [.665, .714], lf: [.674, .723], lt: [.709, .701],
  le: [.390, .700], lw: [.464, .678], re: [.453, .682], rw: [.462, .597],
  n: [.287, .695], ls: [.349, .747], rs: [.331, .727],
});
function swapLegs(pose) {
  return edit(pose, Object.fromEntries(['k', 'a', 'f', 't'].flatMap(joint => [
    ['l' + joint, pose['r' + joint]], ['r' + joint, pose['l' + joint]],
  ])));
}
const bicycle = swapLegs(edit(curlLeg, { rk: [.654, .741], ra: [.795, .696] }));
const flutter = edit(beam, { la: [.742, .629], lk: [.618, .709], lf: [.759, .609], lt: [.800, .600] });

const sidePlank = {
  n: [.245, .629], ls: [.348, .652], le: [.352, .777], lw: [.249, .810],
  rs: [.329, .557], re: [.335, .444], rw: [.339, .334],
  lh: [.508, .700], lk: [.648, .745], la: [.800, .794], lf: [.820, .814], lt: [.861, .804],
  rh: [.502, .651], rk: [.651, .715], ra: [.799, .763], rf: [.816, .790], rt: [.861, .776],
};
const sidePlankLow = edit(sidePlank, {
  lh: [.500, .802], rh: [.504, .771], lk: [.653, .801], rk: [.659, .774],
});

const sitBoat = edit(sit, {
  n: [.500, .481], ls: [.435, .605], rs: [.565, .605],
  lh: [.454, .798], rh: [.546, .798],
  lk: [.453, .678], rk: [.547, .678],
  la: [.438, .751], lf: [.451, .765], lt: [.414, .759],
  ra: [.562, .751], rf: [.549, .765], rt: [.586, .758],
});
const twistL = edit(sitBoat, {
  n: [.44, .48], ls: [.399, .602], le: [.355, .680], lw: [.342, .731],
  rs: [.522, .611], re: [.473, .695], rw: [.358, .737],
});
const superman = edit(prone, {
  n: [.766, .709], ls: [.680, .748], le: [.769, .706], lw: [.863, .658],
  rs: [.696, .757], re: [.792, .719], rw: [.887, .677],
  lk: [.357, .765], la: [.216, .71], lf: [.185, .699], lt: [.169, .728],
  rk: [.373, .775], ra: [.233, .727], rf: [.201, .706], rt: [.175, .746],
});

const jackBase = edit(plank, {
  rs: [.719, .582], rh: [.531, .626], rk: [.375, .688],
  lf: [.190, .764], ra: [.231, .748], rf: [.204, .747], rt: [.253, .802],
});
const jackWide = edit(jackBase, {
  lk: [.333, .733], la: [.150, .772], lf: [.131, .791], lt: [.175, .828],
  rk: [.428, .682], ra: [.370, .749], rf: [.341, .763], rt: [.392, .794],
});
const jackAir = edit(jackWide, {
  la: [.150, .716], lf: [.131, .735], lt: [.175, .769],
  ra: [.370, .693], rf: [.341, .707], rt: [.392, .738],
  lh: [.501, .620], rh: [.527, .590],
});
const jackInAir = edit(jackAir, {
  la: [.214, .713], lf: [.189, .734], lt: [.240, .760],
  ra: [.240, .717], rf: [.213, .723], rt: [.266, .774],
});
const climber = edit(plank, {
  lk: [.601, .655], la: [.494, .759], lf: [.474, .775], lt: [.506, .797],
});

const crab = mirror(edit(sidePlankLow, {
  n: [.251, .542], ls: [.343, .600], le: [.314, .704], lw: [.286, .819],
  rs: [.358, .612], re: [.334, .715], rw: [.310, .838],
  lh: [.501, .703], lk: [.618, .660], la: [.690, .801], lf: [.685, .823], lt: [.745, .833],
  rh: [.514, .722], rk: [.633, .678], ra: [.712, .813], rf: [.713, .834], rt: [.764, .844],
}));
const kick = edit(crab, { lk: [.353, .660], la: [.207, .595], lf: [.197, .617], lt: [.154, .561] });

const bridge = edit(bentLegs, {
  lh: [.479, .723], rh: [.497, .722], lk: [.631, .678], rk: [.608, .660],
  le: [.393, .815], lw: [.489, .837], re: [.363, .803], rw: [.455, .820],
});
const pushDown = edit(plank, {
  n: [.816, .733], ls: [.728, .752], le: [.628, .719],
  rs: [.749, .758], re: [.650, .73],
  lh: [.533, .755], rh: [.550, .762], lk: [.377, .757], rk: [.389, .767],
});
const kneePlank = edit(plank, {
  lk: [.354, .815], rk: [.374, .837], la: [.214, .762], ra: [.232, .777],
  lh: [.504, .705], rh: [.529, .719],
});
const kneeDown = edit(pushDown, {
  lk: kneePlank.lk, rk: kneePlank.rk, lh: [.541, .775], rh: [.550, .781],
});

const dip = {
  n: [.416, .371], ls: [.383, .459], le: [.371, .568], lw: [.359, .672],
  rs: [.407, .469], re: [.395, .576], rw: [.378, .688],
  lh: [.421, .624], lk: [.578, .690], la: [.662, .816], lf: [.644, .832], lt: [.709, .839],
  rh: [.443, .636], rk: [.608, .714], ra: [.688, .831], rf: [.669, .848], rt: [.743, .856],
};
const dipDown = edit(dip, {
  n: [.449, .478], ls: [.413, .567], le: [.315, .561],
  rs: [.433, .573], re: [.336, .571], lh: [.462, .729], rh: [.480, .736],
  lk: [.603, .732], rk: [.625, .742],
});

const pike = edit(plank, {
  n: [.709, .689], ls: [.621, .629], le: [.654, .730],
  rs: [.643, .641], re: [.682, .740],
  lh: [.471, .496], lk: [.356, .624], rh: [.485, .511], rk: [.369, .645],
});
const pikeDown = edit(pike, {
  n: [.734, .780], ls: [.662, .719], le: [.565, .719],
  rs: [.689, .731], re: [.589, .729], lh: [.498, .592], rh: [.511, .601],
  lk: [.371, .677], rk: [.390, .688],
});

const wallSit = edit(side, {
  n: [.421, .370], ls: [.365, .469], le: [.409, .556], lw: [.506, .579],
  rs: [.386, .481], re: [.443, .570], rw: [.536, .586],
  lh: [.364, .641], lk: [.524, .653], la: [.521, .813], lf: [.498, .831], lt: [.570, .835],
  rh: [.388, .659], rk: [.551, .672], ra: [.544, .828], rf: [.520, .840], rt: [.591, .851],
});
const quadL = edit(side, {
  lk: [.473, .645], la: [.374, .540], lf: [.384, .513], lt: [.320, .548],
  le: [.441, .423], lw: [.380, .522],
});
const hamstring = edit(side, {
  n: [.716, .646], ls: [.651, .559], le: [.650, .668], lw: [.612, .761],
  rs: [.675, .573], re: [.675, .686], rw: [.630, .776],
  lh: [.479, .507], rh: [.499, .514], lk: [.485, .649], rk: [.515, .659],
});
const calf = edit(side, {
  n: [.610, .316], ls: [.563, .394], le: [.651, .437], lw: [.742, .410],
  rs: [.590, .400], re: [.684, .443], rw: [.765, .422],
  lh: [.436, .523], lk: [.398, .666], la: [.346, .814], lf: [.328, .834], lt: [.401, .832],
  rh: [.464, .538], rk: [.598, .658], ra: [.587, .816], rf: [.555, .837], rt: [.631, .838],
});

const pair = (a, b) => [[b, 440, 220], [a, 450, 220], [b, 440, 220], [a, 450, 220]];
const reps = (id, rest, target, options = {}) => clip(id, {
  rest, phases: pair(rest, target), expected: { count: 2 }, ...options,
});
const hold = (id, rest, target, options = {}) => clip(id, {
  rest, phases: [[target, 3500, 320], [rest, 350, 280]], expected: { activeMs: [2700, 3800] }, ...options,
});
const alternating = (id, rest, left, right, options = {}) => clip(id, {
  rest, phases: [[left, 400, 180], [rest, 380, 180], [right, 400, 180], [rest, 380, 180]],
  expected: { count: 2 }, ...options,
});

export const strengthClips = [
  reps('squats', side, squat, { wrong: pair(side, shallowSquat) }),
  clip('lunges', {
    rest: split, phases: [[lunge, 440, 220], [split, 440, 220], [side, 200, 180],
      [mirror(split), 400, 230], [mirror(lunge), 440, 220], [mirror(split), 440, 220]],
    expected: { count: 2 },
  }),
  reps('calf-raises', side, heels, { wrong: pair(side, shift(side, .045, 0)) }),
  reps('glute-bridge', bentLegs, bridge),
  hold('wall-sit', side, wallSit, { tags: ['wall-contact-not-inferred'] }),
  reps('push-ups', plank, pushDown, { wrong: pair(plank, edit(pushDown, { lh: [.530, .638], rh: [.55, .647] })) }),
  reps('knee-push-ups', kneePlank, kneeDown, { wrong: pair(plank, pushDown) }),
  reps('chair-dips', dip, dipDown, { tags: ['chair-support-not-inferred'] }),
  reps('pike-push-ups', pike, pikeDown, { wrong: pair(plank, pushDown) }),
  reps('crunches', crunchRest, crunch),
  alternating('bicycle', beam, curlLeg, bicycle, { calibration: flat }),
  reps('leg-raises', flat, raisedLegs, { wrong: pair(flat, bentLegs) }),
  reps('v-ups', flat, vUp, { wrong: pair(flat, raisedLegs) }),
  hold('plank', prone, plank, { wrong: edit(plank, { lh: [.505, .799], rh: [.52, .812] }) }),
  hold('side-plank', sidePlankLow, sidePlank, { wrong: plank }),
  hold('hollow-hold', flat, beam, { wrong: raisedLegs }),
  clip('flutter-kicks', {
    rest: beam, calibration: flat, phases: Array.from({ length: 8 }, (_, i) => [i % 2 ? swapLegs(flutter) : flutter, 180, 150]),
    expected: { activeMs: [700, 3500] }, wrong: raisedLegs,
  }),
  alternating('russian-twists', sitBoat, twistL, mirror(twistL), { calibration: sit }),
  reps('superman', prone, superman, { wrong: pair(prone, edit(superman, { la: prone.la, ra: prone.ra, lk: prone.lk, rk: prone.rk, lt: prone.lt, rt: prone.rt })) }),
  clip('plank-jacks', {
    rest: jackBase,
    phases: Array.from({ length: 2 }, () => [
      [jackAir, 100, 170], [jackWide, 230, 130], [jackInAir, 100, 170], [jackBase, 380, 150],
    ]).flat(),
    wrong: pair(jackBase, jackWide),
    expected: { count: 2 },
  }),
  alternating('crab-kicks', crab, kick, swapLegs(kick)),
  clip('mountain-climbers', {
    rest: plank,
    phases: Array.from({ length: 8 }, (_, i) => [[i % 2 ? swapLegs(climber) : climber, 190, 140], [plank, 120, 130]]).flat(),
    expected: { activeMs: [1300, 5200] }, wrong: squat,
  }),
  hold('quad-stretch', side, quadL, { wrong: edit(quadL, { lw: [.494, .565] }) }),
  hold('hamstring-stretch', side, hamstring, { wrong: squat }),
  hold('calf-stretch', split, calf, { tags: ['wall-contact-not-inferred'] }),
];

// The child holds the first side past its 3-second share, rests, then changes sides.
export const twoSideHolds = [
  ['side-plank', sidePlankLow, sidePlank],
  ['quad-stretch', side, quadL],
  ['calf-stretch', split, calf],
].map(([id, rest, position]) => clip(id, {
  rest,
  phases: [[position, 4500, 320], [rest, 580, 280], [mirror(rest), 600, 350], [mirror(position), 4500, 320]],
  expected: { activeMs: [6000, 6000] },
  tags: ['both-sides-6-seconds'],
}));
