import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_MODULE||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const checks=[],ids=new Set(manifest.assets.map(a=>a.id));
assert.equal(ids.size,27);assert.equal(manifest.text.baked,false);
for(const a of manifest.assets){
 assert.equal(a.anchor.length,2);assert(a.anchor.every(n=>n>=0&&n<=1));
 assert.deepEqual(a.variants.map(v=>v.width),[512,1024]);
 if(a.textRegions)for(const r of Object.values(a.textRegions))assert(r[0]>=0&&r[1]>=0&&r[0]+r[2]<=512&&r[1]+r[3]<=512);
 for(const v of a.variants){
  const buffer=await readFile(path.join(root,v.file)),meta=await sharp(buffer).metadata();
  assert(buffer.length<1000000,`${v.file}: >1MB`);assert.equal(v.bytes,buffer.length);
  assert.equal(createHash('sha256').update(buffer).digest('hex'),v.sha256);
  assert.equal(meta.format,'png');assert.equal(meta.width,v.width);assert.equal(meta.height,v.width);
  assert(meta.hasAlpha);assert.equal(meta.channels,4);assert.equal(meta.space,'srgb');
  const {data,info}=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height;let clear=0,opaque=0,partial=0,minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const alpha=data[(y*w+x)*4+3];if(!alpha)clear++;else{minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(alpha>=250)opaque++;if(alpha<255)partial++;}
   if(x===0||y===0||x===w-1||y===h-1)assert.equal(alpha,0,`${v.file}: clipped image edge`);
  }
  // Resampling a generated source may round solid alpha to 254. Check visible,
  // near-opaque artwork independently from the strictly transparent outer edge.
  assert(clear>w*h*.18,`${v.file}: missing transparent background`);assert(opaque>0,`${v.file}: artwork has no near-opaque content`);assert(partial>0,`${v.file}: missing antialiasing`);
  assert.deepEqual(v.alphaBounds,[minX,minY,maxX-minX+1,maxY-minY+1]);
  checks.push({file:v.file,dimensions:[w,h],bytes:buffer.length,channels:4,transparent:true,unclipped:true,sha256Matches:true});
 }
}
for(const [name,animation] of Object.entries(manifest.animations)){
 assert(animation.frames.length>=4,name);
 for(const f of animation.frames){assert(ids.has(f.asset));assert(f.durationMs>0);}
 const anchors=animation.frames.map(f=>manifest.assets.find(a=>a.id===f.asset).anchor);
 anchors.forEach(a=>assert.deepEqual(a,anchors[0],`${name}: anchor drifts`));
}
assert.deepEqual(manifest.animations.countdown.frames.map(f=>f.value),['3','2','1','צאו!']);
assert.deepEqual(manifest.assets.find(a=>a.id==='start-lights-green').lightState,[false,false,false,true]);
for(const filename of await readdir(path.join(root,'source','svg'))){
 const source=await readFile(path.join(root,'source','svg',filename),'utf8');
 assert(!/<(?:text|tspan|foreignObject|image)\b/i.test(source),`${filename}: unexpected text/image content`);
}
const report={passed:true,assets:ids.size,pngs:checks.length,totalBytes:checks.reduce((n,c)=>n+c.bytes,0),maxBytes:Math.max(...checks.map(c=>c.bytes)),limitBytes:1000000,animations:Object.fromEntries(Object.entries(manifest.animations).map(([k,a])=>[k,{frames:a.frames.length,durationMs:a.frames.reduce((n,f)=>n+f.durationMs,0),loop:a.loop,stableAnchors:true}])),checks};
await writeFile(path.join(root,'verification','assets.json'),JSON.stringify(report,null,2)+'\n');
// Text-free thumbnail sheet. Individual full-resolution sources remain in png/1024/.
const columns=6,tile=192,rows=Math.ceil(manifest.assets.length/columns);
const items=await Promise.all(manifest.assets.map(async(a,i)=>({input:await sharp(path.join(root,a.variants[1].file)).resize(tile,tile).png().toBuffer(),left:(i%columns)*tile,top:Math.floor(i/columns)*tile})));
await sharp({create:{width:columns*tile,height:rows*tile,channels:4,background:'#D9E5DF'}}).composite(items).webp({quality:88}).toFile(path.join(root,'verification','contact-sheet.webp'));
console.log(JSON.stringify({...report,checks:undefined},null,2));
