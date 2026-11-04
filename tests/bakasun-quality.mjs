import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const smoke = readFileSync(new URL('./e2e/smoke_all_screens.py', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
test('B3-Q01 fix (static): the smoke test sets the actual UI language and checks the resulting document language', () => {
    assert.match(shell, /db\.setting\('lang'\)/); assert.doesNotMatch(smoke, /uiLang/);
    assert.match(smoke, /settings\.lang\s*=|s\.settings\.lang=|db\.setting\(['"]lang['"]/);
    assert.match(smoke, /document\.documentElement\.lang/);
  });

const prototype = readFileSync(new URL('../_c3d.html', import.meta.url), 'utf8');
const obsolete = [...prototype.matchAll(/(?:href=|from )['"]([^'"]+)['"]/g)].map(match => match[1]);
test('B3-Q02 current: the root 3D prototype references files absent from the repository root', () => {
  assert.ok(obsolete.length >= 2);
  assert.ok(obsolete.every(path => !existsSync(new URL('../' + path, import.meta.url))));
});
test('B3-Q02 fix: every local prototype import and stylesheet exists',
  { skip: 'B3-Q02: _c3d.html has stale css/style.css and js/games/celebrate3d.js paths; repair or explicitly archive in a later task, no deletion in B3.' }, () => {
    assert.ok(obsolete.every(path => existsSync(new URL('../' + path, import.meta.url))));
  });

test('B3-Q03 current (static): independent ICS implementations duplicate timestamp creation', () => {
  for (const path of ['../js/logic/ics.js', '../js/logic/runsheet.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /function stamp\(/);
    assert.match(source, /DTSTAMP:/);
  }
});
