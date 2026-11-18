import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runCase, viewport } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs({
  options: {
    base: { type: 'string' },
    patched: { type: 'string' },
    id: { type: 'string' },
    mode: { type: 'string', default: 'before,after' },
    workers: { type: 'string', default: '1' },
    out: { type: 'string', default: join(here, 'evidence') },
    'case-dir': { type: 'string', default: [here], multiple: true },
    'no-screens': { type: 'boolean' },
  },
}).values;
const expectedIds = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(3, '0'));
const modes = [...new Set(args.mode.split(','))];
const ids = args.id ? [...new Set(args.id.split(','))] : expectedIds;
const workers = Number(args.workers);
const roots = { before: args.base, after: args.patched, off: args.patched, single: args.patched };
if (ids.some(id => !expectedIds.includes(id)) || modes.some(mode => !Object.hasOwn(roots, mode) || !roots[mode]) ||
    !Number.isInteger(workers) || workers < 1 ||
    (modes.includes('before') && modes.some(mode => mode !== 'before') && resolve(args.base) === resolve(args.patched))) {
  throw new Error('Usage: node run.mjs --base CLEAN_CHECKOUT --patched PATCHED_CHECKOUT [--id 005,006] [--mode before,after,off,single]');
}
const ranks = ['005', '006', '012', '027', '035'];
ids.sort((a, b) => {
  const rank = id => ranks.includes(id) ? ranks.indexOf(id) : ranks.length + Number(id);
  return rank(a) - rank(b);
});

const caseFiles = ['shared.mjs', 'island.mjs', 'sports.mjs', 'racing.mjs', 'learning.mjs', 'action.mjs'];
const cases = new Map();
for (const directory of args['case-dir']) {
  for (const file of (await readdir(directory)).filter(file => caseFiles.includes(file))) {
    const { default: group } = await import(pathToFileURL(resolve(directory, file)));
    for (const [id, test] of Object.entries(group)) {
      if (cases.has(id)) throw new Error('Duplicate test ' + id);
      if (!expectedIds.includes(id) || typeof test !== 'function') throw new Error('Invalid test ' + id);
      cases.set(id, test);
    }
  }
}
for (const id of ids) {
  if (!cases.has(id)) throw new Error('Missing test KUX-' + id);
}

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

async function serve(root) {
  root = resolve(root);
  await stat(join(root, 'workout/island/index.html'));
  const server = createServer(async (request, response) => {
    let file;
    let metadata;
    try {
      const url = new URL(request.url, 'http://localhost');
      file = resolve(root, '.' + decodeURIComponent(url.pathname));
      const path = relative(root, file);
      if (isAbsolute(path) || path.startsWith('..')) throw new Error('Outside test checkout');
      metadata = await stat(file);
      if (metadata.isDirectory()) {
        file = join(file, 'index.html');
        metadata = await stat(file);
      }
      if (!metadata.isFile()) throw new Error('Expected a file');
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Length': metadata.size,
      'Content-Type': types[extname(file)] || 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  });
  await new Promise((ready, error) => server.once('error', error).listen(0, '127.0.0.1', ready));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE))
  : 'playwright');
const output = resolve(args.out);
await mkdir(output, { recursive: true });
const servers = new Map();
const browserFiles = await mkdtemp(join(tmpdir(), 'kid-ux-browser-'));
let browser;
try {
  for (const mode of modes) {
    const root = resolve(roots[mode]);
    if (!servers.has(root)) servers.set(root, await serve(root));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    env: {
      ...process.env,
      XDG_CACHE_HOME: join(browserFiles, 'cache'),
      XDG_CONFIG_HOME: join(browserFiles, 'config'),
    },
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    ],
  });
  const jobs = ids.flatMap(id => modes.map(mode => ({ id, mode })));
  const results = [];
  async function work() {
    for (let job; (job = jobs.shift());) {
      const { id, mode } = job;
      const result = await runCase({
        ...job, browser, test: cases.get(id),
        origin: servers.get(resolve(roots[mode])).origin,
        evidenceDir: output, screenshots: !args['no-screens'] && (mode === 'before' || mode === 'after'),
      });
      result.browser = browser.version();
      const wantPass = mode === 'after' || mode === 'single';
      result.status = result.errors.length ? 'error' :
        result.checks.length && result.checks.every(check => check.pass) ? 'pass' : 'fail';
      result.expected = wantPass ? 'pass' : 'fail';
      results.push(result);
      const filename = id + '-' + mode + '.json';
      await writeFile(join(output, filename), JSON.stringify(result, null, 2) + '\n');
      console.log('KUX-' + id, mode, result.status, '(' + result.expected + ' expected)');
      if (result.errors.length) process.stderr.write(result.errors.join('\n') + '\n');
      if (result.status !== result.expected) process.exitCode = 1;
    }
  }
  await Promise.all(Array.from({ length: workers }, work));
  console.log(JSON.stringify({
    viewport, browser: browser.version(), expected: results.filter(result => result.status === result.expected).length,
    runs: results.length, output: basename(output),
  }));
} finally {
  await browser?.close();
  for (const { server } of servers.values()) server.close();
  await rm(browserFiles, { recursive: true, force: true });
}
