import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, sortBlocks, overlaps, shift, nowNext, buildFromSchedule, callSheetText, runsheetText, toIcs, template, templateKind, guessKind, people, effectiveEnd, runsheetHtml, KINDS, TEMPLATE_KINDS } from '../js/logic/runsheet.js';
import { hasArabic } from '../js/logic/core.js';

const noArabic = s => assert.ok(!hasArabic(s), 'no Arabic letters');
const cs = { id: 'c1', client: 'ארגון שוב״ל', kind: 'כנס', date: '2026-10-18', place: 'גן שפיים', hours: '09:00-16:00' };
const B = (id, start, end, title, extra) => newBlock(Object.assign({ id, start, end, title, kind: 'session' }, extra || {}));
const day = blocks => ({ caseId: 'c1', importedIds: [], days: [{ date: '2026-10-18', notes: 'חניה בחניון הצפוני, כניסה משער 2', blocks }] });

test('newBlock fills every field and keeps a valid kind and status', () => {
  const b = newBlock({ title: ' פתיחה ', start: '9:00', kind: 'nope', status: 'x' });
  assert.equal(b.title, 'פתיחה'); assert.equal(b.start, '09:00'); assert.equal(b.kind, 'other'); assert.equal(b.status, 'planned'); assert.ok(b.id);
  assert.equal(KINDS.length, 8);
});

test('sortBlocks: by start time, blocks without a time last', () => {
  const s = sortBlocks([B('a', '10:00', '', 'b'), B('b', '', '', 'no time'), B('c', '08:30', '', 'a')]);
  assert.deepEqual(s.map(x => x.id), ['c', 'a', 'b']);
});

test('effectiveEnd: the end, else the next start, else 30 minutes', () => {
  const s = sortBlocks([B('a', '09:00', '', 'a'), B('b', '09:45', '10:30', 'b'), B('c', '11:00', '', 'c')]);
  assert.equal(effectiveEnd(s, 0), 9 * 60 + 45); assert.equal(effectiveEnd(s, 1), 10 * 60 + 30); assert.equal(effectiveEnd(s, 2), 11 * 60 + 30);
});

test('overlaps: same owner at the same time warns, different owners do not, same hall for two sessions warns, setup in the same hall does not', () => {
  const blocks = [B('a', '09:00', '10:00', 'רישום', { owner: 'מרינה', place: 'לובי' }), B('b', '09:30', '10:30', 'פתיחה', { owner: 'מרינה', place: 'אולם' }), B('c', '09:30', '10:30', 'מושב', { owner: 'רותם', place: 'אולם ב' }),
    B('d', '11:00', '12:00', 'מושב א', { owner: 'א', place: 'אולם' }), B('e', '11:30', '12:00', 'מושב ב', { owner: 'ב', place: 'אולם' }), B('f', '11:00', '12:00', 'הקמה', { owner: 'ג', place: 'אולם', kind: 'setup' })];
  const o = overlaps(blocks);
  assert.deepEqual(o.map(x => [x.a.id, x.b.id, x.why]), [['a', 'b', 'owner'], ['d', 'e', 'place']]);
  assert.equal(overlaps([B('a', '09:00', '10:00', 'x', { owner: 'מרינה' }), B('b', '10:00', '11:00', 'y', { owner: 'מרינה' })]).length, 0, 'back to back is fine');
});

test('shift: a delay pushes the block and everything after it, done blocks and earlier blocks stay', () => {
  const blocks = [B('a', '09:00', '09:30', 'a', { status: 'done' }), B('b', '09:30', '10:00', 'b'), B('c', '10:00', '10:45', 'c'), B('d', '11:00', '', 'd')];
  const s = shift(blocks, 'c', 15);
  assert.deepEqual(s.map(x => x.start + '-' + x.end), ['09:00-09:30', '09:30-10:00', '10:15-11:00', '11:15-']);
  const back = shift(s, 'c', -15);
  assert.deepEqual(back.map(x => x.start), ['09:00', '09:30', '10:00', '11:00']);
  assert.equal(shift(blocks, 'zzz', 15).length, 4, 'unknown id: unchanged');
  assert.equal(shift([B('x', '23:50', '', 'late')], 'x', 30)[0].start, '23:59', 'clamped to the day');
});

test('nowNext: now with elapsed / remaining, next in N minutes, late list, done blocks skipped', () => {
  const blocks = [B('a', '09:00', '09:30', 'רישום'), B('b', '09:30', '10:30', 'פתיחה'), B('c', '10:45', '', 'מושב'), B('d', '12:00', '13:00', 'צהריים')];
  const r = nowNext(blocks, '09:50');
  assert.equal(r.now.id, 'b'); assert.equal(r.now.elapsed, 20); assert.equal(r.now.remaining, 40); assert.equal(r.now.total, 60);
  assert.equal(r.next.id, 'c'); assert.equal(r.next.inMinutes, 55);
  assert.deepEqual(r.late.map(x => x.id + ':' + x.lateBy), ['a:20']);
  const done = blocks.map(b => b.id === 'a' ? Object.assign({}, b, { status: 'done' }) : b);
  assert.equal(nowNext(done, '09:50').late.length, 0);
  const gap = nowNext(blocks, '10:35');
  assert.equal(gap.now, null); assert.equal(gap.next.id, 'c'); assert.equal(gap.next.inMinutes, 10);
  assert.equal(nowNext(blocks, '13:30').next, null);
  assert.deepEqual(nowNext(blocks, 'x'), { now: null, next: null, late: [] });
});

test('buildFromSchedule: her schedule lines become blocks once, a second import adds nothing, kinds are guessed', () => {
  const rows = [{ id: 's1', caseId: 'c1', date: '2026-10-18', start: '07:30', end: '', what: 'הגעת ספקים והקמה', where: 'גן', who: 'הגברה, כולם' },
    { id: 's2', caseId: 'c1', date: '2026-10-18', start: '12:30', end: '13:30', what: 'ארוחת צהריים', where: '', who: 'קייטרינג' },
    { id: 's3', caseId: 'c1', date: '2026-10-19', start: '09:00', end: '', what: 'הסעה חזרה', who: 'גרשון טורס' },
    { id: 'other', caseId: 'c2', date: '2026-10-18', start: '09:00', what: 'לא שלנו' }];
  const r1 = buildFromSchedule(cs, rows);
  assert.equal(r1.added, 3); assert.equal(r1.rec.days.length, 2); assert.equal(r1.rec.caseId, 'c1');
  const b = r1.rec.days[0].blocks;
  assert.deepEqual(b.map(x => x.kind), ['setup', 'meal']);
  assert.equal(b[0].owner, 'הגברה'); assert.equal(b[0].place, 'גן'); assert.equal(b[1].end, '13:30');
  assert.equal(r1.rec.days[1].blocks[0].kind, 'transport');
  const r2 = buildFromSchedule(cs, rows, r1.rec);
  assert.equal(r2.added, 0); assert.equal(r2.rec.days[0].blocks.length, 2, 'never twice');
  assert.equal(r1.rec.days[0].blocks.length, 2, 'the existing record was not mutated');
  const r3 = buildFromSchedule(cs, rows.concat([{ id: 's4', caseId: 'c1', date: '2026-10-18', start: '15:00', what: 'פירוק', who: '' }]), r2.rec);
  assert.equal(r3.added, 1); assert.equal(r3.rec.days[0].blocks[2].kind, 'strike');
  assert.deepEqual(['הפסקת קפה', 'איסוף מהמלון', 'צ׳ק-אין במלון', 'Coffee break', 'מושב פתיחה', ''].map(guessKind), ['meal', 'transport', 'session', 'meal', 'session', 'other']);
  assert.equal(guessKind('הפסקה'), 'break');
});

test('callSheetText: only that person’s blocks, the arrival, parking notes, the producer’s phone; three languages, no Arabic', () => {
  const rec = day([B('a', '07:30', '09:00', 'הקמת הגברה', { owner: 'הגברה בע״מ', place: 'אולם', kind: 'setup', cue: 'מיקרופונים' }), B('b', '09:00', '09:30', 'הגעה ורישום', { kind: 'arrival', owner: 'מרינה', place: 'לובי' }),
    B('c', '09:30', '10:30', 'פתיחה', { owner: 'הגברה בע״מ', place: 'אולם' }), B('d', '12:00', '13:00', 'צהריים', { owner: 'קייטרינג', kind: 'meal' })]);
  const he = callSheetText(rec, cs, 'הגברה בע״מ', 'he', { phone: '054-4974644', producer: 'וירג׳יני' });
  assert.ok(he.includes('הקמת הגברה') && he.includes('פתיחה'), 'own blocks');
  assert.ok(!he.includes('צהריים'), 'not the caterer’s block');
  assert.ok(he.includes('הגעה ורישום'), 'the arrival block is there');
  assert.ok(he.includes('צריך להיות במקום עד 07:30, אולם'));
  assert.ok(he.includes('חניה בחניון הצפוני'));
  assert.ok(he.includes('054-4974644') && he.includes('מוכן: מיקרופונים') && he.includes('היי היי הגברה'));
  noArabic(he);
  const en = callSheetText(rec, cs, 'קייטרינג', 'en');
  assert.ok(en.startsWith('Hi קייטרינג') && en.includes('call sheet') && en.includes('צהריים') && !en.includes('פתיחה') && en.includes('Getting there / parking'));
  const fr = callSheetText(rec, cs, 'מרינה', 'fr');
  assert.ok(fr.includes('feuille de route') && fr.includes('הגעה ורישום') && fr.includes('Accès / parking'));
  assert.ok(callSheetText(rec, cs, 'x', 'he', { signer: 'וירג׳יני' }).endsWith('וירג׳יני'));
  const all = day([B('z', '08:00', '', 'תדריך', { owner: 'כולם' })]);
  assert.ok(callSheetText(all, cs, 'רותם', 'he').includes('תדריך'), 'blocks for everyone go to everyone');
});

test('runsheetText: the whole day with owners; multi-day gets date headings', () => {
  const rec = day([B('a', '09:00', '09:30', 'רישום', { owner: 'מרינה', place: 'לובי' }), B('b', '09:30', '', 'פתיחה')]);
  const txt = runsheetText(rec, cs, 'he', { signer: 'וירג׳יני' });
  assert.ok(txt.startsWith('לו״ז יום האירוע · ארגון שוב״ל · כנס ב-18/10/2026 בגן שפיים'));
  assert.ok(txt.includes('• 09:00-09:30 רישום · לובי · אחראי: מרינה') && txt.includes('הערות: חניה') && txt.endsWith('וירג׳יני'));
  assert.ok(!txt.includes('18/10/2026:'), 'one day: no date heading');
  const two = { days: [{ date: '2026-11-19', blocks: [B('a', '08:00', '', 'Pickup')] }, { date: '2026-11-20', blocks: [B('b', '09:00', '', 'Visit')] }] };
  const en = runsheetText(two, { client: 'Bertelsmann', kind: 'Delegation', date: '2026-11-19' }, 'en');
  assert.ok(en.includes('Run of show') && en.includes('19/11/2026:') && en.includes('20/11/2026:'));
  noArabic(en); noArabic(runsheetText(two, cs, 'fr'));
});

test('toIcs: one VEVENT per timed block, end from the next block when missing, location and alarm', () => {
  const rec = day([B('a', '09:00', '', 'רישום', { place: 'לובי' }), B('b', '09:30', '10:30', 'פתיחה'), B('c', '', '', 'בלי שעה')]);
  const ics = toIcs(rec, cs);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.includes('DTSTART:20261018T090000') && ics.includes('DTEND:20261018T093000') && ics.includes('DTEND:20261018T103000'));
  assert.ok(ics.includes('SUMMARY:רישום · ארגון שוב״ל') && ics.includes('LOCATION:לובי') && ics.includes('LOCATION:גן שפיים') && ics.includes('TRIGGER:-PT10M'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
});

test('template: a starter day per kind, around the event start', () => {
  assert.deepEqual(['כנס', 'יום גיבוש', 'משלחת או סיור', 'ערב טעימות', 'חתונה', 'seminar', 'אחר'].map(templateKind), ['conference', 'seminar', 'delegation', 'dinner', 'dinner', 'seminar', 'conference']);
  assert.equal(TEMPLATE_KINDS.length, 4);
  const conf = template('כנס', '2026-10-18', '09:00-16:00');
  assert.equal(conf.date, '2026-10-18');
  const titles = conf.blocks.map(b => b.title);
  ['הגעה, רישום וקפה', 'פתיחה וברכות', 'הפסקת קפה', 'ארוחת צהריים', 'סיכום וסיום', 'פירוק'].forEach(x => assert.ok(titles.includes(x), x));
  assert.equal(conf.blocks.find(b => b.kind === 'arrival').start, '09:00');
  assert.equal(conf.blocks[0].start, '06:30'); assert.equal(conf.blocks[0].kind, 'setup');
  assert.ok(conf.blocks.every((b, i, a) => i === 0 || b.start >= a[i - 1].start), 'sorted');
  assert.ok(conf.blocks.every(b => b.end > b.start), 'each block has an end');
  const sem = template('יום גיבוש', '2026-10-19', '');
  assert.equal(sem.blocks.find(b => b.kind === 'arrival').start, '09:00', 'default start 09:00');
  assert.ok(sem.blocks.some(b => b.title === 'סדנאות') && sem.blocks.some(b => b.kind === 'meal'));
  const del = template('משלחת או סיור', '2026-11-19', '08:00');
  const dt = del.blocks.map(b => b.title);
  assert.ok(dt.includes('איסוף מהמלון') && dt.includes('חזרה למלון וצ׳ק-אין') && dt.includes('ביקור ראשון') && dt.includes('ארוחת ערב'));
  assert.equal(del.blocks.filter(b => b.kind === 'transport').length, 3);
  const din = template('ערב טעימות', '2026-12-01', '');
  assert.equal(din.blocks.find(b => b.kind === 'arrival').start, '19:00', 'a dinner starts at 19:00');
  assert.ok(din.blocks.some(b => b.title === 'ברכות') && din.blocks[din.blocks.length - 1].kind === 'strike');
  const en = template('conference', '2026-10-18', '10:00', 'en');
  assert.ok(en.blocks.some(b => b.title === 'Lunch') && en.blocks.every(b => !hasArabic(b.title)));
  const fr = template('dinner', '2026-10-18', '20:00', 'fr');
  assert.ok(fr.blocks.some(b => b.title === 'Dîner'));
  const early = template('כנס', '2026-10-18', '01:00');
  assert.ok(early.blocks.every(b => b.start >= '00:00'), 'blocks before midnight are dropped, none wrap');
});

test('people: everyone on the sheet with a phone when one block has it', () => {
  const rec = day([B('a', '09:00', '', 'a', { owner: 'מרינה' }), B('b', '10:00', '', 'b', { owner: 'מרינה', phone: '052-1234567' }), B('c', '11:00', '', 'c', { owner: 'גרשון טורס', supplierId: 's9' }), B('d', '12:00', '', 'd', { owner: 'כולם' })]);
  const p = people(rec);
  assert.deepEqual(p.map(x => [x.name, x.phone, x.supplierId, x.count]), [['מרינה', '052-1234567', '', 2], ['גרשון טורס', '', 's9', 1]]);
});

test('runsheetHtml: an A4 page with the header and one row per block', () => {
  const rec = day([B('a', '09:00', '09:30', 'רישום <b>', { owner: 'מרינה', place: 'לובי', cue: 'תגים' })]);
  const html = runsheetHtml(rec, cs, 'he', { producerLine: 'וירג׳יני 054-4974644' });
  assert.ok(html.includes('dir="rtl"') && html.includes('ארגון שוב״ל') && html.includes('גן שפיים') && html.includes('רישום &lt;b&gt;') && html.includes('09:00–09:30') && html.includes('תגים') && html.includes('054-4974644'));
  assert.ok(runsheetHtml(rec, cs, 'en').includes('dir="ltr"'));
});
