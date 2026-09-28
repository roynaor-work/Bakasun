import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoneCommand, isDeleteCommand, stash, peek, restore, minutesLeft, KEEP_MS } from '../js/logic/trash.js';

test('"finished" alone ends the recording and runs; a sentence with the word does not', () => {
  ['סיימתי', 'זהו', 'done', 'Finished.', "that's it", 'terminé', 'j’ai fini', 'c’est tout'].forEach(x => assert.ok(isDoneCommand(x), x));
  ['סיימתי את ההצעה', 'done with the hotel', 'la visite est terminée'].forEach(x => assert.ok(!isDoneCommand(x), x));
});

const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };

test('"delete" alone, in three languages, is a delete command; a real instruction is not', () => {
  ['מחקי', 'תמחקי את הכל', 'מחק', 'למחוק', 'delete', 'Delete it', 'clear everything', 'efface', 'Supprime tout', 'annule ça'].forEach(x => assert.ok(isDeleteCommand(x), x));
  ['תמחקי את ההערה על ביסקוטי', 'delete the note on Dana', 'תזכירי לי מחר', 'efface la note sur Dana'].forEach(x => assert.ok(!isDeleteCommand(x), x));
});

test('the bin keeps a recording for one hour and gives it back once', () => {
  const s = mem(); const t0 = 1000;
  assert.equal(stash(s, 'cmd', '   ', t0), false);
  assert.equal(stash(s, 'cmd', 'תזכירי לי מחר', t0), true);
  assert.equal(peek(s, 'cmd', t0 + 1000).text, 'תזכירי לי מחר');
  assert.equal(minutesLeft(peek(s, 'cmd', t0 + 1000), t0 + 1000), 60);
  assert.equal(minutesLeft(peek(s, 'cmd', t0 + 30 * 60000), t0 + 30 * 60000), 30);
  assert.equal(restore(s, 'cmd', t0 + 5000), 'תזכירי לי מחר');
  assert.equal(restore(s, 'cmd', t0 + 6000), '');
  stash(s, 'cmd', 'old', t0);
  assert.equal(peek(s, 'cmd', t0 + KEEP_MS + 1), null);
  assert.equal(restore(s, 'cmd', t0 + KEEP_MS + 1), '');
});
