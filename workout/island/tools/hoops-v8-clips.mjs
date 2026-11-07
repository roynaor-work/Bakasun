// Per-clip check of the v8 motion on the game's own v7 bodies: eight frames per clip (contact sheet PNG), the lowest foot height over a
// 60 Hz sweep (floor penetration: the foot bone's rest height is the reference), and planted-foot drift inside the package's support windows.
// Usage: node workout/island/tools/hoops-v8-clips.mjs out=<dir> [role=PG]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(0,i),a.slice(i+1)];}));
const out=path.resolve(args.out||'/tmp/v8clips'),role=args.role||'PG';await mkdir(out,{recursive:true});
const workout=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const f=path.resolve(workout,p.slice('/workout/'.length));if(!f.startsWith(workout)){res.writeHead(404).end();return;}await stat(f);res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}).end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:300}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`http://127.0.0.1:${server.address().port}/workout/island/tools/hoops-v8-clips.html?role=${role}`);
await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
const data=await page.evaluate(()=>window.__clips);
const {default:sharp}=await import('node:module').then(()=>({default:null}));
for(const name of data.names){
 const shots=[];for(let i=0;i<8;i++){await page.evaluate(([n,i])=>window.__shot(n,i),[name,i]);shots.push(await page.screenshot({clip:{x:0,y:0,width:1200,height:300}}));}
 for(let i=0;i<8;i++)await writeFile(path.join(out,`${name.slice(3)}-${i}.png`),shots[i]);
}
await writeFile(path.join(out,'metrics.json'),JSON.stringify({role,restFoot:data.rest,dense:data.dense,errors},null,1));
console.log(role,'rest foot',data.rest.toFixed(3));for(const [n,m] of Object.entries(data.dense))console.log(n.padEnd(20),'minFoot',m.minFoot,'minHand',m.minHand,'plantDrift',m.plantDrift);
if(errors.length)console.log('errors',errors.slice(0,5));
await browser.close();server.close();
