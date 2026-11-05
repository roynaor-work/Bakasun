/* Optional local authoring render. Uses only local assets and the decoded
 * ordinary GLB clips. The final offline product is the pack's main viewer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire('/tmp/alpine-v7-tools/package.json');
const {chromium}=require('playwright-core'),sharp=require('sharp');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const source=arg('--source','characters/ski-male.glb'),sport=arg('--sport','ski');
const target=path.resolve(ROOT,arg('--out',`motion/verification/${sport}`));if(!target.startsWith(ROOT+path.sep))throw Error('Render output must stay inside alpine-v7');
await fs.mkdir(target,{recursive:true});
const inputPath=path.resolve(ROOT,source);if(!inputPath.startsWith(ROOT+path.sep))throw Error('Character input must stay inside alpine-v7');
const inputBytes=await fs.readFile(inputPath),inputSha256=createHash('sha256').update(inputBytes).digest('hex');
// This hostname is intercepted completely in-process; no listening server,
// external request, or repository-wide HTTP exposure is needed.
const base='http://alpine-motion.local',asset=`${base}/workout/island/design/alpine-v7/${source}`;
const html=`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#dce8ef;color:#163247;font:16px system-ui}canvas{display:block}aside{position:fixed;left:16px;top:14px;padding:9px 12px;background:#ffffffdf;border-radius:10px;line-height:1.5;pointer-events:none}b{display:block}small{font-size:12px;color:#496074}</style><script type="importmap">{"imports":{"three":"${base}/workout/island/vendor/three.module.js"}}</script></head><body><aside><b id="label">Loading motion</b><small id="detail"></small></aside><script type="module">
import * as T from '${base}/workout/island/vendor/three.module.js';
import {GLTFLoader} from '${base}/workout/island/vendor/GLTFLoader.js';
import {DRACOLoader} from '${base}/workout/island/vendor/DRACOLoader.js';
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#dce8ef');scene.add(new T.HemisphereLight(0xddefff,0x59708b,2));
for(const [x,y,z,power,color]of [[2,4,3,3.2,0xffe2bd],[-3,2,-3,2,0xc8deff]]){const l=new T.DirectionalLight(color,power);l.position.set(x,y,z);scene.add(l);}
const plane=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0xe8f2f7,roughness:.9}));plane.rotation.x=-Math.PI/2;plane.position.y=-.007;scene.add(plane);
const grid=new T.GridHelper(6,24,0x8aa8bc,0xc2d4df);grid.position.y=-.005;grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);
const camera=new T.PerspectiveCamera(34,innerWidth/innerHeight,.01,30);
const draco=new DRACOLoader();draco.setDecoderPath('${base}/workout/island/vendor/draco/');const loader=new GLTFLoader();loader.setDRACOLoader(draco);
const gltf=await loader.loadAsync('${asset}');scene.add(gltf.scene);gltf.scene.traverse(o=>{if(o.isMesh){o.frustumCulled=false;if(o.material){o.material.envMapIntensity=.8;}}});
const mixer=new T.AnimationMixer(gltf.scene),actions=gltf.animations.map(c=>mixer.clipAction(c));
window.captureMotion=(name,ratio,view='three-quarter')=>{mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name);if(!clip)throw Error('Missing '+name);const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(clip.duration*ratio);mixer.update(0);gltf.scene.updateMatrixWorld(true);const points=[],box=new T.Box3();gltf.scene.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;if(o.isSkinnedMesh)o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){const p=o.isSkinnedMesh?o.getVertexPosition(i,new T.Vector3()):new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i);p.applyMatrix4(o.matrixWorld);points.push(p);box.expandByPoint(p);}});const target=box.getCenter(new T.Vector3());target.y+=(box.max.y-box.min.y)*.06;const direction=(view==='side'?new T.Vector3(1,.04,.005):new T.Vector3(.53,.18,.84)).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize(),tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=.6;for(const p of points){const v=p.clone().sub(target),z=v.dot(direction);distance=Math.max(distance,z+Math.abs(v.dot(right))/(tanH*.84),z+Math.abs(v.dot(up))/(tanV*.80));}camera.position.copy(target).addScaledVector(direction,distance*1.04);camera.lookAt(target);document.querySelector('#label').textContent=name+' · ${sport}';document.querySelector('#detail').textContent=Math.round(ratio*100)+'% · '+view;renderer.render(scene,camera);return {clips:gltf.animations.map(c=>c.name),time:clip.duration*ratio};};
window.captureMotion('glide',0);window.ready=true;
</script></body></html>`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(`${base}/**`,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/alpine-motion-preview'){await route.fulfill({contentType:'text/html',body:html});return;}
    const island=path.resolve(ROOT,'../..'),file=path.resolve(island,'.'+url.pathname.replace(/^\/workout\/island/,''));
    if(!file.startsWith(island+path.sep)){await route.fulfill({status:403,body:'Out of asset scope'});return;}
    const types={'.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.json':'application/json'};
    try{await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:file===inputPath?inputBytes:await fs.readFile(file)});}catch{await route.fulfill({status:404,body:'Missing local authoring asset'});}
  });await page.goto(`${base}/alpine-motion-preview`);await page.waitForFunction(()=>window.ready,null,{timeout:120000});
  const allCases=[['glide',.5],['carve_left',.5],['carve_right',.5],['crouch',.5],['accelerate',.8],['ramp_jump',.5],['trick_180',.6],['trick_360',.6],['trick_shifty',.4],['trick_tail_grab',.5],['trick_backflip',.5],['fall_roll',.42],['get_up',.5],['celebrate',.25]];
  const only=arg('--clips','').split(',').filter(Boolean),selected=only.length?allCases.filter(([n])=>only.includes(n)):allCases,phase=arg('--phase',null),cases=selected.map(([n,t])=>[n,phase===null?t:Number(phase)]);
  await page.evaluate(p=>{if(p!==null)document.body.dataset.phase=p;},phase);
  const tiles=[];
  for(const [name,ratio]of cases){
    await page.evaluate(([n,t])=>window.captureMotion(n,t),[name,ratio]);const file=path.join(target,`${name}.webp`);await page.screenshot({path:file,type:'webp',quality:88});tiles.push(file);
  }
  const width=390,height=844,cols=Math.min(5,tiles.length),rows=Math.ceil(tiles.length/cols);
  await sharp({create:{width:width*cols,height:height*rows,channels:3,background:'#dce8ef'}}).composite(tiles.map((input,i)=>({input,left:(i%cols)*width,top:Math.floor(i/cols)*height}))).webp({quality:88}).toFile(path.join(target,'contact-sheet.webp'));
  for(const name of ['carve_left','trick_tail_grab','fall_roll','get_up'].filter(n=>!only.length||only.includes(n))){await page.evaluate(n=>window.captureMotion(n,Number(document.body.dataset.phase??.5),'side'),name);await page.screenshot({path:path.join(target,`${name}-side.webp`),type:'webp',quality:88});}
  await fs.writeFile(path.join(target,'render.json'),JSON.stringify({source,sport,sourceBytes:inputBytes.length,sourceSha256:inputSha256,viewport:{width:390,height:844},renderer:'Chromium SwiftShader; ordinary decoded GLB AnimationMixer',cases,errors},null,2)+'\n');
  console.log(JSON.stringify({source,sport,target,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
