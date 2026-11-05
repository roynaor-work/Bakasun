/** Read-only material isolation of the exact packaged eye primitives. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputName=process.env.MOTION_EYE_DIR||'motion-eye-height-review15';if(!/^motion-[a-z0-9-]+$/.test(outputName))throw Error('Output must stay under source/motion-*');
const out=path.join(root,'source',outputName),modes=(process.env.MOTION_EYE_MODES||'baseline,cyan-grayscale,cyan-isolated,coat-mask,coat-full,coat-isolated').split(',');
await fs.mkdir(out,{recursive:true});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),frozen=new Map(),inputHashes={};
for(const file of ['vendor/data.js','vendor/viewer-runtime.js','preview.html','preview.css','vendor/three.module.js','source/scene.js']){
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
  const setup=await page.evaluate(async()=>{
    const THREE=await import('/vendor/three.module.js');globalThis.__HeightTHREE=THREE;
    soccerV7.setPlaying(false);await soccerV7.setView('face');await soccerV7.setLOD('0');soccerV7.setClip('idle');soccerV7.seek(.1);
    const {scene,renderer}=soccerV7.inspect(),heights=[.15,-.45,-.9,-1.35],targets=[];
    globalThis.__OriginalEnvironment=scene.environment;
    const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileCubemapShader();
    const allPanels=[];
    for(const height of heights){
      const reflection=new THREE.Scene();reflection.background=new THREE.Color(.15,.17,.20);
      const geometry=new THREE.PlaneGeometry(1,1),materials=[],panels=[
        {p:[-3.6,3.1,3.5],s:[3.3,4.6],rgb:[5.2,4.6,3.9]},
        {p:[4.2,2.7,1.8],s:[2.2,3.8],rgb:[1.8,2.2,2.9]},
        {p:[2.5,4,-3.7],s:[2.3,4.2],rgb:[3.7,4.3,5.3]},
        {p:[0,7,0],s:[5,5],rgb:[1.5,1.7,2]},
        {p:[.7,height,4],s:[.8,.8],rgb:[8,7.84,7.6],front:true}
      ];
      for(const spec of panels){const material=new THREE.MeshBasicMaterial({color:new THREE.Color(...spec.rgb),side:THREE.DoubleSide,toneMapped:false});materials.push(material);const panel=new THREE.Mesh(geometry,material);panel.position.fromArray(spec.p);panel.scale.set(...spec.s,1);panel.lookAt(0,spec.front?0:1,0);reflection.add(panel);}
      const target=pmrem.fromScene(reflection,0,.1,35);targets.push(target);allPanels.push(panels);geometry.dispose();materials.forEach(m=>m.dispose());
    }
    pmrem.dispose();globalThis.__HeightTargets=targets;
    return {heights,allPanels,sigma:0,frontStrength:8,eyeEnvMapIntensity:1,targets:targets.map(t=>({width:t.width,height:t.height,type:t.texture.type})),renderer:{pixelRatio:renderer.getPixelRatio(),width:renderer.domElement.width,height:renderer.domElement.height,exposure:renderer.toneMappingExposure,toneMapping:renderer.toneMapping}};
  });
  for(const character of ['player-01','player-02','player-04','goalkeeper']){
    await page.evaluate(async id=>{await soccerV7.setCharacter(id);soccerV7.setClip('idle');soccerV7.seek(.1);for(const mesh of soccerV7.inspect().actors[0].meshes){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.name==='Eyes')m.envMapIntensity=1;}},character);
    for(const angle of [0,.16,.45]){
      await page.evaluate(angle=>soccerV7.setOrbit(angle),angle);
      for(let index=0;index<4;index++){
        const state=await page.evaluate(index=>{const {scene,renderer,camera,actors}=soccerV7.inspect();scene.environment=__HeightTargets[index].texture;renderer.render(scene,camera);return {camera:camera.position.toArray(),fov:camera.fov,environmentUUID:scene.environment.uuid,eyes:actors[0].meshes.map(mesh=>Array.isArray(mesh.material)?mesh.material[0]:mesh.material).filter(m=>m.name==='Eyes').map(m=>({type:m.type,envMapIntensity:m.envMapIntensity,clearcoat:m.clearcoat,clearcoatRoughness:m.clearcoatRoughness,maskPresent:Boolean(m.clearcoatMap)}))};},index);
        const file=character+'-angle'+String(angle).replace('.','p')+'-height'+String(setup.heights[index]).replace('-','minus').replace('.','p')+'-390x844-dpr1p5.png';
        const bytes=await page.screenshot({type:'png'});await fs.writeFile(path.join(out,file),bytes);rows.push({character,angle,height:setup.heights[index],index,file,state});
      }
    }
  }
  for(const character of ['player-01','player-02','player-04','goalkeeper'])for(const angle of [0,.16,.45]){
    const selected=rows.filter(r=>r.character===character&&r.angle===angle),images=await Promise.all(selected.map(r=>fs.readFile(path.join(out,r.file))));
    await sharp({create:{width:585*4,height:1266,channels:3,background:'#263238'}}).composite(images.map((input,i)=>({input,left:i*585,top:0}))).webp({quality:96}).toFile(path.join(out,character+'-angle'+String(angle).replace('.','p')+'-comparison.webp'));
  }
  await fs.writeFile(path.join(out,'diagnostic.json'),JSON.stringify({schemaVersion:1,viewportCSS:{width:390,height:844},devicePixelRatio:1.5,setup,packedHashes:payload.hashes,inputHashes,errors,external,rows,limits:['All model/material/decoder/runtime responses frozen in RAM; no packaged files changed.','Only front generated reflection-pane Y differs. Four PMREM targets are reused across all4 identities.','Actual eye PhysicalMaterial, corneal mask, other reflection panes and direct lights are retained.','Paused software-WebGL phone captures, not physical-device performance.']},null,2)+'\n');
  await page.evaluate(()=>{const {scene}=soccerV7.inspect();scene.environment=__OriginalEnvironment;__HeightTargets.forEach(t=>t.dispose());});
  console.log(JSON.stringify({captures:rows.length,errors,external,setup,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
