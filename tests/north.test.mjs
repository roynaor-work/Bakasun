import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../north/js/cart.js';
import { PRODUCTS, BUILD, byId } from '../north/js/products.js';
import { SHIPPING } from '../north/js/config.js';

const p = byId('single-malt');
const item = { id: p.id, name: p.name, price: p.price, img: p.img };

test('הוספה לסל מאחדת שורות זהות ומכבדת וריאציות', () => {
  let c = C.addItem([], item);
  c = C.addItem(c, item);
  assert.equal(c.length, 1); assert.equal(c[0].qty, 2);
  c = C.addItem(c, { ...item, variant: 'up', price: 549 });
  assert.equal(c.length, 2);
  assert.equal(C.count(c), 3);
  assert.equal(C.subtotal(c), 349 * 2 + 549);
});

test('כמות אפס מסירה, ועד 99', () => {
  let c = C.addItem([], item, 5);
  c = C.setQty(c, c[0].key, 0); assert.equal(c.length, 0);
  c = C.addItem([], item, 150); assert.equal(c[0].qty, 99);
});

test('משלוח: חינם מסכום, איסוף חינם, סל ריק בלי משלוח', () => {
  assert.equal(C.shippingPrice('pickup', 100), 0);
  assert.equal(C.shippingPrice('north', 100), SHIPPING.north.price);
  assert.equal(C.shippingPrice('north', SHIPPING.north.freeFrom), 0);
  assert.equal(C.total([], 'north'), 0);
  const c = C.addItem([], { ...item, price: 100 });
  assert.equal(C.total(c, 'north'), 100 + SHIPPING.north.price);
  assert.equal(Object.keys(SHIPPING).length, 2, 'רק איסוף ומשלוח באזור');
});

test('מארז בהרכבה: בסיס + תוספות + אריזה', () => {
  const base = BUILD.bases[0], addons = [BUILD.addons[0], BUILD.addons[1]], pack = BUILD.packs[2];
  assert.equal(C.buildPrice(base, addons, pack), base.price + addons[0].price + addons[1].price + pack.price);
  assert.equal(C.buildPrice(null, [], null), 0);
});

test('בדיקת טופס: איסוף לא דורש כתובת, משלוח כן', () => {
  const f = { name: 'דנה לוי', phone: '050-1234567', adult: true, terms: true };
  assert.deepEqual(C.validateOrder(f, 'pickup'), []);
  assert.ok(C.validateOrder(f, 'north').includes('יישוב'));
  assert.ok(C.validateOrder({ ...f, phone: '123' }, 'pickup').includes('טלפון תקין'));
  assert.ok(C.validateOrder({ ...f, adult: false }, 'pickup').includes('אישור גיל 18 ומעלה'));
  assert.ok(C.validateOrder({ ...f, terms: false }, 'pickup').includes('אישור התקנון'));
  assert.ok(C.validateOrder(f, 'pickup', { nonKosher: true }).includes('אישור שהמארז כולל מוצר לא כשר'));
  assert.deepEqual(C.validateOrder({ ...f, kosherOk: true }, 'pickup', { nonKosher: true }), []);
  assert.equal(C.hasNonKosher([{ kosher: true }, { kosher: false }]), true);
  assert.equal(C.hasNonKosher([{ kosher: true }, {}]), false);
  assert.ok(C.validateOrder({ ...f, email: 'x' }, 'pickup').includes('כתובת מייל תקינה'));
});

test('מספר הזמנה ותקציר', () => {
  const no = C.orderNo(new Date('2026-09-30T10:00:00Z'), () => 0.5);
  assert.match(no, /^RC-260930-[0-9A-Z]{3}$/);
  const text = C.orderText({ no, store: 'הרוח הצפונית', items: [{ name: 'הפלאסק', qty: 1, price: 189, engrave: 'לאבא' }], subtotal: 189, shipping: 0, shippingLabel: 'איסוף', total: 189, payLabel: 'ביט', method: 'pickup', customer: { name: 'דנה', phone: '050-1234567' } });
  assert.ok(text.includes('הפלאסק × 1 = ₪189'));
  assert.ok(text.includes('לתשלום: ₪189'));
});

test('הקטלוג תקין: מזהים ייחודיים, תמונות, בלי ערבית', () => {
  const ids = new Set(PRODUCTS.map(p => p.id)); assert.equal(ids.size, PRODUCTS.length);
  for (const p of PRODUCTS) { assert.ok(p.img.startsWith('https://')); assert.ok(p.contents.length >= 3); assert.ok(p.price > 0); if (p.kosher === false) assert.ok(p.kosherNote, p.id + ' לא כשר בלי פירוט'); }
  const all = JSON.stringify(PRODUCTS) + JSON.stringify(BUILD);
  assert.ok(!/[؀-ۿ]/.test(all));
});

import { createParams, parseCreate, parseNotify, approveParams, fullName, phoneDigits, GROW_BASE } from '../supabase/functions/_shared/grow.mjs';

test('Grow: שדות createPaymentProcess', () => {
  const order = { no: 'RC-260930-ABC', store: 'הרוח הצפונית', total: 384, shipping: 35, items: [{ id: 'flask', name: 'הפלאסק', qty: 1, price: 189 }, { id: 'choc-wine', name: 'שוקולד ויין', qty: 1, price: 160 }], customer: { name: 'דנה', phone: '+972 50-123 4567', email: 'd@x.co' } };
  const p = createParams(order, { successUrl: 'https://s/?paid=1', cancelUrl: 'https://s/?paid=0', notifyUrl: 'https://n' }, { userId: 'U1', pageCode: 'P1' });
  assert.equal(p.pageCode, 'P1'); assert.equal(p.userId, 'U1'); assert.equal(p.sum, '384.00');
  assert.equal(p['pageField[fullName]'], 'דנה לקוח'); assert.equal(p['pageField[phone]'], '0501234567');
  assert.equal(p['pageField[email]'], 'd@x.co'); assert.equal(p.cField1, 'RC-260930-ABC'); assert.equal(p.notifyUrl, 'https://n');
  assert.equal(p['productData[2][itemDescription]'], 'משלוח'); assert.equal(p['productData[2][price]'], '35.00');
  assert.equal(fullName('דנה לוי כהן'), 'דנה לוי כהן'); assert.equal(phoneDigits('050-1234567'), '0501234567');
  assert.equal(GROW_BASE(false), 'https://secure.meshulam.co.il'); assert.equal(GROW_BASE(true), 'https://sandbox.meshulam.co.il');
});

test('Grow: תשובה וקריאה חוזרת', () => {
  assert.deepEqual(parseCreate({ status: 1, data: { url: 'https://pay', processId: 7, processToken: 't' } }), { ok: true, url: 'https://pay', processId: '7', processToken: 't' });
  assert.equal(parseCreate({ status: 0, err: { message: 'bad' } }).ok, false);
  const cb = parseNotify(Object.entries({ 'data[status]': '1', 'data[transactionId]': '55', 'data[asmachta]': '123', 'data[customFields][cField1]': 'RC-1', 'data[processId]': '7' }));
  assert.equal(cb.orderNo, 'RC-1'); assert.equal(cb.paid, true); assert.equal(cb.transactionId, '55');
  const flat = parseNotify(Object.entries({ status: '0', statusCode: '3', transactionId: '9', cField1: 'RC-2' }));
  assert.equal(flat.orderNo, 'RC-2'); assert.equal(flat.paid, false);
  const ap = approveParams(cb, 'P1'); assert.equal(ap.pageCode, 'P1'); assert.equal(ap.transactionId, '55'); assert.equal(ap.processId, '7'); assert.ok(!('orderNo' in ap));
});
