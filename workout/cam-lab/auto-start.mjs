// Driven by fresh pose results: no timer can begin counting from a stale pose.
// Create one instance per camera attempt; complete() also covers manual start.
export class AutoStart {
  constructor({ onCue, begin, onCancel = () => {} }) {
    this.onCue = onCue; this.begin = begin; this.onCancel = onCancel;
    this.remaining = null; this.lastCue = null; this.done = false;
  }
  get countingDown() { return this.remaining != null; }
  update(ready, time) {
    if (this.done) return;
    if (!ready) { this.cancel(); return; }
    if (!this.countingDown) {
      this.remaining = 3; this.lastCue = time; this.onCue(3); return;
    }
    if (time - this.lastCue < 1000) return;
    this.lastCue = time;
    if (--this.remaining > 0) this.onCue(this.remaining);
    else { this.complete(); this.begin(); }
  }
  cancel() {
    if (this.countingDown) this.onCancel();
    this.remaining = null; this.lastCue = null;
  }
  complete() { this.done = true; this.remaining = null; this.lastCue = null; }
}
