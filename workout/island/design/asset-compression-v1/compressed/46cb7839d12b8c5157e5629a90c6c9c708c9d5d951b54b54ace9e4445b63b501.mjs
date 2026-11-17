import { node, textSetter, attrSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { percent } from './values.mjs';
export function create(host, options = EMPTY) {
  const root = node(host, 'section', 'ih-power ih-panel');
  const label = textSetter(node(root, 'span', 'ih-meter-label'));
  const value = node(root, 'b', 'ih-numeric'); value.dir = 'ltr';
  const setValue = textSetter(value);
  const track = node(root, 'div', 'ih-meter-track');
  track.setAttribute('role', 'meter'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
  const aria = attrSetter(track, 'aria-valuenow'), ariaLabel = attrSetter(track, 'aria-label');
  const fill = node(track, 'span', 'ih-fill'), hide = hiddenSetter(root), life = lifetime(root);
  let previous = -1;
  function update(state = EMPTY) {
    if (life.dead) return;
    const name = state.label ?? options.label ?? 'כוח'; label(name); ariaLabel(name);
    const p = percent(state.value);
    if (p !== previous) { setValue(p + '%'); aria(String(p)); fill.style.transform = 'scaleX(' + p / 100 + ')'; previous = p; }
    hide(state.visible === false);
  }
  update(options.initial); return { update, destroy: life.destroy };
}
