import { node, button, textSetter, attrSetter, lifetime, EMPTY } from './internal.mjs';
import { integer, outcomeKind } from './values.mjs';
const headings = Object.freeze({ win: 'ניצחון יפה', loss: 'עוד ניסיון?', draw: 'סיום המשחק', incomplete: 'ננסה שוב' });
// Native modal supplies focus containment, Escape events and inert background.
export function panel(host, options, result) {
  const root = node(host, 'dialog', 'ih-dialog ih-panel');
  root.setAttribute('aria-label', options.label ?? (result ? 'תוצאה' : 'השהיה'));
  const kicker = textSetter(node(root, 'p', 'ih-eyebrow', ''));
  const title = textSetter(node(root, 'h2', 'ih-dialog-title', ''));
  const score = node(root, 'div', 'ih-result-value ih-numeric'); score.dir = 'ltr';
  const setScore = textSetter(score); score.hidden = !result;
  const stars = node(root, 'div', 'ih-stars'); stars.hidden = !result;
  const starNodes = [];
  for (let i = 0; i < 3; i++) { const star = node(stars, 'span', '', '★'); star.setAttribute('aria-hidden', 'true'); starNodes.push(star); }
  const starAria = attrSetter(stars, 'aria-label'); stars.setAttribute('role', 'img');
  const subtitle = textSetter(node(root, 'p', 'ih-dialog-subtitle', ''));
  const list = node(root, 'dl', 'ih-result-stats'); list.hidden = !result;
  const rows = [], labels = [], values = [];
  for (let i = 0; i < 3; i++) {
    const row = node(list, 'div', ''); rows.push(row);
    labels.push(textSetter(node(row, 'dt', '')));
    const value = node(row, 'dd', 'ih-numeric'); value.dir = 'ltr'; values.push(textSetter(value));
  }
  const controls = node(root, 'div', 'ih-dialog-controls');
  const primary = button(controls, 'ih-cta', options.primaryLabel ?? (result ? 'משחק נוסף' : 'חזרה למשחק'));
  const menu = button(controls, 'ih-menu', options.menuLabel ?? 'לתפריט');
  const life = lifetime(root), dataOutcome = attrSetter(root, 'data-outcome');
  let lastStars = -1, visible = false;
  life.on(primary, 'click', () => result ? options.onReplay?.() : options.onResume?.());
  life.on(menu, 'click', () => options.onMenu?.());
  life.on(root, 'keydown', e => {
    if (e.key !== 'Tab') return;
    const focused = root.ownerDocument.activeElement;
    if (!e.shiftKey && focused === menu) { e.preventDefault(); primary.focus(); }
    else if (e.shiftKey && focused === primary) { e.preventDefault(); menu.focus(); }
  });
  life.on(root, 'cancel', e => { e.preventDefault(); if (result) options.onMenu?.(); else options.onResume?.(); });
  function update(state = EMPTY) {
    if (life.dead) return;
    const outcome = outcomeKind(state.outcome);
    title(state.title ?? (result ? headings[outcome] : 'המשחק בהשהיה'));
    kicker(state.eyebrow ?? (result ? 'האי שלי / סוף משחק' : 'רגע לנשום'));
    subtitle(state.subtitle ?? (result ? '' : 'ממשיכים כשמוכנים.'));
    if (result) {
      setScore(state.value ?? ''); dataOutcome(outcome);
      const count = integer(state.stars, 3);
      if (count !== lastStars) {
        for (let i = 0; i < 3; i++) starNodes[i].setAttribute('data-earned', String(i < count));
        starAria(count + ' / 3 ' + (options.starsLabel ?? 'כוכבים')); lastStars = count;
      }
      for (let i = 0; i < 3; i++) {
        const stat = state.stats?.[i], hidden = !stat;
        if (rows[i].hidden !== hidden) rows[i].hidden = hidden;
        if (stat) { labels[i](stat.label ?? ''); values[i](stat.value ?? ''); }
      }
    }
    const show = state.visible === true;
    if (show !== visible) {
      if (show) root.showModal(); else root.close();
      visible = show;
    }
  }
  update(options.initial);
  return { update, destroy() { if (root.open) root.close(); life.destroy(); } };
}
