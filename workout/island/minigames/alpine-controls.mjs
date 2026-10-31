/** Alpine Rush input. Steering: a visible joystick (analog), a drag anywhere on the slope,
 * or arrows/A-D. Boost: its button or Space. Tricks: four buttons around the boost button,
 * or keys 1-4 / J K L I. Input is released on every lifecycle boundary: pointerup,
 * pointercancel, lost capture, window blur, hidden tab and setEnabled(false).
 * Boost and trick buttons never steer, and pressing them never starts a drag. */
const TRICK_KEYS = {Digit1: 'grab', KeyJ: 'grab', Digit2: 'spin', KeyK: 'spin', Digit3: 'flip', KeyL: 'flip', Digit4: 'combo', KeyI: 'combo'};

export function createAlpineControls({canvas, boostButton, joystick = null, trickButtons = [], config = {}}) {
  const abort = new AbortController(), options = {signal: abort.signal}, doc = canvas.ownerDocument, win = doc.defaultView;
  const keys = new Set(), metresPerWidth = config.dragMetresPerWidth ?? 22, half = config.trackHalfWidth ?? 10;
  let enabled = true, drag = null, joy = null, boostQueued = false, trickQueued = null, lastX = 0, lastLean = 0;
  const steerKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);
  const knob = joystick?.querySelector('[data-joystick-knob]');
  function setKnob(value) { if (knob) knob.style.transform = `translate(calc(-50% + ${(value * 70).toFixed(1)}%), -50%)`; if (joystick) { joystick.dataset.active = String(value !== 0 || !!joy); joystick.setAttribute('aria-valuenow', value.toFixed(2)); } }
  function releaseDrag() {
    const pointer = drag; drag = null; canvas.dataset.steering = 'false';
    if (pointer && canvas.hasPointerCapture?.(pointer.id)) { try { canvas.releasePointerCapture(pointer.id); } catch {} }
  }
  function releaseJoystick() {
    const pointer = joy; joy = null; setKnob(0);
    if (pointer && joystick?.hasPointerCapture?.(pointer.id)) { try { joystick.releasePointerCapture(pointer.id); } catch {} }
  }
  function cancel() {
    releaseDrag(); releaseJoystick(); keys.clear(); boostQueued = false; trickQueued = null;
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (!enabled || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    releaseJoystick();
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    drag = {id: event.pointerId, startClientX: event.clientX, startX: lastX, targetX: lastX};
    canvas.dataset.steering = 'true';
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    drag.targetX = Math.max(-half, Math.min(half, drag.startX + (event.clientX - drag.startClientX) / width * metresPerWidth));
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (drag && event.pointerId === drag.id) releaseDrag(); }, options);
  if (joystick) {
    // The stick deflects sideways only; its value is the steering command itself.
    const read = event => { const box = joystick.getBoundingClientRect(), radius = Math.max(1, (box.width / 2 - 8) * (config.joystickReach ?? .62)); joy.value = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / radius)); setKnob(joy.value); };
    joystick.style.touchAction = 'none';
    joystick.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation();
      if (!enabled || joy || (event.pointerType === 'mouse' && event.button !== 0)) return;
      releaseDrag();
      try { joystick.setPointerCapture(event.pointerId); } catch {}
      joy = {id: event.pointerId, value: 0}; read(event);
    }, options);
    joystick.addEventListener('pointermove', event => { if (joy && event.pointerId === joy.id) read(event); }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, event => { if (joy && event.pointerId === joy.id) releaseJoystick(); }, options);
  }
  const press = (button, act) => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); if (enabled) act(); }, options);
    // Keyboard activation (Enter/Space on the focused button) arrives as a click without a pointer.
    button.addEventListener('click', event => { if (event.detail === 0 && enabled) act(); }, options);
  };
  if (boostButton) press(boostButton, () => { boostQueued = true; });
  for (const button of trickButtons) press(button, () => { trickQueued = button.dataset.trick; });
  win.addEventListener('keydown', event => {
    if (event.target?.closest?.('input,textarea,select')) return;
    if (event.code === 'Escape' || event.key === 'Escape') return; // the island modal pauses the game on Escape
    if (!enabled) return;
    if (steerKeys.has(event.code)) { event.preventDefault(); keys.add(event.code); }
    else if (TRICK_KEYS[event.code]) { event.preventDefault(); if (!event.repeat) trickQueued = TRICK_KEYS[event.code]; }
    else if (event.code === 'Space' && !event.target?.closest?.('button')) { event.preventDefault(); if (!event.repeat) boostQueued = true; }
  }, options);
  win.addEventListener('keyup', event => keys.delete(event.code), options);
  win.addEventListener('blur', cancel, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) cancel(); }, options);
  return {
    /** Steering value [-1,1] for this frame plus one-shot boost and trick requests. */
    sample(player) {
      lastX = player?.x ?? lastX; lastLean = player?.lean ?? lastLean;
      if (!enabled) return {steer: 0, boost: false, trick: null};
      const direction = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      let steer = direction;
      // Opposite keys intentionally cancel; they do not hand control back to a
      // held analog pointer. Releasing both keys restores that active source.
      if (!keys.size && joy) steer = joy.value;
      else if (!keys.size && drag) steer = Math.max(-1, Math.min(1, (drag.targetX - lastX) * .8 - lastLean * .55));
      const boost = boostQueued, trick = trickQueued; boostQueued = false; trickQueued = null;
      return {steer: Math.abs(steer) < .02 ? 0 : steer, boost, trick};
    },
    cancel,
    setEnabled(value) { enabled = !!value; if (boostButton) boostButton.disabled = !enabled; for (const b of trickButtons) b.disabled = !enabled; cancel(); },
    dispose() { enabled = false; cancel(); abort.abort(); },
    get enabled() { return enabled; },
    get dragging() { return Boolean(drag || joy); },
  };
}
