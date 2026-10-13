import { test } from 'node:test';
import assert from 'node:assert/strict';
import Office from '../js/logic/office.js';
import { itemsByDay } from '../js/logic/calendarGrid.js';
import { callOutcome, CALL } from '../js/logic/extra.js';
import { agenda } from '../js/logic/agenda.js';
import { takeWhen } from '../js/logic/travel.js';
import { icsText } from '../js/logic/ics.js';
import { validSpec } from '../js/logic/rfqFlow.js';
import { glossaryTranslate } from '../js/logic/translate.js';
import { setLang, dir, t } from '../js/i18n.js';
import { offerMoney } from '../js/logic/rfq.js';

const callback = () => callOutcome({ id: 'b3-call', name: 'איש קשר בדיקה', status: CALL.todo, attempts: 0 }, 'callback', { when: '2026-10-14' });
test('B3-D01 current: a callback appears in the call queue but is absent from both calendars', () => {
  const call = callback(); assert.equal(call.callbackAt, '2026-10-14');
  assert.deepEqual(itemsByDay({ calls: [call] }, '2026-10-14', '2026-10-14'), {});
  assert.deepEqual(agenda({ calls: [call] }, { from: '2026-10-14', to: '2026-10-14' }, '2026-10-13').calls, []);
});
test('B3-D01 fix: a scheduled callback is visible on its due day',
  { skip: 'B3-D01: callOutcome stores name/callbackAt, calendarGrid reads who/when and voice agenda reads due/when.' }, () => {
    assert.equal(itemsByDay({ calls: [callback()] }, '2026-10-14', '2026-10-14')['2026-10-14'][0].title, 'איש קשר בדיקה');
  });

test('B3-D02 current: an impossible date rolls into March and RFQ validation accepts it', () => {
  assert.equal(Office.iso('2026-02-31'), '2026-03-03');
  assert.equal(validSpec('hotel', { checkIn: '2026-02-30', checkOut: '2026-02-31' }), true);
});
test('B3-D02 fix: impossible event dates are rejected rather than normalized',
  { skip: 'B3-D02: Office.day builds a Date without checking its resulting year/month/day; validSpec only compares strings.' }, () => {
    assert.equal(Office.day('2026-02-31'), null);
    assert.equal(validSpec('hotel', { checkIn: '2026-02-30', checkOut: '2026-02-31' }), false);
  });

test('B3-D03 current: voice parsing treats 12 am as noon and permits impossible minutes', () => {
  assert.equal(takeWhen('call tomorrow at 12am', '2026-10-13').time, '12:00');
  assert.equal(takeWhen('call tomorrow at 10:99', '2026-10-13').time, '10:99');
});
test('B3-D03 fix: midnight and minutes are valid when parsed from voice input',
  { skip: 'B3-D03: takeWhen adjusts pm but not 12am and does not validate minutes.' }, () => {
    assert.equal(takeWhen('call tomorrow at 12am', '2026-10-13').time, '00:00');
    assert.equal(takeWhen('call tomorrow at 10:99', '2026-10-13').time, '');
  });

test('B3-D04 current: ISO timestamps use the UTC date prefix rather than the local business day', () => {
  const instant = '2026-09-30T22:30:00.000Z';
  assert.equal(Office.iso(instant), '2026-09-30');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  assert.equal(parts.find(p => p.type === 'day').value, '01');
});
test('B3-D04 fix: timestamps on the month boundary are attributed to the business day',
  { skip: 'B3-D04: Office.day treats a timestamp string as a date prefix; separate civil dates from instants and apply the chosen business timezone.' }, () => {
    assert.equal(Office.iso('2026-09-30T22:30:00.000Z'), '2026-10-01');
  });

test('B3-D05 current: ICS DTSTAMP lacks the required UTC Z suffix', () => {
  assert.match(icsText({ id: 'b3-event', title: 'אירוע בדיקה', date: '2026-10-14' }), /DTSTAMP:\d{8}T\d{6}\r\n/);
});
test('B3-D05 fix: ICS metadata uses a UTC DTSTAMP (RFC 5545)',
  { skip: 'B3-D05: DTSTAMP is produced by stamp() using local floating time; DTSTAMP must be UTC even for all-day events.' }, () => {
    assert.match(icsText({ title: 'אירוע בדיקה', date: '2026-10-14' }), /DTSTAMP:\d{8}T\d{6}Z\r\n/);
  });

test('B3-L01 current: the Other RFQ template displays its internal key in all languages', () => {
  for (const language of ['he', 'fr', 'en']) { setLang(language); assert.equal(t('tplOther'), 'tplOther'); }
  setLang('he');
});
test('B3-L01 fix: all RFQ template titles are translated',
  { skip: 'B3-L01: tplOther is referenced by kindTitle but absent from the dictionaries.' }, () => {
    for (const language of ['he', 'fr', 'en']) { setLang(language); assert.notEqual(t('tplOther'), 'tplOther'); }
    setLang('he');
  });

test('B3-L02 current: French currency formatting always uses English thousands and decimals', () => {
  setLang('fr'); assert.equal(offerMoney(1234.56, 'EUR'), '1,234.56 €'); setLang('he');
});
test('B3-L02 fix: currency formatting uses the selected French locale',
  { skip: 'B3-L02: offerMoney hardcodes en-US; Office.fmt and Office.money also ignore the selected locale.' }, () => {
    setLang('fr'); assert.equal(offerMoney(1234.56, 'EUR'), '1\u202f234,56 €'); setLang('he');
  });

test('B3-L03 current: translating an exclusion leaves its Hebrew negation next to translated VAT', () => {
  assert.equal(glossaryTranslate('לא כולל מע״מ', 'en'), 'לא including VAT');
  assert.equal(glossaryTranslate('לא כולל מע״מ', 'fr'), 'לא TTC');
});
test('B3-L03 fix: the glossary preserves the full negative VAT meaning',
  { skip: 'B3-L03: positive כולל and כולל מע״מ rules run before negative phrases.' }, () => {
    assert.equal(glossaryTranslate('לא כולל מע״מ', 'en'), 'not including VAT');
  });

test('B3-L04 control: Hebrew is RTL while French and English are LTR', () => {
  for (const language of ['he', 'fr', 'en']) { setLang(language); assert.equal(dir(), language === 'he' ? 'rtl' : 'ltr'); }
  setLang('he');
});
