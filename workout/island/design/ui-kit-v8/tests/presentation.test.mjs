import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { presentScore } from '../runtime/format.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = await readFile(resolve(root, 'runtime/island-ui.css'), 'utf8');
const token = name => {
  const found = css.match(new RegExp(`--iu-${name}:\\s*(#[a-f0-9]{6})`, 'i'));
  assert.ok(found, `Missing color token ${name}`); return found[1];
};
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => {
    const s = parseInt(value, 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
};
for (const [foreground, background] of [
  ['ink', 'paper'], ['muted', 'paper'], ['ink', 'mint'], ['muted', 'mint'],
  ['ink', 'sand'], ['ink', 'gold'], ['ink', 'coral'], ['paper', 'sea'], ['danger', 'paper'],
]) {
  test(`text contrast ${foreground}/${background} is at least 4.5:1`, () => {
    const ratio = contrast(token(foreground), token(background));
    assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1 is below 4.5:1`);
  });
}

test('large scores fit a concise HUD while the accessible label preserves the exact value', () => {
  assert.deepEqual(presentScore(240), { text: '240', label: '240 נקודות' });
  assert.deepEqual(presentScore(0), { text: '0', label: '0 נקודות' });
  for (const score of [9999, 10000, 999999, 1234567890, Number.MAX_SAFE_INTEGER]) {
    const value = presentScore(score);
    assert.ok(value.text.length <= 7, `HUD display too long: ${value.text}`);
    assert.equal(value.label.replace(/[^0-9]/g, ''), String(score));
  }
  for (const invalid of [-1, .5, NaN, Infinity, '240', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => presentScore(invalid), RangeError);
});

test('SVG references resolve to local symbols and all runtime assets stay dependency-free', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const sprite = await readFile(resolve(root, 'runtime/icons.svg'), 'utf8');
  for (const match of html.matchAll(/href="runtime\/icons\.svg#([a-z-]+)"/g)) assert.ok(sprite.includes(`id="${match[1]}"`), `Unresolved icon ${match[1]}`);
  for (const file of await readdir(resolve(root, 'runtime'))) {
    if (!/\.(css|svg|mjs)$/.test(file)) continue;
    const text = await readFile(resolve(root, 'runtime', file), 'utf8');
    assert.ok(!/@import\s|url\(["']?https?:|<script\b|<foreignObject\b|<image\b/i.test(text), `${file} imports a remote/heavy resource`);
  }
});

test('delivery stays below 60 MB with lightweight HTML and no raw JSON, archive or video', async () => {
  let bytes = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'Package must not depend on symlinked assets');
      if (entry.isDirectory()) { await visit(path); continue; }
      const info = await stat(path); bytes += info.size;
      const suffix = extname(path).toLowerCase();
      assert.ok(!['.json', '.jsonl', '.ndjson', '.mp4', '.webm', '.mov', '.zip', '.gz', '.tar'].includes(suffix), `Forbidden artifact ${entry.name}`);
      if (suffix === '.html') assert.ok(info.size < 32_000, 'HTML should remain lightweight');
      if (suffix === '.svg') assert.ok(info.size < 16_000, 'SVG should remain directly usable');
    }
  }
  await visit(root);
  assert.ok(bytes <= 60_000_000, `${bytes} bytes exceeds 60 MB`);
  const rounds = (await readdir(resolve(root, 'iterations'))).filter(name => /^\d{2}$/.test(name));
  assert.ok(rounds.length <= 2, 'Only the last and previous iterations may remain');
});
