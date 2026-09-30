import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessKind, humanSize, sortFiles, filterFiles, cloudPathFor, safeSegment, extOf, cloudEligible, missingKinds, attachShared, eventLine, KINDS } from '../js/logic/caseFiles.js';
import { hasArabic } from '../js/logic/core.js';

test('guessKind: Hebrew file names', () => {
  assert.equal(guessKind('הצעת מחיר ביסקוטי.pdf', 'application/pdf'), 'quote');
  assert.equal(guessKind('הסכם התקשרות שוב״ל.pdf', 'application/pdf'), 'contract');
  assert.equal(guessKind('חוזה מלון שפיים.docx', ''), 'contract');
  assert.equal(guessKind('תפריט ערב.pdf', 'application/pdf'), 'menu');
  assert.equal(guessKind('אישור ביטוח 2026.pdf', 'application/pdf'), 'insurance');
  assert.equal(guessKind('חשבונית מס קבלה 123.pdf', 'application/pdf'), 'invoice');
  assert.equal(guessKind('קבלה ארומה.jpg', 'image/jpeg'), 'receipt');
  assert.equal(guessKind('אישור משטרה.pdf', 'application/pdf'), 'permit');
  assert.equal(guessKind('תוכנית האולם.png', 'image/png'), 'plan');
  assert.equal(guessKind('לו״ז הכנס.pdf', 'application/pdf'), 'plan');
});

test('guessKind: English and French names, images, PDF text, unknown', () => {
  assert.equal(guessKind('Quotation_Dan_Hotel.pdf', 'application/pdf'), 'quote');
  assert.equal(guessKind('devis traiteur.pdf', 'application/pdf'), 'quote');
  assert.equal(guessKind('Framework Agreement 2026.pdf', 'application/pdf'), 'contract');
  assert.equal(guessKind('facture 2231.pdf', 'application/pdf'), 'invoice');
  assert.equal(guessKind('IMG_2231.jpg', 'image/jpeg'), 'photo');
  assert.equal(guessKind('photo.HEIC', ''), 'photo');
  assert.equal(guessKind('scan001.pdf', 'application/pdf', 'באקה סאן הפקות\nהצעת מחיר מס׳ 44\nלכבוד ארגון שוב״ל'), 'quote');
  assert.equal(guessKind('scan002.pdf', 'application/pdf', 'פוליסה לביטוח אחריות מקצועית'), 'insurance');
  assert.equal(guessKind('scan003.pdf', 'application/pdf', ''), 'other');
  assert.equal(guessKind('notes.txt', 'text/plain'), 'other');
  assert.equal(guessKind('', ''), 'other');
  assert.ok(KINDS.includes('permit') && KINDS.length === 10);
});

test('humanSize and sortFiles', () => {
  assert.equal(humanSize(0), '0 B'); assert.equal(humanSize(900), '900 B'); assert.equal(humanSize(1536), '1.5 KB');
  assert.equal(humanSize(240 * 1024), '240 KB'); assert.equal(humanSize(2.5 * 1024 * 1024), '2.5 MB'); assert.equal(humanSize(12 * 1024 * 1024), '12 MB');
  assert.equal(humanSize('x'), '0 B');
  const list = [{ name: 'b', addedAt: '2026-09-01T10:00:00Z' }, { name: 'a', addedAt: '2026-09-03T10:00:00Z' }, { name: 'c', created: '2026-09-03T10:00:00Z' }];
  assert.deepEqual(sortFiles(list).map(f => f.name), ['a', 'c', 'b']);
  assert.equal(list[0].name, 'b', 'input untouched');
});

test('filterFiles: search on name, note, tags, event client and supplier; kind and supplier filters', () => {
  const cases = { c1: { id: 'c1', client: 'ארגון שוב״ל', kind: 'כנס', place: 'שפיים' }, c2: { id: 'c2', client: 'Bertelsmann Stiftung' } };
  const sups = { s1: { id: 's1', name: 'ביסקוטי' }, s2: { id: 's2', name: 'מלון דן' } };
  const lookup = { caseOf: id => cases[id], supplierOf: id => sups[id] };
  const list = [
    { id: 'f1', caseId: 'c1', name: 'הצעת מחיר.pdf', kind: 'quote', supplierId: 's1', note: '', tags: [] },
    { id: 'f2', caseId: 'c1', name: 'IMG_1.jpg', kind: 'photo', supplierId: '', note: 'סיור באולם', tags: ['סיור'] },
    { id: 'f3', caseId: 'c2', name: 'Agreement.pdf', kind: 'contract', supplierId: 's2', note: '', tags: [] }
  ];
  const ids = (o) => filterFiles(list, o, lookup).map(f => f.id);
  assert.deepEqual(ids({ q: 'שוב"ל' }), ['f1', 'f2'], 'client of the event, quote folded');
  assert.deepEqual(ids({ q: 'ביסקוטי' }), ['f1'], 'supplier name');
  assert.deepEqual(ids({ q: 'סיור' }), ['f2'], 'note / tag');
  assert.deepEqual(ids({ q: 'bertelsmann agreement' }), ['f3'], 'every word must match');
  assert.deepEqual(ids({ kind: 'photo' }), ['f2']);
  assert.deepEqual(ids({ supplierId: 's2' }), ['f3']);
  assert.deepEqual(ids({ caseId: 'c1', kind: 'quote' }), ['f1']);
  assert.deepEqual(ids({}), ['f1', 'f2', 'f3']);
  assert.deepEqual(filterFiles(list, { q: 'שוב״ל' }).map(f => f.id), [], 'no lookup: the client is not searchable');
});

test('cloudPathFor: safe ASCII path under the org folder, extension kept', () => {
  const p = cloudPathFor('c1', { fileId: 'fabc', name: 'הצעת מחיר ביסקוטי (סופי).pdf', type: 'application/pdf' }, 'org-9');
  assert.equal(p, 'org-9/files/c1/fabc.pdf');
  assert.ok(/^[A-Za-z0-9._\/-]+$/.test(p), 'only ASCII path characters');
  assert.equal(cloudPathFor('c1', { fileId: 'f2', name: 'Menu v2.jpeg', type: 'image/jpeg' }, 'o'), 'o/files/c1/f2-Menu-v2.jpg');
  assert.equal(cloudPathFor('../x', { fileId: 'f3', name: 'a/b\\c..png' }, 'o'), 'o/files/x/f3-a-b-c.png', 'no path escapes');
  assert.equal(cloudPathFor('c1', { fileId: 'f4', name: 'קובץ' }, ''), 'files/c1/f4', 'no org, no extension');
  assert.equal(cloudPathFor('c1', { fileId: 'f5', name: 'תמונה', type: 'image/png' }, 'o'), 'o/files/c1/f5.png', 'extension from the mime type');
  assert.equal(safeSegment('   ', 'fb'), 'fb'); assert.equal(extOf('X.PDF', ''), '.pdf'); assert.equal(extOf('noext', 'image/webp'), '.webp');
  assert.equal(cloudEligible({ type: 'image/jpeg', size: 1000 }), true);
  assert.equal(cloudEligible({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000 }), false);
  assert.equal(cloudEligible({ type: 'application/pdf', size: 20 * 1024 * 1024 }), false);
});

test('missingKinds: venue contract, insurance when asked, menu for catering, a quote per approved link, the signed client contract', () => {
  const cs = { id: 'c1', client: 'ארגון שוב״ל', status: 'נסגר' };
  const sups = [{ id: 'v', name: 'מלון שפיים', type: 'מלונות', notes: 'דורשים אישור ביטוח' }, { id: 'k', name: 'ביסקוטי', type: 'קייטרינג ושפים' }, { id: 'd', name: 'דף אור', type: 'דפוס ומיתוג' }];
  const links = [
    { id: 'l1', caseId: 'c1', supplierId: 'v', status: 'אושר' },
    { id: 'l2', caseId: 'c1', supplierId: 'k', status: 'אושר' },
    { id: 'l3', caseId: 'c1', supplierId: 'd', status: 'ביקשנו הצעה' },
    { id: 'l4', caseId: 'c1', supplierId: 'v', status: 'בוטל' },
    { id: 'l5', caseId: 'other', supplierId: 'k', status: 'אושר' }
  ];
  let m = missingKinds(cs, [], links, { suppliers: sups });
  assert.deepEqual(m.map(x => x.kind + ':' + x.why + ':' + x.who), [
    'contract:mkVenueContract:מלון שפיים', 'insurance:mkInsurance:מלון שפיים', 'quote:mkQuote:מלון שפיים',
    'menu:mkMenu:ביסקוטי', 'quote:mkQuote:ביסקוטי', 'contract:mkClientContract:ארגון שוב״ל']);
  m.forEach(x => assert.ok(!hasArabic(x.who)));
  const have = [
    { caseId: 'c1', kind: 'contract', supplierId: 'v' }, { caseId: 'c1', kind: 'insurance', supplierId: '' }, { caseId: 'c1', kind: 'quote', supplierId: 'v' },
    { caseId: 'c1', kind: 'menu', supplierId: '' }, { caseId: 'c1', kind: 'quote', supplierId: 'k' }, { caseId: 'c1', kind: 'contract', supplierId: '' }
  ];
  assert.deepEqual(missingKinds(cs, have, links, { suppliers: sups }), []);
  // a signed contract record counts as the client contract; a file of another event does not
  assert.deepEqual(missingKinds(cs, have.slice(0, 5).concat([{ caseId: 'c2', kind: 'contract', supplierId: '' }]), links, { suppliers: sups, contracts: [{ caseId: 'c1', status: 'signed' }] }), []);
  assert.equal(missingKinds(cs, have.slice(0, 5), links, { suppliers: sups, contracts: [{ caseId: 'c1', status: 'sent' }] }).length, 1);
  // a venue that did not ask for insurance; an open lead needs no client contract yet; the map form of suppliers
  const quiet = { v: { id: 'v', name: 'בית הנסן', type: 'מקום לאירוע' } };
  assert.deepEqual(missingKinds({ id: 'c1', status: 'פנייה' }, [], [links[0]], { suppliers: quiet }).map(x => x.kind), ['contract', 'quote']);
  assert.deepEqual(missingKinds({ id: 'c1', status: 'פנייה' }, [], [{ id: 'l', caseId: 'c1', supplierId: 'v', status: 'אושר', needsInsurance: true }], { suppliers: quiet }).map(x => x.kind), ['contract', 'insurance', 'quote']);
  assert.deepEqual(missingKinds({ id: 'c9', status: 'פנייה' }, [], [], {}), []);
});

test('attachShared builds the metadata (and saves through the callback); eventLine', () => {
  let saved = null;
  const meta = attachShared('c1', { id: 'fx', name: 'תפריט.pdf', type: 'application/pdf', size: 2048 }, m => { saved = m; return 'cf1'; });
  assert.equal(saved, meta); assert.equal(meta.id, 'cf1');
  assert.equal(meta.caseId, 'c1'); assert.equal(meta.fileId, 'fx'); assert.equal(meta.kind, 'menu'); assert.equal(meta.size, 2048);
  assert.equal(meta.cloudOk, false); assert.equal(meta.cloudPath, ''); assert.deepEqual(meta.tags, []); assert.ok(meta.addedAt);
  const plain = attachShared('c1', { id: 'fy', name: 'x.docx' }, null, { note: 'מהשיתוף' });
  assert.equal(plain.note, 'מהשיתוף'); assert.equal(plain.id, undefined);
  assert.equal(eventLine({ client: 'שוב״ל', kind: 'כנס', date: '2026-10-18', place: 'שפיים' }, d => '18/10/2026'), 'שוב״ל · כנס · 18/10/2026 · שפיים');
  assert.equal(eventLine({ client: ' X ' }), 'X');
});
