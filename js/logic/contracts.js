/* The engagement contract (הסכם התקשרות) of an event: built from the case, the client card, the quote and the company
   texts; what is still missing; the printable A4 document with the two signature boxes; the cover message.
   Pure functions; tested in tests/contracts.test.mjs. Fixed headings in three languages; the clauses come from
   settings / DEFAULTS (Hebrew) and she can edit them per contract. */
import Office from './office.js';
import { resolveLines, QUOTE_STATUS } from './quotes.js';
import { DEFAULTS } from '../data/defaults.js';
import { trim, str } from './core.js';

/* Multi-line texts (terms, signer) keep their line breaks; core.trim would fold them. */
const keep = v => String(v == null ? '' : v).trim();

export const CONTRACT_STATUS = { draft: 'draft', sent: 'sent', signed: 'signed' };

/* Fixed words of the document, per language of the contract. */
export const CT = {
  he: { title: 'הסכם התקשרות', between: 'בין', and: 'לבין', producer: 'המפיקה', client: 'הלקוח', regNo: 'ח.פ.', address: 'כתובת', phone: 'טלפון', email: 'דוא״ל', contact: 'איש קשר',
    date: 'תאריך', parties: 'הצדדים', event: 'האירוע', kind: 'סוג האירוע', eventDate: 'מועד', hours: 'שעות', place: 'מקום', people: 'משתתפים', scope: 'השירות כולל',
    price: 'התמורה', priceLine: 'התמורה עבור השירותים המפורטים בהסכם זה', beforeVat: 'לפני מע״מ', vat: 'מע״מ', gross: 'סה״כ לתשלום כולל מע״מ', priceOpen: 'התמורה תסוכם בכתב בין הצדדים לפני האירוע.',
    payment: 'תנאי תשלום', cancel: 'תנאי ביטול', extras: 'תנאים נוספים', general: 'כללי',
    generalText: 'הסכם זה נכנס לתוקף עם חתימת שני הצדדים. כל שינוי בהסכם ייעשה בכתב ובהסכמת שני הצדדים. הסכם זה ממצה את ההסכמות בין הצדדים לאירוע זה.',
    signatures: 'חתימות', signedName: 'שם החותם', signedAt: 'נחתם בתאריך', notSigned: 'טרם נחתם', ref: 'לפי הצעת מחיר', page: 'עמוד' },
  fr: { title: 'Contrat de prestation', between: 'Entre', and: 'et', producer: 'Le producteur', client: 'Le client', regNo: 'N° société', address: 'Adresse', phone: 'Téléphone', email: 'E-mail', contact: 'Contact',
    date: 'Date', parties: 'Les parties', event: 'L’événement', kind: 'Type d’événement', eventDate: 'Date', hours: 'Horaires', place: 'Lieu', people: 'Participants', scope: 'La prestation comprend',
    price: 'Le prix', priceLine: 'Le prix des prestations décrites dans ce contrat', beforeVat: 'HT', vat: 'TVA', gross: 'Total TTC', priceOpen: 'Le prix sera convenu par écrit entre les parties avant l’événement.',
    payment: 'Conditions de paiement', cancel: 'Conditions d’annulation', extras: 'Conditions supplémentaires', general: 'Généralités',
    generalText: 'Ce contrat entre en vigueur à la signature des deux parties. Toute modification se fera par écrit et d’un commun accord. Ce contrat constitue l’intégralité de l’accord entre les parties pour cet événement.',
    signatures: 'Signatures', signedName: 'Nom du signataire', signedAt: 'Signé le', notSigned: 'Non signé', ref: 'Selon devis', page: 'Page' },
  en: { title: 'Service agreement', between: 'Between', and: 'and', producer: 'The producer', client: 'The client', regNo: 'Reg. no.', address: 'Address', phone: 'Phone', email: 'E-mail', contact: 'Contact',
    date: 'Date', parties: 'The parties', event: 'The event', kind: 'Type of event', eventDate: 'Date', hours: 'Hours', place: 'Venue', people: 'Participants', scope: 'The service includes',
    price: 'The fee', priceLine: 'The fee for the services described in this agreement', beforeVat: 'before VAT', vat: 'VAT', gross: 'Total including VAT', priceOpen: 'The fee will be agreed in writing between the parties before the event.',
    payment: 'Payment terms', cancel: 'Cancellation terms', extras: 'Additional terms', general: 'General',
    generalText: 'This agreement takes effect when both parties have signed. Any change must be made in writing and agreed by both parties. This agreement is the entire agreement between the parties for this event.',
    signatures: 'Signatures', signedName: 'Name of signatory', signedAt: 'Signed on', notSigned: 'Not signed yet', ref: 'Per quotation', page: 'Page' }
};
export function contractLang(l) { return CT[l] ? l : 'he'; }

/** The company side, from settings with DEFAULTS behind. */
export function bizOf(settings) {
  const s = settings || {};
  const pick = k => keep(s[k]) || DEFAULTS[k] || '';
  return { name: pick('bizName'), legal: pick('bizLegal'), id: pick('bizId'), address: pick('bizAddress'), phone: pick('bizPhone'), email: pick('bizEmail'), signer: pick('signer') };
}

/** The quote the contract should price from: the accepted one, else the newest. */
export function pickQuote(quotes) {
  const list = (quotes || []).slice();
  const ok = list.filter(q => q.status === QUOTE_STATUS.accepted).sort((a, b) => str(b.created).localeCompare(str(a.created)));
  if (ok.length) return ok[0];
  return list.sort((a, b) => str(b.created).localeCompare(str(a.created)))[0] || null;
}
/** The quote's total before VAT (0 if nothing). */
export function quoteNet(quote) {
  if (!quote || !Array.isArray(quote.lines) || !quote.lines.length) return 0;
  return Office.quoteTotals(resolveLines(quote.lines, quote.defaultMargin), quote.vatRate).net;
}

/** The default contract record for a case (not saved). */
export function contractFromCase(caseRec, client, quote, settings, lang) {
  const c = caseRec || {}, cl = client || {}, s = settings || {};
  const L = contractLang(lang || c.lang || 'he');
  const net = quoteNet(quote);
  return {
    caseId: c.id || '', clientId: c.clientId || cl.id || '', lang: L, title: CT[L].title, date: Office.iso(new Date()),
    parties: {
      producer: bizOf(s),
      client: { name: trim(cl.name) || trim(c.client), legalName: trim(cl.legalName), taxId: trim(cl.taxId), address: trim(cl.address), email: trim(cl.email) || trim(c.email), phone: trim(cl.phone) || trim(c.phone), contact: trim(cl.contact) || trim(c.contact) }
    },
    eventLine: { kind: c.kind || '', date: Office.iso(c.date) || '', hours: c.hours || '', place: c.place || '', participants: str(c.participants) },
    scope: keep(s.includes) || DEFAULTS.includes, price: net || '', vatRate: Number.isFinite(+s.vat) && s.vat !== '' && s.vat != null ? +s.vat : 18,
    paymentTerms: keep(s.terms) || DEFAULTS.terms, cancellation: keep(s.cancelTerms) || DEFAULTS.cancelTerms, extras: '',
    quoteId: quote ? quote.id || '' : '', quoteNo: quote ? quote.no || '' : '',
    status: CONTRACT_STATUS.draft, sentAt: '', signedAt: '',
    signatures: { producer: '', producerSignedAt: '', client: '', clientName: '', clientSignedAt: '' }
  };
}

/** {net, vat, gross, vatRate}; net is NaN-safe (0 when the price is not a number). */
export function contractTotals(contract) {
  const c = contract || {};
  const net = Office.num(c.price); const n = Number.isFinite(net) ? net : 0;
  const rate = Number.isFinite(+c.vatRate) ? +c.vatRate : 18;
  const vat = Math.round(n * rate) / 100;
  return { net: n, vat, gross: Math.round((n + vat) * 100) / 100, vatRate: rate, hasPrice: Number.isFinite(net) && net > 0 };
}

/** What is still empty before the contract can go out: keys, in the order to fix them. */
export function missingForContract(contract) {
  const c = contract || {}; const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {};
  const out = [];
  if (!trim(cl.legalName)) out.push('clientLegalName');
  if (!trim(cl.taxId)) out.push('clientTaxId');
  if (!trim(cl.address)) out.push('clientAddress');
  if (!Office.day(ev.date)) out.push('date');
  if (!contractTotals(c).hasPrice) out.push('price');
  return out;
}

const e = s => str(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const para = s => e(keep(s)).replace(/\n/g, '<br>');
const ltr = s => '<span class="ltr">' + e(s) + '</span>';

/**
 * The printable contract: one A4 HTML page (print / PDF). opts: {logo: dataUrl, kindLabel(kind, lang)}.
 * Hebrew: dir=rtl on html and body. French / English: ltr, and every Hebrew clause keeps its own direction (unicode-bidi: plaintext).
 */
export function contractHtml(contract, opts) {
  opts = opts || {};
  const c = contract || {}; const L = contractLang(c.lang); const T = CT[L]; const rtl = L === 'he';
  const p = (c.parties && c.parties.producer) || bizOf({}); const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {}; const sg = c.signatures || {};
  const tot = contractTotals(c);
  const kind = opts.kindLabel ? opts.kindLabel(ev.kind, L) : ev.kind;
  const dir = rtl ? 'rtl' : 'ltr', align = rtl ? 'right' : 'left';
  const kv = rows => '<table class="kv">' + rows.filter(r => trim(r[1])).map(r => '<tr><td class="k">' + e(r[0]) + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>';
  const party = (label, name, rows) => '<div class="party"><div class="plabel">' + e(label) + '</div><div class="pname">' + e(name) + '</div>' + kv(rows) + '</div>';
  const producerRows = [[T.regNo, ltr(p.id)], [T.address, e(p.address)], [T.phone, ltr(p.phone)], [T.email, ltr(p.email)]];
  const clientRows = [[T.regNo, ltr(cl.taxId)], [T.address, e(cl.address)], [T.contact, e(cl.contact)], [T.phone, ltr(cl.phone)], [T.email, ltr(cl.email)]];
  const eventRows = [[T.kind, e(kind)], [T.eventDate, ltr(Office.fmt(ev.date))], [T.hours, ltr(ev.hours)], [T.place, e(ev.place)], [T.people, e(ev.participants)]];
  const priceHtml = tot.hasPrice
    ? '<p>' + e(T.priceLine) + ': <b>' + ltr(Office.money(tot.net)) + '</b> ' + e(T.beforeVat) + '. ' + e(T.vat) + ' ' + ltr(tot.vatRate + '%') + ': ' + ltr(Office.money(tot.vat)) + '. <b>' + e(T.gross) + ': ' + ltr(Office.money(tot.gross)) + '</b>.' + (trim(c.quoteNo) ? ' ' + e(T.ref) + ' ' + ltr(c.quoteNo) + '.' : '') + '</p>'
    : '<p>' + e(T.priceOpen) + '</p>';
  const sigBox = (label, png, name, when) => '<div class="sig"><div class="slabel">' + e(label) + '</div><div class="pad">' + (png ? '<img src="' + e(png) + '" alt="">' : '') + '</div>' +
    '<div class="sline">' + e(T.signedName) + ': ' + (trim(name) ? '<b>' + e(name) + '</b>' : '____________') + '</div>' +
    '<div class="sline">' + e(T.signedAt) + ': ' + (when ? ltr(Office.fmt(when) + (String(when).length > 10 ? ' ' + String(when).slice(11, 16) : '')) : '____________') + '</div></div>';
  const clauses = [];
  clauses.push({ h: T.parties, b: '<div class="parties">' + party(T.producer, p.legal || p.name, producerRows) + party(T.client, cl.legalName || cl.name, clientRows) + '</div>' });
  clauses.push({ h: T.event, b: kv(eventRows) });
  if (trim(c.scope)) clauses.push({ h: T.scope, b: '<p>' + para(c.scope) + '</p>' });
  clauses.push({ h: T.price, b: priceHtml });
  if (trim(c.paymentTerms)) clauses.push({ h: T.payment, b: '<p>' + para(c.paymentTerms) + '</p>' });
  if (trim(c.cancellation)) clauses.push({ h: T.cancel, b: '<p>' + para(c.cancellation) + '</p>' });
  if (trim(c.extras)) clauses.push({ h: T.extras, b: '<p>' + para(c.extras) + '</p>' });
  clauses.push({ h: T.general, b: '<p>' + e(T.generalText) + '</p>' });
  const body = clauses.map((x, i) => '<section class="cl"><h2><span class="n">' + (i + 1) + '.</span> ' + e(x.h) + '</h2>' + x.b + '</section>').join('');
  const footer = [p.legal || p.name, p.id ? T.regNo + ' ' + p.id : '', p.address, p.phone, p.email].filter(Boolean).join(' · ');
  return '<!DOCTYPE html><html dir="' + dir + '" lang="' + L + '"><head><meta charset="utf-8"><title>' + e(c.title || T.title) + '</title><style>' +
    '@page{size:A4;margin:16mm 16mm 22mm}' +
    'html,body{margin:0;padding:0;background:#fff}' +
    'body{font-family:Arial,"Noto Sans Hebrew",sans-serif;color:#17120F;font-size:12.5px;line-height:1.5;direction:' + dir + ';text-align:' + align + ';unicode-bidi:embed;padding:28px 28px 70px}' +
    '@media print{body{padding:0 0 24px}.foot{position:fixed;bottom:0;left:0;right:0}}' +
    '.top{border-bottom:3px solid #C4352A;padding-bottom:10px;margin-bottom:16px;display:flex;align-items:center;gap:16px}.top img{height:56px;width:auto}.biz{font-size:20px;font-weight:bold}.small{color:#6E6359;font-size:11px}' +
    'h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:14px 0 4px;border-bottom:1px solid #E2D8C8;padding-bottom:2px}h2 .n{display:inline-block;min-width:1.4em;direction:ltr;unicode-bidi:isolate}' +
    'p{margin:4px 0;unicode-bidi:plaintext;text-align:start;white-space:normal}' +
    'table.kv{border-collapse:collapse;margin:2px 0}table.kv td{padding:1px 8px 1px 0;vertical-align:top;border:0}html[dir=ltr] table.kv td{padding:1px 0 1px 8px}table.kv td.k{color:#6E6359;white-space:nowrap}' +
    '.parties{display:flex;gap:18px}.party{flex:1;border:1px solid #E2D8C8;border-radius:8px;padding:8px 10px}.plabel{font-size:11px;color:#6E6359}.pname{font-weight:bold;font-size:14px;margin-bottom:2px;unicode-bidi:plaintext}' +
    '.sigs{display:flex;gap:18px;margin-top:10px;page-break-inside:avoid}.sig{flex:1;border:1px solid #E2D8C8;border-radius:8px;padding:8px 10px}.slabel{font-weight:bold;margin-bottom:4px}.pad{height:80px;border-bottom:1px solid #17120F;display:flex;align-items:flex-end;justify-content:center}.pad img{max-height:76px;max-width:100%}.sline{font-size:11.5px;margin-top:4px}' +
    '.foot{border-top:1px solid #E2D8C8;color:#6E6359;font-size:10.5px;padding-top:6px;margin-top:24px;text-align:center}' +
    '.ltr{direction:ltr;display:inline-block;unicode-bidi:isolate}.cl{page-break-inside:avoid}' +
    '</style></head><body>' +
    '<div class="top">' + (opts.logo ? '<img src="' + e(opts.logo) + '" alt="">' : '') + '<div><div class="biz">' + e(p.name) + '</div><div class="small">' + e([p.legal, p.id ? T.regNo + ' ' + p.id : '', p.address].filter(Boolean).join(' · ')) +
    (p.phone || p.email ? ' · ' + ltr([p.phone, p.email].filter(Boolean).join(' · ')) : '') + '</div></div></div>' +
    '<h1>' + e(c.title || T.title) + '</h1><div class="small">' + e(T.date) + ' ' + ltr(Office.fmt(c.date) || Office.fmt(new Date())) + '</div>' +
    '<p class="small">' + e(T.between) + ' <b>' + e(p.legal || p.name) + '</b> ' + e(T.and) + ' <b>' + e(cl.legalName || cl.name || '________') + '</b></p>' +
    body +
    '<section class="cl"><h2><span class="n">' + (clauses.length + 1) + '.</span> ' + e(T.signatures) + '</h2><div class="sigs">' +
    sigBox(T.producer + ' · ' + (p.legal || p.name), sg.producer, (p.signer || '').split('\n')[0], sg.producerSignedAt) +
    sigBox(T.client + ' · ' + (cl.legalName || cl.name || ''), sg.client, sg.clientName, sg.clientSignedAt) + '</div></section>' +
    '<div class="foot">' + e(footer) + '</div></body></html>';
}

/** The short cover text for WhatsApp / mail, in the contract's language, in her voice. */
export function contractMessage(contract, caseRec, signer) {
  const c = contract || {}; const cs = caseRec || {}; const L = contractLang(c.lang); const cl = (c.parties && c.parties.client) || {};
  const n = trim(cl.contact || cs.contact || cl.name || cs.client).split(' ')[0];
  const ev = c.eventLine || {}; const when = ev.date ? Office.fmt(ev.date) : '';
  const tot = contractTotals(c);
  if (L === 'en') return 'Hi' + (n ? ' ' + n : '') + ',\nAttached is our service agreement for ' + (ev.kind || 'the event') + (when ? ' on ' + when : '') + (tot.hasPrice ? '. Fee before VAT: ' + Office.money(tot.net) : '') + '.\nPlease have a look and sign; happy to go over anything together.\n' + (signer || '');
  if (L === 'fr') return 'Bonjour' + (n ? ' ' + n : '') + ',\nVous trouverez ci-joint notre contrat pour ' + (ev.kind || 'l’événement') + (when ? ' du ' + when : '') + (tot.hasPrice ? '. Prix HT : ' + Office.money(tot.net) : '') + '.\nMerci de le relire et de le signer ; je reste disponible pour toute question.\n' + (signer || '');
  return 'היי היי' + (n ? ' ' + n : '') + ', מה שלומך?\nמצורף הסכם ההתקשרות ל' + (ev.kind || 'אירוע') + (when ? ' ב-' + when : '') + (tot.hasPrice ? '. התמורה לפני מע״מ: ' + Office.money(tot.net) : '') + '.\nאשמח שתעברו עליו ותחתמו, ואם יש שאלה אני כאן. תודה רבה!\n' + (signer || '');
}

export function contractSubject(contract) {
  const c = contract || {}; const L = contractLang(c.lang); const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {};
  return [c.title || CT[L].title, cl.name || cl.legalName, ev.date ? Office.fmt(ev.date) : ''].filter(Boolean).join(' · ');
}
export function contractFileName(contract) {
  const c = contract || {}; const cl = (c.parties && c.parties.client) || {}; const ev = c.eventLine || {};
  return ['contract', trim(cl.name || cl.legalName).replace(/[\\/:*?"<>|\s]+/g, '-'), ev.date || ''].filter(Boolean).join('-') + '.pdf';
}

/** The flat form values (the edit dialog) folded back into the record. Numbers stay numbers; empty price stays ''. */
export function applyForm(contract, form) {
  const c = contract || {}; const f = form || {};
  const price = Office.num(f.price); const vat = Office.num(f.vatRate);
  const L = contractLang(f.lang || c.lang); const fixed = Object.keys(CT).map(k => CT[k].title);
  const title = trim(f.title) && !fixed.includes(trim(f.title)) ? trim(f.title) : CT[L].title;
  return Object.assign({}, c, {
    lang: L, title, date: Office.iso(f.date) || c.date,
    parties: { producer: c.parties && c.parties.producer, client: Object.assign({}, (c.parties && c.parties.client) || {}, { name: trim(f.clientName), legalName: trim(f.clientLegalName), taxId: trim(f.clientTaxId), address: trim(f.clientAddress), contact: trim(f.clientContact), email: trim(f.clientEmail), phone: trim(f.clientPhone) }) },
    eventLine: { kind: trim(f.eventKind), date: Office.iso(f.eventDate) || '', hours: trim(f.eventHours), place: trim(f.eventPlace), participants: trim(f.eventParticipants) },
    price: Number.isFinite(price) ? price : '', vatRate: Number.isFinite(vat) ? vat : (c.vatRate == null ? 18 : c.vatRate),
    scope: keep(f.scope), paymentTerms: keep(f.paymentTerms), cancellation: keep(f.cancellation), extras: keep(f.extras)
  });
}
