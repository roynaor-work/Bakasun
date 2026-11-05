#!/usr/bin/env node
/**
 * Reproducible host-browser CPU/render profile for twelve far-LOD athletes.
 *
 * node workout/island/design/soccer-v7/characters/source/audit-cpu.mjs
 * Optional: --samples 120 --warmup 30 --cpu-throttle4 --out /tmp/cpu-profile.json
 *
 * The browser uses local HTTP solely because this managed Chromium blocks
 * file:// navigation. Remote HTTP requests are blocked and reported. SwiftShader
 * and the execution host are not a physical phone performance measurement.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2),arg=name=>argv.includes(name)?argv[argv.indexOf(name)+1]:undefined;
const samples=Number(arg('--samples')||120),warmup=Number(arg('--warmup')||30);
const throttleFour=argv.includes('--cpu-throttle4');
if(!Number.isInteger(samples)||samples<30||!Number.isInteger(warmup)||warmup<5)throw Error('At least 30 samples and 5 warmup frames required');
const output=arg('--out')?path.resolve(arg('--out')):path.join(root,'verification/cpu-profile.json');
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const manifest=JSON.parse(await fs.readFile(path.join(root,'asset-manifest.json'),'utf8'));
const fields=manifest.characters.filter(c=>c.role==='field'||c.role==='player');
if(manifest.characters.length!==8||fields.length!==6)throw Error('A complete eight-character/six-field-player library is required for a meaningful twelve-actor profile');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const auditSourceBytes=await fs.readFile(fileURLToPath(import.meta.url));
const auditSource={file:'source/audit-cpu.mjs',sha256:digest(auditSourceBytes),bytes:auditSourceBytes.length};
const startedAt=new Date().toISOString(),served=new Map(),payloads=new Map(),errors=[],remoteRequests=[];
const cgroupLimits={};
for(const name of ['cpu.max','memory.max'])try{cgroupLimits[name]=(await fs.readFile('/sys/fs/cgroup/'+name,'utf8')).trim();}catch{}
const runStatePath=path.join(os.tmpdir(),'soccer-v7-cpu-'+digest(output).slice(0,16)+'.json');
const runState={pid:process.pid,script:fileURLToPath(import.meta.url),sourceSha256:auditSource.sha256,output,startedAt,status:'running',completedConfigurations:[]};
const saveRunState=async()=>{const staging=runStatePath+'.'+process.pid+'.tmp';await fs.writeFile(staging,JSON.stringify(runState,null,2)+'\n');await fs.rename(staging,runStatePath);};
await saveRunState();console.log(JSON.stringify({runnerPID:process.pid,runStatePath,output}));
const mime={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{
  try{
    const local=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+local);
    if(!file.startsWith(root+path.sep))throw Error('Outside permitted package');
    // Freeze each served resource for the duration of the profile and retain
    // hashes of the actual HTTP response bytes, not just paths on disk.
    if(!served.has(local)){
      const bytes=await fs.readFile(file);served.set(local,{file,bytes,sha256:digest(bytes)});
      if(local.startsWith('/offline/')&&local.endsWith('.js')){
        const match=bytes.toString('utf8').match(/\[("[^\"]+")\]\s*=\s*"([A-Za-z0-9+/=]+)"/);
        if(!match)throw Error('Unexpected local GLB payload format');
        const glb=Buffer.from(match[2],'base64');payloads.set(JSON.parse(match[1]),{bytes:glb.length,sha256:digest(glb),payloadResource:local});
      }
    }
    const entry=served.get(local);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(entry.bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
const configurations=[
  {width:390,height:844,dpr:1.5},
  {width:844,height:390,dpr:1.5},
  {width:390,height:844,dpr:1},
  {width:844,height:390,dpr:1},
];
const results=[];
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  for(const configuration of configurations){
    const context=await browser.newContext({viewport:{width:configuration.width,height:configuration.height},deviceScaleFactor:configuration.dpr,isMobile:true,hasTouch:true});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push({configuration,message:String(error)}));
    page.on('console',message=>{if(message.type()==='error')errors.push({configuration,message:'Console: '+message.text()});});
    page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(origin+'/'))remoteRequests.push(request.url());});
    await page.route(/^https?:/,route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort('blockedbyclient'));
    // Preserve the production requestAnimationFrame loop. It can be paused for
    // deterministic no-render actor samples, then resumed for real cadence.
    await page.addInitScript(()=>{
      const nativeRequest=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window),pending=new Map(),suspended=new Map();
      let blocked=false,dummy=-1;
      window.requestAnimationFrame=callback=>{
        if(blocked){const id=dummy--;suspended.set(id,callback);return id;}
        let id;id=nativeRequest(time=>{pending.delete(id);callback(time);});pending.set(id,callback);return id;
      };
      window.cancelAnimationFrame=id=>{pending.delete(id);suspended.delete(id);if(id>=0)nativeCancel(id);};
      window.__cpuProfileRAF={
        pause(){blocked=true;for(const [id,callback]of pending){nativeCancel(id);suspended.set(id,callback);}pending.clear();},
        resume(){blocked=false;const callbacks=[...new Set(suspended.values())];suspended.clear();for(const callback of callbacks)window.requestAnimationFrame(callback);},
        pendingNames(){return[...pending.values(),...suspended.values()].map(callback=>callback.name||'<anonymous>');},
      };
    });
    try{
      const loadStarted=performance.now();
      await page.goto(origin+'/preview.html?paused&clean',{waitUntil:'load',timeout:60000});
      await page.waitForFunction(()=>globalThis.soccerV7?.ready,{timeout:60000});
      await page.evaluate(()=>soccerV7.ready);
      await page.evaluate(()=>window.__cpuProfileRAF.pause());
      let browseHistoryMemory=null;
      if(results.length===0)browseHistoryMemory=await page.evaluate(async()=>{
        const api=soccerV7;
        api.setPlaying(false);await api.setView('body');await api.setLOD(0);api.setLighting('stadium');api.setClip('idle');
        const snapshot=label=>{
          const inspection=api.inspect(),{actors,renderer}=inspection,textures=new Set();
          for(const actor of actors)actor.model.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(material[key]?.isTexture)textures.add(material[key]);});
          const channels=[...textures].map(texture=>({uuid:texture.uuid,name:texture.name||null,sourceUUID:texture.source?.uuid||null,sourceType:texture.image?.constructor?.name||null,width:texture.image?.width||0,height:texture.image?.height||0,mipmaps:texture.generateMipmaps!==false,format:texture.format,type:texture.type,colorSpace:texture.colorSpace}));
          const estimatedBytes=channels.reduce((sum,image)=>sum+Math.ceil(image.width*image.height*4*(image.mipmaps?4/3:1)),0);
          const paths=inspection.cachedTemplatePaths||inspection.cache?.templatePaths||null;
          return{label,activeActors:actors.length,activeModelPaths:[...new Set(actors.map(actor=>actor.path))],cachedTemplatePaths:paths,cachedTemplateCount:paths?.length??null,rendererMemory:{...renderer.info.memory},uniqueActorPBRTextureObjects:textures.size,textureChannels:channels,estimatedActorRGBA8WithMipmapsBytes:estimatedBytes,estimatedActorRGBA8WithMipmapsMiB:estimatedBytes/(1024*1024),jsHeap:performance.memory?{usedBytes:performance.memory.usedJSHeapSize,totalBytes:performance.memory.totalJSHeapSize}:null};
        };
        const snapshots=[snapshot('before browsing')],characters=api.inspect().data.manifest.characters;
        for(const [i,character]of characters.entries()){
          if(api.inspect().actors[0].identity!==character.id)await api.setCharacter(character.id);
          for(const level of i%2?[1,0]:[0,1]){
            if(!api.inspect().actors[0].path.endsWith('lod'+level+'.glb'))await api.setLOD(level);
            await new Promise(resolve=>setTimeout(resolve,0));snapshots.push(snapshot(character.id+' / LOD'+level));
          }
        }
        await api.setLOD(1);await api.setView('pitch');api.setLighting('stadium');
        await new Promise(resolve=>setTimeout(resolve,0));
        const final=snapshot('pitch after all eight identities and both LODs');snapshots.push(final);
        return{method:'Actual renderer resource counts and unique material texture objects after browsing all eight identities/both LODs, then twelve far actors. RGBA8+mip bytes are an actor-PBR estimate, not total VRAM telemetry.',totalVRAMMeasured:false,estimateExcludes:['Environment and shadow textures','Drawing color/depth buffers','Geometry and native-animation buffers','Driver and browser overhead'],snapshots,final,expectedActiveCharacterAtlases:6,expectedCharacterTextureChannels:18,approximately96MiBCharacterTextures:Math.abs(final.estimatedActorRGBA8WithMipmapsMiB-96)<1,sixCachedTemplatesObserved:final.cachedTemplateCount===null?null:final.cachedTemplateCount===6};
      });
      await page.evaluate(async()=>{soccerV7.setPlaying(false);await soccerV7.setView('pitch');await soccerV7.setLOD(1);soccerV7.setLighting('stadium');soccerV7.setClean(true);});
      const preflight=await page.evaluate(async payloadMetadata=>{
        const api=soccerV7,{actors,renderer,data,environment}=api.inspect(),gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
        const models=[];
        for(const file of [...new Set(actors.map(a=>a.path))]){
          const actual=payloadMetadata[file];if(!actual)throw Error('Actual served GLB payload unavailable for hashing: '+file);
          models.push({file,...actual,hashMethod:'Decoded actual served offline payload; no reliance on retained browser base64 or manifest digest'});
        }
        const drawing=renderer.getDrawingBufferSize({set(x,y){this.x=x;this.y=y;return this;},floor(){this.x=Math.floor(this.x);this.y=Math.floor(this.y);return this;}});
        return{
          actorCount:actors.length,actorTriangles:actors.reduce((n,a)=>n+a.triangles(),0),modelCount:models.length,models,
          activeActorPaths:actors.map(actor=>actor.path),allActorsUseFarLOD:actors.every(actor=>/-lod1\.glb$/.test(actor.path)),
          stadiumVisible:environment?.stadium?.visible===true,activeView:api.state().view,activeLighting:api.state().lighting,
          floorEnvelopeAvailable:!!(data.floor?.pass&&data.floor?.complete&&data.floor.motionSha256===data.hashes.motion&&data.floor.runtimeSha256===data.hashes.motionRuntime&&models.every(m=>data.floor.modelSha256[m.file]===m.sha256)),
          threeRevision:data?.hashes?.threeRevision||api.state().threeRevision,
          drawingBuffer:{width:drawing.x,height:drawing.y,pixels:drawing.x*drawing.y},pixelRatio:renderer.getPixelRatio(),
          webgl:{version:gl.getParameter(gl.VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedVendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null},
          browser:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGB:navigator.deviceMemory??null,devicePixelRatio,virtualMobileViewport:true},
          packageHashes:data.hashes||null,
          stateErrors:api.state().errors||[],
        };
      },Object.fromEntries(payloads));
      preflight.localLoadAndTwelveActorSetupWallMilliseconds=performance.now()-loadStarted;
      preflight.browseHistoryIncludedInSetupTiming=!!browseHistoryMemory;
      preflight.loadTimingLimit='Local in-memory HTTP on the execution host, including script/GLB decode, first render, optional full-history memory probe and metadata collection; not phone download latency.';
      if(preflight.actorCount!==12||preflight.modelCount!==6)throw Error('Expected twelve actors sharing six distinct far-LOD assets');
      if(!preflight.allActorsUseFarLOD||preflight.activeView!=='pitch'||preflight.activeLighting!=='stadium'||!preflight.stadiumVisible)throw Error('Actual profile preflight did not retain twelve far-LOD actors in the visible stadium: '+JSON.stringify({paths:preflight.activeActorPaths,view:preflight.activeView,lighting:preflight.activeLighting,stadiumVisible:preflight.stadiumVisible}));
      if(!preflight.floorEnvelopeAvailable)throw Error('A complete current SHA-verified floor envelope is required before final CPU profiling');
      if(preflight.stateErrors.length)throw Error('Viewer errors before profiling: '+JSON.stringify(preflight.stateErrors));
      if(preflight.models.some(model=>model.sha256!==preflight.packageHashes.models[model.file]))throw Error('Actual payload differs from declared model hash');
      if(browseHistoryMemory){
        const final=browseHistoryMemory.final;
        browseHistoryMemory.meetsActiveCacheBudget=final.cachedTemplateCount===6&&final.activeModelPaths.length===6&&final.uniqueActorPBRTextureObjects<=18&&final.estimatedActorRGBA8WithMipmapsMiB<=97&&final.textureChannels.every(channel=>channel.width>0&&channel.height>0&&channel.width<=1024&&channel.height<=1024);
        if(!browseHistoryMemory.meetsActiveCacheBudget)throw Error('Browsing history left unexpected template/PBR resources: '+JSON.stringify(final));
      }
      const cpuSampler=({samples,warmup})=>{
        const api=soccerV7,{actors,renderer}=api.inspect(),originalRender=renderer.render,originalUpdates=actors.map(a=>a.update);
        const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,median:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.ceil((sorted.length-1)*.95)],maximum:sorted.at(-1),mean:values.reduce((s,v)=>s+v,0)/values.length};};
        let frameActorTime=0,frameActorCalls=0;
        actors.forEach((actor,i)=>{actor.update=function(...args){const start=performance.now();try{return originalUpdates[i].apply(this,args);}finally{frameActorTime+=performance.now()-start;frameActorCalls++;}};});
        renderer.render=()=>{};
        const scenarios=[];
        try{
          for(const kind of ['steady-exact-run3','interrupted-actual-viewer-updates','ground-support-recovery']){
            const interrupted=kind==='interrupted-actual-viewer-updates',ground=kind==='ground-support-recovery';
            // Five seconds permits both an actual native palm hold and the
            // subsequent side-landing/body-support recovery to be observed.
            const scenarioSamples=ground?Math.max(samples,150):samples;
            api.setPlaying(false);api.setClip(ground?'slide_tackle':interrupted?'run_2':'run_3');api.seek(ground?.85:0);api.setPlaying(true);
            for(let i=0;i<warmup;i++)api.step(1/30);
            const actorTimes=[],stepTimes=[],calls=[],boundaries=[];
            const schedule=new Map([[0,'run_5'],[2,'sprint'],[12,'decelerate'],[50,'run_3'],[70,'kick'],[85,'run_2']]);
            const workload={nativeSlideContactWindowActorSamples:0,nativeSlideSolverActorSamples:0,nativeBilateralGetUpContactWindowActorSamples:0,nativeBilateralGetUpSolverActorSamples:0,sequentialBodySupportActorSamples:0,processedBodySettleActorSamples:0,activeBaseActorSamples:{},modifierActorSamples:{}};
            for(let i=0;i<scenarioSamples;i++){
              if(interrupted&&schedule.has(i)||ground&&(i===24||i===60||i===140)){
                frameActorTime=0;frameActorCalls=0;const start=performance.now();
                let to=schedule.get(i),coldSelection=null,issueRequest=true;
                if(ground){to='get_up';if(i===60||i===140){const clip=i===60?'keeper_dive_right':'get_up',phase=i===60?.25:.35;api.setPlaying(false);api.setClip(clip);api.seek(phase);api.setPlaying(true);coldSelection={clip,phase};issueRequest=i!==140;}}
                if(issueRequest)api.setClip(to);boundaries.push({sample:i,to,coldSelection,issueRequest,actorMilliseconds:frameActorTime,actorCalls:frameActorCalls,totalAPIMilliseconds:performance.now()-start});
              }
              frameActorTime=0;frameActorCalls=0;const start=performance.now();api.step(1/30);stepTimes.push(performance.now()-start);actorTimes.push(frameActorTime);calls.push(frameActorCalls);
              if(ground)for(const actor of actors){const descriptor=actor.recoveryDescriptor();workload.activeBaseActorSamples[descriptor.activeBaseClip]=(workload.activeBaseActorSamples[descriptor.activeBaseClip]||0)+1;for(const modifier of descriptor.modifiers||[])workload.modifierActorSamples[modifier.kind]=(workload.modifierActorSamples[modifier.kind]||0)+1;
                const clip=api.inspect().clipMap.get(descriptor.activeBaseClip),seconds=Math.min(clip?.duration||0,descriptor.baseSeconds);
                const activeNativeHands=(clip?.contacts||[]).filter(contact=>contact.mode==='hand-support'&&contact.start-1e-8<=seconds&&seconds<=contact.end+1e-8).map(contact=>contact.bone);
                const actualSolver=bone=>(descriptor.palmSupports||[]).some(support=>support.bone===bone&&support.clipID===descriptor.activeBaseClip&&support.phase==='plant'&&support.weight>=1-1e-6&&support.solverName==='nativePalmSurfaceIK'&&support.solverIterations>0&&Number.isInteger(support.solveCount)&&support.solveCount>0&&Number.isFinite(support.lastSolveClock)&&Math.abs(support.lastSolveClock-actor.clock)<1e-7&&support.calibration?.modelSha256===api.inspect().data.hashes.models[actor.path]);
                if(descriptor.activeBaseClip==='slide_tackle'&&activeNativeHands.includes('LeftHand')){workload.nativeSlideContactWindowActorSamples++;if(actualSolver('LeftHand'))workload.nativeSlideSolverActorSamples++;}
                if(descriptor.activeBaseClip==='get_up'&&['LeftHand','RightHand'].every(hand=>activeNativeHands.includes(hand))){workload.nativeBilateralGetUpContactWindowActorSamples++;if(['LeftHand','RightHand'].every(actualSolver))workload.nativeBilateralGetUpSolverActorSamples++;}
                if(descriptor.risePlan?.kind==='sequentialSupportedFootUnroll'&&descriptor.constraints?.elapsed<(descriptor.risePlan.firstFootLandingSeconds??.55)&&!descriptor.risePlan.supportFoot){workload.sequentialBodySupportActorSamples++;const body=descriptor.bodySettling;if(body?.active===true&&body.carryWeight>0&&Number.isFinite(body.processedClock)&&Math.abs(body.processedClock-actor.clock)<1e-7&&body.actualGeometryWitness?.modelSha256===api.inspect().data.hashes.models[actor.path])workload.processedBodySettleActorSamples++;}
              }
            }
            api.setPlaying(false);
            if(ground&&(!workload.nativeSlideContactWindowActorSamples||!workload.nativeSlideSolverActorSamples||!workload.nativeBilateralGetUpContactWindowActorSamples||!workload.nativeBilateralGetUpSolverActorSamples||!workload.sequentialBodySupportActorSamples||!workload.processedBodySettleActorSamples))throw Error('Ground support CPU schedule did not observe actual slide/bilateral palm solves and processed captured-body settling: '+JSON.stringify(workload));
            scenarios.push({kind,sampleCount:scenarioSamples,warmupFrames:warmup,simulatedStepSeconds:1/30,actorUpdateMilliseconds:stats(actorTimes),wholeStepNoRenderMilliseconds:stats(stepTimes),rawActorUpdateMilliseconds:actorTimes,rawWholeStepNoRenderMilliseconds:stepTimes,actorCallsPerSample:{minimum:Math.min(...calls),maximum:Math.max(...calls)},boundaries,observedWorkload:workload,minimumGroundScenarioSamples:ground?150:null,finalMinimumDisplayedVertexY:Math.min(...actors.map(a=>a.minimumY(true))),finalMaximumContactResidualMeters:Math.max(...actors.map(a=>a.contactResidual))});
          }
          return{method:'Production Actor.update calls timed separately from API/DOM/camera/props overhead; only GPU renderer.render suppressed. Production RAF paused. Warmup excluded.',scenarios};
        }finally{renderer.render=originalRender;actors.forEach((actor,i)=>{actor.update=originalUpdates[i];});api.setPlaying(false);}
      };
      const cpu=await page.evaluate(cpuSampler,{samples,warmup});
      cpu.cdpCPUThrottlingRate=1;
      let throttledCPU=null;
      if(throttleFour){
        const session=await context.newCDPSession(page);
        await session.send('Emulation.setCPUThrottlingRate',{rate:4});
        try{throttledCPU=await page.evaluate(cpuSampler,{samples,warmup});throttledCPU.cdpCPUThrottlingRate=4;throttledCPU.interpretation='Host CPU slowdown stress estimate only; not ARM phone hardware or a GPU benchmark.';}
        finally{await session.send('Emulation.setCPUThrottlingRate',{rate:1});await session.detach();}
      }
      const cadence=await page.evaluate(async({samples,warmup})=>{
        const api=soccerV7,{renderer}=api.inspect(),originalRender=renderer.render;
        const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,median:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.ceil((sorted.length-1)*.95)],maximum:sorted.at(-1),mean:values.reduce((s,v)=>s+v,0)/values.length};};
        api.setPlaying(false);api.setClip('run_3');api.seek(0);api.setPlaying(true);
        const intervals=[],renderCalls=[],renderedPixelRatios=new Set();let count=0,previous=null,resolve,reject;
        const promise=new Promise((a,b)=>{resolve=a;reject=b;});
        const timeout=setTimeout(()=>reject(Error('Normal render cadence did not produce required sample count within 180 seconds')),180000);
        renderer.render=function(...args){
          const start=performance.now();let result;try{result=originalRender.apply(this,args);}catch(error){reject(error);throw error;}
          const elapsed=performance.now()-start;count++;
          if(count>warmup){if(previous!==null)intervals.push(start-previous);renderCalls.push(elapsed);renderedPixelRatios.add(renderer.getPixelRatio());previous=start;}
          if(renderCalls.length>=samples)resolve();return result;
        };
        try{
          window.__cpuProfileRAF.resume();await promise;window.__cpuProfileRAF.pause();api.setPlaying(false);
          const elapsed=intervals.reduce((s,v)=>s+v,0),state=api.state();
          const gl=renderer.getContext();
          return{method:'Unmodified production RAF/30Hz accumulator, animation, camera, scene and WebGL rendering. Software GPU. Warmup discarded; renderer-call time is CPU submission/backpressure, not GPU timestamp.',cdpCPUThrottlingRate:1,warmupFrames:warmup,sampleCount:renderCalls.length,renderSubmissionMilliseconds:stats(renderCalls),frameIntervalMilliseconds:stats(intervals),rawRenderSubmissionMilliseconds:renderCalls,rawFrameIntervalMilliseconds:intervals,meanRenderedFPS:intervals.length*1000/elapsed,framesAtOrBelow33_333Milliseconds:intervals.filter(v=>v<=33.333334).length,renderedPixelRatios:[...renderedPixelRatios],drawingBufferAtEnd:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,pixels:gl.drawingBufferWidth*gl.drawingBufferHeight},triangles:state.triangles,drawCalls:state.draws,gpuMemory:renderer.info.memory,programs:renderer.info.programs?.length||0,jsHeap:performance.memory?{usedBytes:performance.memory.usedJSHeapSize,totalBytes:performance.memory.totalJSHeapSize,limitBytes:performance.memory.jsHeapSizeLimit}:null,finalMinimumDisplayedVertexY:Math.min(...state.models.map(m=>m.minimumY)),finalMaximumContactResidualMeters:Math.max(...state.models.map(m=>m.contactResidual)),stateErrors:state.errors};
        }finally{clearTimeout(timeout);window.__cpuProfileRAF.pause();renderer.render=originalRender;api.setPlaying(false);}
      },{samples,warmup});
      const entry={configuration,preflight,browseHistoryMemory,cpu,throttledCPU,cadence};results.push(entry);
      if(cadence.stateErrors?.length)errors.push({configuration,message:'Viewer errors during cadence',stateErrors:cadence.stateErrors});
      runState.completedConfigurations.push({configuration,completedAt:new Date().toISOString()});await saveRunState();
      console.log(JSON.stringify({configuration,actorSteadyP95Milliseconds:cpu.scenarios[0].actorUpdateMilliseconds.p95,actorBlendP95Milliseconds:cpu.scenarios[1].actorUpdateMilliseconds.p95,actorGroundSupportP95Milliseconds:cpu.scenarios[2].actorUpdateMilliseconds.p95,softwareRenderedFPS:cadence.meanRenderedFPS,drawCalls:cadence.drawCalls,triangles:cadence.triangles}));
    }finally{await context.close();}
  }
}catch(error){errors.push({message:String(error),stack:error.stack});}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
const resources=[];
for(const [resource,entry]of served){let currentSha256=null;try{currentSha256=digest(await fs.readFile(entry.file));}catch{}resources.push({resource,bytes:entry.bytes.length,sha256:entry.sha256,diskStillMatches:currentSha256===entry.sha256});}
const verifiedInputs=[];
const declaredSourceFiles={manifest:'asset-manifest.json',motion:'animations.json',preview:'preview.js',motionRuntime:'source/motion-runtime.js',locomotion:'source/locomotion-space.js',locomotionCurve:'source/locomotion-curve.js',dribble:'source/locomotion-dribble.js',recovery:'source/recovery-state.js',scene:'source/scene.js',props:'source/props.js',palmSupport:'source/palm-support.js',bootBounds:'verification/boot-bounds.json'};
for(const key of new Set(results.flatMap(result=>Object.keys(result.preflight.packageHashes||{}))))if(key!=='models'&&!Object.hasOwn(declaredSourceFiles,key))errors.push({message:'Unrecognized declared package input has no CPU audit source witness',key});
for(const [key,file]of Object.entries(declaredSourceFiles)){
  const actual=digest(await fs.readFile(path.join(root,file))),expected=[...new Set(results.map(result=>result.preflight.packageHashes[key]))];
  verifiedInputs.push({file,sha256:actual,declaredSha256:expected,matches:expected.length===1&&expected[0]===actual});
}
for(const [file,payload]of payloads){const actual=digest(await fs.readFile(path.join(root,file)));verifiedInputs.push({file,sha256:actual,actualServedSha256:payload.sha256,matches:actual===payload.sha256});}
const auditSourceStillMatches=digest(await fs.readFile(fileURLToPath(import.meta.url)))===auditSource.sha256;
if(!auditSourceStillMatches)errors.push({message:'CPU auditor source changed during profile'});
if(verifiedInputs.some(input=>!input.matches))errors.push({message:'Profile package differs from current source/model files'});
const stableInputs=resources.every(r=>r.diskStillMatches)&&auditSourceStillMatches&&verifiedInputs.every(input=>input.matches);
const conclusions=results.map(r=>({configuration:r.configuration,hostSteadyActorUpdatesFit33_333msP95:r.cpu.scenarios[0].actorUpdateMilliseconds.p95<=1000/30,hostInterruptedActorUpdatesFit33_333msP95:r.cpu.scenarios[1].actorUpdateMilliseconds.p95<=1000/30,hostGroundSupportActorUpdatesFit33_333msP95:r.cpu.scenarios[2].actorUpdateMilliseconds.p95<=1000/30,cdp4xGroundSupportActorUpdatesFit33_333msP95:r.throttledCPU?r.throttledCPU.scenarios[2].actorUpdateMilliseconds.p95<=1000/30:null,softwareRendererMeanAtLeast29_5FPS:r.cadence.meanRenderedFPS>=29.5,physicalPhoneConclusion:null}));
const report={schemaVersion:1,kind:'host-browser-twelve-actor-cpu-render-profile',auditSource,startedAt,generatedAt:new Date().toISOString(),targetFPS:30,physicalDeviceMeasurement:false,targetMetOnPhysicalPhone:null,limitations:['Virtual phone viewport/DPR does not emulate phone CPU, GPU, memory bandwidth or thermal behaviour.','SwiftShader render cadence is a software renderer measurement, not evidence that a medium phone meets 30fps.','Actor CPU timing excludes WebGL rendering; normal cadence includes production rendering and camera/scene work.','Optional CDP4×CPU slowdown is an artificial host stress estimate and is reset to1 before normal rendering.','GPU texture count is a live renderer resource count; RGBA8+mipmap byte totals are estimates, not measured GPU byte allocation.','pass records successful stable-input profiling with no remote requests or script failures; it is not a phone-performance acceptance result.'],host:{platform:os.platform(),architecture:os.arch(),cpuModel:os.cpus()[0]?.model||null,availableParallelism:os.availableParallelism?.()??os.cpus().length,nodeVersion:process.version,cgroupLimits},requested:{samples,warmup,configurations,optionalCDP4xCPUStress:throttleFour},results,conclusions,servedResources:resources,verifiedInputs,auditSourceStillMatches,stableInputs,errors,remoteRequests,pass:errors.length===0&&remoteRequests.length===0&&results.length===configurations.length&&stableInputs};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
runState.status=report.pass?'pass':'fail';runState.endedAt=new Date().toISOString();runState.reportSha256=digest(await fs.readFile(output));await saveRunState();
console.log(JSON.stringify({pass:report.pass,configurations:results.length,stableInputs,errors:errors.length,remoteRequests:remoteRequests.length,output}));
if(!report.pass)process.exitCode=1;
