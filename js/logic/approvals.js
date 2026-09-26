/* Client approvals: a change the client has to say yes to (more guests, a payment, an extra charge).
   She sends it, the client answers, she marks it; unanswered ones come back as reminders. Pure logic. */
import Office from './office.js';
import { trim, str } from './core.js';

export const APPROVAL = { draft: 'draft', sent: 'sent', approved: 'approved', declined: 'declined' };
export const APPROVAL_KINDS = ['participants', 'payment', 'extra', 'schedule', 'other'];
const KIND_L = {
  participants: { he: 'שינוי במספר המשתתפים', en: 'Change in the number of guests', fr: 'Changement du nombre de participants' },
  payment: { he: 'תשלום', en: 'Payment', fr: 'Paiement' },
  extra: { he: 'תוספת לתשלום', en: 'Additional charge', fr: 'Supplément' },
  schedule: { he: 'שינוי בלו״ז', en: 'Schedule change', fr: 'Changement de déroulé' },
  other: { he: 'אישור', en: 'Approval', fr: 'Validation' }
};
export function kindLabel(kind, lang) { const k = KIND_L[kind] || KIND_L.other; return k[lang] || k.he; }

const firstName = n => trim(n).split(' ')[0] || '';

/** The message asking the client to approve, in the client's language. The client answers "מאשר/ת" (or taps in the live page later). */
export function approvalMessage(a, cs, lang, signer) {
  const L = lang || 'he';
  const n = firstName(cs.contact || cs.client);
  const amount = Office.num(a.amount) ? Office.money(Office.num(a.amount)) : '';
  const T = {
    he: ['היי' + (n ? ' ' + n : '') + ',', 'לגבי ' + Office.eventLine(cs) + ':', kindLabel(a.kind, 'he') + (a.title ? ': ' + a.title : ''), a.details ? a.details : '', amount ? 'סכום: ' + amount + ' + מע״מ' : '', 'אשמח לאישור שלך בתשובה להודעה הזאת, כדי שאוכל להתקדם.'],
    en: ['Hi' + (n ? ' ' + n : '') + ',', 'Regarding ' + Office.eventLine(cs) + ':', kindLabel(a.kind, 'en') + (a.title ? ': ' + a.title : ''), a.details ? a.details : '', amount ? 'Amount: ' + amount + ' + VAT' : '', 'Please reply to this message with your approval so I can go ahead.'],
    fr: ['Bonjour' + (n ? ' ' + n : '') + ',', 'Concernant ' + Office.eventLine(cs) + ' :', kindLabel(a.kind, 'fr') + (a.title ? ' : ' + a.title : ''), a.details ? a.details : '', amount ? 'Montant : ' + amount + ' HT' : '', 'Merci de répondre à ce message pour valider, afin que je puisse avancer.']
  }[L] || [];
  return T.filter(Boolean).join('\n') + (signer ? '\n' + signer : '');
}
/** The reminder when the client did not answer. */
export function approvalReminder(a, cs, lang, signer, days) {
  const L = lang || 'he';
  const n = firstName(cs.contact || cs.client);
  const T = {
    he: 'היי' + (n ? ' ' + n : '') + ', תזכורת קטנה: מחכה לאישור שלך על ' + kindLabel(a.kind, 'he').toLowerCase() + (a.title ? ' (' + a.title + ')' : '') + (days ? ' מלפני ' + days + ' ימים' : '') + '. בלי האישור אני לא יכולה להתקדם. תודה.',
    en: 'Hi' + (n ? ' ' + n : '') + ', a small reminder: I am waiting for your approval on ' + kindLabel(a.kind, 'en').toLowerCase() + (a.title ? ' (' + a.title + ')' : '') + (days ? ' from ' + days + ' days ago' : '') + '. I cannot go ahead without it. Thank you.',
    fr: 'Bonjour' + (n ? ' ' + n : '') + ', petit rappel : j’attends votre validation pour ' + kindLabel(a.kind, 'fr').toLowerCase() + (a.title ? ' (' + a.title + ')' : '') + (days ? ' envoyée il y a ' + days + ' jours' : '') + '. Je ne peux pas avancer sans elle. Merci.'
  }[L];
  return T + (signer ? '\n' + signer : '');
}
/** Approvals that were sent and not answered for at least `days` days (default 2), oldest first. */
export function pendingApprovals(approvals, today, days) {
  const t = Office.day(today) || Office.day(new Date());
  const d = isNaN(Office.num(days)) ? 2 : Office.num(days);
  return (approvals || []).filter(a => a.status === APPROVAL.sent && a.sentAt).map(a => Object.assign({}, a, { waited: Office.daysBetween(a.sentAt, t) }))
    .filter(a => a.waited >= d).sort((a, b) => b.waited - a.waited);
}
/** "Payment sent, please send the invoice": the note to a supplier once she paid. */
export function supplierPaidMessage(sup, cs, amount, lang, signer) {
  const L = lang || 'he'; const n = firstName(sup.contact || sup.name);
  const T = {
    he: 'היי' + (n ? ' ' + n : '') + ', התשלום על ' + Office.eventLine(cs) + (amount ? ' (' + Office.money(amount) + ')' : '') + ' הועבר בהעברה בנקאית. אשמח לחשבונית מס / קבלה על שם באקה סאן בע״מ, ח.פ. 515000032. תודה!',
    en: 'Hi' + (n ? ' ' + n : '') + ', the payment for ' + Office.eventLine(cs) + (amount ? ' (' + Office.money(amount) + ')' : '') + ' was sent by bank transfer. Please send the invoice / receipt to Baka San Ltd, reg. 515000032. Thanks!',
    fr: 'Bonjour' + (n ? ' ' + n : '') + ', le paiement pour ' + Office.eventLine(cs) + (amount ? ' (' + Office.money(amount) + ')' : '') + ' a été effectué par virement. Merci d’envoyer la facture / le reçu au nom de Baka San Ltd, n° 515000032. Merci !'
  }[L];
  return T + (signer ? '\n' + signer : '');
}
