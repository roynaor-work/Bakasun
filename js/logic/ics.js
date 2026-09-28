/* A reminder into the phone's own calendar, so the phone rings at the hour: an .ics file the calendar app opens,
   or a Google Calendar link. No service in between. Pure, tested. */
import Office from './office.js';
import { str, trim } from './core.js';

const pad = n => String(n).padStart(2, '0');
const esc = s => str(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Local wall-clock stamp for the calendar (floating time: the phone's own zone). */
function stamp(date, time) {
  const d = Office.day(date); if (!d) return '';
  const [h, m] = (time || '09:00').split(':').map(Number);
  return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(h || 0) + pad(m || 0) + '00';
}
function plus(date, time, minutes) {
  const d = Office.day(date); const [h, m] = (time || '09:00').split(':').map(Number);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, (m || 0) + minutes);
  return String(x.getFullYear()) + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00';
}

/** {title, date: 'YYYY-MM-DD', time: 'HH:MM' (optional: all-day when missing), details, minutes (default 30), alarm (minutes before, default 10)} → .ics text */
export function icsText(ev) {
  const title = trim(ev.title); if (!title || !Office.day(ev.date)) return '';
  const uid = 'bakasun-' + (ev.id || Math.random().toString(36).slice(2)) + '@bakasun';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baka San//App//HE', 'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp(new Date(), pad(new Date().getHours()) + ':' + pad(new Date().getMinutes()))];
  if (ev.time) { lines.push('DTSTART:' + stamp(ev.date, ev.time)); lines.push('DTEND:' + plus(ev.date, ev.time, ev.minutes || 30)); }
  else { const d = Office.day(ev.date); lines.push('DTSTART;VALUE=DATE:' + Office.iso(d).replace(/-/g, '')); lines.push('DTEND;VALUE=DATE:' + Office.iso(Office.addDays(d, 1)).replace(/-/g, '')); }
  lines.push('SUMMARY:' + esc(title));
  if (trim(ev.details)) lines.push('DESCRIPTION:' + esc(ev.details));
  if (trim(ev.place)) lines.push('LOCATION:' + esc(ev.place));
  lines.push('BEGIN:VALARM', 'TRIGGER:-PT' + (ev.alarm == null ? 10 : ev.alarm) + 'M', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** The same event as a Google Calendar "add" link (works in the browser when the calendar app is not set up for .ics). */
export function gcalLink(ev) {
  const title = trim(ev.title); if (!title || !Office.day(ev.date)) return '';
  const dates = ev.time ? stamp(ev.date, ev.time) + '/' + plus(ev.date, ev.time, ev.minutes || 30) : Office.iso(ev.date).replace(/-/g, '') + '/' + Office.iso(Office.addDays(Office.day(ev.date), 1)).replace(/-/g, '');
  const q = { action: 'TEMPLATE', text: title, dates, details: str(ev.details), location: str(ev.place) };
  return 'https://calendar.google.com/calendar/render?' + Object.keys(q).filter(k => q[k]).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
}

/** A task or reminder record → the event to put in the calendar. */
export function taskEvent(task, cs) {
  return { id: task.id, title: task.title, date: task.due, time: task.time || '', details: [task.details, cs ? cs.client + (cs.date ? ' · ' + Office.fmt(cs.date) : '') : '', task.who].filter(Boolean).join('\n'), place: '' };
}

/** A case → its event day in the calendar (all day, or from the hours field when it has "HH:MM"). */
export function caseEvent(cs) {
  const m = /(\d{1,2}:\d{2})/.exec(str(cs.hours));
  return { id: cs.id, title: [cs.client, cs.kind].filter(Boolean).join(' · '), date: cs.date, time: m ? Office.hhmm(m[1]) : '', minutes: 240, alarm: 60, details: [cs.purpose, cs.participants ? cs.participants + ' משתתפים' : ''].filter(Boolean).join('\n'), place: str(cs.place) };
}
