/** Alpine Rush input: drag anywhere on the slope to steer, arrows/A-D on a keyboard,
 * a separate boost button (and Space). Input is released on every lifecycle boundary:
 * pointerup, pointercancel, lost capture, window blur, hidden tab and setEnabled(false).
 * Boost never steers, and a press on the boost button never starts a drag. */
export function createAlpineControls({canvas, boostButton, config = {}}) {
  const abort = new AbortController(), options = {signal: abort.signal}, doc = canvas.ownerDocument, win = doc.defaultView;
  const keys = new Set(), metresPerWidth = config.dragMetresPerWidth ?? 22, half = config.trackHalfWidth ?? 8.4;
  let enabled = true, drag = null, boostQueued = false, lastX = 0, lastLean = 0;
  const steerKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);
  function cancel() {
    if (drag && canvas.hasPointerCapture?.(drag.id)) { try { canvas.releasePointerCapture(drag.id); } catch {} }
    drag = null; keys.clear(); boostQueued = false; canvas.dataset.steering = 'false';
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (!enabled || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    drag = {id: event.pointerId, startClientX: event.clientX, startX: lastX, targetX: lastX};
    canvas.dataset.steering = 'true';
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    drag.targetX = Math.max(-half, Math.min(half, drag.startX + (event.clientX - drag.startClientX) / width * metresPerWidth));
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (drag && event.pointerId === drag.id) { drag = null; canvas.dataset.steering = 'false'; } }, options);
  if (boostButton) {
    boostButton.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); if (enabled) boostQueued = true; }, options);
    // Keyboard activation (Enter/Space on the focused button) arrives as a click without a pointer.
    boostButton.addEventListener('click', event => { if (event.detail === 0 && enabled) boostQueued = true; }, options);
  }
  win.addEventListener('keydown', event => {
    if (event.target?.closest?.('input,textarea,select')) return;
    if (event.code === 'Escape' || event.key === 'Escape') return; // the island modal pauses the game on Escape
    if (!enabled) return;
    if (steerKeys.has(event.code)) { event.preventDefault(); keys.add(event.code); }
    else if (event.code === 'Space' && !event.target?.closest?.('button')) { event.preventDefault(); if (!event.repeat) boostQueued = true; }
  }, options);
  win.addEventListener('keyup', event => keys.delete(event.code), options);
  win.addEventListener('blur', cancel, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, options);
  return {
    /** Steering value [-1,1] for this frame plus a one-shot boost request. */
    sample(player) {
      lastX = player?.x ?? lastX; lastLean = player?.lean ?? lastLean;
      if (!enabled) return {steer: 0, boost: false};
      const direction = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      let steer = direction;
      if (!direction && drag) steer = Math.max(-1, Math.min(1, (drag.targetX - lastX) * .8 - lastLean * .55));
      const boost = boostQueued; boostQueued = false;
      return {steer: Math.abs(steer) < .02 ? 0 : steer, boost};
    },
    cancel,
    setEnabled(value) { enabled = !!value; if (boostButton) boostButton.disabled = !enabled; cancel(); },
    dispose() { enabled = false; cancel(); abort.abort(); },
    get enabled() { return enabled; },
    get dragging() { return Boolean(drag); },
  };
}
