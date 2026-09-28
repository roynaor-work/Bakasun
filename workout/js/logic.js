// היגיון טהור בלי DOM: חישוב יעדים לפי רמה, סיכומים, רצף ימים, תגים. נבדק ב-tests/workout.test.mjs.
export const LEVELS = { easy: { name: 'קל', mult: 0.7 }, normal: { name: 'רגיל', mult: 1 }, hard: { name: 'חזק', mult: 1.35 } };

export function scaleTarget(base, level = 'normal', type = 'reps') {
  const m = (LEVELS[level] || LEVELS.normal).mult;
  const v = Math.round(base * m / (type === 'time' ? 5 : 1)) * (type === 'time' ? 5 : 1);
  return Math.max(type === 'time' ? 10 : 3, v);
}

// בונה את רשימת הפריטים לאימון מתוך תוכנית (או רשימת תרגילים חופשית)
export function buildItems(program, catalog, level = 'normal') {
  const out = [];
  const rounds = program.rounds || 1;
  for (let r = 1; r <= rounds; r++) {
    for (const id of program.items) {
      const ex = catalog[id]; if (!ex) continue;
      const type = program.override?.type || ex.type;
      const base = program.override?.base ?? ex.base;
      out.push({ exId: id, name: ex.name, type, target: scaleTarget(base, level, type), round: r });
    }
  }
  return out;
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
