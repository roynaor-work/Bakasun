import { CAMERA_LINES } from './voice-lines.js?v=20261010-camera-1';

// One existing stage is resized, never cloned into a second WebGL renderer.
export class CameraDemo {
  constructor({ stage, exercise, paint, speak, pause, setTimer = (...args) => setTimeout(...args), clearTimer = timer => clearTimeout(timer) }) {
    Object.assign(this, { stage, exercise, paint, speak, pause, setTimer, clearTimer });
    this.mode = 'intro'; this.slowDevice = false; this.pace = 2200; this.paint(this.mode);
    stage.play(exercise, .75);
    Promise.resolve(stage.ready).then(() => { if (!this.dead) speak(CAMERA_LINES.instructions[exercise.id]); });
  }
  counting() { if (this.dead) return; this.mode = 'corner'; this.render(); }
  render() {
    this.paint(this.mode);
    if (this.mode === 'corner') {
      if (this.slowDevice) this.stage.still(this.exercise);
      else this.stage.pace(this.exercise, this.pace);
    } else this.stage.play(this.exercise, .75);
  }
  movement(time, phase) {
    if (this.mode !== 'corner' || this.slowDevice) return;
    if (phase === 'moving' && this.phase !== phase) { this.moveAt = time; this.stage.pace(this.exercise, this.pace); }
    this.phase = phase;
  }
  counted(time) {
    if (this.moveAt != null) this.pace = Math.max(350, Math.min(8000, time - this.moveAt));
    this.moveAt = null;
    if (this.mode === 'corner' && !this.slowDevice) this.stage.pace(this.exercise, this.pace);
  }
  rejected(reason) {
    if (this.dead || this.mode === 'help') return;
    this.clearTimer(this.timer); this.mode = 'correction'; this.render();
    this.speak(reason === 'alignment' ? CAMERA_LINES.instructions[this.exercise.id] : CAMERA_LINES.reasons[reason] || CAMERA_LINES.reasons.partial);
    this.timer = this.setTimer(() => this.counting(), 2000);
  }
  help(open) {
    if (this.dead) return;
    this.clearTimer(this.timer); this.pause(open);
    if (open) { this.previous = this.mode === 'intro' ? 'intro' : 'corner'; this.mode = 'help'; this.speak(CAMERA_LINES.instructions[this.exercise.id]); }
    else this.mode = this.previous;
    this.render();
  }
  fps(value) {
    if (value >= 12 || this.slowDevice) return;
    this.slowDevice = true;
    if (this.mode === 'corner') this.stage.still(this.exercise);
  }
  dispose() { this.dead = true; this.clearTimer(this.timer); this.stage.stop(); this.stage.dispose?.(); }
}
