/* What happens after "who has not answered", "I paid Biscotti 500", "mark the tour done", "close with Daniel",
   "what is the budget of Shoval", "add 20 name tags to the print list", "log a call with Arbel tomorrow at 10".
   Every change is a small, visible one; sending still needs her tap. */
import { t, lang, statusLabel } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, toast, dialog, openWhatsApp, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { addFromText, rsvpSummary, hotelListText, label as rsvpLabel } from '../logic/participants.js';
import { summary as budgetSummary, paymentSchedule } from '../logic/budget.js';
import * as RS from '../logic/runsheet.js';
import { missingKinds, filterFiles, guessKind } from '../logic/caseFiles.js';
import { missingForContract, contractFromCase, pickQuote, CONTRACT_STATUS } from '../logic/contracts.js';
import { dueSoon, progress } from '../logic/checklists.js';
import { current as notifications, state as notifyState, setState as setNotifyState } from '../notify.js';
import { markSeen } from '../logic/rules.js';
import { move as moveCase } from '../logic/pipeline.js';
import { historyFor, describe as describeChange, newestFirst } from '../logic/history.js';
import { files, downloadFile } from '../files.js';
import { TASK, CALL } from '../logic/extra.js';
import { PRINT_STATUS } from '../logic/print.js';
import { pendingRequests } from '../logic/rfq.js';
import { supplierPaidMessage } from '../logic/approvals.js';
import { matchTitles } from '../logic/questions.js';
import { DEFAULTS } from '../data/defaults.js';
import { resend, remindAll } from './rfq.js';
import { toCalendar } from '../calendar.js';
import { taskEvent } from '../logic/ics.js';
import { remember, undoLast, lastAction } from '../logic/undo.js';

/** The "undo" button under a saved action; the click takes the last action back. */
export function undoBtn() { return `<button type="button" class="btn sm ghost" data-undo>↩ ${esc(t('undoBtn'))}</button>`; }
export function wireUndo(out) { out.querySelectorAll('[data-undo]').forEach(b => { b.onclick = () => { const l = undoLast(); b.closest('.okbox, .card, .stack').innerHTML = `<p class="okbox">${esc(l ? t('undone', { what: l }) : t('nothingToUndo'))}</p>`; toast(l ? t('undone', { what: l }) : t('nothingToUndo')); }; }); }

const active = () => db.list('cases', x => Office.ACTIVE.includes(x.status)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
const supByName = who => {
  const hay = Office.normHe(who || ''); if (hay.length < 2) return null;
  const list = db.list('suppliers');
  return list.find(x => Office.normHe(x.name) === hay) || list.find(x => Office.normHe(x.name).indexOf(hay) >= 0) || list.find(x => hay.indexOf(Office.normHe(x.name)) >= 0 && Office.normHe(x.name).length >= 3) || list.find(x => Office.normHe(x.contact || '').indexOf(hay) >= 0) || null;
};
const caseLine = c => [c.client, c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · ');
const okbox = (out, html) => { out.innerHTML = `<div class="card stack">${html}</div>`; wireUndo(out); };
const pickCase = async (cases, title) => {
  if (cases.length === 1) return cases[0];
  const r = await dialog(title || t('whichCase'), cases.map((c, i) => `<label class="chk"><input type="radio" name="pick" value="${esc(c.id)}"${i === 0 ? ' checked' : ''}> ${esc(caseLine(c))}</label>`).join(''), { ok: t('pickOne') });
  return r && r.pick ? db.get('cases', r.pick) : null;
};

/** "What about Daniel hotel?": the supplier's state across the open events. Returns false when no supplier has that name. */
export function supplierStatus(out, who) {
  const sp = supByName(who); if (!sp) return false;
  const links = db.list('links', l => l.supplierId === sp.id).map(l => ({ l, c: db.get('cases', l.caseId) || {} })).filter(x => Office.ACTIVE.includes(x.c.status));
  const notes = db.list('notes', n => n.aboutId === sp.id).slice(-3);
  const line = x => { const l = x.l; const st = /אושר/.test(String(l.status)) ? t('stChosen') : /התקבלה/.test(String(l.status)) ? t('offerReceived') + (l.cost ? ' · ' + Office.money(Office.num(l.cost)) : '') : /ביקשנו/.test(String(l.status)) ? (l.askedAt ? t('waited', { n: Office.daysBetween(l.askedAt, new Date()) }) : t('stWaiting')) : String(l.status || ''); return `<li><a href="#/case/${esc(x.c.id)}/suppliers">${esc(caseLine(x.c))}</a> · ${esc(st)}${l.what ? ' · ' + esc(l.what) : ''}${Office.yes(l.paid) ? ' · ' + esc(t('paid')) : ''}</li>`; };
  okbox(out, `<div class="title"><a href="#/supplier/${esc(sp.id)}">${esc(sp.name)}</a></div><div class="sub">${esc([sp.type, sp.contact, sp.phone, sp.email].filter(Boolean).join(' · '))}${sp.phone ? copyBtn(sp.phone, { icon: true }) : ''}${sp.email ? copyBtn(sp.email, { icon: true }) : ''}</div>
    ${links.length ? `<ul class="open">${links.map(line).join('')}</ul>` : `<p class="hint">${esc(t('noOpenRequest', { who: sp.name }))}</p>`}
    ${notes.length ? `<div class="sub"><b>${esc(t('notes'))}</b></div><ul class="open">${notes.map(n => `<li>${esc(n.text)}</li>`).join('')}</ul>` : ''}
    <div class="row">${sp.phone ? `<button type="button" class="btn sm" id="supDial">${esc(t('call'))}</button>` : ''}<a class="btn sm ghost" href="#/supplier/${esc(sp.id)}">${esc(t('open'))}</a></div>`);
  const d = out.querySelector('#supDial'); if (d) d.onclick = () => { location.href = 'tel:' + sp.phone; };
  return true;
}

/** Runs one parsed action. ctx: {out, s, caseByName(who, alt)}. Returns true when handled. */
export async function runAction(a, ctx) {
  const { out, s } = ctx;
  const L = lang();

  if (a.kind === 'waiting' || a.kind === 'remindAll') {
    const pend = pendingRequests(db.list('links'), db.list('cases'), db.list('suppliers'), new Date(), 0);
    if (a.kind === 'remindAll') { if (!pend.length) { okbox(out, `<p class="okbox">${esc(t('nobodyWaiting'))}</p>`); return true; } remindAll(pend, s); return true; }
    const waitLine = l => [l.sup.name || '', l.cs.client || '', l.what || '', t('waited', { n: l.waited })].filter(Boolean).join(' · ');
    okbox(out, `<div class="title">${esc(t('waitingSuppliers'))} (${pend.length})</div>${pend.length ? `<ul class="open">${pend.map(l => `<li><a href="#/case/${esc(l.caseId)}/suppliers">${esc(l.sup.name || '')}</a> · ${esc(l.cs.client || '')}${l.what ? ' · ' + esc(l.what) : ''} · ${esc(t('waited', { n: l.waited }))}</li>`).join('')}</ul><div class="row"><button type="button" class="btn wa sm" id="remindAllBtn">${esc(t('remindAll', { n: pend.length }))}</button>${copyBtn(t('waitingSuppliers') + '\n' + pend.map(l => '• ' + waitLine(l)).join('\n'))}</div>` : `<p class="okbox">${esc(t('nobodyWaiting'))}</p>`}`);
    const b = out.querySelector('#remindAllBtn'); if (b) b.onclick = () => remindAll(pend, s);
    return true;
  }

  if (a.kind === 'remindSup') {
    const sp = supByName(a.who); if (!sp) { okbox(out, `<p class="warnbox">${esc(t('noSupplierNamed', { who: a.who }))}</p>`); return true; }
    const links = db.list('links', l => l.supplierId === sp.id && /ביקשנו/.test(String(l.status)) && !l.answeredAt && Office.ACTIVE.includes((db.get('cases', l.caseId) || {}).status));
    if (!links.length) { okbox(out, `<p class="warnbox">${esc(t('noOpenRequest', { who: sp.name }))}</p>`); return true; }
    const l = links[0]; resend(db.get('cases', l.caseId) || {}, s, l, sp, true); return true;
  }

  if (a.kind === 'paidQuery') {
    const sp = supByName(a.who); if (!sp) { okbox(out, `<p class="warnbox">${esc(t('noSupplierNamed', { who: a.who }))}</p>`); return true; }
    const links = db.list('links', l => l.supplierId === sp.id && Office.yes(l.paid) && Office.num(l.cost));
    const total = links.reduce((x, l) => x + Office.num(l.cost), 0);
    const paidLine = l => { const c = db.get('cases', l.caseId) || {}; return [caseLine(c), Office.money(Office.num(l.cost)), l.paidAt ? Office.fmt(l.paidAt) : '', l.supInvoice === 'התקבלה' ? '' : t('invMissing')].filter(Boolean).join(' · '); };
    okbox(out, `<div class="title">${esc(sp.name)}</div>${links.length ? `<ul class="open">${links.map(l => { const c = db.get('cases', l.caseId) || {}; return `<li><a href="#/case/${esc(l.caseId)}/money">${esc(caseLine(c))}</a> · ${esc(Office.money(Office.num(l.cost)))}${l.paidAt ? ' · ' + esc(Office.fmt(l.paidAt)) : ''}${l.supInvoice === 'התקבלה' ? '' : ' · ' + esc(t('invMissing'))}</li>`; }).join('')}</ul><p><b>${esc(t('total'))}: ${esc(Office.money(total))}</b> (${esc(t('amountsBeforeVat'))}) ${copyBtn(sp.name + '\n' + links.map(l => '• ' + paidLine(l)).join('\n') + '\n' + t('total') + ': ' + Office.money(total) + ' (' + t('amountsBeforeVat') + ')', { icon: true })}</p>` : `<p class="hint">${esc(t('nothingPaidTo', { who: sp.name }))}</p>`}`);
    return true;
  }

  if (a.kind === 'paid') {
    const sp = supByName(a.who); if (!sp) { okbox(out, `<p class="warnbox">${esc(t('noSupplierNamed', { who: a.who }))}</p>`); return true; }
    const links = db.list('links', l => l.supplierId === sp.id && !/בוטל/.test(String(l.status)) && Office.ACTIVE.includes((db.get('cases', l.caseId) || {}).status));
    if (!links.length) { okbox(out, `<p class="warnbox">${esc(t('noOpenRequest', { who: sp.name }))}</p>`); return true; }
    let l = links[0];
    if (links.length > 1) { const c = await pickCase(links.map(x => db.get('cases', x.caseId)).filter(Boolean)); if (!c) return true; l = links.find(x => x.caseId === c.id) || l; }
    const cs = db.get('cases', l.caseId) || {};
    const patch = { id: l.id, paid: 'כן', paidAt: todayIso() }; if (a.amount) patch.cost = a.amount; if (!/אושר/.test(String(l.status))) patch.status = 'אושר';
    db.put('links', patch);
    const text = supplierPaidMessage(sp, cs, a.amount || Office.num(l.cost), sp.lang || 'he', s.signer || DEFAULTS.signer);
    okbox(out, `<p class="okbox">${esc(t('paidNoted', { who: sp.name, amount: Office.money(a.amount || Office.num(l.cost)), event: caseLine(cs) }))}</p><div class="sub"><b>${esc(t('paidNote'))}</b></div><textarea id="paidText" rows="5">${esc(text)}</textarea><div class="row">${sp.phone ? `<button type="button" class="btn wa" id="paidWa">${esc(t('whatsapp'))}</button>` : `<span class="badge warn">${esc(t('noContact'))}</span>`}${copyOf('#paidText')}<a class="btn sm ghost" href="#/case/${esc(cs.id)}/money">${esc(t('open'))}</a></div>`);
    const w = out.querySelector('#paidWa'); if (w) w.onclick = () => openWhatsApp(sp.phone, out.querySelector('#paidText').value);
    return true;
  }

  if (a.kind === 'callLog') {
    const person = ctx.findPerson ? ctx.findPerson(a.who) : null;
    const rec = { name: person ? person.name : a.who, phone: person && person.phone || '', why: '', lang: s.msgLang || 'he', status: a.when && a.when.due > todayIso() ? CALL.callback : CALL.todo, callbackAt: a.when ? a.when.due : '', time: a.when ? a.when.time : '', attempts: 0 };
    db.put('calls', rec);
    okbox(out, `<p class="okbox">${esc(t('callLogged', { who: rec.name, when: a.when ? Office.fmt(a.when.due) + (a.when.time ? ' ' + a.when.time : '') : t('today') }))}</p><div class="row"><a class="btn sm" href="#/calls">${esc(t('calls'))}</a>${a.when ? `<button type="button" class="btn sm" id="callCal">${esc(t('toCalendar'))}</button>` : ''}</div>`);
    const b = out.querySelector('#callCal'); if (b) b.onclick = () => toCalendar(taskEvent({ id: 'call', title: t('call') + ': ' + rec.name, due: a.when.due, time: a.when.time }));
    return true;
  }

  if (a.kind === 'taskDone' || a.kind === 'taskCancel' || a.kind === 'snooze') {
    const open = db.list('tasks', x => x.status !== TASK.done);
    const hits = matchTitles(a.who, open, x => x.title);
    const apply = x => {
      const before = { id: x.id, status: x.status, note: x.note || '', due: x.due || '', time: x.time || '' };
      if (a.kind === 'snooze') { db.put('tasks', { id: x.id, due: a.when.due, time: a.when.time || x.time || '' }); remember(t('snoozed', { what: x.title, when: Office.fmt(a.when.due) }), () => db.put('tasks', before)); okbox(out, `<p class="okbox">${esc(t('snoozed', { what: x.title, when: Office.fmt(a.when.due) + (a.when.time ? ' ' + a.when.time : '') }))}</p><div class="row"><a class="btn sm" href="#/tasks">${esc(t('tasks'))}</a>${undoBtn()}</div>`); return; }
      db.put('tasks', Object.assign({ id: x.id, status: TASK.done }, a.kind === 'taskCancel' ? { note: (x.note ? x.note + ' · ' : '') + t('cancelled') } : {}));
      remember(t(a.kind === 'taskCancel' ? 'taskCancelled' : 'taskMarkedDone', { what: x.title }), () => db.put('tasks', before));
      okbox(out, `<p class="okbox">${esc(t(a.kind === 'taskCancel' ? 'taskCancelled' : 'taskMarkedDone', { what: x.title }))}</p><div class="row"><a class="btn sm" href="#/tasks">${esc(t('tasks'))}</a>${undoBtn()}</div>`);
    };
    if (!hits.length) { okbox(out, `<p class="warnbox">${esc(t('noTaskNamed', { what: a.who }))}</p><div class="row"><a class="btn sm" href="#/tasks">${esc(t('tasks'))}</a></div>`); return true; }
    if (hits.length === 1 || hits[0].score > hits[1].score) { apply(hits[0].item); return true; }
    okbox(out, `<div class="title">${esc(t('whichTask'))}</div>${hits.slice(0, 5).map(h => `<button type="button" class="btn" data-task="${esc(h.item.id)}">${esc(h.item.title)}${h.item.due ? ' · ' + esc(Office.fmt(h.item.due)) : ''}</button>`).join('')}`);
    out.querySelectorAll('[data-task]').forEach(b => { b.onclick = () => apply(db.get('tasks', b.dataset.task)); });
    return true;
  }

  if (a.kind === 'chosen') {
    const sp = supByName(a.who); if (!sp) { okbox(out, `<p class="warnbox">${esc(t('noSupplierNamed', { who: a.who }))}</p>`); return true; }
    const links = db.list('links', l => l.supplierId === sp.id && !/בוטל/.test(String(l.status)) && Office.ACTIVE.includes((db.get('cases', l.caseId) || {}).status));
    if (!links.length) { okbox(out, `<p class="warnbox">${esc(t('noOpenRequest', { who: sp.name }))}</p>`); return true; }
    let l = links[0];
    if (links.length > 1) { const c = await pickCase(links.map(x => db.get('cases', x.caseId)).filter(Boolean)); if (!c) return true; l = links.find(x => x.caseId === c.id) || l; }
    const beforeLink = { id: l.id, status: l.status || '', chosen: l.chosen || '', answeredAt: l.answeredAt || '' };
    db.put('links', { id: l.id, status: 'אושר', chosen: 'כן', answeredAt: l.answeredAt || todayIso() });
    remember(t('supplierChosen', { who: sp.name, event: '' }), () => db.put('links', beforeLink));
    const cs = db.get('cases', l.caseId) || {};
    const others = db.list('links', x => x.caseId === l.caseId && x.id !== l.id && (db.get('suppliers', x.supplierId) || {}).type === sp.type && !/בוטל|אושר/.test(String(x.status)));
    okbox(out, `<p class="okbox">${esc(t('supplierChosen', { who: sp.name, event: caseLine(cs) }))}</p><div class="row"><a class="btn sm" href="#/case/${esc(cs.id)}/suppliers">${esc(t('open'))}</a>${others.length ? `<span class="hint">${esc(t('othersStillOpen', { n: others.length }))}</span>` : ''}</div>`);
    return true;
  }

  if (a.kind === 'printAdd') {
    let cs = a.who ? ctx.caseByName(a.who, a.who.replace(/^[לב](?=[֐-׿])/, '')) : null;
    if (!cs) { const list = active(); if (!list.length) { okbox(out, `<p class="warnbox">${esc(t('noCases'))}</p>`); return true; } cs = await pickCase(list); if (!cs) return true; }
    const pid = db.put('print', { caseId: cs.id, item: a.item, qty: a.qty || '', size: '', status: PRINT_STATUS.plan });
    remember(t('printAdded', { item: a.item, event: '' }), () => db.remove('print', pid));
    okbox(out, `<p class="okbox">${esc(t('printAdded', { item: (a.qty ? a.qty + ' ' : '') + a.item, event: caseLine(cs) }))}</p><div class="row"><a class="btn sm" href="#/case/${esc(cs.id)}/lists">${esc(t('open'))}</a></div>`);
    return true;
  }

  if (a.kind === 'field') {
    const cs = ctx.caseByName(a.who, a.who.replace(/^[לב](?=[֐-׿])/, ''));
    if (!cs) { okbox(out, `<p class="warnbox">${esc(t('noCaseFor', { who: a.who }))}</p>`); return true; }
    const v = a.field === 'date' ? (cs.date ? Office.fmt(cs.date) + (cs.days && Office.num(cs.days) > 1 ? ' (' + cs.days + ' ' + t('daysWord') + ')' : '') : '') : String(cs[a.field] || '');
    const label = { budget: t('fBudget'), participants: t('fParticipants'), date: t('fDate'), place: t('fPlace'), hours: t('fHours'), purpose: t('fPurpose') }[a.field] || a.field;
    okbox(out, `<div class="title"><a href="#/case/${esc(cs.id)}">${esc(caseLine(cs))}</a></div><p><b>${esc(label)}:</b> ${v ? esc(v) : '<span class="badge warn">' + esc(t('missing')) + '</span>'}</p>`);
    return true;
  }
  return runAction2(a, ctx);
}

/* ---------------- the second round: participants, budget, run of show, files, contracts, checklists, reminders, board, history ----------------
   (parsed by js/logic/questions2.js). Every answer: a title that links to the screen, plain text (the read-aloud button reads it),
   a copy button when the text is something she may paste. */
const pre = s => `<p class="v2text" style="white-space:pre-wrap">${esc(s)}</p>`;
const ul = items => `<ul class="open">${items.map(x => `<li>${x.href ? `<a href="${esc(x.href)}">${esc(x.text)}</a>` : esc(x.text)}${x.tail ? ' ' + x.tail : ''}</li>`).join('')}</ul>`;
const hhmmNow = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const nameHit = (a, b) => { const x = Office.normHe(a || ''), y = Office.normHe(b || ''); return !!x && !!y && x.length >= 2 && y.length >= 2 && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0); };
/** The event of today (a multi-day one counts on each of its days), else the next dated one. */
function todaysCase(today) {
  const t0 = Office.iso(today) || todayIso();
  const list = active().filter(c => Office.day(c.date));
  const on = list.find(c => { const s = Office.iso(c.date); const n = Math.max(1, Office.num(c.days) || 1); return s <= t0 && t0 <= Office.iso(Office.addDays(Office.day(c.date), n - 1)); });
  return on || list.find(c => Office.iso(c.date) >= t0) || null;
}
const producerOpts = s => { const signer = s.signer || DEFAULTS.signer; return { producer: String(signer).split('\n')[0].split(' ')[0] || 'וירג׳יני', phone: s.bizPhone || DEFAULTS.bizPhone, signer }; };
const blockLine = b => Office.hhmm(b.start) + (Office.minutes(b.end) != null ? '-' + Office.hhmm(b.end) : '') + ' ' + String(b.title || '') + (b.place ? ' · ' + b.place : '') + (b.owner ? ' · ' + b.owner : '');
const runsheetOf = cs => db.list('runsheet', r => r.caseId === cs.id)[0] || null;

async function runAction2(a, ctx) {
  const { out, s } = ctx;
  const L = lang();
  const K = a.kind;
  const KINDS = ['partAdd', 'rsvpCount', 'rsvpMissing', 'hotelList', 'budgetProfit', 'budgetCost', 'budgetSchedule', 'budgetOpen', 'rsNow', 'rsNext', 'callSheet', 'live', 'docsMissing', 'fileFind', 'contractMissing', 'contractSigned', 'checklistLeft', 'checklistWeek', 'reminders', 'urgent', 'remindersRead', 'caseMove', 'history'];
  if (!KINDS.includes(K)) return false;
  const card = (title, href, body, copy, extra) => okbox(out, `<div class="title">${href ? `<a href="${esc(href)}">${esc(title)}</a>` : esc(title)}</div>${body}<div class="row">${href ? `<a class="btn sm" href="${esc(href)}">${esc(t('open'))}</a>` : ''}${copy ? copyBtn(copy) : ''}${extra || ''}</div>`);
  const warn = msg => okbox(out, `<p class="warnbox">${esc(msg)}</p>`);
  // the event she named; without a name, the only active one, or a pick
  const resolveCase = async () => {
    if (a.who) return ctx.caseByName(a.who, a.alt || a.who) || null;
    const list = active(); if (list.length === 1) return list[0];
    return list.length ? pickCase(list) : null;
  };
  const needCase = async () => { const cs = await resolveCase(); if (!cs) warn(a.who ? t('noCaseFor', { who: a.who }) : t('noCases')); return cs; };
  const ev = cs => caseLine(cs);

  /* ---- participants ---- */
  if (K === 'partAdd') {
    const cs = await needCase(); if (!cs) return true;
    const r = await addFromText(cs.id, a.text, db);
    const href = '#/participants/' + cs.id;
    if (!r.added.length) { card(t('v2Participants'), href, `<p class="warnbox">${esc(r.skipped ? t('v2Skipped', { n: r.skipped }) : t('v2AddedNone'))}</p>`); return true; }
    const ids = r.added.map(p => p.id);
    const msg = t('v2Added', { n: r.added.length, event: ev(cs), names: r.added.map(p => p.name).join(', ') });
    remember(msg, () => ids.forEach(id => db.remove('participants', id)));
    card(t('v2Participants'), href, `<p class="okbox">${esc(msg)}${r.skipped ? ' · ' + esc(t('v2Skipped', { n: r.skipped })) : ''}</p>`, '', undoBtn());
    return true;
  }
  if (K === 'rsvpCount' || K === 'rsvpMissing' || K === 'hotelList') {
    const cs = await needCase(); if (!cs) return true;
    const list = db.list('participants', p => p.caseId === cs.id);
    const href = '#/participants/' + cs.id;
    if (!list.length) { card(ev(cs), href, `<p class="hint">${esc(t('v2NoParticipants', { event: ev(cs) }))}</p>`); return true; }
    if (K === 'rsvpCount') { const sm = rsvpSummary(list); const text = t('v2Rsvp', sm); card(ev(cs), href, `<p>${esc(text)}</p>`, text); return true; }
    if (K === 'rsvpMissing') {
      const open = list.filter(p => p.rsvp !== 'yes' && p.rsvp !== 'no').sort((x, y) => String(x.name).localeCompare(String(y.name), 'he'));
      const text = open.length ? t('v2NotConfirmed', { n: open.length }) + '\n' + open.map(p => '• ' + p.name + (p.phone ? ' · ' + p.phone : '') + (p.rsvp === 'maybe' ? ' · ' + rsvpLabel('rsvp', 'maybe', L) : '')).join('\n') : t('v2AllConfirmed');
      card(ev(cs), href, open.length ? `<p>${esc(t('v2NotConfirmed', { n: open.length }))}</p>${ul(open.map(p => ({ text: p.name + (p.phone ? ' · ' + p.phone : '') + (p.rsvp === 'maybe' ? ' · ' + rsvpLabel('rsvp', 'maybe', L) : '') })))}` : `<p class="okbox">${esc(t('v2AllConfirmed'))}</p>`, text);
      return true;
    }
    const text = hotelListText(list, cs, cs.lang || s.msgLang || L, s.signer || DEFAULTS.signer);
    const noRooms = !list.some(p => p.room === 'single' || p.room === 'double');
    card(t('v2HotelList') + ' · ' + ev(cs), href, (noRooms ? `<p class="hint">${esc(t('v2NoRooms'))}</p>` : '') + pre(text), text);
    return true;
  }

  /* ---- budget ---- */
  if (K === 'budgetProfit' || K === 'budgetCost' || K === 'budgetOpen' || K === 'budgetSchedule') {
    const cs = await needCase(); if (!cs) return true;
    const lines = db.list('budget', l => l.caseId === cs.id), pays = db.list('payments', p => p.caseId === cs.id);
    const href = '#/budget/' + cs.id; const m = Office.money;
    if (!lines.length && !pays.length) { card(t('v2Budget') + ' · ' + ev(cs), href, `<p class="hint">${esc(t('v2NoBudget', { event: ev(cs) }))}</p>`); return true; }
    if (K === 'budgetSchedule') {
      const rows = paymentSchedule(lines, pays, cs, todayIso());
      const line = r => [r.date ? Office.fmt(r.date) : t('v2NoDate'), r.kind === 'client' ? t('v2Client') : t('v2Supplier'), r.label, m(r.amount), r.paid ? t('v2Paid') : r.overdue ? t('v2Overdue') : ''].filter(Boolean).join(' · ');
      const text = t('v2Schedule') + ' · ' + ev(cs) + '\n' + (rows.length ? rows.map(r => '• ' + line(r)).join('\n') : t('v2NoSchedule'));
      card(t('v2Schedule') + ' · ' + ev(cs), href, rows.length ? ul(rows.map(r => ({ text: line(r) }))) : `<p class="hint">${esc(t('v2NoSchedule'))}</p>`, text);
      return true;
    }
    const sm = budgetSummary(lines, pays, s.vat, cs, todayIso());
    const text = K === 'budgetProfit' ? t('v2Profit', { margin: m(sm.margin), pct: sm.marginPct, price: m(sm.clientPrice), cost: m(sm.totalCost) })
      : K === 'budgetCost' ? t('v2SupCost', { cost: m(sm.totalCost), agreed: m(sm.agreedCost), paid: m(sm.supplierPaid), due: m(sm.supplierDue) })
        : t('v2Open', { open: m(sm.open), price: m(sm.clientPrice), received: m(sm.received), invoiced: m(sm.invoiced), due: m(sm.supplierDue) });
    const warns = sm.warnings.map(w => t('bgW_' + w.code, Object.assign({}, w, { cost: m(w.cost || 0), price: m(w.price || 0), amount: m(w.amount || 0), budget: m(w.budget || 0), date: w.date ? Office.fmt(w.date) : '' })));
    card(t('v2Budget') + ' · ' + ev(cs), href, `<p>${esc(text)}</p>${warns.length ? `<div class="sub"><b>${esc(t('bgWarnings'))}</b></div>${ul(warns.map(x => ({ text: x })))}` : ''}`, text);
    return true;
  }

  /* ---- run of show ---- */
  if (K === 'rsNow' || K === 'rsNext') {
    const cs = todaysCase(todayIso()); if (!cs) { warn(t('v2NoEventToday')); return true; }
    const rec = runsheetOf(cs); const href = '#/runsheet/' + cs.id + '/live';
    const day = rec ? (RS.dayOf(rec, todayIso()) || (rec.days || []).find(d => (d.blocks || []).length)) : null;
    if (!day) { card(ev(cs), '#/runsheet/' + cs.id, `<p class="hint">${esc(t('v2NoRunsheet', { event: ev(cs) }))}</p>`); return true; }
    const nn = RS.nowNext(day.blocks, hhmmNow());
    const now = nn.now ? t('v2Now', { what: blockLine(nn.now) }) + ' (' + t('v2Remaining', { n: nn.now.remaining }) + ')' : t('v2NowNone');
    const next = nn.next ? t('v2Next', { what: blockLine(nn.next), n: nn.next.inMinutes }) : t('v2NextNone');
    const lines = K === 'rsNow' ? [now, next] : [next, now];
    nn.late.forEach(b => lines.push(t('v2Late', { what: blockLine(b) })));
    card(t('v2Runsheet') + ' · ' + ev(cs), href, ul(lines.map(x => ({ text: x }))), lines.join('\n'));
    return true;
  }
  if (K === 'live') {
    const cs = a.who ? ctx.caseByName(a.who, a.alt || a.who) : todaysCase(todayIso());
    if (!cs) { warn(a.who ? t('noCaseFor', { who: a.who }) : t('v2NoEventToday')); return true; }
    okbox(out, `<p class="okbox">${esc(t('v2GoingLive', { event: ev(cs) }))}</p>`);
    toast(t('v2LiveMode'), 1200); location.hash = '#/runsheet/' + cs.id + '/live';
    return true;
  }
  if (K === 'callSheet') {
    let cs = a.event ? ctx.caseByName(a.event, a.eventAlt || a.event) : null;
    // "call sheet for Hotel Leonardo for Shoval": when the split found no event, the whole tail is the name
    let who = a.event && !cs ? a.raw : a.who;
    let recs = db.list('runsheet').map(r => ({ r, c: db.get('cases', r.caseId) })).filter(x => x.c && Office.ACTIVE.includes(x.c.status));
    if (cs) recs = recs.filter(x => x.c.id === cs.id);
    const hit = recs.map(x => ({ x, p: RS.people(x.r).find(p => nameHit(p.name, who)) })).find(y => y.p);
    if (!hit) {
      if (cs) card(ev(cs), '#/runsheet/' + cs.id, `<p class="warnbox">${esc(t('v2NoPersonOnSheet', { who, event: ev(cs) }))}</p>`);
      else if (!recs.length) warn(a.event ? t('noCaseFor', { who: a.event }) : t('v2NoRunsheet', { event: '' }));
      else warn(t('v2NoPersonOnSheet', { who, event: recs.map(x => x.c.client).join(', ') }));
      return true;
    }
    cs = hit.x.c; const p = hit.p;
    const sp = (p.supplierId && db.get('suppliers', p.supplierId)) || supByName(p.name) || null;
    const staff = db.list('staff').find(x => nameHit(x.name, p.name)) || db.list('team').find(x => nameHit(x.name, p.name)) || null;
    const phone = p.phone || (sp && sp.phone) || (staff && staff.phone) || '';
    const lg = (sp && sp.lang) || s.msgLang || L;
    const text = RS.callSheetText(hit.x.r, cs, p.name, lg, producerOpts(s));
    const href = '#/runsheet/' + cs.id;
    card(t('v2CallSheet', { who: p.name }) + ' · ' + ev(cs), href, pre(text), text, phone ? `<button type="button" class="btn wa sm" id="wa">${esc(t('whatsapp'))}</button>` : `<span class="badge warn">${esc(t('noContact'))}</span>`);
    const w = out.querySelector('#wa'); if (w) w.onclick = () => openWhatsApp(phone, text);
    return true;
  }

  /* ---- files ---- */
  if (K === 'docsMissing') {
    const cs = await needCase(); if (!cs) return true;
    const list = db.list('casefiles', f => f.caseId === cs.id);
    const miss = missingKinds(cs, list, db.list('links', l => l.caseId === cs.id), { suppliers: db.list('suppliers'), contracts: db.list('contracts', x => x.caseId === cs.id) });
    const href = '#/files/' + cs.id;
    const items = miss.map(x => t(x.why, { who: x.who }));
    const text = (items.length ? t('v2DocsMissing', { n: items.length }) + '\n' + items.map(x => '• ' + x).join('\n') : t('v2DocsOk'));
    card(t('v2Files') + ' · ' + ev(cs), href, items.length ? `<p>${esc(t('v2DocsMissing', { n: items.length }))}</p>${ul(items.map(x => ({ text: x })))}` : `<p class="okbox">${esc(t('v2DocsOk'))}</p>`, text);
    return true;
  }
  if (K === 'fileFind') {
    const cs = await needCase(); if (!cs) return true;
    const list = db.list('casefiles', f => f.caseId === cs.id);
    const w = a.what;
    const anyFile = /^(?:קובץ|קבצים|מסמך|מסמכים|files?|documents?|fichiers?)$/i.test(w);
    const kind = anyFile ? '' : /תמונ|צילומ|photo|picture/i.test(w) ? 'photo' : guessKind(w, '', '');
    let hits = anyFile ? list : (kind && kind !== 'other' ? filterFiles(list, { kind }) : []);
    if (!hits.length && !anyFile) hits = filterFiles(list, { q: w }, { caseOf: () => cs, supplierOf: id => db.get('suppliers', id) });
    const href = '#/files/' + cs.id;
    if (!hits.length) { card(t('v2Files') + ' · ' + ev(cs), href, `<p class="hint">${esc(t('v2FilesNone', { what: w, event: ev(cs) }))}</p>`); return true; }
    const line = f => [f.name, t('k_' + (f.kind || 'other')), f.supplierId && (db.get('suppliers', f.supplierId) || {}).name, f.addedAt ? Office.fmt(f.addedAt) : ''].filter(Boolean).join(' · ');
    card(t('v2Files') + ' · ' + ev(cs), href, `<p>${esc(t('v2FilesFound', { n: hits.length }))}</p><ul class="open">${hits.map(f => `<li>${esc(line(f))} <button type="button" class="btn sm ghost" data-file="${esc(f.fileId || '')}" data-cloud="${esc(f.cloudPath || '')}">${esc(t('cfOpen'))}</button></li>`).join('')}</ul>`, hits.map(line).join('\n'));
    out.querySelectorAll('[data-file]').forEach(b => { b.onclick = async () => {
      const rec = b.dataset.file ? await files.get(b.dataset.file).catch(() => null) : null;
      if (!rec || !rec.blob) { toast(t('cfOnDevice'), 3500); return; }
      if (/^image\/|pdf/i.test(rec.type || '')) { const u = URL.createObjectURL(rec.blob); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); } else downloadFile(rec);
    }; });
    return true;
  }

  /* ---- contracts ---- */
  if (K === 'contractMissing' || K === 'contractSigned') {
    const cs = await needCase(); if (!cs) return true;
    const k = db.list('contracts', x => x.caseId === cs.id).sort((x, y) => String(y.created || '').localeCompare(String(x.created || '')))[0] || null;
    const href = k ? '#/contract/' + k.id : '#/case/' + cs.id + '/contract';
    if (K === 'contractSigned') {
      const text = !k ? t('v2NoContract', { event: ev(cs) }) : k.status === CONTRACT_STATUS.signed ? t('v2Signed', { event: ev(cs), date: Office.fmt(k.signedAt || (k.signatures && k.signatures.clientSignedAt) || k.updated) })
        : k.status === CONTRACT_STATUS.sent ? t('v2Sent', { event: ev(cs), date: Office.fmt(k.sentAt || k.updated) }) : t('v2Draft', { event: ev(cs) });
      card(t('v2Contract') + ' · ' + ev(cs), href, `<p class="${!k ? 'hint' : k.status === CONTRACT_STATUS.signed ? 'okbox' : ''}">${esc(text)}</p>`, text);
      return true;
    }
    const c = k || contractFromCase(cs, db.get('clients', cs.clientId), pickQuote(db.list('quotes', q => q.caseId === cs.id)), s, cs.lang);
    const miss = missingForContract(c).map(x => t('ctMiss_' + x));
    const text = (k ? '' : t('v2NoContract', { event: ev(cs) }) + '\n') + (miss.length ? t('v2ContractMissing', { n: miss.length }) + '\n' + miss.map(x => '• ' + x).join('\n') : t('v2ContractOk'));
    card(t('v2Contract') + ' · ' + ev(cs), href, (k ? '' : `<p class="hint">${esc(t('v2NoContract', { event: ev(cs) }))}</p>`) + (miss.length ? `<p>${esc(t('v2ContractMissing', { n: miss.length }))}</p>${ul(miss.map(x => ({ text: x })))}` : `<p class="okbox">${esc(t('v2ContractOk'))}</p>`), text);
    return true;
  }

  /* ---- checklists ---- */
  if (K === 'checklistLeft' || K === 'checklistWeek') {
    const cs = await needCase(); if (!cs) return true;
    const cl = db.list('checklists', x => x.caseId === cs.id)[0] || null;
    const href = '#/case/' + cs.id + '/checklist';
    if (!cl) { card(t('v2Checklist') + ' · ' + ev(cs), href, `<p class="hint">${esc(t('v2NoChecklist', { event: ev(cs) }))}</p>`); return true; }
    const itemLine = i => i.text + (i.due ? ' · ' + Office.fmt(i.due) : '') + (i.late ? ' · ' + t('v2LateBy', { n: i.late }) : '');
    if (K === 'checklistWeek') {
      const soon = dueSoon(cl, todayIso(), 7);
      const text = soon.length ? t('v2ChecklistWeek', { n: soon.length }) + '\n' + soon.map(i => '• ' + itemLine(i)).join('\n') : t('v2ChecklistWeekNone');
      card(t('v2Checklist') + ' · ' + ev(cs), href, soon.length ? `<p>${esc(t('v2ChecklistWeek', { n: soon.length }))}</p>${ul(soon.map(i => ({ text: itemLine(i) })))}` : `<p class="okbox">${esc(t('v2ChecklistWeekNone'))}</p>`, text);
      return true;
    }
    const pr = progress(cl);
    const open = (cl.items || []).filter(i => !i.done).sort((x, y) => String(x.due || '9').localeCompare(String(y.due || '9')));
    const shown = open.slice(0, 12); const more = open.length - shown.length;
    const head = open.length ? t('v2ChecklistLeft', { n: open.length, total: pr.total, pct: pr.pct }) : t('v2ChecklistDone');
    const text = head + (open.length ? '\n' + shown.map(i => '• ' + itemLine(i)).join('\n') + (more ? '\n' + t('v2More', { n: more }) : '') : '');
    card(t('v2Checklist') + ' · ' + ev(cs), href, open.length ? `<p>${esc(head)}</p>${ul(shown.map(i => ({ text: itemLine(i) })))}${more ? `<p class="hint">${esc(t('v2More', { n: more }))}</p>` : ''}` : `<p class="okbox">${esc(head)}</p>`, text);
    return true;
  }

  /* ---- reminders ---- */
  if (K === 'reminders' || K === 'urgent') {
    const all = notifications().filter(n => n.kind !== 'digest');
    const list = K === 'urgent' ? all.filter(n => n.level === 'urgent') : all;
    const href = '#/notifications';
    const title = K === 'urgent' ? t('v2Urgent', { n: list.length }) : t('v2Reminders', { n: list.length });
    const line = n => n.title + (n.body ? ' · ' + String(n.body).split('\n')[0] : '');
    card(title, href, list.length ? ul(list.map(n => ({ text: n.title, href: n.href, tail: n.body ? '<span class="sub">' + esc(String(n.body).split('\n')[0]) + '</span>' : '' }))) : `<p class="okbox">${esc(K === 'urgent' ? t('v2NoUrgent') : t('v2NoReminders'))}</p>`, list.length ? title + '\n' + list.map(n => '• ' + line(n)).join('\n') : '');
    return true;
  }
  if (K === 'remindersRead') {
    const keys = notifications().map(n => n.key);
    setNotifyState(markSeen(notifyState(), keys));
    okbox(out, `<p class="okbox">${esc(t('v2MarkedRead', { n: keys.filter(k => !/^digest:/.test(k)).length }))}</p><div class="row"><a class="btn sm" href="#/notifications">${esc(t('v2AllReminders'))}</a></div>`);
    return true;
  }

  /* ---- the event board ---- */
  if (K === 'caseMove') {
    const cs = ctx.caseByName(a.who, a.alt || a.who);
    if (!cs) { warn(t('noCaseFor', { who: a.who })); return true; }
    if (cs.status === a.status) { okbox(out, `<p class="okbox">${esc(t('v2SameStatus', { event: ev(cs), status: statusLabel(a.status) }))}</p><div class="row"><a class="btn sm" href="#/board">${esc(t('v2Board'))}</a></div>`); return true; }
    const patch = moveCase(cs, a.status, todayIso());
    if (!patch) { warn(t('v2MoveNo', { event: ev(cs), from: statusLabel(cs.status), to: statusLabel(a.status) })); return true; }
    const before = { id: cs.id }; Object.keys(patch).forEach(k => { before[k] = cs[k] === undefined ? '' : cs[k]; });
    db.put('cases', patch);
    const msg = t('v2Moved', { event: ev(cs), status: statusLabel(a.status) });
    remember(msg, () => db.put('cases', before));
    okbox(out, `<p class="okbox">${esc(msg)}</p><div class="row"><a class="btn sm" href="#/board">${esc(t('v2Board'))}</a><a class="btn sm ghost" href="#/case/${esc(cs.id)}">${esc(t('open'))}</a>${undoBtn()}</div>`);
    return true;
  }

  /* ---- history ---- */
  if (K === 'history') {
    const cs = a.who ? ctx.caseByName(a.who, a.alt || a.who) : null;
    if (a.who && !cs) { warn(t('noCaseFor', { who: a.who })); return true; }
    const t0 = todayIso();
    const from = a.when === 'today' ? t0 : a.when === 'yesterday' ? Office.iso(Office.addDays(new Date(), -1)) : a.when === 'week' ? Office.iso(Office.addDays(new Date(), -7)) : '';
    const to = a.when === 'yesterday' ? from : t0;
    let entries = (cs ? historyFor(cs.id) : db.list('history').sort(newestFirst)).filter(e => { const d = String(e.at || '').slice(0, 10); return (!from || d >= from) && d <= to; });
    const whenWord = t(a.when === 'today' ? 'v2wToday' : a.when === 'yesterday' ? 'v2wYesterday' : a.when === 'week' ? 'v2wWeek' : 'v2wRecent');
    const shown = entries.slice(0, 15); const more = entries.length - shown.length;
    const val = (f, v) => f === 'status' && Object.values(Office.STATUS).includes(v) ? statusLabel(v) : null;
    const line = e => Office.fmt(e.at) + ' ' + String(e.at || '').slice(11, 16) + ' · ' + describeChange(e, L, { value: val });
    const href = cs ? '#/case/' + cs.id + '/history' : '';
    const head = entries.length ? t('v2Changes', { when: whenWord, n: entries.length }) : t('v2NoChanges', { when: whenWord });
    card(t('v2History') + (cs ? ' · ' + ev(cs) : ''), href, entries.length ? `<p>${esc(head)}</p>${ul(shown.map(e => ({ text: line(e), href: !cs && e.caseId ? '#/case/' + e.caseId + '/history' : '' })))}${more ? `<p class="hint">${esc(t('v2More', { n: more }))}</p>` : ''}` : `<p class="hint">${esc(head)}</p>`, entries.length ? head + '\n' + shown.map(e => '• ' + line(e)).join('\n') : '');
    return true;
  }
  return false;
}
