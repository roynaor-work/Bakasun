import { touchMap, applyTouchMap, joystickCenter, joystickVector } from './layout.mjs';

/** Optional input adapter. Call destroy() when removing a stage. No game rules. */
export function mountControls(stage, { onMove = () => {}, onAction = () => {}, onPause = () => {} } = {}) {
  const zone = stage.querySelector('[data-iu-target="joystick"]');
  const base = zone?.querySelector('.iu-stick');
  if (!zone || !base) throw new TypeError('A joystick zone and base are required');
  const controller = new AbortController();
  const signal = controller.signal;
  const listen = (el, name, fn) => el.addEventListener(name, fn, { signal });
  const pressed = new Map();
  const keys = new Set();
  let enabled = true;
  let pointer = null;
  let center;
  let map;
  let destroyed = false;
  const coordinate = e => {
    const box = stage.getBoundingClientRect();
    return { x: e.clientX - box.left - stage.clientLeft, y: e.clientY - box.top - stage.clientTop };
  };
  function neutral() {
    const previous = pointer;
    pointer = null;
    if (previous !== null && zone.hasPointerCapture(previous)) zone.releasePointerCapture(previous);
    keys.clear();
    zone.removeAttribute('data-active');
    base.style.removeProperty('--iu-base-x');
    base.style.removeProperty('--iu-base-y');
    base.style.removeProperty('--iu-knob-x');
    base.style.removeProperty('--iu-knob-y');
    onMove({ x: 0, y: 0, active: false });
  }
  function cancelActions() {
    for (const [id, value] of pressed) {
      value.button.removeAttribute('data-held');
      pressed.delete(id);
      if (value.button.hasPointerCapture(id)) value.button.releasePointerCapture(id);
      if (!value.isPause) onAction({ id: value.id, phase: 'cancel' });
    }
  }
  function cancel() { if (destroyed) return; neutral(); cancelActions(); }
  function refresh() {
    if (destroyed) return;
    cancel();
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const css = getComputedStyle(stage);
    const insets = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side =>
      [side, Number.parseFloat(css.getPropertyValue(`--iu-safe-${side}`)) || 0]));
    map = applyTouchMap(stage, touchMap(width, height, insets));
    center = map.defaultCenter;
  }
  function move(e) {
    if (pointer !== e.pointerId) return;
    const point = coordinate(e);
    const vector = joystickVector(center, point.x, point.y, map.radius);
    base.style.setProperty('--iu-knob-x', `${vector.knobX}px`);
    base.style.setProperty('--iu-knob-y', `${vector.knobY}px`);
    onMove({ x: vector.x, y: vector.y, active: true });
  }
  listen(zone, 'pointerdown', e => {
    if (!enabled || pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    keys.clear();
    const point = coordinate(e);
    center = joystickCenter(map, point.x, point.y);
    pointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    // Absolute children start inside the zone's border, while the map measures
    // its border box. Subtract that inset so the rim cannot escape by 1px.
    base.style.setProperty('--iu-base-x', `${center.x - map.joystick.x - zone.clientLeft}px`);
    base.style.setProperty('--iu-base-y', `${center.y - map.joystick.y - zone.clientTop}px`);
    zone.setAttribute('data-active', '');
    move(e);
  });
  listen(zone, 'pointermove', move);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(zone, name, e => { if (e.pointerId === pointer) neutral(); });
  }
  function keyMove() {
    let x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    let y = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
    const length = Math.max(1, Math.hypot(x, y));
    x /= length; y /= length;
    if (keys.size) zone.setAttribute('data-active', '');
    else zone.removeAttribute('data-active');
    base.style.setProperty('--iu-knob-x', `${x * map.radius * .55}px`);
    base.style.setProperty('--iu-knob-y', `${y * map.radius * .55}px`);
    onMove({ x, y, active: keys.size > 0 });
  }
  listen(zone, 'keydown', e => {
    if (!enabled || pointer !== null || !e.key.startsWith('Arrow')) return;
    e.preventDefault(); keys.add(e.key); keyMove();
  });
  listen(zone, 'keyup', e => {
    if (!keys.has(e.key)) return;
    e.preventDefault(); keys.delete(e.key); keyMove();
  });
  listen(zone, 'blur', neutral);
  for (const button of stage.querySelectorAll('[data-iu-action], [data-iu-target="pause"]')) {
    const isPause = button.dataset.iuTarget === 'pause';
    listen(button, 'pointerdown', e => {
      if (!enabled || button.disabled || pressed.has(e.pointerId) ||
        [...pressed.values()].some(value => value.button === button) ||
        (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      const id = isPause ? 'pause' : button.dataset.iuAction;
      pressed.set(e.pointerId, { button, id, isPause });
      button.setPointerCapture(e.pointerId);
      button.setAttribute('data-held', '');
      if (!isPause) onAction({ id, phase: 'start' });
    });
    function finish(e, cancelled) {
      const active = pressed.get(e.pointerId);
      if (!active || active.button !== button) return;
      pressed.delete(e.pointerId);
      button.removeAttribute('data-held');
      const box = button.getBoundingClientRect();
      const inside = e.clientX >= box.left && e.clientX <= box.right &&
        e.clientY >= box.top && e.clientY <= box.bottom;
      const phase = cancelled || !inside || button.disabled ? 'cancel' : 'release';
      if (isPause) {
        if (phase === 'release') { cancel(); onPause(); }
      } else onAction({ id: active.id, phase });
    }
    listen(button, 'pointerup', e => finish(e, false));
    listen(button, 'pointercancel', e => finish(e, true));
    listen(button, 'lostpointercapture', e => finish(e, true));
    listen(button, 'click', e => {
      if (enabled && !button.disabled && e.detail === 0) {
        if (isPause) { cancel(); onPause(); return; }
        const id = button.dataset.iuAction;
        onAction({ id, phase: 'start' }); onAction({ id, phase: 'release' });
      }
    });
  }
  listen(window, 'blur', cancel);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  const observer = new ResizeObserver(refresh);
  observer.observe(stage);
  const disabledObserver = new MutationObserver(records => {
    for (const { target, attributeName } of records) {
      if (!target.disabled && attributeName !== 'data-iu-action') continue;
      for (const [pointerId, value] of pressed) {
        if (value.button !== target) continue;
        pressed.delete(pointerId);
        target.removeAttribute('data-held');
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        if (!value.isPause) onAction({ id: value.id, phase: 'cancel' });
      }
    }
  });
  disabledObserver.observe(stage, { subtree: true, attributes: true, attributeFilter: ['disabled', 'data-iu-action'] });
  refresh();
  return {
    get map() { return map; },
    refresh,
    cancel,
    setEnabled(value) {
      if (destroyed) return;
      enabled = Boolean(value); cancel();
      stage.toggleAttribute('data-iu-suspended', !enabled);
      for (const el of stage.querySelectorAll('.iu-controls')) el.inert = !enabled;
    },
    destroy() {
      if (destroyed) return;
      cancel(); destroyed = true; observer.disconnect(); disabledObserver.disconnect(); controller.abort();
      stage.removeAttribute('data-iu-suspended');
      for (const el of stage.querySelectorAll('.iu-controls')) el.inert = false;
    },
  };
}
