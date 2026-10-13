import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as grow from '../supabase/functions/_shared/grow.mjs';
import { computeTotal } from '../supabase/functions/_shared/pricing.mjs';

test('B3-C01 current: verified payment info without an amount passes order matching', () => {
  const info = grow.parseInfo({ status: 1, data: { transactionId: 'b3-tx', statusCode: 2 } });
  assert.equal(info.sum, null);
  assert.equal(grow.matchesOrder(info, { total: 1000 }, { transactionId: 'b3-tx' }), true);
  const invalid = grow.parseInfo({ status: 1, data: { transactionId: 'b3-tx', statusCode: 2, sum: 'not-a-number' } });
  assert.equal(grow.matchesOrder(invalid, { total: 1000 }, { transactionId: 'b3-tx' }), true);
});
test('B3-C01 fix: payment verification requires a finite matching amount',
  { skip: 'B3-C01: matchesOrder skips null amounts and NaN comparisons are false, so malformed info can mark an order paid.' }, () => {
    for (const sum of [undefined, 'not-a-number']) {
      const info = grow.parseInfo({ status: 1, data: { transactionId: 'b3-tx', statusCode: 2, sum } });
      assert.equal(grow.matchesOrder(info, { total: 1000 }, { transactionId: 'b3-tx' }), false);
    }
  });

// Run the checked-in handler with TypeScript annotations removed by Node's parser.
// Only imports are replaced with injected dependencies; fetch and Deno are local fakes.
// This does not deploy a function or query a real order.
async function createPayment() {
  let handler; const requests = [];
  const source = readFileSync(new URL('../supabase/functions/grow-pay/index.ts', import.meta.url), 'utf8');
  const env = { GROW_USER_ID: 'B3_TEST_USER', GROW_PAGE_CODE: 'B3_TEST_PAGE', SUPABASE_URL: 'https://b3-cloud.invalid', SUPABASE_SERVICE_ROLE_KEY: 'B3_TEST_KEY' };
  const context = { ...grow, computeTotal, PRODUCTS: [{ id: 'b3-cheap', price: 10 }], BUILD: {}, SHIPPING: { pickup: { price: 0 } },
    Response, URL, FormData, console,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('createPaymentProcess')) return { json: async () => ({ status: 1, data: { url: 'https://b3-payment.invalid', processId: 'b3-process', processToken: 'B3_TEST_PROCESS' } }) };
      return { ok: true, status: 204 };
    }
  };
  runInNewContext(stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, ''), context);
  const response = await handler({ method: 'POST', url: 'https://b3-cloud.invalid/functions/v1/grow-pay',
    json: async () => ({ order: { no: 'b3-existing-order', total: 1000, items: [{ id: 'b3-cheap', qty: 1, price: 10 }], customer: { name: 'לקוח בדיקה' } }, returnBase: 'https://b3-app.invalid/' }) });
  return { status: response.status, requests, patch: requests.find(request => request.options.method === 'PATCH') };
}
test('B3-C02 current: caller-supplied items replace the total of the order named by the caller', async () => {
  const result = await createPayment();
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.patch.options.body).total, 10);
  assert.ok(result.patch.url.endsWith('order_no=eq.b3-existing-order'));
  assert.ok(!result.requests.some(request => request.url.includes('/north_orders') && (!request.options.method || request.options.method === 'GET')));
});
test('B3-C02 fix: payment creation validates the stored order and its ownership before repricing',
  { skip: 'B3-C02: grow-pay trusts body.order.no/items and patches with service role without reading the saved order; the public anon key is sufficient at the gateway.' }, async () => {
    assert.notEqual((await createPayment()).status, 200);
  });

const sql = readFileSync(new URL('../supabase/north.sql', import.meta.url), 'utf8');
test('B3-C03 current (static): fresh SQL bootstrap references Grow columns before adding them', () => {
  const use = sql.indexOf('with check (status');
  assert.ok(use > 0);
  for (const column of ['grow_process_id', 'grow_transaction_id', 'paid_at']) {
    assert.ok(sql.indexOf('add column if not exists ' + column) > use);
    assert.ok(!sql.slice(0, sql.indexOf(');')).includes(column));
  }
});
test('B3-C03 fix (static): policy columns exist before the north insert policy is created',
  { skip: 'B3-C03: new north_orders has no Grow columns when the insert policy is created; SQL was reviewed statically, not run in production.' }, () => {
    assert.ok(sql.indexOf('add column if not exists grow_process_id') < sql.indexOf('with check (status'));
  });

test('B3-C04 control: an explicit transaction mismatch or known insufficient payment is rejected', () => {
  assert.equal(grow.matchesOrder({ paid: true, transactionId: 'b3-a', sum: 1000 }, { total: 1000 }, { transactionId: 'b3-b' }), false);
  assert.equal(grow.matchesOrder({ paid: true, transactionId: 'b3-a', sum: 10 }, { total: 1000 }, { transactionId: 'b3-a' }), false);
});

async function activateWorker() {
  const handlers = {}, deleted = [];
  const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const currentCache = source.match(/const CACHE = '([^']+)'/)[1];
  const keys = [currentCache, 'bakasun-v0', 'bakasun-share', 'b3-other-app-cache'];
  runInNewContext(source, { self: { addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } },
    caches: { keys: async () => keys, delete: async key => { deleted.push(key); return true; } } });
  let pending; handlers.activate({ waitUntil(promise) { pending = promise; } }); await pending;
  return deleted;
}
test('B3-S06 current: service worker activation deletes pending shared files and other applications caches', async () => {
  assert.deepEqual(await activateWorker(), ['bakasun-v0', 'bakasun-share', 'b3-other-app-cache']);
});
test('B3-S06 fix: worker upgrades delete only old shell caches owned by this application',
  { skip: 'B3-S06: activate() removes every origin cache except CACHE, including bakasun-share with pending attachments.' }, async () => {
    assert.deepEqual(await activateWorker(), ['bakasun-v0']);
  });
