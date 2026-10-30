import { node, icon, textSetter, attrSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { eventKind } from './values.mjs';
const titles = Object.freeze({ goal: 'שער!', basket: 'קליעה!', fall: 'נפילה · חוזרים למסלול' });
export function create(host, options = EMPTY) {
  const root = node(host, 'section', 'ih-event ih-panel');
  root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite'); root.setAttribute('aria-atomic', 'true');
  const setIcon = icon(root, 'goal'), title = textSetter(node(root, 'strong', ''));
  const detail = textSetter(node(root, 'span', 'ih-event-detail'));
  const kindAttr = attrSetter(root, 'data-kind'), hide = hiddenSetter(root), life = lifetime(root);
  function update(state = EMPTY) {
    if (life.dead) return;
    const kind = eventKind(state.kind);
    setIcon(kind); kindAttr(kind); title(state.title ?? titles[kind]); detail(state.detail ?? '');
    hide(state.visible !== true);
  }
  update(options.initial); return { update, destroy: life.destroy };
}
