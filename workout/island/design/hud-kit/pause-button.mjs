import { button, icon, attrSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
export function create(host, options = EMPTY) {
  const root = button(host, 'ih-pause', ''); const setIcon = icon(root, 'pause');
  const aria = attrSetter(root, 'aria-label'), hide = hiddenSetter(root), life = lifetime(root);
  life.on(root, 'click', () => options.onPause?.());
  function update(state = EMPTY) {
    if (life.dead) return;
    aria(state.label ?? options.label ?? 'השהיה'); setIcon(state.icon ?? 'pause');
    const disabled = state.disabled === true;
    if (root.disabled !== disabled) root.disabled = disabled;
    hide(state.visible === false);
  }
  update(options.initial); return { update, destroy: life.destroy };
}
