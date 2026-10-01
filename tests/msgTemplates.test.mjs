import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillFrom, fillText, fillSubject, missingIn, listTemplates, templateByKey, byAudience, searchTemplates, parseTemplateRequest, pickLang, findTemplateKey } from '../js/logic/msgTemplates.js';
import { MESSAGE_TEMPLATES, INSURANCE, PLACEHOLDERS } from '../js/data/messageTemplates.js';
import { hasArabic } from '../js/logic/core.js';

const cs = { id: 'c1', client: 'ארגון שוב״ל', clientId: 'k1', contact: 'ענת כהן-לוי', kind: 'יום גיבוש', date: '2026-10-19', place: 'הרצליה', participants: '16-20', days: '2', rooms: '16', phone: '', email: 'anat@example.org' };
const client = { id: 'k1', name: 'ארגון שוב״ל', legalName: 'עמותת שוב״ל', taxId: '580123456', contact: 'ענת כהן-לוי', email: 'anat@example.org', lang: 'he' };
const supplier = { id: 's1', name: 'מלון דניאל הרצליה (תמרס)', contact: 'אורי שגב', email: 'arbel@example.com', phone: '050-1234567', lang: 'he' };
const settings = { insurancePolicy: '9900000000001', insurancePeriod: '01/05/2026 עד 30/04/2027', insuranceLimits: 'צד ג׳ 1,000,000$ · אחריות מקצועית 1,000,000$ · מעבידים 5,000,000$', signer: 'וירג׳יני מנדל נאור\nבאקה סאן בע״מ', bankDetails: 'בנק לאומי (10), סניף 954, [bank-removed]', bizPhone: '054-4974644', terms: 'מקדמה 30% בחתימה, היתרה עד שבוע אחרי האירוע' };

test('the eight built-ins exist in three languages, without Arabic letters or stray braces', () => {
  assert.deepEqual(MESSAGE_TEMPLATES.map(t => t.key), ['insuranceCert', 'hotelQuote', 'bookingConfirm', 'paymentReminder', 'supplierBrief', 'thankYou', 'rsvpReminder', 'supplierFollowUp']);
  MESSAGE_TEMPLATES.forEach(tp => ['he', 'fr', 'en'].forEach(L => {
    assert.ok(tp.title[L] && tp.body[L] && tp.subject[L], tp.key + ' ' + L);
    assert.ok(!hasArabic(tp.body[L]) && !hasArabic(tp.title[L]), tp.key + ' arabic ' + L);
    (tp.body[L].match(/\{([^{}]+)\}/g) || []).forEach(p => assert.ok(PLACEHOLDERS[p.slice(1, -1)], tp.key + ' unknown placeholder ' + p));
  }));
  assert.equal(INSURANCE.email, 'info@cooper-ninve.com'); assert.deepEqual(INSURANCE.of({}), { policyNo: '', period: '', limits: '' }); assert.equal(INSURANCE.of({ insurancePolicy: '123' }).policyNo, '123');
});

test('insurance request: client legal name, company number, event, policy data; what she must fill stays visible', () => {
  const tp = templateByKey('insuranceCert');
  const he = fillFrom(tp, { case: cs, client, settings }, 'he');
  assert.match(he, /עמותת שוב״ל/); assert.match(he, /580123456/); assert.match(he, /יום גיבוש, 19\/10\/2026, הרצליה/);
  assert.match(he, /9900000000001/); assert.match(he, /01\/05\/2026 עד 30\/04\/2027/); assert.match(he, /5,000,000\$/);
  assert.match(he, /【מה הלקוח דורש באישור】/); assert.ok(he.endsWith('וירג׳יני מנדל נאור\nבאקה סאן בע״מ'));
  assert.deepEqual(missingIn(he), ['מה הלקוח דורש באישור']);
  const en = fillFrom(tp, { case: cs, client, settings, extra: { requirements: 'Additional insured + waiver of subrogation' } }, 'en');
  assert.match(en, /Team-building day, 19\/10\/2026, Herzliya|Team-building day, 19\/10\/2026, הרצליה/); assert.match(en, /Additional insured/); assert.equal(missingIn(en).length, 0);
  assert.equal(fillSubject(tp, { case: cs, client }, 'fr'), 'Attestation d’assurance : עמותת שוב״ל, Journée team building 19/10/2026');
});

test('hotel quote: nights from the days of the case, rooms, people; choices from extra; unknown fields labelled in the message language', () => {
  const tp = templateByKey('hotelQuote');
  const fr = fillFrom(tp, { case: cs, supplier, settings, extra: { kosher: 'Oui', board: 'Demi-pension' } }, 'fr');
  assert.match(fr, /^Bonjour אורי,/); assert.match(fr, /Nuits : 1\n/); assert.match(fr, /Chambres : 16\n/); assert.match(fr, /Participants : 16-20\n/);
  assert.match(fr, /Casher : Oui/); assert.match(fr, /Formule : Demi-pension/); assert.match(fr, /Salle de réunion : 【salle de réunion : oui\/non】/);
  assert.deepEqual(missingIn(fr), ['salle de réunion : oui/non']);
});

test('payment reminder: amount and due date from the payment, bank details from the settings, else placeholders', () => {
  const tp = templateByKey('paymentReminder');
  const pay = { amount: 5400, due: '2026-10-25', invoiceNo: '1043' };
  const he = fillFrom(tp, { case: cs, client, payment: pay, settings }, 'he');
  assert.match(he, /5,400 ₪, חשבונית 1043, לתשלום עד 25\/10\/2026/); assert.match(he, /בנק לאומי \(10\), סניף 954/); assert.match(he, /^היי היי ענת, מה שלומך\?/);
  const bare = fillFrom(tp, { case: cs, client, settings: {} }, 'en');
  assert.match(bare, /【amount】, invoice 【invoice number】, due by 【due date】/); assert.match(bare, /\n【bank details】\n/); assert.match(bare, /\n【signature】$/);
  const x = fillFrom(tp, { case: cs, client, payment: pay, settings, extra: { amount: '12000', dueDate: '2026-11-01' } }, 'fr');
  assert.match(x, /12,000 ₪, facture 1043, à régler avant le 01\/11\/2026/);
});

test('booking confirmation, brief, thank-you, rsvp, follow-up fill from case, link, settings and extra', () => {
  const bc = fillFrom(templateByKey('bookingConfirm'), { case: cs, client, settings, extra: { price: 18000 } }, 'he');
  assert.match(bc, /מחיר: 18,000 ₪ לפני מע״מ/); assert.match(bc, /תנאי תשלום: מקדמה 30%/);
  const br = fillFrom(templateByKey('supplierBrief'), { case: cs, supplier, link: { arrive: '07:30', what: 'הגברה' }, settings, extra: { parking: 'חניון המלון, קומה -1' } }, 'he');
  assert.match(br, /הגעה: 07:30/); assert.match(br, /חניה: חניון המלון/); assert.match(br, /איש קשר בשטח: וירג׳יני מנדל נאור 054-4974644/); assert.match(br, /כתובת: 【כתובת】/);
  const ty = fillFrom(templateByKey('thankYou'), { case: cs, client, settings }, 'en');
  assert.match(ty, /^Hi ענת,\nThank you so much for the Team-building day on 19\/10\/2026!/);
  const rs = fillFrom(templateByKey('rsvpReminder'), { case: cs, client, settings, extra: { rsvpBy: '2026-10-12' } }, 'he');
  assert.match(rs, /^שלום לכולם,/); assert.match(rs, /יום גיבוש של ארגון שוב״ל יתקיים ב-19\/10\/2026 בהרצליה/); assert.match(rs, /עד 12\/10\/2026/);
  const fu = fillFrom(templateByKey('supplierFollowUp'), { case: cs, supplier, link: { what: 'לינה 19-20/10, חדרי סינגל' }, settings }, 'fr');
  assert.match(fu, /Ce que nous avons demandé : לינה 19-20\/10, חדרי סינגל/); assert.match(fu, /Journée team building de ארגון שוב״ל \(19\/10\/2026\)/);
});

test('fillText: aliases in her own templates, no double blank lines, trailing spaces removed', () => {
  assert.equal(fillText('היי {שם}, {תאריך} ב{מקום} {prix}', { contact: 'דנה', date: '18/10/2026', place: 'שפיים', price: '100 ₪' }, 'he'), 'היי דנה, 18/10/2026 בשפיים 100 ₪');
  assert.equal(fillText('A {name}  \n\n\n\nB {nom}', { contact: 'Marc' }, 'fr'), 'A Marc\n\nB Marc');
  assert.equal(fillText('{unknownThing}', {}, 'en'), '【unknownThing】');
  const custom = templateByKey('custom:סיור', [{ name: 'סיור', text: 'היי {שם}, נתאם סיור ל{event}? {signer}' }]);
  assert.equal(custom.custom, true);
  assert.equal(fillFrom(custom, { case: cs, client, settings }, 'he'), 'היי ענת, נתאם סיור ליום גיבוש? וירג׳יני מנדל נאור\nבאקה סאן בע״מ');
});

test('listTemplates merges the built-ins with her saved templates; grouping and search', () => {
  const mine = [{ name: 'סיור', text: 'היי {שם}, נתאם סיור?' }, { name: '', text: 'x' }];
  const list = listTemplates('en', mine);
  assert.equal(list.length, 9); assert.equal(list[0].title, 'Certificate of insurance request'); assert.equal(list[0].to, 'agency');
  assert.deepEqual(list[8], { key: 'custom:סיור', to: 'custom', title: 'סיור', body: 'היי {שם}, נתאם סיור?', fields: [], custom: true });
  assert.equal(listTemplates('xx', []).length, 8); assert.equal(listTemplates('xx', [])[0].title, 'בקשת אישור ביטוח (לסוכנות)');
  assert.deepEqual(byAudience('he', mine).map(g => g.audience + ':' + g.items.length), ['client:3', 'supplier:3', 'agency:1', 'participants:1', 'custom:1']);
  assert.deepEqual(searchTemplates(list, 'insurance').map(x => x.key), ['insuranceCert']);
  assert.deepEqual(searchTemplates(listTemplates('he', mine), 'סיור').map(x => x.key), ['custom:סיור']);
  assert.equal(searchTemplates(list, '').length, 9);
  assert.equal(templateByKey('nope'), null); assert.equal(templateByKey('custom:x', mine), null); assert.equal(templateByKey('סיור', mine).key, 'custom:סיור');
  assert.equal(findTemplateKey('תודה אחרי האירוע', 'he', mine), 'thankYou'); assert.equal(findTemplateKey('rsvp', 'en'), 'rsvpReminder'); assert.equal(findTemplateKey('סיור', 'he', mine), 'custom:סיור');
});

test('parseTemplateRequest reads the spoken request in three languages', () => {
  assert.deepEqual(parseTemplateRequest('תכיני בקשת אישור ביטוח לחריש'), { key: 'insuranceCert', who: 'חריש' });
  assert.deepEqual(parseTemplateRequest("prépare la demande d'attestation d'assurance pour Harish"), { key: 'insuranceCert', who: 'Harish' });
  assert.deepEqual(parseTemplateRequest('prepare a hotel quote request for Shoval'), { key: 'hotelQuote', who: 'Shoval' });
  assert.deepEqual(parseTemplateRequest('תזכורת תשלום לשובל'), { key: 'paymentReminder', who: 'שובל' });
  assert.deepEqual(parseTemplateRequest('תכיני הצעת מחיר למלון לשובל בבקשה'), { key: 'hotelQuote', who: 'שובל' });
  assert.deepEqual(parseTemplateRequest('אישור הזמנה לברטלסמן'), { key: 'bookingConfirm', who: 'ברטלסמן' });
  assert.deepEqual(parseTemplateRequest('rappel de paiement pour la mairie de Harish'), { key: 'paymentReminder', who: 'mairie de Harish' });
  assert.deepEqual(parseTemplateRequest('תדריך לספק הגברה יוסי'), { key: 'supplierBrief', who: 'הגברה יוסי' });
  assert.deepEqual(parseTemplateRequest('send a thank-you to Bertelsmann'), { key: 'thankYou', who: 'Bertelsmann' });
  assert.deepEqual(parseTemplateRequest('תזכורת אישור הגעה למשתתפים'), { key: 'rsvpReminder', who: 'משתתפים' });
  assert.deepEqual(parseTemplateRequest('relance fournisseur pour Tamares'), { key: 'supplierFollowUp', who: 'Tamares' });
  assert.deepEqual(parseTemplateRequest('שלחת כבר את ההצעה? לגרשון טורס'), { key: 'supplierFollowUp', who: 'גרשון טורס' });
  assert.deepEqual(parseTemplateRequest('rsvp reminder'), { key: 'rsvpReminder', who: '' });
  assert.equal(parseTemplateRequest('מה יש לי מחר'), null);
  assert.equal(parseTemplateRequest('שלחי לדנה את תבנית הסיור'), null);
  assert.equal(parseTemplateRequest(''), null);
});

test('pickLang: the recipient card, then the default of the settings, then the UI language', () => {
  assert.equal(pickLang({ lang: 'fr' }, { msgLang: 'en' }, 'he'), 'fr');
  assert.equal(pickLang({ lang: '' }, { msgLang: 'en' }, 'he'), 'en');
  assert.equal(pickLang(null, {}, 'fr'), 'fr');
  assert.equal(pickLang(null, {}, 'zz'), 'he');
});
