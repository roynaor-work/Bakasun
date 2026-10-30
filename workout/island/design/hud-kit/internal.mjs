import { EMPTY } from './values.mjs';
export { EMPTY };
export function node(parent, tag, className, text) {
  const el = parent.ownerDocument.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  parent.append(el);
  return el;
}
export function textSetter(el) {
  let previous;
  return value => { if (value !== previous) { el.textContent = value; previous = value; } };
}
export function attrSetter(el, name) {
  let previous;
  return value => { if (value !== previous) { el.setAttribute(name, value); previous = value; } };
}
export function hiddenSetter(el) {
  return value => { if (el.hidden !== value) el.hidden = value; };
}
export function button(parent, className, text) {
  const el = node(parent, 'button', 'ih-button ' + className, text);
  el.type = 'button';
  return el;
}
export function lifetime(root) {
  const controller = new root.ownerDocument.defaultView.AbortController();
  let dead = false;
  return {
    get dead() { return dead; },
    on(target, type, listener) { target.addEventListener(type, listener, { signal: controller.signal }); },
    destroy() { if (!dead) { dead = true; controller.abort(); root.remove(); } }
  };
}
const paths = Object.freeze({
  shot: 'M4 20 20 4M8 4h12v12M3 10l7 7',
  pass: 'M3 12h17m-6-6 6 6-6 6',
  boost: 'm14 2-9 12h6l-1 8 9-12h-6z',
  block: 'M5 3h14v9c0 5-7 9-7 9s-7-4-7-9z',
  steal: 'M4 19 19 4M4 4h6M4 4v6M14 20h6v-6',
  trick: 'M12 3 3 12l9 9 9-9zM8 12h8',
  pause: 'M8 4v16M16 4v16',
  play: 'm7 3 14 9-14 9z',
  goal: 'M3 20V5h18v15M3 10h18M8 5v15M16 5v15',
  basket: 'M3 8h18M5 8l3 12h8l3-12M8 8l8 12M16 8 8 20M7 3h10',
  fall: 'M13 4h.01M12 8l-3 5 6 2 3 5M9 13l-5-2M9 13l-3 7M12 8l6 2'
});
export function icon(parent, initial = 'shot') {
  const doc = parent.ownerDocument, ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ih-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(ns, 'path');
  svg.append(path); parent.append(svg);
  let previous;
  const set = name => {
    const key = Object.hasOwn(paths, name) ? name : 'shot';
    if (key !== previous) { path.setAttribute('d', paths[key]); previous = key; }
  };
  set(initial); return set;
}
