/* Quotes without a fixed price list: every line has a supplier, a cost, and a margin (or a price typed by hand).
   The recommended lines per kind of event, the last cost seen for a supplier, and the translations the PDF needs. */
import Office from './office.js';
import { CATALOG, RECS, UNIT_L, CATEGORY_L, SUPPLIER_TYPE_L } from '../data/catalog.js';
import { trim, str } from './core.js';

const { num } = Office;

/** cost + margin% → client price, rounded to whole shekels. */
export function priceFromCost(cost, marginPct) {
  const c = num(cost), m = num(marginPct);
  if (isNaN(c)) return 0;
  return Math.round(c * (1 + (isNaN(m) ? 0 : m) / 100));
}
/** cost and price → margin % (of the price, as Office.quoteTotals computes it). */
export function marginOf(cost, price) {
  const c = num(cost), p = num(price);
  return !p || isNaN(c) ? 0 : Math.round((p - c) / p * 1000) / 10;
}

/** The catalog row for an item name, or null. Virginie's own catalog rows (extra) come first. */
export function catalogItem(name, extra) {
  const n = trim(name);
  const own = (extra || []).find(r => trim(r.item) === n);
  if (own) return own;
  const r = CATALOG.find(r => r[1] === n);
  return r ? { category: r[0], item: r[1], unit: r[2], en: r[3], fr: r[4], supplierType: r[5] } : null;
}
export function catalogAll(extra) {
  const base = CATALOG.map(r => ({ category: r[0], item: r[1], unit: r[2], en: r[3], fr: r[4], supplierType: r[5] }));
  const names = {}; base.forEach(r => { names[r.item] = 1; });
  return (extra || []).filter(r => !names[trim(r.item)]).concat(base);
}

/** Recommended quote lines for a kind of event: catalog items, quantities from the head count, no prices yet. */
export function recommendedLines(kind, participants, recs, extra) {
  const list = (recs && recs[kind]) || RECS[kind] || RECS['אחר'];
  const people = num(String(participants || '').split('-')[0]);
  return list.map(name => catalogItem(name, extra)).filter(Boolean).map(r => ({
    item: r.item, en: r.en, fr: r.fr, unit: r.unit, section: r.category, supplierType: r.supplierType,
    qty: r.unit === 'משתתף' && people ? people : 1, days: 1, cost: '', margin: '', price: '', supplierId: '', supplier: ''
  }));
}

/** Supplier types the recommended lines need (for "ask several suppliers at once"). */
export function recommendedSupplierTypes(kind, recs, extra) {
  const out = [];
  recommendedLines(kind, '', recs, extra).forEach(l => { if (l.supplierType && out.indexOf(l.supplierType) < 0) out.push(l.supplierType); });
  return out;
}

/** The last cost this supplier gave for this item (from earlier quotes), or null. */
export function lastCost(supplierId, item, quotes) {
  let best = null;
  (quotes || []).forEach(q => (q.lines || []).forEach(l => {
    if (l.supplierId === supplierId && trim(l.item) === trim(item) && num(l.cost)) {
      if (!best || str(q.date) > str(best.date)) best = { date: q.date, cost: num(l.cost), price: num(l.price) };
    }
  }));
  return best;
}

/** Lines ready for Office.quoteTotals: price filled from cost + margin when it is empty. */
export function resolveLines(lines, defaultMargin) {
  return (lines || []).map(l => {
    const price = num(l.price);
    const filled = !isNaN(price) && price !== 0 ? price : priceFromCost(l.cost, isNaN(num(l.margin)) ? defaultMargin : l.margin);
    return Object.assign({}, l, { price: filled });
  });
}

/** Translator for the PDF: catalog names, units, categories, supplier types, and event kinds; anything else stays as it is. */
export function translator(kindLabels, extra) {
  return (text, lang) => {
    const s = trim(text);
    if (!s || lang === 'he') return s;
    const c = catalogItem(s, extra); if (c && c[lang]) return c[lang];
    if (UNIT_L[s] && UNIT_L[s][lang]) return UNIT_L[s][lang];
    if (CATEGORY_L[s] && CATEGORY_L[s][lang]) return CATEGORY_L[s][lang];
    if (SUPPLIER_TYPE_L[s] && SUPPLIER_TYPE_L[s][lang]) return SUPPLIER_TYPE_L[s][lang];
    if (kindLabels && kindLabels[s] && kindLabels[s][lang]) return kindLabels[s][lang];
    return s;
  };
}

export const QUOTE_STATUS = { draft: 'טיוטה', sent: 'נשלחה', accepted: 'אושרה', rejected: 'נדחתה' };
