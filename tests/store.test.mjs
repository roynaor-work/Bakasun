import { test } from 'node:test';
import assert from 'node:assert/strict';

// The store runs in the browser; here it gets a tiny localStorage and window so it can be imported.
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.window = globalThis.window || globalThis;
const { db } = await import('../js/store.js');

test('a backup file only adds and updates; it never removes, and there is no wipe', () => {
  const a = db.put('clients', { name: 'קיים' });
  const b = db.put('clients', { name: 'ישן', phone: '1' });
  const older = Object.assign({}, db.get('clients', b), { phone: '9', updated: '2000-01-01T00:00:00.000Z' });
  const newer = Object.assign({}, db.get('clients', b), { phone: '2', updated: '2999-01-01T00:00:00.000Z' });
  const n = db.importJson(JSON.stringify({ clients: [older, { id: 'zzz', name: 'חדש מהגיבוי' }], suppliers: [], settings: { signer: 'מהגיבוי' } }));
  assert.equal(n, 1);
  assert.equal(db.get('clients', a).name, 'קיים');
  assert.equal(db.get('clients', b).phone, '1');
  assert.equal(db.get('clients', 'zzz').name, 'חדש מהגיבוי');
  assert.equal(db.setting('signer'), 'מהגיבוי');
  db.importJson(JSON.stringify({ clients: [newer] }));
  assert.equal(db.get('clients', b).phone, '2');
  assert.equal(db.list('clients').length, 3);
  assert.equal(typeof db.clear, 'undefined');
});
