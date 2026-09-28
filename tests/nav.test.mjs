import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoto, screenWord } from '../js/logic/nav.js';

test('one word, or "go to" plus the word, moves to a screen in three languages', () => {
  assert.equal(parseGoto('ספקים'), 'suppliers');
  assert.equal(parseGoto('עברי לספקים'), 'suppliers');
  assert.equal(parseGoto('תפתחי את המשימות'), 'tasks');
  assert.equal(parseGoto('מסך הבית'), 'today');
  assert.equal(parseGoto('היום'), 'today');
  assert.equal(parseGoto('קבלות.'), 'receipts');
  assert.equal(parseGoto('go to suppliers'), 'suppliers');
  assert.equal(parseGoto('Tasks'), 'tasks');
  assert.equal(parseGoto('show me the clients screen'), 'clients');
  assert.equal(parseGoto('va aux fournisseurs'), 'suppliers');
  assert.equal(parseGoto('tâches'), 'tasks');
  assert.equal(parseGoto('réglages'), 'settings');
  assert.equal(parseGoto('עזרה'), 'help');
  assert.equal(parseGoto('help'), 'help');
});

test('a real instruction that happens to contain a screen word is not a move', () => {
  assert.equal(parseGoto('תפתחי את דנה'), null);
  assert.equal(parseGoto('תבקשי הצעות ממלונות לשוב״ל'), null);
  assert.equal(parseGoto('משימה לשירית: לאסוף שלטים'), null);
  assert.equal(parseGoto('מה המשימות שלי למחר'), null);
  assert.equal(parseGoto('open Dana'), null);
});

test('recommended word per language', () => {
  assert.equal(screenWord('suppliers', 'he'), 'ספקים');
  assert.equal(screenWord('suppliers', 'fr'), 'fournisseurs');
  assert.equal(screenWord('suppliers', 'en'), 'suppliers');
});
