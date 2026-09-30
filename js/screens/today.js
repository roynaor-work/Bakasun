/* "What is waiting today": events in the next two weeks, clients waiting for an answer, calls to make, tasks due. */
import { t, kindLabel, statusLabel } from '../i18n.js';
import { db } from '../store.js';
import { esc, section, empty, relDay, copyText, openWhatsApp, dial, copyBtn, copyOf } from '../ui.js';
import Office from '../logic/office.js';
import { todayList } from '../logic/extra.js';
import { phonePretty } from '../logic/core.js';
import { unansweredSince } from '../logic/commands.js';
import { pendingApprovals, approvalReminder, supplierPaidMessage, kindLabel as approvalKindLabel } from '../logic/approvals.js';
import { lang as uiLang, langName } from '../i18n.js';
import { DEFAULTS } from '../data/defaults.js';
import { dialog, field } from '../ui.js';
import { pendingRequests } from '../logic/rfq.js';
import { supplierInvoicesMissing } from '../logic/money.js';
import { pendingPrint } from '../logic/print.js';
import { handoverText } from '../logic/travel.js';
import { monthsToSend, monthLabel } from '../logic/receipts.js';
import { openMail } from '../ui.js';
import { resend, remindAll } from './rfq.js';
import { openItems } from '../logic/openItems.js';

function standalone() { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || localStorage.getItem('bakasun.installed') === '1' || sessionStorage.getItem('bakasun.installLater') === '1'; } catch (e) { return false; } }
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }
export function render({ root }) {
  const s = db.settings();
  const data = db.snapshot();
  const travel = (() => { try { return JSON.parse(s.travel || '{}'); } catch (e) { return {}; } })();
  if (travel.on && travel.to && Office.daysBetween(travel.to, new Date()) > 0) { travel.on = false; db.setting('travel', JSON.stringify(travel)); if (s.signerBackup) { db.setting('signer', s.signerBackup); db.setting('signerBackup', ''); } }
  const { items, calls, tasks } = todayList(data, new Date(), { followupDays: s.followupDays || 1 });
  const up = items.filter(x => x.type === 'upcoming'), fu = items.filter(x => x.type === 'followup');
  const yday = unansweredSince(data.calls || [], Office.addDays(new Date(), -1), new Date());
  const pend = pendingApprovals(data.approvals || [], new Date(), s.approvalRemindDays || 2);
  const supPay = (s.supplierPayReminder || 'auto') === 'auto' ? Office.supplierDue((data.links || []).map(l => Object.assign({}, l, { row: l.id })), data.cases, data.suppliers || [], new Date()).filter(x => x.after >= (Office.num(s.supplierPayDays) || 1)) : [];
  const waitSup = pendingRequests(data.links || [], data.cases || [], data.suppliers || [], new Date(), Office.num(s.supplierRemindDays) || 1);
  const missInv = supplierInvoicesMissing(data.links || [], data.cases || [], data.suppliers || [], new Date(), Office.num(s.supInvoiceDays) || 3);
  const waitPrint = pendingPrint(data.print || [], data.cases || [], new Date(), Office.num(s.printRemindDays) || 2);
  const toSend = monthsToSend(data.receipts || [], data.payments || [], data.links || [], JSON.parse(s.monthsSent || '[]'), new Date());
  const nothing = !up.length && !fu.length && !calls.length && !tasks.length && !yday.length && !pend.length && !supPay.length && !waitSup.length && !missInv.length && !waitPrint.length && !toSend.length;

  root.innerHTML = `
    <header class="top"><h1>${esc(t('today'))}</h1>
      <button class="icon" data-quicknote aria-label="${esc(t('quickNote'))}" title="${esc(t('quickNote'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      <a class="icon" href="#/assist" aria-label="${esc(t('assist'))}" title="${esc(t('assist'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v11H8l-4 4z"/><path d="M8 8h8M8 11h5"/></svg></a>
      <a class="icon" href="#/search" aria-label="${esc(t('search'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></a>
    </header>
    <form class="card row" id="askBox"><input name="q" class="grow" placeholder="${esc(t('askWhat'))}" autocomplete="off"><button type="button" class="icon" data-ask-mic aria-label="${esc(t('dictate'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button type="submit" class="btn primary sm">${esc(t('read'))}</button></form>
    ${!standalone() ? `<div class="card" id="installCard" style="${window.__installPrompt || !isIOS() ? '' : ''}"><div class="row between"><b>${esc(t('installTitle'))}</b><button class="btn sm ghost" id="installLater">✕</button></div><div class="sub">${esc(window.__installPrompt ? t('installHint') : isIOS() ? t('installIos') : t('installManual'))}</div>${window.__installPrompt ? `<div class="row"><button class="btn sm primary" id="installBtn">${esc(t('installBtn'))}</button></div>` : ''}</div>` : ''}
    ${travel.on ? `<div class="card warnbox"><div class="row between"><b>${esc(t('travelOn'))}${travel.to ? ' · ' + esc(t('until')) + ' ' + esc(Office.fmt(travel.to)) : ''}</b><a class="btn sm ghost" href="#/settings">${esc(t('edit'))}</a></div><div class="sub">${esc(travel.subName ? t('coveredBy') + ': ' + travel.subName : '')}</div><div class="row"><button class="btn sm primary" id="handover">${esc(t('handover'))}</button></div></div>` : ''}
    ${nothing ? empty(t('nothingToday')) : ''}
    ${up.length ? section(t('upcoming'), `<div class="list">${up.map(x => {
      const c = db.get('cases', x.caseId) || {};
      // a week out and closer: how much is still open on this event, with one tap to the list
      const oc = x.inDays <= 7 ? openItems(c, data, new Date(), uiLang()).total : 0;
      return `<a class="card tap" href="#/case/${esc(x.caseId)}"><div class="row between"><span class="title">${esc(c.client || t('unknownClient'))} · ${esc(kindLabel(c.kind))}</span><span class="badge ${x.inDays <= 2 ? '' : 'muted'}">${esc(relDay(c.date))}</span></div>
        <div class="sub">${esc(x.when)}${c.place ? ' · ' + esc(c.place) : ''}${c.participants ? ' · ' + esc(c.participants) + ' ' + esc(t('people')) : ''}</div>
        ${x.inDays <= 7 ? `<div class="row"><span class="badge ${oc ? 'warn' : 'ok'}">${esc(oc ? t('openCount', { n: oc }) : t('nothingOpen'))}</span>${oc ? `<button class="btn sm" data-open="${esc(c.client || '')}">${esc(t('whatsOpen'))}</button>` : ''}</div>` : ''}
        ${x.details.length ? `<div class="sub">${x.details.map(esc).join(' · ')}</div>` : ''}</a>`; }).join('')}</div>`) : ''}
    ${fu.length ? section(t('followups'), `<div class="list">${fu.map(x => {
      const c = db.get('cases', x.caseId) || {};
      return `<div class="card"><div class="row between"><a class="title" href="#/case/${esc(x.caseId)}">${esc(x.client || t('unknownClient'))}</a><span class="badge warn">${esc(t('waited', { n: x.waited }))}</span></div>
        <div class="sub">${esc(statusLabel(x.status))}${c.date ? ' · ' + esc(Office.fmt(c.date)) : ''}</div>
        <div class="row"><button class="btn wa sm" data-fu="${esc(x.caseId)}">${esc(t('whatsapp'))}</button><button class="btn sm" data-dial="${esc(x.phone)}">${esc(t('call'))}</button></div></div>`; }).join('')}</div>`) : ''}
    ${waitSup.length ? section(t('waitingSuppliers'), `${waitSup.length > 1 ? `<div class="row"><button class="btn wa sm" id="remindAll">${esc(t('remindAll', { n: waitSup.length }))}</button></div>` : ''}<div class="list">${waitSup.map(l => `<div class="card" data-wsup="${esc(l.id)}"><div class="row between"><a class="title" href="#/case/${esc(l.caseId)}/suppliers">${esc(l.sup.name || '')}</a><span class="badge warn">${esc(t('waited', { n: l.waited }))}</span></div><div class="sub">${esc([l.cs.client, l.cs.kind, l.what].filter(Boolean).join(' · '))}</div><div class="row"><button class="btn wa sm" data-remind>${esc(t('remind'))}</button></div></div>`).join('')}</div>`) : ''}
    ${pend.length ? section(t('waitingApproval'), `<div class="list">${pend.map(a => { const c = db.get('cases', a.caseId) || {}; return `<div class="card" data-appr="${esc(a.id)}"><div class="row between"><a class="title" href="#/case/${esc(a.caseId)}/money">${esc(c.client || '')} · ${esc(approvalKindLabel(a.kind, uiLang()))}</a><span class="badge warn">${esc(t('waited', { n: a.waited }))}</span></div>${a.title ? `<div class="sub">${esc(a.title)}</div>` : ''}<div class="row"><button class="btn wa sm" data-remind>${esc(t('remind'))}</button></div></div>`; }).join('')}</div>`) : ''}
    ${supPay.length ? section(t('supplierPay'), `<div class="list">${supPay.map(x => `<div class="card" data-link="${esc(x.row)}"><div class="row between"><span class="title">${esc(x.supplier)}</span><span class="ltr big">${esc(Office.money(x.amount))}</span></div><div class="sub">${esc(x.client)} · ${esc(x.date)} · <span class="count">${x.after}</span> ${esc(t('afterEventDays'))}</div><div class="row"><button class="btn sm ok" data-paid>${esc(t('markPaid'))}</button><button class="btn wa sm" data-paidmsg>${esc(t('paidNote'))}</button></div></div>`).join('')}</div>`) : ''}
    ${toSend.length ? `<a class="card tap warnbox" href="#/money"><b>${esc(t('monthsWaiting'))}</b><div class="sub">${esc(toSend.map(m => monthLabel(m, uiLang())).join(' · '))}</div></a>` : ''}
    ${waitPrint.length ? section(t('printWaiting'), `<div class="list">${waitPrint.map(g => { const sp = db.get('suppliers', g.supplierId) || {}; return `<a class="card tap" href="#/case/${esc(g.caseId)}/lists"><div class="row between"><span class="title">${esc(sp.name || t('printList'))}</span><span class="badge warn">${esc(t('waited', { n: g.waited }))}</span></div><div class="sub">${esc([g.cs.client, g.items.map(i => i.item).join(', ')].filter(Boolean).join(' · '))}</div></a>`; }).join('')}</div>`) : ''}
    ${missInv.length ? section(t('supInvoicesMissing'), `<div class="list">${missInv.map(l => `<a class="card tap" href="#/money"><div class="row between"><span class="title">${esc(l.sup.name || '')}</span><span class="ltr big">${esc(Office.money(l.cost))}</span></div><div class="sub">${esc([l.cs.client, t('paid') + ' ' + Office.fmt(l.paidAt), t('waited', { n: l.waited })].filter(Boolean).join(' · '))}</div></a>`).join('')}</div>`) : ''}
    ${yday.length ? section(t('unansweredYesterday'), `<div class="list">${yday.map(c => `<a class="card tap" href="#/calls"><div class="row between"><span class="title">${esc(c.name)}</span><span class="badge warn"><span class="count">${c.attempts || 1}</span> ${esc(t('attempts'))}</span></div>${c.why ? `<div class="sub">${esc(c.why)}</div>` : ''}</a>`).join('')}</div>`) : ''}
    ${calls.length ? section(t('callsToday'), `<div class="list">${calls.slice(0, 5).map(c => `<a class="card tap" href="#/calls"><div class="row between"><span class="title">${esc(c.name)}</span><span class="ltr sub">${esc(phonePretty(c.phone))}${c.phone ? copyBtn(c.phone, { icon: true }) : ''}</span></div>${c.why ? `<div class="sub">${esc(c.why)}</div>` : ''}</a>`).join('')}
      ${calls.length > 5 ? `<a class="btn ghost" href="#/calls">+${calls.length - 5}</a>` : ''}</div>`) : ''}
    ${tasks.length ? section(t('tasksOpen'), `<div class="list">${tasks.slice().sort((a, b) => (b.late - a.late) || String(a.time || '99').localeCompare(String(b.time || '99'))).slice(0, 6).map(x => `<div class="card" data-task="${esc(x.id)}"><div class="row between"><a class="title" href="#/tasks">${esc(x.title)}</a><span class="badge ${x.late > 0 ? '' : 'muted'}">${esc(x.late > 0 ? Office.fmt(x.due) : (x.time || t('todayIs')))}</span></div><div class="row between"><span class="sub">${esc(x.who || '')}</span><button class="btn sm ok" data-done>✓</button></div></div>`).join('')}</div>`) : ''}
    ${!nothing ? `<div class="sec"><button class="btn ghost" id="copyMorning">${esc(t('morningCopy'))}</button></div>` : ''}
    <button class="fab" id="fab">+ ${esc(t('newLead'))}</button>`;

  root.querySelector('#fab').onclick = () => { location.hash = '#/lead'; };
  const ib = root.querySelector('#installBtn'); if (ib) ib.onclick = async () => { const p = window.__installPrompt; if (!p) return; p.prompt(); try { await p.userChoice; } catch (e) { /* */ } window.__installPrompt = null; render({ root }); };
  const il = root.querySelector('#installLater'); if (il) il.onclick = () => { try { sessionStorage.setItem('bakasun.installLater', '1'); } catch (e) { /* */ } root.querySelector('#installCard').remove(); };
  document.addEventListener('bakasun:installable', () => { if (location.hash.replace(/^#\/?/, '').startsWith('today') || !location.hash) render({ root }); }, { once: true });
  root.querySelectorAll('[data-task]').forEach(el => el.querySelector('[data-done]').onclick = () => { db.put('tasks', { id: el.dataset.task, status: 'done' }); render({ root }); });
  const ho = root.querySelector('#handover'); if (ho) ho.onclick = async () => {
    const open = {
      upcoming: up.map(x => { const c = db.get('cases', x.caseId) || {}; return [c.client, c.kind, c.date ? Office.fmt(c.date) : '', c.place].filter(Boolean).join(' · '); }),
      suppliers: waitSup.map(l => (l.sup.name || '') + (l.sup.phone ? ' ' + l.sup.phone : '') + ' · ' + (l.cs.client || '') + (l.what ? ' · ' + l.what : '')),
      print: waitPrint.map(g => ((db.get('suppliers', g.supplierId) || {}).name || '') + ' · ' + (g.cs.client || '') + ' · ' + g.items.map(i => i.item).join(', ')),
      calls: calls.map(c => c.name + (c.phone ? ' ' + c.phone : '') + (c.why ? ' · ' + c.why : '')),
      tasks: tasks.map(x => x.title + (x.due ? ' · ' + Office.fmt(x.due) : '')),
      followups: fu.map(x => (x.client || '') + (x.phone ? ' ' + x.phone : ''))
    };
    const sub = db.list('team').find(x => x.name === travel.subName) || {};
    const r = await dialog(t('handover'), `<textarea name="text" rows="14">${esc(handoverText(travel, open, (s.signer || DEFAULTS.signer).split('\n')[0]))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: sub.phone || travel.subPhone ? t('whatsapp') : t('email') });
    if (!r) return;
    if (sub.phone || travel.subPhone) openWhatsApp(sub.phone || travel.subPhone, r.text); else openMail(sub.email || '', t('handover'), r.text);
  };
  const ab = root.querySelector('#askBox');
  ab.onsubmit = e => { e.preventDefault(); const v = ab.q.value.trim(); if (!v) { location.hash = '#/assist'; return; } sessionStorage.setItem('bakasun.ask', v); location.hash = '#/assist/from-today'; };
  ab.querySelector('[data-ask-mic]').onclick = () => { sessionStorage.setItem('bakasun.ask', ''); sessionStorage.setItem('bakasun.askMic', '1'); location.hash = '#/assist/from-today'; };
  root.querySelectorAll('[data-fu]').forEach(b => b.onclick = () => {
    const f = fu.find(x => x.caseId === b.dataset.fu);
    openWhatsApp(f.phone, f.text + (s.signer ? '\n' + s.signer : ''));
  });
  root.querySelectorAll('[data-dial]').forEach(b => b.onclick = () => dial(b.dataset.dial));
  const ra = root.querySelector('#remindAll'); if (ra) ra.onclick = () => remindAll(waitSup, s);
  root.querySelectorAll('[data-open]').forEach(b => { b.onclick = e => { e.preventDefault(); e.stopPropagation(); sessionStorage.setItem('bakasun.ask', t('askOpenFor', { who: b.dataset.open })); location.hash = '#/assist/from-today'; }; });
  root.querySelectorAll('[data-wsup]').forEach(el => el.querySelector('[data-remind]').onclick = () => { const l = db.get('links', el.dataset.wsup); resend(db.get('cases', l.caseId) || {}, s, l, db.get('suppliers', l.supplierId) || { name: l.supplier }, true); });
  root.querySelectorAll('[data-appr]').forEach(el => el.querySelector('[data-remind]').onclick = async () => {
    const a = db.get('approvals', el.dataset.appr); const c = db.get('cases', a.caseId) || {};
    const r = await dialog(t('remind'), `<textarea name="text" rows="7">${esc(approvalReminder(a, c, c.lang, s.signer || DEFAULTS.signer, Office.daysBetween(a.sentAt, new Date())))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
    if (r && openWhatsApp(c.phone, r.text)) db.put('approvals', { id: a.id, lastRemind: Office.iso(new Date()) });
  });
  root.querySelectorAll('[data-link]').forEach(el => {
    const l = db.get('links', el.dataset.link); if (!l) return; const c = db.get('cases', l.caseId) || {}; const sp = db.get('suppliers', l.supplierId) || { name: l.supplier };
    el.querySelector('[data-paid]').onclick = () => db.put('links', { id: l.id, paid: 'כן', paidAt: Office.iso(new Date()) });
    el.querySelector('[data-paidmsg]').onclick = async () => {
      const r = await dialog(t('paidNote'), `<textarea name="text" rows="6">${esc(supplierPaidMessage(sp, c, Office.num(l.cost), sp.lang || 'he', s.signer || DEFAULTS.signer))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (r && openWhatsApp(sp.phone, r.text)) db.put('links', { id: l.id, paid: 'כן', paidAt: Office.iso(new Date()) });
    };
  });
  const cm = root.querySelector('#copyMorning');
  if (cm) cm.onclick = () => {
    let text = Office.morningText(items, Office.fmt(new Date()));
    if (calls.length) text += '\n\nשיחות להיום:\n' + calls.map(c => '• ' + c.name + (c.why ? ' · ' + c.why : '')).join('\n');
    if (tasks.length) text += '\n\nמשימות:\n' + tasks.map(x => '• ' + x.title + (x.who ? ' · ' + x.who : '')).join('\n');
    if (waitSup.length) text += '\n\nספקים שלא ענו:\n' + waitSup.map(l => '• ' + (l.sup.name || '') + ' · ' + (l.cs.client || '') + ' · ' + l.waited + ' ימים').join('\n');
    if (waitPrint.length) text += '\n\nדפוס בלי אישור הזמנה:\n' + waitPrint.map(g => '• ' + ((db.get('suppliers', g.supplierId) || {}).name || '') + ' · ' + (g.cs.client || '') + ' · ' + g.items.length + ' פריטים').join('\n');
    if (missInv.length) text += '\n\nחשבוניות חסרות מספקים:\n' + missInv.map(l => '• ' + (l.sup.name || '') + ' · ' + Office.money(l.cost) + ' · שולם ' + Office.fmt(l.paidAt)).join('\n');
    if (pend.length) text += '\n\nמחכים לאישור לקוח:\n' + pend.map(a => { const c = db.get('cases', a.caseId) || {}; return '• ' + (c.client || '') + ' · ' + approvalKindLabel(a.kind, 'he') + ' · ' + a.waited + ' ימים'; }).join('\n');
    if (supPay.length) text += '\n\nתשלומים לספקים:\n' + supPay.map(x => '• ' + x.supplier + ' · ' + Office.money(x.amount) + ' · ' + x.client).join('\n');
    if (yday.length) text += '\n\nלא ענו אתמול:\n' + yday.map(c => '• ' + c.name + (c.why ? ' · ' + c.why : '')).join('\n');
    copyText(text.trim() || t('nothingToday'));
  };
}
