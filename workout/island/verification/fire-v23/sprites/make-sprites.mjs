// 13/11/2026 fire v23: makes the 2D sprites and backgrounds of the two new fire modes (water targets, inside the building) from 3D assets,
// so no character is drawn by hand in code (CLAUDE.md: real assets first) and the phone only downloads light pictures.
//   node workout/island/verification/fire-v23/sprites/make-sprites.mjs [name-prefix...]
// Output: workout/island/assets/fire-v23/*.webp|png, minigames/fire-v23-anchors.mjs (pixel anchors the game reads) and sprites/anchors.json
// (all measurements). The Codex packs are read from FIRE_DESIGN_DIR (default workout/island/design: fire-building-v1, fire-rooms-v1,
// fire-rescue-v1, fire-tools), served as /design/. Needs Chromium + Playwright (CHROMIUM_PATH, ISLAND_PLAYWRIGHT).
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPECS} from './specs.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../../..'),out=path.resolve(repo,'workout/island/assets/fire-v23');
const design=path.resolve(process.env.FIRE_DESIGN_DIR||path.join(repo,'workout/island/design'));
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=p.startsWith('/design/')?path.join(design,p.slice(8)):path.join(repo,p);
  if(!file.startsWith(repo)&&!file.startsWith(design))throw Error('outside');const data=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.ISLAND_PLAYWRIGHT||'/opt/node-tools/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage();page.on('pageerror',e=>console.log('page error',e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))console.log('console',m.text().slice(0,200));});page.on('response',r=>{if(r.status()>=400)console.log('missing',r.status(),r.url().replace(base,''));});
await page.goto(base+'/workout/island/verification/fire-v23/sprites/render.html');await page.waitForFunction(()=>window.ready);
await mkdir(out,{recursive:true});
const only=process.argv.slice(2),anchorsFile=path.join(here,'anchors.json'); // full measurements stay with the generator; the game reads the lean module
let anchors={};try{anchors=JSON.parse(await readFile(anchorsFile,'utf8'));}catch{}
const save=async(name,dataUrl)=>{const buf=Buffer.from(dataUrl.split(',')[1],'base64');await writeFile(path.join(out,name),buf);return buf.length;};
for(const spec of SPECS){
  if(only.length&&!only.some(n=>spec.name.startsWith(n)))continue;
  const result=await page.evaluate(async spec=>{
    const {url,info}=await window.render(spec);
    const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    if(info.frames){return {data:c.toDataURL('image/webp',spec.quality??.9),moved:{size:[img.width,img.height],frames:info.frames,points:info.points},overlays:{}};}
    let x0=0,y0=0,x1=img.width,y1=img.height;
    if(spec.trim){const d=g.getImageData(0,0,img.width,img.height).data;x0=img.width;y0=img.height;x1=0;y1=0;for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++)if(d[(y*img.width+x)*4+3]>8){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}const pad=spec.pad??6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(img.width,x1+pad+1);y1=Math.min(img.height,y1+pad+1);}
    const w=x1-x0,h=y1-y0,o=document.createElement('canvas');o.width=w;o.height=h;o.getContext('2d').drawImage(c,x0,y0,w,h,0,0,w,h);
    const type=spec.format==='png'?'image/png':'image/webp';
    return {data:o.toDataURL(type,spec.quality??0.86),moved:{size:[w,h],frame:[img.width,img.height],origin:[x0,y0],points:info.points,boxes:info.boxes},overlays:info.overlays||{}};
  },spec);
  const file=spec.name+(spec.format==='png'?'.png':'.webp'),bytes=await save(file,result.data),entry={file,...result.moved};
  if(Object.keys(result.overlays).length){entry.overlays={};for(const [name,o] of Object.entries(result.overlays)){if(!o){entry.overlays[name]=null;continue;}const f=`${spec.name}-${name}.webp`;await save(f,o.url);entry.overlays[name]={file:f,origin:o.origin,size:o.size};}}
  anchors[spec.name]=entry;
  console.log(spec.name,entry.size.join('x'),(bytes/1024).toFixed(0)+'KB',entry.overlays?Object.keys(entry.overlays).length+' overlays':'',entry.frames?entry.frames.count+' frames':'');
}
await writeFile(anchorsFile,JSON.stringify(anchors,null,1)+'\n');
// The game reads the anchors from a module (no JSON import needed on older phones). Generated: do not edit by hand.
const keep=({file,size,frame,origin,points,boxes,overlays,frames})=>({file,size,...(frame?{frame}:{}),...(origin?{origin}:{}),...(points&&Object.keys(points).length?{points}:{}),...(boxes&&Object.keys(boxes).length?{boxes}:{}),...(overlays?{overlays}:{}),...(frames?{frames:{count:frames.count,cell:frames.cell,origin:frames.origin}}:{})});
const lean=Object.fromEntries(Object.entries(anchors).filter(([k])=>SPECS.some(s=>s.name===k)).map(([k,v])=>[k,keep(v)]));
await writeFile(path.join(repo,'workout/island/minigames/fire-v23-anchors.mjs'),'// 13/11/2026 fire v23: pixel anchors of the sprites in assets/fire-v23, written by verification/fire-v23/sprites/make-sprites.mjs. Do not edit by hand.\nexport const FIRE_V23_ANCHORS=Object.freeze('+JSON.stringify(lean)+');\n');
await browser.close();server.close();
