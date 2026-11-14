import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const {chromium}=await import(process.env.NAVAL_PLAYWRIGHT_PATH ? pathToFileURL(process.env.NAVAL_PLAYWRIGHT_PATH).href : 'playwright');
const root=new URL('../',import.meta.url);
const origin=process.env.NAVAL_PREVIEW_ORIGIN || 'http://127.0.0.1:8765';
const url=origin+'/workout/island/design/naval-ships-v2/preview.html?test=1';
const browser=await chromium.launch({headless:true,executablePath:process.env.NAVAL_CHROMIUM || undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],external=[],failures=[],screenshots=[],rigChecks=[];
try {
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url());});
  page.on('requestfailed',r=>failures.push(r.url()));
  page.on('response',r=>{if(r.status()>=400) failures.push(r.url()+' '+r.status());});
  await page.goto(url);await page.waitForFunction(()=>window.__fleetReady||window.__fleetError);
  assert(await page.evaluate(()=>window.__fleetReady));
  const save=async name=>{await page.screenshot({path:new URL('verification/'+name,root).pathname});screenshots.push(name);};
  const layout=async()=>page.evaluate(()=>({
    width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    scrollHeight:document.documentElement.scrollHeight,
    controls:[...document.querySelectorAll('button,input,a')].map(e=>{
      const r=e.getBoundingClientRect();return {text:e.textContent||e.id,x:r.x,y:r.y,w:r.width,h:r.height};})}));
  const desktopLayout=await layout();
  assert.equal(desktopLayout.scrollWidth,844);assert.equal(desktopLayout.scrollHeight,390);
  for(const c of desktopLayout.controls) assert(c.x>=0&&c.y>=0&&c.x+c.w<=844.1&&c.y+c.h<=390.1,'Visible controls: '+c.text);
  await save('fleet-player-844x390.png');
  for(const team of ['player','enemy']) {
    await page.getByRole('button',{name:team==='player'?'שחקן':'אויב',exact:true}).click();
    const ids=await page.evaluate(()=>window.__fleet.manifest.ships.map(s=>s.id));
    for(const id of ids) {
      await page.locator(`[data-ship="${id}"]`).click();
      const result=await page.evaluate(({id,team})=>{
        const api=window.__fleet,rec=api.records.get(id+'-'+team),root=rec.root;
        const visible=[...api.records.values()].filter(r=>r.root.visible).map(r=>r.model.id);
        const radar=root.getObjectByName('radar'),hull=root.getObjectByName('hull');
        const initialHull=hull.matrixWorld.toArray(),initialPivot=radar.position.toArray();
        rec.mixer.setTime(0);const start=radar.quaternion.toArray();
        rec.mixer.setTime(1);api.render();const quarter=radar.quaternion.toArray();
        const pivot=radar.position.toArray();
        rec.mixer.setTime(4);const loop=radar.quaternion.toArray();
        const stableHull=initialHull.every((v,i)=>Math.abs(v-hull.matrixWorld.elements[i])<1e-9);
        // Test projected bounds of every visible vertex, not just the origin.
        root.updateMatrixWorld(true);api.camera.updateMatrixWorld(true);
        let clipped=0,vertices=0;
        const p=api.camera.position.clone();
        root.traverse(n=>{if(n.isMesh){const a=n.geometry.attributes.position;
          for(let i=0;i<a.count;i++) {p.fromBufferAttribute(a,i).applyMatrix4(n.matrixWorld).project(api.camera);
            vertices++;if(Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1)clipped++;}}});
        return {id,team,visible,start,quarter,loop,pivot,initialPivot,stableHull,clipped,vertices};
      },{id,team});
      assert.deepEqual(result.visible,[id+'-'+team]);
      assert(result.stableHull);assert.deepEqual(result.pivot,result.initialPivot);
      assert(Math.abs(result.quarter[1])>.7 && Math.abs(result.quarter[3])>.7);
      assert(Math.abs(result.start.reduce((s,v,i)=>s+v*result.loop[i],0))>.999999);
      assert.equal(result.clipped,0,'Ship clipped: '+id);
      rigChecks.push(result);
      await save(`${id}-${team}-844x390.png`);
    }
    await page.locator('#fleet').click();
    await save(`fleet-${team}-844x390.png`);
  }
  await page.locator('[data-ship="cruiser"]').click();
  await page.locator('#yaw').fill('65');await page.locator('#pitch').fill('25');
  const angles=await page.evaluate(()=>{
    const r=window.__fleet.records.get('cruiser-enemy').root;
    return {barrel:r.getObjectByName('barrel').rotation.x,yaw:r.getObjectByName('turret').rotation.y,
      aft:r.getObjectByName('turret_aft').quaternion.toArray()};
  });
  assert(Math.abs(angles.barrel+25*Math.PI/180)<1e-6);
  assert(Math.abs(angles.yaw-65*Math.PI/180)<1e-6);
  await page.locator('#radar').click();
  assert(await page.evaluate(()=>{
    const api=window.__fleet,r=api.records.get('cruiser-enemy').root.getObjectByName('radar');
    const before=r.quaternion.toArray();api.step(.8);return before.every((v,i)=>v===r.quaternion.toArray()[i]);
  }));
  await page.locator('#lights').click();
  assert(await page.evaluate(()=>[...window.__fleet.records.values()].every(r=>!r.root.getObjectByName('lights').visible)));
  await page.locator('#wire').click();
  assert(await page.evaluate(()=>{let ok=true;window.__fleet.records.get('cruiser-enemy').root.traverse(n=>{if(n.isMesh&&!n.material.wireframe)ok=false;});return ok;}));
  await save('cruiser-rig-wire-844x390.png');
  await page.locator('#wire').click();await page.locator('#lights').click();await page.locator('#radar').click();
  await page.locator('#yaw').fill('0');await page.locator('#pitch').fill('0');
  await page.locator('#top').click();
  await save('cruiser-top-844x390.png');
  await page.locator('#top').click();
  const beforeDrag=await page.evaluate(()=>window.__fleet.camera.position.toArray());
  await page.mouse.move(300,200);await page.mouse.down();await page.mouse.move(360,220);await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>window.__fleet.camera.position.toArray()),beforeDrag);
  await page.mouse.wheel(0,80);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#player').click();await page.locator('#fleet').click();
  const mobileLayout=await layout();
  assert.equal(mobileLayout.scrollWidth,390);assert.equal(mobileLayout.scrollHeight,844);
  await save('fleet-player-390x844.png');
  await page.locator('[data-ship="light-carrier"]').click();
  await save('light-carrier-player-390x844.png');
  await page.goto(url.replace('?test=1',''));
  await page.waitForFunction(()=>window.__fleetReady||window.__fleetError);
  assert(await page.evaluate(()=>window.__fleetReady));
  const initialRadar=await page.evaluate(()=>window.__fleet.records.get('destroyer-player').root.getObjectByName('radar').quaternion.toArray());
  await page.waitForFunction(before=>window.__fleet.records.get('destroyer-player').root.getObjectByName('radar').quaternion.toArray().some((v,i)=>Math.abs(v-before[i])>.01),initialRadar);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();await page.waitForFunction(()=>window.__fleetReady||window.__fleetError);
  assert(await page.evaluate(()=>window.__fleetReady && !window.__fleet.state.radar));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  await writeFile(new URL('verification/browser.json',root),JSON.stringify({
    pass:true,browser:await browser.version(),renderer:'Chromium SwiftShader',
    testedViewports:[[844,390],[390,844]],rigChecks,angles,
    normalAutoplay:true,reducedMotionStartsPaused:true,
    interactions:['team switch','all six ships in both teams','radar quarter turn and loop','radar pause',
      'turret yaw','barrel pitch','light toggle','wireframe','top view','pointer orbit','wheel zoom'],
    desktopLayout,mobileLayout,screenshots:[...new Set(screenshots)],
    pageErrors:errors,externalRequests:external,failedRequests:failures},null,2)+'\n');
  console.log(`Browser checks passed: ${rigChecks.length} variants; ${new Set(screenshots).size} screenshots.`);
} finally { await browser.close(); }
