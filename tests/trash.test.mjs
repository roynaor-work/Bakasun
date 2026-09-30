import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoneCommand, isDeleteCommand, stripDelete, stripDone, stash, peek, restore, minutesLeft, KEEP_MS, isEmptyBinCommand, emptyBin, emptyAllBins } from '../js/logic/trash.js';

test('"empty the bin" is understood, and empties every bin for good', () => {
  ['רוקני את הסל', 'מחקי את הסל', 'מחקי הכל לגמרי', 'empty the bin', 'delete everything completely', 'vide la corbeille', 'supprime tout définitivement'].forEach(x => assert.ok(isEmptyBinCommand(x), x));
  ['מחקי', 'רוקני את הרשימה של דנה', 'delete the note'].forEach(x => assert.ok(!isEmptyBinCommand(x), x));
  const s = mem(); const now = Date.now(); stash(s, 'cmd', 'a', now - 2000); stash(s, 'cmd', 'b', now - 1000); stash(s, 'lead', 'c', now);
  assert.equal(emptyBin(s, 'cmd'), 2);
  assert.deepEqual(peek(s, 'cmd'), []);
  assert.equal(emptyAllBins(s, ['bakasun.bin.lead', 'other']), 1);
  assert.deepEqual(peek(s, 'lead'), []);
});

test('"delete" or "finished" at the end of a sentence, without a pause, still counts', () => {
  assert.equal(stripDelete('תשלח הודעה למחיקה למחוק דליט'), 'תשלח הודעה');
  assert.equal(stripDelete('שלחי הודעה לדנה מחקי'), 'שלחי הודעה לדנה');
  assert.equal(stripDelete('send it to Dana delete'), 'send it to Dana');
  assert.equal(stripDelete('מחקי'), '');
  assert.equal(stripDelete('תמחקי את ההערה על ביסקוטי'), null);
  assert.equal(stripDelete('שלחי הודעה לדנה'), null);
  assert.equal(stripDone('תזכירי לי מחר ב-9 להתקשר לדנה סיימתי'), 'תזכירי לי מחר ב-9 להתקשר לדנה');
  assert.equal(stripDone('remind me tomorrow done.'), 'remind me tomorrow');
  assert.equal(stripDone('סיימתי'), '');
  assert.equal(stripDone('תגידי לרועי שסיימתי'), null);
  assert.equal(stripDone('תזכירי לי מחר'), null);
});

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

test('"finished" in the middle of the recording splits it into two instructions', async () => {
  const { splitDone } = await import('../js/logic/trash.js');
  assert.deepEqual(splitDone('מה הרווח באירוע של שובל סיימתי מה חסר במסמכים של השובל'), ['מה הרווח באירוע של שובל', 'מה חסר במסמכים של השובל']);
  assert.deepEqual(splitDone('מה הרווח של שובל'), ['מה הרווח של שובל']);
  assert.deepEqual(splitDone('send the end of the schedule to the hotel'), ['send the end of the schedule to the hotel']);
  assert.deepEqual(splitDone('what is the margin of Shoval, finished, what is missing for Shoval?'), ['what is the margin of Shoval,', 'what is missing for Shoval?']);
});
