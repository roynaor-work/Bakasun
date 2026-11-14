/** Ski league screens (v23, 13/11/2026): the league card on the ski stage map (themes, the five stages of a theme with their stars,
 * the next stage and its goals), the season screen (the theme's table, the rival, the six themes), the gear shop and the result of a
 * league stage (place, the three goals as stars, coins, table, record ghost, season podium at a boss).
 * Loaded on demand from ui/activity.mjs the first time the ski menu opens. Every change goes through engine.alpineLeague (checks,
 * saves its own key, refuses while a game runs). Hebrew, 56px targets, numbers as LTR islands, nothing hidden. */
import {THEMES,RIVALS,PLAYER_COLOR,GEAR,GEAR_COST,MAX_LEVEL,POINTS,BOSS_FACTOR,PRIZE,STAR_COINS,SEASON_PRIZE,PER_THEME,STAGE_COUNT,BASE_STAGES,equipmentFor,engineStageOf,stageInfo} from '../minigames/alpine-league-core.mjs?v=island-v2-20261107-12';
import {THEME_LOOKS} from '../minigames/alpine-league-theme.mjs?v=island-v2-20261107-12';

const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); n.className = cls; if (text !== '') n.textContent = text; return n; };
const button = (text, action, fn, cls = 'secondary-button') => { const n = el('button', cls, text); n.type = 'button'; n.dataset.action = action; n.onclick = fn; return n; };
const num = v => { const n = el('bdi', '', String(v)); n.dir = 'ltr'; return n; };
const clock = ms => { const c = Math.round(ms / 10); return `${Math.floor(c / 6000)}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const goalClock = ms => { const s = Math.ceil(ms / 500) / 2, m = Math.floor(s / 60), r = s - m * 60; return `${m}:${String(Math.floor(r)).padStart(2, '0')}${r % 1 ? '.5' : ''}`; };
const nameOf = id => id === 'player' ? 'אתם' : RIVALS.find(r => r.id === id)?.name || id;
const colorOf = id => id === 'player' ? PLAYER_COLOR : RIVALS.find(r => r.id === id)?.color || '#8a98a6';
export const SHOP = Object.freeze(['skis', 'helmet', 'goggles']);
export function goalLine(g) {
  if (g.kind === 'place') return g.target === 1 ? 'לסיים ראשונים (חובה)' : `לסיים במקום ${g.target} ומעלה (חובה)`;
  if (g.kind === 'time') return `לסיים עד ${goalClock(g.ms)}`;
  if (g.kind === 'gates') return `לעבור ${g.count} שערים מתוך ${g.total}`;
  return 'לגלוש בלי ליפול';
}
export function ensureStyle(root = document.head) {
  if (document.querySelector('link[data-alpine-league-css]')) return;
  const link = el('link'); link.rel = 'stylesheet'; link.dataset.alpineLeagueCss = 'true'; link.href = new URL('./alpine-league.css?v=island-v2-20261107-12', import.meta.url).href; root.append(link);
}
const accent = (node, themeId) => { node.style.setProperty('--al-accent', THEME_LOOKS[themeId]?.accent || '#3f8f5a'); node.dataset.theme = themeId; return node; };
function starsRow(count, label) { const s = el('span', 'al-stars'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', label ?? `${count} כוכבים מתוך 3`); for (let i = 0; i < 3; i++) s.append(el('i', i < count ? 'on' : '', '★')); return s; }
function chip(id) { const c = el('span', 'al-chip'); c.style.background = colorOf(id); c.setAttribute('aria-hidden', 'true'); return c; }

/** The five stages of a theme as big buttons: global stage number, name, stars; locked ones are disabled. */
function stageStrip(engine, sum, themeIndex, go) {
  const theme = sum.themes[themeIndex - 1], list = el('ol', 'al-stages'); accent(list, theme.id); list.setAttribute('aria-label', `שלבי ${theme.name}`);
  for (let k = 0; k < PER_THEME; k++) {
    const n = theme.from + k, info = stageInfo(n), best = engine.alpineLeague.state.best[n], open = n <= sum.stage, item = el('li', 'al-stage');
    item.dataset.n = String(n); item.dataset.state = best?.stars ? 'done' : open ? 'next' : 'locked'; if (info.boss) item.dataset.boss = 'true';
    const b = button('', 'alpine-league-stage', () => go(n), 'al-stage-button'); b.disabled = !open; b.dataset.n = String(n);
    b.setAttribute('aria-label', `שלב ${info.number}${info.boss ? ', שלב בוס' : ''}${open ? `, ${best?.stars || 0} כוכבים` : ', נעול'}`);
    b.append(el('span', 'al-stage-no', String(info.number)), el('span', 'al-stage-name', info.boss ? 'בוס' : `שלב ${info.index}`), open ? starsRow(best?.stars || 0) : el('span', 'al-lock', 'נעול'));
    if (best?.ms) b.append(el('small', 'al-stage-best', clock(best.ms)));
    item.append(b); list.append(item);
  }
  return list;
}
/** Theme chips: the six themes, open or locked, stars and the cup. Tapping an open theme shows its stages. */
function themeChips(sum, shown, pick) {
  const row = el('div', 'al-themes'); row.setAttribute('role', 'tablist');
  for (const t of sum.themes) {
    const c = button('', 'alpine-league-theme', () => pick(t.index), 'al-theme'); accent(c, t.id); c.disabled = !t.open; c.setAttribute('role', 'tab'); c.setAttribute('aria-selected', String(t.index === shown)); c.dataset.index = String(t.index);
    c.append(el('b', '', t.name), el('small', '', t.open ? `${t.totalStars}/15 כוכבים${t.result?.rank === 1 ? ' · גביע' : ''}` : 'נעול'));
    row.append(c);
  }
  return row;
}
function nextLine(engine, sum) {
  if (sum.complete) return el('p', 'al-line al-big', 'סיימתם את כל 30 שלבי הליגה. אפשר לשחק כל שלב שוב ולאסוף כוכבים.');
  const s = engine.alpineLeague.stage(sum.stage), box = el('div', 'al-next'); accent(box, s.theme);
  box.append(el('p', 'al-line al-big', `השלב הבא: שלב ${s.number} · ${s.name}${s.boss ? ' · מסלול ארוך ונקודות כפולות' : ''}`));
  const goals = el('ul', 'al-goals'); for (const g of s.goals) { const li = el('li', '', goalLine(g)); li.dataset.goal = g.kind; goals.append(li); } box.append(goals);
  return box;
}
function rivalLine(rival) {
  const p = el('p', 'al-line al-rival'); p.append('היריב שלכם: ', chip(rival.id), ' ', el('strong', '', rival.name), rival.diff > 0 ? ` · לפניכם ב-${rival.diff} נק׳` : rival.diff < 0 ? ` · אחריכם ב-${-rival.diff} נק׳` : ' · באותן נקודות');
  return p;
}

/** The league card on the ski stage map. go(n): play stage n. season/shop: open the screens. refresh: re-render the map. */
export function leagueCard({engine, go, season, shop, refresh}) {
  ensureStyle();
  const sum = engine.alpineLeague.summary(), root = el('section', 'al-card'); root.dataset.alpineLeague = 'true'; accent(root, sum.theme.id);
  let shown = sum.complete ? THEMES.length : Math.ceil(sum.stage / PER_THEME);
  const head = el('div', 'al-head'), coins = el('span', 'al-coins'); coins.append(num(sum.coins), ' מטבעות ליגה');
  head.append(el('h3', '', `ליגת הסקי · שלבים ${BASE_STAGES + 1} עד ${BASE_STAGES + STAGE_COUNT}`), coins);
  const started = sum.table.some(r => r.points > 0);
  const status = el('p', 'al-line', `${sum.theme.name} · ${started ? `מקום ${sum.place} בטבלה` : 'העונה מתחילה'} · ${sum.totalStars} כוכבים מתוך ${sum.maxStars}${sum.cups ? ` · גביעים: ${sum.cups}` : ''}`);
  const stripHost = el('div', 'al-strip-host');
  const draw = () => { stripHost.replaceChildren(stageStrip(engine, sum, shown, go)); chips.replaceWith(chips = themeChips(sum, shown, pick)); };
  const pick = i => { shown = i; draw(); };
  let chips = themeChips(sum, shown, pick);
  const actions = el('div', 'al-actions');
  if (!sum.complete) { const s = stageInfo(sum.stage); actions.append(button(`לשלב ${s.number}`, 'alpine-league-go', () => go(sum.stage), 'primary-button')); }
  actions.append(button('טבלה ועונה', 'alpine-league-season', season), button('ציוד', 'alpine-league-shop', shop));
  root.append(head, status, nextLine(engine, sum)); if (sum.rival) root.append(rivalLine(sum.rival));
  root.append(actions, chips, stripHost); draw();
  root.append(el('p', 'al-note', 'השלבים 1 עד 3 נשארים כמו שהם, למטה. הליגה נשמרת בנפרד.'));
  return root;
}

/** Season table: place, colour chip, name, points; the child's row marked. */
function table(rows) {
  const t = el('table', 'al-table'), head = el('tr'); for (const h of ['#', '', 'גולש', 'נקודות']) head.append(el('th', '', h)); t.append(head);
  // Equal points share a place (1, 2, 2, 4); before anyone has points there is no place yet.
  const started = rows.some(r => r.points > 0), placeOf = r => started ? String(1 + rows.filter(x => x.points > r.points).length) : '–';
  rows.forEach(r => { const tr = el('tr'); if (r.id === 'player') tr.className = 'mine'; tr.dataset.rider = r.id; const c = el('td'); c.append(chip(r.id)); const p = el('td', 'al-pts'); p.append(num(r.points)); tr.append(el('td', 'al-place', placeOf(r)), c, el('td', 'al-rider', r.name), p); t.append(tr); });
  return t;
}
export function seasonBody({engine, go, refresh}) {
  ensureStyle();
  const sum = engine.alpineLeague.summary(), root = el('section', 'al-season'); root.dataset.alpineSeason = 'true'; accent(root, sum.theme.id);
  root.append(el('h4', '', `העונה: ${sum.theme.name}`), el('p', 'al-line', sum.theme.line), table(sum.table));
  if (sum.rival) root.append(rivalLine(sum.rival));
  const themes = el('ul', 'al-theme-list');
  for (const t of sum.themes) {
    const li = el('li', 'al-theme-row'); accent(li, t.id); li.dataset.open = String(t.open);
    const res = t.result ? `מקום ${t.result.rank} בעונה${t.result.rank === 1 ? ' · גביע' : ''} · פרס ${t.result.prize}` : t.live ? 'העונה עכשיו' : t.open ? 'פתוחה' : 'נעולה';
    li.append(el('strong', '', `${t.name} · שלבים ${t.numbers[0]} עד ${t.numbers[1]}`), el('span', '', t.line), el('em', '', `${res} · ${t.totalStars}/15 כוכבים`)); themes.append(li);
  }
  root.append(el('h4', '', 'שש העונות'), themes);
  root.append(el('p', 'al-line', `נקודות לפי מקום: ${POINTS.join(' · ')}. בשלב בוס הנקודות כפולות. הטבלה מתעדכנת פעם אחת בכל שלב, במרוץ שפתח את השלב הבא.`),
    el('p', 'al-line', `כוכבים: יעד המקום פותח את השלב הבא (כוכב ראשון), ועוד כוכב לכל יעד נוסף: זמן, ומספר שערים או גלישה בלי נפילה.`),
    el('p', 'al-line', `מטבעות ליגה: כל מטבע במסלול, פרס מקום בפעם הראשונה (${PRIZE[0]} למקום ראשון), ${STAR_COINS} לכל כוכב חדש, ופרס עונה (${SEASON_PRIZE[0]} לאלופים).`));
  if (!sum.complete) { const a = el('div', 'al-actions'); a.append(button(`לשלב ${stageInfo(sum.stage).number}`, 'alpine-league-go', () => go(sum.stage), 'primary-button')); root.append(a); }
  void refresh; return root;
}

/** Gear shop: three parts, five levels each, paid with league coins; what each level does, in plain words. */
export function shopBody({engine, refresh}) {
  ensureStyle();
  const l = engine.alpineLeague.state, root = el('section', 'al-shop'); root.dataset.alpineShop = 'true';
  const bar = el('p', 'al-coins-bar'); bar.append('מטבעות ליגה: ', num(l.coins)); const note = el('p', 'al-line'); note.setAttribute('role', 'status'); root.append(bar, note);
  const eq = equipmentFor(l.gear);
  for (const key of SHOP) {
    const spec = GEAR[key], level = l.gear[key] || 0, row = el('article', 'al-part'); row.dataset.part = key; row.dataset.level = String(level);
    const pips = el('span', 'al-pips'); pips.setAttribute('role', 'img'); pips.setAttribute('aria-label', `רמה ${level} מתוך ${MAX_LEVEL}`); for (let i = 0; i < MAX_LEVEL; i++) pips.append(el('i', i < level ? 'on' : ''));
    const gain = Math.round((eq[spec.key] - 1) * 100), what = el('span', 'al-part-what', spec.what); if (gain) { const g = el('bdi', 'al-gain', `+${gain}%`); g.dir = 'ltr'; what.append(' · ', g); }
    const cost = level >= MAX_LEVEL ? null : GEAR_COST[level];
    const buy = button(cost === null ? 'רמה מקסימלית' : `שדרוג ב-${cost}`, 'alpine-league-buy', () => { const r = engine.alpineLeague.buy(key); if (r.ok) refresh(); else note.textContent = r.reason === 'coins' ? `חסרים ${r.need} מטבעות לשדרוג הזה` : 'אי אפשר לשדרג עכשיו'; }, 'primary-button');
    buy.dataset.part = key; buy.disabled = cost === null || l.coins < cost;
    row.append(el('strong', 'al-part-name', spec.name), pips, what, buy); root.append(row);
  }
  root.append(el('p', 'al-line', 'מטבעות הליגה מגיעים רק משלבי הליגה ונפרדים מכסף העיר. הציוד עובד בכל שלבי הליגה.'));
  return root;
}

/** Result of a league stage. result = the engine's verified result (result.alpineLeague), summary = the session's race summary. */
export function resultBody({engine, result, summary, go, again, season, shop}) {
  ensureStyle();
  const r = result.alpineLeague, info = stageInfo(r.n), sum = engine.alpineLeague.summary(), root = el('section', 'al-result'); root.dataset.alpineLeagueResult = 'true'; accent(root, info.theme);
  root.dataset.passed = String(r.passed);
  const medal = el('div', 'al-medal', String(r.place)); medal.dataset.place = String(r.place); medal.setAttribute('aria-label', `מקום ${r.place}`);
  const top = el('div', 'al-result-top'), headline = el('div');
  headline.append(el('h4', '', r.passed ? (r.firstPass && r.n < STAGE_COUNT ? `עברתם את שלב ${info.number}. שלב ${engineStageOf(r.n + 1)} נפתח` : `עברתם את שלב ${info.number}`) : `שלב ${info.number} עוד לא עבר. ${r.completed ? `צריך מקום ${info.targetRank} ומעלה` : 'לא הגעתם לקו הסיום'}`),
    starsRow(r.stars, `${r.stars} כוכבים מתוך 3`));
  top.append(medal, headline); root.append(top);
  const goals = el('ul', 'al-goal-check'); goals.setAttribute('aria-label', 'היעדים');
  for (const g of r.goals) {
    const li = el('li'); li.dataset.goal = g.kind; li.dataset.ok = String(g.ok);
    const value = g.kind === 'place' ? `מקום ${r.place}` : g.kind === 'time' ? (r.completed ? clock(r.ms) : 'לא סיימתם') : g.kind === 'gates' ? `${r.gates} שערים` : r.crashes ? `${r.crashes} נפילות` : 'בלי נפילות';
    li.append(el('span', 'al-check', g.ok ? '✓' : '✗'), el('span', '', goalLine(g)), el('em', '', value)); goals.append(li);
  }
  root.append(goals);
  const rows = el('div', 'al-rows'), list = [['coins', 'מטבעות ליגה', `+${r.coins}`]];
  if (sum.table.some(x => x.points > 0)) list.push(['table', 'מקום בטבלה', `${sum.place} · ${sum.table.find(x => x.id === 'player')?.points ?? 0} נק׳`, true]);
  if (r.points) list.splice(1, 0, ['points', 'נקודות בעונה', `+${r.points}`]);
  if (summary?.peakKmh) list.push(['peak', 'מהירות שיא', `${summary.peakKmh} קמ״ש`, true]);
  if (summary?.ghost) list.push(['ghost', 'רוח הרפאים', summary.ghost.saved ? (summary.ghost.previousMs ? `שיא חדש. ${clock(summary.ghost.previousMs)} ← ${clock(r.ms)}` : 'נשמרה. תגלוש איתכם בפעם הבאה') : summary.ghost.previousMs ? `השיא נשאר ${clock(summary.ghost.previousMs)}` : 'נשמרת רק בריצה שהגיעה לסיום', true]);
  for (const [key, label, value, plain] of list) { const row = el('p', 'result-row'); row.dataset.leagueRow = key; row.append(el('span', '', label), plain ? el('span', '', value) : num(value)); rows.append(row); }
  root.append(rows);
  if (r.season) {
    const box = el('section', 'al-podium'); box.dataset.seasonPodium = String(r.season.theme);
    box.append(el('h4', '', `סיום העונה: ${THEMES[r.season.theme - 1].name}`));
    const row = el('div', 'al-podium-row'); [r.season.podium[1], r.season.podium[0], r.season.podium[2]].forEach((id, k) => { if (!id) return; const place = [2, 1, 3][k], step = el('div', 'al-step place-' + place); if (id === 'player') step.classList.add('you'); step.append(chip(id), el('span', '', nameOf(id)), el('b', '', String(place))); row.append(step); });
    box.append(row, el('p', 'al-line al-big', r.season.cup ? 'אתם האלופים של העונה. גביע' : `סיימתם את העונה במקום ${r.season.rank}`), el('p', 'al-line', `פרס עונה: +${r.season.prize} מטבעות`));
    root.append(box);
  }
  const actions = el('div', 'al-actions');
  if (r.passed && r.n < STAGE_COUNT && r.n + 1 <= sum.stage) actions.append(button(`לשלב ${engineStageOf(r.n + 1)}`, 'alpine-league-next', () => go(r.n + 1), 'primary-button'));
  actions.append(button(r.passed ? 'שוב, לעוד כוכבים' : 'לנסות שוב', 'alpine-league-again', again, r.passed ? 'secondary-button' : 'primary-button'), button('טבלה ועונה', 'alpine-league-season', season), button('ציוד', 'alpine-league-shop', shop));
  root.append(actions, table(sum.table));
  return root;
}
export {BOSS_FACTOR};
