// Sends a recorded video of a person through the real pose model of camera workout v1 and scores the page's
// own tracker and counter on it. The video stays on this machine; only the model's answers are written out.
// Usage: PLAYWRIGHT=<playwright index.mjs> node workout/tools/camera-v1-video.mjs --video <file> --id <exercise>
//        [--from s] [--to s] [--reps n] [--out <dir>] [--sheet] [--modules <dir>] [--again]
import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, replay } from './camera-v1-realmodel.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; };
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4', '.ogv': 'video/ogg' };
const video = path.resolve(arg('video')), id = arg('id'), out = path.resolve(arg('out', '.'));
const name = path.basename(video).replace(/\.\w+$/, '') + '.' + id;
const cached = path.join(out, name + '.json');
let clip;
try { if (!process.argv.includes('--again')) clip = JSON.parse(await readFile(cached, 'utf8')); } catch { /* record it now */ }
if (!clip) {
  const srv = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = url === '/__video' ? video : path.join(root, url);
    try {
      const info = await stat(file);
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = range ? +range[1] : 0, end = range && range[2] ? +range[2] : info.size - 1;
      res.writeHead(range ? 206 : 200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'accept-ranges': 'bytes',
        'content-length': end - start + 1, ...(range ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}) });
      createReadStream(file, { start, end }).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT).href);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/workout/tools/camera-v1-render/index.html`);
  await page.waitForFunction(() => window.benchReady);
  clip = await page.evaluate(cfg => window.runVideo(cfg), { url: '/__video', id, from: Number(arg('from', 0)), to: arg('to') ? Number(arg('to')) : undefined, sheet: process.argv.includes('--sheet') });
  await browser.close(); srv.close();
  await mkdir(out, { recursive: true });
  if (clip.sheet) await writeFile(path.join(out, name + '.sheet.jpg'), Buffer.from(clip.sheet.split(',')[1], 'base64'));
  delete clip.sheet;
  await writeFile(cached, JSON.stringify(clip));
}
const api = await load(arg('modules'));
const flags = Object.fromEntries((arg('flags', '') || '').split(',').filter(Boolean).map(name => [name, true]));
const run = replay(clip, api, id, flags);
const seenFrames = clip.frames.filter(frame => frame.poses.length > 0).length;
const ms = clip.frames.slice(3).map(frame => frame.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ flags: Object.keys(flags).join('+') || 'none', video: path.basename(video), id, seconds: Math.round(clip.total / 100) / 10, frames: clip.frames.length,
  detected: Math.round(100 * seenFrames / clip.frames.length) + '%', ready: Math.round(100 * run.readyFrames / run.frames) + '%',
  counted: run.timed ? Math.round(run.amount * 10) / 10 + ' s' : run.amount, expected: arg('reps') ?? '?', partials: run.partials,
  statuses: run.statuses, events: run.events, modelMs: ms[ms.length >> 1] }));
