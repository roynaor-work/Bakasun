import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = await realpath(fileURLToPath(new URL('../../../..', import.meta.url)));
const args = process.argv.slice(2);
const port = args.length === 0 ? 8766 : Number(args[1]);
if ((args.length && (args.length !== 2 || args[0] !== '--port')) || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('Usage: node serve.mjs [--port NUMBER]');
}
const workout = '/workout/';
const legacyApp = workout + 'js/app.js';
const allowed = new Set([
  'index.html', 'manifest.json', 'icons/icon.svg', 'css/style.css', 'css/game-art.css',
  'camera-v1/index.html', 'camera-v1/entry.mjs', 'camera-v1/style.css',
  'js/exercises.js', 'js/say.js', 'js/figure.js', 'js/logic.js', 'js/say-ui.js', 'js/outdoors.js', 'js/programs.js',
  'js/camera-v1/session.mjs', 'js/camera-v1/capture.mjs',
  'js/camera-v1/pose-worker.js', 'js/camera-v1/tracking.mjs', 'js/camera-v1/motion.mjs',
  'js/camera-v1/geometry.mjs', 'js/camera-v1/profiles.mjs', 'js/camera-v1/hall.mjs',
  'cam-lab/vendor/vision_bundle.mjs',
  'cam-lab/vendor/wasm/vision_wasm_internal.js', 'cam-lab/vendor/wasm/vision_wasm_internal.wasm',
  'cam-lab/vendor/wasm/vision_wasm_nosimd_internal.js', 'cam-lab/vendor/wasm/vision_wasm_nosimd_internal.wasm',
  'cam-lab/models/pose_landmarker_lite.task',
]);
const mime = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/manifest+json',
  mjs: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  task: 'application/octet-stream',
  wasm: 'application/wasm',
};
const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self'; media-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

const server = createServer(async (request, response) => {
  const fail = (code, message) => {
    response.writeHead(code, { ...security, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(message);
  };
  if (request.headers.host !== '127.0.0.1:' + server.address().port) return fail(403, 'Loopback only');
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Read-only server');
  if (request.headers['sec-fetch-site'] === 'cross-site' && request.headers['sec-fetch-mode'] !== 'navigate') {
    return fail(403, 'Same-origin assets only');
  }
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) return fail(400, 'Invalid request path');
  let path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/') {
    response.writeHead(302, { ...security, Location: '/workout/?cameraV1=1' });
    return response.end();
  }
  if (path === workout || path === workout + 'camera-v1/') path += 'index.html';
  if (path === legacyApp) return fail(404, 'The legacy app is available from its usual server. This server runs camera v1 only.');
  const asset = path.slice(workout.length);
  if (!path.startsWith(workout) || !allowed.has(asset)) return fail(404, 'Asset absent from the local workout');
  try {
    const file = await realpath(resolve(root, path.slice(1)));
    if (!file.startsWith(root + sep)) return fail(403, 'File is outside the checkout');
    const info = await stat(file);
    if (!info.isFile()) return fail(404, 'File is missing');
    response.writeHead(200, { ...security, 'Content-Type': mime[file.split('.').at(-1)], 'Content-Length': info.size });
    if (request.method === 'HEAD') return response.end();
    await pipeline(createReadStream(file), response);
  } catch {
    if (!response.headersSent) fail(404, 'File missing. Apply the workout patches in this checkout first.');
    else response.destroy();
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('http://127.0.0.1:' + server.address().port + '/workout/?cameraV1=1');
});
