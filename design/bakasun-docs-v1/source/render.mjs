import { readFile, mkdir, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch } from './browser.mjs';
import { serve, root } from './server.mjs';
import { inspectLayout } from './inspect.mjs';

const round = process.argv[2];
if (!/^\d{2}$/.test(round || '')) throw Error('Usage: node source/render.mjs 01');
const out = path.join(root, 'iterations', round);
await mkdir(out, { recursive: true });
await mkdir(path.join(root, 'previews'), { recursive: true });
const docs = JSON.parse(await readFile(path.join(root, 'templates.json')));
const server = await serve();
const browser = await launch();
const results = [];
try {
  for (const doc of docs) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => errors.push(r.url()));
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${server.url}/${doc.id}.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(inspectLayout);
    const pdf = path.join(out, doc.id + '.pdf');
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: true });
    const info = execFileSync('/usr/bin/pdfinfo', [pdf], { encoding: 'utf8' });
    const fonts = execFileSync('/usr/bin/pdffonts', [pdf], { encoding: 'utf8' });
    const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
    const size = info.match(/Page size:\s+([^\n]+)/)?.[1];
    execFileSync('/usr/bin/pdftoppm', ['-scale-to', '1123', '-png', pdf, path.join(out, doc.id)]);
    await copyFile(pdf, path.join(root, 'pdf', doc.id + '.pdf'));
    results.push({ id: doc.id, errors, layout, pages, pageSize: size, fonts, htmlSHA256: createHash('sha256').update(await readFile(path.join(root, doc.id+'.html'))).digest('hex'), pdfSHA256: createHash('sha256').update(await readFile(pdf)).digest('hex') });
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
const cssSHA256 = createHash('sha256').update(await readFile(path.join(root,'assets/documents.css'))).digest('hex');
await writeFile(path.join(out,'render.json'), JSON.stringify({ round, capturedAt: new Date().toISOString(), browser: browser.version(), cssSHA256, results },null,2)+'\n');
// Every run retains the current round and its immediate predecessor only.
const rounds = (await readdir(path.join(root, 'iterations'))).filter(x=>/^\d{2}$/.test(x)).sort();
for (const old of rounds.slice(0,-2)) await rm(path.join(root, 'iterations', old), { recursive: true });
execFileSync('python3', [path.join(root,'source/contact-sheet.py'),round], { stdio:'inherit' });
console.log(JSON.stringify(results.map(r=>({ id:r.id,pages:r.pages,size:r.pageSize,errors:r.errors,sheets:r.layout.sheets })),null,2));
