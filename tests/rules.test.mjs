import { test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../js/logic/rules.js');
const today = '2026-09-30';
const ARABIC = new RegExp('[' + String.fromCharCode(0x600) + '-' + String.fromCharCode(0x6ff) + ']'); // the Arabic block, built without writing its letters

const cases = [
  { id: 'c1', client: 'שוב״ל', contact: 'עידית', phone: '0501111111', kind: 'כנס', date: '2026-10-07', place: 'שפיים', status: 'נסגר', lang: 'he', needs: ['מלונות'] },
  { id: 'c2', client: 'Bertelsmann', contact: 'Claudia', phone: '0502222222', kind: 'משלחת', date: '2026-11-19', status: 'הצעה נשלחה', lang: 'en' },
  { id: 'c3', client: 'ירד', kind: 'כנס', date: '2026-10-02', status: 'ירד' },
  { id: 'c4', client: 'מחר', kind: 'סיור', date: '2026-10-01', status: 'נסגר' },
  { id: 'c5', client: 'רחוק', kind: 'כנס', date: '2026-10-13', status: 'נסגר' }
];
const suppliers = [{ id: 's1', name: 'גרשון טורס', contact: 'אורית', phone: '0503333333', lang: 'he', type: 'הסעות' }, { id: 's2', name: 'Austrian Hospice', lang: 'en', type: 'מלונות' }];
const links = [
  { id: 'l1', caseId: 'c1', supplierId: 's1', supplier: 'גרשון טורס', status: 'ביקשנו הצעה', askedAt: '2026-09-27', what: 'אוטובוס' },
  { id: 'l2', caseId: 'c1', supplierId: 's2', supplier: 'Austrian Hospice', status: 'ביקשנו הצעה', askedAt: '2026-09-29' },
  { id: 'l3', caseId: 'c1', supplierId: 's1', status: 'ביקשנו הצעה', askedAt: '2026-09-20', answeredAt: '2026-09-22' },
  { id: 'l4', caseId: 'c3', supplierId: 's1', status: 'ביקשנו הצעה', askedAt: '2026-09-01' }
];
const quotes = [
  { id: 'q1', no: '2026-01', caseId: 'c2', status: 'נשלחה', sentAt: '2026-09-26', validUntil: '2026-10-10' },
  { id: 'q2', no: '2026-02', caseId: 'c2', status: 'נשלחה', sentAt: '2026-09-29', validUntil: '2026-09-29' },
  { id: 'q3', no: '2026-03', caseId: 'c1', status: 'אושרה', sentAt: '2026-09-01', validUntil: '2026-09-15' }
];
const payments = [
  { id: 'p1', caseId: 'c1', amount: 10000, status: 'חשבונית יצאה', due: '2026-09-20' },
  { id: 'p2', caseId: 'c1', amount: 5000, status: 'שולם', due: '2026-09-01' },
  { id: 'p3', caseId: 'c2', amount: '2,500', status: 'לגבות', due: '2026-10-30' }
];
const tasks = [
  { id: 't1', title: 'להזמין אוטובוס', due: '2026-09-26', status: 'open', who: 'ארבל', phone: '0504444444', caseId: 'c1' },
  { id: 't2', title: 'היום', due: '2026-09-30', status: 'open' },
  { id: 't3', title: 'בוצע', due: '2026-09-01', status: 'done' }
];
const calls = [
  { id: 'k1', name: 'מאירי', status: 'callback', callbackAt: '2026-09-30', why: 'מחיר' },
  { id: 'k2', name: 'חדש', status: 'todo' },
  { id: 'k3', name: 'בשבוע הבא', status: 'callback', callbackAt: '2026-10-05' }
];
const participants = [
  { id: 'g1', caseId: 'c1', name: 'א', rsvp: 'invited' }, { id: 'g2', caseId: 'c1', name: 'ב', rsvp: 'invited' }, { id: 'g3', caseId: 'c1', name: 'ג', rsvp: 'yes' },
  { id: 'g4', caseId: 'c5', name: 'ד', rsvp: 'invited' }
];
const contracts = [
  { id: 'x1', caseId: 'c1', status: 'sent', created: '2026-09-10' },
  { id: 'x2', caseId: 'c5', status: 'signed', created: '2026-09-10' }
];
const checklists = [
  { id: 'h1', caseId: 'c1', items: [{ id: 'i1', text: 'לאשר תפריט', phase: 'before', done: false, due: '2026-09-07' }, { id: 'i2', text: 'תגי שם', phase: 'week', done: false, due: '2026-09-30' }, { id: 'i3', text: 'נרות', phase: 'day', done: false }, { id: 'i4', text: 'בוצע', phase: 'before', done: true }] }
];
const budget = [
  { id: 'b1', caseId: 'c1', supplier: 'ביסקוטי', amount: 3000, dueDate: '2026-10-02', status: 'open' },
  { id: 'b2', caseId: 'c1', supplier: 'שולם', amount: 3000, dueDate: '2026-10-02', status: 'paid' },
  { id: 'b3', caseId: 'c1', supplier: 'רחוק', amount: 3000, dueDate: '2026-10-20' }
];
const data = { cases, suppliers, links, quotes, payments, tasks, calls, participants, contracts, checklists, budget };
const S = { lang: 'he', signer: 'וירג׳יני' };
const keys = list => list.map(n => n.key);
const one = (list, key) => list.find(n => n.key === key);

test('supplier silent: fires after N days (default 2), not for answered links or dropped events, with a WhatsApp draft in the supplier language', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  assert.ok(one(list, 'sup-silent:l1'));
  assert.equal(one(list, 'sup-silent:l2'), undefined, 'asked yesterday: not yet');
  assert.equal(one(list, 'sup-silent:l3'), undefined, 'answered');
  assert.equal(one(list, 'sup-silent:l4'), undefined, 'event dropped');
  const n = one(list, 'sup-silent:l1');
  assert.equal(n.kind, 'supSilent'); assert.equal(n.level, 'warn'); assert.equal(n.caseId, 'c1'); assert.equal(n.when, today);
  assert.match(n.title, /גרשון טורס/); assert.match(n.title, /3 ימים/);
  const wa = n.actions.find(a => a.type === 'whatsapp');
  assert.equal(wa.payload.phone, '0503333333'); assert.match(wa.payload.text, /היי אורית/); assert.match(wa.payload.text, /וירג׳יני/);
  assert.ok(n.actions.find(a => a.type === 'task').payload.title.includes('גרשון טורס'));
  assert.deepEqual(n.actions.find(a => a.type === 'done').payload, { col: 'links', id: 'l1', patch: { answeredAt: today } });
  // tuned to 1 day: yesterday's link fires too; and off: none
  assert.ok(one(evaluate(data, today, { rules: { supSilent: { days: 1 } } }), 'sup-silent:l2'));
  assert.equal(evaluate(data, today, { rules: { supSilent: { on: false } } }).filter(n => n.kind === 'supSilent').length, 0);
  // urgent after twice the threshold
  assert.equal(one(evaluate(data, '2026-10-03', S), 'sup-silent:l1').level, 'urgent');
});

test('quotes: waiting N days fires in the client language, past validity fires, accepted does not', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const w = one(list, 'quote-wait:q1');
  assert.ok(w); assert.equal(w.level, 'warn'); assert.equal(w.href, '#/quote/q1');
  const wa = w.actions.find(a => a.type === 'whatsapp');
  assert.match(wa.payload.text, /^Hi Claudia,/); assert.match(wa.payload.text, /quote/);
  assert.equal(one(list, 'quote-wait:q2'), undefined, 'sent yesterday');
  assert.ok(one(list, 'quote-expired:q2')); assert.equal(one(list, 'quote-expired:q1'), undefined);
  assert.equal(list.filter(n => n.key.endsWith(':q3')).length, 0);
  assert.equal(evaluate(data, today, { rules: { quoteWait: { on: false }, quoteExpired: { on: false } } }).filter(n => /^quote/.test(n.kind)).length, 0);
  assert.ok(one(evaluate(data, today, { rules: { quoteWait: { days: 1 } } }), 'quote-wait:q2'));
});

test('invoices: unpaid past due fires (urgent after 14 days), paid and not-yet-due do not; "paid" action patches the payment', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const n = one(list, 'pay-late:p1');
  assert.ok(n); assert.equal(n.kind, 'payLate'); assert.equal(n.level, 'warn'); assert.match(n.body, /10,000/);
  assert.deepEqual(n.actions.find(a => a.type === 'done').payload, { col: 'payments', id: 'p1', patch: { status: 'שולם' } });
  assert.equal(one(list, 'pay-late:p2'), undefined); assert.equal(one(list, 'pay-late:p3'), undefined);
  assert.equal(one(evaluate(data, '2026-10-10', S), 'pay-late:p1').level, 'urgent');
  assert.equal(evaluate(data, today, { rules: { payLate: { on: false } } }).filter(n => n.kind === 'payLate').length, 0);
});

test('supplier payments from budget lines: due within 3 days fires, paid and far ones do not; "when" is the due day', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const n = one(list, 'sup-pay:b1');
  assert.ok(n); assert.equal(n.when, '2026-10-02'); assert.equal(n.level, 'warn'); assert.match(n.title, /ביסקוטי/);
  assert.equal(one(list, 'sup-pay:b2'), undefined); assert.equal(one(list, 'sup-pay:b3'), undefined);
  assert.ok(one(evaluate(data, today, { rules: { supPay: { days: 30 } } }), 'sup-pay:b3'));
  assert.equal(evaluate({ cases }, today, S).filter(n => n.kind === 'supPay').length, 0, 'no budget collection: nothing');
});

test('events: 14 / 7 / 1 day milestones with open checklist items and missing suppliers; dropped and far events do not fire', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const e7 = one(list, 'event:c1:7');
  assert.ok(e7); assert.equal(e7.level, 'warn'); assert.match(e7.title, /בעוד 7 ימים/);
  assert.match(e7.body, /2 פריטים פתוחים/, 'before + week phases, not the day phase, not the done one');
  assert.match(e7.body, /גרשון טורס/, 'the supplier still silent, from openItems');
  assert.ok(e7.actions.find(a => a.payload && a.payload.href === '#/case/c1/checklist'));
  const e1 = one(list, 'event:c4:1'); assert.ok(e1); assert.equal(e1.level, 'urgent'); assert.match(e1.title, /מחר/); assert.match(e1.body, /אין עדיין רשימת תיוג/);
  const e14 = one(list, 'event:c5:14'); assert.ok(e14); assert.equal(e14.level, 'info');
  assert.equal(list.filter(n => n.kind === 'event' && n.caseId === 'c3').length, 0, 'dropped');
  assert.equal(list.filter(n => n.kind === 'event' && n.caseId === 'c2').length, 0, 'far away');
  const day = one(evaluate(data, '2026-10-07', S), 'event:c1:1'); assert.match(day.title, /היום/);
  assert.equal(evaluate(data, today, { rules: { event: { on: false } } }).filter(n => n.kind === 'event').length, 0);
});

test('tasks overdue and callbacks due today; done tasks, today tasks, todo calls and later callbacks do not fire', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const tk = one(list, 'task-late:t1');
  assert.ok(tk); assert.equal(tk.level, 'urgent'); assert.match(tk.body, /ארבל/);
  assert.ok(tk.actions.find(a => a.type === 'whatsapp'), 'the helper has a phone: the task text is ready');
  assert.deepEqual(tk.actions.find(a => a.type === 'done').payload, { col: 'tasks', id: 't1', patch: { status: 'done' } });
  assert.equal(one(list, 'task-late:t2'), undefined); assert.equal(one(list, 'task-late:t3'), undefined);
  const k = one(list, 'call:k1'); assert.ok(k); assert.match(k.title, /מאירי/); assert.match(k.body, /מחיר/);
  assert.deepEqual(k.actions.find(a => a.type === 'done').payload, { col: 'calls', id: 'k1', patch: { status: 'answered' } });
  assert.equal(one(list, 'call:k2'), undefined); assert.equal(one(list, 'call:k3'), undefined);
  assert.ok(one(evaluate(data, '2026-10-06', S), 'call:k3'), 'a missed callback keeps firing');
  const off = evaluate(data, today, { rules: { taskLate: { on: false }, call: { on: false } } });
  assert.equal(off.filter(n => n.kind === 'taskLate' || n.kind === 'call').length, 0);
});

test('participants: event within 7 days and more than 30% still invited fires; a far event or a low share does not', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const n = one(list, 'rsvp:c1');
  assert.ok(n); assert.match(n.body, /2 מתוך 3/); assert.match(n.body, /67%/); assert.equal(n.href, '#/participants/c1');
  assert.equal(one(list, 'rsvp:c5'), undefined, '13 days away');
  assert.ok(one(evaluate(data, today, { rules: { rsvp: { days: 20 } } }), 'rsvp:c5'));
  assert.equal(one(evaluate(data, today, { rules: { rsvp: { pct: 70 } } }), 'rsvp:c1'), undefined);
  assert.equal(evaluate(data, today, { rules: { rsvp: { on: false } } }).filter(n => n.kind === 'rsvp').length, 0);
});

test('contracts: not signed with the event within 10 days fires; signed does not; tunable and switchable', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  const n = one(list, 'contract:c1');
  assert.ok(n); assert.equal(n.href, '#/contract/x1'); assert.match(n.body, /נשלח ללקוח/);
  assert.match(n.actions.find(a => a.type === 'whatsapp').payload.text, /היי עידית/);
  assert.equal(one(list, 'contract:c5'), undefined, 'signed');
  assert.equal(one(evaluate(data, today, { rules: { contract: { days: 3 } } }), 'contract:c1'), undefined);
  assert.equal(evaluate(data, today, { rules: { contract: { on: false } } }).filter(n => n.kind === 'contract').length, 0);
});

test('digest: one per day, first in the list, with the counts; off when switched off; empty data gives the quiet text', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  assert.equal(list[0].key, 'digest:' + today); assert.equal(list[0].kind, 'digest');
  assert.match(list[0].body, /ספק אחד לא ענה/); assert.match(list[0].body, /משימה אחת באיחור/);
  assert.equal(list.filter(n => n.kind === 'digest').length, 1);
  assert.equal(evaluate(data, today, { rules: { digest: { on: false } } }).filter(n => n.kind === 'digest').length, 0);
  const quiet = evaluate({}, today, S);
  assert.equal(quiet.length, 1); assert.equal(quiet[0].body, 'שקט. אין תזכורות היום.');
});

test('shape, order and dedupe: unique keys, urgent first, every field present, no Arabic letters', async () => {
  const { evaluate } = await load();
  const list = evaluate(data, today, S);
  assert.equal(new Set(keys(list)).size, list.length);
  const rank = { urgent: 0, warn: 1, info: 2 };
  const body = list.slice(1);
  for (let i = 1; i < body.length; i++) assert.ok(rank[body[i - 1].level] <= rank[body[i].level], 'most urgent first');
  list.forEach(n => {
    ['key', 'kind', 'level', 'title', 'body', 'href', 'caseId', 'when', 'actions'].forEach(f => assert.ok(f in n, f + ' on ' + n.key));
    assert.ok(['info', 'warn', 'urgent'].includes(n.level));
    assert.ok(Array.isArray(n.actions) && n.actions.length);
    n.actions.forEach(a => { assert.ok(['task', 'whatsapp', 'open', 'done'].includes(a.type)); assert.ok(a.label); });
    assert.ok(!ARABIC.test(JSON.stringify(n)));
  });
  // the same data twice gives the same keys (stable)
  assert.deepEqual(keys(evaluate(data, today, S)), keys(list));
});

test('snooze, dismiss, seen and pending', async () => {
  const { evaluate, pending, snooze, dismiss, markSeen, unseen, prune, snoozeDate } = await load();
  const list = evaluate(data, today, S);
  let st = {};
  assert.equal(pending(list, st, today + 'T09:00').length, list.length);
  st = snooze(st, 'task-late:t1', snoozeDate(today, 1));
  assert.equal(st['task-late:t1'].snoozedUntil, '2026-10-01');
  assert.equal(pending(list, st, today + 'T23:00').length, list.length - 1, 'hidden today');
  assert.equal(pending(list, st, '2026-10-01T07:00').length, list.length, 'back on the day it was snoozed to');
  st = dismiss(st, 'call:k1');
  assert.equal(pending(list, st, '2026-10-05').length, list.length - 1, 'dismissed stays away');
  assert.equal(unseen(list, st), list.length);
  st = markSeen(st, ['call:k1', 'digest:' + today], today + 'T08:00');
  assert.equal(unseen(list, st), list.length - 2);
  assert.equal(st['call:k1'].seen, today + 'T08:00'); assert.equal(st['call:k1'].dismissed, true, 'seen keeps the other flags');
  st._digest = { spoken: today };
  const p = prune(st, ['call:k1']);
  assert.deepEqual(Object.keys(p).sort(), ['_digest', 'call:k1']);
  assert.equal(pending(undefined, undefined, undefined).length, 0);
});

test('groups and counts', async () => {
  const { evaluate, groupByWhen, counts } = await load();
  const list = evaluate(data, today, S);
  const g = groupByWhen(list, today);
  assert.ok(g.today.some(n => n.key === 'task-late:t1'));
  assert.ok(g.soon.some(n => n.key === 'sup-pay:b1'), 'due in two days');
  assert.equal(g.today.length + g.soon.length + g.later.length, list.length);
  const c = counts(list);
  assert.equal(c.total, list.length - 1, 'the digest is not counted');
  assert.equal(c.urgent + c.warn + c.info, c.total);
});

test('digest text in three languages, singular and plural, and the empty case', async () => {
  const { evaluate, digestText } = await load();
  const he = evaluate(data, today, { lang: 'he' });
  assert.match(digestText(he, 'he'), /^בוקר טוב\. יש \d+ תזכורות, \d+ דחופות: /);
  assert.match(digestText(he, 'he'), /ספק אחד לא ענה/);
  const fr = evaluate(data, today, { lang: 'fr' });
  assert.match(digestText(fr, 'fr'), /^Bonjour\. Il y a \d+ rappels, dont \d+ urgents : /);
  assert.match(digestText(fr, 'fr'), /un fournisseur sans réponse/);
  assert.match(fr.find(n => n.kind === 'supSilent').title, /Fournisseur sans réponse/);
  const en = evaluate(data, today, { lang: 'en' });
  assert.match(digestText(en, 'en'), /^Good morning\. There are \d+ reminders, \d+ urgent: /);
  assert.match(digestText(en, 'en'), /one supplier did not answer/);
  assert.match(en.find(n => n.kind === 'taskLate').title, /^Task overdue/);
  const single = evaluate({ tasks: [tasks[0]] }, today, { lang: 'en' });
  assert.equal(digestText(single, 'en'), 'Good morning. There is one reminder, one urgent: one task is overdue.');
  assert.equal(digestText([], 'fr'), 'Rien en attente. Pas de rappel aujourd’hui.');
  assert.equal(digestText([], 'en'), 'Quiet. No reminders today.');
  [he, fr, en].forEach(l => assert.ok(!ARABIC.test(JSON.stringify(l))));
});

test('settings: defaults, merge, sanitised numbers and quiet hours', async () => {
  const { ruleSettings, DEFAULT_RULES, inQuietHours, RULE_KEYS } = await load();
  const d = ruleSettings({});
  assert.equal(d.supSilent.days, 2); assert.equal(d.quoteWait.days, 3); assert.equal(d.supPay.days, 3); assert.equal(d.rsvp.pct, 30); assert.equal(d.contract.days, 10);
  assert.equal(d.readDigest, false); assert.equal(d.quietFrom, '21:00'); assert.equal(d.quietTo, '07:00');
  const r = ruleSettings({ rules: { supSilent: { on: false, days: 'abc' }, rsvp: { pct: -5 }, readDigest: true, quietFrom: '22:30', quietTo: 'bad' } });
  assert.equal(r.supSilent.on, false); assert.equal(r.supSilent.days, 2, 'bad number falls back');
  assert.equal(r.rsvp.pct, 30); assert.equal(r.readDigest, true); assert.equal(r.quietFrom, '22:30'); assert.equal(r.quietTo, '07:00');
  assert.equal(Object.keys(DEFAULT_RULES).filter(k => typeof DEFAULT_RULES[k] === 'object').length, RULE_KEYS.length);
  assert.equal(inQuietHours('22:00', '21:00', '07:00'), true);
  assert.equal(inQuietHours('03:30', '21:00', '07:00'), true);
  assert.equal(inQuietHours('07:00', '21:00', '07:00'), false);
  assert.equal(inQuietHours('12:00', '21:00', '07:00'), false);
  assert.equal(inQuietHours('12:00', '09:00', '13:00'), true);
  assert.equal(inQuietHours('12:00', '', ''), false);
});
