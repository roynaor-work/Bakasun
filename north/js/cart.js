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

/* בדיקת טופס. מחזירה רשימת שגיאות (ריקה = תקין). */
export function validateOrder(f, method) {
  const errs = [];
  if (!f.name || f.name.trim().length < 2) errs.push('שם מלא');
  if (!/^0\d{1,2}-?\d{7}$/.test((f.phone || '').replace(/\s/g, ''))) errs.push('טלפון תקין');
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errs.push('כתובת מייל תקינה');
  if (method !== 'pickup') {
    if (!f.city || f.city.trim().length < 2) errs.push('יישוב');
    if (!f.street || f.street.trim().length < 2) errs.push('רחוב ומספר');
  }
  if (!f.adult) errs.push('אישור גיל 18 ומעלה');
  return errs;
}

/* טקסט ההזמנה להודעה/מייל. */
export function orderText(order) {
  const lines = [`הזמנה ${order.no} · ${order.store}`, ''];
  for (const i of order.items) {
    lines.push(`• ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} × ${i.qty} = ${fmt(i.price * i.qty)}`);
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
