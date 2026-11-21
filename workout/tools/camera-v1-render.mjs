// Renders the test clips of camera workout v1 and records what the real pose model answers for each frame.
// A rendered figure, not a person: see workout/camera-v1/QA.md for what this can and cannot show.
// Usage: PLAYWRIGHT=<playwright index.mjs> [CHROMIUM_PATH=<chrome>] node workout/tools/camera-v1-render.mjs --out <dir>
//        [--ids squats,lunges] [--sets base,frame] [--parallel 3] [--shots] [--force]
// One JSON per clip is written to <dir>; score them with workout/tools/camera-v1-realmodel.mjs.
import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAMERA_EXERCISES } from '../js/camera-v1/profiles.mjs';
import { EXERCISES } from '../js/exercises.js';
import { RANGES } from '../js/camera-v1/range.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };

export const PORTRAIT = { w: 390, h: 844 }, LANDSCAPE = { w: 844, h: 390 };
// The picture shape the page itself recommends: wide for the floor and the corridor, upright otherwise.
export const natural = id => CAMERA_EXERCISES[id].setup === 'floor' || EXERCISES.find(ex => ex.id === id).place === 'hall' ? LANDSCAPE : PORTRAIT;

// Twelve exercises that between them cover standing, jumping, floor, front and side: the costly conditions run on these.
export const CORE = ['squats', 'jumping-jacks', 'push-ups', 'crunches', 'high-knees', 'plank', 'burpees', 'glute-bridge',
  'calf-raises', 'star-jumps', 'mountain-climbers', 'leg-raises'];
export const WIDER = [...CORE, 'squat-jumps', 'tuck-jumps', 'jog', 'arm-circles', 'bicycle', 'superman', 'knee-push-ups', 'wall-sit'];
// Body sizes: the phone stays where a 1.0 figure is framed well, so a smaller child is a smaller figure in
// the picture. Proportions follow age: a six-year-old has a larger head and shorter legs for the same height.
export const BODIES = {
  'h055': { height: .55, body: { head: .82, legs: .9 } },
  'h070': { height: .7, body: { head: .72, legs: .95 } },
  'h085': { height: .85, body: { head: .66 } },
  'h100': { height: 1, body: { head: .6, legs: 1.06 } },
  'h110': { height: 1.1, body: { head: .58, legs: 1.1 } },
  'long-legs': { height: .9, body: { legs: 1.2 } },
  'short-legs': { height: .9, body: { legs: .82 } },
  'broad': { height: .9, body: { shoulders: 1.3 } },
};

export function plan(ids = EXERCISES.map(ex => ex.id), sets = ['base', 'view', 'frame', 'hard', 'idle', 'size', 'rom']) {
  const clips = [];
  for (const id of ids) {
    const want = CAMERA_EXERCISES[id].view, shape = natural(id), other = shape === PORTRAIT ? LANDSCAPE : PORTRAIT;
    const hall = EXERCISES.find(ex => ex.id === id).place === 'hall';
    const add = (set, name, cfg) => sets.includes(set) && clips.push({ name: id + '.' + name, set, condition: name, id, want, step: 67, reps: 3, ...shape, ...cfg });
    add('base', 'natural', {});
    if (hall) continue;
    add('base', 'turned', { ...other });
    if (CORE.includes(id)) add('view', 'other-view', { other: true, reps: 2 });
    add('idle', 'idle', { idle: true, idleMs: 4500 });
    if (CORE.indexOf(id) >= 0 && CORE.indexOf(id) < 8) {
      add('hard', 'dim', { dim: .2, noise: 14 });
      add('hard', 'slow-blur', { step: 125, trail: .45 });
      add('hard', 'fast', { speed: 1.15 });
    }
    if (['squats', 'push-ups', 'crunches', 'glute-bridge', 'leg-raises', 'calf-raises'].includes(id)) {
      // Shallow repetitions (the pose only goes part of the way) and rushed ones.
      add('rom', 'shallow-45', { depth: .45, reps: 4 });
      add('rom', 'shallow-78', { depth: .78, reps: 6 });
      add('rom', 'rush', { speed: 2, reps: 5 });
    }
    if (!CORE.includes(id)) continue;
    if (CORE.indexOf(id) < 6) add('idle', 'knocked', { shake: { at: 3400, dx: .16, dy: .05 }, decor: true });
    if (CORE.indexOf(id) >= 6) continue;
    add('frame', 'far', { dist: 3.4, reps: 1 });
    add('frame', 'near', { dist: .6, reps: 1 });
    add('frame', 'cut-low', { shiftY: -.24, reps: 1 });
    add('frame', 'cut-high', { shiftY: .24, reps: 1 });
    add('frame', 'cut-left', { shiftX: .42, reps: 1 });
    add('frame', 'cut-right', { shiftX: -.42, reps: 1 });
    if (CORE.indexOf(id) < 5) for (const [name, { height, body }] of Object.entries(BODIES)) add('size', 'size-' + name, { dist: 1.25 / height, body, band: name });
  }
  return clips;
}

function serve() {
  const srv = http.createServer(async (req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      if (!file.startsWith(root) || !(await stat(file)).isFile()) throw new Error('missing');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/` })));
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; };
  const out = path.resolve(arg('out', 'camera-v1-clips'));
  const ids = arg('ids')?.split(','), sets = arg('sets')?.split(',');
  const only = arg('only')?.split(',');
  const look = arg('look');
  const parallel = Number(arg('parallel', 3)), shots = process.argv.includes('--shots'), force = process.argv.includes('--force');
  await mkdir(out, { recursive: true });
  const queue = plan(ids, sets).filter(clip => (!only || only.includes(clip.condition)) && (force || !existsSync(path.join(out, clip.name + '.json'))));
  console.log(queue.length + ' clips to render');
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT).href);
  const { srv, base } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let done = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: parallel }, async () => {
    const context = await browser.newContext({ viewport: { width: 860, height: 860 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => console.error('page error', error.message));
    await page.goto(base + 'workout/tools/camera-v1-render/index.html');
    await page.waitForFunction(() => window.benchReady);
    for (let clip; (clip = queue.shift());) {
      try {
        if (look) { clip.look = look; clip.name += '.' + look; }
        if (shots) clip.shots = [0, 2010, 2680, 3216];
        const result = await page.evaluate(cfg => window.runClip(cfg), clip);
        await writeFile(path.join(out, clip.name + '.json'), JSON.stringify(result));
        if (shots) {
          const pictures = await page.evaluate(() => { const s = window.shots || {}; window.shots = {}; return s; });
          for (const [name, url] of Object.entries(pictures)) await writeFile(path.join(out, name + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
        }
      } catch (error) { console.error(clip.name, 'failed:', error.message.split('\n')[0]); }
      if (++done % 10 === 0) console.log(done + ' done, ' + Math.round((Date.now() - started) / 1000) + ' s');
    }
    await context.close();
  }));
  await browser.close(); srv.close();
  console.log('rendered ' + done + ' clips in ' + Math.round((Date.now() - started) / 1000) + ' s');
}
