// 13/11/2026 fire v23: makes the 2D sprites and backgrounds of the two new fire modes (water targets, inside the building)
// from the island's own 3D assets, so no character is drawn by hand in code (CLAUDE.md: real assets first).
//   node workout/island/verification/fire-v23/sprites/make-sprites.mjs [name...]
// Output: workout/island/assets/fire-v23/*.webp|png, minigames/fire-v23-anchors.mjs (pixel anchors the game reads) and sprites/anchors.json (all measurements).
// Needs Chromium + Playwright (CHROMIUM_PATH, ISLAND_PLAYWRIGHT like the other island browser checks). Codex fire tools are read from
// FIRE_TOOLS_DIR (default: workout/island/design/fire-tools, the PR codex/fire-tools-v1 package).
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPECS,PROBES} from './specs.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../../..'),out=path.resolve(repo,'workout/island/assets/fire-v23');
const toolsDir=process.env.FIRE_TOOLS_DIR||path.join(repo,'workout/island/design/fire-tools');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=p.startsWith('/fire-tools/')?path.join(toolsDir,p.slice(12)):path.join(repo,p);if(!file.startsWith(repo)&&!file.startsWith(toolsDir))throw Error('outside');const data=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.ISLAND_PLAYWRIGHT||'/opt/node-tools/node_modules/playwright/index.mjs');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage();page.on('pageerror',e=>console.log('page error',e.message));
await page.goto(base+'/workout/island/verification/fire-v23/sprites/render.html');await page.waitForFunction(()=>window.ready);
await mkdir(out,{recursive:true});
const only=process.argv.slice(2),anchorsFile=path.join(here,'anchors.json'); // full measurements stay with the generator; the game reads the lean module
let anchors={};try{anchors=JSON.parse(await readFile(anchorsFile,'utf8'));}catch{}
const probeOut=process.env.PROBE_DIR;
for(const spec of probeOut?PROBES:SPECS){
  if(only.length&&!only.some(n=>spec.name.startsWith(n)))continue;
  const result=await page.evaluate(async spec=>{
    const {url,info}=await window.render(spec);
    // crop transparent margins (sprites) and export WebP; anchors move with the crop and the final scale
    const img=new Image();img.src=url;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
    let x0=0,y0=0,x1=img.width,y1=img.height;
    if(spec.trim){const d=g.getImageData(0,0,img.width,img.height).data;x0=img.width;y0=img.height;x1=0;y1=0;for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++)if(d[(y*img.width+x)*4+3]>8){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}const pad=spec.pad??6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(img.width,x1+pad+1);y1=Math.min(img.height,y1+pad+1);}
    const scale=spec.outScale||1,w=Math.round((x1-x0)*scale),h=Math.round((y1-y0)*scale);
    const o=document.createElement('canvas');o.width=w;o.height=h;const og=o.getContext('2d');og.imageSmoothingQuality='high';og.drawImage(c,x0,y0,x1-x0,y1-y0,0,0,w,h);
    const map=p=>[+((p[0]-x0)*scale).toFixed(1),+((p[1]-y0)*scale).toFixed(1)];
    const moved={size:[w,h],frame:[Math.round(img.width*scale),Math.round(img.height*scale)],origin:[+(x0*scale).toFixed(1),+(y0*scale).toFixed(1)],px:Object.fromEntries(Object.entries(info.px).map(([k,v])=>[k,map(v)])),points:Object.fromEntries(Object.entries(info.points).map(([k,v])=>[k,map(v)])),
      windows:Object.fromEntries(Object.entries(info.windowPx).map(([k,list])=>[k,list.map(r=>[...map([r[0],r[1]]),...map([r[2],r[3]])])])),objects:Object.fromEntries(Object.entries(info.objectPx).map(([k,r])=>[k,[...map([r[0],r[1]]),...map([r[2],r[3]])]]))};
    const type=spec.format==='png'?'image/png':'image/webp';return {data:o.toDataURL(type,spec.quality??0.86),moved};
  },spec);
  const file=path.join(probeOut||out,spec.name+(spec.format==='png'?'.png':'.webp'));
  if(probeOut){await writeFile(file,Buffer.from(result.data.split(',')[1],'base64'));continue;}
  await writeFile(file,Buffer.from(result.data.split(',')[1],'base64'));
  anchors[spec.name]={file:path.basename(file),...result.moved};
  console.log(spec.name,result.moved.size.join('x'),(Buffer.from(result.data.split(',')[1],'base64').length/1024).toFixed(0)+'KB');
}
/** Apartment window grid (rows from the ground up, columns from the left) from the detected glass: rays miss panes hidden by railings,
 * so the full 4x3 grid is rebuilt from the column and row spans that were seen. */
function grid(rects){
  const merge=spans=>{spans=[...spans].sort((a,b)=>a[0]-b[0]);const out=[];for(const s of spans){const last=out.at(-1);if(last&&s[0]<=last[1]){last[0]=Math.min(last[0],s[0]);last[1]=Math.max(last[1],s[1]);}else out.push([...s]);}return out;};
  const cols=merge(rects.map(r=>[r[0],r[2]])),rows=merge(rects.map(r=>[r[1],r[3]])).reverse(),g={};
  rows.forEach((ry,ri)=>cols.forEach((cx,ci)=>{g['w'+(ri+1)+(ci+1)]=[cx[0],ry[0],cx[1],ry[1]].map(v=>+v.toFixed(1));}));return g;
}
if(anchors.street?.windows?.apartment)anchors.street.grid=grid(anchors.street.windows.apartment);
await writeFile(anchorsFile,JSON.stringify(anchors,null,1)+'\n');
// The game reads the anchors from a module (no JSON import needed on older phones). Generated: do not edit by hand.
const keep=({file,size,frame,origin,points,px,grid})=>({file,size,...(frame?{frame}:{}),...(origin?{origin}:{}),...(points&&Object.keys(points).length?{points}:{}),...(px&&Object.keys(px).length?{px}:{}),...(grid?{grid}:{})});
const lean=Object.fromEntries(Object.entries(anchors).filter(([k])=>!k.startsWith('probe')).map(([k,v])=>[k,keep(v)]));
await writeFile(path.join(repo,'workout/island/minigames/fire-v23-anchors.mjs'),'// 13/11/2026 fire v23: pixel anchors of the sprites in assets/fire-v23, written by verification/fire-v23/sprites/make-sprites.mjs. Do not edit by hand.\nexport const FIRE_V23_ANCHORS=Object.freeze('+JSON.stringify(lean)+');\n');
await browser.close();server.close();
