/* חישוב סכום ההזמנה בשרת מתוך הקטלוג, כדי שהסכום לתשלום לא ייקבע בדפדפן. טהור, נבדק ב-tests/north.test.mjs.
   items: [{ id, variantId?, qty, parts?: [ids] }]. מחזיר { subtotal, shipping, total, unknown: [ids] }. */
export function priceItem(it, PRODUCTS, BUILD) {
  if (it.id === 'custom') {
    const ids = (it.parts || []).map(p => typeof p === 'string' ? p : p.id);
    const all = [...BUILD.bases, ...BUILD.addons, ...BUILD.packs];
    let sum = 0; const unknown = [];
    for (const id of ids) { const x = all.find(a => a.id === id); if (x) sum += x.price; else unknown.push(id); }
    return { price: sum, unknown };
  }
  const p = PRODUCTS.find(x => x.id === it.id);
  if (!p) return { price: 0, unknown: [it.id] };
  const v = p.variants && it.variantId ? p.variants.find(x => x.id === it.variantId) : null;
  return { price: v ? v.price : p.price, unknown: [] };
}
export function computeTotal(items, method, { PRODUCTS, BUILD, SHIPPING }) {
  let subtotal = 0; const unknown = [];
  for (const it of items || []) { const r = priceItem(it, PRODUCTS, BUILD); subtotal += r.price * Math.max(1, Math.min(99, Number(it.qty) || 1)); unknown.push(...r.unknown); }
  const m = SHIPPING[method] || SHIPPING.pickup;
  const shipping = items && items.length ? (m.freeFrom && subtotal >= m.freeFrom ? 0 : m.price) : 0;
  return { subtotal, shipping, total: subtotal + shipping, unknown };
}
