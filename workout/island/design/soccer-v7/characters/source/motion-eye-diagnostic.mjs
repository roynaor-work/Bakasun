/** Read-only material isolation of the exact packaged eye primitives. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputName=process.env.MOTION_EYE_DIR||'motion-eye-review15';if(!/^motion-[a-z0-9-]+$/.test(outputName))throw Error('Output must stay under source/motion-*');
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
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1}),errors=[],external=[],rows=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
try{
  await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load'});await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});await page.evaluate(()=>soccerV7.ready);
  await page.evaluate(async()=>{globalThis.__EyeTHREE=await import('/vendor/three.module.js');soccerV7.setPlaying(false);await soccerV7.setView('face');await soccerV7.setLOD('0');soccerV7.setClip('idle');soccerV7.seek(.1);});
  for(const character of (process.env.MOTION_EYE_CHARACTERS||'player-01,player-02,goalkeeper').split(',').filter(id=>payload.manifest.characters.some(c=>c.id===id))){
    await page.evaluate(async id=>{await soccerV7.setCharacter(id);soccerV7.setClip('idle');soccerV7.seek(.1);},character);
    const metadata=await page.evaluate(()=>{
      const {actors,scene}=soccerV7.inspect(),a=actors[0];
      const texture=t=>t?{name:t.name,uuid:t.uuid,channel:t.channel,flipY:t.flipY,wrapS:t.wrapS,wrapT:t.wrapT,colorSpace:t.colorSpace,imageWidth:t.image?.width,imageHeight:t.image?.height}:null;
      globalThis.__eyeOriginal=a.meshes.map(mesh=>({mesh,visible:mesh.visible,material:mesh.material}));globalThis.__eyeNewMaterials=[];
      return {materials:a.meshes.map(mesh=>{const m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;return {mesh:mesh.name,material:m.name,type:m.type,color:m.color?.getHexString(),roughness:m.roughness,metalness:m.metalness,specularIntensity:m.specularIntensity,clearcoat:m.clearcoat,clearcoatRoughness:m.clearcoatRoughness,envMapIntensity:m.envMapIntensity,map:texture(m.map),normalMap:texture(m.normalMap),clearcoatMap:texture(m.clearcoatMap),clearcoatRoughnessMap:texture(m.clearcoatRoughnessMap)};}),environment:{type:scene.environment?.type,imageWidth:scene.environment?.image?.width,imageHeight:scene.environment?.image?.height},lights:scene.children.filter(n=>n.isLight).map(n=>({type:n.type,intensity:n.intensity,color:n.color.getHexString(),position:n.position.toArray()}))};
    });
    for(const angle of [0,.45]){
      await page.evaluate(angle=>soccerV7.setOrbit(angle),angle);
      for(const mode of modes){
        const geometry=await page.evaluate(mode=>{
          const {actors,renderer,scene,camera}=soccerV7.inspect(),THREE=globalThis.__EyeTHREE;
          // Constructor access comes from actual materials, so no new module
          // instance or patched source enters this rendering diagnostic.
          const a=actors[0],eyeEntry=__eyeOriginal.find(v=>(Array.isArray(v.material)?v.material[0]:v.material).name==='Eyes');
          if(!eyeEntry)throw Error('No Eyes primitive');
          const eyeOriginal=Array.isArray(eyeEntry.material)?eyeEntry.material[0]:eyeEntry.material;
          for(const entry of __eyeOriginal){
            const original=Array.isArray(entry.material)?entry.material[0]:entry.material;
            entry.mesh.material=entry.material;entry.mesh.visible=entry.visible;
            if(mode==='baseline')continue;
            if(original.name==='Eyes'){
              const m=mode.startsWith('cyan')||mode.startsWith('mask')?new THREE.MeshBasicMaterial({color:mode.startsWith('cyan')?0x00ffff:0xffffff,side:eyeOriginal.side,toneMapped:false}):eyeOriginal.clone();m.map=null;m.normalMap=null;m.clearcoatNormalMap=null;m.emissive?.set(0);m.emissiveIntensity=0;m.metalness=0;m.roughness=1;m.specularIntensity=0;m.specularColor?.set(0);m.color.set(mode.startsWith('cyan')?0x00ffff:mode.startsWith('mask')?0xffffff:0);m.clearcoat=mode.startsWith('coat')?1:0;m.clearcoatRoughness=.04;m.clearcoatRoughnessMap=null;m.clearcoatMap=mode==='coat-mask'?eyeOriginal.clearcoatMap:null;
              
              if(mode.startsWith('mask')){m.map=eyeOriginal.clearcoatMap;m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec4 maskSample=texture2D(map,vMapUv);diffuseColor*=vec4(maskSample.rrr,1.0);\n#endif');};m.customProgramCacheKey=()=>'diagnostic-mask-red-only';}m.needsUpdate=true;entry.mesh.material=m;__eyeNewMaterials.push(m);
            }else if(mode==='cyan-isolated'||mode==='coat-isolated'||mode==='mask-isolated')entry.mesh.visible=false;
            else{const m=new THREE.MeshBasicMaterial({color:0x555555,side:original.side,toneMapped:false,alphaTest:original.alphaTest,transparent:original.transparent,opacity:original.opacity});m.needsUpdate=true;entry.mesh.material=m;__eyeNewMaterials.push(m);}
          }
          renderer.render(scene,camera);
          return {eyeMesh:eyeEntry.mesh.name,eyeGeometryVertices:eyeEntry.mesh.geometry.attributes.position.count,mode,
            maskPresent:Boolean(eyeOriginal.clearcoatMap),cameraPosition:camera.position.toArray(),cameraFov:camera.fov};
        },mode);
        const bytes=await page.screenshot({type:'png'}),file=character+'-'+(angle===0?'front':'three-quarter')+'-'+mode+'-390x844.png';
        await fs.writeFile(path.join(out,file),bytes);
        const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});let cyanPixels=0,brightPixels=0,cyanBounds=[Infinity,Infinity,-Infinity,-Infinity];
        for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*3,r=data[i],g=data[i+1],b=data[i+2];if(g-r>45&&b-r>45&&g>150){cyanPixels++;cyanBounds=[Math.min(cyanBounds[0],x),Math.min(cyanBounds[1],y),Math.max(cyanBounds[2],x),Math.max(cyanBounds[3],y)];}if(r>180&&g>180&&b>180)brightPixels++;}
        rows.push({character,angle,mode,file,metadata,geometry,cyanPixels,cyanBounds:cyanPixels?cyanBounds:null,brightPixels});
      }
    }
    await page.evaluate(()=>{for(const entry of __eyeOriginal){entry.mesh.material=entry.material;entry.mesh.visible=entry.visible;}for(const material of __eyeNewMaterials)material.dispose();});
  }
  for(const character of [...new Set(rows.map(r=>r.character))])for(const angle of [0,.45]){
    const selected=rows.filter(r=>r.character===character&&r.angle===angle),inputs=await Promise.all(selected.map(r=>fs.readFile(path.join(out,r.file))));
    await sharp({create:{width:390*selected.length,height:844,channels:3,background:'#263238'}}).composite(inputs.map((input,i)=>({input,left:i*390,top:0}))).webp({quality:94}).toFile(path.join(out,character+'-'+(angle===0?'front':'three-quarter')+'-comparison.webp'));
  }
  await fs.writeFile(path.join(out,'diagnostic.json'),JSON.stringify({schemaVersion:1,viewport:{width:390,height:844},packedHashes:payload.hashes,inputHashes,errors,external,rows,modes,limits:['Diagnostic material overrides in page memory only; no packaged files changed.','Cyan and gray identification use local r160 MeshBasicMaterial; original Eyes physical material is cloned only for clearcoat isolation.','Mask views show the actual clearcoatMap red channel with its original UV transform.','Black base suppresses base specular and keeps clearcoat only. Whole-frame bright-pixel counts are descriptive; highlight location requires visual review.']},null,2)+'\n');
  console.log(JSON.stringify({captures:rows.length,errors,external,cyan:rows.filter(r=>r.mode.startsWith('cyan')).map(r=>({character:r.character,angle:r.angle,mode:r.mode,pixels:r.cyanPixels,bounds:r.cyanBounds})),out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
