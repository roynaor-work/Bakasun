/* Money: what to collect from clients (overdue, soon, invoice to ask from Roy), and suppliers not yet paid. */
import { t } from '../i18n.js';
import { db, todayIso } from '../store.js';
import { esc, field, section, empty, dialog, toast, openWhatsApp } from '../ui.js';
import Office from '../logic/office.js';
import { payStatusLabel } from '../labels.js';
import { DEFAULTS } from '../data/defaults.js';

export function render({ root }) {
  const s = db.settings();
  const cases = db.list('cases'), payments = db.list('payments');
  const col = Office.collections(payments.map(p => Object.assign({}, p, { row: p.id })), cases, new Date());
  const supDue = Office.supplierDue(db.list('links').map(l => Object.assign({}, l, { row: l.id })), cases, db.list('suppliers'), new Date());
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
    ${supDue.length ? section(t('supplierPayments'), `<div class="list">${supDue.map(x => `<a class="card tap" href="#/case/${esc(x.caseId)}"><div class="row between"><span class="title">${esc(x.supplier)}</span><span class="ltr big">${esc(Office.money(x.amount))}</span></div><div class="sub">${esc(x.client)} · ${esc(x.date)}</div></a>`).join('')}</div>`) : ''}`;

  root.querySelector('#new').onclick = () => editPayment(null);
  root.querySelectorAll('.card[data-id]').forEach(el => {
    const p = db.get('payments', el.dataset.id); const cs = db.get('cases', p.caseId) || {}; const client = db.get('clients', cs.clientId) || {};
    el.querySelector('[data-status]').onchange = e => db.put('payments', { id: p.id, status: e.target.value, paidAt: e.target.value === Office.PAY.paid ? todayIso() : p.paidAt });
    el.querySelector('[data-edit]').onclick = () => editPayment(p);
    el.querySelector('[data-remind]').onclick = async () => {
      const r = await dialog(t('remind'), `<textarea name="text" rows="6">${esc(Office.paymentReminder(p, cs, cs.contact) + (s.signer ? '\n' + s.signer : ''))}</textarea>`, { ok: t('whatsapp') });
      if (r) openWhatsApp(cs.phone, r.text);
    };
    const inv = el.querySelector('[data-invoice]'); if (inv) inv.onclick = async () => {
      if (!s.invoiceTo) { toast(t('noInvoicePhone'), 3500); return; }
      const m = Office.invoiceRequest(p, cs, client, s.signer || DEFAULTS.signer);
      const r = await dialog(t('askInvoice'), `<textarea name="text" rows="12">${esc(m.text)}</textarea>`, { ok: t('whatsapp') });
      if (r && openWhatsApp(s.invoiceTo, r.text)) db.put('payments', { id: p.id, status: Office.PAY.invoiceAsked });
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
