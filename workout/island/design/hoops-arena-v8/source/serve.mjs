import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.glb':'model/gltf-binary','.wasm':'application/wasm','.md':'text/plain; charset=utf-8'};
export function packageServer() {
  return http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://local');let name=decodeURIComponent(url.pathname);if(name==='/')name='/preview.html';
      const absolute=await fs.realpath(path.join(root,name));if(!absolute.startsWith(root))throw new Error('Outside package');
      const st=await fs.stat(absolute);if(!st.isFile())throw new Error('Not a file');
      const workerPolicy=absolute.endsWith('/runtime/draco-worker.js')?{'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'"}:{};
      res.writeHead(200,{...workerPolicy,'Content-Type':MIME[path.extname(absolute)]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await fs.readFile(absolute));
    } catch {res.writeHead(404);res.end('Not found');}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const server=packageServer();server.listen(Number(process.argv[2])||8765,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/preview.html'));
}
