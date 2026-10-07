import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glossaryTranslate, hasHebrew } from '../js/logic/translate.js';
import { offerSummary, compareRows } from '../js/logic/rfq.js';

test('the trade glossary turns her terms into English and French, numbers kept', () => {
  assert.equal(glossaryTranslate('מדיניות ביטול: עד 14 יום ללא חיוב, אחרי כן 50%', 'en'), 'cancellation policy: free cancellation up to 14 days before, after that 50%');
  assert.equal(glossaryTranslate('מקדמה 30% במעמד ההזמנה, יתרה שוטף+30', 'en'), '30% deposit on booking, balance net 30 days (end of month + 30)');
  assert.equal(glossaryTranslate('חצי פנסיון, 16 חדרי סינגל, כולל חניה וקפה בהפסקות', 'en'), 'half board, 16 single rooms, including parking and coffee breaks');
  assert.equal(glossaryTranslate('מקדמה 30% במעמד ההזמנה', 'fr'), 'acompte de 30 % à la réservation');
  assert.equal(hasHebrew(glossaryTranslate('120 ש"ח לאדם + מע"מ', 'en')), false);
  assert.equal(glossaryTranslate('120 ש"ח לאדם + מע"מ', 'en'), '120 ILS per person + VAT');
});

test('the client summary in English, with open points and the recommended one starred', () => {
  const cs = { client: 'Client Test', kind: 'Dinner', date: '2026-11-19', participants: 24 };
  const links = [{ id: 'l1', supplierId: 's1', status: 'הצעה התקבלה', chosen: 'כן', offer: { total: 9000, perPerson: 375, included: 'wine and coffee', cancellation: 'free cancellation up to 14 days before', deposit: '30% deposit on booking', terms: 'net 30 days' } },
    { id: 'l2', supplierId: 's2', status: 'הצעה התקבלה', offer: { total: 11000, venue: 3000, food: 8000 } }, { id: 'l3', supplierId: 's3', status: 'ביקשנו הצעה' }];
  const sups = [{ id: 's1', name: 'Supplier A' }, { id: 's2', name: 'Supplier B' }, { id: 's3', name: 'Supplier C' }];
  const txt = offerSummary(cs, compareRows(links, sups, 24), 'en', { names: 'TestContactA and TestContactB', openPoints: ['final number of guests', 'vegetarian options'] });
  assert.match(txt, /^Hi TestContactA and TestContactB, hope you are doing well!\nHere is a summary of the offers we received for Dinner · 19\/11\/2026 · 24 participants:\n\n\* Supplier A ★\n  - Total before VAT: 9,000 ₪ \(375 ₪ per person\)\n  - Included: wine and coffee\n  - Cancellation: free cancellation up to 14 days before/);
  assert.match(txt, /\* Supplier B\n  - Total before VAT: 11,000 ₪ \(458\.33 ₪ per person\)\n  - Venue 3,000 ₪, Food 8,000 ₪/);
  assert.match(txt, /Open points:\n\* final number of guests\n\* vegetarian options\n\nMy recommendation is marked with a star/);
  assert.match(txt, /As always, I am available for any question\.\nBest,\nVirginie$/);
  assert.doesNotMatch(txt, /Supplier C/);
});
