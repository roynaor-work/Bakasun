/* Need number three: money both ways. Client side: invoices from Roy and collection (Office.collections). Supplier side:
   paid → invoice missing → invoice received. And the month for the accountant: what went out, what came in. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

export const SUP_INVOICE = { missing: 'חסרה', received: 'התקבלה' };

/** Suppliers we paid at least `days` days ago (default 3) and still have no tax invoice from. Oldest first. */
export function supplierInvoicesMissing(links, cases, sups, today, days) {
  const t = Office.day(today) || Office.day(new Date()); const d = isNaN(Office.num(days)) ? 3 : Office.num(days);
  const byId = {}; (cases || []).forEach(c => { byId[c.id] = c; }); const supById = {}; (sups || []).forEach(s => { supById[s.id] = s; });
  return (links || []).filter(l => Office.yes(l.paid) && l.paidAt && l.supInvoice !== SUP_INVOICE.received && Office.num(l.cost))
    .map(l => Object.assign({}, l, { waited: Office.daysBetween(l.paidAt, t), cs: byId[l.caseId] || {}, sup: supById[l.supplierId] || { name: l.supplier } }))
    .filter(l => l.waited >= d).sort((a, b) => b.waited - a.waited);
}

/** The reminder to a supplier who has not sent the invoice yet. */
export function supplierInvoiceReminder(sup, cs, amount, lang, signer) {
  const n = trim(sup.contact || sup.name).split(' ')[0]; const L = lang || 'he';
  const ev = cs ? [cs.kind, cs.date ? Office.fmt(cs.date) : ''].filter(Boolean).join(' · ') : '';
  const T = {
    he: 'היי' + (n ? ' ' + n : '') + ', התשלום' + (ev ? ' על ' + ev : '') + (amount ? ' (' + Office.money(amount) + ')' : '') + ' הועבר ועדיין לא קיבלתי חשבונית מס. אשמח שתשלחו על שם באקה סאן בע״מ, ח.פ. 515000032. תודה רבה!',
    en: 'Hi' + (n ? ' ' + n : '') + ', the payment' + (ev ? ' for ' + ev : '') + (amount ? ' (' + Office.money(amount) + ')' : '') + ' was sent and I have not received the tax invoice yet. Please send it to Baka San Ltd, reg. 515000032. Thank you!',
    fr: 'Bonjour' + (n ? ' ' + n : '') + ', le paiement' + (ev ? ' pour ' + ev : '') + (amount ? ' (' + Office.money(amount) + ')' : '') + ' a été effectué et je n’ai pas encore reçu la facture. Merci de l’envoyer au nom de Baka San Ltd, n° 515000032. Merci !'
  };
  return (T[L] || T.he) + (signer ? '\n' + signer : '');
}

/** One month, both directions. ym = 'YYYY-MM'. */
export function monthReport(payments, links, cases, sups, ym) {
  const inMonth = d => d && String(Office.iso(d) || '').slice(0, 7) === ym;
  const byId = {}; (cases || []).forEach(c => { byId[c.id] = c; }); const supById = {}; (sups || []).forEach(s => { supById[s.id] = s; });
  const clientRows = (payments || []).filter(p => Office.num(p.amount) && (inMonth(p.invoicedAt) || inMonth(p.paidAt) || (!p.invoicedAt && !p.paidAt && (p.status === Office.PAY.paid || p.status === Office.PAY.invoiced) && inMonth(p.updated))))
    .map(p => { const c = byId[p.caseId] || {}; return { date: Office.fmt(p.paidAt || p.invoicedAt || p.updated), client: c.client || p.client || '', event: [c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · '), amount: Office.num(p.amount), invoiceNo: str(p.invoiceNo), status: p.status, note: str(p.note) }; });
  const supplierRows = (links || []).filter(l => Office.yes(l.paid) && Office.num(l.cost) && inMonth(l.paidAt))
    .map(l => { const c = byId[l.caseId] || {}; const s = supById[l.supplierId] || { name: l.supplier }; return { date: Office.fmt(l.paidAt), supplier: s.name || '', client: c.client || '', event: [c.kind, c.date ? Office.fmt(c.date) : ''].filter(Boolean).join(' · '), amount: Office.num(l.cost), invoice: l.supInvoice === SUP_INVOICE.received ? (l.supInvoiceNo ? str(l.supInvoiceNo) : 'התקבלה') : 'חסרה', note: str(l.note) }; });
  const sum = rows => rows.reduce((a, r) => a + (r.amount || 0), 0);
  return { ym, clientRows, supplierRows, totalIn: sum(clientRows), totalOut: sum(supplierRows), missing: supplierRows.filter(r => r.invoice === 'חסרה').length };
}

/** The month as CSV (Excel opens it, Hebrew safe with the BOM). */
export function monthCsv(rep) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['סוג', 'תאריך', 'לקוח / ספק', 'אירוע', 'סכום לפני מע״מ', 'חשבונית', 'סטטוס', 'הערה'].map(q).join(',')];
  rep.clientRows.forEach(r => lines.push(['הכנסה', r.date, r.client, r.event, r.amount, r.invoiceNo, r.status, r.note].map(q).join(',')));
  rep.supplierRows.forEach(r => lines.push(['הוצאה', r.date, r.supplier, r.client + (r.event ? ' · ' + r.event : ''), r.amount, r.invoice, Office.yes(r.invoice !== 'חסרה' ? 'כן' : 'לא') ? 'חשבונית התקבלה' : 'חסרה חשבונית', r.note].map(q).join(',')));
  lines.push(['', '', '', 'סה״כ הכנסות', rep.totalIn, '', '', ''].map(q).join(','));
  lines.push(['', '', '', 'סה״כ הוצאות', rep.totalOut, '', '', ''].map(q).join(','));
  return '﻿' + lines.join('\r\n');
}

/** The mail to the accountant: what happened this month, what is still missing. */
export function monthText(rep, signer) {
  const [y, m] = rep.ym.split('-'); const title = m + '/' + y;
  const lines = ['שלום,', '', 'סיכום ' + title + ' של באקה סאן בע״מ (515000032):', ''];
  lines.push('הכנסות (' + rep.clientRows.length + '):');
  rep.clientRows.forEach(r => lines.push('• ' + r.date + ' · ' + r.client + (r.event ? ' · ' + r.event : '') + ' · ' + Office.money(r.amount) + (r.invoiceNo ? ' · חשבונית ' + r.invoiceNo : '') + ' · ' + r.status));
  if (!rep.clientRows.length) lines.push('• אין');
  lines.push('סה״כ הכנסות לפני מע״מ: ' + Office.money(rep.totalIn), '');
  lines.push('הוצאות לספקים (' + rep.supplierRows.length + '):');
  rep.supplierRows.forEach(r => lines.push('• ' + r.date + ' · ' + r.supplier + ' · ' + r.client + ' · ' + Office.money(r.amount) + ' · חשבונית: ' + r.invoice));
  if (!rep.supplierRows.length) lines.push('• אין');
  lines.push('סה״כ הוצאות לפני מע״מ: ' + Office.money(rep.totalOut));
  if (rep.missing) lines.push('', 'חסרות עדיין ' + rep.missing + ' חשבוניות מספקים. אשלח כשיגיעו.');
  lines.push('', 'החשבוניות מצורפות / בקישור.', '', 'תודה,', signer || 'וירג׳יני');
  return { subject: 'באקה סאן · סיכום ' + title + ' לרואה החשבון', text: lines.join('\n') };
}
