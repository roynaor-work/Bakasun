import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netOf, templateFor, rfqText, rfqSubject, rfqReminder, rfqDecline, pendingRequests, parseOffer, compareRows, compareHtml, specLines } from '../js/logic/rfq.js';

const cs = { id: 'k1', client: 'ארגון שוב״ל', kind: 'סמינר צוות', date: '2026-10-19', participants: 18, status: 'הצעה נשלחה' };
const hotel = { id: 's1', name: 'מלון דניאל הרצליה', contact: 'אורי שגב', type: 'מלונות', email: 'a@b.co', lang: 'he' };

test('a hotel request in her voice, in the client name, with nights counted', () => {
  const spec = { checkIn: '2026-10-19', checkOut: '2026-10-20', singles: 16, board: 'חצי פנסיון', meeting: 'אולם ל-20 בישיבת U', av: 'on', splits: 'חלק מגיעים בערב' };
  const txt = rfqText(cs, hotel, 'hotel', spec, { firstContact: true, replyBy: '2026-10-01' });
  assert.match(txt, /^היי היי אורי, מה שלומך\?\nנעים מאוד, שמי וירג׳יני מארגון שוב״ל\.\nאנחנו מארגנים סמינר צוות ל-18 משתתפים:\n• כניסה: 19\/10\/2026\n• יציאה: 20\/10\/2026\n• לילות: 1\n• חדרי סינגל: 16\n• בסיס אירוח: חצי פנסיון/);
  assert.match(txt, /• מסך ומקרן: כן\n• פיצולים \(חלק מגיעים אחר כך\): חלק מגיעים בערב\nאשמח לבדוק זמינות ולקבל הצעת מחיר עד 01\/10\/2026\./);
  assert.match(txt, /וירג׳יני 054-4974644$/);
  assert.equal(templateFor('מלונות'), 'hotel'); assert.equal(templateFor('דפוס ומיתוג'), 'print'); assert.equal(templateFor('הסעות'), 'transport');
  assert.equal(rfqSubject(cs, 'hotel'), 'בקשת הצעת מחיר וזמינות · סמינר צוות · 19/10/2026 · ארגון שוב״ל');
  const en = rfqText(cs, Object.assign({}, hotel, { lang: 'en', contact: 'Claudia' }), 'hotel', spec, { asClient: false });
  assert.match(en, /^Hi Claudia, hope you are doing well!\nWe are planning a סמינר צוות for 18:\n• Check-in: 19\/10\/2026/);
  assert.doesNotMatch(en, /שוב״ל/);
  assert.deepEqual(specLines('print', { items: 'תגי שם 20\nתוכניות 100', due: '2026-10-15' }, 'he'), ['פריטים וכמויות (שורה לכל פריט):', '• תגי שם 20', '• תוכניות 100', 'מוכן עד: 15/10/2026']);
});

test('the reminder, the polite no, and who is still waiting', () => {
  assert.equal(rfqReminder(cs, hotel, 1), 'היי אורי, מזכירה לגבי הבקשה ששלחתי על סמינר צוות · 19/10/2026 לפני יום. זה די דחוף, אשמח שתחזרו אליי היום. תודה רבה!\nוירג׳יני');
  assert.match(rfqDecline(cs, hotel), /^היי אורי, תודה רבה על ההצעה\. הפעם סגרנו במקום אחר/);
  const links = [{ id: 'l1', caseId: 'k1', supplierId: 's1', status: 'ביקשנו הצעה', askedAt: '2026-09-26' }, { id: 'l2', caseId: 'k1', supplierId: 's2', status: 'ביקשנו הצעה', askedAt: '2026-09-28' }, { id: 'l3', caseId: 'k1', supplierId: 's3', status: 'ביקשנו הצעה', askedAt: '2026-09-20', answeredAt: '2026-09-21' }];
  const p = pendingRequests(links, [cs], [hotel], '2026-09-28', 1);
  assert.deepEqual(p.map(x => [x.id, x.waited, x.sup.name]), [['l1', 2, 'מלון דניאל הרצליה']]);
});

test('an offer pasted from a hotel mail is split into the fields she compares', () => {
  const o = parseOffer('היי וירג׳יני, מצורפת הצעה:\nאולם 3,000 ש"ח\nארוחת צהריים 120 ש"ח לאדם\nהגברה ומסך 1,500\nכולל חניה וקפה בהפסקות\nמדיניות ביטול: עד 14 יום ללא חיוב, אחרי כן 50%\nמקדמה 30% במעמד ההזמנה\nתנאי תשלום שוטף+30');
  assert.equal(o.venue, 3000); assert.equal(o.perPerson, 120); assert.equal(o.av, 1500);
  assert.match(o.cancellation, /^מדיניות ביטול: עד 14 יום/); assert.match(o.deposit, /^מקדמה 30%/); assert.match(o.terms, /^תנאי תשלום שוטף\+30/); assert.match(o.included, /^כולל חניה/);
  const o2 = parseOffer('Total 12,500 NIS + VAT, deposit 20%, cancellation free up to 30 days');
  assert.equal(o2.total, 12500); assert.match(o2.deposit, /deposit 20%/i);
});

test('comparison rows cheapest first, suppliers without an offer last, and the page', () => {
  const links = [
    { id: 'l1', caseId: 'k1', supplierId: 's1', status: 'הצעה התקבלה', offer: { total: 9000, included: 'קפה', cancellation: 'עד 14 יום', deposit: '30%', terms: 'שוטף+30', verdict: 'שווה' } },
    { id: 'l2', caseId: 'k1', supplierId: 's2', status: 'הצעה התקבלה', offer: { total: 7200, perPerson: 400 }, chosen: 'כן' },
    { id: 'l3', caseId: 'k1', supplierId: 's3', status: 'ביקשנו הצעה' },
    { id: 'l4', caseId: 'k1', supplierId: 's4', status: 'בוטל', offer: { total: 100 } }
  ];
  const sups = [hotel, { id: 's2', name: 'מלון השרון', type: 'מלונות' }, { id: 's3', name: 'דן פנורמה', type: 'מלונות' }];
  const rows = compareRows(links, sups, 18);
  assert.deepEqual(rows.map(r => [r.supplier, r.total, r.perPerson, r.hasOffer]), [['מלון השרון', 7200, 400, true], ['מלון דניאל הרצליה', 9000, 500, true], ['דן פנורמה', 0, 0, false]]);
  const html = compareHtml(cs, rows, 'en');
  assert.match(html, /<html dir="ltr" lang="en">/); assert.match(html, /Offers comparison/); assert.match(html, /מלון השרון ★/); assert.doesNotMatch(html, /שווה/);
  assert.match(compareHtml(cs, rows, 'he', true), /שווה/);
});

test('offers: "including VAT" is recognised and compared net; the currency is read; "+ VAT" stays net', () => {
  const gross = parseOffer('סה"כ 11,800 ש"ח כולל מע"מ, מקדמה 30%');
  assert.equal(gross.incl, true); assert.equal(gross.currency, 'ILS'); assert.equal(netOf(gross.total, gross.incl, 18), 10000);
  const net = parseOffer('Total 12,500 NIS + VAT'); assert.equal(net.incl, false);
  const eur = parseOffer('Total 4 200 € TTC per group'); assert.equal(eur.currency, 'EUR'); assert.equal(eur.incl, true);
  const ht = parseOffer('Total 4 200 € HT'); assert.equal(ht.incl, false);
  const usd = parseOffer('Total $3,000 incl. VAT'); assert.equal(usd.currency, 'USD'); assert.equal(usd.incl, true);
  const rows = compareRows([{ id: 'a', supplierId: 's1', offer: { total: 11800, incl: true } }, { id: 'b', supplierId: 's2', offer: { total: 10500 } }], [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }], 10, 18);
  assert.deepEqual(rows.map(r => [r.supplier, r.total, r.incl]), [['A', 10000, true], ['B', 10500, false]], 'the gross offer is cheaper once compared net');
});
