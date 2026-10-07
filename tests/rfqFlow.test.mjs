import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RFQ_DRAFT, draftRequest, sentRequest, chooseOffer, declineCandidates, validSpec, validOffer } from '../js/logic/rfqFlow.js';
import { parseOffer, compareRows, compareHtml, pendingRequests, rfqText, rfqReminder, rfqDecline, offerMoney, netOf } from '../js/logic/rfq.js';
import { RFQ } from '../js/i18n/rfq.js';

const cs = { id: 'test-case', client: 'ארגון בדיקה', kind: 'סמינר', status: 'הצעה נשלחה', participants: 10 };
const sups = [
  { id: 'test-a', name: 'ספק בדיקה א', type: 'מלונות' },
  { id: 'test-b', name: 'ספק בדיקה ב', type: 'מלונות' },
  { id: 'test-c', name: 'ספק בדיקה ג', type: 'הסעות' }
];
const draft = () => ({ ...draftRequest(cs, sups[0], 'hotel', { singles: '5' }, '2026-10-10'), id: 'test-link' });

test('preparing a request stays a resumable draft and never enters the silent-supplier list', () => {
  const l = draft();
  assert.equal(l.status, RFQ_DRAFT); assert.equal(l.askedAt, '');
  assert.deepEqual(pendingRequests([l], [cs], sups, '2026-10-12', 1), []);
  const resumed = draftRequest(cs, sups[0], 'hotel', { singles: '6' }, '2026-10-11', { ...l, requestText: 'edited draft' });
  assert.equal(resumed.id, l.id); assert.equal(resumed.requestText, 'edited draft'); assert.equal(resumed.spec.singles, '6');
});

test('a confirmed manual send starts waiting; repeated sends and reminders preserve the original age', () => {
  const l = { ...draft(), ...sentRequest(draft(), 'manual', '2026-10-07', 'sent text') };
  assert.equal(l.status, 'ביקשנו הצעה'); assert.equal(l.askedAt, '2026-10-07'); assert.equal(l.requestText, 'sent text');
  const reminder = { ...l, ...sentRequest(l, 'email', '2026-10-09', 'reminder text', true) };
  assert.equal(reminder.askedAt, '2026-10-07'); assert.equal(reminder.remindedAt, '2026-10-09');
  assert.equal(reminder.requestText, 'sent text'); assert.equal(reminder.reminderText, 'reminder text');
  assert.equal(pendingRequests([reminder], [cs], sups, '2026-10-09', 1)[0].waited, 2);
  assert.equal(sentRequest(reminder, 'whatsapp', '2026-10-10', 'new text').askedAt, '2026-10-07');
});

test('answered, cancelled and inactive cases do not get reminders; resend never clears an answer', () => {
  const l = { ...draft(), status: 'הצעה התקבלה', askedAt: '2026-10-07', answeredAt: '2026-10-08' };
  const resent = { ...l, ...sentRequest(l, 'email', '2026-10-09', 'text') };
  assert.equal(resent.answeredAt, l.answeredAt); assert.equal(resent.status, l.status);
  assert.deepEqual(pendingRequests([resent, { ...l, answeredAt: '', status: 'בוטל' }], [cs], sups, '2026-10-10', 1), []);
  assert.deepEqual(pendingRequests([{ ...l, answeredAt: '', status: 'ביקשנו הצעה' }], [{ ...cs, status: 'ירד' }], sups, '2026-10-10', 1), []);
});

test('choosing another hotel clears the previous hotel choice but leaves the transport winner', () => {
  const links = [
    { id: 'a', supplierId: sups[0].id, chosen: 'כן', offer: { total: 500 }, status: 'אושר' },
    { id: 'b', supplierId: sups[1].id, offer: { total: 600 }, status: 'הצעה התקבלה' },
    { id: 'c', supplierId: sups[2].id, chosen: 'כן', offer: { total: 700 }, status: 'אושר' }
  ];
  const patches = chooseOffer(links, sups, 'b');
  assert.deepEqual(patches, [{ id: 'a', chosen: 'לא', status: 'הצעה התקבלה' }, { id: 'b', chosen: 'כן', status: 'אושר' }]);
  assert.deepEqual(chooseOffer(links, sups, 'missing'), []);
  assert.deepEqual(chooseOffer([{ id: 'draft', status: RFQ_DRAFT }], sups, 'draft'), []);
  assert.deepEqual(declineCandidates(links, sups).map(l => l.id), ['b']);
  assert.deepEqual(declineCandidates([links[0], { ...links[2], chosen: 'לא', status: 'הצעה התקבלה' }], sups), [], 'unselected services must not be declined');
});

test('offer numbers keep thousands and cents in Hebrew, English and French; no mixed-unit sum is invented', () => {
  for (const [text, expected] of [
    ['Total $3,000.50 incl. VAT', 3000.5], ['Total 4 200,50 € TTC', 4200.5],
    ['סה״כ 1,500.25 ₪ + מע״מ', 1500.25], ['Total 4\u202f200,50 € HT', 4200.5]
  ]) assert.equal(parseOffer(text).total, expected, text);
  const french = parseOffer('Total 4 200,50 € TTC\nInclus : café\nAnnulation : 14 jours\nAcompte : 20%\nConditions de paiement : 30 jours');
  assert.equal(parseOffer('Total 120 € TTC, TVA 20%').vatPct, 20);
  assert.equal(french.incl, true); assert.equal(french.currency, 'EUR'); assert.match(french.deposit, /20%/);
  assert.equal(parseOffer('אולם 3000\nאוכל 120 ₪ לאדם\nהגברה 500').total, '');
});

test('different services/currencies form separate comparison groups; waiting rows and unknown prices are distinct', () => {
  const links = [
    { id: 'a', supplierId: sups[0].id, offer: { total: 1180, incl: true, currency: 'ILS', vatPct: 18 } },
    { id: 'b', supplierId: sups[1].id, offer: { total: 50, currency: 'EUR' } },
    { id: 'c', supplierId: sups[2].id, offer: { total: 10, currency: 'ILS' } },
    { id: 'd', supplierId: sups[0].id, offer: { text: 'Quote without price', currency: 'ILS' } },
    { id: 'e', supplierId: sups[0].id, status: 'ביקשנו הצעה' }
  ];
  const rows = compareRows(links, sups, 10);
  assert.deepEqual(rows.map(r => r.id), ['b', 'a', 'd', 'e', 'c']);
  assert.equal(rows.find(r => r.id === 'a').total, 1000);
  assert.equal(rows.find(r => r.id === 'd').hasOffer, true); assert.equal(rows.find(r => r.id === 'd').total, 0);
  assert.equal(rows.find(r => r.id === 'e').hasOffer, false);
});

test('per-person-only offers get a labelled calculation; partial components never pretend to be a complete total', () => {
  const rows = compareRows([
    { id: 'per', supplierId: sups[0].id, offer: { perPerson: 11.8, incl: true } },
    { id: 'parts', supplierId: sups[1].id, offer: { perPerson: 100, venue: 500 } }
  ], sups, 10);
  assert.equal(rows[0].id, 'per'); assert.equal(rows[0].total, 100); assert.equal(rows[0].calculated, true);
  assert.equal(rows[1].total, 0); assert.equal(rows[1].calculated, false);
  assert.equal(netOf(10.5, true, 0), 10.5);
  assert.equal(offerMoney(10.5, 'EUR'), '10.5 €');
});

test('exports show every monetary column in its currency and keep internal judgements private', () => {
  const rows = compareRows([{ id: 'a', supplierId: sups[0].id, offer: { total: 1000, perPerson: 100, venue: 500, food: 400, av: 100, currency: 'EUR', note: '<internal>', verdict: 'יקר', included: '<script>test</script>' } }], sups, 10);
  for (const language of ['he', 'fr', 'en']) {
    const html = compareHtml(cs, rows, language);
    assert.match(html, /1,000 €/); assert.match(html, /500 €/); assert.doesNotMatch(html, /₪/);
    assert.doesNotMatch(html, /internal|יקר|<script>/); assert.match(html, /&lt;script&gt;/);
    assert.match(html, new RegExp('lang="' + language + '"'));
  }
  assert.match(compareHtml(cs, rows, 'he', true), /&lt;internal&gt;/);
  const unknown = compareRows([{ offer: { text: 'Pending price' }, supplierId: sups[0].id }], sups, 10);
  assert.match(compareHtml(cs, unknown, 'en'), /Price not specified/);
});

test('all supplier messages use the provided signature phone and have no default contact details', () => {
  for (const language of ['he', 'fr', 'en']) {
    const sup = { ...sups[0], lang: language };
    for (const text of [rfqText(cs, sup, 'hotel', {}, { phone: 'PHONE_FROM_SETTINGS' }), rfqReminder(cs, sup, 1, { phone: 'PHONE_FROM_SETTINGS' }), rfqDecline(cs, sup, { phone: 'PHONE_FROM_SETTINGS' })]) {
      assert.match(text, /PHONE_FROM_SETTINGS$/);
      assert.match(text, language === 'he' ? /וירג'יני/ : /Virginie/);
      assert.doesNotMatch(text, new RegExp('[\\u0600-\\u06ff]'));
    }
  }
  assert.doesNotMatch(rfqText(cs, sups[0], 'hotel', {}), /\d{7,}/);
});

test('forms reject invalid dates, quantities, amounts and VAT without hiding unknown prices', () => {
  assert.equal(validSpec('hotel', { checkIn: '2026-10-10', checkOut: '2026-10-10' }), false);
  assert.equal(validSpec('hotel', { singles: '-1' }), false);
  assert.equal(validSpec('transport', { passengers: '1.5' }), false);
  assert.equal(validSpec('hotel', { checkIn: '2026-10-10', checkOut: '2026-10-11', singles: '5' }), true);
  const offer = { total: '100', currency: 'EUR', vatPct: '18' };
  assert.equal(validOffer(offer), true);
  for (const change of [{ total: '-1' }, { total: 'NaN' }, { currency: 'XXX' }, { vatPct: '101' }, { vatPct: '-1' }]) assert.equal(validOffer({ ...offer, ...change }), false);
  assert.equal(validOffer({ currency: 'ILS', vatPct: '0', text: 'Quote pending amount' }), true);
  assert.equal(validOffer({ currency: 'ILS', vatPct: '18' }), false);
});

test('every new UI key has a translation in all three languages', () => {
  for (const language of ['fr', 'en']) assert.deepEqual(Object.keys(RFQ[language]).sort(), Object.keys(RFQ.he).sort());
});
