/* Tasks handed to helpers: what, exactly what, who, by when. One tap sends it on WhatsApp (she presses send); one tap marks it done. */
import { t, langName } from '../i18n.js';
import { db } from '../store.js';
import { esc, field, empty, dialog, toast, openWhatsApp, dial, confirmDialog, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { TASK, openTasks, groupTasks, taskMessage } from '../logic/extra.js';
import { toCalendar } from '../calendar.js';
import { taskEvent } from '../logic/ics.js';

let tab = 'open';

export function render(ctx) {
  const { root } = ctx;
  const s = db.settings();
  const all = db.list('tasks');
  const open = openTasks(all, new Date());
  const done = all.filter(x => x.status === TASK.done).sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 30);
  const list = tab === 'open' ? open : done;
  const card = x => {
    const cs = x.caseId ? db.get('cases', x.caseId) : null;
    return `<div class="card" data-id="${esc(x.id)}">
      <div class="row between"><span class="title">${esc(x.title)}</span><span class="row">${x.status === TASK.sent ? `<span class="badge ok">${esc(t('taskSent'))}</span>` : ''}${x.due ? `<span class="badge ${x.late > 0 ? 'late' : 'muted'}">${esc(Office.fmt(x.due))}${x.time ? ' ' + esc(x.time) : ''}</span>` : ''}</span></div>
      ${x.details ? `<div class="sub" style="white-space:pre-wrap">${esc(x.details)}</div>` : ''}
      <div class="sub">${x.who ? `<b>${esc(x.who)}</b>` : ''}${cs ? ` · <a href="#/case/${esc(cs.id)}">${esc(cs.client)}${cs.date ? ' · ' + esc(Office.fmt(cs.date)) : ''}</a>` : ''}</div>
      ${tab === 'open' ? `<div class="row"><button class="btn wa" data-send>${esc(t('taskSend'))}</button>${x.phone ? `<button class="btn sm" data-dial>${esc(t('call'))}</button>` : ''}${x.due ? `<button class="btn sm" data-cal>${esc(t('toCalendar'))}</button>` : ''}<button class="btn sm ok" data-done>${esc(t('taskDone'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button>${copyBtn(taskMessage(x, cs, x.lang || s.msgLang || 'he', s.signer || ''))}</div>`
        : `<div class="row"><button class="btn sm ghost" data-reopen>${esc(t('reopen'))}</button></div>`}
    </div>`;
  };
  root.innerHTML = `<header class="top"><h1>${esc(t('tasks'))}</h1><button class="btn sm" id="new">+ ${esc(t('newTask'))}</button></header>
    <div class="tabs"><button class="${tab === 'open' ? 'on' : ''}" data-tab="open">${esc(t('taskOpen'))} (<span class="count">${open.length}</span>)</button><button class="${tab === 'done' ? 'on' : ''}" data-tab="done">${esc(t('doneTasks'))}</button></div>
    <div class="list sec">${!list.length ? empty(t('noTasks')) : tab === 'open' ? groupTasks(list, new Date()).map(g => `<div class="sub grp ${g.key === 'late' ? 'late' : ''}"><b>${esc(t('grp' + g.key[0].toUpperCase() + g.key.slice(1)))}</b> · ${g.items.length}</div>${g.items.map(card).join('')}`).join('') : list.map(card).join('')}</div>`;

  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(ctx); });
  root.querySelector('#new').onclick = () => edit(null, s);
  root.querySelectorAll('.card[data-id]').forEach(el => {
    const x = db.get('tasks', el.dataset.id);
    const cs = x.caseId ? db.get('cases', x.caseId) : null;
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-dial]', () => dial(x.phone));
    on('[data-cal]', () => toCalendar(taskEvent(x, cs)));
    on('[data-done]', () => db.put('tasks', { id: x.id, status: TASK.done }));
    on('[data-reopen]', () => db.put('tasks', { id: x.id, status: TASK.open }));
    on('[data-edit]', () => edit(x, s));
    on('[data-send]', async () => {
      const text = taskMessage(x, cs, x.lang || s.msgLang || 'he', s.signer || '');
      const r = await dialog(t('taskSend'), (x.phone ? '' : field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })) + `<textarea name="text" rows="9">${esc(text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (!r) return;
      const phone = x.phone || r.phone;
      if (openWhatsApp(phone, r.text)) db.put('tasks', { id: x.id, status: TASK.sent, phone });
    });
  });
}

async function edit(x, s) {
  x = x || {};
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const r = await dialog(x.id ? t('edit') : t('newTask'), field('title', t('taskTitle'), x.title || '') + field('details', t('taskDetails'), x.details || '', { type: 'textarea' }) +
    `<div class="grid2">${field('who', t('taskWho'), x.who || '')}${field('phone', t('fPhone'), x.phone || '', { ltr: true, inputmode: 'tel' })}${field('due', t('taskDue'), x.due || '', { type: 'date' })}
    ${field('lang', t('msgLang'), x.lang || s.msgLang || 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}</div>
    ${field('caseId', t('forCase'), x.caseId || '', { type: 'select', options: [['', t('none')]].concat(cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')])) })}` +
    (x.id ? `<input type="hidden" name="id" value="${esc(x.id)}"><div class="row end"><button type="button" class="btn danger sm" id="delTask">${esc(t('delete'))}</button></div>` : ''), { ok: t('save') });
  if (!r || !r.title) return;
  if (x.id) r.id = x.id; else r.status = TASK.open;
  db.put('tasks', r); toast(t('saved'));
}
document.addEventListener('click', async e => {
  if (e.target && e.target.id === 'delTask') {
    const form = e.target.closest('form'); const id = form.querySelector('[name=id]').value;
    if (id && await confirmDialog(t('confirmDelete'))) { db.remove('tasks', id); form.querySelector('[data-x=cancel]').click(); }
  }
});
