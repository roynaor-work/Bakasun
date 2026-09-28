import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoto, screenWord, gotoPhrase } from '../js/logic/nav.js';

test('"go to" plus the screen word moves, in three languages', () => {
  assert.equal(parseGoto('עברי לספקים'), 'suppliers');
  assert.equal(parseGoto('עבור לספקים'), 'suppliers');
  assert.equal(parseGoto('תעברי למשימות'), 'tasks');
  assert.equal(parseGoto('לכי להיום'), 'today');
  assert.equal(parseGoto('עברי למסך הבית'), 'today');
  assert.equal(parseGoto('תראי לי את הקבלות.'), 'receipts');
  assert.equal(parseGoto('מסך ספקים'), 'suppliers');
  assert.equal(parseGoto('go to suppliers'), 'suppliers');
  assert.equal(parseGoto('Go to the tasks screen'), 'tasks');
  assert.equal(parseGoto('show me the clients'), 'clients');
  assert.equal(parseGoto('va aux fournisseurs'), 'suppliers');
  assert.equal(parseGoto('va à réglages'), 'settings');
  assert.equal(parseGoto('עברי לעזרה'), 'help');
});

test('a screen word alone, or inside a sentence, is not a move', () => {
  assert.equal(parseGoto('ספקים'), null);
  assert.equal(parseGoto('תיקים'), null);
  assert.equal(parseGoto('tasks'), null);
  assert.equal(parseGoto('תפתחי את דנה'), null);
  assert.equal(parseGoto('תפתחי את התיקים של דנה'), null);
  assert.equal(parseGoto('תבקשי הצעות ממלונות לשוב״ל'), null);
  assert.equal(parseGoto('משימה לשירית: לאסוף שלטים'), null);
  assert.equal(parseGoto('מה המשימות שלי למחר'), null);
  assert.equal(parseGoto('open Dana'), null);
});

test('recommended word and phrase per language', () => {
  assert.equal(screenWord('suppliers', 'he'), 'ספקים');
  assert.equal(gotoPhrase('suppliers', 'he'), 'עברי לספקים');
  assert.equal(gotoPhrase('suppliers', 'fr'), 'va à fournisseurs');
  assert.equal(gotoPhrase('suppliers', 'en'), 'go to suppliers');
});
