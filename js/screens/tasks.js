/* Tasks handed to helpers: what, exactly what, who, by when. One tap sends it on WhatsApp (she presses send); one tap marks it done.
   Round 3 (tasks2): subtasks, a checklist inside a task, dependencies with a critical path per event, recurring tasks,
   start + duration in workdays, priority, task numbers, a timer, comments (the notes collection). Logic in
   js/logic/taskTree.js, recurring.js, workdays.js; texts in js/i18n/tasks2.js; styles in css/tasks2.css. */
import { t, langName } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, empty, dialog, toast, openWhatsApp, dial, confirmDialog, copyBtn, copyOf, openWhatsAppAsk } from '../ui.js';
import Office from '../logic/office.js';
import { TASK, openTasks, groupTasks, taskMessage } from '../logic/extra.js';
import { toCalendar } from '../calendar.js';
import { taskEvent } from '../logic/ics.js';
import * as TT from '../logic/taskTree.js';
import { nextOccurrence, materialize, EVERY } from '../logic/recurring.js';
import { dueFrom, holidaysBetween } from '../logic/workdays.js';

let tab = 'open';
const collapsed = new Set(); // parents whose subtasks are folded
let q = '';                  // the search box
const forceArmed = {};       // task id → time of the first "done" tap on a parent with open subtasks
let focusAdd = '';           // card whose "new todo" box keeps the focus after a re-render
let maintaining = false;

const isDone = x => x.status === TASK.done;
const prioKey = p => 'tkPrio' + (p || 'normal').charAt(0).toUpperCase() + (p || 'normal').slice(1);
const caseLabel = c => (c.client || t('unknownClient')) + (c.kind ? ' · ' + c.kind : '') + (c.date ? ' · ' + Office.fmt(c.date) : '');
const ruleText = rule => {
  if (!rule || !EVERY.includes(rule.every)) return '';
  const every = t('tkEvery' + rule.every.charAt(0).toUpperCase() + rule.every.slice(1));
  const on = rule.every === 'week' && rule.on != null && rule.on !== '' ? ' · ' + t('tkOnWeekday') + ' ' + t('tkWd' + rule.on) : /month/.test(rule.every) && rule.on ? ' · ' + t('tkOnDomShort', { n: rule.on }) : '';
  return every + on + (rule.until ? ' · ' + t('tkUntilShort', { d: Office.fmt(rule.until) }) : '') + (rule.count ? ' · ×' + rule.count : '');
};

export function render(ctx) {
  const { root } = ctx;
  const filterCase = ctx.id === 'case' ? (ctx.query && ctx.query[0]) || '' : '';
  const s = db.settings();
  const all = db.list('tasks');
  scheduleMaintenance();
  const real = all.filter(x => !x.isTemplate);
  const scope = filterCase ? real.filter(x => x.caseId === filterCase) : real;
  const open = openTasks(scope, new Date());
  const done = scope.filter(isDone).sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 30);
  const templates = all.filter(x => x.isTemplate && (!filterCase || x.caseId === filterCase)).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status) || c.id === filterCase).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const withTasks = cases.filter(c => c.id === filterCase || all.some(x => x.caseId === c.id));
  const now = Date.now();

  const card = (node, depth) => {
    const x = node.task;
    const cs = x.caseId ? db.get('cases', x.caseId) : null;
    const prog = TT.progressOf(x, all);
    const blockers = TT.blockersOf(x, all);
    const running = !!(x.timer && x.timer.startedAt);
    const spent = TT.spentMinutes(x, now);
    const todos = x.todos || [];
    const tp = TT.todoProgress(todos);
    const folded = collapsed.has(x.id);
    const kids = node.children || [];
    const openCard = !isDone(x);
    return `<div class="card tk ${depth ? 'tk-child' : ''} ${blockers.length ? 'tk-blocked' : ''}" data-id="${esc(x.id)}">
      <div class="row between">
        <span class="title"><span class="tk-dot p-${esc(x.priority || 'normal')}" title="${esc(t(prioKey(x.priority)))}"></span>${x.no ? `<span class="tk-no ltr">#${esc(x.no)}</span> ` : ''}${esc(x.title)}</span>
        <span class="row">${x.status === TASK.sent ? `<span class="badge ok">${esc(t('taskSent'))}</span>` : ''}${x.templateId ? `<span class="badge muted">${esc(t('tkFromTemplate'))}</span>` : ''}${blockers.length ? `<span class="badge warn tk-lock">🔒 ${esc(t('tkWaitingFor', { what: blockers.map(b => b.title).join(', ') }))}</span>` : ''}${x.due ? `<span class="badge ${x.late > 0 ? 'late' : 'muted'}">${esc(Office.fmt(x.due))}${x.time ? ' ' + esc(x.time) : ''}</span>` : ''}</span>
      </div>
      ${x.details ? `<div class="sub" style="white-space:pre-wrap">${esc(x.details)}</div>` : ''}
      ${todos.length || openCard ? `<div class="tk-todos">${todos.map(td => `<button type="button" class="tk-todo ${td.done ? 'done' : ''}" data-todo="${esc(td.id)}"><span class="tk-box">${td.done ? '✓' : ''}</span><span>${esc(td.text)}</span></button>`).join('')}
        ${openCard ? `<form class="tk-addtodo" data-addtodo><input name="todo" placeholder="${esc(t('tkAddTodo'))}" autocomplete="off"><button type="submit" class="btn sm ghost">${esc(t('tkAdd'))}</button></form>` : ''}
        ${tp.total ? `<span class="sub tk-tp">${tp.done}/${tp.total}</span>` : ''}</div>` : ''}
      <div class="sub">${x.who ? `<b>${esc(x.who)}</b>` : ''}${cs ? `${x.who ? ' · ' : ''}<a href="#/case/${esc(cs.id)}">${esc(cs.client)}${cs.date ? ' · ' + esc(Office.fmt(cs.date)) : ''}</a>` : ''}${spent || running ? `${x.who || cs ? ' · ' : ''}<span class="tk-spent ${running ? 'on' : ''}" ${running ? `data-live="${esc(x.id)}"` : ''}>${esc(t('tkSpent', { n: spent }))}${running ? ' · ' + esc(t('tkRunning')) : ''}</span>` : ''}</div>
      ${prog.total ? `<button type="button" class="tk-fold" data-toggle>${folded ? '▸' : '▾'} ${esc(t('tkSubtasks'))} <span class="badge ${prog.done === prog.total ? 'ok' : 'muted'}">${prog.done}/${prog.total}</span></button>` : ''}
      ${kids.length && !folded ? `<div class="tk-kids">${kids.map(k => card(k, depth + 1)).join('')}</div>` : ''}
      ${openCard ? `<div class="row"><button class="btn wa" data-send>${esc(t('taskSend'))}</button>${x.phone ? `<button class="btn sm" data-dial>${esc(t('call'))}</button>` : ''}${x.due ? `<button class="btn sm" data-cal>${esc(t('toCalendar'))}</button>` : ''}<button class="btn sm ok" data-done>${esc(t('taskDone'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-sub>${esc(t('tkSubtask'))}</button><button class="btn sm ghost ${running ? 'tk-on' : ''}" data-timer>${running ? '■ ' + esc(t('tkTimerStop')) : '▶ ' + esc(t('tkTimerStart'))}</button>${copyBtn(taskMessage(x, cs, x.lang || s.msgLang || 'he', s.signer || ''))}</div>`
        : `<div class="row"><button class="btn sm ghost" data-reopen>${esc(t('reopen'))}</button></div>`}
    </div>`;
  };

  const tplCard = x => {
    const cs = x.caseId ? db.get('cases', x.caseId) : null;
    const next = x.repeat ? nextOccurrence(x.repeat, x.lastDue || '') : '';
    return `<div class="card tk tk-tpl" data-tpl="${esc(x.id)}">
      <div class="row between"><span class="title"><span class="tk-dot p-${esc(x.priority || 'normal')}"></span>↻ ${esc(x.title)}</span><span class="badge ${next ? 'muted' : 'warn'}">${next ? esc(t('tkNextOn', { d: Office.fmt(next) })) : esc(t('tkEnded'))}</span></div>
      <div class="sub">${esc(ruleText(x.repeat))}${x.made ? ' · ' + esc(t('tkMade', { n: x.made })) : ''}</div>
      <div class="sub">${x.who ? `<b>${esc(x.who)}</b>` : ''}${cs ? `${x.who ? ' · ' : ''}<a href="#/case/${esc(cs.id)}">${esc(cs.client)}</a>` : ''}</div>
      <div class="row"><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button><button class="btn sm ghost" data-del>${esc(t('delete'))}</button></div>
    </div>`;
  };

  // the open list: parents in their day group, subtasks nested inside them (an open subtask of a closed parent is a root)
  const roots = TT.tree(open);
  const byId = new Map(roots.map(n => [n.task.id, n]));
  const groups = groupTasks(roots.map(n => n.task), new Date()).map(g => ({ key: g.key, items: TT.sortByPriority(g.items).map(x => byId.get(x.id)) }));

  let box = '';
  if (filterCase) {
    const cs = db.get('cases', filterCase);
    const crit = TT.criticalPath(scope);
    const spentAll = TT.spentOfCase(scope, filterCase, now);
    box = `<div class="card tk-box">
      <div class="row between"><a class="title" href="#/case/${esc(filterCase)}">${esc(cs ? caseLabel(cs) : filterCase)}</a><span class="row"><span class="badge muted">${esc(t('tkOpenCount', { n: open.length }))}</span><span class="badge ok">${esc(t('tkDoneCount', { n: scope.filter(isDone).length }))}</span></span></div>
      ${spentAll ? `<div class="sub">⏱ ${esc(t('tkSpentTotal', { n: spentAll }))}</div>` : ''}
      <div class="tk-crit"><b>${esc(t('tkCritical'))}</b> <span class="hint">${esc(t('tkCriticalHint'))}</span>
        ${crit.length ? `<ol>${crit.map(x => `<li><span class="${isDone(x) ? 'tk-done' : ''}">${x.no ? `<span class="tk-no ltr">#${esc(x.no)}</span> ` : ''}${esc(x.title)}</span>${x.due ? ` <span class="badge ${!isDone(x) && x.due < todayIso() ? 'late' : 'muted'}">${esc(Office.fmt(x.due))}</span>` : ''}</li>`).join('')}</ol>` : `<p class="hint">${esc(t('tkCriticalNone'))}</p>`}
      </div></div>`;
  }

  const chips = withTasks.length ? `<div class="chips tk-chips"><button type="button" class="chip ${!filterCase ? 'on' : ''}" data-case="">${esc(t('tkAllEvents'))}</button>${withTasks.map(c => `<button type="button" class="chip ${c.id === filterCase ? 'on' : ''}" data-case="${esc(c.id)}">${esc(c.client || t('unknownClient'))}${c.date ? ' · ' + esc(Office.fmt(c.date)) : ''}</button>`).join('')}</div>` : '';

  const list = tab === 'open' ? (!open.length ? empty(t('noTasks')) : groups.map(g => `<div class="sub grp ${g.key === 'late' ? 'late' : ''}"><b>${esc(t('grp' + g.key[0].toUpperCase() + g.key.slice(1)))}</b> · ${g.items.length}</div>${g.items.map(n => card(n, 0)).join('')}`).join(''))
    : tab === 'done' ? (!done.length ? empty(t('noTasks')) : done.map(x => card({ task: x, children: [] }, 0)).join(''))
    : (!templates.length ? empty(t('tkNoRecurring')) : `<p class="hint">${esc(t('tkTemplateHint'))}</p>` + templates.map(tplCard).join(''));

  root.innerHTML = `<header class="top"><h1>${esc(t('tasks'))}</h1><button class="btn sm" id="new">${tab === 'rec' ? esc(t('tkNewRecurring')) : '+ ' + esc(t('newTask'))}</button></header>
    ${chips}${box}
    <div class="tabs"><button class="${tab === 'open' ? 'on' : ''}" data-tab="open">${esc(t('taskOpen'))} (<span class="count">${open.length}</span>)</button><button class="${tab === 'done' ? 'on' : ''}" data-tab="done">${esc(t('doneTasks'))}</button><button class="${tab === 'rec' ? 'on' : ''}" data-tab="rec">↻ ${esc(t('tkRecurring'))}${templates.length ? ` (${templates.length})` : ''}</button></div>
    <input id="tkq" class="tk-search" type="search" placeholder="${esc(t('tkSearchPh'))}" value="${esc(q)}" autocomplete="off">
    <div class="list sec">${list}<p class="empty tk-nomatch" hidden>${esc(t('tkNoMatch'))}</p></div>`;

  root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(ctx); });
  root.querySelectorAll('[data-case]').forEach(b => b.onclick = () => { location.hash = b.dataset.case ? '#/tasks/case/' + b.dataset.case : '#/tasks'; });
  root.querySelector('#new').onclick = () => edit(tab === 'rec' ? { isTemplate: true, caseId: filterCase } : { caseId: filterCase }, s);
  const qi = root.querySelector('#tkq');
  qi.oninput = () => { q = qi.value; applyFilter(root); };
  applyFilter(root);

  root.querySelectorAll('.card[data-tpl]').forEach(el => {
    const x = db.get('tasks', el.dataset.tpl);
    el.querySelector('[data-edit]').onclick = () => edit(x, s);
    el.querySelector('[data-del]').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) db.remove('tasks', x.id); };
  });

  root.querySelectorAll('.card[data-id]').forEach(el => {
    const x = db.get('tasks', el.dataset.id);
    if (!x) return;
    const cs = x.caseId ? db.get('cases', x.caseId) : null;
    const mine = sel => Array.from(el.querySelectorAll(sel)).filter(b => b.closest('.card[data-id]') === el);
    const on = (sel, fn) => mine(sel).forEach(b => { b.onclick = fn; });
    on('[data-dial]', () => dial(x.phone));
    on('[data-cal]', () => toCalendar(taskEvent(x, cs)));
    on('[data-done]', () => markDone(x));
    on('[data-reopen]', () => db.put('tasks', { id: x.id, status: TASK.open, forceClose: false }));
    on('[data-edit]', () => edit(x, s));
    on('[data-sub]', () => edit({ parentId: x.id, caseId: x.caseId || '', who: x.who || '', phone: x.phone || '', lang: x.lang || '', due: x.due || '' }, s));
    on('[data-toggle]', () => { if (collapsed.has(x.id)) collapsed.delete(x.id); else collapsed.add(x.id); render(ctx); });
    on('[data-timer]', () => {
      if (x.timer && x.timer.startedAt) { const p = TT.stopTimer(x); db.put('tasks', Object.assign({ id: x.id }, p)); toast(t('tkTimerStopped', { n: p.spentMin })); }
      else db.put('tasks', Object.assign({ id: x.id }, TT.startTimer(x)));
    });
    mine('[data-todo]').forEach(b => { b.onclick = () => db.put('tasks', { id: x.id, todos: TT.toggleTodo(x.todos, b.dataset.todo) }); });
    mine('[data-addtodo]').forEach(f => {
      f.onsubmit = e => { e.preventDefault(); const v = f.todo.value.trim(); if (!v) return; focusAdd = x.id; db.put('tasks', { id: x.id, todos: TT.addTodo(x.todos, v) }); };
      if (focusAdd === x.id) { focusAdd = ''; setTimeout(() => f.todo.focus(), 0); }
    });
    on('[data-send]', async () => {
      const text = taskMessage(x, cs, x.lang || s.msgLang || 'he', s.signer || '');
      const r = await dialog(t('taskSend'), (x.phone ? '' : field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })) + `<textarea name="text" rows="9">${esc(text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (!r) return;
      const phone = x.phone || r.phone;
      if (await openWhatsAppAsk(phone, r.text)) db.put('tasks', { id: x.id, status: TASK.sent, phone });
    });
  });
}

/** Hides the cards (and day headers) that do not match the search box. Nothing is re-rendered, so typing keeps the focus. */
function applyFilter(root) {
  const s = q.trim();
  let shown = 0;
  root.querySelectorAll('.list > .card[data-id]').forEach(c => {
    const ids = [c.dataset.id].concat(Array.from(c.querySelectorAll('.card[data-id]')).map(k => k.dataset.id));
    const hit = !s || ids.some(id => { const x = db.get('tasks', id); return x && TT.matchesQuery(x, s); });
    c.hidden = !hit; if (hit) shown++;
  });
  root.querySelectorAll('.list > .grp').forEach(g => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('grp')) { if (n.matches('.card') && !n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
  const nm = root.querySelector('.tk-nomatch'); if (nm) nm.hidden = !(s && !shown && root.querySelector('.list > .card[data-id]'));
}

/** "Done" on a card: a parent with open subtasks gets a toast; a second tap within 8 seconds asks to close it anyway. */
async function markDone(x) {
  const all = db.list('tasks');
  const c = TT.canClose(x, all);
  if (!c.ok) {
    if (forceArmed[x.id] && Date.now() - forceArmed[x.id] < 8000) {
      delete forceArmed[x.id];
      if (await confirmDialog(t('tkForceCloseQ'), t('tkCloseAnyway'))) closeTask(x, all, true);
      return;
    }
    forceArmed[x.id] = Date.now();
    toast(t('tkCloseChildrenFirst'), 3000);
    return;
  }
  closeTask(x, all, false);
}
function closeTask(x, all, force) {
  const patch = { id: x.id, status: TASK.done };
  if (x.timer && x.timer.startedAt) Object.assign(patch, TT.stopTimer(x));
  if (force) patch.forceClose = true;
  const ready = TT.readyAfterClose(x.id, all);
  db.put('tasks', patch);
  if (ready.length) toast(t('tkNowReady', { what: ready.map(r => r.title).join(', ') }), 3500);
}

/** After each render, once the screen is drawn: number the tasks that have none, and create the next occurrence of every
 *  recurring template that needs one (idempotent; nothing happens on a second run). */
function scheduleMaintenance() { if (!maintaining) setTimeout(maintain, 0); }
function maintain() {
  if (maintaining) return;
  maintaining = true;
  try {
    const all = db.list('tasks'); const today = todayIso();
    let seq = +db.setting('taskSeq') || 0; let changed = false;
    all.filter(x => !x.isTemplate && !x.no).sort((a, b) => String(a.created).localeCompare(String(b.created))).forEach(x => { seq++; db.put('tasks', { id: x.id, no: seq }); changed = true; });
    all.filter(x => x.isTemplate).forEach(tpl => {
      const r = materialize(tpl, today, all);
      if (!r.create) return;
      seq++; changed = true;
      const rec = Object.assign(r.create, { no: seq });
      if (rec.start && rec.duration && rec.durationUnit) rec.due = dueFrom(rec.start, rec.duration, rec.durationUnit, { holidays: tpl.holidays !== false }) || rec.due;
      db.put('tasks', rec); db.put('tasks', r.patch);
      toast(t('tkRecurringMade', { what: rec.title }), 3000);
    });
    if (changed) db.setting('taskSeq', seq);
  } finally { maintaining = false; }
}

/* A running timer ticks on the card without a re-render. */
setInterval(() => document.querySelectorAll('[data-live]').forEach(el => { const x = db.get('tasks', el.dataset.live); if (x) el.textContent = t('tkSpent', { n: TT.spentMinutes(x) }) + ' · ' + t('tkRunning'); }), 30000);

async function edit(x, s) {
  x = x || {};
  const all = db.list('tasks');
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status) || c.id === x.caseId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // only the people she defines under settings > staff; the advisers list (accountant, insurance, Roy) does not get tasks
  const names = Array.from(new Set(db.list('staff').map(p => p.name).filter(Boolean)));
  const banned = new Set([x.id].concat(x.id ? TT.descendants(all, x.id).map(d => d.id) : []));
  const others = all.filter(o => !o.isTemplate && !isDone(o) && !banned.has(o.id)).sort((a, b) => (a.caseId === x.caseId ? 0 : 1) - (b.caseId === x.caseId ? 0 : 1) || String(a.due).localeCompare(String(b.due)));
  const label = o => (o.no ? '#' + o.no + ' ' : '') + o.title + (o.due ? ' · ' + Office.fmt(o.due) : '');
  const blocked = new Set(x.blockedBy || []);
  const rule = x.repeat || {};
  const notes = x.id ? db.list('notes', n => n.about === 'task' && n.aboutId === x.id).sort((a, b) => String(b.created).localeCompare(String(a.created))) : [];
  const every = x.isTemplate ? (rule.every || 'month') : 'none';
  const body = field('title', t('taskTitle'), x.title || '') + field('details', t('taskDetails'), x.details || '', { type: 'textarea' }) +
    `<div class="grid2">${field('who', t('taskWho'), x.who || '')}${field('phone', t('fPhone'), x.phone || '', { ltr: true, inputmode: 'tel' })}</div>` +
    (names.length ? `<div class="sub">${esc(t('tkWhoPick'))}</div><div class="chips tk-who">${names.map(n => `<button type="button" class="chip" data-who="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '') +
    `<div class="grid2">${field('priority', t('tkPriority'), x.priority || 'normal', { type: 'select', options: TT.PRIORITIES.map(p => [p, t(prioKey(p))]) })}${field('time', t('time'), x.time || '', { type: 'time' })}</div>
    <div class="grid2">${field('start', t('tkStart'), x.start || '', { type: 'date' })}${field('due', t('taskDue'), x.due || '', { type: 'date' })}</div>
    <div class="grid2">${field('duration', t('tkDuration'), x.duration || '', { type: 'number', inputmode: 'numeric' })}${field('durationUnit', t('tkUnit'), x.durationUnit || 'workdays', { type: 'select', options: [['days', t('tkDays')], ['workdays', t('tkWorkdays')], ['weeks', t('tkWeeks')]] })}</div>
    <label class="tk-check"><input type="checkbox" name="holidays" ${x.holidays === false ? '' : 'checked'}> ${esc(t('tkHolidays'))}</label><p class="hint" id="dueAuto"></p>
    <div class="grid2">${field('lang', t('msgLang'), x.lang || s.msgLang || 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}
    ${field('caseId', t('forCase'), x.caseId || '', { type: 'select', options: [['', t('none')]].concat(cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')])) })}</div>` +
    (x.isTemplate ? '' : field('parentId', t('tkSubtaskOf'), x.parentId || '', { type: 'select', options: [['', t('tkNoParent')]].concat(others.map(o => [o.id, label(o)])) })) +
    `<details class="tk-more" ${blocked.size || (x.todos && x.todos.length) || x.isTemplate || every !== 'none' ? 'open' : ''}><summary>${esc(t('tkMore'))}</summary>
    <label class="f"><span>${esc(t('tkTodos'))}</span><textarea name="todos" rows="3" placeholder="${esc(t('tkTodosHint'))}">${esc(TT.todosToText(x.todos))}</textarea></label>
    <div class="f"><span>${esc(t('tkDeps'))}</span><p class="hint">${esc(t('tkDepsHint'))}</p>${others.length ? `<div class="chips tk-deps">${others.map(o => `<button type="button" class="chip ${blocked.has(o.id) ? 'on' : ''}" data-dep="${esc(o.id)}">${esc(label(o))}</button>`).join('')}</div>` : `<p class="hint">${esc(t('tkNoDeps'))}</p>`}<input type="hidden" name="blockedBy" value="${esc(Array.from(blocked).join(','))}"></div>
    <div class="grid2">${field('every', t('tkRepeat'), every, { type: 'select', options: (x.isTemplate ? [] : [['none', t('tkRepeatNone')]]).concat(EVERY.map(e => [e, t('tkEvery' + e.charAt(0).toUpperCase() + e.slice(1))])) })}
      <span class="tk-on-wd">${field('onWd', t('tkOnWeekday'), rule.on != null && rule.on !== '' ? rule.on : new Date().getDay(), { type: 'select', options: [0, 1, 2, 3, 4, 5, 6].map(d => [d, t('tkWd' + d)]) })}</span>
      <span class="tk-on-dom">${field('onDom', t('tkOnDay'), rule.on || 1, { type: 'number', inputmode: 'numeric' })}</span></div>
    <div class="tk-rep grid2">${field('from', t('tkFrom'), rule.from || todayIso(), { type: 'date' })}${field('until', t('tkUntil'), rule.until || '', { type: 'date' })}${field('count', t('tkCount'), rule.count || '', { type: 'number', inputmode: 'numeric' })}</div>
    ${x.isTemplate ? `<p class="hint">${esc(t('tkTemplateHint'))}</p>` : ''}</details>` +
    (x.id ? `<div class="f tk-comments"><span>${esc(t('tkComments'))}</span>${notes.length ? notes.map(n => `<div class="tk-note" data-note="${esc(n.id)}"><span style="white-space:pre-wrap">${esc(n.text)}</span><span class="row"><span class="sub">${esc(Office.fmt(n.created))}</span>${copyBtn(n.text, { icon: true })}<button type="button" class="btn sm ghost" data-delnote>✕</button></span></div>`).join('') : `<p class="hint">${esc(t('tkNoComments'))}</p>`}
      <textarea name="comment" rows="2" placeholder="${esc(t('tkNewComment'))}"></textarea></div>` : '') +
    (x.id ? `<input type="hidden" name="id" value="${esc(x.id)}"><div class="row end"><button type="button" class="btn danger sm" id="delTask">${esc(t('delete'))}</button></div>` : '');
  const p = dialog(x.id ? t('edit') : x.isTemplate ? t('tkNewRecurring') : t('newTask'), body, { ok: t('save') });
  const modals = document.querySelectorAll('.modal'); const form = modals[modals.length - 1].querySelector('form');
  wireEdit(form, x);
  const r = await p;
  if (!r || !r.title) return;
  const rec = {
    title: r.title, details: r.details || '', who: r.who || '', phone: r.phone || '', due: r.due || '', time: r.time || '', lang: r.lang || 'he', caseId: r.caseId || '',
    priority: r.priority || 'normal', start: r.start || '', duration: r.duration ? +r.duration : '', durationUnit: r.durationUnit || 'workdays', holidays: r.holidays === 'on',
    parentId: r.parentId || '', blockedBy: r.blockedBy ? String(r.blockedBy).split(',').filter(Boolean) : [], todos: TT.todosFromText(r.todos, x.todos)
  };
  if (rec.start && rec.duration) rec.due = dueFrom(rec.start, rec.duration, rec.durationUnit, { holidays: rec.holidays }) || rec.due;
  if (r.every && r.every !== 'none') {
    // a template is stored as done + isTemplate, so every existing "open tasks" list (dashboard, case tab, agenda, reminders) ignores it
    rec.isTemplate = true; rec.parentId = ''; rec.status = TASK.done; rec.timer = null;
    rec.repeat = { every: r.every, on: r.every === 'week' ? +r.onWd : /month/.test(r.every) ? Math.min(31, Math.max(1, +r.onDom || 1)) : null, from: r.from || todayIso(), until: r.until || '', count: +r.count || 0 };
  }
  if (x.id) rec.id = x.id; else { if (!rec.isTemplate) rec.status = TASK.open; if (!rec.isTemplate) { const seq = (+db.setting('taskSeq') || 0) + 1; rec.no = seq; db.setting('taskSeq', seq); } }
  const id = db.put('tasks', rec);
  if (r.comment && r.comment.trim()) db.put('notes', { text: r.comment.trim(), about: 'task', aboutId: id, aboutLabel: rec.title, lang: r.lang || 'he' });
  toast(t('saved'));
}

/** The live parts of the dialog: team chips, dependency chips, the computed due date, the repeat fields. */
function wireEdit(form, x) {
  const $ = n => form.querySelector('[name=' + n + ']');
  form.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { const w = $('who'); const cur = w.value.trim(); if (cur.split(/\s*,\s*/).includes(b.dataset.who)) return; w.value = cur ? cur + ', ' + b.dataset.who : b.dataset.who; });
  form.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => { b.classList.toggle('on'); $('blockedBy').value = Array.from(form.querySelectorAll('[data-dep].on')).map(c => c.dataset.dep).join(','); });
  const hint = form.querySelector('#dueAuto');
  const calc = () => {
    const start = $('start').value, n = +$('duration').value, unit = $('durationUnit').value, hol = $('holidays').checked;
    if (!start || !(n > 0)) { hint.textContent = ''; return; }
    const due = dueFrom(start, n, unit, { holidays: hol });
    if (!due) return;
    $('due').value = due;
    const hs = hol && unit === 'workdays' ? holidaysBetween(start, due) : [];
    hint.textContent = t('tkDueAuto', { d: Office.fmt(due) }) + (hs.length ? ' · ' + t('tkClosedOn', { what: hs.map(h => t('hol' + h.key.charAt(0).toUpperCase() + h.key.slice(1)) + ' ' + Office.fmt(h.date)).join(', ') }) : '');
  };
  ['start', 'duration', 'durationUnit', 'holidays'].forEach(n => { $(n).addEventListener('input', calc); $(n).addEventListener('change', calc); });
  if (x.start && x.duration) calc();
  const rep = () => {
    const e = $('every').value;
    form.querySelector('.tk-on-wd').style.display = e === 'week' ? '' : 'none';
    form.querySelector('.tk-on-dom').style.display = /month/.test(e) ? '' : 'none';
    form.querySelector('.tk-rep').style.display = e === 'none' ? 'none' : '';
  };
  $('every').addEventListener('change', rep); rep();
  form.querySelectorAll('[data-delnote]').forEach(b => b.onclick = async () => { const row = b.closest('[data-note]'); if (await confirmDialog(t('confirmDelete'))) { db.remove('notes', row.dataset.note); row.remove(); } });
}
document.addEventListener('click', async e => {
  if (e.target && e.target.id === 'delTask') {
    const form = e.target.closest('form'); const id = form.querySelector('[name=id]').value;
    if (id && await confirmDialog(t('confirmDelete'))) { db.remove('tasks', id); form.querySelector('[data-x=cancel]').click(); }
  }
});
