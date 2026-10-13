import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { csvCell } from '../js/logic/participants.js';
import { monthCsv } from '../js/logic/money.js';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { addEventListener() {} };
const { db } = await import('../js/store.js');
const calls = await import('../js/screens/calls.js');
const notes = await import('../js/screens/notes.js');
const { esc } = await import('../js/ui.js');
const root = () => ({ innerHTML: '', querySelector: () => ({}), querySelectorAll: () => [] });
const payload = '<img src=x onerror="window.__b3Xss=1">';

function callMarkup() {
  db.importJson(JSON.stringify({ calls: [{ id: 'b3-call', name: 'איש קשר בדיקה', status: 'todo', attempts: payload, updated: '2999-01-01T00:00:00.000Z' }] }));
  const element = root(); calls.render({ root: element }); return element.innerHTML;
}
test('B3-A01 current: imported attempts is emitted as executable HTML in the call screen', () => {
  assert.ok(callMarkup().includes(payload));
});
test('B3-A01 fix: imported attempts never creates an HTML element',
  { skip: 'B3-A01: calls.render inserts c.attempts into innerHTML without esc or numeric validation; also confirmed in Chromium.' }, () => {
    assert.ok(!callMarkup().includes(payload));
  });

function noteMarkup() {
  db.importJson(JSON.stringify({ notes: [{ id: 'b3-note', text: 'בדיקה', about: 'client', aboutLabel: 'לקוח בדיקה',
    aboutId: 'b3-client" onclick="window.__b3NoteXss=1', updated: '2999-01-01T00:00:00.000Z' }] }));
  const element = root(); notes.render({ root: element }); return element.innerHTML;
}
test('B3-A01 current: imported note subject can break out of its href attribute', () => {
  assert.match(noteMarkup(), /href="#\/client\/b3-client" onclick="window\.__b3NoteXss=1"/);
});
test('B3-A01 fix: note subject URLs escape imported identifiers',
  { skip: 'B3-A01: notes.render inserts LINK[n.about](n.aboutId) into an unescaped href.' }, () => {
    assert.doesNotMatch(noteMarkup(), /onclick="window\.__b3NoteXss/);
  });

test('B3-A01 control: the shared escaping helper handles element and attribute boundaries', () => {
  assert.equal(esc(payload), '&lt;img src=x onerror=&quot;window.__b3Xss=1&quot;&gt;');
});

test('B3-A02 current: CSV export preserves a formula supplied as participant data', () => {
  assert.equal(csvCell('=1+1'), '=1+1');
  const csv = monthCsv({ clientRows: [{ client: '=1+1', amount: 1 }], supplierRows: [], totalIn: 1, totalOut: 0 });
  assert.ok(csv.includes('"=1+1"')); // CSV quoting does not disable spreadsheet formulas.
});
test('B3-A02 fix: text cells beginning with formula characters are neutralized in CSV',
  { skip: 'B3-A02: csvCell and monthCsv escape delimiters but do not neutralize formula prefixes.' }, () => {
    for (const prefix of ['=', '+', '-', '@']) assert.ok(csvCell(prefix + '1+1').startsWith("'"));
  });

const sql = readFileSync(new URL('../supabase/bootstrap.sql', import.meta.url), 'utf8');
const membershipWhere = sql.slice(sql.indexOf('from auth.users'), sql.indexOf('on conflict', sql.indexOf('from auth.users')));
test('B3-A03 current (static): bootstrap adds every auth.users row without a membership allowlist', () => {
  assert.match(sql, /from auth\.users u, orgs o where o\.name = 'Baka San'/);
  assert.doesNotMatch(membershipWhere, /where[\s\S]*u\.(?:id|email)\s+(?:in|=)/i);
});
test('B3-A03 fix (static): organization bootstrap uses an explicit user allowlist',
  { skip: 'B3-A03: bootstrap.sql cross-joins all registered users into the organization; live memberships were not queried.' }, () => {
    assert.match(membershipWhere, /where[\s\S]*u\.(?:id|email)\s+(?:in|=)/i);
  });

test('B3-A04 control: the checked-in Supabase browser JWT is an anon key, not a service-role secret', () => {
  const source = readFileSync(new URL('../js/data/cloudcfg.js', import.meta.url), 'utf8');
  const jwt = source.match(/key: '([^']+)'/)[1];
  assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).role, 'anon');
});
test('B3-A04 current: the supposedly fictional e2e fixture contains the production default business phone', async () => {
  const { DEFAULTS } = await import('../js/data/defaults.js');
  const fixture = readFileSync(new URL('./e2e/fixture.json', import.meta.url), 'utf8');
  assert.ok(fixture.includes(DEFAULTS.bizPhone)); // No real contact values are duplicated in this test.
});
test('B3-A04 fix: shared fixtures contain no production default phone',
  { skip: 'B3-A04: tests/e2e/fixture.json currently includes a real default business contact; replace with reserved fictional contacts.' }, async () => {
    const { DEFAULTS } = await import('../js/data/defaults.js');
    assert.ok(!readFileSync(new URL('./e2e/fixture.json', import.meta.url), 'utf8').includes(DEFAULTS.bizPhone));
  });
