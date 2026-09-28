// היגיון טהור בלי DOM: חישוב יעדים לפי רמה, סיכומים, רצף ימים, תגים. נבדק ב-tests/workout.test.mjs.
export const LEVELS = { easy: { name: 'קל', mult: 0.7 }, normal: { name: 'רגיל', mult: 1 }, hard: { name: 'חזק', mult: 1.35 } };

export function scaleTarget(base, level = 'normal', type = 'reps') {
  const m = (LEVELS[level] || LEVELS.normal).mult;
  const v = Math.round(base * m / (type === 'time' ? 5 : 1)) * (type === 'time' ? 5 : 1);
  return Math.max(type === 'time' ? 10 : 3, v);
}

// בונה את רשימת הפריטים לאימון מתוך תוכנית: בלוקים (חימום / האימון / מתיחות), כל בלוק אולי בכמה סבבים.
// תוכנית בלי בלוקים (אימון חופשי, תרגיל בודד) היא בלוק אחד.
export function buildItems(program, catalog, level = 'normal') {
  const out = [];
  const blocks = program.blocks || [{ name: 'האימון', items: program.items, rounds: program.rounds }];
  for (const b of blocks) {
    const rounds = b.rounds || 1;
    for (let r = 1; r <= rounds; r++) {
      for (const id of b.items) {
        const ex = catalog[id]; if (!ex) continue;
        const main = b.name === 'האימון';
        const type = main && program.override?.type ? program.override.type : ex.type;
        const base = main && program.override?.base != null ? program.override.base : ex.base;
        out.push({ exId: id, name: ex.name, type, target: scaleTarget(base, level, type), round: r, rounds, block: b.name });
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
