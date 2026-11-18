import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DOMAINS, loadBank} from '../src/data.mjs';

test('bank files load once on demand and can be retried after a failed request', async t => {
  const requests = [];
  let failMath = true;
  t.mock.method(globalThis, 'fetch', async url => {
    const domain = url.pathname.match(/\/data\/([^/]+)\.json$/u)?.[1];
    requests.push(domain);
    if (domain === 'math' && failMath) return {ok: false, status: 503};
    return {ok: true, json: async () => [{id: domain, domain}]};
  });
  assert.deepEqual(requests, []);
  await assert.rejects(loadBank(), /math.*503/u);
  assert.deepEqual(requests, DOMAINS);
  failMath = false;
  const pending = loadBank();
  assert.strictEqual(pending, loadBank());
  assert.deepEqual((await pending).map(question => question.domain), DOMAINS);
  assert.deepEqual(requests, [...DOMAINS, ...DOMAINS]);
});
