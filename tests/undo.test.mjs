import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remember, lastAction, undoLast, forgetAll, isUndoCommand } from '../js/logic/undo.js';

test('the last action can be taken back once; only the last five are kept', () => {
  forgetAll();
  assert.equal(undoLast(), '');
  const log = [];
  for (let i = 1; i <= 7; i++) remember('פעולה ' + i, () => log.push(i));
  assert.equal(lastAction().label, 'פעולה 7');
  assert.equal(undoLast(), 'פעולה 7'); assert.deepEqual(log, [7]);
  assert.equal(undoLast(), 'פעולה 6');
  undoLast(); undoLast(); undoLast();
  assert.equal(undoLast(), '');
  assert.deepEqual(log, [7, 6, 5, 4, 3]);
});

test('"undo" is recognised in three languages, real instructions are not', () => {
  ['בטלי את הפעולה האחרונה', 'תחזירי', 'undo', 'annule la dernière action'].forEach(x => assert.ok(isUndoCommand(x), x));
  ['תבטלי את המשימה של הסיור', 'undo the task tour', 'בטלי את ההזמנה מדף אור', 'בטלי', 'מחקי'].forEach(x => assert.ok(!isUndoCommand(x), x));
});
