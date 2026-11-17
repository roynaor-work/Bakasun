#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.md':'text/plain; charset=utf-8','.zip':'application/zip'};
const port=Number(process.env.PORT||8765);
const server=http.createServer(async(req,res)=>{
  try {
    const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(requested==='/'?'/preview.html':requested));
    if(!file.startsWith(root)){res.writeHead(403).end();return;}
    const bytes=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400).end('File unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`LOD preview: http://127.0.0.1:${server.address().port}/preview.html`));
