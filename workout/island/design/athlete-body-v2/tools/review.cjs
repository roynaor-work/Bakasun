/** CC0-1.0. Review exported assets in Chromium and write the measurement record.
 * Start a repository-root HTTP server on 8765. Install Playwright separately,
 * or set ATHLETE_PLAYWRIGHT to its installed module path. No test/game files
 * are created or changed. Run from this folder or the repository root.
 */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ATHLETE_PLAYWRIGHT||'playwright');
const folder=path.resolve(__dirname,'..'),out=path.join(folder,'verification');
const url=(process.env.ATHLETE_PREVIEW_ORIGIN||'http://127.0.0.1:8765')+'/workout/island/design/athlete-body-v2/preview.html';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ATHLETE_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.previewReady,null,{timeout:60000});
 await page.evaluate(()=>athletePreview.setTime(.2));
 const results=[];
 for(const body of ['soccer','guard','wing','center']){
  await page.evaluate(body=>athletePreview.build(body),body);
  const result=await page.evaluate(async body=>{
   const T=await import('../../vendor/three.module.js');
   const api=athletePreview,pair=api.slots.filter(s=>s.spec.id==='full');
   const mesh=s=>{let m;s.root.traverse(o=>{if(o.isSkinnedMesh)m=o;});return m;};
   const before=mesh(pair[0]),after=mesh(pair[1]);
   const v=new T.Vector3(),w=new T.Vector3();
   const used=new Set(after.geometry.index.array);
   const retained=[...used].filter(i=>i<3944);
   // Distributed retained body vertices; the exhaustive static byte comparison
   // in measure.py proves the other retained vertices follow the same equation.
   const probes=Array.from({length:24},(_,i)=>retained[Math.floor(i*(retained.length-1)/23)]);
   const hg=after.geometry.attributes._glove,hw=after.geometry.attributes.skinWeight;
   const rigid=[];for(let i=3944;i<hg.count;i++)if(hg.getX(i)>.5&&hw.getX(i)===1)rigid.push(i);
   const handProbes=[rigid[2],rigid[10]];
   let maxRetainedError=0,maxRigidHandRelativeError=0,poseCount=0,clipCount=0;
   const variants=[['soccer',false],['soccer',true],['basketball',false],['hockey',true],['tennis',false]];
   const byLibrary={};
   for(const [id,clip] of api.clips){
    const lib=id.split('/')[0];byLibrary[lib]=(byLibrary[lib]||0)+1;clipCount++;
    for(const slot of pair){slot.mixer.stopAllAction();slot.action=slot.mixer.clipAction(clip);slot.action.setLoop(T.LoopOnce,1);slot.action.clampWhenFinished=true;slot.action.play();}
    for(const [sport,gloves] of variants){
     pair[1].appearance.update({sport,gloves});
     for(const n of ['basketball','hockey','tennis'])before.morphTargetInfluences[before.morphTargetDictionary[n]]=sport===n?1:0;
     // Both canonical hands have the same rigid topology. Measure on the left,
     // with glove expansion included in the baseline for that variant.
     const a=handProbes[0],b=handProbes[1];
     const restA=new T.Vector3().fromBufferAttribute(after.geometry.attributes.position,a),restB=new T.Vector3().fromBufferAttribute(after.geometry.attributes.position,b);
     const gm=after.geometry.morphAttributes.position[3];
     if(gloves){restA.add(new T.Vector3().fromBufferAttribute(gm,a));restB.add(new T.Vector3().fromBufferAttribute(gm,b));}
     pair[1].root.updateMatrixWorld(true);
     const actorScale=after.skeleton.bones[0].getWorldScale(new T.Vector3()).x;
     const restLength=restA.distanceTo(restB)*actorScale;
     for(let f=0;f<9;f++){
      const time=clip.duration*f/8;
      for(const slot of pair){slot.action.time=time;slot.mixer.update(0);slot.root.updateMatrixWorld(true);}
      before.skeleton.update();after.skeleton.update();poseCount++;
      for(const i of probes){before.getVertexPosition(i,v);after.getVertexPosition(i,w);const error=v.distanceTo(w);if(!Number.isFinite(error))throw Error(body+'/'+id+' nonfinite skinning');maxRetainedError=Math.max(maxRetainedError,error);}
      after.getVertexPosition(a,v);after.getVertexPosition(b,w);
      const error=Math.abs(v.distanceTo(w)/restLength-1);if(!Number.isFinite(error))throw Error(body+'/'+id+' nonfinite hand');maxRigidHandRelativeError=Math.max(maxRigidHandRelativeError,error);
     }
    }
   }
   if(maxRetainedError>1e-7||maxRigidHandRelativeError>2e-5)throw Error('Skin deformation regression '+JSON.stringify({body,maxRetainedError,maxRigidHandRelativeError}));
   return {body,clipCount,byLibrary,poseCount,variants,maxRetainedErrorMeters:maxRetainedError,maxRigidHandRelativeError};
  },body);
  results.push(result);console.log(JSON.stringify(result));
 }
 await page.evaluate(()=>athletePreview.build('soccer'));
 await page.evaluate(()=>{athletePreview.setClip('soccer-v9/run');athletePreview.setTime(.2);});
 for(const id of ['full','hands','gloves','back','shorts','crest']){
  await page.locator('#'+id).scrollIntoViewIfNeeded();await page.evaluate(()=>athletePreview.render());await page.waitForTimeout(80);
  await page.locator('#'+id).screenshot({path:path.join(out,id+'.png')});
 }
 // All 100 allowed numbers must change the actual rendered back and shorts.
 const numberImages={back:[],shorts:[]};
 for(const id of ['back','shorts']){
  await page.locator('#'+id).scrollIntoViewIfNeeded();
  numberImages[id]=await page.evaluate(async id=>{
   const api=athletePreview,slot=api.slots.find(s=>s.after&&s.spec.id===id),gl=api.renderer.getContext();
   const rect=slot.el.getBoundingClientRect(),dpr=api.renderer.getPixelRatio();
   const x=Math.ceil(rect.left*dpr),y=Math.ceil((innerHeight-rect.bottom)*dpr);
   const width=Math.floor(rect.width*dpr)-2,height=Math.floor(rect.height*dpr)-2;
   const pixels=new Uint8Array(width*height*4),hashes=[];
   // Hash actual framebuffer pixels directly; 200 repeated UI screenshots
   // would add capture overhead without providing any additional evidence.
   for(let n=0;n<100;n++){
    api.setAppearance({number:n});api.render();
    gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const digest=await crypto.subtle.digest('SHA-256',pixels);
    hashes.push(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''));
   }
   return hashes;
  },id);
  if(new Set(numberImages[id]).size!==100)throw Error('Number shader does not distinguish all 100 numbers on '+id);
 }
 await page.evaluate(()=>athletePreview.setAppearance({number:23}));
 const mobile=[];
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await page.locator('#hands').scrollIntoViewIfNeeded();await page.evaluate(()=>athletePreview.render());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Horizontal overflow at '+JSON.stringify(size));
  await page.screenshot({path:path.join(out,`mobile-${size.width}x${size.height}.png`)});mobile.push({...size,horizontalOverflow:overflow});
 }
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({browser:await browser.version(),renderer:'Chromium WebGL2 / ANGLE SwiftShader',results,numbers:{backDistinct:new Set(numberImages.back).size,shortsDistinct:new Set(numberImages.shorts).size},mobile,consoleErrors:errors},null,2)+'\n');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
