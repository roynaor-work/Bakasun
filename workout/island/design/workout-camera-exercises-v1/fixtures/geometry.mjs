// All coordinates are drawn numerically, with no source photograph, video or personal data.
// These names are aliases for MediaPipe's image/world indices. Units are normalized image units.
const indices = {
  n: 0, lear: 7, rear: 8, ls: 11, le: 13, lw: 15, lh: 23, lk: 25, la: 27, lf: 29, lt: 31,
  rs: 12, re: 14, rw: 16, rh: 24, rk: 26, ra: 28, rf: 30, rt: 32,
};

export const front = {
  n: [.5, .21], ls: [.432, .32], le: [.403, .42], lw: [.403, .53],
  rs: [.568, .32], re: [.597, .42], rw: [.597, .53],
  lh: [.456, .50], lk: [.455, .65], la: [.445, .80], lf: [.446, .821], lt: [.428, .833],
  rh: [.544, .50], rk: [.545, .65], ra: [.555, .80], rf: [.554, .821], rt: [.572, .833],
};

export const side = {
  n: [.55, .21], ls: [.497, .32], le: [.493, .42], lw: [.509, .53],
  rs: [.507, .33], re: [.510, .431], rw: [.531, .54],
  lh: [.485, .49], lk: [.499, .65], la: [.487, .79], lf: [.480, .818], lt: [.532, .833],
  rh: [.500, .50], rk: [.513, .65], ra: [.504, .804], rf: [.494, .823], rt: [.557, .836],
};

export const edit = (base, changes) => ({ ...base, ...changes });

const map = (pose, fn) => Object.fromEntries(Object.entries(pose).map(([name, point]) => [name, fn(point, name)]));

export const shift = (pose, dx, dy) => map(pose, ([x, y, z]) => [x + dx, y + dy, z]);

export const mirror = pose => map(pose, (unused, name) => {
  const counterpart = name === 'n' ? 'n' : (name[0] === 'l' ? 'r' : 'l') + name.slice(1);
  const [x, y, z] = pose[counterpart];
  return [1 - x, y, z];
});

export function clip(id, { rest = side, calibration = rest, phases, expected, wrong = rest, tags = [] }) {
  return { id, rest, calibration, phases, expected, wrong, tags };
}

const defaultDepth = name => name[0] === 'l' ? -.02 : name[0] === 'r' ? .02 : 0;

function interpolate(a, b, ratio) {
  return map(a, ([x, y, z], name) => {
    const [nextX, nextY, nextZ] = b[name] ?? a[name];
    const startDepth = z ?? defaultDepth(name);
    const depth = z == null && nextZ == null ? undefined : startDepth + ratio * ((nextZ ?? defaultDepth(name)) - startDepth);
    return [x + ratio * (nextX - x), y + ratio * (nextY - y), depth];
  });
}

function landmark(x, y, z = 0, score = .98) {
  return { x, y, z, visibility: score, presence: score };
}

function initialLights() {
  return { p50: 112, p90: 190 };
}

function asPerson(pose, time, { aspect, scale = 1, dx = 0, dy = 0, jitter = 0, missing = [] }) {
  const landmarks = Array.from({ length: 33 }, () => landmark(.5, .5, 0, 0));
  const world = Array.from({ length: 33 }, () => landmark(.5, .5, 0, 0));
  for (const [name, [x, y, z]] of Object.entries(pose)) {
    const point = indices[name];
    const noiseX = jitter * Math.sin(time * .037 + point * 11);
    const noiseY = jitter * Math.cos(time * .031 - point * 7);
    const confidence = missing.includes(name) ? .05 : .98;
    const px = .5 + (x - .5) * scale + dx + noiseX;
    const py = .5 + (y - .5) * scale + dy + noiseY;
    landmarks[point] = landmark(.5 + (px - .5) / aspect, py, z ?? 0, confidence);
    // World coordinates come from the same analytical subject, before image noise and cropping.
    world[point] = landmark(x - .5, y - .5, z ?? defaultDepth(name), confidence);
  }
  for (const [name, xOffset] of [['lear', -.037], ['rear', .027]]) {
    if (pose[name]) continue;
    const i = indices[name];
    const nose = landmarks[0];
    landmarks[i] = landmark(nose.x + xOffset * scale / aspect, nose.y + .025 * scale, 0, nose.visibility);
    world[i] = landmark(world[0].x + xOffset, world[0].y + .025);
  }
  return { landmarks, world };
}

export function durationOf(phases) {
  return phases.reduce((duration, [, hold = 250, transition = 160]) => duration + hold + transition, 0);
}

export function* recording(spec, {
  step = 50, aspect = 1, jitter = 0, scale = 1, dx = 0, dy = 0,
  variant = 'clean', disturbances = () => ({}), speed = 1,
} = {}) {
  // The calibration segment and movement segment are separate, so a floor hold cannot
  // earn progress while the camera is still calibrating.
  const begin = Math.ceil(1450 / step) * step;
  const startHold = 400;
  const duration = Math.ceil((startHold + durationOf(spec.phases) / speed + 500) / step) * step;
  const wrongIsTimeline = Array.isArray(spec.wrong);
  const phases = variant === 'wrong'
    ? wrongIsTimeline ? spec.wrong : [[spec.wrong, duration * speed - 500 * speed, 0]]
    : spec.phases;
  for (let time = 0; time <= begin + duration; time += step) {
    const active = time >= begin;
    const movementMs = active ? (time - begin - startHold) * speed : 0;
    let pose = active ? spec.rest : spec.calibration;
    let elapsed = movementMs;
    if (active && movementMs >= 0) {
      for (const [target, hold = 250, transition = 160] of phases) {
        if (elapsed < transition) {
          pose = interpolate(pose, target, elapsed / transition);
          break;
        }
        pose = target;
        elapsed -= transition;
        if (elapsed < hold) break;
        elapsed -= hold;
      }
    }
    const change = disturbances({ time, active, movementMs, duration });
    const person = asPerson(pose, time, {
      aspect, jitter, scale: change.scale ?? scale,
      dx: dx + (change.dx ?? 0), dy: dy + (change.dy ?? 0), missing: change.missing,
    });
    const poses = change.absent ? [] : [person];
    if (change.secondary) {
      poses.push(asPerson(change.secondary.pose ?? front, time, {
        aspect, scale: change.secondary.scale ?? .61,
        dx: change.secondary.dx ?? .31, dy: change.secondary.dy ?? .02,
      }));
      if (change.secondary.first) poses.reverse();
    }
    yield { time, active, movementMs, poses, light: change.light ?? initialLights(), aspect, orientation: change.orientation };
  }
}
