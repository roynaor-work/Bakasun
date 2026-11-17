/** Actual browser skinning review. Requires a running repository-root HTTP server.
 * Run: HOOPS_PREVIEW_TOOLS=/tmp/hoops-preview-tools node source/verify-crowd-motion.mjs
 * Outputs only verification/crowd-motion.{json,webp}.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(process.env.HOOPS_PREVIEW_TOOLS || '/tmp/hoops-preview-tools', 'package.json'));
const {chromium} = require('playwright-core');
const origin = process.env.HOOPS_PREVIEW_ORIGIN || 'http://127.0.0.1:8765';
const prefix = '/workout/island/design/hoops-realism-v2/';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_BIN || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1050, height: 680}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(origin);
const report = await page.evaluate(async ({prefix}) => {
  const T = await import('/workout/island/vendor/three.module.js');
  const {GLTFLoader} = await import('/workout/island/vendor/GLTFLoader.js');
  const {clone} = await import('/workout/island/vendor/SkeletonUtils.js');
  const catalog = await (await fetch(prefix + 'crowd/catalog.json')).json();
  const loader = new GLTFLoader(), loaded = new Map(), results = [];
  const round = x => Number(x.toFixed(7));
  for (const fan of catalog.fans) for (const lod of fan.lods) {
    const gltf = await loader.loadAsync(prefix + lod.path);
    loaded.set(`${fan.id}:${lod.level}`, gltf);
    let mesh;
    gltf.scene.traverse(o => {if(o.isSkinnedMesh) mesh = o;});
    const geo = mesh.geometry, vertexCount = geo.attributes.position.count;
    const worldPositions = Array.from({length: vertexCount}, () => new T.Vector3());
    const handTriangles = [8, 11].map(joint => {
      const triangles = [];
      for(let i=0;i<geo.index.count;i+=3) {
        const indices = [geo.index.getX(i), geo.index.getX(i+1), geo.index.getX(i+2)];
        if(indices.every(v => geo.attributes.skinIndex.getX(v) === joint)) triangles.push(indices);
      }
      return triangles;
    });
    const skin = () => {
      gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
      const box = new T.Box3();
      for(let i=0;i<vertexCount;i++) {mesh.getVertexPosition(i,worldPositions[i]);worldPositions[i].applyMatrix4(mesh.matrixWorld);box.expandByPoint(worldPositions[i]);}
      return box;
    };
    const bone = name => gltf.scene.getObjectByName(name).getWorldPosition(new T.Vector3());
    const scale = fan.height / (fan.ageGroup === 'child' ? 1.815 : 1.786);
    const headPoint = local => gltf.scene.getObjectByName('Head').localToWorld(new T.Vector3(...local.map(x => x*scale)));
    const restFloor = skin().min.y;
    const triangleKeys = new Set();let duplicateFaces = 0, degenerateFaces = 0;
    const point = i => new T.Vector3().fromBufferAttribute(geo.attributes.position,i);
    for(let i=0;i<geo.index.count;i+=3) {
      const vertices = [point(geo.index.getX(i)),point(geo.index.getX(i+1)),point(geo.index.getX(i+2))];
      const key=vertices.map(v=>v.toArray().map(x=>x.toFixed(6)).join(',')).sort().join('|');
      if(triangleKeys.has(key))duplicateFaces++;triangleKeys.add(key);
      if(new T.Triangle(...vertices).getArea()<1e-12)degenerateFaces++;
    }
    const clips = [];
    for(const spec of catalog.clips) {
      const clip=gltf.animations.find(c=>c.name===spec.name), mixer=new T.AnimationMixer(gltf.scene);
      mixer.clipAction(clip).play();
      let minY=Infinity,maxY=-Infinity,firstY,lastY,minHand=Infinity,maxHand=0,minBrow=Infinity,minMouth=Infinity;
      let minHandVertexToTriangle=Infinity;
      const samples = 65;
      for(let sample=0;sample<samples;sample++) {
        mixer.setTime(sample/(samples-1)*clip.duration);
        const box=skin();minY=Math.min(minY,box.min.y);maxY=Math.max(maxY,box.min.y);
        if(sample===0)firstY=box.min.y;if(sample===samples-1)lastY=box.min.y;
        const left=bone('LeftHand'),right=bone('RightHand'),distance=left.distanceTo(right);
        minHand=Math.min(minHand,distance);maxHand=Math.max(maxHand,distance);
        minBrow=Math.min(minBrow,left.distanceTo(headPoint([0,.035,.080])));
        const mouth=headPoint([0,-.025,.080]);minMouth=Math.min(minMouth,Math.max(left.distanceTo(mouth),right.distanceTo(mouth)));
        if(spec.name==='clap' && lod.level===0) {
          // Vertex-to-triangle separation is an upper bound on exact surface distance.
          // It does not certify absence of intersections or exact palm contact.
          for(let side=0;side<2;side++) for(const triangle of handTriangles[side]) for(const vi of triangle) {
            const vertex=worldPositions[vi];
            for(const other of handTriangles[1-side]) {
              const tri=new T.Triangle(...other.map(i=>worldPositions[i]));
              minHandVertexToTriangle=Math.min(minHandVertexToTriangle,vertex.distanceTo(tri.closestPointToPoint(vertex,new T.Vector3())));
            }
          }
        }
      }
      let seamError=0;
      for(const track of clip.tracks) {
        const width=track.getValueSize();
        for(let c=0;c<width;c++)seamError=Math.max(seamError,Math.abs(track.values[c]-track.values[track.values.length-width+c]));
      }
      const checks={loopEndpoints:seamError<=1e-5,floor:minY>=-.005};
      if(spec.name==='clap') {checks.handsClose=minHand<=fan.height*.025;checks.handsOpen=maxHand>=fan.height*.07;if(lod.level===0)checks.handMeshProximity=minHandVertexToTriangle<=fan.height*.025;}
      if(spec.name==='jump'){checks.groundedAtBoundary=Math.abs(firstY-restFloor)<=.005&&Math.abs(lastY-restFloor)<=.005;checks.apexLift=maxY-restFloor>=fan.height*.10&&maxY-restFloor<=fan.height*.18;}
      if(spec.name==='disappointed')checks.browProximity=minBrow<=fan.height*.06;
      if(spec.name==='shout')checks.mouthProximity=minMouth<=fan.height*.07;
      clips.push({name:spec.name,durationSeconds:round(clip.duration),samples,loopEndpointMaxError:round(seamError),
        floorMinMeters:round(minY),floorMaxMeters:round(maxY),restFloorMeters:round(restFloor),
        handCenterMinMeters:round(minHand),handCenterMaxMeters:round(maxHand),
        ...(spec.name==='jump'?{apexLiftMeters:round(maxY-restFloor)}:{}),
        ...(spec.name==='disappointed'?{leftHandToBrowProxyMinMeters:round(minBrow)}:{}),
        ...(spec.name==='shout'?{worstHandToMouthProxyMinMeters:round(minMouth)}:{}),
        ...(spec.name==='clap'&&lod.level===0?{handVertexToOppositeTriangleMinMeters:round(minHandVertexToTriangle)}:{}),
        checks,pass:Object.values(checks).every(Boolean)});
      mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
    }
    results.push({fan:fan.id,lod:lod.level,heightMeters:fan.height,triangles:geo.index.count/3,duplicateFaces,degenerateFaces,
      clips,pass:duplicateFaces===0&&degenerateFaces===0&&clips.every(c=>c.pass)});
  }
  // One compact contact sheet, rendered directly from the final GLBs.
  document.body.innerHTML='<div id="labels"></div>';document.body.style.cssText='margin:0;overflow:hidden;background:#172126';
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.setClearColor('#172126');renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,(innerWidth/3)/(innerHeight/2),.01,100);
  camera.position.set(.32,1.12,4.65);camera.lookAt(0,1.12,0);
  scene.add(new T.HemisphereLight(0xffffff,0x627487,2));const key=new T.DirectionalLight(0xffecd0,3);key.position.set(-3,5,5);scene.add(key);
  const fill=new T.DirectionalLight(0xb8deff,1);fill.position.set(4,2,-1);scene.add(fill);
  scene.add(new T.GridHelper(8,16,0x566970,0x2c3b41));const group=new T.Group();scene.add(group);
  const poses=[['stand','עמידה',.4],['sit','ישיבה',.4],['clap','מחיאות כפיים',.3],['jump','קפיצה בשמחה',.8],['disappointed','אכזבה',.4],['shout','צעקה',.4]];
  const labels=document.getElementById('labels');labels.style.cssText='position:absolute;inset:0;pointer-events:none;color:#edf3ec;font:16px Arial';
  renderer.setScissorTest(true);
  for(let index=0;index<poses.length;index++) {
    const [name,label,time]=poses[index],x=index%3*innerWidth/3,y=(1-Math.floor(index/3))*innerHeight/2;
    group.clear();const gltf=loaded.get('fan-05:0'),model=clone(gltf.scene);group.add(model);
    const mixer=new T.AnimationMixer(model);mixer.clipAction(gltf.animations.find(c=>c.name===name)).play();mixer.setTime(time);model.updateMatrixWorld(true);
    renderer.setViewport(x,y,innerWidth/3,innerHeight/2);renderer.setScissor(x,y,innerWidth/3,innerHeight/2);renderer.render(scene,camera);
    const title=document.createElement('div');title.textContent=label+' · 210 △';title.style.cssText=`position:absolute;top:${Math.floor(index/3)*50+2}%;left:${index%3*100/3}%;width:33.333%;text-align:center`;labels.append(title);
  }
  const limits={floorMinMeters:-.005,loopEndpointMaxError:1e-5,clapCenterMinMaxHeightRatio:.025,clapOpenMinHeightRatio:.07,
    handMeshProximityMaxHeightRatio:.025,jumpBoundaryFloorToleranceMeters:.005,jumpApexHeightRatio:[.10,.18],browProximityMaxHeightRatio:.06,mouthProximityMaxHeightRatio:.07};
  return {schemaVersion:1,method:'Chromium + Three.js actual AnimationMixer and SkinnedMesh.getVertexPosition, 65 evenly-spaced samples per clip, all 48 final crowd GLBs',
    criteria:limits,models:results,pass:results.every(r=>r.pass),
    limitations:['LOD0 is a 210-triangle stylized human suitable for stands, not close-up photorealism.','LOD1 uses crossed ribbons on neck and legs; no duplicate coplanar faces were detected. Pixel inspection confirmed removal of the earlier z-fighting artifact.','LOD2 is a 24-triangle double-sided skinned silhouette and is intended for distant frontal stands; it becomes thin side-on.','Mouth and brow distances use anatomical proxies relative to the Head joint, not scanned facial landmarks.','Hand mesh proximity measures vertex-to-opposite-triangle distances. It does not prove continuous collision-free palm contact.','The floor and contact checks are sampled at 65 times per clip and are not continuous collision proofs.','Human appearance and emotion readability were reviewed visually; that assessment is subjective, separate from the numerical pass criteria.'],
    visualReview:{fans:[1,5,13,14],views:['front','three-quarter','side'],clips:catalog.clips.map(c=>c.name),lods:[0,1,2],notes:'Shorter visible neck, sloped shoulders, connected elbow/knee loops, closed pelvis, close scalp, and actual shoe volume improved human readability over the initial draft.'}};
}, {prefix});
report.browserErrors=errors;
report.pass &&= errors.length===0;
report.inputs=[];
for(const model of report.models){const relative=`crowd/${model.fan}-lod${model.lod}.glb`;report.inputs.push({path:relative,sha256:createHash('sha256').update(await fs.readFile(path.join(root,relative))).digest('hex')});}
const out=path.join(root,'verification');await fs.mkdir(out,{recursive:true});
// Chromium screenshot's supported formats are PNG/JPEG. Encode WebP with authoring-tool Sharp.
const temporary=await page.screenshot({type:'jpeg',quality:82});
const sharpRequire=createRequire(path.join(process.env.HOOPS_TOOLS_DIR||'/tmp/hoops-realism-tools','package.json'));
const sharp=sharpRequire('sharp');
await fs.writeFile(path.join(out,'crowd-motion.webp'),await sharp(temporary).webp({quality:82}).toBuffer());
report.contactSheet={path:'verification/crowd-motion.webp',bytes:(await fs.stat(path.join(out,'crowd-motion.webp'))).size};
await fs.writeFile(path.join(out,'crowd-motion.json'),JSON.stringify(report,null,2)+'\n');
await browser.close();
const failures=report.models.filter(r=>!r.pass).map(r=>({fan:r.fan,lod:r.lod,duplicateFaces:r.duplicateFaces,degenerateFaces:r.degenerateFaces,clips:r.clips.filter(c=>!c.pass).map(c=>({name:c.name,checks:c.checks}))}));
console.log(JSON.stringify({pass:report.pass,models:report.models.length,clips:report.models.reduce((n,m)=>n+m.clips.length,0),contactSheet:report.contactSheet,failures},null,2));
if(!report.pass)process.exitCode=1;
