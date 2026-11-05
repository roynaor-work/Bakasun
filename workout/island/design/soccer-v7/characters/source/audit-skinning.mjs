/** Compare optimized full-mesh floor evaluation to Three.js itself.
 * --dense-floor advances clips at120Hz; --sample-hz 30|60|120 selects playback.
 * Optional --character ID --lod 0|1 --clip ID select diagnostic subsets.
 * --lod-lifecycle also checks displayed pose/pending landings across mid-fade LOD swaps.
 * select a diagnostic subset, which is always marked complete:false.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const palmWitnessPath=path.join(root,'source/audit-action-observer.cjs');
const {createPhysicalPalmObserver}=require(palmWitnessPath);
const args=process.argv.slice(2),out=args.includes('--out')?path.resolve(args[args.indexOf('--out')+1]):path.join(root,'verification/skinning-y-rows.json');
const denseFloor=args.includes('--dense-floor');
const lodLifecycle=args.includes('--lod-lifecycle');
const selected=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const characterFilter=selected('--character'),lodFilter=selected('--lod');
const clipFilter=selected('--clip');
const denseSampleRateHz=Number(selected('--sample-hz')||120);
if(lodFilter!==null&&!['0','1'].includes(lodFilter))throw Error('--lod must be0 or1');
if(![30,60,120].includes(denseSampleRateHz))throw Error('--sample-hz must be30,60 or120');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const auditSourceSha256=sha256(await fs.readFile(fileURLToPath(import.meta.url)));
const palmWitnessSourceSha256=sha256(await fs.readFile(palmWitnessPath));
const palmWitnessFactorySource=createPhysicalPalmObserver.toString();
// A long audit may outlive a chat/environment interruption. Record its owned
// PID and progress so a resumed agent can monitor it instead of duplicating it.
const runStatePath=path.join(tmpdir(),'soccer-v7-skinning-'+sha256(out).slice(0,16)+'.json');
const runState={pid:process.pid,script:fileURLToPath(import.meta.url),sourceSha256:auditSourceSha256,output:out,args,startedAt:new Date().toISOString(),status:'running',completedModels:[]};
const saveRunState=async()=>{const staging=runStatePath+'.'+process.pid+'.tmp';await fs.writeFile(staging,JSON.stringify(runState,null,2)+'\n');await fs.rename(staging,runStatePath);};
await saveRunState();console.log(JSON.stringify({runnerPID:process.pid,runStatePath,output:out}));
const servedResources=new Map(),decodedModels=new Map(),errors=[],remoteRequests=[];
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try {
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+relative);
    if(!file.startsWith(root+path.sep))throw Error('Outside package');
    const bytes=await fs.readFile(file);servedResources.set(relative,{file:relative,bytes:bytes.length,sha256:sha256(bytes)});
    if(relative.startsWith('/offline/')) {
      const assignment=bytes.toString('utf8').match(/\[("[^"]+")\]="([A-Za-z0-9+/=]+)"/);
      if(assignment){const payload=Buffer.from(assignment[2],'base64');decodedModels.set(JSON.parse(assignment[1]),{bytes:payload.length,sha256:sha256(payload)});}
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.addInitScript(()=>{globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};});
  await page.exposeFunction('__skinningAuditProgress',async row=>{runState.completedModels.push(row);await saveRunState();console.log(JSON.stringify({progress:row}));});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',message=>{if(message.type()==='error')errors.push('Console: '+message.text());});
  await page.route(/^https?:/,route=>{if(route.request().url().startsWith(origin+'/'))return route.continue();remoteRequests.push(route.request().url());return route.abort('blockedbyclient');});
  await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});await page.evaluate(()=>soccerV7.ready);
  const report=await page.evaluate(async({denseFloor,lodLifecycle,characterFilter,lodFilter,clipFilter,denseSampleRateHz,palmWitnessFactorySource})=>{
    const api=soccerV7;api.setPlaying(false);await api.setView('body');
    const makePalmWitness=Function('return ('+palmWitnessFactorySource+')')(),palmCalibrationCache=new WeakMap();
    const inspector=api.inspect(),renderer=inspector.renderer,render=renderer.render;
    renderer.render=()=>{};
    let lifecycleIdentityCount=0;
    const lifecycleSequences=[
      {start:'run_2',phase:.18,next:'sprint',advance:.05},
      {start:'header',phase:.5,next:'run_2',advance:.05},
      {start:'header',phase:.15,next:'run_2',advance:.05},
      {start:'header',phase:.85,next:'run_2',advance:.05},
      {start:'turn_left',phase:.5,next:'run_2',advance:.05},
      {start:'get_up',phase:.05,next:null,advance:.05},
      {start:'get_up',phase:.25,next:null,advance:.05},
      {start:'slide_tackle',phase:.95,next:null,advance:.025},
      {start:'keeper_dive_right',phase:.98,next:null,advance:0},
      {start:'keeper_dive_right',phase:.25,next:'get_up',advance:1.4,expectedSupport:'body-settle'},
      {start:'slide_tackle',phase:.85,next:null,advance:.025,expectedSupport:'palm-support'},
      {start:'get_up',phase:.35,next:null,advance:.025,expectedSupport:'bilateral-palm-support'},
    ];
    const rows=[],models=[],lifecycle=[],coldSeekLifecycle=[],rebuildLifecycle=[],decodedMaterialIssues=[],pairs=[['run_2','run_5','sprint','decelerate'],['idle','short_pass','long_pass'],['fall','get_up','run_2']];
    const clips=inspector.data.motion.clips.filter(c=>!clipFilter||c.id===clipFilter);
    if(!clips.length)throw Error('No matching clip');
    const phases=[0,.071,.237,.499,.713,.937,1];let maximumDifference=0,samples=0;
    let minimumReferenceY=Infinity,maximumAnchorError=0,denseSamples=0;
    const compare=(actor,label)=>{
      const fast=actor.minimumY(true),reference=actor.minimumYReference(),error=Math.abs(fast-reference);
      minimumReferenceY=Math.min(minimumReferenceY,reference);
      maximumDifference=Math.max(maximumDifference,error);samples++;
      return{label,fast,reference,absoluteErrorMeters:error};
    };
    try {
      const characters=inspector.data.manifest.characters.filter(c=>!characterFilter||c.id===characterFilter);
      if(!characters.length)throw Error('No matching character');
      lifecycleIdentityCount=characters.length;
      for(const character of characters)for(const level of lodFilter===null?[0,1]:[Number(lodFilter)]) {
        await api.setCharacter(character.id);await api.setLOD(level);api.setPlaying(false);
        const actor=api.inspect().actors[0];if(typeof actor.minimumYReference!=='function')throw Error('Reference evaluator missing');
        const actualPalmWitness=makePalmWitness({api,actor,calibrationCache:palmCalibrationCache});
        const decodedMaterials=[];
        for(const material of new Set(actor.meshes.flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]))){
          if(!material)continue;
          const maps={};
          for(const key of ['map','normalMap','roughnessMap','metalnessMap','alphaMap'])if(material[key]){
            const texture=material[key],source=texture.source?.data||texture.image;
            const width=source?.width||source?.naturalWidth||0,height=source?.height||source?.naturalHeight||0;
            maps[key]={width,height};
            if(!width||!height||width>1024||height>1024)decodedMaterialIssues.push({file:actor.path,material:material.name,map:key,width,height,message:'Texture was not decoded or exceeds1024.'});
          }
          if(!maps.map)decodedMaterialIssues.push({file:actor.path,material:material.name,message:'Decoded basecolor map missing.'});
          if(/skin|cloth/i.test(material.name)&&(!maps.normalMap||!maps.roughnessMap))decodedMaterialIssues.push({file:actor.path,material:material.name,message:'Skin/cloth normal or roughness map missing at runtime.'});
          if(material.name==='HairCards'&&material.side!==(character.design?.hair==='coils'?2:0))decodedMaterialIssues.push({file:actor.path,material:material.name,message:'Approved style-specific HairCards sidedness did not load.'});
          // r160 GLTFLoader negates normalScale.y when deriving missing tangents.
          // The structural audit separately requires exported scalar1; validate its
          // runtime magnitude here while preserving the loader's handedness.
          if(material.name==='HairCards'&&(!material.normalScale||Math.abs(material.normalScale.x-1)>1e-7||Math.abs(Math.abs(material.normalScale.y)-1)>1e-7))decodedMaterialIssues.push({file:actor.path,material:material.name,message:'Approved HairCards normal-scale magnitude did not load as1 (r160 may invert derivative-tangent Y).'});
          if(material.name==='EyesCornea'&&(!material.isMeshPhysicalMaterial||Math.abs(material.ior-1.376)>1e-6||material.transparent||material.transmission!==0))decodedMaterialIssues.push({file:actor.path,material:material.name,message:'Portable opaque IOR1.376 cornea did not load correctly.'});
          decodedMaterials.push({name:material.name,type:material.type,maps,alphaTest:material.alphaTest,transparent:material.transparent,side:material.side,normalScale:material.normalScale?.toArray()||null,ior:material.ior??null,clearcoat:material.clearcoat??null,transmission:material.transmission??null});
        }
        const handVertices=Object.fromEntries(['LeftHand','RightHand'].map(name=>[name,[]]));
        if(denseFloor)for(const mesh of actor.meshes){
          const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
          if(!indices||!weights||!mesh.skeleton)continue;
          for(const name of Object.keys(handVertices)){
            const boneIndex=mesh.skeleton.bones.findIndex(bone=>bone.name===name);if(boneIndex<0)continue;
            const selected=[];
            for(let i=0;i<indices.count;i++){
              const joints=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)],values=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
              let contribution=0;for(let k=0;k<4;k++)if(joints[k]===boneIndex)contribution+=values[k];
              if(contribution>=.5)selected.push(i);
            }
            if(selected.length)handVertices[name].push({mesh,indices:selected});
          }
        }
        let localMaximum=0;const worst=[],denseClips=[];
        for(const clip of clips){api.setClip(clip.id);for(const phase of phases){api.seek(phase);const r=compare(actor,clip.id+'@'+phase);localMaximum=Math.max(localMaximum,r.absoluteErrorMeters);if(r.absoluteErrorMeters>1e-6)worst.push(r);}}
        if(denseFloor)for(const clip of clips){
          api.setPlaying(false);api.setClip(clip.id);api.seek(0);api.setPlaying(true);
          const frames=Math.ceil(clip.duration*denseSampleRateHz);let minimumY=Infinity,anchorError=0;
          let handSupportSamples=0,maximumHandSupportAnchorDistance=0,maximumHandSupportVerticalGap=0;
          let minimumHandSurfaceY=Infinity,maximumMinimumHandSurfaceY=-Infinity,maximumNearestHandSurfaceAnchorDistance=0;
          let physicalPalmSamples=0,missingPhysicalPalmSamples=0,maximumPhysicalPalmHeight=-Infinity,maximumPhysicalPalmAnchorDistance=0,maximumPhysicalPalmXZTravel=0,maximumPhysicalPalmAnchorMutation=0;
          const expectedPhysicalPalmIntervals=(clip.contacts||[]).filter(contact=>contact.mode==='hand-support').length;
          const physicalPalmContacts=new Map(),physicalPalmFailures=[];
          for(let i=0;i<=frames;i++){
            if(i)api.step(1/denseSampleRateHz);
            const r=compare(actor,'dense/'+clip.id+'/'+i);
            localMaximum=Math.max(localMaximum,r.absoluteErrorMeters);minimumY=Math.min(minimumY,r.reference);denseSamples++;
            if(r.absoluteErrorMeters>1e-6&&worst.length<8)worst.push(r);
            for(const lock of actor.locks.values()){
              const bone=actor.bones[lock.bone],sole=bone.localToWorld(bone.position.clone().set(0,-.08,0));
              anchorError=Math.max(anchorError,sole.distanceTo(lock.anchor));
            }
            const local=clip.loop?((actor.sampleSeconds%clip.duration)+clip.duration)%clip.duration:Math.min(clip.duration,Math.max(0,actor.sampleSeconds));
            for(const contact of clip.contacts||[])if(contact.mode==='hand-support'&&contact.start-1e-8<=local&&local<=contact.end+1e-8){
              const bone=actor.bones[contact.bone];if(!bone)continue;
              const palm=bone.localToWorld(bone.position.clone().fromArray(contact.contactPointOffsetMeters||[0,0,0]));
              const anchor=actor.referencePoint(contact.anchor).add(actor.offset).add(actor.origin);
              handSupportSamples++;maximumHandSupportAnchorDistance=Math.max(maximumHandSupportAnchorDistance,palm.distanceTo(anchor));
              maximumHandSupportVerticalGap=Math.max(maximumHandSupportVerticalGap,Math.abs(palm.y-anchor.y));
              let minimumSurfaceY=Infinity,nearestSurfaceDistance=Infinity;const vertex=palm.clone();
              for(const piece of handVertices[contact.bone]||[])for(const index of piece.indices){
                piece.mesh.getVertexPosition(index,vertex);vertex.applyMatrix4(piece.mesh.matrixWorld);
                minimumSurfaceY=Math.min(minimumSurfaceY,vertex.y);nearestSurfaceDistance=Math.min(nearestSurfaceDistance,vertex.distanceTo(anchor));
              }
              if(Number.isFinite(minimumSurfaceY)){minimumHandSurfaceY=Math.min(minimumHandSurfaceY,minimumSurfaceY);maximumMinimumHandSurfaceY=Math.max(maximumMinimumHandSurfaceY,minimumSurfaceY);maximumNearestHandSurfaceAnchorDistance=Math.max(maximumNearestHandSurfaceAnchorDistance,nearestSurfaceDistance);}
              const support=actor.recoveryDescriptor().palmSupports?.find(value=>value.bone===contact.bone&&value.clipID===clip.id&&value.phase==='plant');
              const validation=support?actualPalmWitness.validateCalibration(contact.bone,support.calibration):null;
              const sampled=validation?.valid?actualPalmWitness.sampleWorld(validation):null,physicalAnchor=support?.anchorWorldMeters;
              const sourceIntervalMatches=support&&Math.abs(support.sourceContactStartSeconds-contact.start)<=1e-7&&Math.abs(support.sourceContactEndSeconds-contact.end)<=1e-7;
              const solverPositive=support?.solverName==='nativePalmSurfaceIK'&&support.solverIterations>0&&Number.isInteger(support.solveCount)&&support.solveCount>0&&Number.isFinite(support.lastSolveClock)&&Math.abs(support.lastSolveClock-actor.clock)<1e-7;
              if(!sampled||!Array.isArray(physicalAnchor)||physicalAnchor.length!==3||!physicalAnchor.every(Number.isFinite)||typeof support.key!=='string'||!sourceIntervalMatches||!Number.isFinite(support.weight)||support.weight<1-1e-6||!solverPositive){
                missingPhysicalPalmSamples++;if(physicalPalmFailures.length<8)physicalPalmFailures.push({sample:i,bone:contact.bone,sourceSeconds:local,kind:'missing-or-invalid-physical-palm-support',sourceIntervalMatches:Boolean(sourceIntervalMatches),solverPositive,issues:validation?.issues||[],support:structuredClone(support||null)});
              }else{
                physicalPalmSamples++;
                const point=sampled.point,error=Math.hypot(...point.map((value,k)=>value-physicalAnchor[k]));
                maximumPhysicalPalmHeight=Math.max(maximumPhysicalPalmHeight,point[1]);maximumPhysicalPalmAnchorDistance=Math.max(maximumPhysicalPalmAnchorDistance,error);
                const intervalKey=[clip.id,contact.bone,contact.start,contact.end].join('/');
                if(!physicalPalmContacts.has(intervalKey))physicalPalmContacts.set(intervalKey,{key:support.key,point:point.slice(),anchor:physicalAnchor.slice()});
                const first=physicalPalmContacts.get(intervalKey),travel=Math.hypot(point[0]-first.point[0],point[2]-first.point[2]),mutation=Math.hypot(...physicalAnchor.map((value,k)=>value-first.anchor[k]));
                maximumPhysicalPalmXZTravel=Math.max(maximumPhysicalPalmXZTravel,travel);maximumPhysicalPalmAnchorMutation=Math.max(maximumPhysicalPalmAnchorMutation,mutation);
                if((point[1]<-.001||point[1]>.003||error>.003||travel>.003||mutation>1e-8||first.key!==support.key)&&physicalPalmFailures.length<8)physicalPalmFailures.push({sample:i,bone:contact.bone,sourceSeconds:local,kind:'physical-palm-support-outside-gate',point,anchor:physicalAnchor,anchorDistanceMeters:error,xzTravelMeters:travel,anchorMutationMeters:mutation,sourceIntervalKey:intervalKey,originalSupportKey:first.key,currentSupportKey:support.key,triangleVertices:sampled.vertices});
              }
            }
          }
          api.setPlaying(false);maximumAnchorError=Math.max(maximumAnchorError,anchorError);
          const physicalPalmPass=expectedPhysicalPalmIntervals===0||physicalPalmContacts.size===expectedPhysicalPalmIntervals&&handSupportSamples>0&&physicalPalmSamples===handSupportSamples&&missingPhysicalPalmSamples===0&&maximumPhysicalPalmHeight<=.003&&maximumPhysicalPalmAnchorDistance<=.003&&maximumPhysicalPalmXZTravel<=.003&&maximumPhysicalPalmAnchorMutation<=1e-8&&physicalPalmFailures.length===0;
          denseClips.push({id:clip.id,sampleRateHz:denseSampleRateHz,samples:frames+1,minimumReferenceVertexY:minimumY,maximumActiveSoleAnchorErrorMeters:anchorError,...((handSupportSamples||expectedPhysicalPalmIntervals)?{handSupport:{samples:handSupportSamples,maximumAuthoredAnchorDistanceMeters:maximumHandSupportAnchorDistance,maximumVerticalGapMeters:maximumHandSupportVerticalGap,minimumHandWeightedVertexY:Number.isFinite(minimumHandSurfaceY)?minimumHandSurfaceY:null,maximumMinimumHandWeightedVertexY:Number.isFinite(maximumMinimumHandSurfaceY)?maximumMinimumHandSurfaceY:null,maximumNearestHandVertexToAuthoredAnchorDistanceMeters:Number.isFinite(minimumHandSurfaceY)?maximumNearestHandSurfaceAnchorDistance:null,handVertexSelection:'Vertices with at least50% weight on the supporting Hand bone, including palm/fingers/gloves; every selected vertex evaluated with general Three skinning.',authoredMarkerIsDescriptive:true,physicalPalm:{intervals:physicalPalmContacts.size,requiredIntervals:expectedPhysicalPalmIntervals,samples:physicalPalmSamples,requiredSamples:handSupportSamples,missingOrInvalidSamples:missingPhysicalPalmSamples,maximumHeightMeters:Number.isFinite(maximumPhysicalPalmHeight)?maximumPhysicalPalmHeight:null,maximumAnchorDistanceMeters:maximumPhysicalPalmAnchorDistance,maximumSamePatchXZTravelMeters:maximumPhysicalPalmXZTravel,maximumAnchorMutationMeters:maximumPhysicalPalmAnchorMutation,failures:physicalPalmFailures,pass:physicalPalmPass,method:'Independent fixed anatomical heel-palm ray and actual fully skinned mixed Hand/ForeArm barycentric triangle; required on every active native hand-support sample.'},note:'Original authored marker and whole Hand-weighted surface statistics remain descriptive. Physical contact is gated separately by the independently validated anatomical patch.'}}:{}),pass:minimumY>=-.001&&anchorError<=.003&&physicalPalmPass});
          if(denseClips.length%8===0)await globalThis.__skinningAuditProgress({character:character.id,lod:level,clips:denseClips.length,total:clips.length});
        }
        api.setClip('run_2');api.seek(.1);api.setPlaying(true);
        for(const pair of pairs)for(const id of pair){api.setClip(id);for(let i=0;i<12;i++){api.step(1/120);const r=compare(actor,'transition/'+id+'/'+i);localMaximum=Math.max(localMaximum,r.absoluteErrorMeters);if(r.absoluteErrorMeters>1e-6)worst.push(r);}}
        api.setPlaying(false);
        models.push({file:actor.path,expectedSha256:inspector.data.hashes?.models?.[actor.path],decodedMaterials});rows.push({character:character.id,lod:level,maximumAbsoluteErrorMeters:localMaximum,pass:localMaximum<=1e-6&&denseClips.every(c=>c.pass),worst:worst.slice(0,8),...(denseFloor?{denseClips}:{})});
        await globalThis.__skinningAuditProgress({character:character.id,lod:level,complete:true,samples,maximumAbsoluteErrorMeters:localMaximum});
      }
      if(lodLifecycle){
        // Exercise genuine overlapping rebuilds, including repeated in-flight paths.
        const first=characters[0],last=characters.at(-1),middle=characters[Math.floor(characters.length/2)];
        api.setPlaying(false);
        const pending=[api.setCharacter(first.id),api.setLOD(1),api.setCharacter(middle.id),api.setCharacter(first.id),api.setCharacter(last.id),api.setLOD(0)];
        const settled=await Promise.allSettled(pending),current=api.inspect(),actor=current.actors[0];
        const expectedPath=last.kits[0].lod0,cachePaths=current.cachedTemplatePaths||[];
        const visibleMeshSet=new Set();
        current.scene.traverse(object=>{if(!object.isSkinnedMesh)return;let visible=true;for(let parent=object;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}if(visible)visibleMeshSet.add(object);});
        const actorMeshes=new Set(actor.meshes),unexpectedVisibleMeshes=[...visibleMeshSet].filter(mesh=>!actorMeshes.has(mesh)).length;
        const closedImages=[];
        for(const mesh of actor.meshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(material?.[key]){
          const source=material[key].source?.data||material[key].image;if(!(source?.width||source?.naturalWidth)||!(source?.height||source?.naturalHeight))closedImages.push({material:material.name,map:key});
        }
        const rejected=settled.filter(result=>result.status==='rejected').map(result=>String(result.reason));
        const floor=actor.minimumYReference(),pass=!rejected.length&&current.actors.length===1&&actor.path===expectedPath&&cachePaths.length===1&&cachePaths[0]===expectedPath&&!unexpectedVisibleMeshes&&!closedImages.length&&floor>=-.001;
        rebuildLifecycle.push({requestedCharacter:last.id,requestedLOD:0,expectedPath,actualPath:actor.path,rebuildRequests:pending.length,rejected,activeActors:current.actors.length,cachedTemplatePaths:cachePaths,visibleSkinnedMeshes:visibleMeshSet.size,expectedVisibleSkinnedMeshes:actorMeshes.size,unexpectedVisibleSkinnedMeshes:unexpectedVisibleMeshes,closedImages,minimumReferenceVertexY:floor,pass});
        const snapshot=actor=>{
          const descriptor=actor.recoveryDescriptor(),bodyLive=descriptor.bodySettling?structuredClone(descriptor.bodySettling):null;
          const bodyState=bodyLive?{risePlan:structuredClone(descriptor.risePlan||null),plan:structuredClone(descriptor.risePlan?.bodySettlePlan||null),dynamic:Object.fromEntries(['active','phase','offsetMeters','velocityMps','processedClock','elapsed','elapsedSeconds','deadlineMissed','carryWeight'].map(key=>[key,bodyLive[key]??null]))}:null;
          let bodyMinimumY=null;
          if(bodyLive?.active){bodyMinimumY=Infinity;const point=actor.world.clone();for(const mesh of actor.meshes){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!materials.some(material=>material&&!material.transparent&&!(material.alphaTest>0)&&material.name!=='HairCards'))continue;const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const js=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)],ws=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];let excludedWeight=0;for(let k=0;k<4;k++)if(/(?:Foot|Hand)$/.test(mesh.skeleton.bones[js[k]].name))excludedWeight+=ws[k];if(excludedWeight<.5){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);bodyMinimumY=Math.min(bodyMinimumY,point.y);}}}}
          const palmWitness=makePalmWitness({api,actor,calibrationCache:palmCalibrationCache});
          const palms=(descriptor.palmSupports||[]).map(support=>{
            const validation=palmWitness.validateCalibration(support.bone,support.calibration),sampled=validation.valid?palmWitness.sampleWorld(validation):null,anchor=support.anchorWorldMeters;
            const anchorDistance=sampled&&Array.isArray(anchor)?Math.hypot(...sampled.point.map((value,i)=>value-anchor[i])):null;
            const anchorXZDistance=sampled&&Array.isArray(anchor)?Math.hypot(sampled.point[0]-anchor[0],sampled.point[2]-anchor[2]):null;
            const solverPositive=support.solverName==='nativePalmSurfaceIK'&&support.solverIterations>0&&Number.isInteger(support.solveCount)&&support.solveCount>0&&Number.isFinite(support.lastSolveClock)&&Math.abs(support.lastSolveClock-actor.clock)<1e-7;
            return{support:structuredClone(support),calibrationValid:validation.valid,issues:validation.issues,point:sampled?.point||null,triangleVertices:sampled?.vertices||null,anchorDistanceMeters:anchorDistance,anchorXZDistanceMeters:anchorXZDistance,solverPositive,physical:validation.valid&&support.phase==='plant'&&support.weight>=1-1e-6&&solverPositive&&sampled.point[1]>=-.001&&sampled.point[1]<=.003&&anchorDistance!=null&&anchorDistance<=.003&&anchorXZDistance<=.003};
          });
          const palmStates=palms.map(({support})=>Object.fromEntries(['key','bone','clipID','sourceContactStartSeconds','sourceContactEndSeconds','phase','weight','anchorWorldMeters','orientationWorld','startedAtClock','approachSeconds','releaseSeconds','lastSolveClock','solveCount'].map(key=>[key,support[key]??null]))).sort((a,b)=>String(a.key).localeCompare(String(b.key)));
          const palmBodyCompression=actor.palmBodyCompression?structuredClone(actor.palmBodyCompression):null,palmBodyCompressionDescriptor=descriptor.palmBodyCompression?structuredClone(descriptor.palmBodyCompression):null;
          return{
          clock:actor.clock,world:actor.world.toArray(),modelFile:actor.path,modelSha256:api.inspect().data.hashes.models[actor.path],
          worldHistory:actor.worldRotations&&structuredClone(actor.worldRotations),previousWorldHistory:actor.previousWorldRotations&&structuredClone(actor.previousWorldRotations),
          phase:Object.fromEntries(['sampleSeconds','phaseOffset','phaseRate','entryPhaseRate','pathScale'].map(key=>[key,actor[key]??null])),
          rootBlendClock:actor.rootBlend?Object.fromEntries(['elapsed','lastTime','lastSampleSeconds'].map(key=>[key,actor.rootBlend[key]??null])):null,
          motorEntryState:{pelvisContinuing:Boolean(actor.motorPelvisEntry),hip:actor.motorHipEntry?structuredClone(actor.motorHipEntry):null,orientation:actor.motorEntryFade?structuredClone(actor.motorEntryFade):null},
          bodySupport:{state:bodyState,live:bodyLive,minimumReferenceNonHandNonFootVertexY:bodyMinimumY,selection:'Opaque rendered geometry with combined Hand/Foot influence below0.5; alpha hair excluded.'},
          palms,palmStates,rawPalmSupportStates:structuredClone(actor.palmSupportStates||{}),palmBodyCompression,palmBodyCompressionDescriptor,
          bones:Object.fromEntries(Object.entries(actor.bones).map(([name,bone])=>[name,{position:bone.getWorldPosition(bone.position.clone()).toArray(),quaternion:bone.getWorldQuaternion(bone.quaternion.clone()).normalize()}])),
          pending:[...actor.landings].map(([bone,landing])=>({bone,key:landing.key,mode:landing.mode||'landing',start:landing.start,duration:landing.duration})),
          contacts:[...actor.locks.values()].map(lock=>({bone:lock.bone,key:lock.key,anchor:lock.anchor.toArray(),release:lock.release})),
          contactTargets:[...(actor.contactTargets||new Map())].map(([key,anchor])=>({key,anchor:anchor.toArray()})),
        };};
        for(const lifecycleCharacter of characters)for(const sequence of lifecycleSequences){
          api.setPlaying(false);await api.setCharacter(lifecycleCharacter.id);await api.setLOD(0);api.setClip(sequence.start);api.seek(sequence.phase);
          {const cold=api.inspect().actors[0];let maximumHistoryAngle=0;for(const [name,bone] of Object.entries(cold.bones)){const saved=cold.worldRotations?.[name];if(!saved){maximumHistoryAngle=Infinity;break;}maximumHistoryAngle=Math.max(maximumHistoryAngle,bone.getWorldQuaternion(bone.quaternion.clone()).normalize().angleTo(bone.quaternion.clone().fromArray(saved).normalize()));}const pass=!cold.previousWorldRotations&&!cold.previous&&!cold.fade&&!cold.rootBlend&&maximumHistoryAngle<1e-6;coldSeekLifecycle.push({character:lifecycleCharacter.id,clip:sequence.start,phase:sequence.phase,previousWorldHistoryCleared:!cold.previousWorldRotations,localPreviousCleared:!cold.previous,fadeCleared:!cold.fade,rootBlendCleared:!cold.rootBlend,maximumActualWorldHistoryAngleRadians:maximumHistoryAngle,pass});}
          api.setPlaying(true);if(sequence.next)api.setClip(sequence.next);
          for(let i=0;i<Math.round(sequence.advance*120);i++)api.step(1/120);
          for(const level of [1,0]){
            const before=snapshot(api.inspect().actors[0]);await api.setLOD(level);const actor=api.inspect().actors[0],after=snapshot(actor);
            let maxPosition=0,maxAngle=0;let positionBone,rotationBone;
            for(const name of Object.keys(before.bones)){
              const a=before.bones[name],b=after.bones[name],distance=Math.hypot(...a.position.map((v,i)=>v-b.position[i])),angle=a.quaternion.angleTo(b.quaternion)*180/Math.PI;
              if(distance>maxPosition){maxPosition=distance;positionBone=name;}if(angle>maxAngle){maxAngle=angle;rotationBone=name;}
            }
            const pendingPreserved=before.pending.every(old=>after.pending.some(now=>old.bone===now.bone&&old.key===now.key&&old.mode===now.mode&&Math.abs(old.start-now.start)<1e-9&&Math.abs(old.duration-now.duration)<1e-9));
            const anchorPreserved=(old,list)=>list.some(now=>old.key===now.key&&(!old.bone||old.bone===now.bone)&&Math.hypot(...old.anchor.map((v,i)=>v-now.anchor[i]))<1e-8&&(!('release' in old)||Math.abs(old.release-now.release)<1e-9));
            const contactsPreserved=before.contacts.every(old=>anchorPreserved(old,after.contacts)),contactTargetsPreserved=before.contactTargets.every(old=>anchorPreserved(old,after.contactTargets));
            const historyError=(old,now)=>{if(!old||!now)return old===now?0:Infinity;let maximum=0;for(const [name,value] of Object.entries(old)){if(!now[name])return Infinity;maximum=Math.max(maximum,actor.bones[name].quaternion.clone().fromArray(value).normalize().angleTo(actor.bones[name].quaternion.clone().fromArray(now[name]).normalize()));}return maximum;};
            const maximumWorldHistoryAngle=historyError(before.worldHistory,after.worldHistory),maximumPreviousWorldHistoryAngle=historyError(before.previousWorldHistory,after.previousWorldHistory);
            let maximumActualWorldHistoryAngle=0;for(const [name,bone] of Object.entries(after.bones)){const saved=after.worldHistory?.[name];if(!saved){maximumActualWorldHistoryAngle=Infinity;break;}maximumActualWorldHistoryAngle=Math.max(maximumActualWorldHistoryAngle,bone.quaternion.angleTo(actor.bones[name].quaternion.clone().fromArray(saved).normalize()));}
            const worldHistoryConsistent=maximumPreviousWorldHistoryAngle<1e-6&&maximumActualWorldHistoryAngle<1e-6;
            const scalarStatePreserved=(old,now)=>old===null?now===null:now!==null&&Object.entries(old).every(([key,value])=>value===null?now[key]===null:Math.abs(value-now[key])<1e-8);
            const phasePreserved=scalarStatePreserved(before.phase,after.phase),rootBlendClockPreserved=scalarStatePreserved(before.rootBlendClock,after.rootBlendClock);
            const floor=actor.minimumYReference(),clockError=Math.abs(before.clock-after.clock);
            const motorEntryStatePreserved=JSON.stringify(before.motorEntryState)===JSON.stringify(after.motorEntryState);
            const bodySupportStatePreserved=JSON.stringify(before.bodySupport.state)===JSON.stringify(after.bodySupport.state);
            const requiresNonzeroSettle=sequence.expectedSupport==='body-settle'&&lifecycleCharacter.id==='player-03';
            const currentBodyWitness=pose=>Number.isFinite(pose.bodySupport.state?.dynamic.processedClock)&&Math.abs(pose.bodySupport.state.dynamic.processedClock-pose.clock)<1e-7&&pose.bodySupport.live?.actualGeometryWitness?.modelSha256===pose.modelSha256;
            const bodySupportActive=sequence.expectedSupport!=='body-settle'||[before,after].every(pose=>pose.bodySupport.state?.plan?.firstFootTransferConcurrent===true&&pose.bodySupport.state.dynamic.offsetMeters>=0&&(!requiresNonzeroSettle||pose.bodySupport.state.dynamic.offsetMeters>0)&&pose.bodySupport.state.dynamic.active===true&&pose.bodySupport.state.dynamic.carryWeight>0&&currentBodyWitness(pose)&&pose.bodySupport.minimumReferenceNonHandNonFootVertexY<=.008);
            const requiredPalmBones=sequence.expectedSupport==='bilateral-palm-support'?['LeftHand','RightHand']:sequence.expectedSupport==='palm-support'?['LeftHand']:[];
            const hasRequiredPalms=pose=>requiredPalmBones.every(bone=>pose.palms.some(palm=>palm.support.bone===bone&&palm.support.clipID===sequence.start&&palm.physical));
            const palmSupportActive=hasRequiredPalms(before)&&hasRequiredPalms(after);
            const palmStatesPreserved=JSON.stringify(before.palmStates)===JSON.stringify(after.palmStates);
            const rawPalmSupportStatesPreserved=JSON.stringify(before.rawPalmSupportStates)===JSON.stringify(after.rawPalmSupportStates);
            const palmBodyCompressionPreserved=JSON.stringify(before.palmBodyCompression)===JSON.stringify(after.palmBodyCompression);
            const compressionActive=pose=>{
              const compression=pose.palmBodyCompression;
              return compression?.kind==='nativePalmHipsCompression'&&compression.clipID==='get_up'&&compression.weight>=1-1e-6&&compression.offsetMeters>0&&compression.offsetMeters<=compression.maximumPlannedOffsetMeters+1e-8&&Math.abs(compression.clock-pose.clock)<1e-7&&compression.fixedFootResidualMeters<=.003&&['LeftFoot','RightFoot'].every(bone=>Array.isArray(compression.feet?.[bone]?.position)&&Array.isArray(compression.feet[bone].orientation)&&Array.isArray(compression.feet[bone].pole))&&JSON.stringify(compression)===JSON.stringify(pose.palmBodyCompressionDescriptor);
            };
            const palmBodyCompressionActive=sequence.expectedSupport!=='bilateral-palm-support'||compressionActive(before)&&compressionActive(after);
            const palmAnchorsPreserved=before.palms.every(old=>{const current=after.palms.find(now=>now.support.key===old.support.key&&now.support.bone===old.support.bone);return current&&JSON.stringify(old.support.anchorWorldMeters)===JSON.stringify(current.support.anchorWorldMeters);});
            // dt=0 pose preservation alone cannot expose a lost pelvis cap or
            // inertial reference. Check the first real frame after rehydration.
            api.step(1/120);const advancing=snapshot(actor),advanceDt=advancing.clock-after.clock;
            let advancingMaximumBoneRadiansPerSecond=0,advancingMaximumRootRelativeBoneSpeedMps=0;
            let advancingAngularBone=null,advancingLinearBone=null;
            for(const name of Object.keys(after.bones)){
              const old=after.bones[name],now=advancing.bones[name];
              const angle=old.quaternion.angleTo(now.quaternion)/advanceDt;
              const distance=Math.hypot(...old.position.map((v,k)=>(v-after.world[k])-(now.position[k]-advancing.world[k])))/advanceDt;
              if(name!=='Root'&&angle>advancingMaximumBoneRadiansPerSecond){advancingMaximumBoneRadiansPerSecond=angle;advancingAngularBone=name;}
              if(distance>advancingMaximumRootRelativeBoneSpeedMps){advancingMaximumRootRelativeBoneSpeedMps=distance;advancingLinearBone=name;}
            }
            const advancingFloor=actor.minimumYReference(),advancingPhysicalPass=advanceDt>0&&advancingMaximumBoneRadiansPerSecond<=30&&advancingMaximumRootRelativeBoneSpeedMps<=25&&advancingFloor>=-.001;
            const advancingBodySupportPass=sequence.expectedSupport!=='body-settle'||advancing.bodySupport.state?.dynamic.active===true&&advancing.bodySupport.state.dynamic.carryWeight>0&&currentBodyWitness(advancing)&&advancing.bodySupport.minimumReferenceNonHandNonFootVertexY<=.008;
            const advancingPalmSupportPass=hasRequiredPalms(advancing);
            const advancingPalmBodyCompressionPass=sequence.expectedSupport!=='bilateral-palm-support'||compressionActive(advancing);
            let maximumPalmPointXZJumpMeters=0;
            const advancingPalmAnchorsPreserved=requiredPalmBones.every(bone=>{
              const first=before.palms.find(palm=>palm.support.bone===bone&&palm.support.clipID===sequence.start),middle=after.palms.find(palm=>palm.support.bone===bone&&palm.support.clipID===sequence.start),last=advancing.palms.find(palm=>palm.support.bone===bone&&palm.support.clipID===sequence.start);
              if(!first?.point||!middle?.point||!last?.point)return false;
              for(const[a,b]of[[first,middle],[middle,last]])maximumPalmPointXZJumpMeters=Math.max(maximumPalmPointXZJumpMeters,Math.hypot(a.point[0]-b.point[0],a.point[2]-b.point[2]));
              return first.support.key===last.support.key&&JSON.stringify(first.support.anchorWorldMeters)===JSON.stringify(last.support.anchorWorldMeters);
            });
            lifecycle.push({character:lifecycleCharacter.id,sourcePhase:sequence.phase,requestedAdvanceSeconds:sequence.advance,sequence:sequence.start+'→'+sequence.next,lod:level,modelBefore:{file:before.modelFile,sha256:before.modelSha256},modelAfter:{file:after.modelFile,sha256:after.modelSha256},maximumWorldBonePositionJumpMeters:maxPosition,positionBone,maximumWorldBoneRotationJumpDegrees:maxAngle,rotationBone,clockErrorSeconds:clockError,minimumReferenceVertexY:floor,pendingBefore:before.pending,pendingAfter:after.pending,pendingPreserved,contactsBefore:before.contacts,contactsAfter:after.contacts,contactsPreserved,contactTargetsBefore:before.contactTargets,contactTargetsAfter:after.contactTargets,contactTargetsPreserved,phaseBefore:before.phase,phaseAfter:after.phase,phasePreserved,rootBlendClockBefore:before.rootBlendClock,rootBlendClockAfter:after.rootBlendClock,rootBlendClockPreserved,motorEntryBefore:before.motorEntryState,motorEntryAfter:after.motorEntryState,motorEntryStatePreserved,expectedSupport:sequence.expectedSupport||null,bodySupportBefore:before.bodySupport,bodySupportAfter:after.bodySupport,bodySupportAdvancing:advancing.bodySupport,bodySupportStatePreserved,requiresNonzeroSettle,bodySupportActive,advancingBodySupportPass,requiredPalmBones,palmsBefore:before.palms,palmsAfter:after.palms,palmsAdvancing:advancing.palms,palmSupportActive,palmAnchorsPreserved,palmStatesBefore:before.palmStates,palmStatesAfter:after.palmStates,palmStatesPreserved,rawPalmSupportStatesBefore:before.rawPalmSupportStates,rawPalmSupportStatesAfter:after.rawPalmSupportStates,rawPalmSupportStatesPreserved,palmBodyCompressionBefore:before.palmBodyCompression,palmBodyCompressionAfter:after.palmBodyCompression,palmBodyCompressionAdvancing:advancing.palmBodyCompression,palmBodyCompressionPreserved,palmBodyCompressionActive,advancingPalmBodyCompressionPass,advancingPalmSupportPass,advancingPalmAnchorsPreserved,maximumPalmPointXZJumpMeters,advancingMaximumBoneRadiansPerSecond,advancingAngularBone,advancingMaximumRootRelativeBoneSpeedMps,advancingLinearBone,advancingMinimumReferenceVertexY:advancingFloor,advancingPhysicalPass,maximumWorldHistoryAngleRadians:maximumWorldHistoryAngle,maximumPreviousWorldHistoryAngleRadians:maximumPreviousWorldHistoryAngle,maximumActualWorldHistoryAngleRadians:maximumActualWorldHistoryAngle,worldHistoryConsistent,pass:maxPosition<=.003&&maxAngle<=1&&clockError<1e-9&&pendingPreserved&&contactsPreserved&&contactTargetsPreserved&&phasePreserved&&rootBlendClockPreserved&&motorEntryStatePreserved&&bodySupportStatePreserved&&bodySupportActive&&advancingBodySupportPass&&palmSupportActive&&palmStatesPreserved&&rawPalmSupportStatesPreserved&&palmBodyCompressionPreserved&&palmBodyCompressionActive&&advancingPalmBodyCompressionPass&&palmAnchorsPreserved&&advancingPalmSupportPass&&advancingPalmAnchorsPreserved&&maximumPalmPointXZJumpMeters<=.003&&advancingPhysicalPass&&worldHistoryConsistent&&floor>=-.001});
          }
        }
      }
    }finally{renderer.render=render;api.setPlaying(false);}
    const runtimeErrors=api.state().errors||[];
    const envelope=inspector.data.floor,hashes=inspector.data.hashes;
    const packagedEnvelope={present:!!envelope,complete:!!envelope?.complete,pass:!!envelope?.pass,motionMatches:envelope?.motionSha256===hashes.motion,helperMatches:envelope?.runtimeSha256===hashes.motionRuntime,allModelHashesMatch:Object.entries(hashes.models).every(([file,sha])=>envelope?.modelSha256?.[file]===sha)};
    packagedEnvelope.inputsVerified=packagedEnvelope.present&&packagedEnvelope.complete&&packagedEnvelope.pass&&packagedEnvelope.motionMatches&&packagedEnvelope.helperMatches&&packagedEnvelope.allModelHashesMatch;
    return{kind:'observed-viewer-full-mesh-skinning-equivalence',declaredPackageHashes:hashes,runtimeErrors,packagedEnvelope,threeRevision:inspector.data?.motion?.threeRevision||api.state().threeRevision,toleranceMeters:1e-6,samples,maximumAbsoluteErrorMeters:maximumDifference,minimumReferenceVertexY:minimumReferenceY,denseFloor,denseSampleRateHz,denseSamples,clipsEvaluated:clips.map(c=>c.id),totalClipCount:inspector.data.motion.clips.length,...(denseFloor?{floorToleranceMeters:.001,activeSoleAnchorToleranceMeters:.003,maximumActiveSoleAnchorErrorMeters:maximumAnchorError}:{}),models,rows,decodedMaterialIssues,coldSeekLifecycle:lodLifecycle?{identityCount:lifecycleIdentityCount,expectedCases:lifecycleIdentityCount*lifecycleSequences.length,cases:coldSeekLifecycle,pass:coldSeekLifecycle.length===lifecycleIdentityCount*lifecycleSequences.length&&coldSeekLifecycle.every(row=>row.pass)}:null,rebuildLifecycle:lodLifecycle?{cases:rebuildLifecycle,pass:rebuildLifecycle.every(row=>row.pass)}:null,lodLifecycle:lodLifecycle?{identityCount:lifecycleIdentityCount,expectedCases:lifecycleIdentityCount*lifecycleSequences.length*2,cases:lifecycle,pass:lifecycle.length===lifecycleIdentityCount*lifecycleSequences.length*2&&lifecycle.every(row=>row.pass),thresholds:{maximumWorldBonePositionJumpMeters:.003,maximumWorldBoneRotationJumpDegrees:1,maximumClockErrorSeconds:1e-9,maximumAdvancingBoneRadiansPerSecond:30,maximumAdvancingRootRelativeBoneSpeedMps:25,minimumReferenceVertexY:-.001}}:null,pass:runtimeErrors.length===0&&decodedMaterialIssues.length===0&&rows.every(r=>r.pass)&&(!denseFloor||minimumReferenceY>=-.001)&&(!lodLifecycle||(lifecycle.length===lifecycleIdentityCount*lifecycleSequences.length*2&&coldSeekLifecycle.length===lifecycleIdentityCount*lifecycleSequences.length))&&lifecycle.every(row=>row.pass)&&coldSeekLifecycle.every(row=>row.pass)&&rebuildLifecycle.every(row=>row.pass)};
  },{denseFloor,lodLifecycle,characterFilter,lodFilter,clipFilter,denseSampleRateHz,palmWitnessFactorySource});
  report.auditSource={file:'source/audit-skinning.mjs',sha256:auditSourceSha256};
  report.palmWitnessSource={file:'source/audit-action-observer.cjs',sha256:palmWitnessSourceSha256,factorySha256:sha256(palmWitnessFactorySource)};
  if(sha256(await fs.readFile(fileURLToPath(import.meta.url)))!==auditSourceSha256)errors.push('Audit source changed during run');
  if(sha256(await fs.readFile(palmWitnessPath))!==palmWitnessSourceSha256)errors.push('Independent palm witness source changed during run');
  report.currentInputs={};
  const declaredSourceFiles={manifest:'asset-manifest.json',motion:'animations.json',preview:'preview.js',motionRuntime:'source/motion-runtime.js',locomotion:'source/locomotion-space.js',locomotionCurve:'source/locomotion-curve.js',dribble:'source/locomotion-dribble.js',recovery:'source/recovery-state.js',scene:'source/scene.js',props:'source/props.js',palmSupport:'source/palm-support.js',bootBounds:'verification/boot-bounds.json'};
  for(const key of Object.keys(report.declaredPackageHashes))if(key!=='models'&&!Object.hasOwn(declaredSourceFiles,key))errors.push('Unrecognized declared package input has no skinning audit source witness: '+key);
  for(const [key,file] of Object.entries(declaredSourceFiles)){const bytes=await fs.readFile(path.join(root,file)),actual=sha256(bytes),expected=report.declaredPackageHashes[key];report.currentInputs[key]={file,bytes:bytes.length,sha256:actual,expectedSha256:expected};if(actual!==expected)errors.push('Packaged source differs from current disk: '+file);}
  for(const row of servedResources.values()){const actual=sha256(await fs.readFile(path.resolve(root,'.'+row.file)));if(actual!==row.sha256)errors.push('Served resource changed during run: '+row.file);}
  for(const model of report.models){const actual=sha256(await fs.readFile(path.join(root,model.file)));if(actual!==model.expectedSha256)errors.push('Current disk model differs from packaged snapshot: '+model.file);}
  report.generatedAt=new Date().toISOString();report.servedResources=[...servedResources.values()];report.errors=errors;report.remoteRequests=remoteRequests;
  for(const model of report.models){const actual=decodedModels.get(model.file);if(!actual)errors.push('Actual served GLB payload was not observed: '+model.file);else{Object.assign(model,actual);if(model.sha256!==model.expectedSha256)errors.push('Actual served GLB differs from snapshot manifest: '+model.file);}}
  report.method='Actual bundled viewer, selected delivered models/LODs and clips×7 deterministic times (defaults: all16 models/all31clips), plus interrupted transition poses. Compare every decoded vertex using optimized Y-row evaluator against Three.SkinnedMesh.getVertexPosition+matrixWorld. Optional --dense-floor advances each actual displayed clip at the recorded30/60/120Hz, checking reference full-mesh floor, active sole anchors, descriptive original authored hand markers and independently validated physical heel-palm contacts on every native hand-support interval. GPU draws suppressed; rendering performance is tested separately.';
  report.complete=report.models.length===16&&report.clipsEvaluated.length===report.totalClipCount;report.pass&&=errors.length===0&&remoteRequests.length===0&&(!report.complete||!denseFloor||report.packagedEnvelope.inputsVerified);
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  runState.status=report.pass?'pass':'fail';runState.reportSha256=sha256(await fs.readFile(out));
  console.log(JSON.stringify({pass:report.pass,complete:report.complete,models:report.models.length,samples:report.samples,maximumAbsoluteErrorMeters:report.maximumAbsoluteErrorMeters,output:out}));
  if(!report.pass)process.exitCode=1;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(runState.status==='running')runState.status='error';runState.endedAt=new Date().toISOString();await saveRunState();}
