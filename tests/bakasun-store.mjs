import { test } from 'node:test';
import assert from 'node:assert/strict';

const wait = () => new Promise(resolve => setTimeout(resolve, 200));
let seq = 0;
async function device(initial = {}) {
  const memory = new Map(Object.entries(initial));
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const mod = await import('../js/store.js?b3-device=' + ++seq);
  return { ...mod, memory };
}

test('B3-S01 current: an older remote tombstone deletes a newer local client', async () => {
  const { db } = await device();
  db.put('clients', { id: 'b3-client', name: 'לקוח בדיקה' });
  db.mergeRemote([{ col: 'clients', id: 'b3-client', deleted: true, updated: '2000-01-01T00:00:00.000Z', data: { updated: '2000-01-01T00:00:00.000Z' } }]);
  assert.equal(db.get('clients', 'b3-client'), null);
  await wait();
});
test('B3-S01 fix: a stale tombstone cannot override a newer edit',
  { skip: 'B3-S01: mergeRemote handles deleted before checking timestamps; cloud reconcile also passes unqueued tombstones through.' }, async () => {
    const { db } = await device();
    db.put('clients', { id: 'b3-client', name: 'לקוח בדיקה' });
    db.mergeRemote([{ col: 'clients', id: 'b3-client', deleted: true, data: { updated: '2000-01-01T00:00:00.000Z' } }]);
    assert.ok(db.get('clients', 'b3-client'));
    await wait();
  });

test('B3-S02 current: import keeps the local setting but queues the rejected backup value for cloud sync', async () => {
  const { db, setChangeHook } = await device();
  db.setting('signer', 'חתימה מקומית');
  const changes = []; setChangeHook(item => changes.push(item));
  db.importJson(JSON.stringify({ settings: { signer: 'חתימה מהגיבוי' } }));
  assert.equal(db.setting('signer'), 'חתימה מקומית');
  assert.deepEqual(changes, [{ setting: 'signer', value: 'חתימה מהגיבוי' }]);
  await wait();
});
test('B3-S02 fix: an ignored backup setting is never sent to other devices',
  { skip: 'B3-S02: importJson invokes onChange with data.settings[k] even when it did not import that value.' }, async () => {
    const { db, setChangeHook } = await device(); db.setting('signer', 'חתימה מקומית');
    const changes = []; setChangeHook(item => changes.push(item));
    db.importJson(JSON.stringify({ settings: { signer: 'חתימה מהגיבוי' } }));
    assert.deepEqual(changes, []); await wait();
  });

test('B3-S03 current: corrupt stored JSON silently starts empty and is overwritten by the next save', async () => {
  const { db, memory, lastSaveError } = await device({ 'bakasun.v1': '{broken backup' });
  assert.deepEqual(db.list('clients'), []); assert.equal(lastSaveError(), '');
  db.setting('lang', 'he'); await wait();
  assert.doesNotThrow(() => JSON.parse(memory.get('bakasun.v1')));
  assert.equal(JSON.parse(memory.get('bakasun.v1')).clients.length, 0);
});
test('B3-S03 fix: corrupt stored data is reported and retained for recovery',
  { skip: 'B3-S03: load catches parsing errors without preserving a recovery copy or signalling the UI.' }, async () => {
    const { lastSaveError } = await device({ 'bakasun.v1': '{broken backup' });
    assert.notEqual(lastSaveError(), '');
  });

test('B3-S04 current: JSON backup contains file metadata but no file bytes', async () => {
  const { db } = await device();
  db.put('casefiles', { id: 'b3-file', fileId: 'b3-blob', name: 'test.pdf', cloudOk: false });
  const backup = JSON.parse(db.exportJson());
  assert.equal(backup.casefiles[0].fileId, 'b3-blob');
  assert.ok(!Object.hasOwn(backup.casefiles[0], 'blob'));
  await wait();
});
test('B3-S04 fix: the complete backup includes local attachment bytes',
  { skip: 'B3-S04: exportJson serializes store state only; IndexedDB files need a separate archive/restore path.' }, async () => {
    const { db } = await device(); db.put('casefiles', { id: 'b3-file', fileId: 'b3-blob', cloudOk: false });
    assert.ok(Object.hasOwn(JSON.parse(db.exportJson()).casefiles[0], 'blob'));
    await wait();
  });

test('B3-S05 control: quota failures are exposed through the save-error hook', async () => {
  const { db, setSaveErrorHook, lastSaveError } = await device();
  let error = ''; setSaveErrorHook(value => { error = value; });
  globalThis.localStorage.setItem = () => { throw new Error('B3 simulated quota'); };
  db.put('clients', { id: 'b3-client', name: 'לקוח בדיקה' }); await wait();
  assert.match(error, /B3 simulated quota/); assert.equal(lastSaveError(), error);
});
