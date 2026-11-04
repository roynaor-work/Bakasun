/** Alpine Rush input. Steering: a floating joystick (the left half of the slope: the stick appears
 * under the thumb, always on the left), the visible stick, a drag on the right half of the slope,
 * or arrows/A-D. Boost: its button or Space. Tricks: four buttons around the boost button,
 * or keys 1-4 / J K L I. Input is released on every lifecycle boundary: pointerup,
 * pointercancel, lost capture, window blur, hidden tab and setEnabled(false).
 * Boost and trick buttons never steer, and pressing them never starts a drag. */
const TRICK_KEYS = {Digit1: 'grab', KeyJ: 'grab', Digit2: 'spin', KeyK: 'spin', Digit3: 'flip', KeyL: 'flip', Digit4: 'combo', KeyI: 'combo'};

export function createAlpineControls({canvas, boostButton, joystick = null, trickButtons = [], config = {}}) {
  const abort = new AbortController(), options = {signal: abort.signal}, doc = canvas.ownerDocument, win = doc.defaultView;
  const keys = new Set(), metresPerWidth = config.dragMetresPerWidth ?? 22, half = config.trackHalfWidth ?? 10;
  let enabled = true, drag = null, joy = null, shift = {x: 0, y: 0}, boostQueued = false, trickQueued = null, lastX = 0, lastLean = 0;
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
    if (pointer?.floating) {
      if (canvas.hasPointerCapture?.(pointer.id)) { try { canvas.releasePointerCapture(pointer.id); } catch {} }
      if (joystick?.style) { joystick.style.transform = ''; shift = {x: 0, y: 0}; delete joystick.dataset.floating; }
    }
  }
  /** Floating stick: the origin is the touch point; a thumb that slides past 1.25 reach drags the origin along,
   * so reversing direction never needs a full thumb travel back across a dead zone. */
  const reach = () => { const box = joystick.getBoundingClientRect(); return Math.max(1, ((box.width || 0) / 2 - 8) * (config.joystickReach ?? .62)); };
  function placeStick(event, home) {
    if (!joystick.style) return;
    const area = canvas.getBoundingClientRect(), box = joystick.getBoundingClientRect(), w = box.width || 0, h = box.height || 0;
    const left = (area.left || 0) + w / 2 + 8, right = (area.left || 0) + (area.width || 0) / 2 - w / 2 - 4;
    const top = (area.top || 0) + (area.height || 0) * .3 + h / 2, bottom = (area.top || 0) + (area.height || 0) - h / 2 - 8;
    const cx = Math.max(left, Math.min(Math.max(left, right), event.clientX)), cy = Math.max(top, Math.min(Math.max(top, bottom), event.clientY));
    shift = {x: cx - home.x, y: cy - home.y}; joystick.style.transform = `translate(${shift.x.toFixed(1)}px, ${shift.y.toFixed(1)}px)`;
  }
  function startFloating(event) {
    const box = joystick.getBoundingClientRect(), home = {x: (box.left || 0) + (box.width || 0) / 2 - shift.x, y: (box.top || 0) + (box.height || 0) / 2 - shift.y};
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    joy = {id: event.pointerId, value: 0, floating: true, originX: event.clientX, home};
    joystick.dataset.floating = 'true'; placeStick(event, home); readFloating(event);
  }
  function readFloating(event) {
    const radius = reach(), limit = radius * 1.25; let dx = event.clientX - joy.originX;
    if (Math.abs(dx) > limit) { joy.originX = event.clientX - Math.sign(dx) * limit; dx = Math.sign(dx) * limit; }
    joy.value = Math.max(-1, Math.min(1, dx / radius)); setKnob(joy.value);
  }
  function cancel() {
    releaseDrag(); releaseJoystick(); keys.clear(); boostQueued = false; trickQueued = null;
  }
  canvas.style.touchAction = 'none';
  // Left half of the slope = floating stick: its centre is where the thumb lands, so there is nothing to aim at.
  // A finger that is already steering keeps it: a second touch on the slope never takes the stick away.
  const inStickZone = event => { if (!joystick || config.floatingStick === false) return false; const box = canvas.getBoundingClientRect(); return event.clientX < (box.left || 0) + (box.width || 0) / 2; };
  canvas.addEventListener('pointerdown', event => {
    if (!enabled || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    if (joy) return;
    if (inStickZone(event)) { startFloating(event); return; }
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    drag = {id: event.pointerId, startClientX: event.clientX, startX: lastX, targetX: lastX};
    canvas.dataset.steering = 'true';
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    drag.targetX = Math.max(-half, Math.min(half, drag.startX + (event.clientX - drag.startClientX) / width * metresPerWidth));
  }, options);
  canvas.addEventListener('pointermove', event => { if (joy?.floating && event.pointerId === joy.id) readFloating(event); }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (drag && event.pointerId === drag.id) releaseDrag();
    if (joy?.floating && event.pointerId === joy.id) releaseJoystick();
  }, options);
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
