// היגיון טהור בלי DOM: חישוב יעדים לפי רמה, סיכומים, רצף ימים, תגים. נבדק ב-tests/workout.test.mjs.
export const LEVELS = { easy: { name: 'קל', mult: 0.7 }, normal: { name: 'רגיל', mult: 1 }, hard: { name: 'חזק', mult: 1.35 }, pro: { name: 'אלוף', mult: 1.7 } };

// העלאת קושי לכל תוכנית בנפרד (מהשאלה בסוף האימון): boost = +10% חזרות/זמן לכל דרגה, swaps = כמה פעמים החלפנו לתרגיל קשה יותר
export const HARDER = {
  'jumping-jacks': 'star-jumps', 'star-jumps': 'tuck-jumps', squats: 'squat-jumps', 'squat-jumps': 'tuck-jumps',
  'knee-push-ups': 'push-ups', 'push-ups': 'pike-push-ups', crunches: 'bicycle', bicycle: 'v-ups', 'leg-raises': 'v-ups',
  plank: 'mountain-climbers', 'high-knees': 'hall-sprint', 'ankle-hops': 'side-hops', 'side-hops': 'single-leg-hops',
  lunges: 'single-leg-hops', 'calf-raises': 'ankle-hops', 'side-shuffle': 'carioca', 'broad-jump': 'run-jump', 'step-jumps': 'tuck-jumps',
  'glute-bridge': 'superman', 'flutter-kicks': 'hollow-hold', 'russian-twists': 'v-ups',
};
export const harderOf = (id, times = 1) => { let cur = id; for (let i = 0; i < times; i++) { if (!HARDER[cur]) break; cur = HARDER[cur]; } return cur; };
export const MAX_BOOST = 5, MAX_SWAPS = 2;
export const boostText = (b = {}) => [b.boost ? `+${b.boost * 10}%` : '', b.swaps ? (b.swaps === 1 ? 'תרגילים מתקדמים' : 'תרגילים מתקדמים ×2') : ''].filter(Boolean).join(' · ');

export function scaleTarget(base, level = 'normal', type = 'reps') {
  const m = (LEVELS[level] || LEVELS.normal).mult;
  const v = Math.round(base * m / (type === 'time' ? 5 : 1)) * (type === 'time' ? 5 : 1);
  return Math.max(type === 'time' ? 10 : 3, v);
}

// בונה את רשימת הפריטים לאימון מתוך תוכנית: בלוקים (חימום / האימון / מתיחות), כל בלוק אולי בכמה סבבים.
// תוכנית בלי בלוקים (אימון חופשי, תרגיל בודד) היא בלוק אחד.
export function buildItems(program, catalog, level = 'normal', boost = { boost: 0, swaps: 0 }) {
  const out = [];
  const blocks = program.blocks || [{ name: 'האימון', items: program.items, rounds: program.rounds }];
  for (const b of blocks) {
    const rounds = b.rounds || 1;
    for (let r = 1; r <= rounds; r++) {
      for (const id0 of b.items) {
        const main = b.name === 'האימון';
        const id = main && boost.swaps ? harderOf(id0, boost.swaps) : id0;
        const ex = catalog[id] || catalog[id0]; if (!ex) continue;
        const type = main && program.override?.type ? program.override.type : ex.type;
        const base = main && program.override?.base != null ? program.override.base : ex.base;
        const target = main && boost.boost ? scaleTarget(base * (1 + 0.1 * boost.boost), level, type) : scaleTarget(base, level, type);
        out.push({ exId: ex.id, name: ex.name, type, target, round: r, rounds, block: b.name, swapped: ex.id !== id0 });
      }
    }
  }
  return out;
}

// מה האימון של היום לפי התוכנית השבועית. ריק = יום מנוחה.
export const todayProgram = (plan, date = new Date()) => (plan && plan[new Date(date).getDay()]) || '';

// השבוע הנוכחי (ראשון עד שבת): לכל יום, אם היה אימון
export function weekDays(sessions, today = new Date()) {
  const start = new Date(today); start.setDate(start.getDate() - start.getDay());
  const trained = new Set(sessions.map(s => dayKey(s.date)));
  return Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { day: i, date: d, key: dayKey(d), done: trained.has(dayKey(d)), today: dayKey(d) === dayKey(today), past: d < today && dayKey(d) !== dayKey(today) }; });
}

// אם שלושת האימונים האחרונים היו מושלמים (3 כוכבים), מציעים לעלות רמה
export function suggestLevel(sessions, level) {
  const order = ['easy', 'normal', 'hard'];
  const i = order.indexOf(level);
  if (i < 0 || i === order.length - 1) return null;
  const last = sessions.slice(-3);
  if (last.length < 3) return null;
  return last.every(s => (s.items || []).length >= 5 && summarize(s).stars === 3) ? order[i + 1] : null;
}

export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(d) {
  const x = new Date(d);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `יום ${days[x.getDay()]}, ${x.getDate()}.${x.getMonth() + 1}`;
}

// סיכום של אימון אחד
export function summarize(session) {
  const items = session.items || [];
  const done = items.filter(i => i.done > 0);
  const reps = done.filter(i => i.type === 'reps').reduce((s, i) => s + i.done, 0);
  const seconds = done.filter(i => i.type === 'time').reduce((s, i) => s + i.done, 0);
  const full = items.filter(i => i.done >= i.target).length;
  const pct = items.length ? Math.round(100 * done.length / items.length) : 0;
  const stars = pct >= 100 && full === items.length ? 3 : pct >= 70 ? 2 : done.length ? 1 : 0;
  return { total: items.length, doneCount: done.length, full, reps, seconds, pct, stars, duration: session.duration || 0 };
}

// רצף ימים: כמה ימים ברצף היה אימון, נספר אחורה מהיום (או מאתמול אם היום עוד לא התאמן)
export function streak(sessions, today = new Date()) {
  const days = new Set(sessions.map(s => dayKey(s.date)));
  let d = new Date(today);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

export function stats(sessions, today = new Date()) {
  const sums = sessions.map(summarize);
  const totalReps = sums.reduce((s, x) => s + x.reps, 0);
  const totalSeconds = sums.reduce((s, x) => s + x.seconds, 0);
  const totalDuration = sums.reduce((s, x) => s + x.duration, 0);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i), k = dayKey(d);
    const inDay = sessions.filter(s => dayKey(s.date) === k);
    week.push({ key: k, date: d, count: inDay.length, minutes: Math.round(inDay.reduce((s, x) => s + (x.duration || 0), 0) / 60) });
  }
  const perExercise = {};
  for (const s of sessions) for (const i of s.items || []) {
    if (!i.done) continue;
    const p = perExercise[i.exId] || (perExercise[i.exId] = { exId: i.exId, name: i.name, type: i.type, total: 0, times: 0, best: 0 });
    p.total += i.done; p.times++; p.best = Math.max(p.best, i.done);
  }
  return {
    workouts: sessions.length, streak: streak(sessions, today), thisWeek: week.reduce((s, d) => s + d.count, 0),
    totalReps, totalSeconds, totalDuration, week, perExercise,
    stars: sums.reduce((s, x) => s + x.stars, 0),
  };
}

export const BADGES = [
  { id: 'first', name: 'התחלה!', emoji: '🚀', desc: 'האימון הראשון', test: s => s.workouts >= 1 },
  { id: 'three', name: 'שלישייה', emoji: '🔥', desc: '3 ימים ברצף', test: s => s.streak >= 3 },
  { id: 'week', name: 'שבוע שלם', emoji: '🏆', desc: '7 ימים ברצף', test: s => s.streak >= 7 },
  { id: 'ten', name: 'עשרה', emoji: '🔟', desc: '10 אימונים', test: s => s.workouts >= 10 },
  { id: 'reps500', name: 'חמש מאות', emoji: '💯', desc: '500 חזרות בסך הכול', test: s => s.totalReps >= 500 },
  { id: 'hour', name: 'שעה של כוח', emoji: '⏰', desc: 'שעה של אימונים', test: s => s.totalDuration >= 3600 },
  { id: 'stars30', name: 'שמיים מלאים', emoji: '⭐', desc: '30 כוכבים', test: s => s.stars >= 30 },
  { id: 'month', name: 'חודש של אלוף', emoji: '👑', desc: '30 אימונים', test: s => s.workouts >= 30 },
];
export const earned = s => BADGES.filter(b => b.test(s)).map(b => b.id);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- יומן הכדורסל של אבא ----
export const BB_DRILLS = [
  { id: 'free-throws', name: 'זריקות עונשין', emoji: '🎯', shots: true },
  { id: 'layups', name: 'ליי-אפ', emoji: '🏀', shots: true },
  { id: 'mid-range', name: 'זריקות מטווח בינוני', emoji: '📍', shots: true },
  { id: 'three', name: 'שלשות', emoji: '3️⃣', shots: true },
  { id: 'dribble', name: 'כדרור', emoji: '🔄', shots: false },
  { id: 'passing', name: 'מסירות', emoji: '🤝', shots: true },
  { id: 'defense', name: 'הגנה ורגליים', emoji: '🛡️', shots: false },
  { id: 'jump', name: 'ניתור לסל', emoji: '🦘', shots: false },
  { id: 'game', name: 'משחק אחד על אחד', emoji: '🆚', shots: true },
];
export const bbDrillById = Object.fromEntries(BB_DRILLS.map(d => [d.id, d]));
export const pct = (made, att) => att ? Math.round(100 * made / att) : null;

// סיכום של יומן הכדורסל: לכל תרגיל סך ניסיונות, קליעות, אחוז, ומגמה של 6 האימונים האחרונים
export function bbStats(sessions) {
  const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const per = {};
  for (const s of sorted) for (const d of s.drills || []) {
    const p = per[d.drillId] || (per[d.drillId] = { drillId: d.drillId, name: d.name, att: 0, made: 0, times: 0, best: null, trend: [] });
    p.times++; p.att += d.att || 0; p.made += d.made || 0;
    const r = pct(d.made, d.att);
    if (r != null) { p.trend.push({ date: s.date, pct: r, made: d.made, att: d.att }); if (p.best == null || r > p.best) p.best = r; }
  }
  for (const p of Object.values(per)) { p.pct = pct(p.made, p.att); p.trend = p.trend.slice(-6); }
  const minutes = sorted.reduce((s, x) => s + (x.minutes || 0), 0);
  return { sessions: sorted.length, minutes, per, last: sorted.at(-1) || null };
}

// בלוקים שנחשבים "עבודה" (מתנה ומנוחה): כל מה שלא חימום ומתיחות
export const isWorkBlock = name => name !== 'חימום' && name !== 'מתיחות';

// פתיחת משחקים בהדרגה: מתחילים עם START_GAMES, ועל כל unlockEvery אימונים בוחרים עוד PICKS
export const START_GAMES = ['tetris', 'snake', 'penalty', 'moles', 'flappy'];
export const PICKS = 5;
export function unlockCredits(workouts, unlockedCount, unlockEvery = 10) {
  if (!unlockEvery) return 0;
  return Math.max(0, START_GAMES.length + PICKS * Math.floor(workouts / unlockEvery) - unlockedCount);
}
export const nextUnlockIn = (workouts, unlockEvery = 10) => unlockEvery ? unlockEvery - (workouts % unlockEvery) : 0;

// דירוג התמדה לפי מספר אימונים ורצף
export const RANKS = [
  { min: 0, name: 'מתחיל', emoji: '🌱' }, { min: 3, name: 'מתאמן', emoji: '🏃' }, { min: 8, name: 'רציני', emoji: '💪' },
  { min: 15, name: 'לוחם', emoji: '🥊' }, { min: 25, name: 'אלוף', emoji: '🏆' }, { min: 40, name: 'אגדה', emoji: '👑' },
];
export function rankOf(workouts) { let r = RANKS[0]; for (const x of RANKS) if (workouts >= x.min) r = x; const next = RANKS.find(x => x.min > workouts); return { ...r, next, toNext: next ? next.min - workouts : 0 }; }

// המשפט של ההתמדה בסוף אימון
export function perseveranceLine(st) {
  const n = st.thisWeek, ord = ['', 'הראשון', 'השני', 'השלישי', 'הרביעי', 'החמישי', 'השישי', 'השביעי'][n] || `ה-${n}`;
  const parts = [`כל הכבוד! זה האימון ${ord} שלך השבוע.`];
  if (st.streak >= 2) parts.push(`${st.streak} ימים ברצף!`);
  if (st.workouts === 1) parts.push('האימון הראשון בכלל. התחלה מעולה!');
  else if ([5, 10, 20, 30, 50, 100].includes(st.workouts)) parts.push(`וזה האימון מספר ${st.workouts} שלך. וואו!`);
  return parts.join(' ');
}
