import { test } from 'node:test';
import assert from 'node:assert/strict';

// The store runs in the browser; here it gets a tiny localStorage so it can be imported.
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const { db } = await import('../js/store.js');
const { startHistory, historyFor, describe, diff, entryFor, groupByDay, CAP } = await import('../js/logic/history.js');
startHistory();

const wipeHistory = () => db.list('history').forEach(h => db.remove('history', h.id));

test('a changed field yields one entry with the right change; a no-op put yields none', () => {
  wipeHistory();
  const id = db.put('cases', { client: 'טבע', date: '2026-10-05', place: 'הרצליה', status: 'פנייה' });
  let h = historyFor(id);
  assert.equal(h.length, 1);
  assert.equal(h[0].isNew, true); assert.equal(h[0].col, 'cases'); assert.equal(h[0].refId, id); assert.equal(h[0].caseId, id);
  assert.ok(h[0].changes.some(c => c.field === 'client' && c.to === 'טבע'));
  assert.ok(!h[0].changes.some(c => c.field === 'updated' || c.field === 'created' || c.field === 'id'));

  db.put('cases', { id, date: '2026-10-07' });
  h = historyFor(id);
  assert.equal(h.length, 2);
  assert.deepEqual(h[0].changes, [{ field: 'date', from: '2026-10-05', to: '2026-10-07' }]);
  assert.equal(h[0].summary, 'תיק טבע: תאריך 05/10/2026 ← 07/10/2026');
  assert.ok(h[0].at > h[1].at || h[0].at === h[1].at);

  db.put('cases', { id, date: '2026-10-07', place: 'הרצליה' }); // nothing really changed
  assert.equal(historyFor(id).length, 2);
  db.put('cases', { id, notes: '' }); // empty vs missing is not a change either
  assert.equal(historyFor(id).length, 2);
});

test('records that point at a case land in its history; deletion yields an entry with deleted=true', () => {
  wipeHistory();
  const cid = db.put('cases', { client: 'סטרטסיס', status: 'נסגר' });
  const tid = db.put('tasks', { title: 'להזמין אוטובוס', due: '2026-10-05', caseId: cid, status: 'open' });
  db.put('tasks', { id: tid, status: 'done' });
  db.remove('tasks', tid);
  const h = historyFor(cid);
  assert.deepEqual(h.map(x => [x.col, !!x.isNew, !!x.deleted]), [['tasks', false, true], ['tasks', false, false], ['tasks', true, false], ['cases', true, false]]);
  assert.equal(h[0].deleted, true); assert.equal(h[0].refId, tid); assert.deepEqual(h[0].changes, []);
  assert.equal(h[0].summary, 'משימה להזמין אוטובוס: נמחק');
  assert.deepEqual(h[1].changes, [{ field: 'status', from: 'open', to: 'done' }]);
});

test('receipts and the history collection itself are never recorded', () => {
  wipeHistory();
  db.put('receipts', { month: '2026-09', text: 'x' });
  db.put('history', { col: 'cases', refId: 'zzz', at: '2020-01-01T00:00:00.000Z', changes: [], summary: 'manual' });
  assert.equal(db.list('history').length, 1);
  assert.equal(db.list('history')[0].summary, 'manual');
});

test('the store keeps at most CAP entries and drops the oldest', () => {
  wipeHistory();
  const id = db.put('notes', { text: 'a' });
  for (let i = 0; i < CAP + 20; i++) db.put('notes', { id, text: 'v' + i });
  const all = db.list('history');
  assert.equal(all.length, CAP);
  assert.ok(!all.some(h => h.isNew), 'the very first (oldest) entry is gone');
  assert.ok(all.some(h => h.changes[0] && h.changes[0].to === 'v' + (CAP + 19)), 'the newest entry is there');
});

test('describe speaks three languages and formats dates; unknown fields keep their key', () => {
  const e = { col: 'tasks', label: 'אוטובוס', changes: [{ field: 'due', from: '2026-10-05', to: '' }, { field: 'foo', from: 'a', to: 'b' }] };
  assert.equal(describe(e, 'he'), 'משימה אוטובוס: עד מתי 05/10/2026 ← ריק; foo a ← b');
  assert.equal(describe(e, 'fr'), 'Tâche אוטובוס: Échéance 05/10/2026 → vide; foo a → b');
  assert.equal(describe(e, 'en'), 'Task אוטובוס: Due 05/10/2026 → empty; foo a → b');
  assert.equal(describe(e, 'xx'), describe(e, 'he'));
  assert.equal(describe({ col: 'cases', label: 'טבע', deleted: true, changes: [] }, 'en'), 'Event טבע: deleted');
  assert.equal(describe({ col: 'payments', label: '', isNew: true, changes: [{ field: 'amount', from: '', to: '500' }] }, 'fr'), 'Paiement: créé (Montant: 500)');
  assert.equal(describe({ col: 'cases', label: 'x', changes: [{ field: 'status', from: 'פנייה', to: 'נסגר' }] }, 'en', { value: (f, v) => f === 'status' ? 'S:' + v : null }), 'Event x: Status S:פנייה → S:נסגר');
});

test('diff, entryFor and groupByDay are pure', () => {
  assert.deepEqual(diff({ a: 1, updated: 'x' }, { a: 1, updated: 'y' }), []);
  assert.deepEqual(diff({ a: 1 }, { a: 2, b: [1, 2] }), [{ field: 'a', from: '1', to: '2' }, { field: 'b', from: '', to: '[2]' }]);
  assert.equal(diff({ t: 'x'.repeat(200) }, { t: 'y' })[0].from.length, 60);
  assert.equal(entryFor({ col: 'receipts', id: '1', before: null, after: { x: 1 } }), null);
  assert.equal(entryFor({ col: 'cases', id: '1', before: { id: '1', a: 1 }, after: { id: '1', a: 1 } }), null);
  const e = entryFor({ col: 'links', id: 'l1', before: { id: 'l1', caseId: 'c9', supplier: 'קייטרינג', status: 'ממתין' }, after: { id: 'l1', caseId: 'c9', supplier: 'קייטרינג', status: 'אישר' } }, '2026-09-29T10:00:00.000Z');
  assert.equal(e.caseId, 'c9'); assert.equal(e.label, 'קייטרינג'); assert.equal(e.at, '2026-09-29T10:00:00.000Z');
  assert.deepEqual(e.changes, [{ field: 'status', from: 'ממתין', to: 'אישר' }]);
  const g = groupByDay([{ at: '2026-09-28T10:00:00Z' }, { at: '2026-09-29T09:00:00Z' }, { at: '2026-09-29T08:00:00Z' }]);
  assert.deepEqual(g.map(x => [x.day, x.items.length]), [['2026-09-29', 2], ['2026-09-28', 1]]);
});
