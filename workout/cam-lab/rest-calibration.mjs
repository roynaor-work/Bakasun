// Per-person preparation only. Never learn a return angle from counted motion.
export const REST_CALIBRATION = { minFrames: 8, minDurationMs: 600, maxRange: 6,
  waitMs: 1200, margin: 20, minUp: 138, maxUp: 157, minReference: 146, startMargin: 7 };
const rules = {
  squats: { feature: 'squat', up: 'squatUp', start: 'squatStart', down: 'squatDown' },
  lunges: { feature: 'lunge', up: 'lungeUp', start: 'lungeStart', down: 'lungeDown' },
  'push-ups': { feature: 'elbow', up: 'pushUp', start: 'pushStart', down: 'pushDown', line: 'bodyLine' },
  'knee-push-ups': { feature: 'elbow', up: 'pushUp', start: 'pushStart', down: 'pushDown', line: 'kneeBodyLine' },
};
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
};

export class RestCalibration {
  constructor(exercise, thresholds) {
    this.rule = rules[exercise]; this.t = thresholds; this.defaults = { ...thresholds }; this.samples = [];
    this.waitSince = null; this.lastTime = null; this.result = null;
  }
  reset() {
    Object.assign(this.t, this.defaults); this.samples = []; this.waitSince = null; this.lastTime = null; this.result = null;
  }
  get ready() {
    return this.samples.length >= REST_CALIBRATION.minFrames &&
      this.samples.at(-1).time - this.samples[0].time >= REST_CALIBRATION.minDurationMs;
  }
  update(f, time, fresh = true) {
    if (this.result || !this.rule) return true;
    if (!Number.isFinite(time) || this.lastTime != null && time <= this.lastTime) return false;
    if (this.lastTime != null && time - this.lastTime > this.t.maxGap) this.samples = [];
    this.lastTime = time;
    if (fresh && f) this.waitSince ??= time;
    const value = f?.[this.rule.feature];
    const aligned = !this.rule.line || f?.[this.rule.line] >= this.t.bodyStraight;
    if (!fresh || !Number.isFinite(value) || value < REST_CALIBRATION.minReference || !aligned) this.samples = [];
    else {
      this.samples.push({ value, time });
      this.samples = this.samples.filter(s => time - s.time <= REST_CALIBRATION.waitMs);
      while (this.samples.length > 1 && Math.max(...this.samples.map(s => s.value)) -
        Math.min(...this.samples.map(s => s.value)) > REST_CALIBRATION.maxRange) this.samples.shift();
    }
    return this.ready || this.waitSince != null && time - this.waitSince >= REST_CALIBRATION.waitMs;
  }
  finalize() {
    if (this.result) return this.result;
    const baseline = median(this.samples.map(s => s.value)), calibrated = !!this.rule && this.ready;
    if (calibrated) {
      this.t[this.rule.up] = Math.max(REST_CALIBRATION.minUp, Math.min(REST_CALIBRATION.maxUp, baseline - REST_CALIBRATION.margin));
      this.t[this.rule.start] = this.t[this.rule.up] - REST_CALIBRATION.startMargin;
    }
    this.result = { status: !this.rule ? 'not-applicable' : calibrated ? 'calibrated' : 'fallback',
      reason: !this.rule ? 'no-standing-angle' : calibrated ? null : 'insufficient-stable-frames',
      median: baseline, frames: this.samples.length,
      durationMs: this.samples.length ? this.samples.at(-1).time - this.samples[0].time : 0,
      thresholds: this.rule ? Object.fromEntries([this.rule.up, this.rule.start, this.rule.down].map(key => [key, this.t[key]])) : {} };
    return this.result;
  }
}
