// CC0. Run: node source/verify.mjs [--capture] [--origin http://127.0.0.1:8765]
// Tool modules can live outside the repo: ALPINE_VALIDATOR=/tmp/.../gltf-validator
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.ISLAND_PLAYWRIGHT||'playwright'),validator=require(process.env.ALPINE_VALIDATOR||'/tmp/alpine-content-tools/node_modules/gltf-validator');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const args=process.argv.slice(2),origin=args.includes('--origin')?args[args.indexOf('--origin')+1]:'http://127.0.0.1:8765',url=origin+'/workout/island/design/alpine-content-v1/preview.html';
const sha=b=>createHash('sha256').update(b).digest('hex');
const records=[];
for(const a of manifest.assets){
  const bytes=await fs.readFile(path.join(root,a.glb));assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.length,bytes.readUInt32LE(8));
  const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);
  const result=await validator.validateBytes(new Uint8Array(bytes),{uri:a.glb,maxIssues:0});
  assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues));assert.equal(result.issues.numWarnings,0,JSON.stringify(result.issues));
  assert.equal(doc.extensionsRequired?.length||0,0);assert.ok(doc.buffers.every(b=>!b.uri));assert.equal(doc.images?.length||0,0);
  function values(index){const acc=doc.accessors[index],view=doc.bufferViews[acc.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[acc.type];assert.equal(acc.componentType,5126);const out=[];for(let i=0;i<acc.count*width;i++)out.push(bin.readFloatLE((view.byteOffset||0)+(acc.byteOffset||0)+i*4));assert.ok(out.every(Number.isFinite));return out;}
  let triangles=0,maxNormalError=0;const points=[];
  for(const node of doc.nodes)if(node.mesh!==undefined){const translate=node.translation||[0,0,0];assert.ok(!node.matrix&&!node.rotation&&!node.scale,'static bounds expect identity pose');for(const primitive of doc.meshes[node.mesh].primitives){assert.equal(primitive.mode??4,4);assert.equal(primitive.indices,undefined);const pos=values(primitive.attributes.POSITION),normal=values(primitive.attributes.NORMAL);assert.equal(pos.length,normal.length);triangles+=pos.length/9;
    for(let i=0;i<normal.length;i+=3){maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(...normal.slice(i,i+3))-1));points.push(pos.slice(i,i+3).map((v,k)=>v+translate[k]));}
    for(let i=0;i<pos.length;i+=9){const v=pos.slice(i,i+9),u=[v[3]-v[0],v[4]-v[1],v[5]-v[2]],w=[v[6]-v[0],v[7]-v[1],v[8]-v[2]],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];assert.ok(Math.hypot(...n)>1e-10,`${a.id}: degenerate face`);assert.ok(n.reduce((s,v,k)=>s+v*normal[i+k],0)>0,`${a.id}: normal/winding mismatch`);}
  }}
  assert.equal(triangles,a.triangles);assert.ok(maxNormalError<1e-5);if(a.category!=='effect')assert.ok(triangles>=100&&triangles<=600);
  const bounds={min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))};
  for(const side of ['min','max'])for(let k=0;k<3;k++)assert.ok(Math.abs(bounds[side][k]-a.bounds[side][k])<1e-4,`${a.id}: bounds mismatch`);
  assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);
  const animations=[];for(const animation of doc.animations||[]){let duration=0;for(const channel of animation.channels){const sampler=animation.samplers[channel.sampler],times=values(sampler.input),output=values(sampler.output);assert.equal(times[0],0);assert.ok(times.every((v,i)=>i===0||v>times[i-1]));assert.equal(output.length,times.length*(channel.target.path==='rotation'?4:3));duration=Math.max(duration,times.at(-1));if(channel.target.path==='rotation')for(let i=0;i<output.length;i+=4)assert.ok(Math.abs(Math.hypot(...output.slice(i,i+4))-1)<1e-5);}animations.push({name:animation.name,durationSeconds:duration,channels:animation.channels.length});}
  assert.deepEqual(animations.map(a=>a.name),a.clips.map(a=>a.name));
  records.push({id:a.id,triangles,bytes:bytes.length,bounds,maxNormalError,animations,khronos:{errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos,hints:result.issues.numHints}});
}
assert.equal(manifest.assets.filter(a=>a.category==='obstacle').length,12);assert.equal(manifest.assets.filter(a=>a.category==='bonus').length,8);assert.equal(manifest.assets.filter(a=>a.category==='enemy').length,4);assert.equal(manifest.assets.filter(a=>a.category==='effect').length,4);
const browser=await chromium.launch({executablePath:process.env.ALPINE_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1}),page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))requests.push(r.url());});
await page.goto(url+(args.includes('--capture')?'?capture=1':''));await page.waitForFunction(()=>document.documentElement.dataset.ready==='true',{timeout:60000});
if(args.includes('--capture'))for(const a of manifest.assets){const data=await page.evaluate(id=>window.alpinePreview.capture(id),a.id);await fs.writeFile(path.join(root,a.png),Buffer.from(data.split(',')[1],'base64'));}
await page.goto(url);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
const layouts=[];
for(const viewport of [{width:844,height:390},{width:390,height:844},{width:1440,height:900}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>window.alpinePreview.scene());
  for(let theme=0;theme<6;theme++){await page.evaluate(theme=>window.alpinePreview.setTheme(theme),theme);await page.waitForTimeout(70);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.evaluate(()=>window.alpinePreview.setTheme(0));await page.screenshot({path:path.join(root,`verification/preview-${viewport.width}x${viewport.height}.png`)});layouts.push({...viewport,noHorizontalOverflow:true});
}
await page.setViewportSize({width:844,height:390});
await page.evaluate(()=>window.alpinePreview.selectAsset('falling-tree'));const envelope=manifest.assets.find(a=>a.id==='falling-tree').animationBounds;
for(let t=0;t<=1.301;t+=.1){const bounds=await page.evaluate(t=>window.alpinePreview.boundsAt(t),t);for(let k=0;k<3;k++){assert.ok(bounds.min[k]>=envelope.min[k]);assert.ok(bounds.max[k]<=envelope.max[k]);}}
const inspected=[];
for(const a of manifest.assets){await page.evaluate(id=>window.alpinePreview.selectAsset(id),a.id);for(const dt of [.01,.24,.6])await page.evaluate(dt=>window.alpinePreview.step(dt),dt);assert.equal(await page.locator('#asset-title').textContent(),a.name);assert.equal(await page.locator('#glb-link').getAttribute('href'),a.glb);inspected.push(a.id);}
const effectStats=await page.evaluate(()=>window.alpinePreview.runtimeTest());for(let i=0;i<3;i++){assert.ok(effectStats[i].particles>0);assert.ok(effectStats[i].particles<=[24,48,96][i]);assert.ok(effectStats[i].trailSegments<=56);}
await page.evaluate(()=>window.alpinePreview.scene());await page.locator('#motion').click();await page.waitForTimeout(450);assert.equal((await page.evaluate(()=>window.alpinePreview.state())).playing,true);await page.locator('#motion').click();
await page.locator('#category').selectOption('enemy');assert.equal(await page.locator('.asset-row').count(),4);await page.locator('[data-asset="deer"]').click();assert.equal(await page.locator('#asset-title').textContent(),'צבי');await page.screenshot({path:path.join(root,'verification/deer-844x390.png')});
// Reduced motion starts paused; it never auto-plays on load.
await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');assert.equal((await page.evaluate(()=>window.alpinePreview.state())).playing,false);
assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await browser.close();
const report={validatorVersion:validator.version(),glbCount:records.length,khronosErrors:0,khronosWarnings:0,records,browser:{engine:'Chromium / SwiftShader',layouts,inspected,effectStats,controls:true,reducedMotionStartsPaused:true,externalRequests:requests,errors}};
await fs.writeFile(path.join(root,'verification/validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({glbCount:records.length,khronosErrors:0,khronosWarnings:0,layouts,effectStats,browserErrors:errors},null,2));
