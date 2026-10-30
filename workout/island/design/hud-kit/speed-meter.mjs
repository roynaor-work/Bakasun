import { node, textSetter, attrSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { clamp, finite } from './values.mjs';
export function create(host, options = EMPTY) {
  const root = node(host, 'section', 'ih-speed ih-panel');
  root.setAttribute('aria-label', options.label ?? 'מהירות');
  const value = node(root, 'b', 'ih-speed-value ih-numeric'); value.dir = 'ltr';
  const setValue = textSetter(value), unit = textSetter(node(root, 'span', 'ih-speed-unit'));
  const track = node(root, 'div', 'ih-meter-track'), fill = node(track, 'span', 'ih-fill');
  track.setAttribute('role', 'meter'); track.setAttribute('aria-label', options.label ?? 'מהירות');
  track.setAttribute('aria-valuemin', '0');
  const max = Math.max(1, Math.floor(finite(options.maxKmh, 160))); track.setAttribute('aria-valuemax', String(max));
  const aria = attrSetter(track, 'aria-valuenow'), hide = hiddenSetter(root), life = lifetime(root);
  let previous = -1;
  function update(state = EMPTY) {
    if (life.dead) return;
    const speed = Math.round(clamp(state.kmh, 0, max));
    if (speed !== previous) { setValue(String(speed)); aria(String(speed)); fill.style.transform = 'scaleX(' + speed / max + ')'; previous = speed; }
    unit(state.unit ?? options.unit ?? 'קמ״ש'); hide(state.visible === false);
  }
  update(options.initial); return { update, destroy: life.destroy };
}
