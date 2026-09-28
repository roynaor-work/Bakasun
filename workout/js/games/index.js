// קטלוג המשחקים הקטנים: ארבע קבוצות, כל משחק דקה עד שתי דקות.
import arcade from './arcade.js';
import sport from './sport.js';
import puzzle from './puzzle.js';
import quick from './quick.js';

export const GAME_GROUPS = [
  { id: 'arcade', name: 'ארקייד', emoji: '🕹️', games: arcade },
  { id: 'sport', name: 'ספורט', emoji: '🏅', games: sport },
  { id: 'puzzle', name: 'חשיבה', emoji: '🧠', games: puzzle },
  { id: 'quick', name: 'מהירות', emoji: '⚡', games: quick },
];
export const GAMES = GAME_GROUPS.flatMap(g => g.games.map(x => ({ ...x, group: g.id })));
export const gameById = Object.fromEntries(GAMES.map(g => [g.id, g]));

// בחירת מתנה: מעדיפים משחקים שעוד לא שיחקו בהם, ולא חוזרים על האחרונים
export function pickGift(played = {}, recent = []) {
  const fresh = GAMES.filter(g => !played[g.id] && !recent.includes(g.id));
  const pool = fresh.length ? fresh : GAMES.filter(g => !recent.includes(g.id));
  const list = pool.length ? pool : GAMES;
  return list[Math.floor(Math.random() * list.length)];
}
