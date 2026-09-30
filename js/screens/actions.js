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
  return false;
}
