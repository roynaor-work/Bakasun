import { node, button, icon, textSetter, attrSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { percent } from './values.mjs';
export function create(host, options = EMPTY) {
  const root = button(host, 'ih-action' + (options.primary ? ' ih-primary' : ''), '');
  const setIcon = icon(root, options.icon);
  const label = textSetter(node(root, 'span', 'ih-action-label'));
  const unavailable = node(root, 'span', 'ih-unavailable', options.unavailableLabel ?? 'לא זמין');
  const hideUnavailable = hiddenSetter(unavailable);
  const track = node(root, 'span', 'ih-charge'); track.setAttribute('aria-hidden', 'true');
  const fill = node(track, 'span', 'ih-fill');
  const hideTrack = hiddenSetter(track), hide = hiddenSetter(root), aria = attrSetter(root, 'aria-label');
  const pressed = attrSetter(root, 'data-held'), life = lifetime(root), view = root.ownerDocument.defaultView;
  let pointer = null, key = null, held = false, lastCharge = -1, lastLoading;
  function release(cancelled) {
    if (!held) return;
    held = false; key = null; pressed('false');
    const id = pointer; pointer = null;
    if (id !== null && root.hasPointerCapture(id)) root.releasePointerCapture(id);
    options.onRelease?.(cancelled);
  }
  function press() { held = true; pressed('true'); options.onPress?.(); }
  life.on(root, 'pointerdown', e => {
    if (root.disabled || held || e.button !== 0) return;
    pointer = e.pointerId; root.setPointerCapture(pointer); press();
  });
  life.on(root, 'pointerup', e => { if (pointer === e.pointerId) release(false); });
  life.on(root, 'pointercancel', e => { if (pointer === e.pointerId) release(true); });
  life.on(root, 'lostpointercapture', e => { if (pointer === e.pointerId) release(true); });
  life.on(root, 'keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !held && !e.repeat && !root.disabled) { key = e.key; press(); }
  });
  life.on(root, 'keyup', e => { if (key === e.key) release(false); });
  life.on(root, 'click', () => { if (!root.disabled) options.onActivate?.(); });
  life.on(root, 'blur', () => release(true));
  life.on(view, 'blur', () => release(true));
  life.on(root.ownerDocument, 'visibilitychange', () => { if (root.ownerDocument.hidden) release(true); });
  function update(state = EMPTY) {
    if (life.dead) return;
    const name = state.label ?? options.label ?? 'פעולה';
    label(name); setIcon(state.icon ?? options.icon); aria(name);
    const disabled = state.disabled === true, visible = state.visible !== false;
    if ((disabled || !visible) && held) release(true);
    if (root.disabled !== disabled) root.disabled = disabled;
    hideUnavailable(!disabled); hide(!visible);
    const loading = state.loading === true, charge = percent(state.charge);
    hideTrack(!loading);
    if (loading !== lastLoading) { root.setAttribute('data-loading', String(loading)); lastLoading = loading; }
    if (charge !== lastCharge) { fill.style.transform = 'scaleX(' + charge / 100 + ')'; lastCharge = charge; }
  }
  update(options.initial);
  return { update, destroy() { release(true); life.destroy(); } };
}
