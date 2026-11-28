#!/usr/bin/env node
// Store icon and feature graphic from the island's own icon (assets/icons/island.svg).
// Output: store/listing/icon-1024.png (opaque, for Apple), icon-512.png (Google Play), feature-1024x500.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './lib/serve.mjs';

const STORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(STORE, 'listing');
const svg = fs.readFileSync(path.join(STORE, 'www/assets/icons/island.svg'), 'utf8');
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
fs.mkdirSync(OUT, { recursive: true });

const browser = await (await chromium()).launch({ args: ['--no-sandbox'] });
async function render(width, height, html, file) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: false });
  await page.close();
  console.log('saved', file);
}
// opaque background: Apple rejects an icon with alpha; the icon art is full bleed
const icon = (size) => `<body style="margin:0;background:#edf7f5"><img src="${dataUrl}" style="width:${size}px;height:${size}px;display:block"></body>`;
await render(1024, 1024, icon(1024), 'icon-1024.png');
await render(512, 512, icon(512), 'icon-512.png');
await render(1024, 500, `<body style="margin:0;width:1024px;height:500px;background:linear-gradient(135deg,#17323a,#2a6f6a);display:flex;align-items:center;justify-content:center;gap:48px;direction:rtl;font-family:'Noto Sans Hebrew','Assistant',system-ui,sans-serif;color:#fff">
<img src="${dataUrl}" style="width:300px;height:300px;border-radius:56px">
<div><div style="font-size:88px;font-weight:800">העיר שלי</div><div style="font-size:36px;opacity:.9;margin-top:8px">בונים עיר ומשחקים בה</div></div></body>`, 'feature-1024x500.png');
await browser.close();
