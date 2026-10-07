import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=fileURLToPath(new URL('.',import.meta.url));
export function serve(port=8766){return new Promise(resolve=>{const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(base,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(base))throw Error('path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>resolve(server));});}
if(process.argv[1]===fileURLToPath(import.meta.url)){await serve();console.log('Kid-head server: port 8766');}
