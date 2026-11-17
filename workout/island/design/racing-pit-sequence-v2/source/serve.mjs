// CC0-1.0. Local repository preview server; no dependencies or build step.
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = path.resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const page = '/workout/island/design/racing-pit-sequence-v2/preview.html';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.md':'text/plain; charset=utf-8'};

export async function startServer({port = 8765, host = '0.0.0.0'} = {}) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(repository, '.' + (pathname === '/' ? page : pathname));
      if (!file.startsWith(repository + path.sep)) {
        response.writeHead(403).end(); return;
      }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const bytes = await readFile(file);
      response.writeHead(200, {'content-type':types[path.extname(file)] ?? 'application/octet-stream',
        'content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'}).end(bytes);
    } catch {
      response.writeHead(404, {'content-type':'text/plain; charset=utf-8'}).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, host, resolve);});
  const url = `http://127.0.0.1:${server.address().port}${page}`;
  return {server, url, close:() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf('--port');
  const port = index < 0 ? 8765 : Number(process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('Invalid port');
  const preview = await startServer({port});
  console.log(preview.url);
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => preview.close().then(() => process.exit(0)));
}
