import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushRecent, recentList } from '../js/logic/recent.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('recent instructions: newest first, no repeats, at most eight, junk ignored', () => {
  const st = mem();
  assert.deepEqual(recentList(st), []);
  pushRecent(st, 'משימה לדנה: להתקשר לאולם');
  pushRecent(st, 'מה יש לי מחר');
  pushRecent(st, 'משימה לדנה: להתקשר לאולם');
  assert.deepEqual(recentList(st), ['משימה לדנה: להתקשר לאולם', 'מה יש לי מחר']);
  pushRecent(st, 'כן'); pushRecent(st, 'x'.repeat(200));
  assert.equal(recentList(st).length, 2);
  for (let i = 0; i < 12; i++) pushRecent(st, 'פקודה מספר ' + i);
  assert.equal(recentList(st).length, 8);
  assert.equal(recentList(st)[0], 'פקודה מספר 11');
});

test('a broken storage value is treated as an empty list', () => {
  const st = mem(); st.setItem('bakasun.recent', '{oops');
  assert.deepEqual(recentList(st), []);
});
