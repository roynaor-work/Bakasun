/* The dashboard: tiles that count what is open, the three things to do now, the next two weeks and money by event.
   Every tile is a link to its screen. The numbers come from js/logic/dashboard.js; this file only draws. */
import { t, kindLabel } from '../i18n.js';
import { db } from '../store.js';
import { esc, section, empty, relDay } from '../ui.js';
import Office from '../logic/office.js';
import { dashboardData } from '../logic/dashboard.js';

const ICONS = {
  events: 'M4 6h16v13H4zM4 10h16M8 6V4h8v2',
  late: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  today: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M9 14l2 2 4-4',
  week: 'M4 6h12M4 12h12M4 18h8M18 16l2 2 4-4',
  calls: 'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z',
  money: 'M3 7h18v10H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01',
  quotes: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6',
  suppliers: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  leads: 'M12 3a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5zM4 21a8 8 0 0 1 16 0M18 4l2 2M20 4l-2 2'
};
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const kindKey = k => 'dbKind' + k.charAt(0).toUpperCase() + k.slice(1);

function tile(href, icon, n, label, sub, tone) {
  return `<a class="card tap dash-tile ${tone || ''}" href="${href}">
    <span class="dash-ico">${svg(ICONS[icon])}</span>
    <span class="dash-body"><span class="dash-n">${esc(n)}</span><span class="dash-l">${esc(label)}</span>${sub ? `<span class="dash-s">${esc(sub)}</span>` : ''}</span></a>`;
}

function nowItem(x, i) {
  const late = x.kind === 'event' ? (x.inDays === 0 ? t('todayIs') : x.inDays === 1 ? t('tomorrow') : relDay(Office.addDays(new Date(), x.inDays)))
    : x.kind === 'taskToday' ? t('todayIs')
    : x.kind === 'call' ? ''
    : x.kind === 'supplierSilent' || x.kind === 'quoteWaiting' || x.kind === 'lead' ? (x.late ? t('dbWaitedDays', { n: x.late }) : '')
    : x.late ? t('dbLateDays', { n: x.late }) : '';
  const urgent = x.kind === 'taskLate' || x.kind === 'payLate' || (x.kind === 'event' && x.inDays <= 1);
  return `<a class="card tap dash-now-item" href="${esc(x.href)}">
    <span class="dash-rank">${i + 1}</span>
    <span class="grow dash-now-body"><span class="row between"><span class="title">${esc(x.title)}</span>${late ? `<span class="badge ${urgent ? '' : 'warn'}">${esc(late)}</span>` : ''}</span>
      <span class="sub"><b>${esc(t(kindKey(x.kind)))}</b>${x.sub ? ' · ' + esc(x.sub) : ''}</span></span></a>`;
}

function agenda(next) {
  if (!next.length) return empty(t('dbNext14Empty'));
  const days = [];
  next.forEach(x => { let d = days[days.length - 1]; if (!d || d.date !== x.date) { d = { date: x.date, items: [] }; days.push(d); } d.items.push(x); });
  return `<div class="dash-agenda">${days.map(d => `<div class="sub grp dash-day"><b>${esc(relDay(d.date))}</b> · ${esc(Office.fmt(d.date))}</div>
    ${d.items.map(x => `<a class="card row tap dash-row ${x.type}" href="${esc(x.href)}"><span class="badge ${x.type === 'event' ? '' : 'muted'}">${esc(x.type === 'event' ? t('dbEvent') : t('dbTask'))}</span>
      <span class="grow"><span class="title">${esc(x.type === 'event' ? [x.client, kindLabel(x.kind)].filter(Boolean).join(' · ') : x.title)}</span>${x.sub || x.time ? `<span class="sub">${esc([x.time, x.sub].filter(Boolean).join(' · '))}</span>` : ''}</span></a>`).join('')}`).join('')}</div>`;
}

function moneyTable(rows) {
  if (!rows.length) return empty(t('dbMoneyEmpty'));
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const cell = n => `<td class="n">${esc(Office.money(n))}</td>`;
  return `<div class="tablewrap card dash-table"><table class="cmp"><thead><tr><th>${esc(t('dbEvent'))}</th><th>${esc(t('dbPlanned'))}</th><th>${esc(t('dbInvoiced'))}</th><th>${esc(t('dbPaid'))}</th><th>${esc(t('dbOpenAmount'))}</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><a href="#/case/${esc(r.caseId)}/money">${esc(r.client)}</a><span class="sub"> · ${esc([kindLabel(r.kind), r.date ? Office.fmt(r.date) : ''].filter(Boolean).join(' · '))}</span><span class="dash-bar" title="${r.pct}%"><i style="width:${r.pct}%"></i></span></td>${cell(r.planned)}${cell(r.invoiced)}${cell(r.paid)}<td class="n ${r.open > 0 ? 'open' : 'done'}">${esc(Office.money(r.open))}</td></tr>`).join('')}
    </tbody><tfoot><tr><th>${esc(t('dbTotal'))}</th>${['planned', 'invoiced', 'paid', 'open'].map(k => `<th class="n">${esc(Office.money(sum(k)))}</th>`).join('')}</tr></tfoot></table></div>`;
}

export function render({ root }) {
  const data = db.snapshot();
  const d = dashboardData({ cases: data.cases, tasks: data.tasks, calls: data.calls, payments: data.payments, quotes: data.quotes, links: data.links }, new Date());
  const nx = d.events.next;
  const nextSub = d.events.count ? (nx ? t('dbNextEvent', { when: relDay(nx.date) + ' · ' + (nx.client || '') }) : t('dbNoDate')) : '';
  const silentCases = Array.from(new Set(d.suppliers.list.map(l => l.caseId).filter(Boolean)));
  const silentHref = silentCases.length === 1 ? '#/case/' + silentCases[0] + '/suppliers' : d.suppliers.count ? '#/today' : '#/suppliers';

  root.innerHTML = `
    <header class="top"><h1>${esc(t('dashboard'))}</h1><span class="hint dash-date">${esc(Office.fmt(new Date()))}</span>
      <a class="icon" href="#/today" aria-label="${esc(t('today'))}" title="${esc(t('today'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/></svg></a></header>
    <p class="hint">${esc(t('dbSubtitle'))}</p>
    ${section(t('dbNow'), d.now.length ? `<div class="dash-now">${d.now.map(nowItem).join('')}</div>` : `<div class="okbox">${esc(t('dbNowEmpty'))}</div>`)}
    <section class="sec"><div class="dash-tiles">
      ${tile('#/cases', 'events', d.events.count, t('dbOpenEvents'), nextSub, 'accent')}
      ${tile('#/tasks', 'late', d.tasks.overdue, t('dbTasksOverdue'), '', d.tasks.overdue ? 'warn' : 'ok')}
      ${tile('#/tasks', 'today', d.tasks.today, t('dbTasksToday'), '')}
      ${tile('#/tasks', 'week', d.tasks.week, t('dbTasksWeek'), '')}
      ${tile('#/calls', 'calls', d.calls.count, t('dbCalls'), d.calls.scheduled ? t('dbCallsLater', { n: d.calls.scheduled }) : '')}
      ${tile('#/money', 'money', Office.money(d.money.total), t('dbUnpaid'), t('dbUnpaidCount', { n: d.money.count }), d.money.count ? 'warn' : 'ok')}
      ${tile('#/quotes', 'quotes', d.quotes.count, t('dbQuotes'), d.quotes.count && d.quotes.list[0].waited != null ? t('dbWaitedDays', { n: d.quotes.list[0].waited }) : '')}
      ${tile(silentHref, 'suppliers', d.suppliers.count, t('dbSuppliers'), t('dbSuppliersHint'), d.suppliers.count ? 'warn' : 'ok')}
      ${tile('#/cases', 'leads', d.leads.count, t('dbLeads'), t('dbLeadsHint'))}
    </div><p class="hint">${esc(t('dbAllTiles'))}</p></section>
    <div class="dash-cols">
      ${section(t('dbNext14'), agenda(d.next))}
      ${section(t('dbMoneyByEvent'), `<p class="hint">${esc(t('dbMoneyHint'))}</p>${moneyTable(d.moneyByEvent)}`)}
    </div>`;
}
