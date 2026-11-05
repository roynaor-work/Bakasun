/** A scoped, internet-blocked localhost session for visual review tools. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function openPreview({width=390,height=844,clean=true,dpr=1,resourceOverrides=null}={}){
  const errors=[],remoteRequests=[];
  const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};
  const server=http.createServer(async(req,res)=>{
    try{const local=decodeURIComponent(new URL(req.url,'http://local').pathname),p=path.resolve(root,'.'+local);if(!p.startsWith(root+path.sep))throw Error('Outside package');const b=resourceOverrides?.[local]??await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}
    catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https?:/,r=>{if(r.request().url().startsWith(origin+'/'))return r.continue();remoteRequests.push(r.request().url());return r.abort('blockedbyclient');});
  const close=async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));};
  try{await page.goto(origin+'/preview.html?paused'+(clean?'&clean':''),{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>Boolean(globalThis.soccerV7),{timeout:60000});await page.evaluate(()=>soccerV7.ready);await page.evaluate(()=>soccerV7.setPlaying(false));}
  catch(e){await close();throw e;}
  return{page,browser,origin,errors,remoteRequests,close};
}
