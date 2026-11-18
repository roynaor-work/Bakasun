import http from 'node:http';
import path from 'node:path';
import {readFile, stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const repositoryRoot=path.resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
export async function serveRepository(root=repositoryRoot, port=0){
 const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.css':'text/css'};
 const server=http.createServer(async(req,res)=>{
  try{
   let rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'');
   if(rel==='__review_fixture'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Review regression probe</title>');return;}
   let file=path.resolve(root,rel);
   if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   if((await stat(file)).isDirectory())file=path.join(file,'index.html');
   const body=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise((resolve,reject)=>{server.closeAllConnections();server.close(e=>e?reject(e):resolve());})};
}
export async function launchBrowser(){
 let playwright;
 if(process.env.ISLAND_PLAYWRIGHT)playwright=await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href);
 else {
  try{playwright=await import('playwright');}
  catch{playwright=await import(pathToFileURL('/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package/index.mjs').href);}
 }
 return playwright.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
}
