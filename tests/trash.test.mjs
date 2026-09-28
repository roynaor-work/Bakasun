import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoneCommand, isDeleteCommand, stash, peek, restore, minutesLeft, KEEP_MS } from '../js/logic/trash.js';

const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };

test('"finished" alone ends the recording and runs; a sentence with the word does not', () => {
  ['סיימתי', 'זהו', 'done', 'Finished.', "that's it", 'terminé', 'j’ai fini', 'c’est tout'].forEach(x => assert.ok(isDoneCommand(x), x));
  ['סיימתי את ההצעה', 'done with the hotel', 'la visite est terminée'].forEach(x => assert.ok(!isDoneCommand(x), x));
});

test('"delete" alone, in three languages, is a delete command; a real instruction is not', () => {
  ['מחקי', 'תמחקי את הכל', 'מחק', 'למחוק', 'delete', 'Delete it', 'clear everything', 'efface', 'Supprime tout', 'annule ça'].forEach(x => assert.ok(isDeleteCommand(x), x));
  ['תמחקי את ההערה על ביסקוטי', 'delete the note on Dana', 'תזכירי לי מחר', 'efface la note sur Dana'].forEach(x => assert.ok(!isDeleteCommand(x), x));
});

test('the bin keeps several recordings for one hour, newest first, and gives each back once', () => {
  const s = mem(); const t0 = 1000;
  assert.equal(stash(s, 'cmd', '   ', t0), false);
  assert.equal(stash(s, 'cmd', 'ראשון', t0), true);
  assert.equal(stash(s, 'cmd', 'שני', t0 + 60000), true);
  const list = peek(s, 'cmd', t0 + 61000);
  assert.deepEqual(list.map(v => v.text), ['שני', 'ראשון']);
  assert.equal(minutesLeft(list[1], t0 + 61000), 59);
  assert.equal(restore(s, 'cmd', list[1].id, t0 + 62000), 'ראשון');
  assert.deepEqual(peek(s, 'cmd', t0 + 62000).map(v => v.text), ['שני']);
  assert.equal(restore(s, 'cmd', '', t0 + 63000), 'שני');
  assert.equal(restore(s, 'cmd', '', t0 + 64000), '');
  stash(s, 'cmd', 'old', t0);
  assert.deepEqual(peek(s, 'cmd', t0 + KEEP_MS + 1), []);
});
