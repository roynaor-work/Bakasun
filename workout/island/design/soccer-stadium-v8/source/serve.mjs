// Small authoring server; --game-csp applies the repository's existing HTML CSP.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.argv[2]||8765);
let policy='';
if(process.argv.includes('--game-csp')){
  const html=await fs.readFile(new URL('../../../index.html',import.meta.url),'utf8');
  policy=html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
  if(!policy)throw new Error('Current game CSP missing');
}
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.webp':'image/webp','.glb':'model/gltf-binary','.txt':'text/plain','.csv':'text/csv'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://local').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/preview.html':decodeURIComponent(pathname)));
    if(!file.startsWith(root+path.sep))throw new Error('Path outside package');
    const data=await fs.readFile(file),headers={'content-type':types[path.extname(file)]||'application/octet-stream','content-length':data.length,'cache-control':'no-store'};
    if(policy&&file.endsWith('.html'))headers['content-security-policy']=policy;
    res.writeHead(200,headers);res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
console.log(`http://127.0.0.1:${port}/preview.html${policy?' — current game CSP enabled':''}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit());});
