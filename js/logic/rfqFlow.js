/* RFQ lifecycle: preparing/opening/copying a message is never evidence of sending it. */
import Office from './office.js';
import { templateFor } from './rfq.js';

export const RFQ_DRAFT = 'טיוטת בקשה';

export function validSpec(kind, spec) {
  if (kind === 'hotel' && spec.checkIn && spec.checkOut && spec.checkOut <= spec.checkIn) return false;
  return ['singles', 'doubles', 'participants', 'passengers'].every(k => !spec[k] || (Number.isInteger(Number(spec[k])) && Number(spec[k]) > 0));
}

export function validOffer(offer) {
  const fields = ['total', 'perPerson', 'venue', 'food', 'av'];
  const validAmounts = fields.every(k => offer[k] === '' || offer[k] == null || (Number.isFinite(Number(offer[k])) && Number(offer[k]) > 0));
  const hasContent = fields.some(k => Number(offer[k]) > 0) || ['text', 'included', 'cancellation', 'deposit', 'terms'].some(k => String(offer[k] || '').trim());
  return validAmounts && !!hasContent && ['ILS', 'EUR', 'USD'].includes(offer.currency) && Number.isFinite(Number(offer.vatPct)) && Number(offer.vatPct) >= 0 && Number(offer.vatPct) <= 100;
}

export function draftRequest(cs, supplier, kind, spec, replyBy, existing) {
  return {
    ...(existing || {}), caseId: cs.id, supplierId: supplier.id, supplier: supplier.name,
    kind, spec, replyBy, status: RFQ_DRAFT, askedAt: '', answeredAt: '',
    requestText: existing?.requestText || ''
  };
}

/** A patch only after her explicit confirmation; repeat sends never erase an answer or reset waiting age. */
export function sentRequest(link, channel, date, text, reminder = false) {
  return {
    id: link.id, channel, requestText: reminder ? link.requestText || '' : text,
    ...(reminder ? { reminderText: text, remindedAt: date } : { lastSentAt: date }),
    askedAt: link.askedAt || date,
    status: link.status === RFQ_DRAFT ? 'ביקשנו הצעה' : link.status
  };
}

export function comparisonKind(link, supplier) {
  return link.kind || templateFor(supplier?.type);
}

/** Pick an alternative for one service, leaving winners for other services untouched. */
export function chooseOffer(links, suppliers, id) {
  const picked = links.find(l => l.id === id);
  if (!picked || /בוטל/.test(picked.status || '') || !(picked.offer || Office.num(picked.cost))) return [];
  const byId = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const kind = comparisonKind(picked, byId[picked.supplierId]);
  return links.filter(l => l.id === id || (Office.yes(l.chosen) && comparisonKind(l, byId[l.supplierId]) === kind))
    .map(l => ({ id: l.id, chosen: l.id === id ? 'כן' : 'לא', status: l.id === id ? 'אושר' : 'הצעה התקבלה' }));
}

/** Decline only alternatives for services that actually have a chosen supplier. */
export function declineCandidates(links, suppliers) {
  const byId = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const chosen = new Set(links.filter(l => Office.yes(l.chosen) && !/בוטל/.test(l.status || '')).map(l => comparisonKind(l, byId[l.supplierId])));
  return links.filter(l => !Office.yes(l.chosen) && /ביקשנו|התקבלה/.test(l.status || '') && chosen.has(comparisonKind(l, byId[l.supplierId])));
}
