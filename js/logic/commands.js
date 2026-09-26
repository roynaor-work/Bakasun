/* Spoken or typed commands: "send the bank confirmation to 052-1234567", "ask Roy for an invoice: Community O, 580777894, 3,000 + VAT",
   "call Yossi back". Pure parsing, tested; the screens decide what to open. */
import Office from './office.js';
import { trim, str, phoneDigits } from './core.js';

const SEND = /^(?:שלחי|שלח|תשלחי|תשלח|לשלוח|send|envoie|envoyer|envoyez)\b/i;
const INVOICE = /(חשבונית|חשבון עסקה|דרישת תשלום|invoice|facture)/i;
const TO = /(?:\s(?:ל|אל|to|à)\s*|\s(?:למספר|לטלפון|למייל|to number|to phone|au numéro|par mail)\s*)/i;

/** What a command asks for: {kind: 'send'|'invoice'|'unknown', doc, to: {phone|email|name}} */
export function parseCommand(text, docs, people) {
  const t = trim(text);
  const out = { kind: 'unknown', text: t, doc: null, to: null };
  if (!t) return out;
  if (INVOICE.test(t) && /(רועי|roy|בקש|ask|demande)/i.test(t)) { out.kind = 'invoice'; out.invoice = parseInvoiceRequest(t); return out; }
  if (/(קיבלתי|יש לי|הגיעה|got|received|reçu|j'ai reçu)\s.*(הצעה|הצעת מחיר|quote|devis)/i.test(t) || /^(הצעה|הצעת מחיר|quote|devis)\s+(מ|from|de)\b/i.test(t)) {
    let bp = null, bl = 0;
    (people || []).filter(p => p.about === 'supplier' || !p.about).forEach(p => (p.names || []).forEach(n => { const k = Office.normHe(n); if (k && k.length >= 3 && k.length > bl && Office.normHe(t).indexOf(k) >= 0) { bp = p; bl = k.length; } }));
    out.kind = 'supplierQuote'; out.supplier = bp; return out;
  }
  const email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(t);
  const phone = /(?:\+972[\s\-]?|0)(5\d)[\s\-]?(\d{3})[\s\-]?(\d{4})\b/.exec(t) || /(?:\+|00)\d[\d\s\-]{7,16}\d/.exec(t);
  if (email) out.to = { email: email[0] };
  else if (phone) out.to = { phone: phone[0].replace(/\s/g, '') };
  let body = t.replace(SEND, '').replace(email ? email[0] : '', '').replace(phone ? phone[0] : '', '');
  // the document: the library entry whose title words appear in the text (longest match)
  let best = null, bestLen = 0;
  (docs || []).forEach(d => {
    const names = [d.title].concat(d.aliases || []);
    names.forEach(n => { const k = Office.normHe(n); if (k && k.length > bestLen && Office.normHe(body).indexOf(k) >= 0) { best = d; bestLen = k.length; } });
  });
  out.doc = best;
  if (!out.to) {
    // a known person by name
    let bp = null, bl = 0;
    (people || []).forEach(p => (p.names || []).forEach(n => { const k = Office.normHe(n); if (k && k.length >= 3 && k.length > bl && Office.normHe(body).indexOf(k) >= 0) { bp = p; bl = k.length; } }));
    if (bp) out.to = { name: bp.label, phone: bp.phone, email: bp.email };
  }
  if (SEND.test(t) || out.doc) out.kind = 'send';
  return out;
}

/** "לקוח: קומיוניטי או (ע״ר) 580777894, עין ורד 1 תל אביב. מקדמה 3,000 + מע״מ הפקה, 20 כריות 1,595 + מע״מ"
    → {client, taxId, address, email, items:[{desc, amount}], total} */
export function parseInvoiceRequest(text) {
  const t = str(text).replace(/[‎‏]/g, '');
  const out = { client: '', taxId: '', address: '', email: '', items: [], total: 0, kind: /חשבון עסקה|דרישת תשלום|proforma/i.test(t) ? 'חשבון עסקה' : 'חשבונית' };
  const em = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.exec(t); if (em) out.email = em[0];
  const id = /(?:ח\.?פ\.?|ע\.?ר\.?|ע\.?מ\.?|ת\.?ז\.?|מס'? ?חברה|company no\.?|reg\.?)\s*:?\s*(\d{8,9})/i.exec(t) || /\b(5\d{8})\b/.exec(t);
  if (id) out.taxId = id[1];
  const cl = /(?:לכבוד|לקוח(?: חדש)?|client|customer|à l'attention de|pour)\s*:?\s*([^\n,.]{2,60})/i.exec(t);
  if (cl) out.client = trim(cl[1]).replace(/\s*(ח\.?פ\.?|ע\.?ר\.?|ע\.?מ\.?)\s*\d*$/, '').replace(/\d{8,9}/, '').trim();
  const addr = /(?:כתובת|address|adresse)\s*:?\s*([^\n]{3,80})/i.exec(t) || /((?:רח(?:וב|')?|שד(?:רות|')?)\s?[^\n,]{2,40}(?:,?\s*[^\n,]{2,30})?)/.exec(t)
    || /^((?![^\n]*(?:₪|ש"?ח|מע["״]?מ|vat|\d{8,}))[^\n\d]{2,30}\s\d{1,4}\s*,\s*[^\n\d]{2,30})$/m.exec(t);
  if (addr) out.address = trim(addr[1]);
  // amounts: "3,000 + מע"מ", "1595 פלוס מעמ", "10.500 plus VAT", "27,310+ מע״מ"
  const re = /([^\n.;]{0,60}?)(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(?:₪|ש"?ח|nis)?\s*(\+|פלוס|plus|כולל|incl\.?|TTC|HT)?\s*(מע["״]?מ|vat|tva)?/gi;
  let m;
  while ((m = re.exec(t))) {
    if (!m[4] && !/₪|ש"?ח/.test(m[0])) continue;
    const num = Office.num(m[2].replace(/\.(\d{3})\b/g, ',$1'));
    if (isNaN(num) || num < 50 || String(num) === out.taxId) continue;
    const desc = trim(m[1]).replace(/^(?:סכומים?|סכום|amount|montant)\s*:?\s*/i, '').replace(/[:\-–]+$/, '').trim();
    const incl = m[3] && /כולל|incl|TTC/i.test(m[3]);
    out.items.push({ desc, amount: incl ? Math.round(num / 1.18) : num, incl: !!incl });
  }
  out.total = out.items.reduce((a, x) => a + x.amount, 0);
  return out;
}

/** The message to Roy, built from a parsed request (and what the app knows about the client). */
export function invoiceRequestText(req, extra, signer) {
  extra = extra || {};
  const lines = ['שלום רועי,', '', 'צריך להוציא ' + (req.kind || 'חשבונית') + ':',
    '• לקוח: ' + (req.client || extra.client || ''),
    (req.taxId || extra.taxId) ? '• ח.פ. / ע.ר: ' + (req.taxId || extra.taxId) : '',
    (req.address || extra.address) ? '• כתובת: ' + (req.address || extra.address) : '',
    (req.email || extra.email) ? '• לשלוח ל: ' + (req.email || extra.email) : ''];
  (req.items || []).forEach(x => lines.push('• ' + (x.desc ? x.desc + ': ' : '') + Office.money(x.amount) + ' + מע״מ'));
  if ((req.items || []).length > 1) lines.push('• סה״כ לפני מע״מ: ' + Office.money(req.total));
  lines.push('', 'תודה,', signer || 'וירג׳יני');
  return lines.filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}

/** Lines of a supplier's quote from its text (pasted, or extracted from a PDF): item + price, plus a total when stated. */
export function parseSupplierQuote(text) {
  const lines = str(text).split(/\n+/).map(trim).filter(Boolean);
  const items = [];
  let total = null;
  lines.forEach(l => {
    if (/סה["״]?כ|total|totale|montant total/i.test(l)) { const n = lastNumber(l); if (n) total = n; return; }
    const n = lastNumber(l);
    if (!n || n < 10) return;
    const desc = l.replace(/[\d,.\s₪]+(?:₪|ש"?ח|nis|ils|€)?\s*(?:\+\s*מע["״]?מ|כולל מע["״]?מ|plus vat|incl\.? vat|ht|ttc)?\s*$/i, '').replace(/^[\-•*\d.)\s]+/, '').trim();
    if (!desc || desc.length < 2) return;
    const q = /(?:^|\s)(\d{1,3})\s*(?:x|×|יח'?|יחידות|pcs|pers\.?|personnes|משתתפים|משתתפות|אנשים|איש|אורחים|מנות)(?=\s|$|[,.])/i.exec(desc);
    items.push({ item: q ? trim(desc.replace(q[0], ' ')) : desc, cost: n, qty: q ? +q[1] : 1 });
  });
  return { items, total, sum: items.reduce((a, x) => a + x.cost, 0) };
}
function lastNumber(l) {
  const ms = l.match(/\d{1,3}(?:[,.]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g);
  if (!ms) return null;
  const n = Office.num(ms[ms.length - 1].replace(/\.(\d{3})\b/g, ',$1'));
  return isNaN(n) ? null : n;
}

/** Supplier lines → quote lines with a markup, ready for the client's quote. */
export function markupLines(items, pct, supplier) {
  return (items || []).map(x => ({ item: x.item, en: '', fr: '', unit: x.qty > 1 ? 'משתתף' : 'אירוע', qty: x.qty || 1, days: 1,
    cost: x.qty > 1 ? Math.round(x.cost / x.qty) : x.cost, margin: pct, price: '', supplierId: supplier ? supplier.id : '', supplier: supplier ? supplier.name : '', section: supplier ? supplier.type : '' }));
}

/** "I sent the client a quote based on yours" note to the supplier, in the supplier's language. */
export function supplierMarkupMessage(sup, cs, total, lang, signer) {
  const L = lang || 'he';
  const n = trim(sup.contact || sup.name).split(' ')[0];
  const ev = Office.eventLine(cs);
  const T = {
    he: 'היי ' + n + ', תודה על ההצעה ל' + ev + '.\nהעברתי ללקוח הצעה על בסיס ההצעה שלך, בסכום כולל של ' + Office.money(total) + ' לפני מע״מ (כולל דמי ההפקה שלנו).\nהמחיר בינינו נשאר כמו שסיכמנו. תאשר לי שקיבלת, ושהמפרט מולך עדיין תקף.',
    en: 'Hi ' + n + ', thank you for the quote for ' + ev + '.\nI sent the client a proposal based on yours, at a total of ' + Office.money(total) + ' before VAT (including our production fee).\nThe price between us stays as agreed. Please confirm you received this and the spec still holds.',
    fr: 'Bonjour ' + n + ', merci pour le devis pour ' + ev + '.\nJ’ai transmis au client une proposition basée sur la vôtre, pour un total de ' + Office.money(total) + ' HT (frais de production inclus).\nLe prix entre nous reste celui convenu. Merci de me confirmer la réception et que le descriptif est toujours valable.'
  }[L] || '';
  return T + (signer ? '\n' + signer : '');
}

/** Calls tried yesterday (or since `since`) that were not answered. */
export function unansweredSince(calls, since, today) {
  const s = Office.day(since), t = Office.day(today) || Office.day(new Date());
  return (calls || []).filter(c => c.status === 'noanswer' && c.lastTry && Office.day(c.lastTry) && Office.day(c.lastTry) >= s && Office.day(c.lastTry) < t);
}
/** Handing a call to someone else: the message, in the helper's language. */
export function delegateCallMessage(call, who, cs, lang, signer) {
  const L = lang || 'he';
  const n = trim(who).split(' ')[0];
  const T = {
    he: 'היי ' + n + ', תוכל/י להתקשר ל' + call.name + ' (' + (call.phone || '') + ')?\n' + (call.why ? 'מה צריך: ' + call.why + '\n' : '') + (cs ? 'לגבי: ' + Office.eventLine(cs) + '\n' : '') + 'ניסיתי ' + (call.attempts || 1) + ' פעמים בלי מענה. תעדכן/י אותי מה יצא.',
    en: 'Hi ' + n + ', could you call ' + call.name + ' (' + (call.phone || '') + ')?\n' + (call.why ? 'What we need: ' + call.why + '\n' : '') + (cs ? 'About: ' + Office.eventLine(cs) + '\n' : '') + 'I tried ' + (call.attempts || 1) + ' times with no answer. Let me know how it went.',
    fr: 'Bonjour ' + n + ', peux-tu appeler ' + call.name + ' (' + (call.phone || '') + ') ?\n' + (call.why ? 'Ce qu’il faut : ' + call.why + '\n' : '') + (cs ? 'Au sujet de : ' + Office.eventLine(cs) + '\n' : '') + 'J’ai essayé ' + (call.attempts || 1) + ' fois sans réponse. Tiens-moi au courant.'
  }[L];
  return T + (signer ? '\n' + signer : '');
}
