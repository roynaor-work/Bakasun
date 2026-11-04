import { test } from 'node:test';
import assert from 'node:assert/strict';
import Office from '../js/logic/office.js';
import { parseMail, cleanMail, takeDates, parseAddress } from '../js/logic/mailImport.js';
import { parseCommand, parseInvoiceRequest } from '../js/logic/commands.js';
import { parseBrief } from '../js/logic/brief.js';
import { parseVcf, parseContactsCsv } from '../js/logic/contacts.js';
import { planImport } from '../js/contactsImport.js';
import { db } from '../js/store.js';

/* Deep round 1 (04/11/2026), security: text that comes from outside (a pasted mail, a dictation, a contact file, a backup) is hostile data.
   Before this round a single 200 KB line in a pasted mail froze the screen for about a minute (quadratic regexes on e-mail addresses,
   digit runs and company-id lookups). Each hostile input below must finish fast and must not throw. */
const N = 200000;
const HOSTILE = {
  'one word': 'a'.repeat(N), 'spaces': ' '.repeat(N), 'digits': '1'.repeat(N), 'digit-dot': '1.'.repeat(N / 2), 'digit-dash': '1-'.repeat(N / 2),
  'at-signs': 'a@'.repeat(N / 2), 'email-local': 'a'.repeat(N) + '@x.co', 'dotted domain': 'a@' + 'a.'.repeat(N / 2) + 'b', 'hebrew': 'ש'.repeat(N), 'words': 'ab '.repeat(N / 3),
  'quotes': '> '.repeat(N / 2), 'invisible': '‮​‍﻿'.repeat(N / 4), 'newlines': '\n'.repeat(N), 'long header': 'From: ' + 'x'.repeat(N) + '\nSubject: ' + 'y'.repeat(N) + '\n\nhi',
};
const LIMIT = 1500; // ms; the same inputs took 20 s to minutes before the fix
for (const [name, text] of Object.entries(HOSTILE)) {
  test('hostile input "' + name + '" is read quickly by the text parsers', () => {
    const runs = { parseMail: () => parseMail(text, {}), cleanMail: () => cleanMail(text), takeDates: () => takeDates(text, '2026-11-04'), parseAddress: () => parseAddress(text),
      parseLead: () => Office.parseLead(text, [], new Date()), parseCommand: () => parseCommand(text, [], []), parseInvoiceRequest: () => parseInvoiceRequest(text, []), parseBrief: () => parseBrief(text, [], new Date(), []) };
    for (const [fn, run] of Object.entries(runs)) { const t0 = performance.now(); run(); const ms = performance.now() - t0; assert.ok(ms < LIMIT, fn + ' took ' + Math.round(ms) + ' ms'); }
  });
}
test('hostile contact files: a vcard with a huge number, 20,000 cards, quote bombs, a very wide CSV', () => {
  const cases = [() => parseVcf('BEGIN:VCARD\nFN:x\nTEL:' + '1'.repeat(N) + '\nEND:VCARD\n'), () => parseVcf('BEGIN:VCARD\nFN:x\nEND:VCARD\n'.repeat(20000)),
    () => parseContactsCsv('Name,Phone\n"' + 'x,'.repeat(N / 2)), () => parseContactsCsv(','.repeat(N)), () => parseContactsCsv('a,b\n'.repeat(N / 4))];
  for (const run of cases) { const t0 = performance.now(); const r = run(); assert.ok(performance.now() - t0 < 3000); if (Array.isArray(r)) planImport(r.slice(0, 200)); }
});
test('Office.calm keeps real text and bounds hostile text', () => {
  const real = 'שלום, אני מחפשת אולם ל-120 איש ב-19/11/2026, תקציב 50,000 ₪. 054-1234567 a@b.co';
  assert.equal(Office.calm(real), real);
  assert.equal(Office.calm('x'.repeat(1000)).length, 200);
  assert.equal(Office.calm('7'.repeat(100)).length, 20);
  assert.equal(Office.calm('a '.repeat(100000)).length, 60000);
  assert.equal(Office.calm(null), '');
});
test('a real mail is read the same after the bounds', () => {
  const m = parseMail('From: Dana <dana@acme.co.il>\nSubject: כנס חברה\n\nשלום, אנחנו מחפשים אולם לכנס ל-120 איש ב-19/11/2026, תקציב 50,000 ₪. תודה, דנה 054-1234567', { today: new Date(2026, 10, 4) });
  assert.equal(m.participants, '120'); assert.equal(m.date, '2026-11-19'); assert.equal(m.email, 'dana@acme.co.il'); assert.equal(m.budget, '50,000 ₪');
});
test('a hostile backup is merged as data: markup ids and wrong types are dropped, nothing throws', () => {
  const before = db.list('clients').length;
  const evil = JSON.stringify({ clients: [{ id: 'x"><b id=xss>', name: 'bad' }, { id: 'ok1', name: '"><img src=x onerror=1>' }, null, 5, [], { name: 'no id' }, { id: '__proto__', name: 'p' }, { id: 'a'.repeat(5000), name: 'long' }],
    cases: 'not a list', tasks: { id: 1 }, settings: { __proto__: { polluted: 1 }, constructor: 'x', theme: 'dark' } });
  const n = db.importJson(evil);
  assert.ok(n >= 1 && db.list('clients').length <= before + 2);
  assert.ok(!db.list('clients').some(c => /["<>]/.test(c.id)), 'a markup id was stored');
  assert.equal({}.polluted, undefined, 'prototype pollution');
  assert.throws(() => db.importJson('not json'));
  assert.doesNotThrow(() => db.importJson('{}')); assert.doesNotThrow(() => db.importJson('[]'));
  assert.throws(() => db.importJson('null')); // null is caught by the settings screen and shown as "bad backup file"
});
