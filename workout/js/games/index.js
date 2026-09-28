// קטלוג המשחקים הקטנים: ארבע קבוצות, כל משחק דקה עד שתי דקות.
import arcade from './arcade.js';
import sport from './sport.js';
import puzzle from './puzzle.js';
import quick from './quick.js';
import * as more from './more.js';

export const GAME_GROUPS = [
  { id: 'arcade', name: 'ארקייד', emoji: '🕹️', games: [...arcade, ...more.arcade] },
  { id: 'sport', name: 'ספורט', emoji: '🏅', games: [...sport, ...more.sport] },
  { id: 'puzzle', name: 'חשיבה', emoji: '🧠', games: [...puzzle, ...more.puzzle] },
  { id: 'quick', name: 'מהירות', emoji: '⚡', games: [...quick, ...more.quick] },
];
export const GAMES = GAME_GROUPS.flatMap(g => g.games.map(x => ({ ...x, group: g.id })));
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
