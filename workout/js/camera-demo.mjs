import { Figure, lerpPose } from './figure.js?v=20261010-camera-1';

// One stage is resized and reused for intro, corner, correction and help.
export class CameraDemo {
  constructor({ exercise, stage, paint = () => {}, say = () => {}, now = () => performance.now(),
    setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { exercise, stage, paint, say, now, setTimer, clearTimer });
    this.setTimer = (...args) => setTimer.call(globalThis, ...args);
    this.clearTimer = (...args) => clearTimer.call(globalThis, ...args);
    this.mode = 'intro'; this.running = false; this.lowFps = false; this.dead = false;
    this.paint(this.mode); this.stage.play(exercise, .75);
  }
  start() { this.running = true; if (this.mode !== 'help') this.corner(); }
  prepare() { this.prepared = true; if (this.mode !== 'help') this.corner(); }
  corner() {
    if (this.dead) return;
    this.mode = this.running || this.prepared ? 'corner' : 'intro'; this.paint(this.mode);
    this.mode === 'corner' ? this.stage.still(this.exercise) : this.stage.play(this.exercise, .75);
  }
  reject(reason) {
    if (this.dead || this.mode === 'help') return;
    this.clearTimer(this.timer); this.mode = 'correction'; this.paint(this.mode);
    this.stage.play(this.exercise, .35); this.say(reason);
    this.timer = this.setTimer(() => this.corner(), 2000);
  }
  help(open) {
    if (this.dead) return;
    this.clearTimer(this.timer);
    if (open) { this.mode = 'help'; this.paint(this.mode); this.stage.play(this.exercise, .35); }
    else this.corner();
  }
  follow(features, thresholds, fps) {
    if (this.dead || this.mode !== 'corner') return;
    if (fps != null && fps < 12) {
      if (!this.lowFps) this.stage.stop();
      this.lowFps = true; return;
    }
    this.lowFps = false;
    if (!features) return;
    const id = this.exercise.id, f = features, t = thresholds;
    let progress;
    if (id === 'squats') progress = (t.squatUp - f.squat) / (t.squatUp - t.squatDown);
    else if (id === 'lunges') progress = (t.lungeUp - f.lunge) / (t.lungeUp - t.lungeDown);
    else if (id.includes('push-ups')) progress = (t.pushUp - f.elbow) / (t.pushUp - t.pushDown);
    else if (id === 'glute-bridge') progress = (f.bridge - t.bridgeDown) / (t.bridgeUp - t.bridgeDown);
    else if (id === 'jumping-jacks') progress = (f.feet - t.jackClosed) / (t.jackOpen - t.jackClosed);
    else progress = Math.max(f.leftRise || 0, f.rightRise || 0) / t.kneeRise;
    if (!Number.isFinite(progress)) return;
    const frames = this.exercise.frames;
    // High knees' alternate key pose follows the child's raised leg.
    const rest = id === 'high-knees' ? frames[1][0] : frames[0][0];
    const target = id === 'high-knees' ? frames[f.rightRise > f.leftRise ? 2 : 0][0] : id === 'jumping-jacks' ? frames[2][0] : frames[1][0];
    this.stage.showPose(lerpPose(rest, target, Math.max(0, Math.min(1, progress))));
  }
  dispose() { this.dead = true; this.clearTimer(this.timer); this.stage.dispose(); }
}

export function cameraStage(box, exercise, use3d = true) {
  let stage = null, dead = false, last = ['play', exercise, .75];
  const apply = () => { if (stage) stage[last[0]](...last.slice(1)); };
  const fallback = () => {
    if (dead) return;
    stage?.dispose?.(); box.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('figure'); box.append(svg);
    stage = new Figure(svg); stage.showPose = p => { stage.stop(); stage.draw(p); };
    stage.dispose = () => stage.stop(); apply();
  };
  if (use3d) import('./stage3d.js?v=20261010-camera-1').then(({ Stage3D }) => {
    if (dead) return;
    try { stage = new Stage3D(box, null, { onReady: apply, onFail: fallback }); apply(); }
    catch { fallback(); }
  }).catch(fallback);
  else fallback();
  return {
    play(...args) { last = ['play', ...args]; apply(); },
    still(...args) { last = ['still', ...args]; apply(); },
    showPose(p) { if (stage?.showPose) stage.showPose(p); },
    stop() { stage?.stop(); },
    dispose() { dead = true; stage?.dispose(); stage = null; },
  };
}
