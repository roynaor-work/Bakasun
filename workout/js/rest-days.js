// יום חופש אחד בין ימי אימון שומר על הרצף. סופרים רק ימים שהתאמנו בהם.
// תאריכים אזרחיים מקומיים, בלי להניח שכל יום מכיל 24 שעות (שעון קיץ).
import { earned } from './logic.js?v=20261010-camera-1';
function calendarDay(value) {
  let date;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  } else {
    if (!(value instanceof Date) && typeof value !== 'string') return null;
    date = new Date(value);
  }
  return Number.isFinite(date.getTime()) ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5 : null;
}

export function restProgress(sessions = [], today = new Date()) {
  const now = calendarDay(today);
  const days = [...new Set(sessions.map(s => calendarDay(s?.date)).filter(day => day !== null && now !== null && day <= now))].sort((a, b) => a - b);
  let count = 0, best = 0, restUsed = false;
  for (let i = 0; i < days.length; i++) {
    const gap = i ? days[i] - days[i - 1] : Infinity;
    if (gap > 2) { count = 0; restUsed = false; }
    if (gap === 2) restUsed = true;
    count++; best = Math.max(best, count);
  }
  const age = days.length ? now - days.at(-1) : Infinity;
  if (age > 2) { count = 0; restUsed = false; }
  if (age === 2) restUsed = true;
  return { days: count, best, restUsed, trainedToday: age === 0 };
}

// תגי הרצף נשארים אחרי מנוחה, גם כשהתחיל רצף חדש.
export const restBadges = (stats, progress) => earned({ ...stats, streak: progress.best });

export function restCard(progress) {
  return `<section class="card stack rest-card" aria-label="הרצף שלי">
    <h2>הרצף שלי</h2>
    <p><b>${progress.days} ימי אימון ברצף</b> · הכי הרבה: ${progress.best}</p>
    <p class="small">${progress.restUsed ? 'נחת יום אחד. הרצף שלך נשמר.' : 'יום חופש אחד בין אימונים שומר על הרצף.'}</p>
    <p class="muted small">סופרים רק ימים שהתאמנת בהם.</p>
    <p class="muted small">כל האימונים, החגורות והמתנות שלך נשמרים.</p>
  </section>`;
}
