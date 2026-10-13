import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A minimal DOM to exercise the real modal lifecycle without browser dependencies.
// No outgoing links are followed and no service is contacted.
const modals = [], opened = [];
const classes = () => ({ add() {}, remove() {} });
function element(tag) {
  const listeners = {}, buttons = new Map();
  const el = { tagName: tag.toUpperCase(), innerHTML: '', dataset: {}, classList: classes(), style: {},
    setAttribute() {}, addEventListener(type, fn) { listeners[type] = fn; },
    remove() { const i = modals.indexOf(el); if (i >= 0) modals.splice(i, 1); },
    click() { opened.push(el.href); },
    querySelector(selector) {
      if (selector === 'form') return el.form ||= element('form');
      if (selector.startsWith('#') && el.innerHTML.includes('id="' + selector.slice(1) + '"')) {
        if (!buttons.has(selector)) buttons.set(selector, element('button')); return buttons.get(selector);
      }
      return null;
    },
    submit(values) { el.values = values; listeners.submit({ preventDefault() {} }); }
  };
  el.dispatch = (type, event) => listeners[type]?.(event);
  return el;
}
globalThis.document = { __bakasunCopy: true, createElement: element, addEventListener() {}, getElementById: () => null,
  body: { appendChild(el) { if (el.className === 'modal') modals.push(el); } },
  querySelector(selector) { const match = /\.modal #([\w-]+)/.exec(selector); return match ? modals.at(-1)?.querySelector('#' + match[1]) || null : null; }
};
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.FormData = class { constructor(form) { this.values = form.values; } forEach(fn) { Object.entries(this.values).forEach(([key, value]) => fn(value, key)); } };
const { db } = await import('../js/store.js');
const { dialog } = await import('../js/ui.js');
const { shareFile } = await import('../js/files.js');
const { sendMonth } = await import('../js/screens/receipts.js');
const { newQuote } = await import('../js/screens/quotes.js');
globalThis.location = { hash: '' };

async function cancelledAttachment() {
  const item = { key: './share-item/b3', name: 'b3.png', type: 'image/png', size: 4 };
  let index = [item]; const removed = [];
  globalThis.caches = { open: async () => ({
    match: async key => key === './share-index' ? new Response(JSON.stringify(index)) : new Response(new Blob(['test'], { type: 'image/png' })),
    put: async (key, response) => { if (key === './share-index') index = await response.json(); },
    delete: async key => { removed.push(key); return true; }
  }) };
  db.put('cases', { id: 'b3-case', client: 'ארגון בדיקה', status: 'נסגר' });
  const buttons = new Map();
  const card = { dataset: { i: '0' }, querySelector(selector) {
    if (!buttons.has(selector)) buttons.set(selector, {}); return buttons.get(selector);
  } };
  const root = { innerHTML: '', querySelectorAll: () => [card] };
  const share = await import('../js/screens/share.js'); await share.render({ root });
  const pending = buttons.get('[data-event]').onclick();
  for (let i = 0; i < 100 && !modals.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const wrap = modals.at(-1); assert.ok(wrap);
  wrap.dispatch('click', { target: wrap }); await pending;
  return { index, removed };
}
test('B3-S07 current: cancelling event attachment removes the shared file from the inbox', async () => {
  const result = await cancelledAttachment();
  assert.deepEqual(result.index, []); assert.deepEqual(result.removed, ['./share-item/b3']);
});
test('B3-S07 fix: cancelling event selection keeps the shared file available',
  { skip: 'B3-S07: pickCaseAndAttach returns null on cancellation but share.render deletes the item whenever the result is not false.' }, async () => {
    assert.equal((await cancelledAttachment()).index.length, 1);
  });

async function monthFlow() {
  db.put('receipts', { id: 'b3-receipt', month: '2026-09', date: '2026-09-12', supplier: 'ספק בדיקה', amount: 10 });
  db.setting('monthsSent', '[]'); opened.length = 0;
  const pending = sendMonth('2026-09', 'דוח בדיקה', 'בדיקה', 'accountant@example.invalid');
  // sendMonth awaits its dialog before attempting to attach the handler.
  for (let i = 0; i < 100 && !modals.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const wrap = modals.at(-1); assert.ok(wrap);
  const button = wrap.querySelector('#shareFiles'); assert.ok(button);
  const whileOpen = typeof button.onclick;
  wrap.querySelector('form').submit({ to: 'accountant@example.invalid', text: 'דוח בדיקה' });
  await pending;
  return { whileOpen, sent: JSON.parse(db.setting('monthsSent')), opened: [...opened] };
}
test('B3-U01 current: accountant share-files button has no handler while the dialog is open', async () => {
  assert.equal((await monthFlow()).whileOpen, 'undefined');
});
test('B3-U01 fix: accountant attachments are shareable before closing the dialog',
  { skip: 'B3-U01: sendMonth awaits dialog(), so it wires #shareFiles only after the modal was removed; casefiles.mail has the same bug.' }, async () => {
    assert.equal((await monthFlow()).whileOpen, 'function');
  });
test('B3-U02 current: opening an accountant email marks the entire month as sent', async () => {
  const result = await monthFlow();
  assert.ok(result.opened.some(url => url?.startsWith('mailto:')));
  assert.deepEqual(result.sent, ['2026-09']);
});
test('B3-U02 fix: preparing an email without confirmation leaves the month pending',
  { skip: 'B3-U02: sendMonth writes monthsSent immediately after openMail; contracts.sendContract does likewise with status sent.' }, async () => {
    assert.deepEqual((await monthFlow()).sent, []);
  });

test('B3-U03 control: OS share-sheet cancellation is handled without triggering a download fallback', async () => {
  navigator.canShare = () => true;
  navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
  assert.equal(await shareFile({ name: 'b3.txt', type: 'text/plain', blob: new Blob(['בדיקה']) }), true);
});
test('B3-U04 current: modal lacks dialog semantics, keyboard dismissal and focus containment', async () => {
  const pending = dialog('בדיקה', ''); const wrap = modals.at(-1);
  assert.doesNotMatch(wrap.innerHTML, /role="dialog"|aria-modal|aria-labelledby/);
  // Resolve the real dialog with its form, avoiding leaked promises.
  wrap.querySelector('form').submit({}); await pending;
});
test('B3-U04 fix: shared modal exposes its role and accessible title',
  { skip: 'B3-U04: dialog creates a div/form without dialog role, aria-modal, Escape handling, focus trap or focus restoration.' }, async () => {
    const pending = dialog('בדיקה', ''); const wrap = modals.at(-1);
    const markup = wrap.innerHTML; wrap.querySelector('form').submit({}); await pending;
    assert.match(markup, /role="dialog"/); assert.match(markup, /aria-modal="true"/);
  });

test('B3-F10 current: a numeric zero VAT and zero markup setting revert to defaults in a new quote', () => {
  db.setting('vat', 0); db.setting('defaultMargin', 0);
  newQuote({ id: 'b3-case', client: 'ארגון בדיקה', kind: 'כנס', participants: 1 });
  const quote = db.list('quotes').at(-1);
  assert.equal(quote.vatRate, 18); assert.equal(quote.defaultMargin, 25);
});
test('B3-F10 fix: new quotes preserve explicit numeric zero defaults',
  { skip: 'B3-F10: newQuote uses s.vat || 18 and s.defaultMargin || 25; numeric settings imported from JSON can be zero.' }, () => {
    db.setting('vat', 0); db.setting('defaultMargin', 0);
    newQuote({ id: 'b3-case', client: 'ארגון בדיקה', kind: 'כנס', participants: 1 });
    assert.equal(db.list('quotes').at(-1).vatRate, 0);
  });

// Contrast derived from the actual stylesheet, without relying on a screenshot.
const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
function luminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map(part => parseInt(part, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const accents = [...css.matchAll(/--accent:\s*(#[\da-f]{6})/gi)].map(match => match[1]);
test('B3-U05 current: primary button colors fail WCAG AA for 16px bold text in both themes', () => {
  assert.match(css, /\.btn\.primary\s*\{[^}]*color:\s*var\(--accent-ink\)/);
  assert.match(css, /--accent-ink:\s*#fff/);
  assert.ok(ratio(accents[0], '#ffffff') < 4.5);
  assert.ok(ratio(accents[1], '#ffffff') < 4.5);
});
test('B3-U05 fix: primary button contrast is at least 4.5:1',
  { skip: 'B3-U05: white text on the current light/dark accent backgrounds is below 4.5:1 at the button font size.' }, () => {
    assert.ok(accents.every(color => ratio(color, '#ffffff') >= 4.5));
  });
