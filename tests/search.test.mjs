/* Global search (js/logic/search.js) and the dashboard widget choice (js/logic/dashboard.js): run with `node --test tests/`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, tokens, variants, buildIndex, search, addRecent, removeRecent, RECENT_MAX, GROUPS } from '../js/logic/search.js';
import { DASH_WIDGETS, widgetsOn, widgetsSetting } from '../js/logic/dashboard.js';

const data = {
  cases: [
    { id: 'c1', client: 'שוב״ל', contact: 'דנה כהן', kind: 'כנס', date: '2026-10-18', place: 'שפיים', status: 'נסגר', phone: '052-1234567', updated: '2026-09-20T10:00:00Z' },
    { id: 'c2', client: 'ברטלסמן', contact: 'Léa', kind: 'משלחת', date: '2026-11-19', place: 'תל אביב', status: 'פנייה', updated: '2026-09-25T10:00:00Z' },
    { id: 'c3', client: 'טכנו-גליל', contact: 'יוסי', kind: 'יום גיבוש', place: 'ראש פינה', status: 'נסגר', purpose: 'גיבוש צוות הפיתוח', updated: '2026-09-27T10:00:00Z' }
  ],
  clients: [{ id: 'k1', name: 'שוב״ל', contact: 'דנה כהן', phone: '+972521234567', email: 'dana@shoval.co.il', updated: '2026-09-01T00:00:00Z' }, { id: 'k2', name: 'שובר שוויון', contact: 'רון', updated: '2026-09-02T00:00:00Z' }],
  suppliers: [{ id: 's1', name: 'הגברה יוסי', type: 'הגברה', contact: 'יוסי לוי', phone: '053-7654321', area: 'צפון' }],
  contacts: [{ id: 'p1', name: 'מירב מהטלפון', phone: '054-1112222' }],
  staff: [{ id: 'st1', caseId: 'c1', name: 'נועה', role: 'עוזרת הפקה', phone: '050-9998877' }],
  team: [{ id: 'tm1', name: 'רועי', role: 'חשבוניות', phone: '052-0000000' }],
  tasks: [
    { id: 't1', title: 'לסגור אולם', details: 'לדבר עם שפיים על התאריך', who: 'ארבל', due: '2026-10-01', no: 12, caseId: 'c1', updated: '2026-09-10T00:00:00Z' },
    { id: 't2', title: 'אולם', details: '', who: 'ארבל', updated: '2026-09-12T00:00:00Z' },
    { id: 't3', title: 'לבדוק אולמות בצפון', updated: '2026-09-11T00:00:00Z' }
  ],
  calls: [{ id: 'l1', name: 'מאירי', why: 'הצעה למלון', phone: '03-5550000' }],
  notes: [{ id: 'n1', about: 'client', aboutId: 'k1', aboutLabel: 'שוב״ל', text: 'דנה אוהבת יין אדום' }],
  quotes: [{ id: 'q1', no: 'BS-2026-001', client: 'שוב״ל', caseId: 'c1', date: '2026-09-20', status: 'נשלחה', lines: [{ item: 'הגברה ותאורה', qty: 1 }, { item: 'ארוחת צהריים', en: 'Lunch' }] }],
  participants: [{ id: 'pa1', caseId: 'c1', name: 'שירן לוי', phone: '0541112223', org: 'מחלקת שיווק' }],
  casefiles: [{ id: 'f1', caseId: 'c1', name: 'חוזה-אולם.pdf', kind: 'venueContract', note: 'טיוטה שנייה', tags: ['חוזה', 'אולם'], addedAt: '2026-09-26T00:00:00Z' }],
  contracts: [{ id: 'ct1', caseId: 'c1', title: 'הסכם הפקה', parties: { client: { name: 'שוב״ל', legalName: 'שוב״ל בע״מ' } }, eventLine: { kind: 'כנס', date: '2026-10-18', place: 'שפיים' }, status: 'draft' }],
  budget: [{ id: 'b1', caseId: 'c1', item: 'הסעות מהצפון', category: 'transport', note: 'שני אוטובוסים' }],
  runsheet: [{ id: 'r1', caseId: 'c1', updatedAt: '2026-09-28T00:00:00Z', days: [{ date: '2026-10-18', blocks: [{ id: 'bl1', start: '08:00', end: '09:00', title: 'קבלת פנים', owner: 'נועה', place: 'לובי' }] }] }],
  history: [{ id: 'h1', col: 'cases', refId: 'c1', caseId: 'c1', at: '2026-09-21T09:00:00Z', label: 'שוב״ל', summary: 'תיק שוב״ל: מקום ריק ← שפיים' }]
};
const help = [{ title: 'שאלות', items: ['"מה יש לי מחר" מקריא את היום הבא', '"מה חסר לי לשוב״ל" מונה מה פתוח בתיק'] }];
const idx = buildIndex(data, { help });
const groupOf = (r, k) => r.groups.find(g => g.key === k);

test('normalization: final letters, quotes, case and spaces', () => {
  assert.equal(norm('שוב״ל  כהן'), 'שובל כהנ');
  assert.equal(norm('Léa  COHEN'), 'léa cohen');
  assert.deepEqual(tokens('דנה, כהן · (שפיים) / 08:00-09:00'), ['דנה', 'כהנ', 'שפיימ', '08', '00-09', '00']);
  assert.deepEqual(variants('לשפיים'), ['לשפיים', 'שפיים']);
  assert.deepEqual(variants('ולשפיים'), ['ולשפיים', 'לשפיים', 'שפיים']);
  assert.deepEqual(variants('לב'), ['לב']);
  assert.deepEqual(variants('lunch'), ['lunch']);
});

test('empty query gives nothing', () => {
  assert.deepEqual(search(idx, ''), { total: 0, groups: [], first: null });
  assert.deepEqual(search(idx, '   '), { total: 0, groups: [], first: null });
  assert.equal(search(idx, 'זזזז').total, 0);
});

test('the index covers every collection and the help', () => {
  const groups = new Set(idx.map(d => d.group));
  GROUPS.forEach(g => assert.ok(groups.has(g), 'group ' + g));
  const rs = idx.find(d => d.group === 'runsheet'); assert.equal(rs.href, '#/runsheet/c1'); assert.equal(rs.title, 'קבלת פנים');
  assert.equal(idx.find(d => d.group === 'participant').href, '#/case/c1/participants');
  assert.equal(idx.find(d => d.group === 'file').href, '#/case/c1/files');
  assert.equal(idx.find(d => d.group === 'budget').href, '#/case/c1/budget');
  assert.equal(idx.find(d => d.group === 'history').href, '#/case/c1/history');
  assert.equal(idx.find(d => d.group === 'staff').href, '#/case/c1/plan');
  assert.equal(idx.find(d => d.group === 'note').href, '#/client/k1');
  assert.equal(idx.find(d => d.group === 'help').href, '#/help');
});

test('ranking: exact before starts-with before contains, recent first on a tie', () => {
  const r = search(idx, 'אולם');
  const titles = groupOf(r, 'task').items.map(x => x.title);
  assert.deepEqual(titles, ['אולם', '#12 לסגור אולם', 'לבדוק אולמות בצפון']);
  const r2 = search(idx, 'שוב');
  const cl = groupOf(r2, 'client').items.map(x => x.title);
  assert.deepEqual(cl, ['שובר שוויון', 'שוב״ל']);
  // an exact name ties on score, so the most recent record wins
  const r3 = search(idx, 'נסגר');
  assert.deepEqual(groupOf(r3, 'case').items.map(x => x.id), ['c3', 'c1']);
});

test('grouping with counts, links per row and the first result', () => {
  const r = search(idx, 'שובל');
  assert.ok(r.total >= 6);
  const keys = r.groups.map(g => g.key);
  ['case', 'client', 'note', 'quote', 'contract', 'history', 'help'].forEach(k => assert.ok(keys.includes(k), k));
  assert.equal(groupOf(r, 'case').count, 1);
  assert.equal(groupOf(r, 'case').items[0].href, '#/case/c1');
  assert.equal(groupOf(r, 'quote').items[0].href, '#/quote/q1');
  assert.equal(groupOf(r, 'contract').items[0].href, '#/contract/ct1');
  assert.equal(r.first.group, 'client'); assert.equal(r.groups[0].exact, true);
  // Enter opens the first row on the screen: the top of the first group
  const rt = search(idx, 'אולם'); assert.equal(rt.first.id, rt.groups[0].items[0].id); assert.equal(rt.groups[0].key, 'task');
  // the fixed group order, with a group that holds an exact name first
  const r2 = search(idx, 'שפיים');
  assert.deepEqual(r2.groups.map(g => g.key), ['case', 'task', 'contract', 'history']);
  assert.equal(r2.first.id, 'c1');
  // the limit caps the rows but not the count
  const r3 = search(idx, 'אולם', { limit: 1 });
  assert.equal(groupOf(r3, 'task').count, 3); assert.equal(groupOf(r3, 'task').items.length, 1);
});

test('phone search by digits, in any spelling', () => {
  const ids = r => r.groups.flatMap(g => g.items.map(x => g.key + ':' + x.id));
  assert.deepEqual(ids(search(idx, '052-1234567')).sort(), ['case:c1', 'client:k1']);
  assert.deepEqual(ids(search(idx, '+972 52 123 4567')).sort(), ['case:c1', 'client:k1']);
  assert.deepEqual(ids(search(idx, '1234567')).sort(), ['case:c1', 'client:k1']);
  assert.deepEqual(ids(search(idx, '0541112223')), ['participant:pa1']);
  assert.deepEqual(ids(search(idx, '5550000')), ['call:l1']);
  assert.equal(search(idx, '9999999').total, 0);
  assert.deepEqual(ids(search(idx, '555')), ['call:l1']);
});

test('prefix letters, several words, task numbers and help commands', () => {
  assert.equal(search(idx, 'לשפיים').first.id, 'c1');
  assert.ok(groupOf(search(idx, 'בצפון'), 'supplier'));
  assert.equal(search(idx, 'דנה שפיים').first.id, 'c1');
  assert.equal(search(idx, 'דנה יין').first.group, 'note');
  assert.deepEqual(groupOf(search(idx, '#12'), 'task').items.map(x => x.id), ['t1']);
  assert.equal(search(idx, 'lunch').first.group, 'quote');
  assert.equal(search(idx, 'מה יש לי מחר').first.group, 'help');
  assert.equal(groupOf(search(idx, 'מירב'), 'contact').items[0].href, '#/settings');
});

test('recent searches: newest first, no duplicates, capped, removable', () => {
  let l = [];
  for (let i = 1; i <= 10; i++) l = addRecent(l, 'q' + i);
  assert.equal(l.length, RECENT_MAX); assert.equal(l[0], 'q10');
  l = addRecent(l, ' q5 '); assert.equal(l[0], 'q5'); assert.equal(l.filter(x => x === 'q5').length, 1);
  l = addRecent(l, ''); assert.equal(l[0], 'q5');
  l = addRecent(l, 'שוב״ל'); l = addRecent(l, 'שובל'); assert.equal(l.filter(x => /שוב/.test(x)).length, 1);
  l = removeRecent(l, 'q5'); assert.ok(!l.includes('q5'));
  assert.deepEqual(addRecent(null, 'a'), ['a']);
});

test('dashboard widgets: all on by default, a saved choice hides the rest', () => {
  assert.ok(DASH_WIDGETS.includes('now') && DASH_WIDGETS.includes('moneyByEvent') && DASH_WIDGETS.length >= 12);
  const all = widgetsOn(undefined); DASH_WIDGETS.forEach(k => assert.equal(all[k], true));
  const some = widgetsOn('{"now":false,"leads":false}'); assert.equal(some.now, false); assert.equal(some.leads, false); assert.equal(some.events, true);
  assert.equal(widgetsOn('not json').now, true);
  assert.deepEqual(JSON.parse(widgetsSetting(['now', 'events'])), Object.fromEntries(DASH_WIDGETS.map(k => [k, k === 'now' || k === 'events'])));
  assert.equal(widgetsSetting(DASH_WIDGETS), '');
});
