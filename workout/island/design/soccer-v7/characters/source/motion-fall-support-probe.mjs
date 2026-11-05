/** Read-only material isolation of the exact packaged eye primitives. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputName=process.env.MOTION_FALL_DIR||'motion-fall-support-final';if(!/^motion-[a-z0-9-]+$/.test(outputName))throw Error('Output must stay under source/motion-*');
const out=path.join(root,'source',outputName),modes=(process.env.MOTION_EYE_MODES||'baseline,cyan-grayscale,cyan-isolated,coat-mask,coat-full,coat-isolated').split(',');
await fs.mkdir(out,{recursive:true});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),frozen=new Map(),inputHashes={};
for(const file of ['vendor/data.js','vendor/viewer-runtime.js','preview.html','preview.css','vendor/three.module.js']){
  const bytes=await fs.readFile(path.join(root,file));frozen.set('/'+file,bytes);inputHashes[file]={bytes:bytes.length,sha256:hash(bytes)};
}
const dataText=frozen.get('/vendor/data.js').toString(),marker='globalThis.SOCCER_V7_DATA=';
const payload=JSON.parse(dataText.slice(dataText.indexOf(marker)+marker.length).trim().replace(/;$/,''));
for(const model of new Set(payload.manifest.characters.flatMap(c=>(c.kits||[c]).flatMap(k=>[k.lod0,k.lod1])))){
  const file='offline/'+path.basename(model,'.glb')+'.js',bytes=await fs.readFile(path.join(root,file));
  frozen.set('/'+file,bytes);inputHashes[file]={bytes:bytes.length,sha256:hash(bytes)};
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))throw Error();res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(frozen.get(url)||await fs.readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5}),errors=[],external=[],rows=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
try{
  await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load'});await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});await page.evaluate(()=>soccerV7.ready);
  await page.evaluate(async({character,lod})=>{soccerV7.setPlaying(false);await soccerV7.setView('body');await soccerV7.setCharacter(character);await soccerV7.setLOD(lod);soccerV7.setClip('fall');for(const actor of soccerV7.inspect().actors)actor.baseYaw=0;const clip=soccerV7.inspect().clipMap.get('fall');soccerV7.seek(.633333/clip.duration);},{character:process.env.MOTION_FALL_CHARACTER||'player-01',lod:process.env.MOTION_FALL_LOD||'0'});
  const observation=await page.evaluate(()=>{
    const {actors,clipMap}=soccerV7.inspect(),a=actors[0];a.refreshFloorRows();const pieces=[];
    for(const piece of a.floorMeshes){
      const vertices=[],{positions:p,joints:j,weights:w,rows:r}=piece;
      for(let i=0;i<piece.count;i++){let y=0;for(let k=0;k<4;k++){const weight=w[i*4+k];if(!weight)continue;const row=j[i*4+k]*4;y+=weight*(r[row]*p[i*3]+r[row+1]*p[i*3+1]+r[row+2]*p[i*3+2]+r[row+3]);}vertices.push({y,index:i,bind:[p[i*3],p[i*3+1],p[i*3+2]],weights:Array.from(w.subarray(i*4,i*4+4)),joints:Array.from(j.subarray(i*4,i*4+4))});}
      vertices.sort((a,b)=>a.y-b.y);const m=Array.isArray(piece.mesh.material)?piece.mesh.material[0]:piece.mesh.material;
      pieces.push({mesh:piece.mesh.name,material:m.name,alphaMasked:m.alphaTest>0,minimumYMeters:vertices[0].y,lowestVertices:vertices.slice(0,12)});
    }
    globalThis.__FallMaterials=[...new Set(a.meshes.flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]))].map(m=>({m,transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,alphaTest:m.alphaTest,alphaToCoverage:m.alphaToCoverage}));
    return{character:a.identity,path:a.path,clip:'fall',seconds:.633333,duration:clipMap.get('fall').duration,phase:.633333/clipMap.get('fall').duration,rootLiftMeters:a.lift,minimumYMeters:a.minimumY(true),pieces};
  });
  for(const view of[{label:'normal',yaw:.45,zoom:1},{label:'side',yaw:1.6,zoom:1},{label:'normal-close',yaw:.45,zoom:.62},{label:'side-close',yaw:1.6,zoom:.62}]){
    await page.evaluate(view=>soccerV7.setOrbit(view.yaw,0,view.zoom),view);
    for(const mode of['normal','xray','solid-alpha']){
      await page.evaluate(mode=>{const {actors,renderer,scene,camera}=soccerV7.inspect();for(const saved of __FallMaterials){const {m,...values}=saved;Object.assign(m,values);if(mode==='xray'){m.transparent=true;m.opacity=.23;m.depthWrite=false;m.alphaTest=0;m.alphaToCoverage=false;}if(mode==='solid-alpha'){m.alphaTest=0;m.alphaToCoverage=false;}m.needsUpdate=true;}actors[0].helper.visible=mode==='xray';renderer.render(scene,camera);},mode);
      const file='fall-0p633333-'+view.label+'-'+mode+'-390x844-dpr1p5.png';await fs.writeFile(path.join(out,file),await page.screenshot({type:'png'}));rows.push({...view,mode,file});
    }
  }
  for(const view of['normal','side','normal-close','side-close']){
    const selected=rows.filter(r=>r.label===view),images=await Promise.all(selected.map(r=>fs.readFile(path.join(out,r.file))));await sharp({create:{width:585*3,height:1266,channels:3,background:'#263238'}}).composite(images.map((input,i)=>({input,left:i*585,top:0}))).webp({quality:95}).toFile(path.join(out,'fall-'+view+'-comparison.webp'));
  }
  await fs.writeFile(path.join(out,'diagnostic.json'),JSON.stringify({schemaVersion:1,viewportCSS:{width:390,height:844},devicePixelRatio:1.5,packedHashes:payload.hashes,inputHashes,errors,external,observation,rows,limits:['Exact packaged runtime/model snapshots served fromRAM; no geometry, motion or packaged files changed.','One exact fall pose; normal/xray/alpha-off views locate cloth versus body support without simulating pressure.']},null,2)+'\n');
  console.log(JSON.stringify({captures:rows.length,errors,external,rootLiftMeters:observation.rootLiftMeters,pieces:observation.pieces.map(p=>({material:p.material,minY:p.minimumYMeters,bind:p.lowestVertices[0].bind})),out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
