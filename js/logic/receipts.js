/* "צלם חשבונית": every receipt and invoice she photographs, filed by month, sent to the accountant at month end. Pure, tested. */
import Office from './office.js';
import { trim, str } from './core.js';

export function monthOf(date) { return String(Office.iso(date) || '').slice(0, 7); }
export function monthLabel(ym, lang) {
  const [y, m] = String(ym).split('-'); if (!y || !m) return ym;
  const he = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const names = lang === 'en' ? en : lang === 'fr' ? fr : he; return names[+m - 1] + ' ' + y;
}
/** The storage path of one receipt: org/month/id.jpg (or .pdf). */
export function receiptPath(orgId, r) { return orgId + '/' + (r.month || monthOf(r.date)) + '/' + r.id + (r.ext || '.jpg'); }
/** The receipts of one month, newest first. */
export function receiptsOf(list, ym) { return (list || []).filter(r => (r.month || monthOf(r.date)) === ym).sort((a, b) => str(b.date).localeCompare(str(a.date)) || str(b.created).localeCompare(str(a.created))); }
export function receiptsTotal(list) { return (list || []).reduce((a, r) => a + (Office.num(r.amount) || 0), 0); }
/** Months that have receipts or movements and were not sent yet, newest first. `sent` is the list of months already sent. */
export function monthsToSend(receipts, payments, links, sent, today) {
  const cur = monthOf(today || new Date()); const months = new Set();
  (receipts || []).forEach(r => months.add(r.month || monthOf(r.date)));
  (payments || []).forEach(p => { if (p.invoicedAt) months.add(monthOf(p.invoicedAt)); if (p.paidAt) months.add(monthOf(p.paidAt)); });
  (links || []).forEach(l => { if (l.paidAt) months.add(monthOf(l.paidAt)); });
  return [...months].filter(m => m && m < cur && !(sent || []).includes(m)).sort().reverse();
}
/** The mail to the accountant for a month: the report text plus the links to every photographed receipt. */
export function receiptsMailText(ym, receipts, links, reportText) {
  const parts = String(reportText || '').replace(/\n\nהחשבוניות מצורפות \/ בקישור\./, '').split('\n\n');
  if (receipts && receipts.length) {
    const block = ['חשבוניות וקבלות שצולמו (' + receipts.length + '):'].concat(receipts.map((r, i) => '• ' + [r.date ? Office.fmt(r.date) : '', r.supplier, r.amount ? Office.money(r.amount) : '', r.note].filter(Boolean).join(' · ') + (links && links[i] ? '\n  ' + links[i] : ''))).join('\n');
    parts.splice(1, 0, block);
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n');
}
/** "צלם חשבונית" / "צלמי קבלה" / "photo of an invoice" / "photo facture" → true */
export function isReceiptCommand(text) { return /^(?:צלם|צלמי|תצלמי|תצלם|לצלם|צילום|photo|take a photo|scan|scanne|prends?\s+(?:une\s+)?photo)\s*(?:of\s+)?(?:an?\s+|the\s+|une\s+|la\s+|של\s+|את\s+)?(?:ה)?(?:חשבונית|קבלה|receipt|invoice|facture|reçu)/i.test(trim(text)) || /^(?:חשבונית|קבלה)\s*(?:חדשה)?$/i.test(trim(text)); }
