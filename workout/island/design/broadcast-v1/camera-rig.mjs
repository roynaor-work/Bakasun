import * as T from '../../vendor/three.module.js';

const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
const v = a => new T.Vector3(...a);
const halfFov = f => Math.tan(T.MathUtils.degToRad(f) / 2);

/** Independent camera controller. Subjects and replay progress are supplied by the host. */
export class BroadcastCamera {
  constructor(camera, config) {
    this.camera = camera; this.config = config; this.sport = 'soccer'; this.mode = 'broadcast';
    this.target = new T.Vector3(); this.follow = new T.Vector3(); this.initialized = false;
    this.transition = null; this.elapsed = 0; this.focusDistance = 30; this.motion = new T.Vector2();
    this.lastProjected = new T.Vector3(); this.lastSubject = new T.Vector3(); this.currentFov = halfFov(camera.fov);
    this.orientationProbe = new T.PerspectiveCamera();
    camera.near = config.lens.near; camera.far = config.lens.far;
  }
  select(sport, mode, seconds = this.config.transition.seconds) {
    this.sport = sport; this.mode = mode;
    if (this.initialized) this.transition = {position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), target: this.target.clone(), fov: this.currentFov, seconds, elapsed: 0};
    this.motion.set(0, 0); this.resetMotion = true;
  }
  get preset() { return this.config.sports[this.sport][this.mode]; }
  update(dt, subject, velocity, portrait, replayProgress = 0) {
    const cfg = this.config, preset = this.preset;
    const goal = subject.clone();
    if (this.mode !== 'replay') {
      const lead = velocity.clone().multiplyScalar(cfg.tracking.leadSeconds).clampLength(0, cfg.tracking.maxLeadMetres);
      goal.add(lead).multiplyScalar(preset.trackWeight);
    }
    goal.y = 0;
    if (!this.initialized) this.follow.copy(goal);
    const delta = goal.clone().sub(this.follow);
    const alpha = 1 - Math.exp(-Math.LN2 * dt / cfg.transition.followHalfLifeSeconds);
    if (delta.length() > cfg.tracking.deadZoneMetres || this.mode === 'replay') this.follow.add(delta.multiplyScalar(alpha).clampLength(0, cfg.transition.maxFollowSpeedMetresPerSecond * dt));
    let offset, targetOffset, fov;
    if (this.mode === 'replay') {
      const keys = preset.keyframes;
      const u = T.MathUtils.clamp(replayProgress, 0, 1);
      const a = u <= keys[1].t ? keys[0] : keys[1], b = u <= keys[1].t ? keys[1] : keys[2];
      const t = smooth((u - a.t) / (b.t - a.t));
      offset = v(a.offset).lerp(v(b.offset), t).multiplyScalar(portrait ? preset.portraitDistanceMultiplier : 1);
      targetOffset = v(a.targetOffset).lerp(v(b.targetOffset), t); fov = portrait ? preset.portraitFov : preset.fov;
    } else {
      const pose = preset[portrait ? 'portrait' : 'landscape'];
      offset = v(pose.offset); targetOffset = v(pose.targetOffset); fov = pose.fov;
    }
    const position = this.follow.clone().add(offset);
    position.y = Math.max(position.y, cfg.tracking.minimumHeight);
    const target = this.follow.clone().add(targetOffset);
    const probe = this.orientationProbe; probe.position.copy(position); probe.lookAt(target);
    let lens = halfFov(fov);
    if (this.transition) {
      const tr = this.transition; tr.elapsed += dt;
      const t = smooth(Math.min(1, tr.elapsed / tr.seconds));
      this.camera.position.copy(tr.position).lerp(position, t);
      this.camera.quaternion.copy(tr.quaternion).slerp(probe.quaternion, t);
      this.target.copy(tr.target).lerp(target, t); lens = T.MathUtils.lerp(tr.fov, lens, t);
      if (t === 1) this.transition = null;
    } else {
      this.camera.position.copy(position); this.camera.quaternion.copy(probe.quaternion); this.target.copy(target);
    }
    this.currentFov = lens; this.camera.fov = T.MathUtils.radToDeg(2 * Math.atan(lens));
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    const focus = this.camera.position.distanceTo(this.target);
    this.focusDistance = this.initialized ? T.MathUtils.lerp(this.focusDistance, focus, 1 - Math.exp(-dt * 5)) : focus;
    // Project a FIXED world point through consecutive camera transforms. A stationary
    // camera therefore produces zero blur even when the tracked athlete moves.
    const anchor = this.initialized ? this.lastSubject.clone() : subject.clone();
    anchor.project(this.camera);
    this.motion.set(this.lastProjected.x - anchor.x, this.lastProjected.y - anchor.y).multiplyScalar(.5);
    if (this.resetMotion || !this.initialized || this.transition) this.motion.set(0, 0);
    this.lastSubject.copy(subject); this.lastProjected.copy(subject).project(this.camera);
    this.resetMotion = false; this.initialized = true;
  }
  snapshot() {
    return {sport: this.sport, mode: this.mode, transitioning: !!this.transition, position: this.camera.position.toArray(), target: this.target.toArray(), fov: this.camera.fov, focusDistance: this.focusDistance};
  }
}

/** Three-tier controller with warmup, hysteresis, hidden-tab reset and manual lock. */
export class AdaptiveQuality {
  constructor(config, apply) {
    this.config = config; this.apply = apply; this.tier = config.defaultTier; this.auto = true;
    this.age = 0; this.windowAge = 0; this.cooldown = 0; this.bad = 0; this.good = 0;
    this.frames = []; this.work = []; this.p90 = {frame: 0, work: 0}; this.changes = []; this.ignore = 3;
  }
  select(tier, automatic = false) {
    if (!(tier in this.config.tiers)) throw Error('Unknown quality tier');
    const before = this.tier; this.tier = tier; this.auto = automatic;
    this.cooldown = this.config.adaptive.cooldownSeconds; this.bad = this.good = 0;
    this.frames = []; this.work = []; this.windowAge = 0; this.ignore = 3;
    if (tier !== before) this.changes.push({from: before, to: tier, atSeconds: this.age});
    this.apply(tier);
  }
  resetSamples() { this.frames = []; this.work = []; this.windowAge = 0; this.ignore = 3; }
  sample(frameMs, workMs, dt) {
    if (this.ignore-- > 0) return;
    this.age += dt; this.cooldown = Math.max(0, this.cooldown - dt); this.windowAge += dt;
    this.frames.push(frameMs); this.work.push(workMs);
    const c = this.config.adaptive;
    if (this.windowAge < c.sampleWindowSeconds) return;
    const p90 = a => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * .9)] || 0;
    this.p90 = {frame: p90(this.frames), work: p90(this.work)};
    this.frames = []; this.work = []; this.windowAge = 0;
    if (!this.auto || this.age < c.warmupSeconds || this.cooldown > 0) return;
    const overloaded = this.p90.frame > c.downgradeFrameP90Ms || this.p90.work > c.downgradeWorkP90Ms;
    this.bad = overloaded ? this.bad + 1 : 0;
    this.good = !overloaded && this.p90.work < c.upgradeWorkP90Ms && this.p90.frame < c.upgradeFrameP90Ms ? this.good + 1 : 0;
    const order = ['economy', 'balanced', 'high'], i = order.indexOf(this.tier);
    if ((this.bad >= c.downgradeWindows || this.p90.work > c.emergencyWorkMs) && i > 0) this.select(order[i - 1], true);
    else if (this.good >= c.upgradeWindows && i < 2) this.select(order[i + 1], true);
  }
}
