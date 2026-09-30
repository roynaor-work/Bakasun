/* The budget of one event and its profitability. Pure logic, tested in tests/budget.test.mjs.
   A budget line: {caseId, category, item, supplierId, linkId, planned, cost, price, qty, unit, status, note, dueDate, paidAt, paidAmount}.
   planned = her estimate, cost = the agreed supplier price, price = what the client pays for it. All before VAT, per unit; qty defaults to 1.
   The production fee is a line in the 'הפקה' category with cost 0 and a price: that is where her margin usually sits. */
import Office from './office.js';
import { trim, str } from './core.js';
import { resolveLines } from './quotes.js';

const { num } = Office;

export const CATEGORIES = ['מקום', 'קייטרינג', 'לינה', 'הסעות', 'הגברה ותאורה', 'דפוס ומיתוג', 'מתנות', 'צוות', 'אבטחה ורפואה', 'הפקה', 'אחר'];
export const FEE_CATEGORY = 'הפקה';
export const LINE_STATUS = { estimate: 'estimate', quoted: 'quoted', approved: 'approved', paid: 'paid' };
export const LINE_STATUSES = ['estimate', 'quoted', 'approved', 'paid'];

/* supplier type / quote section / words in the item → category */
const CAT_BY_TYPE = {
  'קייטרינג ושפים': 'קייטרינג', 'בר ומשקאות': 'קייטרינג', 'מסעדות': 'קייטרינג', 'מלונות': 'לינה', 'הסעות': 'הסעות', 'הגברה ותאורה': 'הגברה ותאורה',
  'דפוס ומיתוג': 'דפוס ומיתוג', 'מקום לאירוע': 'מקום', 'תקליטנים ולהקות': 'הגברה ותאורה', 'צילום ווידאו': 'צוות', 'מדריכי טיולים': 'צוות', 'השכרת ציוד': 'הגברה ותאורה',
  'עיצוב ופרחים': 'אחר', 'פעילות וסיורים': 'אחר', 'אחר': 'אחר'
};
const CAT_BY_SECTION = { 'מקום': 'מקום', 'אוכל': 'קייטרינג', 'משקאות': 'קייטרינג', 'לינה': 'לינה', 'הסעות': 'הסעות', 'טכני': 'הגברה ותאורה', 'הפקה': 'הפקה', 'ציוד': 'הגברה ותאורה', 'צילום': 'צוות' };
const CAT_WORDS = [
  [/הפקה|הפקת|ניהול|production|fee|honoraires/i, 'הפקה'], [/מלון|לינה|חדר|hotel|room|hébergement|chambre/i, 'לינה'], [/אוטובוס|הסע|bus|transport|transfer/i, 'הסעות'],
  [/קייטרינג|ארוח|כיבוד|(?:^|[\s,])בר(?=[\s,]|$)|קפה|catering|meal|dinner|lunch|repas|traiteur/i, 'קייטרינג'], [/הגברה|תאורה|מסך|מקרן|sound|light|screen|projector|son |lumière/i, 'הגברה ותאורה'],
  [/דפוס|תגי שם|שילוט|מיתוג|print|badge|sign|impression/i, 'דפוס ומיתוג'], [/מתנ|gift|cadeau/i, 'מתנות'], [/אבטחה|רפואה|חובש|מאבטח|security|medic|sécurité/i, 'אבטחה ורפואה'],
  [/צוות|עוזר|מדריך|צלם|צילום|staff|guide|photo|assistant/i, 'צוות'], [/אולם|מקום|גן |venue|hall|lieu|salle/i, 'מקום']
];
/** The category for a supplier type, a quote section or free text (in that order of trust). */
export function categoryOf(supplierType, section, text) {
  if (CAT_BY_TYPE[trim(supplierType)]) return CAT_BY_TYPE[trim(supplierType)];
  if (CAT_BY_SECTION[trim(section)]) return CAT_BY_SECTION[trim(section)];
  if (CATEGORIES.includes(trim(section))) return trim(section);
  const s = trim(text);
  for (const [re, cat] of CAT_WORDS) if (re.test(s)) return cat;
  return 'אחר';
}

const n0 = v => { const x = num(v); return isNaN(x) ? 0 : x; };
const has = v => !isNaN(num(v)) && trim(v) !== '';
export function qtyOf(l) { const q = num(l && l.qty); return isNaN(q) || q <= 0 ? 1 : q; }
/** What this line costs us: the agreed price, or the estimate while there is none. */
export function costOf(l) { return qtyOf(l) * (has(l.cost) ? n0(l.cost) : n0(l.planned)); }
export function plannedOf(l) { return qtyOf(l) * (has(l.planned) ? n0(l.planned) : n0(l.cost)); }
export function priceOf(l) { return qtyOf(l) * n0(l.price); }
export function paidOf(l) { if (has(l.paidAmount)) return n0(l.paidAmount); return l.status === LINE_STATUS.paid ? costOf(l) : 0; }

/** The key two lines are matched on: the supplier when there is one, otherwise the item text. */
export function lineKey(l) {
  const sup = trim(l.supplierId); if (sup) return 'sup:' + sup;
  return 'item:' + Office.normHe(l.item);
}
const dupKey = l => (trim(l.supplierId) ? 'sup:' + trim(l.supplierId) : '') + '|' + Office.normHe(l.item);

/** The latest client quote of the case: the accepted one if there is one, otherwise the newest that was not rejected. */
export function latestQuote(quotes, caseId) {
  const mine = (quotes || []).filter(q => q.caseId === caseId);
  const acc = mine.filter(q => q.status === 'אושרה').sort((a, b) => str(b.created).localeCompare(str(a.created)))[0];
  if (acc) return acc;
  return mine.filter(q => q.status !== 'נדחתה').sort((a, b) => str(b.created).localeCompare(str(a.created)))[0] || null;
}

/** Candidate lines from what the case already knows: the supplier links (cost) and the latest quote (price).
    A supplier that appears in both becomes one line with both numbers. */
export function linesFromCase(caseRec, links, quotes, suppliers) {
  const supById = {}; (suppliers || []).forEach(s => { supById[s.id] = s; });
  const out = []; const bySup = {};
  (links || []).filter(l => l.caseId === caseRec.id && /אושר|התקבלה/.test(str(l.status))).forEach(l => {
    const sp = supById[l.supplierId] || { name: l.supplier, type: '' };
    const approved = /אושר/.test(str(l.status)); const paid = approved && Office.yes(l.paid);
    const line = { caseId: caseRec.id, category: categoryOf(sp.type, '', l.what || sp.name), item: trim(l.what) || trim(sp.name) || '', supplierId: l.supplierId || '', linkId: l.id || '',
      planned: '', cost: has(l.cost) ? n0(l.cost) : '', price: '', qty: 1, unit: '', status: paid ? LINE_STATUS.paid : approved ? LINE_STATUS.approved : LINE_STATUS.quoted, note: '',
      dueDate: '', paidAt: paid ? (l.paidAt || '') : '', paidAmount: paid && has(l.cost) ? n0(l.cost) : '' };
    // one line per supplier: an approved link wins over a received offer of the same supplier
    const key = l.supplierId ? 'sup:' + l.supplierId : 'item:' + Office.normHe(line.item);
    if (bySup[key]) { if (approved && bySup[key].status === LINE_STATUS.quoted) Object.assign(bySup[key], line); return; }
    bySup[key] = line; out.push(line);
  });
  const q = latestQuote(quotes, caseRec.id);
  if (q) resolveLines(q.lines, q.defaultMargin).forEach(ql => {
    if (!trim(ql.item) && !n0(ql.price)) return;
    const qty = (isNaN(num(ql.qty)) ? 1 : num(ql.qty)) * (isNaN(num(ql.days)) || !num(ql.days) ? 1 : num(ql.days));
    const key = ql.supplierId ? 'sup:' + ql.supplierId : 'item:' + Office.normHe(ql.item);
    const ex = bySup[key];
    if (ex) { if (!has(ex.price)) { ex.price = n0(ql.price); ex.qty = qty || 1; } if (!has(ex.cost) && has(ql.cost)) ex.cost = n0(ql.cost); if (!ex.unit) ex.unit = trim(ql.unit); return; }
    const sp = supById[ql.supplierId];
    const line = { caseId: caseRec.id, category: categoryOf(sp ? sp.type : '', ql.section, ql.item), item: trim(ql.item), supplierId: ql.supplierId || '', linkId: '',
      planned: '', cost: has(ql.cost) ? n0(ql.cost) : '', price: n0(ql.price), qty: qty || 1, unit: trim(ql.unit), status: LINE_STATUS.estimate, note: '', dueDate: '', paidAt: '', paidAmount: '' };
    bySup[key] = line; out.push(line);
  });
  return out;
}

/** Refresh: which candidates are new, and which existing lines only gain a number they did not have.
    Nothing she typed is ever overwritten: a field is filled only when it is empty. */
export function mergeLines(existing, candidates) {
  const ex = existing || []; const add = []; const update = [];
  const find = c => ex.find(l => lineKey(l) === lineKey(c)) || ex.find(l => dupKey(l) === dupKey(c)) || (!trim(c.supplierId) ? null : ex.find(l => !trim(l.supplierId) && Office.normHe(l.item) === Office.normHe(c.item)));
  (candidates || []).forEach(c => {
    const l = find(c);
    if (!l) { add.push(c); return; }
    const patch = {};
    ['cost', 'price'].forEach(k => { if (!has(l[k]) && has(c[k])) patch[k] = c[k]; });
    ['supplierId', 'linkId', 'unit'].forEach(k => { if (!trim(l[k]) && trim(c[k])) patch[k] = c[k]; });
    if (!trim(l.category) && trim(c.category)) patch.category = c.category;
    // status only moves forward, and only when it was not set by hand beyond what the link says
    const rank = s => LINE_STATUSES.indexOf(s);
    if (rank(c.status) > rank(l.status) && rank(l.status) <= rank(LINE_STATUS.quoted)) patch.status = c.status;
    if (c.status === LINE_STATUS.paid && !l.paidAt && c.paidAt) patch.paidAt = c.paidAt;
    if (Object.keys(patch).length) update.push(Object.assign({ id: l.id }, patch));
  });
  return { add, update };
}

const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;

/** The numbers of one event. payments = the client payments of this case (Office.PAY statuses). vat = the rate (18 when empty).
    caseRec and today are optional and only feed the warnings. */
export function summary(lines, payments, vat, caseRec, today) {
  const L = lines || []; const P = payments || [];
  const rate = isNaN(num(vat)) ? 18 : num(vat);
  const t = Office.day(today) || Office.day(new Date());
  let plannedCost = 0, agreedCost = 0, totalCost = 0, clientPrice = 0, supplierPaid = 0, supplierDue = 0;
  const cats = {};
  L.forEach(l => {
    const c = costOf(l), p = priceOf(l), pl = plannedOf(l), paid = paidOf(l);
    plannedCost += pl; totalCost += c; clientPrice += p;
    if (l.status === LINE_STATUS.approved || l.status === LINE_STATUS.paid) agreedCost += c;
    supplierPaid += paid; supplierDue += Math.max(0, c - paid);
    const k = trim(l.category) || 'אחר';
    const cat = cats[k] || (cats[k] = { category: k, planned: 0, cost: 0, price: 0, margin: 0, count: 0 });
    cat.planned += pl; cat.cost += c; cat.price += p; cat.margin += p - c; cat.count++;
  });
  const isPaid = p => p.status === Office.PAY.paid;
  const isInvoiced = p => p.status === Office.PAY.invoiced || isPaid(p);
  const sum = arr => arr.reduce((a, p) => a + n0(p.amount), 0);
  const received = sum(P.filter(isPaid)), invoiced = sum(P.filter(isInvoiced)), scheduled = sum(P);
  const margin = clientPrice - totalCost;
  const marginPct = clientPrice ? r1(margin / clientPrice * 100) : 0;
  const byCategory = CATEGORIES.filter(k => cats[k]).concat(Object.keys(cats).filter(k => !CATEGORIES.includes(k))).map(k => { const c = cats[k]; return { category: k, planned: r2(c.planned), cost: r2(c.cost), price: r2(c.price), margin: r2(c.margin), count: c.count }; });
  const warnings = [];
  L.forEach(l => { if (n0(l.price) && costOf(l) > priceOf(l)) warnings.push({ code: 'costAbovePrice', item: l.item || l.category, cost: costOf(l), price: priceOf(l) }); });
  if (L.length && !L.some(l => l.category === FEE_CATEGORY)) warnings.push({ code: 'noFee' });
  if (clientPrice && margin < 0) warnings.push({ code: 'negativeMargin', amount: r2(-margin) });
  else if (clientPrice && marginPct < 10) warnings.push({ code: 'lowMargin', pct: marginPct });
  // supplier money leaving before client money is expected: cumulative, by date
  const dues = L.filter(l => l.status !== LINE_STATUS.paid && Office.iso(l.dueDate) && costOf(l) - paidOf(l) > 0).map(l => ({ date: Office.iso(l.dueDate), amount: costOf(l) - paidOf(l), item: l.item || l.category })).sort((a, b) => a.date.localeCompare(b.date));
  let need = 0;
  dues.forEach(d => {
    need += d.amount;
    const available = received + sum(P.filter(p => !isPaid(p) && Office.iso(p.due) && Office.iso(p.due) <= d.date));
    if (available < need - 0.5) warnings.push({ code: 'supplierBeforeClient', item: d.item, date: d.date, amount: r2(need - available) });
  });
  if (caseRec) {
    const b = num(caseRec.budget);
    if (!isNaN(b) && b > 0 && clientPrice > b) warnings.push({ code: 'overClientBudget', budget: b, price: r2(clientPrice) });
    const d = Office.day(caseRec.date);
    if (d && t && d < t && clientPrice - received > 0.5) warnings.push({ code: 'unpaidAfterEvent', amount: r2(clientPrice - received) });
  }
  return { plannedCost: r2(plannedCost), agreedCost: r2(agreedCost), totalCost: r2(totalCost), clientPrice: r2(clientPrice), margin: r2(margin), marginPct,
    invoiced: r2(invoiced), received: r2(received), scheduled: r2(scheduled), open: r2(clientPrice - received), supplierPaid: r2(supplierPaid), supplierDue: r2(supplierDue),
    vatRate: rate, vat: r2(clientPrice * rate / 100), gross: r2(clientPrice * (1 + rate / 100)), byCategory, warnings, count: L.length };
}

/** Client payments and supplier due dates, one list by date. Items without a date come last. overdue = not paid and before today. */
export function paymentSchedule(lines, payments, caseRec, today) {
  const t = Office.iso(today) || Office.iso(new Date());
  const rows = [];
  (payments || []).forEach(p => {
    const paid = p.status === Office.PAY.paid; const date = paid ? Office.iso(p.paidAt || p.due) : Office.iso(p.due);
    rows.push({ kind: 'client', id: p.id, date, amount: n0(p.amount), paid, status: p.status || Office.PAY.due, label: trim(p.note) || trim(p.client) || (caseRec ? trim(caseRec.client) : ''), overdue: !paid && !!date && date < t });
  });
  (lines || []).forEach(l => {
    const c = costOf(l); if (!c) return;
    const paid = l.status === LINE_STATUS.paid; const date = paid ? Office.iso(l.paidAt || l.dueDate) : Office.iso(l.dueDate);
    if (!date && !paid) return;
    rows.push({ kind: 'supplier', id: l.id, date, amount: paid ? (paidOf(l) || c) : c - paidOf(l), paid, status: l.status, label: trim(l.item) || trim(l.category), supplierId: l.supplierId || '', overdue: !paid && !!date && date < t });
  });
  rows.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === 'client' ? -1 : 1));
  let bal = 0;
  rows.forEach(r => { bal += r.kind === 'client' ? r.amount : -r.amount; r.balance = r2(bal); });
  return rows;
}

const STOP = /^(ארגון|עמותת|עמותה|חברת|חברה|בעמ|בע"מ|ער|ע"ר|קרן|מרכז|מרכזי|the|ltd|inc|gmbh|stiftung|foundation|association|עיריית|מועצה)$/;
/** The words of a client name that carry meaning (no "ארגון", "בע״מ"...), normalized. */
function nameWords(s) { return Office.normHe(s).split(' ').filter(w => w.length >= 2 && !STOP.test(w)); }
function refDate(p) { return Office.iso(p.due || p.paidAt || p.invoicedAt || p.created) || ''; }

/** Payments that have no case: the case whose client matches (by clientId, by name, or by a name word in the note) and whose date is closest.
    Only cases within maxDays (default 180) of the payment count. Returns patches [{id, caseId}], nothing else changes. */
export function attachPaymentsToCases(payments, cases, opts) {
  const maxDays = opts && !isNaN(num(opts.maxDays)) ? num(opts.maxDays) : 180;
  const out = [];
  (payments || []).forEach(p => {
    if (trim(p.caseId)) return;
    const pn = Office.normHe(p.client), note = Office.normHe(p.note), pw = nameWords(p.client);
    const pd = refDate(p);
    let best = null;
    (cases || []).forEach(c => {
      let score = 0;
      const cn = Office.normHe(c.client), cw = nameWords(c.client);
      if (trim(p.clientId) && p.clientId === c.clientId) score = 3;
      else if (pn && cn && (pn === cn || (pn.length >= 3 && cn.indexOf(pn) >= 0) || (cn.length >= 3 && pn.indexOf(cn) >= 0))) score = 3;
      else if (pw.length && cw.length && pw.some(w => cw.some(x => x === w || (w.length >= 3 && x.indexOf(w) >= 0) || (x.length >= 3 && w.indexOf(x) >= 0)))) score = 2;
      else if (note && cw.some(w => w.length >= 3 && note.indexOf(w) >= 0)) score = 1;
      if (!score) return;
      const dist = pd && c.date ? Math.abs(Office.daysBetween(pd, c.date)) : 99999;
      if (dist > maxDays && pd && c.date) return;
      if (!best || score > best.score || (score === best.score && dist < best.dist)) best = { id: c.id, score, dist };
    });
    if (best) out.push({ id: p.id, caseId: best.id });
  });
  return out;
}

/** One row per active event for the overview screen, with the totals line. sort = 'date' | 'margin' | '-margin'. */
export function overviewRows(cases, lines, payments, vat, sort, today) {
  const rows = (cases || []).filter(c => Office.ACTIVE.includes(c.status)).map(c => {
    const sm = summary((lines || []).filter(l => l.caseId === c.id), (payments || []).filter(p => p.caseId === c.id), vat, c, today);
    return { id: c.id, client: c.client || '', kind: c.kind || '', date: c.date || '', cost: sm.totalCost, price: sm.clientPrice, margin: sm.margin, marginPct: sm.marginPct, received: sm.received, open: sm.open, warnings: sm.warnings.length, count: sm.count };
  });
  const by = { date: (a, b) => str(a.date).localeCompare(str(b.date)), '-date': (a, b) => str(b.date).localeCompare(str(a.date)), margin: (a, b) => a.marginPct - b.marginPct, '-margin': (a, b) => b.marginPct - a.marginPct };
  rows.sort(by[sort] || by.date);
  const tot = rows.reduce((a, r) => ({ cost: a.cost + r.cost, price: a.price + r.price, margin: a.margin + r.margin, received: a.received + r.received, open: a.open + r.open }), { cost: 0, price: 0, margin: 0, received: 0, open: 0 });
  tot.marginPct = tot.price ? r1(tot.margin / tot.price * 100) : 0;
  Object.keys(tot).forEach(k => { tot[k] = r2(tot[k]); });
  return { rows, totals: tot };
}

/** The command for the assistant screen that asks Roy for the invoice on what is still open (parseInvoiceRequest reads it). */
export function invoiceAskText(caseRec, amount) {
  const n = Math.round(n0(amount)); const ev = [caseRec.kind, caseRec.date ? Office.fmt(caseRec.date) : ''].filter(Boolean).join(' ');
  return 'רועי, תוציא חשבונית על ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' + מע״מ עבור ' + ev + '. לקוח: ' + trim(caseRec.client);
}
