// CC0-1.0. Repeatable browser evidence. Playwright is a verification-only tool.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {startServer} from './serve.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'verification');
const config = JSON.parse(await readFile(path.join(root, 'sequence.json'), 'utf8'));
const inputFiles=['sequence.json','clips/pit-actions.glb','src/pit-sequence.mjs','src/preview.mjs','preview.html','preview.css'];
async function inputHashes() {
  return Object.fromEntries(await Promise.all(inputFiles.map(async file=>[file,
    createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')])));
}
const inputs=await inputHashes();
const playwright = process.env.ISLAND_PLAYWRIGHT
  ? await import(pathToFileURL(process.env.ISLAND_PLAYWRIGHT).href) : await import('playwright');
const server = await startServer({port:0});
const browser = await playwright.chromium.launch({headless:true,
  ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server']});
await mkdir(output, {recursive:true});
const evidence = {schemaVersion:1, inputs, wasmDisabled:true, externalRequests:[], errors:[], failedRequests:[], teardownCancellations:[], viewports:[]};
try {
  for (const viewport of [{width:844,height:390},{width:390,height:844}]) {
    const context = await browser.newContext({viewport,deviceScaleFactor:1});
    await context.addInitScript(() => Object.defineProperty(globalThis, 'WebAssembly', {value:undefined, configurable:false}));
    const page = await context.newPage();
    let closing=false;
    // Observe actual traffic without interception. Intercepting local streaming
    // GLB fetches can produce Chromium ERR_ABORTED after successful decoding.
    page.on('request', request => {
      const url=new URL(request.url());
      if(url.protocol.startsWith('http')&&url.hostname!=='127.0.0.1') evidence.externalRequests.push(url.href);
    });
    page.on('pageerror', error => evidence.errors.push(String(error)));
    page.on('requestfailed', request => {
      const item={url:request.url(),error:request.failure()?.errorText};
      if(closing&&item.error==='net::ERR_ABORTED') evidence.teardownCancellations.push(item);
      else evidence.failedRequests.push(item);
    });
    page.on('response', response => {if (response.status() >= 400) evidence.errors.push(`${response.status()} ${response.url()}`);});
    await page.goto(server.url, {waitUntil:'networkidle'});
    await page.waitForFunction(() => window.__pitPreview?.ready, null, {timeout:30000});
    await page.evaluate(() => window.__pitPreview.pause());
    const layout = await page.evaluate(() => ({width:innerWidth,height:innerHeight,
      scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
      canvas:[...document.querySelectorAll('canvas')].map(c => ({width:c.width,height:c.height}))}));
    assert(layout.scrollWidth <= viewport.width, 'No horizontal overflow');
    if (viewport.width === 844) assert(layout.scrollHeight <= viewport.height, '844×390 preview fits in one viewport');
    const states = [];
    for (const stage of config.stages) {
      const time = (stage.start + stage.end) / 2;
      const state = await page.evaluate(time => {window.__pitPreview.seek(time); return window.__pitPreview.snapshot();}, time);
      assert.equal(state.stage, stage.id);
      states.push({time,state:state.stage,light:state.light,canExit:state.canExit,car:state.car,
        wheels:Object.fromEntries(Object.entries(state.wheels).map(([id,w])=>[id,{oldState:w.oldState,newState:w.newState,confirmed:w.confirmed}]))});
    }
    const terminal = await page.evaluate(time => {window.__pitPreview.seek(time);return window.__pitPreview.snapshot();}, config.duration);
    assert(terminal.complete && terminal.canExit, 'Complete and released');
    assert.equal(Object.values(terminal.wheels).filter(w => w.replaced && w.confirmed).length, 4, 'All four replaced and torqued');
    await page.evaluate(() => window.__pitPreview.seek(1.39));
    await page.screenshot({path:path.join(output, `preview-${viewport.width}x${viewport.height}.png`)});
    const detail = {viewport,layout,states,terminal:{time:terminal.time,complete:terminal.complete,canExit:terminal.canExit}};
    if (viewport.width === 844) {
      const times = [.42,.78,1.02,1.39,1.76,2.03,2.16,2.48];
      for (let i=0;i<times.length;i++) {
        await page.evaluate(t => window.__pitPreview.seek(t), times[i]);
        await page.screenshot({path:path.join(output, `stage-${i+1}.png`)});
      }
      // Capture the renderer's poses at game speed, including exact handoff and
      // stage boundaries. These are independent of GLB-only animation sampling.
      const capture = await page.evaluate(config => {
      const timeline = [...new Set([...Array.from({length:Math.ceil(config.duration*60)+1},(_,i)=>Math.min(config.duration,i/60)),
          ...config.stages.flatMap(s=>[s.start,s.end]),
          ...config.wheels.flatMap(w=>Object.values(w.events).filter(x=>typeof x==='number'))].map(t=>Number(t.toFixed(8))))].sort((a,b)=>a-b);
        const frames = [];
        const diagnostics = [];
        for (const t of timeline) {
          window.__pitPreview.seek(t);
          if (window.__pitPreview.pose) frames.push({t,actors:window.__pitPreview.pose()});
          if (window.__pitPreview.diagnostics) diagnostics.push({t,...window.__pitPreview.diagnostics(),
            expectedCar:window.__pitPreview.snapshot().car});
        }
        const handoffs=[];
        for(const t of [...new Set(config.wheels.flatMap(w=>Object.values(w.events).filter(x=>typeof x==='number')))]) {
          const poses=[];
          for(const time of [t-1e-5,t,t+1e-5]) {
            window.__pitPreview.seek(time);poses.push(window.__pitPreview.diagnostics());
          }
          handoffs.push({t,poses});
        }
        return {timeline,frames,diagnostics,handoffs};
      }, config);
      await writeFile(path.join(output, 'runtime-frames.json'), JSON.stringify(capture.frames) + '\n');
      await writeFile(path.join(output, 'contacts.json'), JSON.stringify({sampleRateHz:60,sampleTimes:capture.timeline,samples:capture.diagnostics,handoffs:capture.handoffs},null,2) + '\n');
      const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
      const contactMax={leftGrip:0,rightGrip:0,gunSocket:0,carPosition:0,handoffWheelStep:0,jackPad:0,jackLeftGrip:0,jackRightGrip:0};
      assert(capture.frames.length && capture.diagnostics.length,'Actual scene pose/contact capture is required');
      for(const sample of capture.diagnostics) {
        contactMax.carPosition=Math.max(contactMax.carPosition,distance(sample.car.position,sample.expectedCar.position));
        for(const wheel of sample.wheels) {
          const def=config.wheels.find(w=>w.id===wheel.id),event=def.events;
          const oldParent=sample.t<event.detach?'Hub/'+wheel.id:sample.t<event.oldReleased?'LeftHand':null;
          const newParent=sample.t<event.newGripped?null:sample.t<event.mounted?'LeftHand':'Hub/'+wheel.id;
          assert.equal(wheel.old.parent||null,oldParent,`Old wheel ownership ${wheel.id} at ${sample.t}`);
          assert.equal(wheel.new.parent||null,newParent,`New wheel ownership ${wheel.id} at ${sample.t}`);
          contactMax.leftGrip=Math.max(contactMax.leftGrip,wheel.leftGripErrorMeters??0);
          if(wheel.rightGripActive!==false) contactMax.rightGrip=Math.max(contactMax.rightGrip,wheel.rightGripErrorMeters??0);
          contactMax.gunSocket=Math.max(contactMax.gunSocket,wheel.gunSocketErrorMeters??0);
        }
        for(const jack of sample.jacks) {
          if(sample.t>=config.stages.find(s=>s.id==='jack_up').start&&sample.t<=2.04) contactMax.jackPad=Math.max(contactMax.jackPad,jack.padErrorMeters??0);
          if(jack.handContact) {
            contactMax.jackLeftGrip=Math.max(contactMax.jackLeftGrip,jack.leftGripErrorMeters??0);
            contactMax.jackRightGrip=Math.max(contactMax.jackRightGrip,jack.rightGripErrorMeters??0);
          }
        }
      }
      for(const handoff of capture.handoffs) for(let i=1;i<handoff.poses.length;i++) {
        for(let w=0;w<handoff.poses[i].wheels.length;w++) for(const name of ['old','new']) {
          contactMax.handoffWheelStep=Math.max(contactMax.handoffWheelStep,
            distance(handoff.poses[i].wheels[w][name].position,handoff.poses[i-1].wheels[w][name].position));
        }
      }
      detail.contactMaxMeters=contactMax;
      assert(contactMax.carPosition<1e-7,'Renderer car transform exactly matches the simulation (lift applied once)');
      assert(contactMax.leftGrip<.004&&contactMax.rightGrip<.008,'Both hands stay on the wheel rims');
      assert(contactMax.gunSocket<.004,'Wheel gun socket contacts actual hub');
      assert(contactMax.handoffWheelStep<.005,'Wheel ownership handoffs are position continuous');
      assert(contactMax.jackPad<.004,'Both jack pads meet the actual car contact points until grounded');
      assert(contactMax.jackLeftGrip<.008&&contactMax.jackRightGrip<.008,'Both jack operators hold the actual handles');
      detail.sampleCount = capture.timeline.length;
      detail.runtimePoseSamples = capture.frames.length;
      detail.contactSamples = capture.diagnostics.length;
      await page.locator('[data-stage="loosen"]').click();
      assert.equal(await page.evaluate(()=>window.__pitPreview.snapshot().time),config.stages.find(s=>s.id==='loosen').start);
      await page.keyboard.press('ArrowRight');
      assert(Math.abs(await page.evaluate(()=>window.__pitPreview.snapshot().time)-(config.stages.find(s=>s.id==='loosen').start+1/60))<1e-7);
      await page.locator('#speed').selectOption('.1');
      await page.locator('#replay').click();
      await page.waitForFunction(()=>window.__pitPreview.snapshot().time>0.01);
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>window.__pitPreview.snapshot().playing),false);
      await page.locator('#view').click();
      detail.controls={stageButtons:true,scrubViaApi:true,keyboardFrame:true,replay:true,slowMotion:true,pause:true,viewToggle:true};
      const replay = await page.evaluate(() => {
        const read=()=>JSON.stringify(window.__pitPreview.pose(),(_,v)=>typeof v==='number'?Number(v.toFixed(8)):v);
        window.__pitPreview.seek(1.39);const first=read();
        for(const t of [2.8,.71,1.75,.2,1.03]) window.__pitPreview.seek(t);
        window.__pitPreview.seek(1.39);return {first,second:read()};
      });
      assert.equal(replay.first,replay.second,'Actual poses are independent of previous seek/IK history');
      detail.sceneSeekDeterministic=true;
    }
    evidence.viewports.push(detail);
    await page.waitForLoadState('networkidle');
    closing=true;
    await context.close();
  }
  assert.deepEqual(evidence.errors, [], 'Browser errors');
  assert.deepEqual(evidence.externalRequests, [], 'No external requests');
  assert.deepEqual(evidence.failedRequests, [], 'All local assets load');
  assert.deepEqual(await inputHashes(),inputs,'Scene inputs stay unchanged throughout verification');
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.failure = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(path.join(output, 'browser.json'), JSON.stringify(evidence,null,2) + '\n');
  await browser.close();
  await server.close();
}
console.log(`PASS: 844×390 and 390×844; every pit stage; four distinct replacements; WASM disabled; zero external requests.`);
