/* Calendar: a month grid (Sunday first), a week, and the next 30 days as a list. Every day shows its events (coloured by status),
   open dated tasks, scheduled calls and payment due dates; tapping a day lists them with links, "+" adds a task or a new event on that day.
   This module also registers the "history" tab of the event card (read-only activity log). */
import { t, lang, statusLabel, kindLabel } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, dialog, toast, empty, section, copyBtn } from '../ui.js';
import Office from '../logic/office.js';
import { TASK } from '../logic/extra.js';
import { monthGrid, weekDays, weekStart, itemsByDay, agenda, shiftMonth, shiftDay, monthOf, dayIso } from '../logic/calendarGrid.js';
import { registerCaseTab } from '../caseTabs.js';
import { historyFor, groupByDay, fieldName, colName } from '../logic/history.js';

let view = 'month';
let month = null, week = null, selected = null, lastId = null;

const names = key => t(key).split(',');
const stCls = x => x.kind !== 'case' ? '' : ({ [Office.STATUS.won]: 'st-won', [Office.STATUS.done]: 'st-done', [Office.STATUS.quoted]: 'st-quoted' }[x.status] || 'st-lead');
const kindName = x => t({ case: 'calKindCase', task: 'calKindTask', call: 'calKindCall', pay: 'calKindPay' }[x.kind]);
const monthTitle = m => { const [y, mm] = m.split('-'); return names('calMonths')[+mm - 1] + ' ' + y; };
const dayTitle = iso => names('calDaysLong')[Office.day(iso).getDay()] + ' ' + Office.fmt(iso);
const shortDay = iso => names('calDays')[Office.day(iso).getDay()] + ' ' + Office.fmt(iso).slice(0, 5);

function itemHtml(x) {
  const sub = [x.kind === 'case' ? statusLabel(x.status) : kindName(x), x.sub].filter(Boolean).join(' · ');
  return `<a class="cal-item" href="${esc(x.href)}"><span class="cal-dot cal-tag k-${x.kind} ${stCls(x)}"></span>
    <span class="cal-t"><b>${esc(x.title)}</b>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</span>${x.time ? `<span class="cal-time count">${esc(x.time)}</span>` : ''}</a>`;
}
const plusBtn = iso => `<button type="button" class="btn sm ghost" data-plus="${esc(iso)}" aria-label="${esc(t('add'))}">+</button>`;
/** A day's items as lines of text: "10:00 title · sub". */
const itemLine = x => '• ' + [x.time, x.title, [x.kind === 'case' ? statusLabel(x.status) : kindName(x), x.sub].filter(Boolean).join(' · ')].filter(Boolean).join(' ');
const dayText = (iso, items) => dayTitle(iso) + '\n' + items.map(itemLine).join('\n');
const daysText = (title, days) => title + '\n\n' + days.map(d => dayText(d.iso, d.items)).join('\n\n');
const legend = () => `<div class="cal-legend">${[['k-case st-lead', t('s_' + Office.STATUS.lead)], ['k-case st-quoted', t('s_' + Office.STATUS.quoted)], ['k-case st-won', t('s_' + Office.STATUS.won)], ['k-task', t('calKindTask')], ['k-call', t('calKindCall')], ['k-pay', t('calKindPay')]]
  .map(([c, l]) => `<span><i class="cal-dot ${c}"></i>${esc(l)}</span>`).join('')}</div>`;

export function render(ctx) {
  const { root, id } = ctx;
  const today = todayIso();
  if (id && id !== lastId) {
    lastId = id;
    if (/^\d{4}-\d{2}$/.test(id)) { month = id; selected = null; view = 'month'; }
    else if (dayIso(id)) { selected = dayIso(id); month = monthOf(selected); week = weekStart(selected); view = 'month'; }
  }
  month = month || monthOf(today); selected = selected || today; week = week || weekStart(selected);
  const data = db.snapshot();

  let body = '';
  if (view === 'month') {
    const g = monthGrid(month, today);
    const by = itemsByDay(data, g.weeks[0][0].iso, g.weeks[g.weeks.length - 1][6].iso);
    const cell = d => {
      const items = by[d.iso] || [];
      return `<div class="cal-cell ${d.inMonth ? '' : 'out'} ${d.today ? 'today' : ''} ${d.iso === selected ? 'on' : ''} ${d.dow >= 5 ? 'weekend' : ''}" role="button" tabindex="0" data-day="${d.iso}" aria-label="${esc(dayTitle(d.iso))}${items.length ? ', ' + esc(t('calItems', { n: items.length })) : ''}">
        <span class="cal-n count">${d.day}</span>
        <span class="cal-dots">${items.slice(0, 8).map(x => `<i class="cal-dot k-${x.kind} ${stCls(x)}"></i>`).join('')}</span>
        <span class="cal-chips">${items.slice(0, 3).map(x => `<span class="cal-chip k-${x.kind} ${stCls(x)}" title="${esc(x.title)}">${x.time ? `<span class="count">${esc(x.time)}</span> ` : ''}${esc(x.title)}</span>`).join('')}${items.length > 3 ? `<span class="cal-more">${esc(t('calMore', { n: items.length - 3 }))}</span>` : ''}</span>
        <button type="button" class="cal-plus" data-plus="${d.iso}" aria-label="${esc(t('add'))}" tabindex="-1">+</button></div>`;
    };
    const dayItems = by[selected] || [];
    body = `<div class="cal-nav"><button class="btn sm" data-nav="-1" aria-label="${esc(t('calPrev'))}">‹</button><h2>${esc(monthTitle(g.month))}</h2><button class="btn sm" data-nav="1" aria-label="${esc(t('calNext'))}">›</button></div>
      <div class="cal-grid">${names('calDays').map(n => `<div class="cal-dn">${esc(n)}</div>`).join('')}${g.weeks.map(w => w.map(cell).join('')).join('')}</div>
      ${legend()}
      ${section(dayTitle(selected), `<div class="list">${dayItems.length ? dayItems.map(itemHtml).join('') : empty(t('calEmptyDay'))}</div>`,
        `<button class="btn sm" data-task="${esc(selected)}">+ ${esc(t('calAddTask'))}</button><button class="btn sm" data-event="${esc(selected)}">+ ${esc(t('calAddEvent'))}</button>${dayItems.length ? copyBtn(dayText(selected, dayItems), { icon: true }) : ''}`)}`;
  } else if (view === 'week') {
    const days = weekDays(week, today);
    const by = itemsByDay(data, days[0].iso, days[6].iso);
    const weekTitle = Office.fmt(days[0].iso).slice(0, 5) + ' – ' + Office.fmt(days[6].iso);
    const weekFull = days.filter(d => (by[d.iso] || []).length).map(d => ({ iso: d.iso, items: by[d.iso] }));
    body = `<div class="cal-nav"><button class="btn sm" data-nav="-1" aria-label="${esc(t('calPrev'))}">‹</button><h2><span class="count">${esc(weekTitle)}</span></h2>${weekFull.length ? copyBtn(daysText(t('calWeek') + ' ' + weekTitle, weekFull), { icon: true }) : ''}<button class="btn sm" data-nav="1" aria-label="${esc(t('calNext'))}">›</button></div>
      <div class="cal-week">${days.map(d => { const items = by[d.iso] || []; return `<div class="cal-wday ${d.today ? 'today' : ''}"><h3><span>${esc(shortDay(d.iso))}</span>${plusBtn(d.iso)}${items.length ? copyBtn(dayText(d.iso, items), { icon: true }) : ''}</h3>${items.length ? items.map(itemHtml).join('') : `<p class="empty">·</p>`}</div>`; }).join('')}</div>
      ${legend()}`;
  } else {
    const days = agenda(data, today, shiftDay(today, 30));
    body = `<div class="cal-nav"><h2>${esc(t('calNext30'))}</h2>${days.length ? copyBtn(daysText(t('calNext30'), days)) : ''}</div>
      <div class="cal-agenda">${days.length ? days.map(d => `<div class="cal-day-h ${d.iso === today ? 'today' : ''}"><span>${esc(dayTitle(d.iso))}</span>${plusBtn(d.iso)}${copyBtn(dayText(d.iso, d.items), { icon: true })}</div><div class="list">${d.items.map(itemHtml).join('')}</div>`).join('') : empty(t('calEmptyAgenda'))}</div>`;
  }

  root.innerHTML = `<header class="top cal-head"><h1>${esc(t('calendar'))}</h1><button class="btn sm" id="calToday">${esc(t('calToday'))}</button></header>
    <div class="tabs cal-tabs">${[['month', 'calMonth'], ['week', 'calWeek'], ['agenda', 'calAgenda']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-view="${k}">${esc(t(l))}</button>`).join('')}</div>
    ${body}`;

  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; render(ctx); });
  root.querySelector('#calToday').onclick = () => { month = monthOf(today); selected = today; week = weekStart(today); render(ctx); };
  root.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const n = +b.dataset.nav;
    if (view === 'month') { month = shiftMonth(month, n); if (monthOf(selected) !== month) selected = month === monthOf(today) ? today : month + '-01'; }
    else week = shiftDay(week, 7 * n);
    render(ctx);
  });
  root.querySelectorAll('.cal-cell').forEach(el => {
    const pick = () => { selected = el.dataset.day; if (monthOf(selected) !== month) month = monthOf(selected); render(ctx); };
    el.onclick = e => { if (!e.target.closest('[data-plus]')) pick(); };
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  });
  root.querySelectorAll('[data-plus]').forEach(b => b.onclick = e => { e.stopPropagation(); addOn(b.dataset.plus); });
  root.querySelectorAll('[data-task]').forEach(b => b.onclick = () => addTask(b.dataset.task));
  root.querySelectorAll('[data-event]').forEach(b => b.onclick = () => newEvent(b.dataset.event));
}

/** "+" on a day: a task on that date, or a new event (the lead screen, with the date already in the text). */
async function addOn(iso) {
  const r = await dialog(t('calAddOn', { d: Office.fmt(iso) }), field('what', t('calWhat'), 'task', { type: 'select', options: [['task', t('calAddTask')], ['event', t('calAddEvent')]] }), { ok: t('add') });
  if (!r) return;
  if (r.what === 'event') newEvent(iso); else addTask(iso);
}
async function addTask(iso) {
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const r = await dialog(t('calNewTaskOn', { d: Office.fmt(iso) }), field('title', t('taskTitle'), '') +
    `<div class="grid2">${field('who', t('taskWho'), '')}${field('time', t('time'), '', { type: 'time' })}</div>` +
    field('caseId', t('forCase'), '', { type: 'select', options: [['', t('none')]].concat(cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')])) }), { ok: t('save') });
  if (!r || !r.title) return;
  db.put('tasks', { title: r.title, who: r.who || '', time: r.time || '', caseId: r.caseId || '', due: iso, status: TASK.open });
  toast(t('saved'));
}
function newEvent(iso) {
  try { sessionStorage.setItem('bakasun.leadText', 'תאריך: ' + Office.fmt(iso)); } catch (e) { /* private mode: the lead screen just starts empty */ }
  location.hash = '#/lead';
}

/* ---------------- the "history" tab on the event card: read-only ---------------- */
const RECENT = 25;
let showAll = false;
const hasKey = k => t(k) !== k;
const STATUS_KEYS = { open: 'taskOpen', sent: 'taskSent', done: 'taskDone', todo: 'toCall', noanswer: 'noAnswer', answered: 'answered', callback: 'callBack' };
const hidden = f => /Id$|Key$/.test(f) || f === 'row'; // internal references mean nothing to the reader
function valText(f, v) {
  if (v === '' || v == null) return t('none');
  const s = String(v);
  if (f === 'status' && hasKey('s_' + s)) return statusLabel(s);
  if (f === 'status' && STATUS_KEYS[s] && hasKey(STATUS_KEYS[s])) return t(STATUS_KEYS[s]);
  if (f === 'kind') return kindLabel(s);
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return Office.fmt(s.slice(0, 10));
  return s;
}
function entryHtml(e) {
  const l = lang(); const arrow = l === 'he' ? '←' : '→';
  const at = new Date(e.at); const hm = isNaN(at) ? '' : String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
  const head = colName(e.col, l) + (e.label ? ' ' + e.label : '');
  const shown = (e.changes || []).filter(c => !hidden(c.field));
  const what = e.isNew ? t('histCreated') : e.deleted ? t('histDeleted') : (n => n === 1 ? t('histOne') : t('histCount', { n }))(shown.length || (e.changes || []).length);
  const chips = shown.slice(0, 8).map(c => `<span>${esc(fieldName(c.field, l))}: ${e.isNew ? esc(valText(c.field, c.to)) : esc(valText(c.field, c.from)) + ' ' + arrow + ' ' + esc(valText(c.field, c.to))}</span>`).join('');
  return `<div class="hist-entry ${e.isNew ? 'new' : e.deleted ? 'del' : ''}"><span class="hist-time">${esc(hm)}</span><div class="hist-body"><b>${esc(head)}</b> <span class="sub">· ${esc(what)}</span>${chips ? `<div class="hist-what">${chips}</div>` : ''}</div></div>`;
}
registerCaseTab({
  key: 'history', label: () => t('tHistory'),
  render(body, c) {
    const all = historyFor(c.id);
    const list = showAll ? all : all.slice(0, RECENT);
    body.classList.add('cal-body');
    body.innerHTML = `<p class="hint">${esc(t('histHint'))}</p>
      ${all.length > RECENT ? `<div class="tabs"><button class="${showAll ? '' : 'on'}" data-hist="recent">${esc(t('histRecent'))} (<span class="count">${RECENT}</span>)</button><button class="${showAll ? 'on' : ''}" data-hist="all">${esc(t('histAll'))} (<span class="count">${all.length}</span>)</button></div>` : ''}
      ${list.length ? groupByDay(list).map(g => `<div class="hist-day">${esc(Office.fmt(g.day))}</div><div class="card stack">${g.items.map(entryHtml).join('')}</div>`).join('') : empty(t('histEmpty'))}`;
    body.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { showAll = b.dataset.hist === 'all'; this.render(body, c); });
  }
});
