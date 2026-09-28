import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHow, findHelp } from '../js/logic/howto.js';
import { HELP } from '../js/data/helpText.js';

test('"how do I" questions are recognised and the help answers them', () => {
  const q = parseHow('איך אני מוחקת הקלטה?');
  assert.ok(q && q.words.includes('הקלטה'));
  const hits = findHelp(q.words, HELP.he);
  assert.ok(hits.length && /מחקי|מחיקה/.test(hits[0].text), hits[0] && hits[0].text);
  const q2 = parseHow('איך שולחים בקשה לכמה ספקים');
  const h2 = findHelp(q2.words, HELP.he);
  assert.ok(/תבקשי הצעות/.test(h2[0].text), h2[0].text);
  const q3 = parseHow('how do I send a receipt to the accountant');
  const h3 = findHelp(q3.words, HELP.en);
  assert.ok(/receipt|Ofer/i.test(h3[0].text), h3[0].text);
  const q4 = parseHow('comment je récupère un enregistrement effacé');
  const h4 = findHelp(q4.words, HELP.fr);
  assert.ok(/corbeille|effac/i.test(h4[0].text), h4[0].text);
  assert.equal(parseHow('תזכירי לי מחר להתקשר לדנה'), null);
  assert.equal(parseHow('מה יש לי מחר'), null);
});
