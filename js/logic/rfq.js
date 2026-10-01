/* Need number one: one request to several suppliers from a template, follow-up on who did not answer, and a comparison
   of the offers that came in. Pure logic, tested. The wording follows Virginie's own style from her mail: warm, short,
   one line per point, no typos. She writes to suppliers in the client's name ("שמי וירג׳יני מארגון שוב״ל"). */
import Office from './office.js';
import { trim, str } from './core.js';

/** Which template a supplier type gets. */
export function templateFor(type) {
  const t = str(type);
  if (/מלו[נן]|hotel|hôtel/i.test(t)) return 'hotel';
  if (/מקום|אולם/.test(t)) return 'venue';
  if (/קייטרינג|מסעד|בר /.test(t)) return 'food';
  if (/הסע/.test(t)) return 'transport';
  if (/דפוס|מיתוג/.test(t)) return 'print';
  if (/פעילות|סיור|מדריכ|תקליט|להק|צילום/.test(t)) return 'activity';
  return 'other';
}

/** The fields of each template: [name, label {he,en,fr}, kind, options?]. The screen draws them; the text uses them. */
export const TEMPLATES = {
  hotel: [
    ['checkIn', { he: 'כניסה', en: 'Check-in', fr: 'Arrivée' }, 'date'], ['checkOut', { he: 'יציאה', en: 'Check-out', fr: 'Départ' }, 'date'],
    ['singles', { he: 'חדרי סינגל', en: 'Single rooms', fr: 'Chambres single' }, 'number'], ['doubles', { he: 'חדרים זוגיים', en: 'Double rooms', fr: 'Chambres doubles' }, 'number'],
    ['board', { he: 'בסיס אירוח', en: 'Board', fr: 'Pension' }, 'select', [['לינה וארוחת בוקר', 'B&B', 'Petit-déjeuner'], ['חצי פנסיון', 'Half board', 'Demi-pension'], ['פנסיון מלא', 'Full board', 'Pension complète']]],
    ['meeting', { he: 'חדר ישיבות / אולם', en: 'Meeting room', fr: 'Salle de réunion' }, 'text'], ['av', { he: 'מסך ומקרן', en: 'Screen and projector', fr: 'Écran et projecteur' }, 'yesno'],
    ['splits', { he: 'פיצולים (חלק מגיעים אחר כך)', en: 'Split arrivals', fr: 'Arrivées échelonnées' }, 'text'], ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  venue: [
    ['date', { he: 'תאריך', en: 'Date', fr: 'Date' }, 'date'], ['hours', { he: 'שעות', en: 'Hours', fr: 'Horaires' }, 'text'], ['participants', { he: 'משתתפים', en: 'Guests', fr: 'Participants' }, 'number'],
    ['hall', { he: 'אולם / חלל', en: 'Hall', fr: 'Salle' }, 'text'], ['food', { he: 'אוכל', en: 'Food', fr: 'Repas' }, 'text'], ['av', { he: 'הגברה ומסך (בנפרד)', en: 'Sound and screen (separately)', fr: 'Sono et écran (séparément)' }, 'yesno'],
    ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  food: [
    ['date', { he: 'תאריך', en: 'Date', fr: 'Date' }, 'date'], ['hours', { he: 'שעות', en: 'Hours', fr: 'Horaires' }, 'text'], ['participants', { he: 'סועדים', en: 'Diners', fr: 'Convives' }, 'number'],
    ['meals', { he: 'ארוחות', en: 'Meals', fr: 'Repas' }, 'text'], ['style', { he: 'סגנון (בופה / מוגש / כיבוד)', en: 'Style', fr: 'Style' }, 'text'], ['diet', { he: 'כשרות ומגבלות', en: 'Kosher and diets', fr: 'Casher et régimes' }, 'text'],
    ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  transport: [
    ['date', { he: 'תאריך', en: 'Date', fr: 'Date' }, 'date'], ['from', { he: 'מאיפה', en: 'From', fr: 'De' }, 'text'], ['to', { he: 'לאן', en: 'To', fr: 'À' }, 'text'],
    ['times', { he: 'שעות (יציאה, חזרה)', en: 'Times (out, back)', fr: 'Horaires (départ, retour)' }, 'text'], ['passengers', { he: 'נוסעים', en: 'Passengers', fr: 'Passagers' }, 'number'], ['buses', { he: 'אוטובוסים / מיניבוסים', en: 'Buses / minibuses', fr: 'Bus / minibus' }, 'text'],
    ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  print: [
    ['items', { he: 'פריטים וכמויות (שורה לכל פריט)', en: 'Items and quantities (one per line)', fr: 'Articles et quantités (un par ligne)' }, 'textarea'], ['sizes', { he: 'מידות', en: 'Sizes', fr: 'Formats' }, 'text'],
    ['due', { he: 'מוכן עד', en: 'Ready by', fr: 'Prêt pour le' }, 'date'], ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  activity: [
    ['date', { he: 'תאריך', en: 'Date', fr: 'Date' }, 'date'], ['hours', { he: 'שעות', en: 'Hours', fr: 'Horaires' }, 'text'], ['participants', { he: 'משתתפים', en: 'Participants', fr: 'Participants' }, 'number'],
    ['lang', { he: 'שפה', en: 'Language', fr: 'Langue' }, 'text'], ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ],
  other: [
    ['date', { he: 'תאריך', en: 'Date', fr: 'Date' }, 'date'], ['what', { he: 'מה צריך', en: 'What we need', fr: 'Ce qu’il faut' }, 'textarea'], ['notes', { he: 'עוד', en: 'More', fr: 'Autre' }, 'textarea']
  ]
};

const YES = { he: 'כן', en: 'yes', fr: 'oui' };
const firstName = n => trim(n).split(' ')[0] || '';

/** The lines of the request body, from the spec, in the supplier's language. */
export function specLines(kind, spec, lang) {
  const L = lang || 'he'; const s = spec || {}; const out = [];
  (TEMPLATES[kind] || TEMPLATES.other).forEach(([name, label, type, options]) => {
    let v = type === 'textarea' ? String(s[name] == null ? '' : s[name]).trim() : trim(s[name]); if (!v) return;
    if (type === 'yesno') v = /^(כן|yes|oui|true|on|1)$/i.test(v) ? YES[L] : '';
    if (!v) return;
    if (type === 'date') v = Office.fmt(v);
    if (type === 'select' && options) { const o = options.find(x => x[0] === v); if (o) v = L === 'en' ? o[1] : L === 'fr' ? o[2] : o[0]; }
    if (type === 'textarea' && name === 'items') { out.push(label[L] + ':'); v.split('\n').map(trim).filter(Boolean).forEach(x => out.push('• ' + x)); return; }
    out.push(label[L] + ': ' + v);
  });
  if (kind === 'hotel' && s.checkIn && s.checkOut) { const n = Office.daysBetween(s.checkIn, s.checkOut); if (n > 0) out.splice(2, 0, { he: 'לילות', en: 'Nights', fr: 'Nuits' }[L] + ': ' + n); }
  return out;
}

/**
 * The request itself. opts: {asClient (default true), firstContact, replyBy, phone, name}.
 * Hebrew in her voice; English and French for foreign suppliers.
 */
export function rfqText(cs, sup, kind, spec, opts) {
  opts = opts || {};
  const L = (sup && sup.lang) || 'he';
  const n = firstName(sup && (sup.contact || sup.name));
  const who = opts.name || (L === 'he' ? 'וירג׳יני' : 'Virginie');
  const org = opts.asClient !== false && cs && cs.client ? cs.client : 'באקה סאן';
  const lines = specLines(kind, spec, L);
  const event = cs && (cs.kind || cs.client) ? (L === 'he' ? (cs.kind || 'אירוע') + (cs.participants ? ' ל-' + cs.participants + ' משתתפים' : '') : (cs.kind || 'event') + (cs.participants ? ' for ' + cs.participants : '')) : '';
  const phone = opts.phone || '054-4974644';
  if (L === 'en') {
    return ['Hi' + (n ? ' ' + n : '') + ', hope you are doing well!', opts.firstContact ? 'My name is ' + who + ', I am organizing on behalf of ' + org + '.' : '',
      event ? 'We are planning a ' + event + (opts.asClient === false ? '' : ' for ' + org) + ':' : '', ...lines.map(l => '• ' + l),
      'Could you please send availability and a quote' + (opts.replyBy ? ' by ' + Office.fmt(opts.replyBy) : '') + '? Please list venue, food and equipment separately, with cancellation and payment terms.',
      'Thank you so much!', who + ' ' + phone].filter(Boolean).join('\n');
  }
  if (L === 'fr') {
    return ['Bonjour' + (n ? ' ' + n : '') + ', j’espère que vous allez bien !', opts.firstContact ? 'Je suis ' + who + ', j’organise pour ' + org + '.' : '',
      event ? 'Nous préparons : ' + event + ' :' : '', ...lines.map(l => '• ' + l),
      'Pourriez-vous m’envoyer vos disponibilités et un devis' + (opts.replyBy ? ' avant le ' + Office.fmt(opts.replyBy) : '') + ' ? Merci de séparer lieu, repas et matériel, avec les conditions d’annulation et de paiement.',
      'Merci beaucoup !', who + ' ' + phone].filter(Boolean).join('\n');
  }
  return ['היי היי' + (n ? ' ' + n : '') + ', מה שלומך?', opts.firstContact ? 'נעים מאוד, שמי ' + who + ' מ' + org + '.' : '',
    event ? 'אנחנו מארגנים ' + event + (opts.asClient === false && cs.client ? ' עבור ' + cs.client : '') + ':' : '', ...lines.map(l => '• ' + l),
    'אשמח לבדוק זמינות ולקבל הצעת מחיר' + (opts.replyBy ? ' עד ' + Office.fmt(opts.replyBy) : '') + '. בבקשה להפריד מקום, אוכל וציוד, ולציין מדיניות ביטול ותנאי תשלום.',
    'תודה רבה!', who + ' ' + phone].filter(Boolean).join('\n');
}

/** The e-mail subject. */
export function rfqSubject(cs, kind, lang) {
  const L = lang || 'he';
  const d = cs && cs.date ? Office.fmt(cs.date) : '';
  const base = L === 'en' ? 'Availability and quote' : L === 'fr' ? 'Disponibilité et devis' : 'בקשת הצעת מחיר וזמינות';
  return base + (cs && cs.kind ? ' · ' + cs.kind : '') + (d ? ' · ' + d : '') + (cs && cs.client ? ' · ' + cs.client : '');
}

/** "It is quite urgent": the reminder after a day with no answer, in her words. */
export function rfqReminder(cs, sup, days, opts) {
  opts = opts || {}; const L = (sup && sup.lang) || 'he'; const n = firstName(sup && (sup.contact || sup.name)); const who = opts.name || (L === 'he' ? 'וירג׳יני' : 'Virginie');
  const ev = cs ? [cs.kind, cs.date ? Office.fmt(cs.date) : ''].filter(Boolean).join(' · ') : '';
  if (L === 'en') return 'Hi' + (n ? ' ' + n : '') + ', just following up on my request' + (ev ? ' for ' + ev : '') + (days ? ' from ' + days + (days === 1 ? ' day' : ' days') + ' ago' : '') + '. It is quite urgent, I would love to close this today. Thank you!\n' + who;
  if (L === 'fr') return 'Bonjour' + (n ? ' ' + n : '') + ', je reviens vers vous pour ma demande' + (ev ? ' (' + ev + ')' : '') + '. C’est assez urgent, j’aimerais conclure aujourd’hui. Merci !\n' + who;
  return 'היי' + (n ? ' ' + n : '') + ', מזכירה לגבי הבקשה ששלחתי' + (ev ? ' על ' + ev : '') + (days ? ' לפני ' + (days === 1 ? 'יום' : days + ' ימים') : '') + '. זה די דחוף, אשמח שתחזרו אליי היום. תודה רבה!\n' + who;
}

/** "We closed elsewhere": the polite no to the suppliers not chosen. */
export function rfqDecline(cs, sup, opts) {
  opts = opts || {}; const L = (sup && sup.lang) || 'he'; const n = firstName(sup && (sup.contact || sup.name)); const who = opts.name || (L === 'he' ? 'וירג׳יני' : 'Virginie');
  if (L === 'en') return 'Hi' + (n ? ' ' + n : '') + ', thank you very much for the offer. This time we went with another option, but I would be happy to work together on the next one. Thanks again!\n' + who;
  if (L === 'fr') return 'Bonjour' + (n ? ' ' + n : '') + ', merci beaucoup pour votre offre. Cette fois nous avons choisi une autre option, mais je serai ravie de travailler ensemble une prochaine fois. Merci !\n' + who;
  return 'היי' + (n ? ' ' + n : '') + ', תודה רבה על ההצעה. הפעם סגרנו במקום אחר, אבל אשמח לעבוד יחד בהמשך. תודה!\n' + who;
}

/** Requests sent and not answered for at least `days` days (default 1), oldest first. */
export function pendingRequests(links, cases, sups, today, days) {
  const t = Office.day(today) || Office.day(new Date()); const d = isNaN(Office.num(days)) ? 1 : Office.num(days);
  const byId = {}; (cases || []).forEach(c => { byId[c.id] = c; }); const supById = {}; (sups || []).forEach(s => { supById[s.id] = s; });
  return (links || []).filter(l => /ביקשנו/.test(str(l.status)) && l.askedAt && !l.answeredAt).map(l => Object.assign({}, l, { waited: Office.daysBetween(l.askedAt, t), cs: byId[l.caseId] || {}, sup: supById[l.supplierId] || { name: l.supplier } }))
    .filter(l => l.waited >= d && Office.ACTIVE.indexOf(l.cs.status) >= 0 || (l.waited >= d && !l.cs.status)).sort((a, b) => b.waited - a.waited);
}

/** Reads an offer the supplier wrote (mail or WhatsApp) into the fields she compares. Amounts are before VAT unless the text says otherwise. */
export function parseOffer(text) {
  const t = str(text); const o = { total: '', perPerson: '', venue: '', food: '', av: '', included: '', cancellation: '', deposit: '', terms: '', text: t };
  const money = s => { const m = /(\d{1,3}(?:[,.]\d{3})+|\d+)(?:\.\d+)?\s*(?:₪|ש["״]?ח|שח|nis|ils)?/i.exec(s || ''); return m ? Office.num(m[1]) : ''; };
  const line = re => { const m = re.exec(t); return m ? trim(m[0]) : ''; };
  const after = re => { const m = re.exec(t); return m ? money(m[1]) : ''; };
  o.total = after(/(?:סה["״]?כ|סך הכל|total)[^\d]{0,20}([\d,.]+)/i) || '';
  o.perPerson = after(/([\d,.]+)\s*(?:₪|ש["״]?ח|שח)?\s*(?:ל|per\s+)(?:אדם|משתתף|סועד|איש|person|pax|head)/i) || after(/(?:לאדם|למשתתף|לסועד|per person)[^\d]{0,12}([\d,.]+)/i) || '';
  o.venue = after(/(?:אולם|מקום|חדר ישיבות|venue|hall|room rental)[^\d]{0,25}([\d,.]+)/i) || '';
  o.food = after(/(?:אוכל|כיבוד|ארוחה|ארוחות|קייטרינג|food|catering|lunch|dinner)[^\d]{0,25}([\d,.]+)/i) || '';
  o.av = after(/(?:הגברה|מסך|מקרן|ציוד|av|sound|projector)[^\d]{0,25}([\d,.]+)/i) || '';
  o.cancellation = line(/(?:ביטול|מדיניות ביטול|cancellation)[^\n]{0,140}/i);
  o.deposit = line(/(?:מקדמה|deposit)[^\n]{0,80}/i);
  o.terms = line(/(?:שוטף\s*\+?\s*\d+|תנאי תשלום|payment terms|net\s*\d+)[^\n]{0,80}/i);
  o.included = line(/(?:כולל|כלול|includes?|included)[^\n]{0,120}/i);
  if (!o.total) { const parts = [o.venue, o.food, o.av].map(Office.num).filter(Boolean); if (parts.length > 1) o.total = parts.reduce((a, b) => a + b, 0); }
  // "including VAT" / TTC / incl. VAT: the amounts are gross; "+ VAT" / HT / before VAT: net. Unknown = net (the market habit in B2B).
  o.incl = /(?:כולל\s+מע["״]?מ|מע["״]?מ\s+כלול|incl(?:\.|uding|usive)?\s*(?:of\s+)?vat|vat\s+incl|\bTTC\b|toutes?\s+taxes?\s+comprises?|tva\s+(?:incluse|comprise))/i.test(t) && !/(?:\+\s*מע["״]?מ|לפני\s+מע["״]?מ|לא\s+כולל\s+מע["״]?מ|plus\s+vat|\+\s*vat|before\s+vat|excl(?:\.|uding)?\s+vat|\bHT\b|hors\s+taxes?)/i.test(t);
  o.currency = /€|\beur(?:os?)?\b/i.test(t) ? 'EUR' : /\$|\busd\b|dollars?/i.test(t) ? 'USD' : 'ILS';
  return o;
}
/** The net amount for the comparison: a gross ("including VAT") offer is divided by 1 + vat%. */
export function netOf(amount, incl, vatPct) { const n = Office.num(amount) || 0; return incl && n ? Math.round(n / (1 + (Office.num(vatPct) || 18) / 100)) : n; }
export const CURRENCY = { ILS: '₪', EUR: '€', USD: '$' };

/** The comparison rows, cheapest first; suppliers without an offer at the end. */
export function compareRows(links, sups, participants, vatPct) {
  const supById = {}; (sups || []).forEach(s => { supById[s.id] = s; });
  const p = Office.num(participants) || 0;
  return (links || []).filter(l => !/בוטל/.test(str(l.status))).map(l => {
    const o = l.offer || {}; const sp = supById[l.supplierId] || { name: l.supplier };
    const incl = !!o.incl, cur = o.currency || 'ILS';
    const total = netOf(Office.num(o.total) || Office.num(l.cost) || 0, incl, vatPct);
    const per = netOf(Office.num(o.perPerson), incl, vatPct) || (total && p ? Math.round(total / p) : 0);
    return { id: l.id, supplier: sp.name || '', type: sp.type || '', status: l.status, chosen: Office.yes(l.chosen), total, perPerson: per, venue: netOf(o.venue, incl, vatPct), food: netOf(o.food, incl, vatPct), av: netOf(o.av, incl, vatPct), incl, currency: cur,
      included: str(o.included), cancellation: str(o.cancellation), deposit: str(o.deposit), terms: str(o.terms), note: str(o.note || l.note), verdict: str(o.verdict), hasOffer: !!(total || o.text) };
  }).sort((a, b) => (b.hasOffer - a.hasOffer) || (a.total || Infinity) - (b.total || Infinity) || a.supplier.localeCompare(b.supplier, 'he'));
}

export const LABELS = {
  he: { title: 'השוואת הצעות', fromGross: '(הומר מכולל מע״מ)', supplier: 'ספק', total: 'סה״כ לפני מע״מ', per: 'למשתתף', venue: 'מקום', food: 'אוכל', av: 'ציוד', included: 'כלול', cancellation: 'ביטול', deposit: 'מקדמה', terms: 'תשלום', note: 'הערה', none: 'טרם התקבלה הצעה', chosen: 'נבחר' },
  en: { title: 'Offers comparison', fromGross: '(converted from incl. VAT)', supplier: 'Supplier', total: 'Total before VAT', per: 'Per person', venue: 'Venue', food: 'Food', av: 'Equipment', included: 'Included', cancellation: 'Cancellation', deposit: 'Deposit', terms: 'Payment', note: 'Note', none: 'No offer yet', chosen: 'Chosen' },
  fr: { title: 'Comparatif des offres', fromGross: '(converti du TTC)', supplier: 'Fournisseur', total: 'Total HT', per: 'Par personne', venue: 'Lieu', food: 'Repas', av: 'Matériel', included: 'Inclus', cancellation: 'Annulation', deposit: 'Acompte', terms: 'Paiement', note: 'Note', none: 'Pas encore d’offre', chosen: 'Retenu' }
};
/** A standalone page with the table, to share with the client. Verdicts and internal notes stay out unless `internal`. */
export function compareHtml(cs, rows, lang, internal) {
  const L = LABELS[lang] ? lang : 'he'; const S = LABELS[L]; const rtl = L === 'he';
  const e = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = v => v ? Office.money(v) : '';
  const cols = ['supplier', 'total', 'per', 'venue', 'food', 'av', 'included', 'cancellation', 'deposit', 'terms'].concat(internal ? ['note'] : []);
  const money = (r, n) => (r.currency && r.currency !== 'ILS' ? (n ? Number(n).toLocaleString('en-US') + ' ' + (CURRENCY[r.currency] || r.currency) : '') : m(n));
  const cell = (r, c) => c === 'supplier' ? e(r.supplier) + (r.chosen ? ' ★' : '') + (r.incl ? ' <small>' + e(S.fromGross) + '</small>' : '') + (r.currency && r.currency !== 'ILS' ? ' <small>' + e(r.currency) + '</small>' : '') : c === 'total' ? (r.hasOffer ? money(r, r.total) : '<i>' + e(S.none) + '</i>') : c === 'per' ? m(r.perPerson) : c === 'venue' ? m(r.venue) : c === 'food' ? m(r.food) : c === 'av' ? m(r.av) : c === 'note' ? e([r.verdict, r.note].filter(Boolean).join(' · ')) : e(r[c]);
  const ev = cs ? [cs.client, cs.kind, cs.date ? Office.fmt(cs.date) : '', cs.participants ? cs.participants + (rtl ? ' משתתפים' : ' pax') : ''].filter(Boolean).join(' · ') : '';
  return `<!DOCTYPE html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(S.title)} · ${e(cs && cs.client)}</title>
<style>body{margin:0;padding:16px;background:#EFE8DC;color:#12100F;font-family:Assistant,'Noto Sans Hebrew','Segoe UI',Arial,sans-serif;font-size:14px;direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'};unicode-bidi:embed}h1{font-size:20px;margin:0 0 4px}.sub{color:#6E645A;margin:0 0 12px}
table{border-collapse:collapse;background:#FBF8F2;width:100%}th,td{border:1px solid #DED3C2;padding:6px 8px;vertical-align:top;text-align:start}th{background:#12100F;color:#EFE8DC;font-weight:700}tr.chosen td{background:#DCEBE2}.n{direction:ltr;unicode-bidi:isolate;white-space:nowrap}</style></head><body>
<h1>${e(S.title)}</h1><p class="sub">${e(ev)}</p>
<table><thead><tr>${cols.map(c => `<th>${e(S[c])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.chosen ? ' class="chosen"' : ''}>${cols.map(c => `<td${/total|per|venue|food|av/.test(c) ? ' class="n"' : ''}>${cell(r, c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p class="sub">${e(rtl ? 'המחירים לפני מע״מ, לפי הצעות הספקים. ' : 'Prices before VAT, as quoted by the suppliers. ')}${e(Office.fmt(new Date()))}</p></body></html>`;
}

/**
 * The summary she sends the client after the offers came in (need number two). rows: compareRows() whose free-text
 * fields are already in the target language (the screen translates them first). opts: {openPoints: [], names, name}.
 */
export function offerSummary(cs, rows, lang, opts) {
  opts = opts || {}; const L = LABELS[lang] ? lang : 'he'; const S = LABELS[L];
  const who = opts.name || (L === 'he' ? 'וירג׳יני' : 'Virginie');
  const hi = opts.names ? (L === 'he' ? 'היי ' + opts.names + ',' : L === 'fr' ? 'Bonjour ' + opts.names + ',' : 'Hi ' + opts.names + ', hope you are doing well!') : (L === 'he' ? 'היי,' : L === 'fr' ? 'Bonjour,' : 'Hi, hope you are doing well!');
  const ev = cs ? [cs.kind, cs.date ? Office.fmt(cs.date) : '', cs.participants ? cs.participants + (L === 'he' ? ' משתתפים' : L === 'fr' ? ' participants' : ' participants') : ''].filter(Boolean).join(' · ') : '';
  const intro = L === 'he' ? 'מצרפת סיכום של ההצעות שקיבלנו' + (ev ? ' ל' + ev : '') + ':' : L === 'fr' ? 'Voici le résumé des offres reçues' + (ev ? ' pour ' + ev : '') + ' :' : 'Here is a summary of the offers we received' + (ev ? ' for ' + ev : '') + ':';
  const m = v => v ? Office.money(v) : '';
  const blocks = rows.filter(r => r.hasOffer).map(r => {
    const lines = ['* ' + r.supplier + (r.chosen ? ' ★' : '')];
    if (r.total) lines.push('  - ' + S.total + ': ' + m(r.total) + (r.perPerson ? ' (' + m(r.perPerson) + ' ' + S.per.toLowerCase() + ')' : ''));
    const parts = [r.venue ? S.venue + ' ' + m(r.venue) : '', r.food ? S.food + ' ' + m(r.food) : '', r.av ? S.av + ' ' + m(r.av) : ''].filter(Boolean);
    if (parts.length) lines.push('  - ' + parts.join(', '));
    if (r.included) lines.push('  - ' + S.included + ': ' + r.included);
    if (r.cancellation) lines.push('  - ' + S.cancellation + ': ' + r.cancellation);
    if (r.deposit) lines.push('  - ' + S.deposit + ': ' + r.deposit);
    if (r.terms) lines.push('  - ' + S.terms + ': ' + r.terms);
    return lines.join('\n');
  });
  const open = (opts.openPoints || []).map(trim).filter(Boolean);
  const openTitle = L === 'he' ? 'נקודות פתוחות:' : L === 'fr' ? 'Points ouverts :' : 'Open points:';
  const ask = rows.some(r => r.chosen) ? (L === 'he' ? 'המומלצת שלי מסומנת בכוכב. אשמח לאישור שלכם כדי לסגור.' : L === 'fr' ? 'Mon choix recommandé est marqué d’une étoile. J’attends votre accord pour confirmer.' : 'My recommendation is marked with a star. Please let me know if I can go ahead and confirm.')
    : (L === 'he' ? 'אשמח לדעת לאיזה כיוון ללכת.' : L === 'fr' ? 'Dites-moi quelle option vous préférez.' : 'Let me know which option you prefer.');
  const bye = L === 'he' ? 'תודה רבה,\n' + who : L === 'fr' ? 'Je reste à votre disposition.\n' + who : 'As always, I am available for any question.\nBest,\n' + who;
  return [hi, intro, '', blocks.join('\n\n'), '', open.length ? openTitle + '\n' + open.map(x => '* ' + x).join('\n') + '\n' : '', ask, '', bye].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
