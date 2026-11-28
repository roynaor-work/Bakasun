import { measure, seen } from './geometry.mjs?v=20261010-camera-1';
import { FORM_HINTS, PROFILES } from './profiles.mjs?v=20261010-camera-1';
import { HallProgress } from './hall.mjs?v=20261010-camera-1';
import { RangeMeter, RANGE_COPY } from './range.mjs?v=20261010-camera-1';
export { RANGE_COPY };
export { CAMERA_EXERCISES } from './profiles.mjs?v=20261010-camera-1';

export const MOTION_MAX_GAP_MS = 275;
const REST_DWELL = 84;
const ACTIVITY_GAP = 1400;
const COACH_MS = 950;
const DEFAULT_CYCLE_MIN = 190;
const TAU = Math.PI * 2;
// After a movement returns to the start, the step counter gets this long to count it before the range decides.
const VERDICT_MS = 450;
const STEP_GRACE = 140;

export class MotionCounter {
  constructor(id, { goal } = {}) {
    if (!Object.hasOwn(PROFILES, id)) throw new RangeError(`Unknown exercise: ${id}`);
    this.spec = PROFILES[id];
    this.goal = Number.isFinite(goal) && goal > 0 ? goal : null;
    this.count = 0;
    this.activeMs = 0;
    this.sideCounts = [0, 0];
    this.sideMs = [0, 0];
    this.observedAt = null;
    this.reference = null;
    this.lastSide = null;
    this.hall = new HallProgress();
    this.range = new RangeMeter(id);
    this.partials = 0;
    this.pause();
  }

  // scales: { leg, arm } from body.mjs when the page runs with camBody=1; absent, nothing changes.
  setReference(points, { aspect = 1, scales = null, depthEase = null } = {}) {
    if (!seen(points, this.spec.required)) return false;
    const f = measure(points, aspect, null, this.spec.required);
    if (!f || this.spec.mode !== 'circles' && !Number.isFinite(f.floor)) return false;
    if (scales) { f.legScale = scales.leg; f.armScale = scales.arm; }
    if (depthEase) f.depthEase = depthEase;
    this.reference = f;
    this.pause();
    if (this.spec.rest?.(f)) this.origin = f;
    return true;
  }

  calibrate(points, options) { return this.setReference(points, options); }

  // A beep represents local application timing, independent of the camera.
  signal(timestamp) {
    if (Number.isFinite(timestamp)) this.signalAt = timestamp;
  }

  pause() {
    this.previous = null;
    this.lastCueAt = null;
    this.cue = null;
    this.holding = null;
    this.restAt = null;
    this.origin = null;
    this.cycle = null;
    this.circle = null;
    this.coachAt = null;
    this.hall.reset();
    this.signalAt = null;
    this.last = null;
    this.requireNeutral = false;
    this.range.reset();
    this.trip = null;
    this.tripCounted = false;
    this.tripFromStart = false;
  }

  result(event = null, hint = null, side = null) {
    return { count: this.count, activeMs: this.activeMs, event, hint, side, partials: this.partials, meter: null,
      sideCounts: [...this.sideCounts], sideMs: [...this.sideMs] };
  }

  update(points, timestamp, { aspect = 1 } = {}) {
    if (!Number.isFinite(timestamp) || this.observedAt != null && timestamp <= this.observedAt) return this.result();
    this.observedAt = timestamp;
    if (!Number.isFinite(aspect) || aspect <= 0 || !seen(points, this.spec.required)) {
      this.pause();
      return this.result('tracking');
    }
    if (!this.reference && !this.setReference(points, { aspect })) return this.result('tracking');
    if (this.previous != null && timestamp - this.previous > MOTION_MAX_GAP_MS) this.pause();
    const gap = this.previous == null ? 0 : timestamp - this.previous;
    const f = measure(points, aspect, this.reference, this.spec.required);
    if (!f) { this.pause(); return this.result('tracking'); }
    this.previous = timestamp;
    const result = this.gauge(this.process(f, timestamp, gap), f, timestamp);
    this.last = f;
    return result;
  }

  // The range of the movement beside the step counter: the meter, a repetition that stopped short, a rushed
  // pace, and the child's own range. Counting itself stays with the stages; the range never adds a count.
  gauge(result, f, t) {
    if (result.event === 'partial') this.partials++;
    if (!this.range.spec) return { ...result, partials: this.partials };
    const moving = this.range.trip != null;
    const { meter, done } = this.range.update(f, t);
    // A movement only speaks for a repetition when it began from the exercise's own starting position.
    if (!moving && this.range.trip) this.tripFromStart = this.origin != null || this.cycle != null;
    let out = { ...result, meter };
    if (result.event === 'counted') this.tripCounted = true;
    // The steps already said "partial" for this movement: the range gives the wording, once.
    const stepPartial = result.event === 'partial';
    if (done) { this.trip = { ...done, at: t, counted: this.tripCounted, said: stepPartial, fromStart: this.tripFromStart }; this.tripCounted = false; }
    else if (stepPartial && this.trip) this.trip.said = true;
    else if (stepPartial) this.stepPartialAt = t;
    const trip = this.trip;
    if (trip && (trip.counted || result.event === 'counted')) {
      this.trip = null;
      this.tripCounted = false;
      out = { ...out, tempo: this.range.rushed(trip) };
    } else if (trip && (t - trip.at >= VERDICT_MS || stepPartial || result.event === 'form')) {
      this.trip = null;
      // An uncounted movement from the starting position teaches the child's own range (two that agree);
      // from then on the stages read the followed angle on the eased scale (see RangeMeter.eased).
      const cycle = this.spec.mode === 'cycle' && !this.spec.alternate && !this.spec.twoSides;
      const own = trip.fromStart && cycle ? this.range.learn(trip) : false;
      if (!trip.reached && trip.peak >= .35) {
        if (!trip.said && !(this.stepPartialAt != null && t - this.stepPartialAt < 1500)) this.partials++;
        out = { ...out, event: 'partial', hint: this.range.spec.cue, short: true, own };
      } else out = { ...out, own };
      this.stepPartialAt = null;
    }
    return { ...out, partials: this.partials };
  }

  process(f, t, gap) {
    switch (this.spec.mode) {
      case 'hall': {
        const event = this.hall.update(f, t, this.spec, this.signalAt);
        if (event === 'counted') {
          if (this.spec.signal) this.signalAt = null;
          return this.creditRep(t);
        }
        if (event === 'partial') return this.result(event, this.spec.hint);
        return this.result();
      }
      case 'hold': return this.hold(f, t, gap);
      case 'alternating': return this.alternating(f, t);
      case 'circles': return this.circles(f, t, gap);
      case 'cycle': return this.cycleAt(f, t);
      default: return this.result();
    }
  }

  creditRep(t, side = null, activityTime = ACTIVITY_GAP) {
    if (this.spec.twoSides && this.goal != null) {
      if (this.sideCounts[side] >= Math.ceil(this.goal / 2)) return this.result('switch', FORM_HINTS.SIDE_SWITCH, side);
      if (this.count >= this.goal) return this.result();
    }
    if (this.spec.kind === 'activity' && this.lastCueAt != null && t - this.lastCueAt <= activityTime) {
      this.activeMs += t - this.lastCueAt;
    }
    this.lastCueAt = t;
    if (side != null) this.lastSide = side;
    if (side === 0 || side === 1) this.sideCounts[side]++;
    this.count++;
    return this.result('counted', null, side);
  }

  coaching(t) {
    this.coachAt ??= t;
    if (t - this.coachAt < COACH_MS) return this.result();
    return this.result('guide', this.spec.hint);
  }

  hold(f, t, gap) {
    const observation = this.spec.check(f);
    const side = this.spec.twoSides ? observation : null;
    const valid = this.spec.twoSides ? side === 0 || side === 1 : observation === true;
    if (!valid) {
      this.holding = null;
      return this.coaching(t);
    }
    this.coachAt = null;
    if (!this.holding || this.holding.side !== side) this.holding = { since: t, side };
    if (t - this.holding.since < 240 || !gap) return this.result();
    let credit = Math.min(gap, t - this.holding.since - 240);
    if (side != null && this.goal != null) credit = Math.min(credit, this.goal * 500 - this.sideMs[side]);
    if (credit <= 0) return side != null && this.goal != null && this.sideMs[side] >= this.goal * 500
      ? this.result('switch', FORM_HINTS.SIDE_SWITCH, side) : this.result();
    if (side != null) this.sideMs[side] += credit;
    this.activeMs += credit;
    return this.result('holding', null, side);
  }

  alternating(f, t) {
    const { neutral, side: getSide, cueDwell = 65 } = this.spec;
    if (neutral?.(f)) this.requireNeutral = false;
    const side = getSide(f);
    if (side !== 0 && side !== 1 || this.requireNeutral) {
      this.cue = null;
      return this.coaching(t);
    }
    if (this.cue?.side !== side) this.cue = { since: t, side };
    if (t - this.cue.since < cueDwell || this.cue.counted) return this.result();
    this.cue.counted = true;
    if (side === this.lastSide) {
      if (t - this.lastCueAt > ACTIVITY_GAP) this.lastCueAt = null;
      return this.result('switch', FORM_HINTS.SIDE_SWITCH, side);
    }
    if (neutral) this.requireNeutral = true;
    this.coachAt = null;
    return this.creditRep(t, side);
  }

  circles(f, t, gap) {
    const arm = f.main;
    const x = f.dx(arm.wrist, arm.shoulder), y = f.dy(arm.wrist, arm.shoulder);
    if (f.torsoUp < .64 || Math.hypot(x, y) < .57 || arm.elbowAngle < 135) {
      this.circle = null;
      return this.coaching(t);
    }
    const a = Math.atan2(y, x);
    if (!this.circle || this.circle.side !== arm.index) this.circle = { angle: a, arc: 0, elapsed: 0, side: arm.index };
    const circle = this.circle;
    const diff = Math.atan2(Math.sin(a - circle.angle), Math.cos(a - circle.angle));
    circle.angle = a;
    if (Math.abs(diff) > 1.25) {
      circle.arc = 0;
      circle.elapsed = 0;
      return this.result();
    }
    if (Math.abs(diff) < .02) return this.coaching(t);
    if (Math.abs(circle.arc) > .12 && Math.sign(diff) !== Math.sign(circle.arc)) {
      circle.arc = 0;
      circle.elapsed = 0;
    }
    circle.arc += diff;
    circle.elapsed += gap;
    this.coachAt = null;
    if (Math.abs(circle.arc) < TAU - .25) return this.result();
    this.activeMs += circle.elapsed;
    circle.arc = 0;
    circle.elapsed = 0;
    return this.creditRep(t, null, 0);
  }

  cycleAt(f, t) {
    const spec = this.spec;
    const rest = spec.rest(f);
    if (this.origin == null) {
      if (!rest) { this.restAt = null; return this.coaching(t); }
      this.restAt ??= t;
      if (t - this.restAt < REST_DWELL) return this.result();
      this.origin = f;
    }
    const pending = this.cycle || { origin: this.origin, startSide: spec.startSide?.(this.origin), since: t,
      index: 0, stepAt: null, peakFoot: -Infinity, leftRest: false };
    const first = spec.steps[0];
    if (!this.cycle && (rest || spec.waitFirst) && !first.test(f, pending)) {
      if (rest) this.origin = f;
      return this.result();
    }
    this.cycle = pending;
    if (!rest) pending.leftRest = true;
    pending.peakFoot = Math.max(pending.peakFoot, f.footLift);
    const issue = spec.form?.(f);
    if (issue) {
      pending.issueAt ??= t;
      if (t - pending.issueAt >= 175) pending.issue = issue;
    } else pending.issueAt = null;
    const step = spec.steps[pending.index];
    const matches = step?.test(this.range.eased(f), pending);
    if (matches) {
      pending.stepAt ??= t;
      pending.missAt = null;
      if (t - pending.stepAt >= step.dwell) {
        pending.index++;
        pending.stepAt = null;
      }
    } else if (step && pending.stepAt != null) {
      // Hysteresis: a joint angle that flickers across its limit for one frame does not restart the stage.
      pending.missAt ??= t;
      if (t - pending.missAt > STEP_GRACE) pending.stepAt = pending.missAt = null;
    }
    const completed = pending.index === spec.steps.length;
    const landed = (spec.finish ? spec.finish(f, pending) : rest) &&
      (!spec.stillFinish || this.last && f.dist(f.hip, this.last.hip) < .053);
    if (completed && landed) {
      pending.finishAt ??= t;
      if (t - pending.finishAt >= (spec.finishDwell ?? 65) && t - pending.since >= (spec.minCycle ?? DEFAULT_CYCLE_MIN)) {
        const side = spec.cycleSide?.(f, pending) ?? pending.side ?? null;
        const event = pending.issue ? this.result('form', pending.issue, side) :
          spec.alternate && side === this.lastSide ? this.result('switch', FORM_HINTS.SIDE_SWITCH, side) : this.creditRep(t, side);
        this.clearCycle(spec.rearm !== false && rest, f, t);
        return event;
      }
    } else pending.finishAt = null;
    // A return to a stable starting pose without the remaining stages ends
    // the attempt. Squat jumps can remain in the rest predicate during takeoff prep.
    if (!completed && rest && pending.leftRest && !matches) {
      pending.backAt ??= t;
      if (t - pending.backAt >= 155) {
        this.clearCycle(true, f, t);
        return this.result('partial', pending.issue ?? spec.hint);
      }
    } else pending.backAt = null;
    if (t - pending.since > (spec.maxCycle ?? 6500)) {
      this.clearCycle(rest, f, t);
      return this.result('partial', pending.issue ?? spec.hint);
    }
    return this.result();
  }

  clearCycle(rearm, pose, t) {
    this.cycle = null;
    this.origin = rearm ? pose : null;
    this.restAt = rearm ? t : null;
    this.coachAt = null;
  }
}
