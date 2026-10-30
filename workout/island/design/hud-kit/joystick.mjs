import { button, node, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { stickValues } from './values.mjs';
export function create(host, options = EMPTY) {
  const root = button(host, 'ih-stick', '');
  root.setAttribute('aria-label', options.label ?? 'תנועה · מקשי החצים');
  const thumb = node(root, 'span', 'ih-stick-thumb'); thumb.setAttribute('aria-hidden', 'true');
  const hide = hiddenSetter(root), life = lifetime(root), view = root.ownerDocument.defaultView;
  const vector = { x: 0, y: 0 };
  let pointer = null, cx = 0, cy = 0, radius = 1, active = false;
  let left = false, right = false, up = false, down = false, lastX = NaN, lastY = NaN;
  let sentX = NaN, sentY = NaN, sentActive;
  function paint(x, y) {
    if (x !== lastX || y !== lastY) {
      thumb.style.transform = 'translate(' + x * 26 + 'px,' + y * 26 + 'px)'; lastX = x; lastY = y;
    }
  }
  function emit(x, y, engaged) {
    stickValues(vector, x, y, options.deadZone);
    paint(vector.x, vector.y); active = engaged;
    if (sentX !== vector.x || sentY !== vector.y || sentActive !== engaged) {
      sentX = vector.x; sentY = vector.y; sentActive = engaged;
      options.onChange?.(vector.x, vector.y, engaged);
    }
  }
  function reset() {
    const id = pointer; pointer = null;
    left = right = up = down = false;
    if (id !== null && root.hasPointerCapture(id)) root.releasePointerCapture(id);
    if (active) emit(0, 0, false);
  }
  function move(e) { emit((e.clientX - cx) / radius, (e.clientY - cy) / radius, true); }
  life.on(root, 'pointerdown', e => {
    if (root.disabled || pointer !== null || e.button !== 0) return;
    e.preventDefault(); reset(); root.focus({ preventScroll: true });
    const rect = root.getBoundingClientRect(); cx = rect.x + rect.width / 2; cy = rect.y + rect.height / 2; radius = rect.width / 2;
    pointer = e.pointerId; root.setPointerCapture(pointer); move(e);
  });
  life.on(root, 'pointermove', e => { if (pointer === e.pointerId) move(e); });
  life.on(root, 'pointerup', e => { if (pointer === e.pointerId) reset(); });
  life.on(root, 'pointercancel', e => { if (pointer === e.pointerId) reset(); });
  life.on(root, 'lostpointercapture', e => { if (pointer === e.pointerId) reset(); });
  function keyboard(e, pressed) {
    if (root.disabled || pointer !== null) return;
    switch (e.key) {
      case 'ArrowLeft': left = pressed; break;
      case 'ArrowRight': right = pressed; break;
      case 'ArrowUp': up = pressed; break;
      case 'ArrowDown': down = pressed; break;
      default: return;
    }
    e.preventDefault(); emit(Number(right) - Number(left), Number(down) - Number(up), left || right || up || down);
  }
  life.on(root, 'keydown', e => keyboard(e, true)); life.on(root, 'keyup', e => keyboard(e, false));
  life.on(root, 'blur', reset); life.on(view, 'blur', reset); life.on(view, 'resize', reset);
  life.on(root.ownerDocument, 'visibilitychange', () => { if (root.ownerDocument.hidden) reset(); });
  function update(state = EMPTY) {
    if (life.dead) return;
    const disabled = state.disabled === true, visible = state.visible !== false;
    if (disabled || !visible) reset();
    if (root.disabled !== disabled) root.disabled = disabled;
    hide(!visible);
    if (!active) { stickValues(vector, state.x, state.y, options.deadZone); paint(vector.x, vector.y); }
  }
  update(options.initial);
  return { update, destroy() { reset(); life.destroy(); } };
}
