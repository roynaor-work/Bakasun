import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as grow from '../supabase/functions/_shared/grow.mjs';
import { computeTotal } from '../supabase/functions/_shared/pricing.mjs';

test('A04 (audit 2026-11-05): payment verification requires a finite matching amount', () => {
    assert.equal(grow.matchesOrder(grow.parseInfo({ status: 1, data: { transactionId: 'b3-tx', statusCode: 2, sum: 1000 } }), { total: 1000 }, { transactionId: 'b3-tx' }), true);
    for (const sum of [undefined, 'not-a-number']) {
      const info = grow.parseInfo({ status: 1, data: { transactionId: 'b3-tx', statusCode: 2, sum } });
      assert.equal(grow.matchesOrder(info, { total: 1000 }, { transactionId: 'b3-tx' }), false);
    }
  });

// Run the checked-in handler with TypeScript annotations removed by Node's parser.
// Only imports are replaced with injected dependencies; fetch and Deno are local fakes.
// This does not deploy a function or query a real order.
async function createPayment(order = {}, opt = {}) {
  let handler; const requests = [];
  const source = readFileSync(new URL('../supabase/functions/grow-pay/index.ts', import.meta.url), 'utf8');
  const env = { GROW_USER_ID: 'B3_TEST_USER', GROW_PAGE_CODE: 'B3_TEST_PAGE', SUPABASE_URL: 'https://b3-cloud.invalid', SUPABASE_SERVICE_ROLE_KEY: 'B3_TEST_KEY' };
  const context = { ...grow, computeTotal, PRODUCTS: [{ id: 'b3-cheap', price: 10 }], BUILD: {}, SHIPPING: { pickup: { price: 0 } },
    Response, URL, FormData, console,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('createPaymentProcess')) return { json: async () => ({ status: 1, data: { url: 'https://b3-payment.invalid', processId: 'b3-process', processToken: 'B3_TEST_PROCESS' } }) };
      if (url.includes('select=') && options?.method !== 'PATCH') return { ok: true, json: async () => opt.saved ? [opt.saved] : [] };
      return { ok: true, status: 204 };
    }
  };
  runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, ''), context);
  const response = await handler({ method: 'POST', url: 'https://b3-cloud.invalid/functions/v1/grow-pay',
    json: async () => ({ order, returnBase: opt.returnBase || 'https://roynaor-work.github.io/Bakasun/north/' }) });
  return { status: response.status, requests, patch: requests.find(request => request.options.method === 'PATCH') };
}
test('A01 (audit 2026-11-05, P1): payment creation prices from the saved order and needs its access token', async () => {
  const saved = { order_no: 'RC-1', status: 'new', pay: 'card', method: 'pickup', items: [{ id: 'b3-cheap', qty: 1 }], customer: { name: 'x' }, totals: { access: 'a'.repeat(32), total: 10 } };
  const pay = (order, over) => createPayment(order, { saved, ...over });
  // no / wrong token, unknown order: same 404, and no payment is created
  for (const order of [{ no: 'RC-1', access: 'b'.repeat(32) }, { no: 'RC-1', access: 'short' }, { no: 'RC-2', access: 'a'.repeat(32) }]) {
    const r = await pay(order, order.no === 'RC-2' ? { saved: null } : {});
    assert.notEqual(r.status, 200); assert.ok(!r.requests.some(x => x.url.includes('createPaymentProcess')));
  }
  // body items and total are ignored: the saved items decide the amount
  const ok = await pay({ no: 'RC-1', access: 'a'.repeat(32), total: 1, items: [{ id: 'b3-cheap', qty: 99 }] });
  assert.equal(ok.status, 200); assert.equal(JSON.parse(ok.patch.options.body).total, 10);
  // an already paid order cannot start a new process
  assert.equal((await pay({ no: 'RC-1', access: 'a'.repeat(32) }, { saved: { ...saved, status: 'paid' } })).status, 409);
  // returnBase only from approved origins
  assert.equal((await pay({ no: 'RC-1', access: 'a'.repeat(32) }, { returnBase: 'https://evil.invalid/' })).status, 400);
});

const sql = readFileSync(new URL('../supabase/north.sql', import.meta.url), 'utf8');
test('A05 (audit 2026-11-05): policy columns exist before the north insert policy is created', () => {
  const use = sql.indexOf('with check (status');
  assert.ok(use > 0);
  for (const column of ['grow_process_id', 'grow_transaction_id', 'paid_at']) assert.ok(sql.indexOf('add column if not exists ' + column) < use);
});

test('B3-C04 control: an explicit transaction mismatch or known insufficient payment is rejected', () => {
  assert.equal(grow.matchesOrder({ paid: true, transactionId: 'b3-a', sum: 1000 }, { total: 1000 }, { transactionId: 'b3-b' }), false);
  assert.equal(grow.matchesOrder({ paid: true, transactionId: 'b3-a', sum: 10 }, { total: 1000 }, { transactionId: 'b3-a' }), false);
});

async function activateWorker() {
  const handlers = {}, deleted = [];
  const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const currentCache = source.match(/const CACHE = '([^']+)'/)[1];
  const keys = [currentCache, 'bakasun-v0', 'bakasun-share', 'b3-other-app-cache', 'island-assets-audit', 'workout-royiki-v1', 'island-offline-v3'];
  runInNewContext(source, { self: { addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } },
    caches: { keys: async () => keys, delete: async key => { deleted.push(key); return true; } } });
  let pending; handlers.activate({ waitUntil(promise) { pending = promise; } }); await pending;
  return deleted;
}
test('A03 (audit 2026-11-05, P1): worker upgrades delete only old shell caches of this application', async () => {
  assert.deepEqual(await activateWorker(), ['bakasun-v0']);
});
