import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const referenceRoot = resolve(root, '../ref');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/** Only the lab and reference image directory are readable over this server. */
export async function startServer({ port = 0, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end();
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') {
        response.writeHead(204);
        return response.end();
      }
      const isReference = pathname.startsWith('/ref/');
      const base = isReference ? referenceRoot : root;
      const relative = isReference ? pathname.slice(5) : pathname.slice(1) || 'index.html';
      const candidate = resolve(base, relative);
      if (!(candidate === base || candidate.startsWith(`${base}${sep}`))) {
        response.writeHead(403);
        return response.end('Forbidden');
      }
      const file = await realpath(candidate);
      const baseReal = await realpath(base);
      if (!file.startsWith(`${baseReal}${sep}`) || !(await stat(file)).isFile()) {
        response.writeHead(403);
        return response.end('Forbidden');
      }
      if (isReference && !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(file).toLowerCase())) {
        response.writeHead(403);
        return response.end('Reference route only serves images');
      }
      const content = await readFile(file);
      response.writeHead(200, {
        'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Bad request');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  });
  const address = server.address();
  return {
    server,
    url: `http://${host}:${address.port}`,
    close: () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8766);
  const running = await startServer({ port });
  console.log(`Kid body lab: ${running.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await running.close(); process.exit(0); });
  }
}
