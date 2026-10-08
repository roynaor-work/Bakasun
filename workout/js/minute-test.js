// מבחן דקה: ספירה ידנית ושיא אישי לכל תרגיל, בנפרד מאימונים, כוכבים וחגורות.
export const MINUTE_MS = 60_000, COUNTDOWN_MS = 3_000;
export const MINUTE_RECORDS_KEY = 'kidfit.minuteRecords.v1';

export function startMinuteTest(exId, now) {
  if (typeof exId !== 'string' || !exId || !Number.isFinite(now) || now < 0) throw new TypeError('Invalid minute test');
  return { exId, count: 0, readyAt: now + COUNTDOWN_MS, endAt: now + COUNTDOWN_MS + MINUTE_MS, status: 'countdown' };
}

// לפי זמן שעבר, לא לפי מספר קריאות הטיימר. גם נגיעה בודקת את מועד הסיום.
export function advanceMinuteTest(state, now) {
  if (state.status === 'cancelled' || state.status === 'completed' || !Number.isFinite(now)) return state;
  const status = now >= state.endAt ? 'completed' : now >= state.readyAt ? 'running' : 'countdown';
  return status === state.status ? state : { ...state, status };
}

export function changeMinuteCount(state, delta, now) {
  const current = advanceMinuteTest(state, now);
  if (current.status !== 'running' || !Number.isFinite(now) || now < current.readyAt || (delta !== 1 && delta !== -1)) return current;
  return { ...current, count: Math.max(0, current.count + delta) };
}

export function cancelMinuteTest(state, now) {
  const current = advanceMinuteTest(state, now);
  return current.status === 'completed' ? current : { ...current, status: 'cancelled' };
}

const countIsValid = n => Number.isSafeInteger(n) && n >= 0;
const recordIsValid = r => r && countIsValid(r.best) && countIsValid(r.last) && r.best >= r.last && Number.isSafeInteger(r.attempts) && r.attempts > 0;

export function minuteResult(state, records = {}) {
  if (state.status !== 'completed' || !countIsValid(state.count)) return null;
  const old = Object.hasOwn(records, state.exId) && recordIsValid(records[state.exId]) ? records[state.exId] : null;
  const previousBest = old ? old.best : null;
  const comparison = !old ? 'first' : state.count > old.best ? 'higher' : state.count === old.best ? 'same' : 'lower';
  const comparisonText = {
    first: 'זו הדקה הראשונה שלך בתרגיל הזה. מכאן ממשיכים בקצב שלך.',
    higher: 'שיא אישי חדש! כיף לראות את הדרך שלך.',
    same: 'הגעת שוב לשיא האישי שלך. כל הכבוד על המאמץ!',
    lower: `השיא האישי שלך נשאר ${previousBest}. כל יום מרגיש קצת אחרת.`,
  }[comparison];
  return { count: state.count, previousBest, best: Math.max(state.count, previousBest ?? 0), comparison, comparisonText,
    message: state.count ? 'כל הכבוד על המאמץ שלך! כל תנועה נחשבת.' : 'הדקה הסתיימה. אפשר לנוח ולנסות שוב כשתרצה.' };
}

export function recordMinuteTest(records, state) {
  const result = minuteResult(state, records);
  if (!result) return records;
  const old = Object.hasOwn(records, state.exId) && recordIsValid(records[state.exId]) ? records[state.exId] : null;
  return { ...records, [state.exId]: { best: result.best, last: state.count, attempts: (old?.attempts || 0) + 1 } };
}

export function loadMinuteRecords(storage) {
  try {
    const records = JSON.parse(storage.getItem(MINUTE_RECORDS_KEY) || '{}');
    if (!records || typeof records !== 'object' || Array.isArray(records)) return {};
    return Object.fromEntries(Object.entries(records).filter(([, r]) => recordIsValid(r)));
  } catch { return {}; }
}

export function saveMinuteRecords(storage, records) {
  try { storage.setItem(MINUTE_RECORDS_KEY, JSON.stringify(records)); return true; }
  catch { return false; }
}
