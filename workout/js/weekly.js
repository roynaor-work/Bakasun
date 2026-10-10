// תכנון שבוע ודוח להורה. תאריכים לפי לוח השנה המקומי של הטלפון, ראשון עד שבת.
import { dayKey, summarize } from './logic.js?v=20261010-child-copy-1';

export function normalizePlan(plan, programs, defaults) {
  return Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
    const value = plan && Object.hasOwn(plan, day) ? plan[day] : defaults[day];
    return [day, value === '' || (typeof value === 'string' && Object.hasOwn(programs, value)) ? value : defaults[day]];
  }));
}

export function validatePlan(plan, programs) {
  if (!plan || typeof plan !== 'object') return null;
  const result = {};
  for (let day = 0; day < 7; day++) {
    if (!Object.hasOwn(plan, day) || typeof plan[day] !== 'string' || (plan[day] !== '' && !Object.hasOwn(programs, plan[day]))) return null;
    result[day] = plan[day];
  }
  return result;
}

function localDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return dayKey(date) === value ? date : null;
  }
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const shiftDay = (date, days) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
export function weekStart(value = new Date()) {
  const date = localDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

// אותו אימון שמור במכשיר ובענן נספר פעם אחת. פיד הענן מוסיף משוב מעודכן.
export function reportSessions(local = [], feed = []) {
  const byId = new Map(), withoutId = [];
  for (const session of [...local, ...feed.map(row => row?.payload && ({ ...row.payload, id: row.id || row.payload.id }))]) {
    if (!session || !localDate(session.date)) continue;
    if (!session.id) withoutId.push(session);
    else byId.set(session.id, { ...byId.get(session.id), ...session });
  }
  return [...byId.values(), ...withoutId].sort((a, b) => localDate(b.date) - localDate(a.date));
}

export function weeklyReport(sessions, selected = new Date(), now = new Date()) {
  const current = weekStart(now), requested = weekStart(selected);
  const start = requested && requested <= current ? requested : current;
  const end = shiftDay(start, 7);
  const days = Array.from({ length: 7 }, (_, day) => {
    const date = shiftDay(start, day);
    return { day, date, key: dayKey(date), sessions: [], workouts: 0, seconds: 0, stars: 0, tried: 0, completed: 0 };
  });
  const feedback = { easy: 0, ok: 0, hard: 0 };
  let together = 0;
  for (const session of reportSessions(sessions)) {
    const date = localDate(session.date);
    if (date < start || date >= end || date > now) continue;
    const day = days[date.getDay()], sum = summarize(session);
    day.sessions.push(session); day.workouts++;
    day.seconds += Number.isFinite(sum.duration) ? Math.max(0, sum.duration) : 0;
    day.stars += sum.stars; day.tried += sum.doneCount; day.completed += sum.full;
    if (Object.hasOwn(feedback, session.feedback)) feedback[session.feedback]++;
    if (['workout', 'challenge'].includes(session.together?.mode)) together++;
  }
  const total = key => days.reduce((count, day) => count + day[key], 0);
  return { start, end: shiftDay(start, 6), previous: dayKey(shiftDay(start, -7)),
    next: start < current ? dayKey(end) : null, current: dayKey(current), days,
    workouts: total('workouts'), activeDays: days.filter(day => day.workouts).length,
    seconds: total('seconds'), minutes: Math.round(total('seconds') / 60), stars: total('stars'),
    tried: total('tried'), completed: total('completed'), together, feedback };
}
