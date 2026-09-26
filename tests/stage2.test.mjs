/* Stage-2 logic: quotes without a price list, groups, and the cloud merge. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Office from '../js/logic/office.js';
import { priceFromCost, marginOf, recommendedLines, recommendedSupplierTypes, lastCost, resolveLines, translator, catalogAll } from '../js/logic/quotes.js';
import { parsePeople, makeContainers, summary, autoFill, containerText } from '../js/logic/groups.js';

test('price from cost and margin, and back', () => {
  assert.equal(priceFromCost(100, 25), 125); assert.equal(priceFromCost('1,000', 0), 1000); assert.equal(priceFromCost('', 25), 0);
  assert.equal(marginOf(100, 125), 20); assert.equal(marginOf(0, 0), 0);
});
test('recommended lines follow the kind of event and the head count', () => {
  const ls = recommendedLines('יום גיבוש', '40');
  assert.ok(ls.some(l => l.item === 'אוטובוס')); assert.equal(ls.find(l => l.item === 'ארוחה').qty, 40); assert.equal(ls.find(l => l.item === 'אוטובוס').qty, 1);
  assert.equal(ls.find(l => l.item === 'ארוחה').fr, 'Repas');
  assert.deepEqual(recommendedSupplierTypes('יום גיבוש').slice(0, 2), ['הסעות', 'מדריכי טיולים']);
  const own = recommendedLines('חתונה', '120-150', { 'חתונה': ['ארוחה', 'לא קיים'] }, [{ item: 'ארוחה', unit: 'משתתף', en: 'Dinner', fr: 'Dîner', category: 'אוכל' }]);
  assert.equal(own.length, 1); assert.equal(own[0].en, 'Dinner'); assert.equal(own[0].qty, 120);
});
test('resolveLines fills the price from cost + margin unless a price is typed; totals follow', () => {
  const lines = resolveLines([{ item: 'ארוחה', qty: 40, cost: 100, margin: '' }, { item: 'DJ', qty: 1, cost: 2000, margin: 50 }, { item: 'הפקה', qty: 1, cost: 0, price: 3000 }], 25);
  assert.deepEqual(lines.map(l => l.price), [125, 3000, 3000]);
  const tot = Office.quoteTotals(lines, 18);
  assert.equal(tot.net, 11000); assert.equal(tot.cost, 6000); assert.equal(tot.gross, 12980);
});
test('last cost from a supplier and the PDF translator', () => {
  const quotes = [{ date: '2026-01-01', lines: [{ supplierId: 's1', item: 'ארוחה', cost: 90 }] }, { date: '2026-05-01', lines: [{ supplierId: 's1', item: 'ארוחה', cost: 110, price: 140 }] }];
  assert.equal(lastCost('s1', 'ארוחה', quotes).cost, 110); assert.equal(lastCost('s2', 'ארוחה', quotes), null);
  const tr = translator({ 'יום גיבוש': { fr: 'Journée team building' } });
  assert.equal(tr('ארוחה', 'fr'), 'Repas'); assert.equal(tr('משתתף', 'en'), 'guest'); assert.equal(tr('יום גיבוש', 'fr'), 'Journée team building'); assert.equal(tr('משהו אחר', 'fr'), 'משהו אחר');
  const html = Office.quoteHtml({ no: 'BS-2026-001', date: '2026-09-26', lang: 'fr', vatRate: 18, lines: resolveLines([{ item: 'ארוחה', unit: 'משתתף', qty: 40, cost: 100 }], 25) }, { client: 'Famille Cohen', kind: 'יום גיבוש' }, { name: 'Baka Sun' }, tr);
  assert.match(html, /Devis/); assert.match(html, /Repas/); assert.match(html, /Journée team building/); assert.match(html, /dir="ltr"/);
  assert.ok(catalogAll([]).length > 20);
});

test('groups: parse names, place people, count and overflow', () => {
  const people = parsePeople('1. דנה לוי, צמחונית\nMarc Cohen\n• Sarah Green; יוסי\nדנה לוי');
  assert.deepEqual(people.map(p => p.name), ['דנה לוי', 'Marc Cohen', 'Sarah Green', 'יוסי']); assert.equal(people[0].note, 'צמחונית');
  const cs = makeContainers('אוטובוסים', 2, 3, 'he');
  assert.equal(cs[1].name, 'אוטובוס 2');
  const placed = autoFill(people, cs);
  assert.deepEqual(placed.map(p => p.group), ['g1', 'g1', 'g1', 'g2']);
  const sm = summary(placed.concat([{ name: 'x', group: 'g1' }]), cs);
  assert.equal(sm.containers[0].count, 4); assert.equal(sm.containers[0].over, 1); assert.equal(sm.unassigned.length, 0);
  assert.match(containerText(cs[0], placed, { date: '2026-10-05', client: 'טכנו' }), /^אוטובוס 1 · 05\/10\/2026 · טכנו \(3\)\n1\. דנה לוי · צמחונית/);
});

test('cloud merge: newer wins, deletes remove, settings fill in', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { db } = await import('../js/store.js');
  db.put('cases', { id: 'a', client: 'A', updated: '2026-01-01' });
  const local = db.get('cases', 'a');
  db.mergeRemote([{ col: 'cases', id: 'a', data: { id: 'a', client: 'A-cloud', updated: '2000-01-01' } }, { col: 'cases', id: 'b', data: { id: 'b', client: 'B', updated: '2026-02-02' } }], [{ key: 'vat', value: '17' }]);
  assert.equal(db.get('cases', 'a').client, 'A', 'the local record is newer and stays'); assert.equal(db.get('cases', 'b').client, 'B'); assert.equal(db.setting('vat'), '17');
  db.mergeRemote([{ col: 'cases', id: 'a', data: { id: 'a', client: 'A2', updated: '2999-01-01' } }, { col: 'cases', id: 'b', deleted: true, data: {} }], []);
  assert.equal(db.get('cases', 'a').client, 'A2'); assert.equal(db.get('cases', 'b'), null);
  assert.ok(local.updated > '2026-01-01', 'put stamps updated');
});

test('quick note: the subject is guessed from the text', async () => {
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  const { guessSubject } = await import('../js/notes.js');
  const list = [{ key: 'client:1', names: ['טכנו-גליל בע״מ', 'דנה לוי'] }, { key: 'supplier:2', names: ['הגברה יוסי', 'יוסי'] }, { key: 'client:3', names: ['Famille Cohen', 'Marc Cohen'] }];
  assert.equal(guessSubject('דנה לוי אוהבת יין אדום', list).key, 'client:1');
  assert.equal(guessSubject('יוסי ספק מצוין', list).key, 'supplier:2');
  assert.equal(guessSubject('marc cohen préfère les appels', list).key, 'client:3');
  assert.equal(guessSubject('סתם הערה', list), null);
});
