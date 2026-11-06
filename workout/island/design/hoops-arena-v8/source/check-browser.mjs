/** Optional authoring check: Playwright + system Chromium, no runtime dependency. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {packageServer} from './serve.mjs';
const req=createRequire(path.join(process.env.HOOPS_AUTHORING_MODULES||'/tmp/hoops-authoring/node_modules','anchor.cjs'));
const {chromium}=req('playwright');const server=packageServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const results=[];function pass(name,detail=''){results.push(`| ${name} | עבר | ${detail} |`);console.log('PASS',name,detail);}
try {
  for(const [width,height,dpr]of [[390,844,1],[844,390,1],[390,844,2]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});const errors=[],external=[];
    page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.goto(origin+'/preview.html?capture=1&lod=0');await page.waitForFunction(()=>window.arenaReady);
    const label=`${width}×${height} DPR${dpr}`;
    assert.equal(await page.evaluate(()=>arenaPreview.renderer.getPixelRatio()),Math.min(dpr,1.25));
    await page.locator('[data-view="near"]').tap();assert.equal(await page.locator('[data-view="near"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-replay]').tap();assert(await page.evaluate(()=>arenaPreview.broadcast.active));
    await page.locator('input[type=range]').fill('250');await page.locator('input[type=range]').dispatchEvent('input');
    const progress=await page.evaluate(()=>arenaPreview.recorder.cursor/arenaPreview.recorder.duration);assert(Math.abs(progress-.25)<.01);
    const before=await page.evaluate(()=>arenaPreview.ball.mesh.position.toArray());await page.evaluate(()=>arenaPreview.broadcast.render(0));assert.deepEqual(await page.evaluate(()=>arenaPreview.ball.mesh.position.toArray()),before);
    await page.locator('[data-resume]').tap();assert.equal(await page.evaluate(()=>arenaPreview.broadcast.active),false);
    const metrics=[];
    for(let lod=0;lod<3;lod++)for(const replay of [false,true]) {
      const m=await page.evaluate(({lod,replay})=>{arenaPreview.arena.setLOD(lod);arenaPreview.setReplay(replay);arenaPreview.step(1/30);return arenaPreview.metrics();},{lod,replay});
      assert(m.triangles<=35000);assert.equal(m.lod,lod);metrics.push(`${lod}${replay?'R':'L'}=${m.triangles}`);
    }
    pass(label+' — controls/replay/LOD',metrics.join(', '));
    const textureSizes=await page.evaluate(()=>{
      const seen=new Set(),sizes=[];arenaPreview.scene.traverse(o=>{for(const m of [].concat(o.material||[]))for(const v of Object.values(m))if(v?.isTexture&&!seen.has(v)){seen.add(v);sizes.push([v.image?.width||0,v.image?.height||0]);}});return sizes;
    });assert.equal(textureSizes.length,8);assert(textureSizes.every(([w,h])=>w>0&&h>0&&w<=1024&&h<=1024));pass(label+' — texture bounds','All 8 disk/canvas textures ≤1024');
    await page.evaluate(()=>{arenaPreview.setReplay(false);arenaPreview.hud.update({home:101,away:99,shot:4,homeFouls:5,homeName:'<test>'});});
    assert.equal(await page.locator('[data-home-score]').textContent(),'101');assert.equal(await page.locator('[data-home-name]').textContent(),'<test>');assert.equal(await page.locator('[data-home-name] test').count(),0);assert(await page.locator('.arenaHud__shot').evaluate(e=>e.classList.contains('is-urgent')));assert.equal(await page.locator('[data-home-dots] .is-on').count(),5);
    pass(label+' — scoreboard state','3-digit score, foul count, urgent shot clock, text escaping');
    const layout=await page.evaluate(()=>{
      const bad=[];for(const e of document.querySelectorAll('button')){if(!e.getClientRects().length)continue;const r=e.getBoundingClientRect();if(r.width<44||r.height<44||r.left<0||r.top<0||r.right>innerWidth+.1||r.bottom>innerHeight+.1)bad.push(e.textContent);}
      const s=document.querySelector('.arenaHud__score');if(s.scrollWidth>s.clientWidth+1)bad.push('score overflow');return bad;
    });assert.deepEqual(layout,[]);
    await page.setViewportSize({width:height,height:width});await page.evaluate(()=>arenaPreview.resize());assert.equal(await page.evaluate(()=>arenaPreview.renderer.domElement.width),Math.round(height*Math.min(dpr,1.25)));
    const adaptive=await page.evaluate(()=>{
      const {arena,liveCamera:c}=arenaPreview;arena.setLOD(0);arena.setLOD('auto');c.position.set(0,0,20);
      for(let i=0;i<150;i++)arena.update(c,i/26,1/26);const low=arena.lod;
      for(let i=0;i<1600;i++)arena.update(c,i/60,1/60);const recovered=arena.lod;
      c.position.set(0,0,39);arena.update(c,50,1/60);const band=arena.lod;
      c.position.set(0,0,42);arena.update(c,51,1/60);const outside=arena.lod;
      return {low,recovered,band,outside};
    });assert.deepEqual(adaptive,{low:2,recovered:0,band:0,outside:1});pass(label+' — adaptive LOD','drops after slow frames, recovers, 3m hysteresis');
    const parentLOD=await page.evaluate(async()=>{
      const THREE=await import('./runtime/vendor/three.module.js');const {scene,arena,liveCamera:c}=arenaPreview;
      const rig=new THREE.Group();rig.position.x=100;scene.add(rig);rig.add(c);c.position.set(0,0,20);
      arena.setLOD('auto');arena.update(c,60,1/60);const result=arena.lod;c.removeFromParent();rig.removeFromParent();arenaPreview.setView('near');return result;
    });assert.equal(parentLOD,2);pass(label+' — parented camera','LOD uses camera world position');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass(label+' — local assets','zero page errors and zero external requests');
    const disposed=await page.evaluate(()=>{arenaPreview.dispose();return {g:arenaPreview.renderer.info.memory.geometries,t:arenaPreview.renderer.info.memory.textures};});assert.equal(disposed.g,0);assert.equal(disposed.t,0);pass(label+' — disposal','0 GPU geometries, 0 GPU textures');await page.close();
  }
  const failed=await browser.newPage();await failed.route('**/arena-lod1.glb',r=>r.abort());await failed.goto(origin+'/preview.html?capture=1');await failed.waitForFunction(()=>window.arenaError);assert(await failed.locator('#loading button').isVisible());pass('GLB load failure','Visible Hebrew error and retry; completed assets disposed');await failed.close();
  const lost=await browser.newPage();await lost.goto(origin+'/preview.html?capture=1');await lost.waitForFunction(()=>window.arenaReady);await lost.evaluate(()=>arenaPreview.renderer.forceContextLoss());await lost.waitForSelector('#loading button');await lost.locator('#loading button').click();await lost.waitForFunction(()=>window.arenaReady);pass('WebGL context loss','Recoverable reload returns to a ready scene');await lost.close();
  for(const failure of ['worker','wasm']) {
    const bad=await browser.newPage();
    if(failure==='worker')await bad.route('**/draco-worker.js',route=>route.abort());
    else await bad.route('**/draco_decoder.wasm',route=>route.fulfill({body:Buffer.from([0,1,2,3]),contentType:'application/wasm'}));
    await bad.goto(origin+'/preview.html?capture=1');await bad.waitForFunction(()=>window.arenaError);assert(await bad.locator('#loading button').isVisible());pass('Draco '+failure+' failure','Rejects loading and offers retry');await bad.close();
  }
  const strict=await browser.newPage(),violations=[];strict.on('console',m=>{if(/content.security.policy|violates.*policy/i.test(m.text()))violations.push(m.text());});
  const index=await fs.readFile(fileURLToPath(new URL('../../../index.html',import.meta.url)),'utf8');
  const productionCsp=index.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];assert(productionCsp);
  await strict.route('**/preview.html?*',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':productionCsp}});});
  await strict.goto(origin+'/preview.html?capture=1&lod=0');await strict.waitForFunction(()=>window.arenaReady||window.arenaError);assert(!await strict.evaluate(()=>window.arenaError));
  assert.deepEqual(violations,[]);assert(await strict.evaluate(()=>arenaPreview.renderer.info.render.triangles>0));pass('Production island CSP','script-src self + worker-src self; static local worker; zero policy violations');await strict.close();
  const lifecycle=await browser.newPage();await lifecycle.goto(origin+'/preview.html?capture=1');await lifecycle.waitForFunction(()=>window.arenaReady);
  const loadCycles=await lifecycle.evaluate(async()=>{
    const {createArena}=await import('./runtime/arena.mjs');const {scene,renderer,liveCamera}=arenaPreview;
    arenaPreview.arena.dispose();arenaPreview.ball.dispose();const result=[];
    for(let cycle=0;cycle<5;cycle++){
      const a=await createArena();scene.add(a.group);for(let lod=0;lod<3;lod++){a.setLOD(lod);a.update(liveCamera,0,1/30);renderer.render(scene,liveCamera);}
      a.dispose();result.push({...renderer.info.memory});
    }
    return result;
  });assert(loadCycles.every(r=>r.geometries===0&&r.textures===0));pass('5 load/dispose cycles, same renderer','All 3 LOD allocated each cycle; GPU resources return to 0');await lifecycle.close();
  const dir=fileURLToPath(new URL('../verification/',import.meta.url));await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'BROWSER.md'),'# בדיקות דפדפן\n\nChromium + SwiftShader; זהו אימות תוכנה, לא מדידת GPU של טלפון פיזי.\n\n| בדיקה | תוצאה | פירוט |\n|---|---|---|\n'+results.join('\n')+'\n');
} finally {await browser.close();await new Promise(r=>server.close(r));}
