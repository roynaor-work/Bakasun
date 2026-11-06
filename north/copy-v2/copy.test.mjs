import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PRODUCTS } from '../js/products.js';
import { copyViolations } from './copy-rules.mjs';
import { renderArtifacts } from './render.mjs';

const dir = new URL('./', import.meta.url);
const read = name => readFileSync(new URL(name, dir), 'utf8');
const load = name => JSON.parse(read(name));
const metadata = new Set(['claims.json', 'sources.json', 'review.json']);
const customerFiles = readdirSync(dir).filter(name => name.endsWith('.html') || (name.endsWith('.json') && !metadata.has(name)));

for (const name of customerFiles) {
  test(`copy rules: ${name}`, () => {
    assert.deepEqual(copyViolations(read(name)), [], name);
    if (name.endsWith('.json')) {
      for (const [pointer, value] of leaves(load(name))) assert.deepEqual(copyViolations(value), [], name + pointer);
    }
  });
}

test('the checker rejects prohibited variants instead of silently passing them', () => {
  const fixtures = [
    ['טקסט' + String.fromCodePoint(33), 'exclamation'],
    ['טקסט！', 'exclamation'], ['טקסט‼', 'exclamation'], ['טקסט⁉', 'exclamation'],
    ['טקסט&#33;', 'exclamation'], ['טקסט&#x21;', 'exclamation'], ['טקסט&excl;', 'exclamation'],
    ...['מבצע', 'במבצעים', 'הנחה', 'בהנחות', 'הנחת', 'מִבְצָע', 'קו\u200fפון', 'סייל', 'SALE', 'discount', 'מחיר מיוחד', 'רק היום', 'חינם', '1+1', 'בהטבה', 'מוזלים', 'מ<b>ב</b>צע'].map(s => [s, 'promotion']),
    ...[
      ['050', '000', '0000'].join('-'), ['03', '000', '0000'].join(' '),
      ['+972', '50', '000', '0000'].join(' '), ['00972', '50', '000', '0000'].join('-'),
      ['+1', '(202)', '000', '0000'].join(' '), ['０５０', '０００', '００００'].join('-'),
      ['050', '000', '0000'].join('\u200f'), 'tel:{{phone}}', 'https://wa.me/{{phone}}',
    ].map(s => [s, 'phone']),
  ];
  for (const [text, kind] of fixtures) assert.ok(copyViolations(text).includes(kind), `${kind}: ${text}`);
  assert.ok(copyViolations(JSON.parse('"טקסט\\u0021"')).includes('exclamation'));
  for (const safe of ['מתנות לעובדים וללקוחות', '14 יום', '1–2 ימי עסקים', '18 ומעלה', '700 מ״ל', '5% או 100 ₪', 'הזמנה {{orderNumber}}']) {
    assert.deepEqual(copyViolations(safe), [], safe);
  }
});

test('known source ambiguities and operational promises are handled conservatively', () => {
  const products = load('products.json');
  const desc = id => products.find(p => p.id === id).desc;
  assert.doesNotMatch(desc('wine-cheese'), /גבינות/);
  assert.match(desc('shaker'), /ג׳ין, וודקה או רום/);
  assert.match(desc('birthday'), /פרוסקו או שמפניה/);
  assert.doesNotMatch(JSON.stringify(products), /(?<!\p{L})קר(?:ה|ים)?(?!\p{L})|מובטח|הנמכר|בלון|פרחים/u);
  assert.doesNotMatch(JSON.stringify(load('business.json')), /באותו יום|לוגו|לכל הארץ|בתים/);
  assert.doesNotMatch(JSON.stringify(load('emails.json').shipping), /יצא|נשלח|מחר|יגיע|מעקב/);
  for (const name of customerFiles.filter(n => n.startsWith('email-'))) {
    const links = [...read(name).matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(links, ['https://roynaor-work.github.io/Bakasun/north/legal.html']);
  }
});

test('all twelve existing IDs receive only a description, exactly two sentences each', () => {
  const rows = load('products.json');
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.map(p => p.id).sort(), PRODUCTS.map(p => p.id).sort());
  assert.equal(new Set(rows.map(p => p.id)).size, 12);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['desc', 'id']);
    assert.equal(row.desc.split(/(?<=[.])\s+/u).length, 2, row.id);
    assert.equal((row.desc.match(/[.!?]/g) || []).length, 2, row.id);
    assert.ok(row.desc.endsWith('.'), row.id);
    const original = PRODUCTS.find(p => p.id === row.id);
    if (original.kosher === false) assert.match(row.desc, /לא כשר/, row.id);
  }
});

test('FAQ has the q/a schema consumed by products.js, and all required emails exist', () => {
  const faq = load('faq.json');
  assert.equal(faq.length, 15);
  for (const entry of faq) {
    assert.deepEqual(Object.keys(entry).sort(), ['a', 'q']);
    assert.ok(entry.q.endsWith('?'));
    assert.ok(entry.a.length > 0);
  }
  const emails = load('emails.json');
  assert.deepEqual(Object.keys(emails).sort(), ['cancellation', 'order-confirmation', 'shipping']);
  for (const mail of Object.values(emails)) {
    assert.ok(mail.subject.includes('{{orderNumber}}'));
    assert.ok(mail.body.length >= 3);
    assert.deepEqual([...JSON.stringify(mail).matchAll(/{{([^}]+)}}/g)].map(m => m[1]), ['orderNumber', 'orderNumber']);
  }
});

test('source hashes and every quoted line still match the two actual source files', () => {
  const sources = load('sources.json');
  assert.deepEqual([...sources.checkedFiles].sort(), ['north/js/products.js', 'north/legal.html']);
  for (const file of sources.checkedFiles) {
    const text = readFileSync(new URL('../' + file.slice('north/'.length), dir), 'utf8');
    assert.equal(createHash('sha256').update(text).digest('hex'), sources.sha256[file], `${file}: source changed; recheck claims`);
    for (const source of Object.values(sources.excerpts).filter(s => s.file === file)) {
      assert.equal(text.split(/\r?\n/)[source.line - 1], source.quote, `${file}:${source.line}`);
    }
  }
});

function leaves(value, pointer = '') {
  if (typeof value === 'string') return [[pointer, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, pointer + '/' + key));
}

test('every delivered JSON text is fully covered by the claim ledger', () => {
  const claims = load('claims.json');
  const sources = load('sources.json');
  assert.equal(new Set(claims.map(c => c.id)).size, claims.length);
  for (const file of ['products.json', 'faq.json', 'business.json', 'emails.json']) {
    const content = new Map(leaves(load(file)).filter(([pointer]) => !pointer.endsWith('/id')));
    const grouped = new Map();
    for (const c of claims.filter(c => c.file === file)) {
      assert.ok(content.has(c.pointer), c.id);
      assert.ok(c.sources.length > 0, c.id);
      for (const id of c.sources) assert.ok(sources.excerpts[id], c.id + ': ' + id);
      assert.ok(['fact', 'editorial', 'event-template', 'navigation'].includes(c.kind), c.id);
      if (c.kind === 'event-template') assert.ok(c.condition?.length > 20, c.id);
      grouped.set(c.pointer, [...(grouped.get(c.pointer) || []), c.text]);
    }
    for (const [pointer, text] of content) {
      assert.equal(grouped.get(pointer)?.join(' '), text, `${file}${pointer}: missing or stale claim`);
    }
  }
  assert.ok(claims.every(c => ['products.json', 'faq.json', 'business.json', 'emails.json'].includes(c.file)));
});

test('HTML and the readable claim table match reviewed JSON exactly', () => {
  for (const [name, expected] of Object.entries(renderArtifacts())) assert.equal(read(name), expected, name);
  for (const name of customerFiles.filter(n => n.endsWith('.html'))) {
    assert.match(read(name), /dir="rtl" lang="he"/);
    assert.doesNotMatch(read(name), /<script|on\w+=/i);
  }
});

test('four self-review rounds score every item at least eight', () => {
  const review = load('review.json');
  const required = [...PRODUCTS.map(p => p.id), 'business', 'faq', ...load('faq.json').map((_, i) => `faq-${String(i + 1).padStart(2, '0')}`), 'order-confirmation', 'shipping', 'cancellation'];
  assert.equal(review.rounds.length, 4);
  assert.equal(new Set(review.rounds.map(r => r.round)).size, 4);
  for (const round of review.rounds) {
    assert.ok(round.focus.length > 0 && round.findings.length > 0);
    assert.deepEqual(Object.keys(round.scores).sort(), required.sort());
    for (const score of Object.values(round.scores)) assert.ok(Number.isInteger(score) && score >= 8 && score <= 10);
  }
});
