// A single, local exercise session. Coordinates are normalized to the
// uncropped video. Frame pixels remain with the capture code.
const CORE = [11, 12, 23, 24];
const HEAD = [0, 7, 8];
const FEET = [27, 28, 29, 30, 31, 32];
const BODY = [...HEAD, ...CORE, 25, 26, ...FEET];
const LINKS = [[11, 23], [12, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
const minConfidence = .49;
const maxFrameGap = 360;
const maxCalibrationSamples = 24;
// Share of the background (outside the body) that changed between two frames: above this the phone itself moved.
const sceneMoved = .16;
// Hysteresis: a joint must be clear to start (minConfidence), and may dip to this while the child is tracked.
const stayConfidence = .36;
// A child who was tracked and drops out for a blink (a fast jump, an arm across the body) keeps the
// calibration for this long, so the count goes on without asking for a still pose in mid-exercise.
const graceMs = 850;

const MESSAGES = {
  calibrating: 'אפשר להישאר רגע בתנוחת ההתחלה, כדי שנראה איפה הגוף שלך.',
  demo: 'אפשר להדגים תנועה אחת בקצב נוח. המונה יגיב כשכל התנועה נראית.',
  dark: 'אפשר להדליק אור מלפנים כדי שנראה את הגוף.',
  backlit: 'אפשר להסתובב כך שהאור יאיר אותך מלפנים.',
  multiple: 'כרגע רואים יותר מאדם אחד. כדי שנוכל לספור, כדאי שרק מי שמתאמן יישאר בתמונה.',
  missing: 'אפשר לעבור למקום שבו רואים את הגוף ואת האיברים שעובדים בתרגיל.',
  'move-back': 'אפשר לזוז קצת אחורה, כדי שיהיה מקום לכל התנועה בתמונה.',
  'move-closer': 'אפשר להתקרב קצת למצלמה כדי שנראה את התנועה בבירור.',
  center: 'אפשר להתמקם במרכז התמונה, עם מקום לגוף לזוז.',
  'raise-phone': 'אפשר להרים מעט את הטלפון על משטח יציב ולכוון אותו כך שגם הראש וגם הרגליים ייראו.',
  'turn-side': 'אפשר לעמוד או להסתובב עם הצד לכיוון המצלמה.',
  'face-camera': 'אפשר לפנות אל המצלמה.',
  reacquiring: 'המצלמה מחפשת שוב את תנוחת ההתחלה. אפשר לחכות רגע.',
  stale: 'רגע, המצלמה מחכה לתמונה חדשה.',
  'phone-moved': 'הטלפון זז. נכוון שוב את המקום שלך בתמונה.',
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const confidence = point => Math.min(point.visibility ?? 0, point.presence ?? 1);
const visible = (point, minimum = minConfidence) => finite(point) && confidence(point) >= minimum;
const bounds = (p, margin = 0) => p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin;
const distance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const median = values => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const meanPoint = points => points.length > 0 ? {
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
} : null;

function pointsAt(points, ids, threshold) {
  return ids.map(id => points[id]).filter(point => visible(point, threshold));
}

function describe(points, aspect) {
  const shoulders = pointsAt(points, [11, 12], .38);
  const hips = pointsAt(points, [23, 24], .38);
  const shoulder = meanPoint(shoulders);
  const hip = meanPoint(hips);
  if (!shoulder || !hip) return null;
  const links = LINKS.map(([a, b]) => visible(points[a], .38) && visible(points[b], .38)
    ? distance(points[a], points[b], aspect) : null);
  const torso = median(links.slice(0, 2).filter(value => value != null)) ?? distance(shoulder, hip, aspect);
  return { shoulder, hip, center: meanPoint([shoulder, hip]), torso, links };
}

function crediblePerson(pose, aspect) {
  const points = pose?.landmarks;
  if (!Array.isArray(points)) return false;
  const core = pointsAt(points, CORE, .34);
  const head = pointsAt(points, HEAD, .42);
  const shoulders = pointsAt(points, [11, 12], .34);
  // Also recognize a second person entering head and shoulders first. This check
  // runs before any size, workout-position, or active-person checks.
  const upperBody = head.length >= 1 && shoulders.length === 2 && distance(shoulders[0], shoulders[1], aspect) >= .022;
  const lower = pointsAt(points, [25, 26, 27, 28], .42);
  const body = core.length >= 3 || (core.length >= 2 && (head.length >= 1 || lower.length >= 2) &&
    (describe(points, aspect)?.torso ?? 0) >= .023);
  return (upperBody || body) && [...core, ...head].some(point => bounds(point));
}

// The model sometimes answers twice for one body (two overlapping detections). Two answers whose torsos sit
// on the same spot at the same size are one person, not a second child in the room.
function samePerson(a, b, aspect) {
  const first = describe(a.landmarks, aspect), second = describe(b.landmarks, aspect);
  if (!first || !second) return false;
  const size = Math.max(first.torso, second.torso);
  return distance(first.center, second.center, aspect) < .55 * size && Math.abs(Math.log(first.torso / second.torso)) < .45;
}
const clarity = pose => CORE.concat(25, 26, 27, 28).reduce((sum, id) => sum + (finite(pose.landmarks[id]) ? confidence(pose.landmarks[id]) : 0), 0);

// Seen from the side, the far shoulder and leg hide behind the near ones and the model marks them as unsure
// even when it places them well. A far joint the model still places inside the picture is accepted when its
// near twin is seen clearly; a joint the model has no idea about (or puts outside) stays hidden. The far
// arm is left alone: it moves on its own and hides behind the body.
const TWINS = [[11, 12], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
// Lying on the floor side-on, the far arm lies along the near one as the far leg does.
const ARM_TWINS = [[13, 14], [15, 16]];
const FAR_SIDE = .12;
function pairSides(pose, arms) {
  const landmarks = pose.landmarks.map(point => point);
  for (const pair of arms ? [...TWINS, ...ARM_TWINS] : TWINS) for (const [near, far] of [pair, [pair[1], pair[0]]]) {
    const a = landmarks[near], b = landmarks[far];
    if (visible(a) && finite(b) && bounds(b) && confidence(b) >= FAR_SIDE && confidence(b) < minConfidence + .02) {
      landmarks[far] = { ...b, visibility: minConfidence + .02, presence: Math.max(b.presence ?? 1, minConfidence + .02), paired: true };
    }
  }
  return { ...pose, landmarks };
}

// An optional normalized rectangle allows capture code to sample around a
// detected torso as well as across the image. Returns scalars only.
export function measureLight(rgba, dimensions) {
  if (!rgba || rgba.length < 4) return null;
  const histogram = new Uint32Array(256);
  let count = 0;
  let torsoCount = 0;
  let torsoHistogram = null;
  const { width, height, region } = dimensions ?? {};
  if (region && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
      width * height * 4 === rgba.length && [region.left, region.top, region.right, region.bottom].every(Number.isFinite)) {
    torsoHistogram = new Uint32Array(256);
  }
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const luminance = (54 * rgba[i] + 183 * rgba[i + 1] + 19 * rgba[i + 2]) >> 8;
    histogram[luminance]++;
    count++;
    if (!torsoHistogram) continue;
    const x = (i / 4 % width + .5) / width;
    const y = (Math.floor(i / 4 / width) + .5) / height;
    if (x >= region.left && x <= region.right && y >= region.top && y <= region.bottom) {
      torsoHistogram[luminance]++;
      torsoCount++;
    }
  }
  if (!count) return null;
  const percentile = (distribution, size, ratio) => {
    const target = Math.ceil(size * ratio);
    let sum = 0;
    for (let level = 0; level < distribution.length; level++) {
      sum += distribution[level];
      if (sum >= target) return level;
    }
    return 255;
  };
  const light = { p50: percentile(histogram, count, .5), p90: percentile(histogram, count, .9) };
  if (torsoCount >= 6) {
    light.subjectP50 = percentile(torsoHistogram, torsoCount, .5);
    light.subjectP90 = percentile(torsoHistogram, torsoCount, .9);
  }
  return light;
}

function lightStatus(light) {
  if (!light || !Number.isFinite(light.p50) || !Number.isFinite(light.p90)) return null;
  const { p50, p90, subjectP50, subjectP90 } = light;
  if (p90 < 48 || (p50 < 28 && p90 < 72)) return 'dark';
  // A dark shirt alone is weak evidence. Require low ambient brightness and
  // hardly any light on the combined head/torso sample near a brighter area.
  if (p90 >= 130 && p50 < 50 && Number.isFinite(subjectP50) && subjectP50 < 29 &&
      (Number.isFinite(subjectP90) ? subjectP90 < 60 : subjectP50 < 24)) return 'backlit';
  return null;
}

function framing(points, shape, required, setup, minimum = minConfidence) {
  if (!shape) return 'missing';
  const body = pointsAt(points, BODY, .40);
  const head = pointsAt(points, HEAD, .40);
  const feet = pointsAt(points, FEET, .40);
  const minX = Math.min(...body.map(p => p.x));
  const maxX = Math.max(...body.map(p => p.x));
  const minY = Math.min(...body.map(p => p.y));
  const maxY = Math.max(...body.map(p => p.y));
  const headAtTop = head.some(p => p.y < .036) ||
    (head.length === 0 && shape.shoulder.y < .115);
  const fit = required.find(group => group.every(id => visible(points[id], minimum) && bounds(points[id], .017)));
  const clipped = !fit && required.some(group => group.some(id => visible(points[id], .35) && !bounds(points[id], .035)));
  if (maxX - minX > .88 || maxY - minY > .89 || shape.torso > .43) return 'move-back';
  if (shape.torso < .057) return 'move-closer';
  const feetHaveRoom = feet.length > 0 && feet.every(p => p.y < .83);
  if (setup !== 'floor' && headAtTop && feetHaveRoom && minX >= .035 && maxX <= .965) return 'upper-edge';
  if (!bounds(shape.center, .12) || clipped || minX < .015 || maxX > .985 ||
      minY < .012 || maxY > .988 || (setup !== 'floor' && headAtTop)) return 'center';
  return !fit ? 'missing' : null;
}

function viewHint(points, shape, aspect, view) {
  const shoulders = pointsAt(points, [11, 12], .23);
  const hips = pointsAt(points, [23, 24], .23);
  if (shoulders.length !== 2 || hips.length !== 2) return null;
  const width = (distance(...shoulders, aspect) + distance(...hips, aspect)) / (2 * shape.torso);
  if (view === 'side' && width > .71) return 'turn-side';
  if (view === 'front' && width < .37) return 'face-camera';
  return null;
}

function movedTooFast(previous, current, aspect, dt, calibration) {
  if (!previous) return false;
  const torsoShift = Math.log(current.torso / previous.torso);
  const corroboration = current.links.filter((length, i) => length >= .025 && previous.links[i] >= .025 &&
    Math.log(length / previous.links[i]) * Math.sign(torsoShift) > .25).length;
  // A foreshortened torso can change quickly during a crouch or turn. A scale
  // jump is stronger evidence when bones in several parts change together.
  const resized = Math.abs(torsoShift) > .65 || (Math.abs(torsoShift) > .38 && corroboration >= 4);
  const bodySize = Math.max(current.torso, previous.torso, calibration?.torso ?? 0);
  // A jump moves the body up and down faster than a walk moves it sideways, and a slow phone sees it in
  // fewer frames. The vertical allowance therefore grows faster with the frame interval; a sideways
  // leap of the centre, which is how another person takes over the track, keeps the tight limit.
  const sideways = Math.abs(previous.center.x - current.center.x) * aspect;
  const relocated = sideways > Math.max(.075, bodySize * (.51 + dt / 205)) ||
    distance(previous.center, current.center, aspect) > Math.max(.075, bodySize * (.51 + dt / 110));
  return resized || relocated;
}

function smoothPoints(points, previous, dt, scale, aspect, minimum) {
  if (!Array.isArray(points)) return [];
  return points.map((point, id) => {
    if (!finite(point)) return null;
    const old = previous?.[id];
    if (!visible(point, minimum) || !visible(old, minimum)) return { ...point };
    const shift = distance(point, old, aspect) / scale;
    const blend = 1 - Math.exp(-dt / (108 / (1 + 15 * Math.max(0, shift - .05))));
    return { ...point, x: old.x + blend * (point.x - old.x), y: old.y + blend * (point.y - old.y),
      ...(Number.isFinite(old.z) && Number.isFinite(point.z) ? { z: old.z + blend * (point.z - old.z) } : {}) };
  });
}

function smoothPose(pose, previous, dt, shape, aspect) {
  const worldTorso = describe(pose.world ?? [], 1)?.torso;
  return {
    landmarks: smoothPoints(pose.landmarks, previous?.landmarks, dt, shape.torso, aspect, .38),
    world: smoothPoints(pose.world, previous?.world, dt, Math.max(.07, worldTorso ?? .3), 1, .38),
  };
}

export class PoseTracker {
  constructor({ aspect = 1, view = 'either', setup = 'standing', calibrationMs = 650, required = [] } = {}) {
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    this.view = view;
    this.setup = setup;
    this.calibrationMs = Number.isFinite(calibrationMs) ? clamp(calibrationMs, 200, 2000) : 650;
    this.required = Array.isArray(required[0]) ? required : [required];
    this.reset();
  }

  reset() {
    this.lastTime = null;
    this.upperEdgeSince = null;
    this.demoShown = false;
    this.movedFrames = 0;
    this.movedAt = null;
    this.readyAt = null;
    this.resumed = false;
    this._dropTrack();
  }

  _dropTrack() {
    this.shape = null;
    this.filtered = null;
    this.samples = [];
    this.anchor = null;
    this.stableSince = null;
    this.calibration = null;
  }

  _blocked(status) {
    // A short loss of a tracked child keeps what was learnt; anything longer, or any other reason, starts over.
    const brief = ['missing', 'center'].includes(status) && this.calibration &&
      this.readyAt != null && this.lastTime - this.readyAt <= graceMs;
    if (brief) {
      this.shape = null;
      this.filtered = null;
      this.resumed = true;
    } else this._dropTrack();
    return { status, ready: false, pose: null, gap: true, calibration: null,
      hint: { code: status, text: MESSAGES[status] } };
  }

  _gather(shape, pose, time) {
    const anchor = this.anchor;
    if (!anchor || distance(anchor.center, shape.center, this.aspect) > Math.max(.026, anchor.torso * .23) ||
        Math.abs(Math.log(shape.torso / anchor.torso)) > .14) {
      this.anchor = shape;
      this.samples.length = 0;
      this.stableSince = time;
    }
    const floor = median(pointsAt(pose.landmarks, FEET, .45).map(p => p.y));
    this.samples.push({ torso: shape.torso, floor, center: shape.center });
    if (this.samples.length > maxCalibrationSamples) this.samples.shift();
    if (this.samples.length < 4 || time - this.stableSince < this.calibrationMs) return null;
    return {
      torso: median(this.samples.map(sample => sample.torso)),
      floor: median(this.samples.flatMap(sample => sample.floor == null ? [] : [sample.floor])),
      center: {
        x: median(this.samples.map(sample => sample.center.x)),
        y: median(this.samples.map(sample => sample.center.y)),
      },
      reference: pose,
    };
  }

  update({ poses = [], time, aspect = this.aspect, light, scene } = {}) {
    if (!Number.isFinite(time) || time < 0 || (this.lastTime != null && time <= this.lastTime)) {
      this.upperEdgeSince = null;
      return this._blocked('stale');
    }
    const dt = this.lastTime == null ? 0 : time - this.lastTime;
    this.lastTime = time;
    if (dt > maxFrameGap || (Number.isFinite(aspect) && aspect > 0 && Math.abs(Math.log(aspect / this.aspect)) > .045)) {
      this.upperEdgeSince = null;
      this._dropTrack();
    }
    if (Number.isFinite(aspect) && aspect > 0) this.aspect = aspect;
    // The phone was knocked or picked up: the floor line and the framing learnt before no longer hold, so the
    // track is dropped and the framing check and the short calibration run again. One changed frame can be a
    // door or a passer-by; two in a row, or a second within a moment, is the phone.
    this.movedFrames = scene > sceneMoved ? this.movedFrames + 1 : 0;
    if (this.movedFrames >= 2) this.movedAt = time;
    if (this.movedAt != null && time - this.movedAt < 500) {
      this.upperEdgeSince = null;
      return this._blocked('phone-moved');
    }
    let people = Array.isArray(poses) ? poses.filter(pose => crediblePerson(pose, this.aspect)) : [];
    if (people.length === 2 && samePerson(people[0], people[1], this.aspect)) {
      people = [clarity(people[0]) >= clarity(people[1]) ? people[0] : people[1]];
    }
    const illumination = lightStatus(light);
    if (people.length !== 1 || illumination) {
      this.upperEdgeSince = null;
      if (people.length > 1) return this._blocked('multiple');
      if (illumination) return this._blocked(illumination);
      if (light?.p50 < 32 && light?.p90 >= 130) return this._blocked('backlit');
      return this._blocked('missing');
    }

    const person = this.view === 'side' ? pairSides(people[0], this.setup === 'floor') : people[0];
    const shape = describe(person.landmarks, this.aspect);
    const looking = framing(person.landmarks, shape, this.required, this.setup, this.calibration ? stayConfidence : minConfidence);
    if (looking === 'upper-edge') {
      this.upperEdgeSince ??= time;
      return this._blocked(time - this.upperEdgeSince >= 280 ? 'raise-phone' : 'center');
    }
    this.upperEdgeSince = null;
    if (looking) return this._blocked(looking);
    if (movedTooFast(this.shape, shape, this.aspect, dt, this.calibration)) return this._blocked('reacquiring');

    if (!this.calibration) {
      const turn = viewHint(person.landmarks, shape, this.aspect, this.view);
      if (turn) return this._blocked(turn);
    }
    this.shape = shape;
    this.filtered = smoothPose(person, this.filtered, clamp(dt, 12, 150), shape, this.aspect);
    const starting = !this.calibration;
    this.calibration ??= this._gather(shape, this.filtered, time);
    if (!this.calibration) {
      return { status: 'calibrating', ready: false, pose: null, gap: true, calibration: null,
        hint: { code: 'calibrating', text: MESSAGES.calibrating } };
    }
    const hint = this.demoShown ? null : { code: 'demo', text: MESSAGES.demo };
    this.demoShown = true;
    const gap = starting || this.resumed;
    this.resumed = false;
    this.readyAt = time;
    return { status: 'ready', ready: true, pose: this.filtered, gap, calibration: this.calibration, hint };
  }
}
