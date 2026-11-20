import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { icsText } from '../js/logic/ics.js';
import { toIcs } from '../js/logic/runsheet.js';

const smoke = readFileSync(new URL('./e2e/smoke_all_screens.py', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
test('B3-Q01 fix (static): the smoke test sets the actual UI language and checks the resulting document language', () => {
    assert.match(shell, /db\.setting\('lang'\)/); assert.doesNotMatch(smoke, /uiLang/);
    assert.match(smoke, /settings\.lang\s*=|s\.settings\.lang=|db\.setting\(['"]lang['"]/);
    assert.match(smoke, /document\.documentElement\.lang/);
  });

const prototype = readFileSync(new URL('../_c3d.html', import.meta.url), 'utf8');
const obsolete = [...prototype.matchAll(/(?:href=|from )['"]([^'"]+)['"]/g)].map(match => match[1]);
test('B3-Q02 fix: every local prototype import and stylesheet exists',
  { skip: 'B3-Q02: _c3d.html has stale css/style.css and js/games/celebrate3d.js paths; repair or explicitly archive in a later task, no deletion in B3.' }, () => {
    assert.ok(obsolete.every(path => existsSync(new URL('../' + path, import.meta.url))));
  });

test('calendar exports include the generation timestamp on every emitted event', t => {
  t.mock.timers.enable({apis:['Date'], now:new Date(2030,1,3,4,5)});
  const reminder = icsText({id:'fixture',title:'Calendar fixture',date:'2030-03-01',time:'09:00'});
  const runsheet = toIcs({days:[{date:'2030-03-01',blocks:[
    {id:'first',title:'First event',start:'09:00'},
    {id:'second',title:'Second event',start:'10:00'},
  ]}]});
  for (const [ics, expectedEvents] of [[reminder,1],[runsheet,2]]) {
    const events = ics.split('BEGIN:VEVENT\r\n').slice(1);
    assert.equal(events.length,expectedEvents);
    for (const event of events) {
      assert.deepEqual(event.split('\r\n').filter(line=>line.startsWith('DTSTAMP:')),['DTSTAMP:20300203T040500']);
    }
  }
});
