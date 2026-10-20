import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function islandChromium() {
  try { return (await import('playwright')).chromium; }
  catch {
    const modulePath = process.env.ISLAND_PLAYWRIGHT || path.resolve(path.dirname(process.execPath), '../node_modules/playwright/index.mjs');
    return (await import(pathToFileURL(modulePath).href)).chromium;
  }
}

// Mirror the published subtree; missing lab and other application paths are 404.
export async function serveIsland(prefix = '/Bakasun/workout/island/') {
  if (process.env.ISLAND_URL) {
    const target = new URL('./', process.env.ISLAND_URL);
    target.search = ''; target.hash = '';
    return { url: target.href, async close() {} };
  }
  const root = path.resolve(fileURLToPath(new URL('../../workout/island/', import.meta.url)));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      let file = path.resolve(root, pathname.slice(prefix.length) || '.');
      if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
