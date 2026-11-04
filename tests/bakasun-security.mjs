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

const poisonedAttempts = payload;
const poisonedAboutId = 'b3-client" onclick="window.__b3NoteXss=1';
function callMarkup(viaImport) {
  const row = { id: 'b3-call', name: 'איש קשר בדיקה', status: 'todo', attempts: poisonedAttempts, updated: '2999-01-01T00:00:00.000Z' };
  if (viaImport) db.importJson(JSON.stringify({ calls: [row] })); else db.put('calls', row);
  const element = root(); calls.render({ root: element }); return element.innerHTML;
}
test('B3-A01 fix: a record that already holds markup in attempts is rendered as a number, never as an HTML element', () => {
  assert.ok(!callMarkup(false).includes('<img'));
});
test('B3-A01 fix: an imported backup never creates an HTML element from attempts, and attempts is stored as an integer', () => {
  assert.ok(!callMarkup(true).includes('<img'));
  assert.equal(db.get('calls', 'b3-call').attempts, 0);
});

function noteMarkup(viaImport) {
  const row = { id: 'b3-note', text: 'בדיקה', about: 'client', aboutLabel: 'לקוח בדיקה', aboutId: poisonedAboutId, updated: '2999-01-01T00:00:00.000Z' };
  if (viaImport) db.importJson(JSON.stringify({ notes: [row] })); else db.put('notes', row);
  const element = root(); notes.render({ root: element }); return element.innerHTML;
}
test('B3-A01 fix: note subject URLs escape identifiers that are already in the store', () => {
  const html = noteMarkup(false);
  assert.doesNotMatch(html, /" onclick=/);
  assert.match(html, /href="#\/client\/b3-client&quot; onclick=&quot;/);
});
test('B3-A01 fix: an imported note cannot carry an attribute-breaking aboutId', () => {
  assert.doesNotMatch(noteMarkup(true), /onclick=/);
});
test('B3-A01 fix: backup import skips non-object rows and ids that are not plain identifiers', () => {
  const before = db.list('clients').length;
  const n = db.importJson(JSON.stringify({ clients: [null, 5, 'x', [], { id: 7 }, { id: 'a"b' }, { id: '<i>' }, { id: 'ok-1', name: 'תקין', updated: '2999-01-01T00:00:00.000Z' }] }));
  assert.equal(n, 1); assert.equal(db.list('clients').length, before + 1);
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
