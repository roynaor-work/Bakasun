/* "To the calendar": one tap and the reminder is in the phone's calendar, which rings at the hour. */
import { t } from './i18n.js';
import { esc, dialog, toast } from './ui.js';
import { downloadFile, shareFile } from './files.js';
import { icsText, gcalLink } from './logic/ics.js';

/** Opens a small dialog: the calendar file (the calendar app opens it) or a Google Calendar link. */
export async function toCalendar(ev) {
  const ics = icsText(ev); if (!ics) { toast(t('calNoDate')); return; }
  const g = gcalLink(ev);
  const when = ev.date ? ev.date.split('-').reverse().join('/') + (ev.time ? ' ' + ev.time : '') : '';
  const r = await dialog(t('toCalendar'), `<p><b>${esc(ev.title)}</b><br><span class="sub">${esc(when)}</span></p><p class="hint">${esc(t('calHint'))}</p>
    <div class="row"><a class="btn" href="${esc(g)}" target="_blank" rel="noopener" data-x="cancel">${esc(t('gcal'))}</a></div>`, { ok: t('calFile') });
  if (r === null) return;
  const name = 'bakasun-' + (ev.date || 'event') + '.ics';
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const rec = { blob, name, type: 'text/calendar', title: ev.title };
  // Android: the share sheet lists the calendar app; otherwise a download that the calendar picks up
  if (!(await shareFile(rec, ev.title))) downloadFile(rec);
  toast(t('calOpened'), 3000);
}
