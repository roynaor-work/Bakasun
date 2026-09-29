import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateFor, templateKey, buildChecklist, dueFor, progress, dueSoon, addMissing, byPhase, toggle, customItem, taskFromItem, itemId, PHASES } from '../js/logic/checklists.js';
import { BASE, BY_KIND } from '../js/data/checklistTemplates.js';
import { KIND_LABELS } from '../js/i18n.js';

test('every kind of the app has a template; the base list is inside; phases are in order', () => {
  Object.keys(KIND_LABELS).forEach(k => { const tpl = templateFor(k); assert.ok(tpl.length >= BASE.length, k); assert.ok(tpl.every(i => PHASES.includes(i.phase)), k); });
  assert.equal(templateFor('כנס').length, BASE.length + BY_KIND['כנס'].length);
  assert.ok(templateFor('משלחת או סיור').some(i => /רומינג/.test(i.text)));
  assert.ok(templateFor('חתונה').some(i => /הושבה/.test(i.text)));
  assert.equal(templateFor('משהו לא מוכר').length, BASE.length); assert.equal(templateFor('').length, BASE.length);
  const order = templateFor('כנס').map(i => PHASES.indexOf(i.phase)); assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.equal(templateKey('Conference'), 'כנס'); assert.equal(templateKey('סמינר צוות'), 'כנס'); assert.equal(templateKey('Delegation'), 'משלחת או סיור'); assert.equal(templateKey('wedding'), 'חתונה'); assert.equal(templateKey('ארוחת ערב'), 'ערב טעימות'); assert.equal(templateKey(null), 'default');
  templateFor('כנס')[0].text = 'changed'; assert.notEqual(templateFor('כנס')[0].text, 'changed');
});

test('due dates from the event date and the lead days', () => {
  assert.equal(dueFor('2026-10-18', 'before', 30), '2026-09-18');
  assert.equal(dueFor('2026-10-18', 'week', 3), '2026-10-15');
  assert.equal(dueFor('2026-10-18', 'day', 0), '2026-10-18');
  assert.equal(dueFor('2026-10-18', 'after', 7), '2026-10-25');
  assert.equal(dueFor('2026-10-18', 'before', null), '2026-09-18'); assert.equal(dueFor('2026-10-18', 'after'), '2026-10-21');
  assert.equal(dueFor('', 'before', 30), ''); assert.equal(dueFor('not a date', 'day', 0), '');
});

test('a checklist is built from the case: ids are stable, due dates computed, nothing ticked', () => {
  const cs = { id: 'c1', kind: 'כנס', date: '2026-10-18' };
  const cl = buildChecklist(cs);
  assert.equal(cl.caseId, 'c1'); assert.equal(cl.kind, 'כנס'); assert.equal(cl.templateKey, 'כנס'); assert.equal(cl.items.length, templateFor('כנס').length);
  assert.ok(cl.items.every(i => i.done === false && i.taskId === '' && i.due));
  assert.equal(cl.items[0].id, itemId(cl.items[0].text, cl.items[0].phase)); assert.equal(buildChecklist(cs).items[0].id, cl.items[0].id);
  assert.equal(new Set(cl.items.map(i => i.id)).size, cl.items.length);
  const day = cl.items.find(i => i.phase === 'day'); assert.equal(day.due, '2026-10-18');
  assert.ok(buildChecklist({ id: 'c2', kind: 'אחר' }).items.every(i => i.due === ''));
  assert.deepEqual(byPhase(cl).map(g => g.phase), PHASES); assert.equal(byPhase(cl).reduce((n, g) => n + g.items.length, 0), cl.items.length);
});

test('progress, ticks, due soon', () => {
  const cl = buildChecklist({ id: 'c1', kind: 'יום גיבוש', date: '2026-10-18' });
  assert.deepEqual(progress(cl), { done: 0, total: cl.items.length, pct: 0 }); assert.deepEqual(progress(null), { done: 0, total: 0, pct: 0 });
  cl.items[0] = toggle(cl.items[0], '2026-09-29T08:00:00.000Z'); assert.equal(cl.items[0].done, true); assert.equal(cl.items[0].doneAt, '2026-09-29T08:00:00.000Z');
  assert.equal(progress(cl).done, 1); assert.equal(toggle(cl.items[0]).done, false); assert.equal(toggle(cl.items[0]).doneAt, '');
  const soon = dueSoon(cl, '2026-10-12', 7);
  assert.ok(soon.length > 0); assert.ok(soon.every(i => !i.done && i.due <= '2026-10-19'));
  assert.deepEqual(soon.map(i => i.due), soon.map(i => i.due).slice().sort());
  const late = dueSoon(cl, '2026-10-20').filter(i => i.late > 0); assert.ok(late.length > 0); assert.ok(late.every(i => i.due < '2026-10-20'));
  assert.ok(dueSoon(cl, '2026-10-12', 7).every(i => i.late === 0 || i.due < '2026-10-12'));
  assert.equal(dueSoon(cl, '2026-01-01', 7).length, 0);
  assert.deepEqual(dueSoon(null, '2026-10-12'), []);
});

test('refresh from the template adds only what is missing and keeps every tick and custom item', () => {
  const cs = { id: 'c1', kind: 'כנס', date: '2026-10-18' };
  const cl = buildChecklist(cs);
  cl.items[2] = toggle(cl.items[2], '2026-09-01T00:00:00Z');
  const custom = customItem('להזמין פרחים לבמה', 'week', '2026-10-15');
  const trimmed = Object.assign({}, cl, { items: cl.items.slice(0, 5).concat([custom]) });
  const { checklist: out, added } = addMissing(trimmed, cs);
  assert.equal(added, cl.items.length - 5);
  assert.equal(out.items.length, cl.items.length + 1);
  assert.equal(out.items.find(i => i.id === cl.items[2].id).done, true);
  assert.equal(out.items.find(i => i.id === cl.items[2].id).doneAt, '2026-09-01T00:00:00Z');
  const c = out.items.find(i => i.id === custom.id); assert.ok(c); assert.equal(c.due, '2026-10-15'); assert.equal(c.lead, null); assert.equal(c.custom, true);
  assert.equal(addMissing(out, cs).added, 0);
  /* the event moved: open template items follow, ticked ones and custom ones stay */
  const moved = addMissing(out, Object.assign({}, cs, { date: '2026-10-25' })).checklist;
  assert.equal(moved.items.find(i => i.phase === 'day' && !i.done).due, '2026-10-25');
  assert.equal(moved.items.find(i => i.id === cl.items[2].id).due, cl.items[2].due);
  assert.equal(moved.items.find(i => i.id === custom.id).due, '2026-10-15');
  /* a new template item is added even when the checklist kind is missing */
  assert.equal(addMissing({ items: [] }, { kind: 'חתונה', date: '' }).checklist.items.length, templateFor('חתונה').length);
});

test('an item becomes a task', () => {
  const item = { id: 'k1', text: '  רשימת חדרים למלון ', phase: 'week', due: '2026-10-11', done: false };
  assert.deepEqual(taskFromItem(item, { id: 'c1' }, 'אני'), { title: 'רשימת חדרים למלון', due: '2026-10-11', caseId: 'c1', who: 'אני', status: 'open', from: 'checklist', itemId: 'k1' });
  const x = customItem('  משהו  אחר ', 'bad', 'x'); assert.equal(x.text, 'משהו אחר'); assert.equal(x.phase, 'before'); assert.equal(x.due, '');
});
