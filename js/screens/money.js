/* Money: what to collect from clients (overdue, soon, invoice to ask from Roy), and suppliers not yet paid. */
import { t } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, section, empty, dialog, toast, openWhatsApp, copyOf, openWhatsAppAsk } from '../ui.js';
import Office from '../logic/office.js';
import { payStatusLabel } from '../labels.js';
import { DEFAULTS } from '../data/defaults.js';
import { supplierInvoicesMissing, supplierInvoiceReminder, monthReport, monthCsv, monthText } from '../logic/money.js';
import { openMail } from '../ui.js';
import { shareFile, downloadFile } from '../files.js';
import { sendMonth } from './receipts.js';
import { receiptsOf, monthsToSend, monthLabel } from '../logic/receipts.js';
import { lang as uiLang } from '../i18n.js';

export function render({ root }) {
  const s = db.settings();
  const cases = db.list('cases'), payments = db.list('payments');
  const col = Office.collections(payments.map(p => Object.assign({}, p, { row: p.id })), cases, new Date());
  const supDue = Office.supplierDue(db.list('links').map(l => Object.assign({}, l, { row: l.id })), cases, db.list('suppliers'), new Date());
  const missing = supplierInvoicesMissing(db.list('links'), cases, db.list('suppliers'), new Date(), Office.num(s.supInvoiceDays) || 3);
  const ym = sessionStorage.getItem('bakasun.ym') || todayIso().slice(0, 7);
  const rep = monthReport(payments, db.list('links'), cases, db.list('suppliers'), ym);
  const toSend = monthsToSend(db.list('receipts'), payments, db.list('links'), JSON.parse(s.monthsSent || '[]'), new Date());
  const payCard = p => {
    const pay = db.get('payments', p.row) || {};
    return `<div class="card" data-id="${esc(p.row)}"><div class="row between"><span class="title">${esc(p.client)}</span><span class="ltr big">${esc(Office.money(p.amount))}</span></div>
      <div class="sub">${esc(payStatusLabel(p.status))}${p.due ? ' · ' + esc(p.due) : ''}${p.late > 0 ? ` · <span class="badge">${esc(t('overdue'))} <span class="count">${p.late}</span></span>` : ''}${p.note ? ' · ' + esc(p.note) : ''}${pay.invoiceNo ? ` · <span class="ltr">${esc(pay.invoiceNo)}</span>` : ''}</div>
      <div class="row"><select data-status class="grow">${Object.values(Office.PAY).map(v => `<option value="${esc(v)}"${v === p.status ? ' selected' : ''}>${esc(payStatusLabel(v))}</option>`).join('')}</select></div>
      <div class="row">${p.status === Office.PAY.due ? `<button class="btn wa sm" data-invoice>${esc(t('askInvoice'))}</button>` : ''}<button class="btn sm" data-remind>${esc(t('remind'))}</button><button class="btn sm ghost" data-edit>${esc(t('edit'))}</button></div></div>`;
  };
  root.innerHTML = `<header class="top"><a class="icon" href="#/more" aria-label="${esc(t('back'))}"><svg class="mirror" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></a><h1>${esc(t('money'))}</h1><button class="btn sm" id="new">+ ${esc(t('newPayment'))}</button></header>
    <div class="stat"><div class="card"><b class="ltr">${esc(Office.money(col.openTotal))}</b><span>${esc(t('openTotal'))}</span></div><div class="card"><b class="ltr">${esc(Office.money(col.overdueTotal))}</b><span>${esc(t('overdue'))}</span></div><div class="card"><b class="count">${col.noInvoice.length}</b><span>${esc(t('askInvoice'))}</span></div></div>
    ${section(t('payments'), `<div class="list">${col.open.length ? col.open.map(payCard).join('') : empty(t('noPayments'))}</div>`)}
    ${supDue.length ? section(t('supplierPayments'), `<div class="list">${supDue.map(x => `<a class="card tap" href="#/case/${esc(x.caseId)}"><div class="row between"><span class="title">${esc(x.supplier)}</span><span class="ltr big">${esc(Office.money(x.amount))}</span></div><div class="sub">${esc(x.client)} · ${esc(x.date)}</div></a>`).join('')}</div>`) : ''}
    ${missing.length ? section(t('supInvoicesMissing'), `<div class="list">${missing.map(l => `<div class="card" data-miss="${esc(l.id)}"><div class="row between"><a class="title" href="#/case/${esc(l.caseId)}/suppliers">${esc(l.sup.name || '')}</a><span class="ltr big">${esc(Office.money(l.cost))}</span></div><div class="sub">${esc([l.cs.client, t('paid') + ' ' + Office.fmt(l.paidAt), t('waited', { n: l.waited })].filter(Boolean).join(' · '))}</div><div class="row"><button class="btn wa sm" data-remind-inv>${esc(t('remind'))}</button><button class="btn sm ok" data-got-inv>${esc(t('invReceived'))}</button></div></div>`).join('')}</div>`) : ''}
    ${toSend.length ? `<div class="card warnbox"><b>${esc(t('monthsWaiting'))}</b><div class="row">${toSend.map(m => `<button class="btn sm primary" data-sendym="${esc(m)}">${esc(monthLabel(m, uiLang()))}</button>`).join('')}</div></div>` : ''}
    ${section(t('monthForAccountant'), `<div class="row"><input type="month" id="ym" value="${esc(ym)}"><button class="btn sm" id="ymCsv">CSV</button><button class="btn sm primary" id="ymMail">${esc(t('sendToAccountant'))}</button><a class="btn sm" href="#/receipts/${esc(ym)}">${esc(t('receipts'))} (<span class="count">${receiptsOf(db.list('receipts'), ym).length}</span>)</a></div>
      <div class="stat"><div class="card"><b class="ltr">${esc(Office.money(rep.totalIn))}</b><span>${esc(t('income'))}</span></div><div class="card"><b class="ltr">${esc(Office.money(rep.totalOut))}</b><span>${esc(t('expenses'))}</span></div><div class="card"><b class="count">${rep.missing}</b><span>${esc(t('invMissing'))}</span></div></div>
      ${rep.clientRows.length || rep.supplierRows.length ? `<div class="tablewrap"><table class="cmp"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('who'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('invoiceNo'))}</th></tr></thead><tbody>${rep.clientRows.map(r => `<tr><td>${esc(r.date)}</td><td>↓ ${esc(r.client)}</td><td class="n">${esc(Office.money(r.amount))}</td><td>${esc(r.invoiceNo || r.status)}</td></tr>`).join('')}${rep.supplierRows.map(r => `<tr><td>${esc(r.date)}</td><td>↑ ${esc(r.supplier)}</td><td class="n">${esc(Office.money(r.amount))}</td><td>${esc(r.invoice)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="hint">${esc(t('nothingThisMonth'))}</p>`}`)}`;

  root.querySelector('#new').onclick = () => editPayment(null);
  root.querySelector('#ym').onchange = e => { sessionStorage.setItem('bakasun.ym', e.target.value); render({ root }); };
  root.querySelector('#ymCsv').onclick = async () => { const rec = { blob: new Blob([monthCsv(rep)], { type: 'text/csv' }), name: 'bakasun-' + ym + '.csv', type: 'text/csv', title: t('monthForAccountant') }; if (!(await shareFile(rec, monthText(rep, s.signer || DEFAULTS.signer).subject))) { downloadFile(rec); toast(t('shareFallback'), 4000); } };
  const accountantMail = () => { const acc = db.list('team').find(x => /רו["״]?ח|רואה חשבון|accountant|comptable/i.test(x.role || '') || /רו["״]?ח|רואה חשבון/.test(x.name || '')); return s.accountantEmail || (acc && acc.email) || ''; };
  const sendYm = async m => { const rp = m === ym ? rep : monthReport(payments, db.list('links'), cases, db.list('suppliers'), m); const mt = monthText(rp, s.signer || DEFAULTS.signer); if (await sendMonth(m, mt.text, mt.subject, accountantMail())) render({ root }); };
  root.querySelector('#ymMail').onclick = () => sendYm(ym);
  root.querySelectorAll('[data-sendym]').forEach(b => b.onclick = () => sendYm(b.dataset.sendym));
  root.querySelectorAll('[data-miss]').forEach(el => {
    const l = db.get('links', el.dataset.miss); const cs = db.get('cases', l.caseId) || {}; const sp = db.get('suppliers', l.supplierId) || { name: l.supplier };
    el.querySelector('[data-got-inv]').onclick = () => { db.put('links', { id: l.id, supInvoice: 'התקבלה', supInvoiceAt: todayIso() }); render({ root }); };
    el.querySelector('[data-remind-inv]').onclick = async () => {
      const r = await dialog(t('remind'), `<textarea name="text" rows="7">${esc(supplierInvoiceReminder(sp, cs, Office.num(l.cost), sp.lang || 'he', s.signer || DEFAULTS.signer))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: sp.email ? t('email') : t('whatsapp'), cancel: sp.email && sp.phone ? t('whatsapp') : undefined });
      if (r === null) return;
      if (sp.email) openMail(sp.email, t('supInvoice') + ' · ' + (cs.kind || '') + (cs.date ? ' · ' + Office.fmt(cs.date) : ''), r.text); else openWhatsApp(sp.phone, r.text);
    };
  });
  root.querySelectorAll('.card[data-id]').forEach(el => {
    const p = db.get('payments', el.dataset.id); const cs = db.get('cases', p.caseId) || {}; const client = db.get('clients', cs.clientId) || {};
    el.querySelector('[data-status]').onchange = e => db.put('payments', { id: p.id, status: e.target.value, paidAt: e.target.value === Office.PAY.paid ? todayIso() : p.paidAt, invoicedAt: e.target.value === Office.PAY.invoiced && !p.invoicedAt ? todayIso() : p.invoicedAt });
    el.querySelector('[data-edit]').onclick = () => editPayment(p);
    el.querySelector('[data-remind]').onclick = async () => {
      const r = await dialog(t('remind'), `<textarea name="text" rows="6">${esc(Office.paymentReminder(p, cs, cs.contact) + (s.signer ? '\n' + s.signer : ''))}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (r) openWhatsApp(cs.phone, r.text);
    };
    const inv = el.querySelector('[data-invoice]'); if (inv) inv.onclick = async () => {
      if (!s.invoiceTo) { toast(t('noInvoicePhone'), 3500); return; }
      const m = Office.invoiceRequest(p, cs, client, s.signer || DEFAULTS.signer);
      const extra = [client.payer ? '• משלם דרך: ' + client.payer : '', client.invoiceEmail && client.invoiceEmail !== client.email ? '• לשלוח ל: ' + client.invoiceEmail : '', client.payTerms ? '• תנאי תשלום: ' + client.payTerms : '', client.attachments ? '• לצרף: ' + client.attachments : ''].filter(Boolean);
      if (extra.length) m.text = m.text.replace(/\n\nתודה,/, '\n' + extra.join('\n') + '\n\nתודה,');
      const r = await dialog(t('askInvoice'), `<textarea name="text" rows="12">${esc(m.text)}</textarea><div class="row">${copyOf('[name=text]')}</div>`, { ok: t('whatsapp') });
      if (r && await openWhatsAppAsk(s.invoiceTo, r.text)) db.put('payments', { id: p.id, status: Office.PAY.invoiceAsked });
    };
  });
}

export async function editPayment(p, caseId) {
  p = p || { caseId: caseId || '', amount: '', due: '', status: Office.PAY.due, note: '' };
  const cases = db.list('cases', c => Office.ACTIVE.includes(c.status) || c.id === p.caseId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const r = await dialog(p.id ? t('edit') : t('newPayment'), field('caseId', t('forCase'), p.caseId, { type: 'select', options: cases.map(c => [c.id, c.client + (c.date ? ' · ' + Office.fmt(c.date) : '')]) }) +
    `<div class="grid2">${field('amount', t('amount'), p.amount, { type: 'number', inputmode: 'decimal' })}${field('due', t('due'), p.due, { type: 'date' })}${field('invoiceNo', t('invoiceNo'), p.invoiceNo || '', { ltr: true })}
    ${field('status', t('fStatus'), p.status, { type: 'select', options: Object.values(Office.PAY).map(v => [v, payStatusLabel(v)]) })}</div>${field('note', t('note'), p.note || '')}`);
  if (!r || !r.amount) return;
  if (p.id) r.id = p.id;
  const c = db.get('cases', r.caseId); r.client = c ? c.client : '';
  db.put('payments', r); toast(t('saved'));
}
