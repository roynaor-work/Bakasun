/** Read-only actual-viewer floor-peak and opaque/alpha geometry diagnostics. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright'), sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputName = process.env.MOTION_DIAGNOSTIC_DIR || 'motion-floor-review12';
if (!/^motion-[a-z0-9-]+$/.test(outputName)) throw Error('Output must remain in source/motion-*');
const output = path.join(root,'source',outputName); await fs.mkdir(output,{recursive:true});
const inputHashes = {};
for (const file of ['animations.json','asset-manifest.json','source/motion-runtime.js','vendor/data.js','vendor/viewer-runtime.js']) {
  const bytes = await fs.readFile(path.join(root,file));
  inputHashes[file] = {bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
// An author can review un-packaged poses without modifying the frozen gallery
// scripts that another audit is using. Both replacement responses stay in RAM.
const authoringOverride = process.env.MOTION_AUTHORING_OVERRIDE === '1';
const responseOverrides = new Map();
const overrideHashes = {};
if (authoringOverride) {
  const packed = await fs.readFile(path.join(root,'vendor/data.js'),'utf8');
  const marker = 'globalThis.SOCCER_V7_DATA=';
  const payload = JSON.parse(packed.slice(packed.indexOf(marker)+marker.length).trim().replace(/;$/, ''));
  payload.motion = JSON.parse(await fs.readFile(path.join(root,'animations.json'),'utf8'));
  payload.hashes.motion = inputHashes['animations.json'].sha256;
  payload.hashes.motionRuntime = inputHashes['source/motion-runtime.js'].sha256;
  payload.floor = null;
  const dataResponse = '/* Diagnostic in-memory authoring override; no disk mutation. */\nglobalThis.SOCCER_V7_DATA='+JSON.stringify(payload)+';\n';
  const authorRequire = createRequire(process.env.SOCCER_V7_TOOLS||'/tmp/soccer-v7-tools/package.json');
  const {build} = authorRequire('esbuild');
  const bundle = await build({entryPoints:[path.join(root,'preview.js')],write:false,bundle:true,format:'iife',target:['es2020'],minify:true,legalComments:'eof',alias:{three:path.join(root,'vendor/three.module.js')},logLevel:'silent'});
  responseOverrides.set('/vendor/data.js', Buffer.from(dataResponse));
  responseOverrides.set('/vendor/viewer-runtime.js', Buffer.from(bundle.outputFiles[0].contents));
  for(const file of new Set(payload.manifest.characters.flatMap(character=>(character.kits||[character]).flatMap(kit=>[kit.lod0,kit.lod1])))){
    const url='/offline/'+path.basename(file,'.glb')+'.js';
    responseOverrides.set(url,await fs.readFile(path.join(root,url.slice(1))));
  }
  for(const [url,bytes] of responseOverrides) overrideHashes[url]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(request,response)=>{
  try{const url=new URL(request.url,'http://localhost').pathname,file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))throw Error();
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});response.end(responseOverrides.get(url)||await fs.readFile(file));
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[],external=[],rows=[],captures=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
try{
  await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load'});
  await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});await page.evaluate(()=>soccerV7.ready);
  await page.evaluate(async()=>{soccerV7.setPlaying(false);await soccerV7.setView('body');await soccerV7.setLOD('0');soccerV7.setOrbit(.45);});
  const inventory=await page.evaluate(()=>({hashes:soccerV7.inspect().data.hashes,characters:soccerV7.inspect().data.manifest.characters.map(c=>({id:c.id,role:c.role}))}));
  for(const id of ['get_up','slide_tackle','keeper_dive_left','keeper_dive_right','keeper_dive_high']){
    const character=inventory.characters.find(c=>c.role===(id.startsWith('keeper_')?'goalkeeper':'field'));
    await page.evaluate(async({id,character})=>{await soccerV7.setCharacter(character);soccerV7.setClip(id);soccerV7.setOrbit(.45);}, {id,character:character.id});
    const sweep=await page.evaluate(()=>{
      const api=soccerV7,{renderer,clipMap,actors}=api.inspect(),a=actors[0],clip=clipMap.get(api.state().clipID),originalRender=renderer.render;
      const sample=[];
      renderer.render=()=>{};
      try{for(let i=0;i<=Math.round(clip.duration*30);i++){
        a.baseYaw=0;api.seek(i/Math.round(clip.duration*30));
        sample.push({phase:i/Math.round(clip.duration*30),seconds:i/30,lift:a.lift,minimumY:a.minimumY(true)});
      }}finally{renderer.render=originalRender;}
      return {id:clip.id,duration:clip.duration,samples:sample,peak:sample.reduce((p,c)=>c.lift>p.lift?c:p,sample[0])};
    });
    const observations=[];
    for(const [label,phase] of [['peak',sweep.peak.phase],['settled',1]]){
      const observation=await page.evaluate(phase=>{
        const api=soccerV7,{actors}=api.inspect(),a=actors[0];a.baseYaw=0;api.seek(phase);a.refreshFloorRows();
        const materials=[];let opaqueMinimum=Infinity,maskedMinimum=Infinity;
        for(const piece of a.floorMeshes){
          let minimum=Infinity,index=-1;const {positions:p,joints:j,weights:w,rows:r}=piece;
          for(let i=0;i<piece.count;i++){
            let y=0;for(let k=0;k<4;k++){const weight=w[i*4+k];if(!weight)continue;const row=j[i*4+k]*4;y+=weight*(r[row]*p[i*3]+r[row+1]*p[i*3+1]+r[row+2]*p[i*3+2]+r[row+3]);}
            if(y<minimum){minimum=y;index=i;}
          }
          const material=Array.isArray(piece.mesh.material)?piece.mesh.material[0]:piece.mesh.material;
          const alphaMasked=material.alphaTest>0;
          if(alphaMasked)maskedMinimum=Math.min(maskedMinimum,minimum);else opaqueMinimum=Math.min(opaqueMinimum,minimum);
          const uv=piece.mesh.geometry.attributes.uv;
          materials.push({material:material.name,mesh:piece.mesh.name,alphaMasked,minimumY:minimum,index,
            bindPosition:[p[index*3],p[index*3+1],p[index*3+2]],uv:uv?[uv.getX(index),uv.getY(index)]:null});
        }
        return {phase,lift:a.lift,minimumY:a.minimumY(true),opaqueMinimumY:opaqueMinimum,maskedMinimumY:Number.isFinite(maskedMinimum)?maskedMinimum:null,
          alphaMaskControlsFloor:maskedMinimum<opaqueMinimum-.003,materials};
      },phase);
      observations.push({label,...observation});
      await page.evaluate(()=>{
        const {actors}=soccerV7.inspect(),a=actors[0],materials=[...new Set(a.meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]))];
        globalThis.__motionDiagnosticMaterials=materials.map(m=>({m,transparent:m.transparent,opacity:m.opacity,depthWrite:m.depthWrite,alphaTest:m.alphaTest,alphaToCoverage:m.alphaToCoverage}));
      });
      const images=[];
      for(const mode of ['normal','xray','solid-alpha']){
        await page.evaluate(mode=>{
          const {actors,renderer,scene,camera}=soccerV7.inspect();
          for(const saved of __motionDiagnosticMaterials){const {m,...values}=saved;Object.assign(m,values);
            if(mode==='xray'){m.transparent=true;m.opacity=.23;m.depthWrite=false;m.alphaTest=0;m.alphaToCoverage=false;}
            if(mode==='solid-alpha'){m.alphaTest=0;m.alphaToCoverage=false;}
            m.needsUpdate=true;
          }
          actors[0].helper.visible=mode==='xray';renderer.render(scene,camera);
        },mode);
        const png=await page.screenshot({type:'png'}),file=id+'-'+label+'-'+mode+'-390x844.webp';
        await sharp(png).webp({quality:90}).toFile(path.join(output,file));images.push(png);captures.push({clip:id,label,phase,mode,file});
      }
      await sharp({create:{width:1170,height:844,channels:3,background:'#1e292b'}}).composite(images.map((input,i)=>({input,left:390*i,top:0}))).webp({quality:90}).toFile(path.join(output,id+'-'+label+'-comparison.webp'));
      await page.evaluate(()=>{const {actors,renderer,scene,camera}=soccerV7.inspect();for(const {m,...values}of __motionDiagnosticMaterials){Object.assign(m,values);m.needsUpdate=true;}actors[0].helper.visible=false;renderer.render(scene,camera);});
      await page.setViewportSize({width:844,height:390});await page.evaluate(()=>soccerV7.setOrbit(.45));
      const landscape=id+'-'+label+'-normal-844x390.webp';await sharp(await page.screenshot({type:'png'})).webp({quality:90}).toFile(path.join(output,landscape));captures.push({clip:id,label,phase,mode:'normal',file:landscape});
      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>soccerV7.setOrbit(.45));
    }
    rows.push({...sweep,observations});
  }
  await fs.writeFile(path.join(output,'diagnostic.json'),JSON.stringify({schemaVersion:1,authoringOverride,overrideHashes,inventory,inputHashes,errors,external,rows,captures,
    modes:['normal visible materials','xray skin plus canonical skeleton','alpha mask disabled to expose full card geometry'],
    limits:['Paused actual-viewer poses; not pressure simulation, all-frame triangle contact or physical-device framerate.',
      'Opaque versus alpha-mask minima use vertex extrema, not alpha-tested fragment sampling. A masked minimum is a review flag, not proof of invisible geometry.']},null,2)+'\n');
  console.log(JSON.stringify({clips:rows.length,captures:captures.length,errors,external,alphaMaskControllingCases:rows.flatMap(r=>r.observations).filter(o=>o.alphaMaskControlsFloor).length,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
