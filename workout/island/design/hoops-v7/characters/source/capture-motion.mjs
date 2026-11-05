#!/usr/bin/env node
// Four rendered key phases per action; sheets contain real screenshots only.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire('/tmp/hoops-v7-tools/package.json');
const {chromium}=require('playwright'),sharp=require('sharp');
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const iteration=option('--iteration'),role=option('--role','pg'),label=option('--label','');
const yaw=Number(option('--yaw','.10')),selected=option('--actions','').split(',').filter(Boolean);
const phases=option('--phases','0,.30,.55,.82').split(',').map(Number);
if(phases.length!==4||phases.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Supply exactly four phases in [0,1].');
const dimensions=option('--viewport','390x844').split('x').map(Number);
if(dimensions.length!==2||dimensions.some(n=>!Number.isInteger(n)||n<240||n>2048))throw Error('Supply --viewport WIDTHxHEIGHT within240–2048.');
const viewport={width:dimensions[0],height:dimensions[1]};
if(!/^\d{2}$/.test(iteration||''))throw Error('Supply --iteration NN');
if(label&&!/^[a-z0-9_-]+$/.test(label))throw Error('Use a simple evidence label');
const output=path.join(root,'iterations',iteration,'motion',role+(label?'-'+label:''));
await fs.mkdir(output,{recursive:true});
try{await fs.access(path.join(output,'capture.json'));throw Error('Evidence already exists; use a later iteration.');}catch(e){if(e.code!=='ENOENT')throw e;}
const frozen=await fs.mkdtemp('/tmp/hoops-v7-motion-'),inputs=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
async function freeze(folder=root,relative=''){
 for(const e of await fs.readdir(folder,{withFileTypes:true})){
  if(['iterations','verification','standalone.html'].includes(e.name))continue;
  const name=path.join(relative,e.name),source=path.join(folder,e.name),destination=path.join(frozen,name);
  if(e.isDirectory()){await fs.mkdir(destination,{recursive:true});await freeze(source,name);}
  else{const b=await fs.readFile(source);await fs.writeFile(destination,b);inputs.push({file:name,bytes:b.length,sha256:hash(b)});}
 }
}
await freeze();
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{const u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(u==='/favicon.ico'){res.writeHead(204);res.end();return;}const p=path.resolve(frozen,'.'+(u==='/'?'/index.html':u));if(!p.startsWith(frozen+path.sep))throw Error('path');const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport,deviceScaleFactor:1}),errors=[],externalRequests=[],shots=[],sheets=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();externalRequests.push(u);return route.abort();});
const startedAtUtc=new Date().toISOString();
try{
 await page.goto(origin+'/index.html?capture=1');await page.waitForFunction(()=>!!window.__hoopsLab,null,{timeout:120000});
 await page.evaluate(async()=>{await window.__hoopsLab.ready;window.__hoopsLab.pause(true);});
 const actions=(await page.evaluate(()=>window.__hoopsLab.actions)).filter(a=>!selected.length||selected.includes(a.id));
 await page.evaluate(role=>{const a=window.__hoopsLab;a.selectRole(role);a.setLOD('high');a.setView('near');},role);
 for(const action of actions){
  const tiles=[];
  for(const [index,phase]of phases.entries()){
   const diag=await page.evaluate(async({id,phase,yaw})=>{const a=window.__hoopsLab;a.selectAction(id,{immediate:true});a.seek(phase);a.setView('near');a.setCamera({yaw});a.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return a.diagnostics();},{id:action.id,phase,yaw});
   const png=await page.locator('#stage').screenshot({animations:'disabled'}),webp=await sharp(png).webp({quality:94,effort:5}).toBuffer();
   const name=`${action.id}-${String(index).padStart(2,'0')}.webp`;await fs.writeFile(path.join(output,name),webp);
   shots.push({file:name,role,action:action.id,phase,bytes:webp.length,sha256:hash(webp),diagnostics:diag});
   const metadata=await sharp(png).metadata();
   const caption=Buffer.from(`<svg width="${metadata.width}" height="28"><rect width="100%" height="100%" fill="#141a1d"/><text x="12" y="18" fill="#d6e6de" font-family="monospace" font-size="11">${action.id} / ${phase.toFixed(2)}</text></svg>`);
   const tile=await sharp({create:{width:metadata.width,height:metadata.height+28,channels:3,background:'#141a1d'}}).composite([{input:png,left:0,top:0},{input:caption,left:0,top:metadata.height}]).png().toBuffer();
   tiles.push({tile,width:metadata.width,height:metadata.height+28});
  }
  const width=tiles[0].width,height=tiles[0].height;
  const sheet=await sharp({create:{width:width*4,height,channels:3,background:'#141a1d'}}).composite(tiles.map((t,i)=>({input:t.tile,left:i*width,top:0}))).webp({quality:94,effort:5}).toBuffer();
  const name=`sheet-${action.id}.webp`;await fs.writeFile(path.join(output,name),sheet);sheets.push({file:name,action:action.id,bytes:sheet.length,sha256:hash(sheet)});
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const result={schemaVersion:1,iteration,role,label,yaw,phases,viewport,selectedActions:selected.length?selected:'all27',startedAtUtc,finishedAtUtc:new Date().toISOString(),source:frozen,inputs,errors,externalRequests,
 scope:`Rendered stage screenshots, ${viewport.width}×${viewport.height} viewport, four phases per action. Contact sheets concatenate screenshots and add phase labels without modifying the rendered model.`,
 screenshots:shots,sheets,pass:errors.length===0&&externalRequests.length===0&&sheets.length===(selected.length||27)};
await fs.writeFile(path.join(output,'capture.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.pass,role,screenshots:shots.length,sheets:sheets.length,errors,externalRequests}));if(!result.pass)process.exitCode=1;
