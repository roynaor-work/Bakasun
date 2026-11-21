// Estimate visible movement along the camera plane. No scene geometry or wall
// contact follows from body landmarks, even if a reach or landing is visible.
const STABLE_WINDOW = 250;
const MAX_PASS = 14000;

function newPass(origin, f, time) {
  return { origin, since: time, direction: Math.sign(f.dx(f.hip, origin.hip)), strides: 0,
    flights: 0, forwardJump: false, reachJump: false, reached: false, lowStart: false,
    crosses: 0, bent: 0, skips: 0, backwards: 0, away: 0, widths: 0, farthest: 0 };
}

function legCue(f) {
  const high = f.sides.find(side => side.kneeRise > -.58 &&
    side.kneeRise - f.sides[1 - side.index].kneeRise > .19);
  return high?.index;
}

function inspect(pass, f, time) {
  const { direction } = pass;
  const progress = f.dx(f.hip, pass.origin.hip) * direction;
  pass.farthest = Math.max(pass.farthest, progress);
  const raised = legCue(f);
  if (raised != null && raised !== pass.lastLeg) {
    pass.strides++;
    pass.lastLeg = raised;
    if (f.face * direction < -.085) pass.backwards++;
    if (f.face * direction > .085) pass.away++;
  }
  // A sideways step shows alternating open/close foot spacing even when
  // neither knee is raised high enough to look like a forward stride.
  const width = f.feet > .98 ? 'wide' : f.feet < .71 ? 'narrow' : null;
  if (width && width !== pass.lastWidth) {
    pass.lastWidth = width;
    if (width === 'wide') pass.widths++;
  }
  if (f.kneeAngle < 156 || f.hipRise < -.10 || f.feet > 1.0) pass.bent++;
  const crossed = f.ankleOrder !== Math.sign(f.dx(f.left.hip, f.right.hip)) && f.feet > .23;
  if (crossed && !pass.crossed) pass.crosses++;
  pass.crossed = crossed;
  const airborne = f.footLift > .23 && f.hipRise > .12;
  if (airborne && !pass.airborne) {
    pass.flights++;
    pass.jumpStart = progress;
  }
  if (airborne && raised != null && raised !== pass.lastSkip && f.sides[1 - raised].armUp > .30) {
    pass.skips++;
    pass.lastSkip = raised;
  }
  if (!airborne && pass.airborne) {
    if (progress - pass.jumpStart > .35 && pass.strides >= 2) pass.forwardJump = true;
    if (pass.airReach && pass.strides >= 2) pass.reachJump = true;
    pass.airReach = false;
  }
  if (airborne && f.sides.some(side => side.armUp > .65)) pass.airReach = true;
  pass.airborne = airborne;
  if (progress > 1.65 && f.sides.some(side => side.elbowAngle > 140 &&
    f.dx(side.wrist, side.shoulder) * direction > .70)) pass.reachAt = time;
}

export class HallProgress {
  reset() {
    this.anchor = null;
    this.pass = null;
    this.still = null;
    this.last = null;
    this.departedAt = null;
  }

  update(f, time, spec, signalAt) {
    const last = this.last;
    this.last = f;
    if (!last) return null;
    const drift = f.dist(f.hip, last.hip);
    const stable = drift < .047 && !(f.footLift > .18);
    if (stable && (!this.still || f.dist(f.hip, this.still.pose.hip) > .12)) this.still = { since: time, pose: f };
    if (!stable) this.still = null;
    const settled = stable && time - this.still.since >= STABLE_WINDOW;
    const lowPosition = f.sides.some(side => f.clearance(side.wrist?.y) < .24) && f.torsoUp < .48;
    if (!this.anchor) {
      if (settled) this.anchor = { pose: f, low: lowPosition, at: time };
      return null;
    }
    const gap = f.dx(f.hip, this.anchor.pose.hip);
    if (!this.pass && Math.abs(gap) >= .11) this.departedAt ??= time;
    if (!this.pass && Math.abs(gap) >= .33) {
      this.pass = newPass(this.anchor.pose, f, time);
      this.pass.lowStart = this.anchor.low;
      this.pass.signalled = !spec.signal || Number.isFinite(signalAt) && signalAt <= this.departedAt &&
        signalAt >= this.anchor.at - STABLE_WINDOW;
    }
    if (!this.pass) {
      if (settled && Math.abs(gap) < .11) this.departedAt = null;
      if (lowPosition) this.anchor.low = true;
      return null;
    }
    const pass = this.pass;
    inspect(pass, f, time);
    if (settled && Math.abs(gap) < .23 || time - pass.since > MAX_PASS) {
      this.reset();
      return 'partial';
    }
    if (gap * pass.direction < pass.farthest - .42) {
      this.reset();
      return 'partial';
    }
    if (!settled || pass.farthest < 1.82) return null;
    if (spec.view === 'front') pass.strides = Math.max(pass.strides, pass.widths);
    pass.reached = Number.isFinite(pass.reachAt) && time - pass.reachAt <= 790;
    const accepted = pass.signalled && spec.condition(pass, f);
    this.pass = null;
    this.departedAt = null;
    this.anchor = { pose: f, low: lowPosition, at: time };
    if (!accepted && !spec.signal && pass.strides < 2 && pass.flights === 0 && pass.crosses === 0) return null;
    return accepted ? 'counted' : 'partial';
  }
}
