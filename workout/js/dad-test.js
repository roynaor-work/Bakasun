// תאריכים אזרחיים מקומיים: חצות ושעון קיץ לא משנים את מספר הימים.
export function validTestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 9999) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? value : '';
}
export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function dadTestReminder(value, now = new Date()) {
  const date = validTestDate(value);
  if (!date || !Number.isFinite(now.getTime())) return null;
  const days = Math.round((Date.parse(date) - Date.parse(localDateKey(now))) / 864e5);
  if (days < 0 || days > 3) return null;
  return { date, days, voiceId: `dad-test-in-${days}`, key: `${date}:${localDateKey(now)}` };
}
export function dadTestToday(value, now = new Date()) {
  return dadTestReminder(value, now)?.days === 0 ? validTestDate(value) : '';
}
// ההצלחה היא בחוויה המשותפת. מספרי החזרות נשארים כפי שנמדדו.
export const isDadTest = session => !!validTestDate(session?.dadTestDate) &&
  session?.together?.mode === 'workout' && session.together.programId === 'full';
