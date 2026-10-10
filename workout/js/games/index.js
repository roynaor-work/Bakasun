// קטלוג המשחקים הקטנים: ארבע קבוצות, כל משחק דקה עד שתי דקות.
import arcade from './arcade.js?v=20261010-child-copy-1';
import arcade2 from './arcade2.js?v=20261010-child-copy-1'; /* מקבץ 3: הרץ הקופץ, צפרדע, מבוך הנקודות, קפיצות לשמיים, יהלומים */
import sport0 from './sport.js?v=20261010-child-copy-1';
import { UPGRADE3D } from './sport3d.js?v=20261010-child-copy-1'; /* פנדלים ואני השוער בתלת-ממד (01/10); נופל לגרסה הדו-ממדית בלי WebGL */
const sport = sport0.map(g => UPGRADE3D[g.id] ? { ...g, make: UPGRADE3D[g.id] } : g);
import puzzle from './puzzle.js?v=20261010-child-copy-1';
import quick from './quick.js?v=20261010-child-copy-1';
import * as more from './more.js?v=20261010-child-copy-1';
import * as b4 from './batch4.js?v=20261010-child-copy-1'; /* מקבץ 4: הקפצת כדור, יורה בועות, כדורסל, מיני גולף, באולינג */
import { DEMOS, DEMO_DUR, DEMO_TOP } from './demos.js?v=20261010-child-copy-1';

export const GAME_GROUPS = [
  { id: 'arcade', name: 'ארקייד', emoji: '🕹️', games: [...arcade, ...arcade2, ...b4.arcade, ...more.arcade] },
  { id: 'sport', name: 'ספורט', emoji: '🏅', games: [...sport.slice(0, 2), ...b4.sport, ...sport.slice(2), ...more.sport] },
  { id: 'puzzle', name: 'חשיבה', emoji: '🧠', games: [...puzzle, ...more.puzzle] },
  { id: 'quick', name: 'מהירות', emoji: '⚡', games: [...quick, ...more.quick] },
];
// הדגמות: משחק שיש לו תסריט מקבל demo (ראו demos.js) וכפתור "איך משחקים?"
export const GAMES = GAME_GROUPS.flatMap(g => g.games.map(x => ({ ...x, group: g.id, demo: DEMOS[x.id] || null, demoDur: DEMO_DUR[x.id] || 12, demoTop: DEMO_TOP.has(x.id) })));
export const gameById = Object.fromEntries(GAMES.map(g => [g.id, g]));

// בחירת מתנה: מעדיפים משחקים שעוד לא שיחקו בהם, ולא חוזרים על האחרונים
export function pickGift(played = {}, recent = [], allowed = null) {
  const base = allowed ? GAMES.filter(g => allowed.includes(g.id)) : GAMES;
  const src = base.length ? base : GAMES;
  const fresh = src.filter(g => !played[g.id] && !recent.includes(g.id));
  const pool = fresh.length ? fresh : src.filter(g => !recent.includes(g.id));
  const list = pool.length ? pool : src;
  return list[Math.floor(Math.random() * list.length)];
}
