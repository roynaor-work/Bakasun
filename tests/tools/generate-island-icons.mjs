import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { islandChromium } from '../helpers/island-browser.mjs';

// Uses the already installed browser. No network, image package or download.
const root = new URL('../../workout/island/assets/icons/', import.meta.url);
const source = await readFile(new URL('island.svg', root), 'utf8');
const browser = await (await islandChromium()).launch({ executablePath: process.env.ISLAND_BROWSER, headless: true });
try {
  const page = await browser.newPage();
  const jobs = [ ['island-192.png', 192], ['island-512.png', 512], ['island-maskable-512.png', 512, true], ['apple-touch-icon.png', 180] ];
  for (const [name, size, maskable] of jobs) {
    const svg = maskable ? source.replace('<g id="island-art">', '<g id="island-art" transform="translate(256 256) scale(.82) translate(-256 -256)">') : source;
    await page.setContent(svg);
    if (maskable) {
      const radius = await page.evaluate(() => {
        const art = document.querySelector('#island-art'), b = art.getBBox(), m = art.getCTM();
        return Math.max(...[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y]) => {
          const p = new DOMPoint(x,y).matrixTransform(m); return Math.hypot(p.x-256,p.y-256);
        }));
      });
      assert.ok(radius <= 512 * .4, `all essential artwork must fit the maskable safe circle: ${radius}`);
    }
    const base64 = await page.evaluate(async ({ svg, size }) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        img.src = url; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img,0,0,size,size);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally { URL.revokeObjectURL(url); }
    }, { svg, size });
    await writeFile(new URL(name, root), Buffer.from(base64, 'base64'));
    console.log(`${name}: ${size}×${size}`);
  }
} finally { await browser.close(); }
