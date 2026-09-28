/* Cases: the list (open / all) and one case in five tabs: details, suppliers, schedule and team, money, lists. */
import { t, kindLabel, statusLabel, langName } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, section, empty, dialog, confirmDialog, toast, openWhatsApp, dial, relDay, copyText } from '../ui.js';
import Office from '../logic/office.js';
import { phonePretty } from '../logic/core.js';
import { CALL, TASK, taskMessage } from '../logic/extra.js';
import { recommendedSupplierTypes } from '../logic/quotes.js';
import { supplierTypeLabel, linkStatusLabel, stars } from '../labels.js';
import { SUPPLIER_TYPES } from '../data/catalog.js';
import { newQuote, card as quoteCard } from './quotes.js';
import { editPayment } from './money.js';
import { edit as editSupplier } from './suppliers.js';
import { payStatusLabel } from '../labels.js';
import { APPROVAL, APPROVAL_KINDS, kindLabel as approvalKindLabel, approvalMessage, approvalReminder } from '../logic/approvals.js';
import { lang as uiLang } from '../i18n.js';
import { DEFAULTS } from '../data/defaults.js';
import { askFlow, resend, offerDialog, compareBlock, wireCompare, sendEach } from './rfq.js';
import { printSeedFor, printOrderText, printOrderSubject, printSummary, PRINT_STATUS } from '../logic/print.js';
import { printStatusLabel } from '../labels.js';

let tab = 'open';
let caseTab = 'details';
const BACK = (href, label) => `<a class="icon" href="${href}" aria-label="${esc(label)}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a>`;

export function render(ctx) {
  if (ctx.name === 'case' && ctx.id) return renderOne(ctx);
  const all = db.list('cases').sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const list = tab === 'open' ? all.filter(c => Office.ACTIVE.includes(c.status)) : all;
  ctx.root.innerHTML = `
    <header class="top"><h1>${esc(t('cases'))}</h1></header>
    <div class="tabs"><button class="${tab === 'open' ? 'on' : ''}" data-tab="open">${esc(t('openCases'))}</button><button class="${tab === 'all' ? 'on' : ''}" data-tab="all">${esc(t('allCases'))}</button></div>
    <div class="list sec">${list.length ? list.map(c => `<a class="card tap" href="#/case/${esc(c.id)}">
      <div class="row between"><span class="title">${esc(c.client || t('unknownClient'))}</span><span class="badge ${c.status === Office.STATUS.won ? 'ok' : c.status === Office.STATUS.lost ? 'muted' : ''}">${esc(statusLabel(c.status))}</span></div>
      <div class="sub">${[kindLabel(c.kind), c.date ? Office.fmt(c.date) : '', c.place, c.participants ? c.participants + ' ' + t('people') : ''].filter(Boolean).map(esc).join(' · ')}</div>
      ${c.waitingSince && Office.OPEN.includes(c.status) ? `<div class="sub"><b>${esc(t('waitingSince'))}</b> ${esc(Office.fmt(c.waitingSince))}</div>` : ''}</a>`).join('') : empty(t('noCases'))}</div>
    <button class="fab" id="fab">+ ${esc(t('newLead'))}</button>`;
  ctx.root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(ctx); });
  ctx.root.querySelector('#fab').onclick = () => { location.hash = '#/lead'; };
}

function renderOne({ root, id, query }) {
  const c = db.get('cases', id);
  if (!c) { root.innerHTML = `<header class="top"><h1>${esc(t('caseOf'))}</h1></header>` + empty(t('noResults')); return; }
  if (query && query[0]) caseTab = query[0];
  const s = db.settings();
  const TABS = [['details', 'tDetails'], ['suppliers', 'tSuppliers'], ['plan', 'tPlan'], ['money', 'tMoney'], ['lists', 'tLists']];
  root.innerHTML = `
    <header class="top">${BACK('#/cases', t('back'))}<h1>${esc(c.client || t('unknownClient'))}</h1><button class="icon" id="edit" aria-label="${esc(t('edit'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg></button></header>
    <div class="sub">${[kindLabel(c.kind), c.date ? Office.fmt(c.date) + ' · ' + relDay(c.date) : '', c.place].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="tabs" style="margin-top:12px">${TABS.map(x => `<button class="${caseTab === x[0] ? 'on' : ''}" data-ctab="${x[0]}">${esc(t(x[1]))}</button>`).join('')}</div>
    <div class="stack sec" id="body"></div>`;
  root.querySelectorAll('[data-ctab]').forEach(b => b.onclick = () => { caseTab = b.dataset.ctab; renderOne({ root, id }); });
  root.querySelector('#edit').onclick = () => editCase(c);
  const body = root.querySelector('#body');
  ({ details: tabDetails, suppliers: tabSuppliers, plan: tabPlan, money: tabMoney, lists: tabLists }[caseTab] || tabDetails)(body, c, s);
}

/* ---------------- details ---------------- */
function tabDetails(body, c, s) {
  const id = c.id;
  const client = db.get('clients', c.clientId);
  const calls = db.list('calls', x => x.caseId === id && x.status !== CALL.answered);
  const tasks = db.list('tasks', x => x.caseId === id && x.status !== TASK.done);
  const kv = [[t('fKind'), kindLabel(c.kind)], [t('fDate'), c.date ? Office.fmt(c.date) : ''], [t('fHours'), c.hours], [t('fPlace'), c.place], [t('fParticipants'), c.participants], [t('fBudget'), c.budget], [t('fPurpose'), c.purpose], [t('audience'), c.audience], [t('style'), c.style], [t('kosher'), c.kosher], [t('foodNotes'), c.foodNotes], [t('transport'), c.transport], [t('lodging'), c.lodging], [t('deciders'), c.deciders], [t('fLang'), langName(c.lang)], [t('fNotes'), c.notes]].filter(x => x[1]);
  body.innerHTML = `
      <div class="row"><span class="badge ${c.status === Office.STATUS.won ? 'ok' : ''}">${esc(statusLabel(c.status))}</span>
        <select id="status" class="grow" aria-label="${esc(t('fStatus'))}">${Object.values(Office.STATUS).map(v => `<option value="${esc(v)}"${v === c.status ? ' selected' : ''}>${esc(statusLabel(v))}</option>`).join('')}</select></div>
      <div class="card"><div class="row between"><div><div class="title">${esc(c.contact || '')}</div><div class="sub ltr">${esc(phonePretty(c.phone))}${c.email ? ' · ' + esc(c.email) : ''}</div></div>
        ${client ? `<a class="btn sm" href="#/client/${esc(client.id)}">${esc(t('history'))}</a>` : ''}</div>
        <div class="row"><button class="btn wa" id="wa">${esc(t('whatsapp'))}</button><button class="btn" id="dial">${esc(t('call'))}</button><button class="btn" id="queue">${esc(t('addCall'))}</button><button class="btn" id="task">+ ${esc(t('addTask'))}</button></div></div>
      <div class="card"><dl class="kv">${kv.map(x => `<dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl></div>
      <div class="card"><div class="row between"><span class="sub"><b>${esc(t('waitingSince'))}</b> ${c.waitingSince ? esc(Office.fmt(c.waitingSince)) : esc(t('none'))}</span>
        <div class="row">${c.waitingSince ? `<button class="btn sm ok" id="answered">${esc(t('gotAnswer'))}</button>` : `<button class="btn sm" id="waiting">${esc(t('markWaiting'))}</button>`}</div></div></div>
      ${calls.length ? section(t('callQueue'), `<div class="list">${calls.map(x => `<a class="card tap" href="#/calls"><div class="title">${esc(x.name)}</div><div class="sub">${esc(x.why || '')}</div></a>`).join('')}</div>`) : ''}
      ${tasks.length ? section(t('tasks'), `<div class="list">${tasks.map(x => `<a class="card tap" href="#/tasks"><div class="row between"><span class="title">${esc(x.title)}</span><span class="badge muted">${esc(x.who || '')}</span></div>${x.due ? `<div class="sub">${esc(Office.fmt(x.due))}</div>` : ''}</a>`).join('')}</div>`) : ''}
      ${c.source ? `<details class="card"><summary class="title">${esc(t('fSource'))}</summary><p style="white-space:pre-wrap">${esc(c.source)}</p></details>` : ''}
      <div class="row end"><button class="btn danger sm" id="del">${esc(t('delete'))}</button></div>`;

  body.querySelector('#status').onchange = e => db.put('cases', { id, status: e.target.value });
  body.querySelector('#dial').onclick = () => dial(c.phone);
  body.querySelector('#wa').onclick = async () => {
    const miss = Office.missingOf(c);
    const q = miss.length ? Office.followupQuestions(Object.assign({}, c, { name: c.contact, missing: miss }), c.lang, s.signer || '')
      : (Office.followups([Object.assign({}, c, { status: Office.OPEN.includes(c.status) ? c.status : Office.STATUS.lead, waitingSince: Office.iso(Office.addDays(new Date(), -30)) })], new Date(), 1)[0] || {}).text + (s.signer ? '\n' + s.signer : '');
    const r = await dialog(t('followupMsg'), `<textarea name="text" rows="8">${esc(q || '')}</textarea>`, { ok: t('whatsapp') });
    if (r && openWhatsApp(c.phone, r.text)) db.put('cases', { id, waitingSince: todayIso() });
  };
  body.querySelector('#queue').onclick = async () => {
    const r = await dialog(t('addCall'), field('why', t('why'), ''), { ok: t('add') });
    if (r) { db.put('calls', { caseId: id, clientId: c.clientId, name: c.contact || c.client, phone: c.phone, lang: c.lang, why: r.why, status: CALL.todo, attempts: 0 }); toast(t('saved')); }
  };
  body.querySelector('#task').onclick = async () => {
    const r = await dialog(t('newTask'), field('title', t('taskTitle'), '') + field('details', t('taskDetails'), '', { type: 'textarea' }) +
      `<div class="grid2">${field('who', t('taskWho'), '')}${field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' })}${field('due', t('taskDue'), c.date || '', { type: 'date' })}
      ${field('lang', t('msgLang'), s.msgLang || 'he', { type: 'select', options: [['he', langName('he')], ['fr', langName('fr')], ['en', langName('en')]] })}</div>`, { ok: t('save') });
    if (r && r.title) { db.put('tasks', { caseId: id, title: r.title, details: r.details, who: r.who, phone: r.phone, due: r.due, lang: r.lang, status: TASK.open }); toast(t('saved')); }
  };
  const w = body.querySelector('#waiting'); if (w) w.onclick = () => db.put('cases', { id, waitingSince: todayIso() });
  const a = body.querySelector('#answered'); if (a) a.onclick = () => db.put('cases', { id, waitingSince: '' });
  body.querySelector('#del').onclick = async () => { if (await confirmDialog(t('confirmDelete'))) { db.remove('cases', id); location.hash = '#/cases'; } };
}

async function editCase(c) {
  const kinds = Office.KINDS.map(k => [k, kindLabel(k)]);
  const r = await dialog(t('edit'), `<div class="grid2">${field('client', t('fClient'), c.client)}${field('contact', t('fName'), c.contact)}${field('phone', t('fPhone'), c.phone, { ltr: true, inputmode: 'tel' })}${field('email', t('fEmail'), c.email, { ltr: true })}
    ${field('kind', t('fKind'), c.kind, { type: 'select', options: kinds })}${field('date', t('fDate'), c.date, { type: 'date' })}${field('hours', t('fHours'), c.hours)}${field('place', t('fPlace'), c.place)}
    ${field('participants', t('fParticipants'), c.participants)}${field('budget', t('fBudget'), c.budget)}${field('lang', t('fLang'), c.lang, { type: 'select', options: [['he', langName('he')], ['en', langName('en')], ['fr', langName('fr')]] })}</div>
    ${field('purpose', t('fPurpose'), c.purpose)}<h3>${esc(t('profileSec'))}</h3><div class="grid2">${field('audience', t('audience'), c.audience || '')}${field('style', t('style'), c.style || '')}${field('kosher', t('kosher'), c.kosher || '')}${field('foodNotes', t('foodNotes'), c.foodNotes || '')}${field('transport', t('transport'), c.transport || '')}${field('lodging', t('lodging'), c.lodging || '')}</div>${field('deciders', t('deciders'), c.deciders || '')}${field('notes', t('fNotes'), c.notes, { type: 'textarea' })}`);
  if (r) { r.id = c.id; db.put('cases', r); toast(t('saved')); }
}

/* ---------------- suppliers of this event ---------------- */
function tabSuppliers(body, c, s) {
  const id = c.id;
  const links = db.list('links', l => l.caseId === id);
  const sups = {}; db.list('suppliers').forEach(x => { sups[x.id] = x; });
  const recTypes = (c.needs || []).concat(recommendedSupplierTypes(c.kind, s.recs, db.list('catalog')).filter(x => !(c.needs || []).includes(x)));
  body.innerHTML = `
    <div class="row"><button class="btn primary" id="ask">${esc(t('askSuppliers'))}</button><a class="btn" href="#/assist/supplier-quote/${esc(id)}">${esc(t('cmdSupplierQuote'))}</a>${links.length ? `<button class="btn" id="change">${esc(t('changeAll'))}</button>` : ''}</div>
    ${recTypes.length ? `<p class="hint">${esc(t('recommended'))}: ${recTypes.map(x => esc(supplierTypeLabel(x))).join(' · ')}</p>` : ''}
    <div class="list">${links.length ? links.map(l => { const sp = sups[l.supplierId] || { name: l.supplier }; const waiting = /ביקשנו/.test(l.status) && l.askedAt && !l.answeredAt; return `<div class="card" data-l="${esc(l.id)}">
      <div class="row between"><a class="title" href="#/supplier/${esc(l.supplierId)}">${esc(sp.name || '')}${Office.yes(l.chosen) ? ' ★' : ''}</a><span class="badge ${/אושר/.test(l.status) ? 'ok' : /בוטל/.test(l.status) ? 'muted' : 'warn'}">${esc(linkStatusLabel(l.status))}</span></div>
      <div class="sub">${[supplierTypeLabel(sp.type), l.what, l.cost ? Office.money(l.cost) : '', l.arrive ? t('arrive') + ' ' + Office.hhmm(l.arrive) : '', l.askedAt ? t('sentTo') + ' ' + Office.fmt(l.askedAt) + (l.channel === 'email' ? ' ✉' : l.channel ? ' ☏' : '') : ''].filter(Boolean).map(esc).join(' · ')}${l.rating ? ' · ' + esc(stars(l.rating)) : ''}${Office.yes(l.paid) ? ` · <span class="badge ok">${esc(t('paid'))}</span>` : ''}</div>
      <div class="row">${waiting ? `<button class="btn wa sm" data-remind>${esc(t('remind'))}</button>` : ''}${!/בוטל|אושר/.test(l.status) ? `<button class="btn sm ok" data-offer>${esc(t('offerReceived'))}</button>` : ''}<button class="btn sm" data-send>${esc(l.askedAt ? t('resend') : t('sendEach'))}</button><button class="btn sm" data-dial>${esc(t('call'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button></div></div>`; }).join('') : empty(t('none'))}</div>
    ${compareBlock(c, links, sups)}`;

  const refresh = () => tabSuppliers(body, db.get('cases', id) || c, s);
  wireCompare(body, c, s, links, sups, refresh);
  body.querySelector('#ask').onclick = () => askFlow(c, s, links, sups, recTypes, refresh);
  const auto = sessionStorage.getItem('bakasun.autoAsk'); if (auto) { sessionStorage.removeItem('bakasun.autoAsk'); setTimeout(() => askFlow(c, s, links, sups, recTypes, refresh, auto), 300); }
  const ch = body.querySelector('#change'); if (ch) ch.onclick = async () => {
    const r = await dialog(t('changeAll'), field('change', t('theChange'), '', { type: 'textarea' }), { ok: t('sendEach') });
    if (!r || !r.change) return;
    const targets = links.filter(l => !/בוטל/.test(l.status)).map(l => sups[l.supplierId]).filter(Boolean);
    sendEach(targets, sp => Office.changeMessage(c, sp, r.change, s.signer || ''), () => (c.kind || '') + (c.date ? ' · ' + Office.fmt(c.date) : '') + ' · ' + t('theChange'));
  };
  body.querySelectorAll('.card[data-l]').forEach(el => {
    const l = db.get('links', el.dataset.l); const sp = sups[l.supplierId] || {};
    el.querySelector('[data-dial]').onclick = () => dial(sp.phone);
    el.querySelector('[data-send]').onclick = () => { resend(c, s, l, sp, false); setTimeout(refresh, 500); };
    const rm = el.querySelector('[data-remind]'); if (rm) rm.onclick = () => { resend(c, s, l, sp, true); setTimeout(refresh, 500); };
    const of = el.querySelector('[data-offer]'); if (of) of.onclick = async () => { if (await offerDialog(c, l, sp)) refresh(); };
    el.querySelector('[data-edit]').onclick = async () => {
      const r = await dialog(sp.name || t('supplier'), `<div class="grid2">${field('status', t('linkStatus'), l.status, { type: 'select', options: ['ביקשנו הצעה', 'הצעה התקבלה', 'אושר', 'בוטל'].map(v => [v, linkStatusLabel(v)]) })}${field('cost', t('cost'), l.cost || '', { type: 'number', inputmode: 'decimal' })}
        ${field('arrive', t('arrive'), l.arrive || '', { type: 'time' })}${field('paid', t('paid'), Office.yes(l.paid) ? 'כן' : 'לא', { type: 'select', options: [['לא', '✗'], ['כן', '✓']] })}${field('supInvoice', t('supInvoice'), l.supInvoice || 'חסרה', { type: 'select', options: [['חסרה', t('invMissing')], ['התקבלה', t('invReceived')]] })}${field('supInvoiceNo', t('invoiceNo'), l.supInvoiceNo || '', { ltr: true })}${field('rating', t('rateSupplier'), l.rating || '', { type: 'select', options: [['', '']].concat([5, 4, 3, 2, 1].map(n => [n, stars(n)])) })}</div>${field('what', t('whatNeeded'), l.what || '')}${field('note', t('note'), l.note || '')}` +
        `<input type="hidden" name="id" value="${esc(l.id)}"><div class="row end"><button type="button" class="btn danger sm" data-dellink="${esc(l.id)}">${esc(t('delete'))}</button></div>`);
      if (r) { r.id = l.id; if (Office.yes(r.paid) && !l.paidAt) r.paidAt = todayIso(); if (r.supInvoice === 'התקבלה' && !l.supInvoiceAt) r.supInvoiceAt = todayIso(); db.put('links', r); if (r.rating && sp.id) { const rs = db.list('links', x => x.supplierId === sp.id && x.rating).map(x => +x.rating); db.put('suppliers', { id: sp.id, rating: Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) }); } }
    };
  });
}

/** Sends messages one after another: each one opens WhatsApp, she presses send, then taps "next". */
function sendOneByOne(targets, textOf, after) {
  let i = 0;
  const step = () => {
    if (i >= targets.length) { toast(t('saved')); return; }
    const sp = targets[i]; const text = textOf(sp);
    const wrap = document.createElement('div'); wrap.className = 'modal';
    wrap.innerHTML = `<form class="modal-card"><h2>${esc(sp.name)} (<span class="count">${i + 1}/${targets.length}</span>)</h2><div class="modal-body"><textarea name="text" rows="8">${esc(text)}</textarea></div>
      <div class="row end"><button type="button" class="btn ghost" data-x="skip">${esc(t('cancel'))}</button><button type="submit" class="btn wa">${esc(t('whatsapp'))}</button></div></form>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-x=skip]').onclick = () => { wrap.remove(); i++; step(); };
    wrap.querySelector('form').onsubmit = e => { e.preventDefault(); const ok = openWhatsApp(sp.phone, e.target.text.value); if (ok && after) after(sp); wrap.remove(); i++; setTimeout(step, 400); };
  };
  step();
}

/* ---------------- schedule and team ---------------- */
function tabPlan(body, c, s) {
  const id = c.id;
  const rows = db.list('schedule', r => r.caseId === id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Office.minutes(a.start) || 0) - (Office.minutes(b.start) || 0));
  const staff = db.list('staff', x => x.caseId === id);
  const arrivals = {}; staff.forEach(x => { if (x.arrive) arrivals[x.name] = x.arrive; }); db.list('links', l => l.caseId === id && l.arrive).forEach(l => { arrivals[l.supplier] = l.arrive; });
  const issues = Office.scheduleCheck(rows, arrivals);
  const who = []; rows.forEach(r => String(r.who || '').split(/[,;]+/).map(x => x.trim()).forEach(w => { if (w && !/^(כולם|all)$/i.test(w) && who.indexOf(w) < 0) who.push(w); }));
  body.innerHTML = `
    ${section(t('schedule'), `<div class="row"><button class="btn sm" id="addRow">+ ${esc(t('addRow'))}</button>${rows.length ? '' : `<button class="btn sm" id="tpl">${esc(t('fromTemplate'))}</button>`}${who.length ? `<button class="btn sm wa" id="sendSched">${esc(t('sendSchedule'))}</button>` : ''}</div>
      ${rows.length ? `<div class="${issues.length ? 'warnbox' : 'hint'}">${issues.length ? issues.map(x => esc(x.text)).join('<br>') : esc(t('noIssues'))}</div>` : `<p class="hint">${esc(t('scheduleEmpty'))}</p>`}
      <div class="list">${rows.map(r => `<div class="card row" data-r="${esc(r.id)}"><span class="ltr count" style="min-width:5.5em"><b>${esc(Office.hhmm(r.start))}</b>${r.end ? '–' + esc(Office.hhmm(r.end)) : ''}</span><span class="grow"><span class="title">${esc(r.what)}</span><span class="sub"> ${[r.where, r.who].filter(Boolean).map(esc).join(' · ')}${rows.some(x => x.date !== r.date) && r.date ? ' · ' + esc(Office.fmt(r.date)) : ''}</span></span><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button></div>`).join('')}</div>`)}
    ${section(t('staff'), `<div class="row"><button class="btn sm" id="addStaff">+ ${esc(t('newStaff'))}</button></div>
      <div class="list">${staff.length ? staff.map(x => `<div class="card" data-s="${esc(x.id)}"><div class="row between"><span class="title">${esc(x.name)}</span>${Office.yes(x.confirmed) ? `<span class="badge ok">${esc(t('confirmed'))}</span>` : `<span class="badge warn">?</span>`}</div>
        <div class="sub">${[x.role, x.arrive ? t('arrive') + ' ' + Office.hhmm(x.arrive) : '', phonePretty(x.phone)].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="row"><button class="btn wa sm" data-ask>${esc(t('askConfirm'))}</button><button class="btn sm" data-dial>${esc(t('call'))}</button><button class="btn sm ok" data-ok>${esc(t('confirmed'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button></div></div>`).join('') : empty(t('noStaff'))}</div>`)}`;

  const editRow = async r => {
    r = r || { caseId: id, date: c.date || '', start: '', end: '', what: '', where: '', who: '' };
    const x = await dialog(t('schedule'), `<div class="grid2">${field('date', t('date'), r.date, { type: 'date' })}${field('start', t('start'), r.start, { type: 'time' })}${field('end', t('end'), r.end || '', { type: 'time' })}${field('where', t('where'), r.where || '')}</div>${field('what', t('what'), r.what)}${field('who', t('who'), r.who || '', { placeholder: who.join(', ') })}` + (r.id ? `<div class="row end"><button type="button" class="btn danger sm" data-delrow="${esc(r.id)}">${esc(t('delete'))}</button></div>` : ''));
    if (x && x.what) { if (r.id) x.id = r.id; x.caseId = id; db.put('schedule', x); }
  };
  body.querySelector('#addRow').onclick = () => editRow(null);
  const tpl = body.querySelector('#tpl'); if (tpl) tpl.onclick = async () => {
    const r = await dialog(t('fromTemplate'), field('start', t('startTime'), (c.hours || '').split(/[-–]/)[0].trim() || '19:00', { type: 'time' }), { ok: t('add') });
    if (r) Office.scheduleFromTemplate(c.kind, r.start, c.date).forEach(row => db.put('schedule', Object.assign(row, { caseId: id })));
  };
  body.querySelectorAll('.card[data-r] [data-edit]').forEach(b => b.onclick = () => editRow(db.get('schedule', b.closest('[data-r]').dataset.r)));
  const ss = body.querySelector('#sendSched'); if (ss) ss.onclick = async () => {
    const r = await dialog(t('sendSchedule'), field('who', t('who'), who[0], { type: 'select', options: who.map(w => [w, w]) }) + field('phone', t('fPhone'), '', { ltr: true, inputmode: 'tel' }), { ok: t('whatsapp') });
    if (!r) return;
    const st = staff.find(x => x.name === r.who); const sp = db.list('suppliers', x => x.name === r.who)[0];
    const phone = r.phone || (st && st.phone) || (sp && sp.phone) || '';
    const r2 = await dialog(r.who, `<textarea name="text" rows="9">${esc(Office.scheduleText(c, rows, r.who, s.signer || ''))}</textarea>`, { ok: t('whatsapp') });
    if (r2) openWhatsApp(phone, r2.text);
  };
  const editStaff = async x => {
    x = x || { caseId: id, name: '', phone: '', role: '', arrive: '', confirmed: '' };
    const known = db.list('staff').filter(y => y.name).map(y => y.name).filter((v, i, a) => a.indexOf(v) === i);
    const r = await dialog(t('newStaff'), `<label class="f"><span>${esc(t('name'))}</span><input name="name" list="staffNames" value="${esc(x.name)}"><datalist id="staffNames">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label><div class="grid2">${field('phone', t('fPhone'), x.phone, { ltr: true, inputmode: 'tel' })}${field('role', t('role'), x.role)}${field('arrive', t('arrive'), x.arrive, { type: 'time' })}</div>` + (x.id ? `<div class="row end"><button type="button" class="btn danger sm" data-delstaff="${esc(x.id)}">${esc(t('delete'))}</button></div>` : ''));
    if (r && r.name) { if (x.id) r.id = x.id; r.caseId = id; if (!r.phone) { const k = db.list('staff', y => y.name === r.name && y.phone)[0]; if (k) r.phone = k.phone; } db.put('staff', r); }
  };
  body.querySelector('#addStaff').onclick = () => editStaff(null);
  body.querySelectorAll('.card[data-s]').forEach(el => {
    const x = db.get('staff', el.dataset.s);
    el.querySelector('[data-edit]').onclick = () => editStaff(x);
    el.querySelector('[data-dial]').onclick = () => dial(x.phone);
    el.querySelector('[data-ok]').onclick = () => db.put('staff', { id: x.id, confirmed: 'כן' });
    el.querySelector('[data-ask]').onclick = async () => { const r = await dialog(t('askConfirm'), `<textarea name="text" rows="7">${esc(Office.staffMessage(c, x, s.signer || ''))}</textarea>`, { ok: t('whatsapp') }); if (r) openWhatsApp(x.phone, r.text); };
  });
}
document.addEventListener('click', async e => {
  const d = e.target && (e.target.dataset.delrow ? ['schedule', e.target.dataset.delrow] : e.target.dataset.delstaff ? ['staff', e.target.dataset.delstaff] : e.target.dataset.dellink ? ['links', e.target.dataset.dellink] : e.target.dataset.delprint ? ['print', e.target.dataset.delprint] : null);
  if (!d) return;
  if (await confirmDialog(t('confirmDelete'))) { db.remove(d[0], d[1]); const f = e.target.closest('form'); if (f) f.querySelector('[data-x=cancel]').click(); }
});

/* ---------------- money: quotes and payments ---------------- */
function tabMoney(body, c, s) {
  const id = c.id;
  const quotes = db.list('quotes', q => q.caseId === id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const pays = db.list('payments', p => p.caseId === id);
  body.innerHTML = `
    ${section(t('quotes'), `<div class="row"><button class="btn primary sm" id="newQuote">+ ${esc(t('newQuote'))}</button></div><div class="list">${quotes.length ? quotes.map(q => quoteCard(q, c)).join('') : empty(t('noQuotes'))}</div>`)}
    ${section(t('approvals'), `<div class="row"><button class="btn sm" id="newAppr">+ ${esc(t('newApproval'))}</button></div><div class="list">${(() => { const list = db.list('approvals', a => a.caseId === id).sort((a, b) => String(b.created).localeCompare(String(a.created))); return list.length ? list.map(a => `<div class="card" data-a="${esc(a.id)}"><div class="row between"><span class="title">${esc(approvalKindLabel(a.kind, uiLang()))}${a.title ? ': ' + esc(a.title) : ''}</span><span class="badge ${a.status === APPROVAL.approved ? 'ok' : a.status === APPROVAL.declined ? 'muted' : 'warn'}">${esc(a.status === APPROVAL.approved ? t('approved') : a.status === APPROVAL.declined ? t('declined') : a.status === APPROVAL.sent ? t('taskSent') + (a.sentAt ? ' ' + Office.fmt(a.sentAt) : '') : t('qs_טיוטה'))}</span></div>${a.details ? `<div class="sub">${esc(a.details)}</div>` : ''}${Office.num(a.amount) ? `<div class="sub ltr">${esc(Office.money(a.amount))}</div>` : ''}
      ${a.status !== APPROVAL.approved && a.status !== APPROVAL.declined ? `<div class="row"><button class="btn wa sm" data-send>${esc(a.status === APPROVAL.sent ? t('remind') : t('approvalSend'))}</button><button class="btn sm ok" data-ok>${esc(t('approved'))}</button><button class="btn sm ghost" data-no>${esc(t('declined'))}</button></div>` : ''}</div>`).join('') : empty(t('noApprovals')); })()}</div>`)}
    ${(() => { const cl = db.get('clients', c.clientId); return cl && (cl.approver || cl.payer || cl.attachments || cl.payTerms) ? `<div class="card"><div class="title">${esc(t('clientProcess'))} · ${esc(cl.name)}</div><div class="sub">${[cl.approver ? t('approver') + ': ' + cl.approver : '', cl.payer ? t('payer') + ': ' + cl.payer : '', cl.payTerms ? t('payTermsClient') + ': ' + cl.payTerms : '', cl.attachments ? t('attachments') + ': ' + cl.attachments : ''].filter(Boolean).map(esc).join(' · ')}</div></div>` : ''; })()}
    ${section(t('payments'), `<div class="row"><button class="btn sm" id="newPay">+ ${esc(t('newPayment'))}</button><a class="btn sm ghost" href="#/money">${esc(t('money'))}</a><a class="btn sm" href="#/portal/${esc(id)}">${esc(t('portal'))}</a></div><div class="list">${pays.length ? pays.map(p => `<div class="card"><div class="row between"><span class="title ltr">${esc(Office.money(p.amount))}</span><span class="badge ${p.status === Office.PAY.paid ? 'ok' : 'warn'}">${esc(payStatusLabel(p.status))}</span></div><div class="sub">${[p.due ? Office.fmt(p.due) : '', p.invoiceNo, p.note].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('') : empty(t('noPayments'))}</div>`)}`;
  body.querySelector('#newQuote').onclick = () => newQuote(c);
  body.querySelector('#newPay').onclick = () => editPayment(null, id);
  body.querySelector('#newAppr').onclick = async () => {
    const r = await dialog(t('newApproval'), `<div class="grid2">${field('kind', t('approvalKind'), 'participants', { type: 'select', options: APPROVAL_KINDS.map(k => [k, approvalKindLabel(k, uiLang())]) })}${field('amount', t('amount'), '', { type: 'number', inputmode: 'decimal' })}</div>${field('title', t('approvalTitle'), '')}${field('details', t('approvalDetails'), '', { type: 'textarea', rows: 3 })}`, { ok: t('save') });
    if (r && (r.title || r.details)) db.put('approvals', { caseId: id, kind: r.kind, title: r.title, details: r.details, amount: r.amount, status: APPROVAL.draft });
  };
  body.querySelectorAll('.card[data-a]').forEach(el => {
    const a = db.get('approvals', el.dataset.a);
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on('[data-ok]', () => db.put('approvals', { id: a.id, status: APPROVAL.approved, approvedAt: todayIso() }));
    on('[data-no]', () => db.put('approvals', { id: a.id, status: APPROVAL.declined }));
    on('[data-send]', async () => {
      const text = a.status === APPROVAL.sent ? approvalReminder(a, c, c.lang, s.signer || DEFAULTS.signer, Office.daysBetween(a.sentAt, new Date())) : approvalMessage(a, c, c.lang, s.signer || DEFAULTS.signer);
      const r = await dialog(t('approvalSend'), `<textarea name="text" rows="9">${esc(text)}</textarea>`, { ok: t('whatsapp') });
      if (r && openWhatsApp(c.phone, r.text)) db.put('approvals', { id: a.id, status: APPROVAL.sent, sentAt: a.sentAt || todayIso(), lastRemind: todayIso() });
    });
  });
}

/* ---------------- lists: checklist, groups, after the event ---------------- */
function tabLists(body, c, s) {
  const id = c.id;
  const checks = db.list('checks', k => k.caseId === id);
  const lists = []; checks.forEach(k => { if (lists.indexOf(k.list) < 0) lists.push(k.list); });
  const g = db.list('groups', x => x.caseId === id)[0];
  body.innerHTML = `
    <div class="card row between"><span class="title">${esc(t('groups'))}</span><a class="btn sm primary" href="#/groups/${esc(id)}">${g ? esc(g.people.length) + ' ' + esc(t('people')) : esc(t('open'))}</a></div>
    ${(() => { const items = db.list('print', x => x.caseId === id).sort((a, b) => String(a.created).localeCompare(String(b.created))); const sm = printSummary(items); return section(t('printList'), `<div class="row"><button class="btn sm" id="printSeed">${esc(items.length ? t('printAddSeed') : t('printMake'))}</button><button class="btn sm" id="printAdd">+ ${esc(t('printItem'))}</button>${items.length ? `<button class="btn sm primary" id="printOrder">${esc(t('printOrder'))}</button>` : ''}</div>
      ${items.length ? `<p class="hint"><span class="count">${sm.confirmed}/${sm.total}</span> ${esc(t('printConfirmed'))}${sm.cost ? ' · ' + esc(Office.money(sm.cost)) : ''}</p><div class="list">${items.map(i => `<div class="card" data-p="${esc(i.id)}"><div class="row between"><span class="title">${esc(i.item)}</span><span class="badge ${i.status === PRINT_STATUS.plan ? 'muted' : i.status === PRINT_STATUS.ordered ? 'warn' : 'ok'}">${esc(printStatusLabel(i.status))}</span></div><div class="sub">${[Office.num(i.qty) ? Office.num(i.qty) + ' ' + t('units') : '', i.size, i.notes, i.cost ? Office.money(i.cost) : '', i.orderedAt ? t('sentTo') + ' ' + Office.fmt(i.orderedAt) : ''].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="row">${i.status === PRINT_STATUS.ordered ? `<button class="btn sm ok" data-pconf>${esc(t('printConfirm'))}</button>` : ''}${i.status === PRINT_STATUS.confirmed ? `<button class="btn sm ok" data-pready>${esc(t('printReady'))}</button>` : ''}<button class="btn sm ghost" data-pedit>${esc(t('edit'))}</button></div></div>`).join('')}</div>` : ''}`); })()}
    ${section(t('checklist'), checks.length ? lists.map(l => `<div class="card"><h3>${esc(l)}</h3>${checks.filter(k => k.list === l).map(k => `<label class="chk"><input type="checkbox" data-k="${esc(k.id)}"${Office.yes(k.done) ? ' checked' : ''}> ${esc(k.item)}</label>`).join('')}</div>`).join('') : `<button class="btn" id="mk">${esc(t('makeChecklist'))}</button>`)}
    ${section(t('afterEvent'), `<div class="row"><button class="btn wa sm" id="thanks">${esc(t('thanks'))}</button><button class="btn wa sm" id="review">${esc(t('review'))}</button></div>`)}`;
  const refreshLists = () => tabLists(body, db.get('cases', id) || c, s);
  const editPrint = async i => {
    const sups = db.list('suppliers', x => /דפוס/.test(x.type || ''));
    const r = await dialog(i ? i.item : t('printItem'), `${field('item', t('printItem'), i ? i.item : '')}<div class="grid2">${field('qty', t('qty'), i ? i.qty : '', { type: 'number', inputmode: 'numeric' })}${field('size', t('size'), i ? i.size : '')}${field('cost', t('cost'), i ? i.cost || '' : '', { type: 'number', inputmode: 'decimal' })}${field('status', t('linkStatus'), i ? i.status : PRINT_STATUS.plan, { type: 'select', options: Object.values(PRINT_STATUS).map(v => [v, printStatusLabel(v)]) })}</div>${field('supplierId', t('supplier'), i ? i.supplierId || '' : '', { type: 'select', options: [['', '']].concat(sups.map(x => [x.id, x.name])) })}${field('notes', t('note'), i ? i.notes || '' : '')}${i ? `<div class="row end"><button type="button" class="btn danger sm" data-delprint="${esc(i.id)}">${esc(t('delete'))}</button></div>` : ''}`);
    if (!r || !r.item) return;
    db.put('print', Object.assign(i ? { id: i.id } : { caseId: id }, r)); refreshLists();
  };
  body.querySelector('#printSeed').onclick = () => { const have = new Set(db.list('print', x => x.caseId === id).map(x => x.item)); printSeedFor(c.kind, c.participants).forEach(x => { if (!have.has(x.item)) db.put('print', Object.assign({ caseId: id }, x)); }); refreshLists(); };
  body.querySelector('#printAdd').onclick = () => editPrint(null);
  const po = body.querySelector('#printOrder'); if (po) po.onclick = async () => {
    const items = db.list('print', x => x.caseId === id && x.status === PRINT_STATUS.plan);
    if (!items.length) { toast(t('printNothing')); return; }
    const sups = db.list('suppliers', x => /דפוס/.test(x.type || '') && !/^(לא|no)$/i.test(String(x.active || '')));
    if (!sups.length) { toast(t('noneOfType'), 3500); return; }
    const r = await dialog(t('printOrder'), `${field('supplierId', t('supplier'), sups[0].id, { type: 'select', options: sups.map(x => [x.id, x.name]) })}<div class="grid2">${field('due', t('printDue'), c.date ? Office.iso(Office.addDays(c.date, -4)) : '', { type: 'date' })}${field('files', t('printFiles'), '')}</div><p class="hint">${esc(items.map(x => x.item).join(' · '))}</p>`, { ok: t('next') });
    if (!r) return;
    const sp = sups.find(x => x.id === r.supplierId); if (!sp) return;
    sendEach([sp], () => printOrderText(c, sp, items, { due: r.due, files: r.files, asClient: c.asClient !== 'לא', name: (s.signer || DEFAULTS.signer).split('\n')[0].split(' ')[0] }), () => printOrderSubject(c), () => { items.forEach(x => db.put('print', { id: x.id, status: PRINT_STATUS.ordered, orderedAt: todayIso(), supplierId: sp.id, due: r.due })); });
    setTimeout(refreshLists, 600);
  };
  body.querySelectorAll('.card[data-p]').forEach(el => {
    const i = db.get('print', el.dataset.p);
    el.querySelector('[data-pedit]').onclick = () => editPrint(i);
    const pc = el.querySelector('[data-pconf]'); if (pc) pc.onclick = async () => { const r = await dialog(t('printConfirm'), field('cost', t('cost'), i.cost || '', { type: 'number', inputmode: 'decimal' }), { ok: t('save') }); if (r) { db.put('print', { id: i.id, status: PRINT_STATUS.confirmed, confirmedAt: todayIso(), cost: r.cost || i.cost }); refreshLists(); } };
    const pr = el.querySelector('[data-pready]'); if (pr) pr.onclick = () => { db.put('print', { id: i.id, status: PRINT_STATUS.ready }); refreshLists(); };
  });
  const mk = body.querySelector('#mk'); if (mk) mk.onclick = () => Office.checklistFor(Office.CHECK_SEED.map(r => ({ list: r[0], kind: r[1], item: r[2] })), c.kind).forEach(k => db.put('checks', Object.assign(k, { caseId: id, done: '' })));
  body.querySelectorAll('[data-k]').forEach(cb => cb.onchange = () => db.put('checks', { id: cb.dataset.k, done: cb.checked ? 'כן' : '' }));
  body.querySelector('#thanks').onclick = async () => { const r = await dialog(t('thanks'), `<textarea name="text" rows="5">${esc(Office.thanksMessage(c, c.contact) + (s.signer ? '\n' + s.signer : ''))}</textarea>`, { ok: t('whatsapp') }); if (r) openWhatsApp(c.phone, r.text); };
  body.querySelector('#review').onclick = async () => { const r = await dialog(t('review'), `<textarea name="text" rows="5">${esc(Office.reviewMessage(c, c.contact, s.reviewUrl || ''))}</textarea>`, { ok: t('whatsapp') }); if (r) openWhatsApp(c.phone, r.text); };
}
