import { node, textSetter, hiddenSetter, lifetime, EMPTY } from './internal.mjs';
import { integer, clockTick, clockText } from './values.mjs';
export function create(host, options = EMPTY) {
  const root = node(host, 'section', 'ih-scoreboard ih-panel');
  root.setAttribute('aria-label', options.label ?? 'תוצאה וזמן');
  const line = node(root, 'div', 'ih-scoreline');
  const home = textSetter(node(line, 'span', 'ih-team'));
  const score = node(line, 'b', 'ih-score ih-numeric'); score.dir = 'ltr';
  const setScore = textSetter(score);
  const away = textSetter(node(line, 'span', 'ih-team ih-away'));
  const lower = node(root, 'div', 'ih-clockline');
  const clock = node(lower, 'b', 'ih-numeric'); clock.dir = 'ltr';
  const setClock = textSetter(clock);
  const period = textSetter(node(lower, 'span', 'ih-period'));
  const shot = node(lower, 'b', 'ih-shot-clock ih-numeric'); shot.dir = 'ltr';
  shot.setAttribute('aria-label', options.shotLabel ?? 'שעון זריקה');
  const setShot = textSetter(shot), hideShot = hiddenSetter(shot), hide = hiddenSetter(root);
  const life = lifetime(root);
  let lastHome = -1, lastAway = -1, lastTick = -1, lastShot = -1;
  const hundredths = options.hundredths === true;
  function update(state = EMPTY) {
    if (life.dead) return;
    home(state.homeLabel ?? 'האי'); away(state.awayLabel ?? 'החוף');
    const h = integer(state.home), a = integer(state.away), t = clockTick(state.timeMs, hundredths);
    if (h !== lastHome || a !== lastAway) { setScore(h + (options.separator ?? ' : ') + a); lastHome = h; lastAway = a; }
    if (t !== lastTick) { setClock(clockText(t, hundredths)); lastTick = t; }
    period(state.period ?? '');
    hideShot(state.shotSeconds == null);
    const s = integer(state.shotSeconds, 99);
    if (s !== lastShot) { setShot(String(s)); lastShot = s; }
    hide(state.visible === false);
  }
  update(options.initial);
  return { update, destroy: life.destroy };
}
