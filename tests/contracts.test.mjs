import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractFromCase, missingForContract, contractHtml, contractTotals, pickQuote, quoteNet, contractMessage, applyForm, contractFileName, CONTRACT_STATUS, CT } from '../js/logic/contracts.js';
import { DEFAULTS } from '../js/data/defaults.js';

const caseRec = { id: 'c1', clientId: 'k1', client: 'ארגון שוב״ל', contact: 'צופיה', phone: '052-1111111', email: 'z@shoval.org', kind: 'כנס', date: '2026-10-18', hours: '09:00-16:00', place: 'שפיים', participants: '100', lang: 'he' };
const client = { id: 'k1', name: 'ארגון שוב״ל', legalName: 'קומיוניטי או ע״ר', taxId: '580123456', address: 'רחוב הכפר 3, שפיים', email: 'office@shoval.org', contact: 'צופיה' };
const quote = { id: 'q1', no: 'Q-2026-07', status: 'אושרה', created: '2026-09-01T10:00:00Z', vatRate: 18, defaultMargin: 25, lines: [{ item: 'הפקה', qty: 1, price: 10000 }, { item: 'הגברה', qty: 2, price: 1500 }] };
const settings = { bizName: 'באקה סאן', signer: 'וירג׳יני מנדל נאור\nבאקה סאן בע״מ', vat: 18 };

test('a contract is built from the case, the client card, the quote and the company texts', () => {
  const c = contractFromCase(caseRec, client, quote, settings, 'he');
  assert.equal(c.caseId, 'c1'); assert.equal(c.clientId, 'k1'); assert.equal(c.lang, 'he'); assert.equal(c.title, 'הסכם התקשרות'); assert.equal(c.status, CONTRACT_STATUS.draft);
  assert.equal(c.parties.producer.legal, DEFAULTS.bizLegal); assert.equal(c.parties.producer.id, DEFAULTS.bizId); assert.equal(c.parties.producer.signer, settings.signer);
  assert.deepEqual(c.parties.client, { name: 'ארגון שוב״ל', legalName: 'קומיוניטי או ע״ר', taxId: '580123456', address: 'רחוב הכפר 3, שפיים', email: 'office@shoval.org', phone: '052-1111111', contact: 'צופיה' });
  assert.deepEqual(c.eventLine, { kind: 'כנס', date: '2026-10-18', hours: '09:00-16:00', place: 'שפיים', participants: '100' });
  assert.equal(c.price, 13000); assert.equal(c.vatRate, 18); assert.equal(c.quoteNo, 'Q-2026-07');
  assert.equal(c.scope, DEFAULTS.includes); assert.equal(c.paymentTerms, DEFAULTS.terms); assert.equal(c.cancellation, DEFAULTS.cancelTerms);
  assert.deepEqual(c.signatures, { producer: '', producerSignedAt: '', client: '', clientName: '', clientSignedAt: '' });
  assert.deepEqual(contractTotals(c), { net: 13000, vat: 2340, gross: 15340, vatRate: 18, hasPrice: true });
  /* settings override the texts, the language of the case is the default, no quote = no price */
  const fr = contractFromCase(Object.assign({}, caseRec, { lang: 'fr' }), client, null, { includes: 'שירות מלא', terms: 'מקדמה 30%' });
  assert.equal(fr.lang, 'fr'); assert.equal(fr.title, CT.fr.title); assert.equal(fr.scope, 'שירות מלא'); assert.equal(fr.paymentTerms, 'מקדמה 30%'); assert.equal(fr.price, ''); assert.equal(fr.quoteNo, '');
  assert.equal(contractFromCase(caseRec, client, quote, settings, 'xx').lang, 'he');
});

test('the accepted quote wins over a newer draft; the total is before VAT', () => {
  const newer = Object.assign({}, quote, { id: 'q2', status: 'טיוטה', created: '2026-09-20T10:00:00Z', lines: [{ item: 'x', qty: 1, price: 99 }] });
  assert.equal(pickQuote([newer, quote]).id, 'q1');
  assert.equal(pickQuote([newer, Object.assign({}, quote, { status: 'נשלחה' })]).id, 'q2');
  assert.equal(pickQuote([]), null);
  assert.equal(quoteNet(quote), 13000); assert.equal(quoteNet(null), 0);
});

test('what is still missing', () => {
  const full = contractFromCase(caseRec, client, quote, settings);
  assert.deepEqual(missingForContract(full), []);
  const bare = contractFromCase({ id: 'c2', client: 'חדש' }, {}, null, {});
  assert.deepEqual(missingForContract(bare), ['clientLegalName', 'clientTaxId', 'clientAddress', 'date', 'price']);
  assert.deepEqual(missingForContract(Object.assign({}, full, { price: 'abc' })), ['price']);
  assert.deepEqual(missingForContract(Object.assign({}, full, { eventLine: Object.assign({}, full.eventLine, { date: '' }) })), ['date']);
});

test('the printable document: parties, event, price with VAT, numbered clauses, empty signature boxes', () => {
  const c = contractFromCase(caseRec, client, quote, settings, 'he');
  const html = contractHtml(c, { logo: 'data:image/png;base64,AAAA' });
  assert.match(html, /^<!DOCTYPE html><html dir="rtl" lang="he">/);
  assert.match(html, /direction:rtl;text-align:right;unicode-bidi:embed/);
  assert.match(html, /@page\{size:A4/);
  ['באקה סאן בע״מ', '515000032', 'קומיוניטי או ע״ר', '580123456', 'רחוב הכפר 3, שפיים', 'צופיה', 'כנס', '18/10/2026', 'שפיים', '100'].forEach(s => assert.ok(html.includes(s), s));
  assert.ok(html.includes('13,000 ₪')); assert.ok(html.includes('2,340 ₪')); assert.ok(html.includes('15,340 ₪')); assert.ok(html.includes('18%')); assert.ok(html.includes('Q-2026-07'));
  assert.ok(html.includes(DEFAULTS.cancelTerms.split('\n')[0]));
  assert.ok(html.includes('<span class="n">1.</span> הצדדים')); assert.ok(html.includes('<span class="n">4.</span> התמורה')); assert.ok(html.includes('חתימות'));
  assert.equal((html.match(/class="sig"/g) || []).length, 2); assert.ok(!html.includes('<img src="data:image/png;base64,SIG'));
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
  assert.ok(html.includes('טרם נחתם') === false); assert.ok(html.includes('____________'));
  assert.ok(html.includes('class="foot"') && html.includes('לבונה 8, אור עקיבא'));
  /* no price yet: the open-price sentence instead of numbers */
  assert.ok(contractHtml(Object.assign({}, c, { price: '' })).includes(CT.he.priceOpen));
});

test('the signature images are embedded when present; English and French documents are ltr with their own headings', () => {
  const c = contractFromCase(Object.assign({}, caseRec, { lang: 'en' }), client, quote, settings);
  const signed = Object.assign({}, c, { signatures: { producer: 'data:image/png;base64,SIGP', producerSignedAt: '2026-09-29T10:00:00.000Z', client: 'data:image/png;base64,SIGC', clientName: 'Tsofia Levi', clientSignedAt: '2026-09-29T11:30:00.000Z' } });
  const html = contractHtml(signed, { kindLabel: (k, l) => l === 'en' && k === 'כנס' ? 'Conference' : k });
  assert.match(html, /^<!DOCTYPE html><html dir="ltr" lang="en">/);
  assert.ok(html.includes('<img src="data:image/png;base64,SIGP" alt="">')); assert.ok(html.includes('<img src="data:image/png;base64,SIGC" alt="">'));
  assert.ok(html.includes('Tsofia Levi')); assert.ok(html.includes('29/09/2026')); assert.ok(html.includes('Service agreement')); assert.ok(html.includes('Conference')); assert.ok(html.includes('Total including VAT'));
  assert.ok(html.includes('The parties')); assert.ok(html.includes('Payment terms'));
  const fr = contractHtml(Object.assign({}, c, { lang: 'fr', title: CT.fr.title }));
  assert.ok(fr.includes('Contrat de prestation') && fr.includes('Total TTC') && fr.includes('dir="ltr" lang="fr"'));
});

test('cover message in three languages, subject and file name, and the edit form folded back', () => {
  const c = contractFromCase(caseRec, client, quote, settings);
  assert.equal(contractMessage(c, caseRec, 'וירג׳יני').split('\n')[0], 'היי היי צופיה, מה שלומך?');
  assert.ok(contractMessage(c, caseRec, 'וירג׳יני').includes('13,000 ₪') && contractMessage(c, caseRec, 'וירג׳יני').endsWith('וירג׳יני'));
  assert.ok(contractMessage(Object.assign({}, c, { lang: 'en' }), caseRec, 'Virginie').startsWith('Hi צופיה,\nAttached is our service agreement for כנס on 18/10/2026. Fee before VAT: 13,000 ₪.'));
  assert.ok(contractMessage(Object.assign({}, c, { lang: 'fr' }), caseRec, '').startsWith('Bonjour צופיה,\nVous trouverez ci-joint notre contrat pour כנס du 18/10/2026. Prix HT : 13,000 ₪.'));
  assert.equal(contractFileName(c), 'contract-ארגון-שוב״ל-2026-10-18.pdf');
  const edited = applyForm(c, { lang: 'en', title: '', date: '2026-10-01', clientName: 'Shoval', clientLegalName: 'Community O', clientTaxId: '580123456', clientAddress: 'Kfar 3', clientContact: 'Tsofia', clientEmail: 'a@b.c', clientPhone: '052', eventKind: 'כנס', eventDate: '2026-10-19', eventHours: '', eventPlace: 'Shefayim', eventParticipants: '120', price: '12,500', vatRate: '17', scope: 'A', paymentTerms: 'B', cancellation: 'C', extras: 'D' });
  assert.equal(edited.title, 'Service agreement'); assert.equal(edited.price, 12500); assert.equal(edited.vatRate, 17); assert.equal(edited.parties.client.legalName, 'Community O'); assert.equal(edited.parties.producer.legal, DEFAULTS.bizLegal);
  assert.equal(edited.eventLine.date, '2026-10-19'); assert.equal(edited.extras, 'D'); assert.equal(edited.signatures.producer, '');
  assert.equal(applyForm(c, { price: '' }).price, '');
  assert.equal(applyForm(c, { lang: 'fr', title: 'הסכם התקשרות' }).title, 'Contrat de prestation'); assert.equal(applyForm(c, { lang: 'fr', title: 'הסכם לכנס' }).title, 'הסכם לכנס');
});
