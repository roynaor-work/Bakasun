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
  assert.equal(C.shippingPrice('national', 100), SHIPPING.national.price);
  assert.equal(C.total([], 'national'), 0);
  const c = C.addItem([], { ...item, price: 100 });
  assert.equal(C.total(c, 'national'), 100 + SHIPPING.national.price);
});

test('מארז בהרכבה: בסיס + תוספות + אריזה', () => {
  const base = BUILD.bases[0], addons = [BUILD.addons[0], BUILD.addons[1]], pack = BUILD.packs[2];
  assert.equal(C.buildPrice(base, addons, pack), base.price + addons[0].price + addons[1].price + pack.price);
  assert.equal(C.buildPrice(null, [], null), 0);
});

test('בדיקת טופס: איסוף לא דורש כתובת, משלוח כן', () => {
  const f = { name: 'דנה לוי', phone: '050-1234567', adult: true };
  assert.deepEqual(C.validateOrder(f, 'pickup'), []);
  assert.ok(C.validateOrder(f, 'north').includes('יישוב'));
  assert.ok(C.validateOrder({ ...f, phone: '123' }, 'pickup').includes('טלפון תקין'));
  assert.ok(C.validateOrder({ ...f, adult: false }, 'pickup').includes('אישור גיל 18 ומעלה'));
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
  for (const p of PRODUCTS) { assert.ok(p.img.startsWith('https://')); assert.ok(p.contents.length >= 3); assert.ok(p.price > 0); }
  const all = JSON.stringify(PRODUCTS) + JSON.stringify(BUILD);
  assert.ok(!/[؀-ۿ]/.test(all));
});
