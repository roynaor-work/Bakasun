/* היגיון הסל, בלי DOM. נבדק ב-tests/north.test.mjs. */
import { SHIPPING } from './config.js';

export const KEY = 'north.cart.v1';

export function load(storage = globalThis.localStorage) {
  try { const raw = storage && storage.getItem(KEY); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) ? v : []; }
  catch { return []; }
}
export function save(items, storage = globalThis.localStorage) {
  try { storage && storage.setItem(KEY, JSON.stringify(items)); } catch { /* מצב פרטי */ }
}

/* פריט: { key, id, name, price, qty, variant?, parts?, img } . key מזהה שורה (מוצר+וריאציה). */
export function lineKey(id, variant, parts) {
  return [id, variant || '', (parts || []).map(p => p.id).sort().join('+')].join('|');
}

export function addItem(items, item, qty = 1) {
  const key = item.key || lineKey(item.id, item.variant, item.parts);
  const found = items.find(i => i.key === key);
  if (found) return items.map(i => i.key === key ? { ...i, qty: Math.min(99, i.qty + qty) } : i);
  return [...items, { ...item, key, qty: Math.max(1, Math.min(99, qty)) }];
}
export function setQty(items, key, qty) {
  if (qty <= 0) return items.filter(i => i.key !== key);
  return items.map(i => i.key === key ? { ...i, qty: Math.min(99, qty) } : i);
}
export function removeItem(items, key) { return items.filter(i => i.key !== key); }

export function count(items) { return items.reduce((s, i) => s + i.qty, 0); }
export function subtotal(items) { return items.reduce((s, i) => s + i.price * i.qty, 0); }

export function shippingPrice(method, sub) {
  const m = SHIPPING[method] || SHIPPING.pickup;
  if (m.freeFrom && sub >= m.freeFrom) return 0;
  return m.price;
}
export function total(items, method) {
  const sub = subtotal(items);
  return sub + (items.length ? shippingPrice(method, sub) : 0);
}

/* מחיר מארז בהרכבה: בסיס + תוספות + אריזה. */
export function buildPrice(base, addons, pack) {
  return (base ? base.price : 0) + addons.reduce((s, a) => s + a.price, 0) + (pack ? pack.price : 0);
}

export const fmt = n => '₪' + Math.round(n).toLocaleString('en-US');

/* מספר הזמנה קריא: RC-<תאריך>-<3 תווים>. */
export function orderNo(now = new Date(), rnd = Math.random) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, '');
  const tail = Math.floor(rnd() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `RC-${d}-${tail}`;
}

/* אסימון גישה להזמנה: 128 ביט אקראיים, נשמר רק אצל הלקוח ובשורת ההזמנה. grow-pay דורש אותו כדי ליצור תשלום. */
export function accessToken(cryptoObj = globalThis.crypto) {
  const b = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(b); else throw new Error('אין מקור אקראיות מאובטח');
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* בדיקת טופס. מחזירה רשימת שגיאות (ריקה = תקין). */
/* השוואת יישובים: בלי גרשיים, מקפים ורווחים כפולים; "קרית" = "קריית". */
export function normCity(c) { return String(c || '').replace(/["'׳״`]/g, '').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').replace(/^קרית /, 'קריית ').trim(); }
export function cityInArea(city, cities) {
  const c = normCity(city); if (!c) return false;
  return cities.some(x => { const n = normCity(x); return n === c || c.startsWith(n) || n.startsWith(c) && c.length >= 3; });
}
export function hasNonKosher(items) { return items.some(i => i.kosher === false); }

export function validateOrder(f, method, opts = {}) {
  const errs = [];
  if (!f.name || f.name.trim().length < 2) errs.push('שם מלא');
  if (!/^0\d{1,2}-?\d{7}$/.test((f.phone || '').replace(/\s/g, ''))) errs.push('טלפון תקין');
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errs.push('כתובת מייל תקינה');
  if (method !== 'pickup') {
    if (!f.city || f.city.trim().length < 2) errs.push('יישוב');
    else if (opts.cities && !cityInArea(f.city, opts.cities)) errs.push('יישוב בתוך אזור המשלוחים (או איסוף מהחנות)');
    if (!f.street || f.street.trim().length < 2) errs.push('רחוב ומספר');
  }
  if (!f.adult) errs.push('אישור גיל 18 ומעלה');
  if (!f.terms) errs.push('אישור התקנון');
  if (opts.nonKosher && !f.kosherOk) errs.push('אישור שהמארז כולל מוצר לא כשר');
  return errs;
}

export const phoneOk = v => /^0\d{1,2}-?\d{7}$/.test(String(v || '').replace(/\s/g, ''));

/* שגיאות לפי שדה, להצגה ליד השדה: { name: 'הודעה', ... }. אותם כללים כמו validateOrder. */
export function fieldErrors(f, method, opts = {}) {
  const e = {};
  if (!f.name || f.name.trim().length < 2) e.name = 'כותבים שם מלא';
  if (!phoneOk(f.phone)) e.phone = 'מספר טלפון ישראלי, למשל 050-1234567';
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'כתובת מייל לא תקינה, למשל name@example.com';
  if (method !== 'pickup') {
    if (!f.city || f.city.trim().length < 2) e.city = 'בוחרים יישוב מהרשימה';
    else if (opts.cities && !cityInArea(f.city, opts.cities)) e.city = 'משלוחים רק ליישובים ברשימה. אפשר לבחור איסוף מהחנות, או לכתוב לנו.';
    if (!f.street || f.street.trim().length < 2) e.street = 'כותבים רחוב ומספר';
  }
  if (!f.adult) e.adult = 'צריך לאשר גיל 18 ומעלה';
  if (!f.terms) e.terms = 'צריך לאשר את התקנון';
  if (opts.nonKosher && !f.kosherOk) e.kosherOk = 'צריך לאשר שהמארז כולל מוצר לא כשר';
  return e;
}

/* טקסט ההזמנה להודעה/מייל. */
export function orderText(order) {
  const lines = [`הזמנה ${order.no} · ${order.store}`, ''];
  for (const i of order.items) {
    lines.push(`• ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} × ${i.qty} = ${fmt(i.price * i.qty)}${i.kosher === false ? ' · לא כשר' : ''}`);
    if (i.parts && i.parts.length) lines.push('   ' + i.parts.map(p => p.name).join(', '));
    if (i.note) lines.push('   ברכה: ' + i.note);
  }
  lines.push('', `ביניים: ${fmt(order.subtotal)}`, `משלוח: ${order.shippingLabel} ${order.shipping ? fmt(order.shipping) : '(חינם)'}`, `לתשלום: ${fmt(order.total)}`, `תשלום: ${order.payLabel}`, '');
  lines.push(`${order.customer.name} · ${order.customer.phone}${order.customer.email ? ' · ' + order.customer.email : ''}`);
  if (order.method !== 'pickup') lines.push(`${order.customer.street}, ${order.customer.city}`);
  if (order.customer.when) lines.push('מועד: ' + order.customer.when);
  if (order.customer.notes) lines.push('הערות: ' + order.customer.notes);
  return lines.join('\n');
}
