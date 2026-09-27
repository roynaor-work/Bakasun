import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVcf, parseContactsCsv, parseContactsFile } from '../js/logic/contacts.js';

test('a vCard export from the phone', () => {
  const v = 'BEGIN:VCARD\nVERSION:3.0\nN:לוי;דנה;;;\nFN:דנה לוי\nTEL;TYPE=CELL:+972 52-123-4567\nEMAIL:dana@x.co\nEND:VCARD\nBEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=D7=A8=D7=95=D7=A2=D7=99\nTEL;CELL:0501112222\nEND:VCARD\nBEGIN:VCARD\nFN:Marc Cohen\nTEL;TYPE=HOME:+33 6 12 34 56 78\nEND:VCARD\n';
  const c = parseVcf(v);
  assert.equal(c.length, 3);
  assert.deepEqual([c[0].name, c[0].phone, c[0].email], ['דנה לוי', '052-1234567', 'dana@x.co']);
  assert.deepEqual([c[1].name, c[1].phone], ['רועי', '050-1112222']);
  assert.equal(c[2].name, 'Marc Cohen'); assert.match(c[2].phone, /^\+33/);
});

test('a Google Contacts CSV, old and new layouts, duplicates merged', () => {
  const oldCsv = 'First Name,Last Name,E-mail 1 - Value,Phone 1 - Value,Phone 2 - Value\nדנה,לוי,dana@x.co,052-1234567,\n,,,0501112222,\nדנה,לוי,,+972521234567,03-1234567\n';
  let c = parseContactsCsv(oldCsv);
  assert.equal(c.length, 2); assert.equal(c[0].name, 'דנה לוי'); assert.equal(c[0].phone, '052-1234567'); assert.equal(c[1].name, '050-1112222');
  const newCsv = '﻿Name,Given Name,Family Name,E-mail 1 - Value,Phone 1 - Value,Organization Name\n"Cohen, Marc",Marc,Cohen,marc@x.fr,+33612345678,Famille Cohen\nקייטרינג שקד,,,,052-9998877,קייטרינג שקד\n';
  c = parseContactsFile('contacts.csv', newCsv);
  assert.equal(c[0].name, 'Cohen, Marc'); assert.equal(c[0].email, 'marc@x.fr'); assert.equal(c[1].name, 'קייטרינג שקד'); assert.equal(c[1].phone, '052-9998877');
});
