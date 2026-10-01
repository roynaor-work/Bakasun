import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVcf, parseContactsCsv, parseContactsFile, dedupe, classify, classifyAll, guessSupplierType, findExisting, normName } from '../js/logic/contacts.js';

// the store runs in the browser; here it gets a tiny localStorage so contactsImport.js can be imported
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.window = globalThis.window || globalThis;
const { db } = await import('../js/store.js');
const { importContacts, planImport, cardFor, completion } = await import('../js/contactsImport.js');
const { undoLast, forgetAll, lastAction } = await import('../js/logic/undo.js');

test('a vCard export from the phone (2.1 quoted-printable, 3.0, 4.0 tel: URI, folded lines, two phones)', () => {
  const v = '﻿BEGIN:VCARD\r\nVERSION:3.0\r\nN:לוי;דנה;;;\r\nFN:דנה לוי\r\nTEL;TYPE=CELL:+972 52-123-4567\r\nTEL;TYPE=WORK:03-6001234\r\nEMAIL;TYPE=INTERNET:dana@x.co\r\nEMAIL:dana.levi@gmail.com\r\nORG:קייטרינג שקד\r\nTITLE:מנהלת\r\nCATEGORIES:ספקים,myContacts\r\nEND:VCARD\r\n'
    + 'BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=D7=A8=D7=95=\n=D7=A2=D7=99\nTEL;CELL:0501112222\nEND:VCARD\n'
    + 'BEGIN:VCARD\nVERSION:4.0\nFN:Marc Cohen\nTEL;VALUE=uri;TYPE=home:tel:+33-6-12-34-56-78\nEMAIL:marc@cohen\n .fr\nitem1.TEL:+33 1 23 45 67 89\nEND:VCARD\n';
  const c = parseVcf(v);
  assert.equal(c.length, 3);
  assert.deepEqual([c[0].name, c[0].phone, c[0].email], ['דנה לוי', '052-1234567', 'dana@x.co']);
  assert.deepEqual(c[0].phones, ['052-1234567', '03-6001234']);
  assert.deepEqual(c[0].emails, ['dana@x.co', 'dana.levi@gmail.com']);
  assert.deepEqual([c[0].org, c[0].title, c[0].labels], ['קייטרינג שקד', 'מנהלת', ['ספקים']]);
  assert.deepEqual([c[1].name, c[1].phone], ['רועי', '050-1112222']);
  assert.equal(c[2].name, 'Marc Cohen'); assert.equal(c[2].phone, '+33612345678'); assert.equal(c[2].phones.length, 2); assert.equal(c[2].email, 'marc@cohen.fr');
});

test('the 2024+ Google Contacts CSV: three rows, a quoted multi-line notes field, labels, two phones, CRLF and BOM', () => {
  const csv = '﻿First Name,Middle Name,Last Name,Phonetic First Name,Phonetic Middle Name,Phonetic Last Name,Name Prefix,Name Suffix,Nickname,File As,Organization Name,Organization Title,Organization Department,Birthday,Notes,Photo,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value\r\n'
    + 'דנה,,לוי,,,,,,,,מלון דן תל אביב,מנהלת אירועים,,,"הערה ארוכה, עם פסיק\r\nושורה שנייה ""בציטוט""",,* myContacts ::: ספקים,Work,dana@dan.co.il,,,Mobile,+972 52-123-4567,Work,03-5201111\r\n'
    + 'Marc,,Cohen,,,,,,,,Mairie de Lyon,,,,,,* myContacts,,marc@lyon.fr,,,Mobile,+33 6 12 34 56 78,,\r\n'
    + ',,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,050-111-2222,,\r\n';
  const c = parseContactsCsv(csv);
  assert.equal(c.length, 3);
  assert.deepEqual([c[0].name, c[0].org, c[0].title, c[0].email, c[0].phone], ['דנה לוי', 'מלון דן תל אביב', 'מנהלת אירועים', 'dana@dan.co.il', '052-1234567']);
  assert.deepEqual(c[0].phones, ['052-1234567', '03-5201111']);
  assert.deepEqual(c[0].labels, ['ספקים']);
  assert.equal(c[0].notes, undefined, 'notes are never kept');
  assert.deepEqual([c[1].name, c[1].org, c[1].phone, c[1].labels], ['Marc Cohen', 'Mairie de Lyon', '+33612345678', []]);
  assert.deepEqual([c[2].name, c[2].phone], ['050-1112222', '050-1112222']);
});

test('the older Google layout (Name / Given Name / Group Membership) and Outlook CSV', () => {
  const oldCsv = 'Name,Given Name,Additional Name,Family Name,Group Membership,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Phone 2 - Type,Phone 2 - Value,Organization 1 - Name,Organization 1 - Title\n'
    + 'דנה לוי,דנה,,לוי,* My Contacts ::: לקוחות,* Work,dana@x.co,Mobile,052-1234567,,,,\n'
    + ',,,,* My Contacts,,,Mobile,0501112222,,,,\n'
    + 'דנה לוי,דנה,,לוי,,,,Mobile,+972521234567,Work,03-1234567,עיריית חיפה,רכזת\n';
  let c = parseContactsCsv(oldCsv);
  assert.equal(c.length, 2, 'the same phone twice is one contact');
  assert.deepEqual([c[0].name, c[0].phone, c[0].org, c[0].labels, c[0].phones], ['דנה לוי', '052-1234567', 'עיריית חיפה', ['לקוחות'], ['052-1234567', '03-1234567']]);
  assert.equal(c[1].name, '050-1112222');
  const outlook = 'First Name,Middle Name,Last Name,Company,Job Title,E-mail Address,E-mail 2 Address,Mobile Phone,Business Phone,Home Phone,Categories,Notes\n'
    + 'Yossi,,Katz,"Katz Transport Ltd",CEO,yossi@katz.co.il,,052-9998877,,,"Suppliers; VIP",\n';
  c = parseContactsFile('contacts.csv', outlook);
  assert.deepEqual([c[0].name, c[0].org, c[0].title, c[0].email, c[0].phone, c[0].labels], ['Yossi Katz', 'Katz Transport Ltd', 'CEO', 'yossi@katz.co.il', '052-9998877', ['Suppliers', 'VIP']]);
  assert.equal(parseContactsFile('x.vcf', 'BEGIN:VCARD\nFN:A B\nTEL:0521234567\nEND:VCARD')[0].name, 'A B');
  assert.deepEqual(parseContactsCsv(''), []);
});

test('dedupe: same phone, same e-mail or same normalised name become one contact with the pieces merged', () => {
  const list = dedupe([
    { name: 'דנה לוי', phone: '052-1234567', email: '' },
    { name: 'Dana Levi', phone: '', email: 'dana@x.co' },
    { name: 'דנה לוי', phone: '', email: 'dana@x.co', org: 'שוב"ל' },
    { name: 'לוי, דנה', phone: '+972521234567', email: '' },
    { name: 'דנה  לוי.', phone: '', email: '' },
    { name: 'רועי נאור', phone: '050-1234567', email: '' }
  ]);
  assert.equal(list.length, 2, 'the third row links the first two (same name as one, same e-mail as the other)');
  assert.deepEqual([list[0].name, list[0].phone, list[0].email, list[0].org], ['דנה לוי', '052-1234567', 'dana@x.co', 'שוב"ל']);
  assert.equal(list[1].name, 'רועי נאור');
  assert.equal(normName('לוי, דנה'), 'לוי דנה'); assert.equal(normName('  Shoval  Ltd. '), 'shoval ltd');
});

test('classification: labels, organisation words, names, e-mail domains and existing cards', () => {
  const lists = {
    clients: [{ id: 'c1', name: 'ארגון שוב״ל', aliases: 'שובל, Shoval', contact: 'ענת כהן', email: 'anat@example.org', phone: '' }],
    suppliers: [{ id: 's1', name: 'מלון שפיים', type: 'מלונות', phone: '09-9595555', email: 'events@shefayim.co.il' }],
    staff: [{ id: 't1', name: 'מיכל גולד', phone: '054-0000001' }]
  };
  const at = (c, exp) => { const r = classify(c, lists); assert.equal(r.cls, exp.cls, JSON.stringify([c, r])); if (exp.reason) assert.equal(r.reason, exp.reason); if (exp.type) assert.equal(r.type, exp.type); return r; };
  at({ name: 'יוסי', org: '', labels: ['ספקים'] }, { cls: 'supplier', reason: 'label' });
  at({ name: 'Marc', labels: ['Fournisseurs'] }, { cls: 'supplier', reason: 'label' });
  at({ name: 'רונית', labels: ['לקוחות'] }, { cls: 'client', reason: 'label' });
  at({ name: 'Paul', labels: ['équipe'] }, { cls: 'staff', reason: 'label' });
  at({ name: 'אבי', org: 'הסעות אגד בע"מ' }, { cls: 'supplier', reason: 'org', type: 'הסעות' });
  at({ name: 'דנה', org: 'מלון דן תל אביב' }, { cls: 'supplier', type: 'מלונות' });
  at({ name: 'שי', org: 'צילום אירועים שי' }, { cls: 'supplier', type: 'צילום ווידאו' });
  at({ name: 'DJ Avi', org: '' }, { cls: 'supplier', reason: 'name', type: 'תקליטנים ולהקות' });
  at({ name: 'Marc', org: 'Traiteur Cohen' }, { cls: 'supplier', type: 'קייטרינג ושפים' });
  at({ name: 'ליאור', org: 'הפקות אור' }, { cls: 'supplier', type: 'אחר' });
  at({ name: 'רונן', org: 'הגברה ותאורה רונן' }, { cls: 'supplier', type: 'הגברה ותאורה' });
  at({ name: 'נועה', org: 'דפוס הצפון' }, { cls: 'supplier', type: 'דפוס ומיתוג' });
  at({ name: 'רונית', org: 'עיריית חיפה' }, { cls: 'client', reason: 'org' });
  at({ name: 'Marc', org: 'Mairie de Lyon' }, { cls: 'client', reason: 'org' });
  at({ name: 'גיל', org: 'חברת החשמל בע״מ' }, { cls: 'client', reason: 'org' });
  at({ name: 'תמר', org: 'עמותת אור' }, { cls: 'client' });
  at({ name: 'עמותת הגליל', org: '' }, { cls: 'client', reason: 'name' });
  at({ name: 'בר אילן', org: '' }, { cls: 'contact' }, 'a first name is not a drinks supplier');
  at({ name: 'רועי נאור', org: '', email: 'roy@gmail.com' }, { cls: 'contact', reason: 'none' });
  at({ name: 'עדי', org: '', email: 'adi@example.org' }, { cls: 'client', reason: 'domain' });
  at({ name: 'מאיה', org: '', email: 'maya@shefayim.co.il' }, { cls: 'supplier', reason: 'domain', type: 'מלונות' });
  const ex = at({ name: 'שפיים', org: '', phone: '+972 9 959 5555' }, { cls: 'supplier', reason: 'existing' });
  assert.equal(ex.existing.card.id, 's1'); assert.equal(ex.existing.how, 'phone');
  assert.equal(at({ name: 'ענת כהן', org: '' }, { cls: 'client', reason: 'existing' }).existing.how, 'name');
  assert.equal(at({ name: 'Shoval', org: '' }, { cls: 'client', reason: 'existing' }).existing.card.id, 'c1');
  assert.equal(at({ name: 'מיכל', phone: '0540000001' }, { cls: 'staff', reason: 'existing' }).existing.card.id, 't1');
  assert.equal(guessSupplierType('קייטרינג שקד'), 'קייטרינג ושפים'); assert.equal(guessSupplierType('Sound & Light Pro'), 'הגברה ותאורה'); assert.equal(guessSupplierType('רונית כהן'), '');
  const all = classifyAll([{ name: 'DJ Avi' }, { name: 'עיריית חיפה' }, { name: 'רועי' }, { name: 'שפיים', phone: '09-9595555' }], lists);
  assert.deepEqual(all.counts, { client: 1, supplier: 2, staff: 0, contact: 1, existing: 1 });
  assert.equal(findExisting({ name: 'nobody' }, lists.clients), null);
});

test('import: preview writes nothing; import adds new cards, completes existing ones without overwriting, and is one undo', () => {
  forgetAll();
  const s1 = db.put('suppliers', { name: 'מלון שפיים', type: 'מלונות', phone: '', email: 'events@shefayim.co.il', contact: '' });
  const c1 = db.put('clients', { name: 'עיריית חיפה', phone: '04-8356000', email: '', contact: 'רונית כהן' });
  const before = { s: db.list('suppliers').length, c: db.list('clients').length, st: db.list('staff').length, ct: db.list('contacts').length };
  const list = [
    { name: 'אורי שפיים', org: 'מלון שפיים', phone: '09-9595555', email: 'events@shefayim.co.il', phones: ['09-9595555'], emails: ['events@shefayim.co.il'], labels: [] },
    { name: 'רונית כהן', org: 'עיריית חיפה', phone: '04-8356000', email: 'ronit@haifa.muni.il', phones: ['04-8356000'], emails: ['ronit@haifa.muni.il'], labels: [] },
    { name: 'DJ Avi', org: '', phone: '052-1111111', email: '', phones: ['052-1111111'], emails: [], labels: [] },
    { name: 'מיכל גולד', org: '', phone: '054-0000001', email: '', phones: ['054-0000001'], emails: [], labels: ['צוות'] },
    { name: 'רועי נאור', org: '', phone: '050-1234567', email: 'roy@gmail.com', phones: ['050-1234567'], emails: ['roy@gmail.com'], labels: [] },
    { name: 'ספאם', org: '', phone: '050-9999999', email: '', phones: ['050-9999999'], emails: [], labels: [] }
  ];
  const plan = planImport(list);
  assert.deepEqual(plan.rows.map(r => r.cls), ['supplier', 'client', 'supplier', 'staff', 'contact', 'contact']);
  assert.equal(plan.rows[0].existing.card.id, s1); assert.equal(plan.rows[1].existing.card.id, c1);
  assert.deepEqual([db.list('suppliers').length, db.list('clients').length, db.list('staff').length, db.list('contacts').length], [before.s, before.c, before.st, before.ct], 'the preview saves nothing');

  const res = importContacts(list, [undefined, undefined, undefined, undefined, 'contact', 'skip'], 'ייבוא אנשי קשר');
  assert.deepEqual(res.added, { client: 0, supplier: 1, staff: 1, contact: 1 });
  assert.deepEqual(res.updated, { client: 1, supplier: 1, staff: 0, contact: 0 });
  assert.equal(res.skipped, 1);
  const sp = db.get('suppliers', s1), cl = db.get('clients', c1);
  assert.deepEqual([sp.phone, sp.contact, sp.email], ['09-9595555', 'אורי שפיים', 'events@shefayim.co.il'], 'missing phone and contact filled in');
  assert.deepEqual([cl.phone, cl.contact, cl.email], ['04-8356000', 'רונית כהן', 'ronit@haifa.muni.il'], 'existing contact name kept, missing e-mail filled');
  const dj = db.list('suppliers').find(x => x.name === 'DJ Avi');
  assert.equal(dj.type, 'תקליטנים ולהקות');
  assert.equal(db.list('staff').filter(x => x.name === 'מיכל גולד').length, 1);
  assert.equal(db.list('contacts').filter(x => x.name === 'רועי נאור').length, 1);
  assert.equal(db.list('contacts').filter(x => x.name === 'ספאם').length, 0, 'skipped rows are not written anywhere');
  assert.ok(db.list('contacts').some(x => x.phone === '052-1111111'), 'new supplier also reachable from the phone book');
  assert.equal(db.list('contacts').length, before.ct + 5, 'DJ, staff, Roy, and the two people behind the completed cards');

  // importing the same file again changes nothing
  const again = importContacts(list, [undefined, undefined, undefined, undefined, 'contact', 'skip']);
  assert.equal(again.total, 0);
  assert.equal(db.list('suppliers').filter(x => x.name === 'DJ Avi').length, 1);

  // one undo takes the whole import back
  assert.equal(lastAction().label, 'ייבוא אנשי קשר');
  assert.equal(undoLast(), 'ייבוא אנשי קשר');
  assert.deepEqual([db.list('suppliers').length, db.list('clients').length, db.list('staff').length, db.list('contacts').length], [before.s, before.c, before.st, before.ct]);
  assert.deepEqual([db.get('suppliers', s1).phone, db.get('suppliers', s1).contact, db.get('clients', c1).email], ['', '', '']);
});

test('cards: a person at an organisation becomes the organisation card with the person as contact; completion never overwrites', () => {
  const c = { name: 'Marc Cohen', org: 'Traiteur Cohen', title: 'Chef', phone: '+33612345678', email: 'marc@cohen.fr', phones: ['+33612345678'], emails: ['marc@cohen.fr'] };
  const sup = cardFor('supplier', c, 'קייטרינג ושפים');
  assert.deepEqual([sup.name, sup.contact, sup.role, sup.type, sup.lang, sup.phone], ['Traiteur Cohen', 'Marc Cohen', 'Chef', 'קייטרינג ושפים', 'fr', '+33612345678']);
  assert.deepEqual([cardFor('client', { name: 'דנה לוי', org: '' }).name, cardFor('client', { name: 'דנה לוי', org: '' }).contact], ['דנה לוי', '']);
  assert.equal(cardFor('staff', { name: 'רותם', title: 'תפעול', phone: '0501112222' }).role, 'תפעול');
  assert.equal(completion({ name: 'Traiteur Cohen', phone: '+33100000000', email: 'x@y.fr', contact: 'Someone', role: 'r', type: 'מסעדות' }, 'supplier', c, 'קייטרינג ושפים'), null);
  assert.deepEqual(completion({ name: 'Traiteur Cohen', phone: '', email: 'x@y.fr', contact: '', type: '' }, 'supplier', c, 'קייטרינג ושפים'), { phone: '+33612345678', contact: 'Marc Cohen', role: 'Chef', type: 'קייטרינג ושפים' });
});
