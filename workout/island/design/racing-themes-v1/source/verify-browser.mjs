/** Playwright + system Chromium. Serve the repository on 127.0.0.1:8765.
 * node source/verify-browser.mjs
 * Evidence is written only inside this new asset package.
 */
import {createRequire} from 'node:module';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=`${root}verification/`;
await mkdir(out,{recursive:true});
const url='http://127.0.0.1:8765/workout/island/design/racing-themes-v1/preview.html?paused';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],failed=[],external=[];
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/')&&!r.url().startsWith('data:'))external.push(r.url());});
const checks=[];
function check(name,value){assert.ok(value,name);checks.push(name);}
try {
  await page.goto(url);await page.evaluate(()=>window.racingThemesPreview.ready);
  check('Canvas native dimensions 844x390',await page.$eval('canvas',c=>c.width===844&&c.height===390));
  check('Stage occupies 844x390',await page.$eval('.stage',e=>e.getBoundingClientRect().width===844&&e.getBoundingClientRect().height===390));
  const ids=['city-night','desert','snow','coast'],themes=[];
  for(const id of ids){
    await page.click(`[data-theme="${id}"]`);
    await page.waitForFunction(id=>window.racingThemesPreview.state.id===id&&window.racingThemesPreview.state.loaded,id);
    await page.evaluate(()=>{const p=window.racingThemesPreview;p.pause();p.setTime(3.25);});
    check(`${id}: ten local PNGs loaded`,await page.evaluate(()=>window.racingThemesPreview.assets.length===10));
    check(`${id}: active button follows selection`,await page.$eval(`[data-theme="${id}"]`,b=>b.getAttribute('aria-pressed')==='true'));
    check(`${id}: six accessible prop labels`,await page.locator('#prop-list .prop').count()===6);
    await page.locator('.stage').screenshot({path:`${out}${id}-844x390.png`});
    const baseline=await page.$eval('canvas',c=>c.toDataURL());
    for(const name of ['far','middle','near']){
      await page.locator(`[data-layer="${name}"]`).uncheck();
      const changed=await page.$eval('canvas',c=>c.toDataURL());
      check(`${id}: ${name} layer contributes visible pixels`,changed!==baseline);
      await page.locator(`[data-layer="${name}"]`).check();
    }
    const offsets=await page.evaluate(()=>['far','middle','near'].map(n=>window.racingThemesPreview.layerOffset(n,10)));
    check(`${id}: three increasing parallax rates`,offsets[0]>0&&offsets[0]<offsets[1]&&offsets[1]<offsets[2]);
    await page.evaluate(()=>window.racingThemesPreview.setTime(5.75));
    check(`${id}: continuous movement changes rendered pixels`,baseline!==await page.$eval('canvas',c=>c.toDataURL()));
    await page.click('#atlas');
    check(`${id}: asset mode pauses motion`,await page.evaluate(()=>window.racingThemesPreview.state.mode==='atlas'&&!window.racingThemesPreview.state.playing));
    await page.locator('.stage').screenshot({path:`${out}${id}-assets-844x390.png`});
    await page.click('#atlas');
    const profile=await page.evaluate(()=>{const t=window.racingThemesPreview.manifest.themes.find(t=>t.id===window.racingThemesPreview.state.id);return {id:t.id,bytes:t.totalBytes,propCount:t.props.length};});
    themes.push(profile);
  }
  // Frame stability while paused and actual requestAnimationFrame movement.
  await page.click('#motion');await page.waitForTimeout(180);
  check('Play starts animation',await page.evaluate(()=>window.racingThemesPreview.state.playing&&window.racingThemesPreview.state.time>5.75));
  await page.click('#motion');const time=await page.evaluate(()=>window.racingThemesPreview.state.time);
  await page.waitForTimeout(180);check('Pause freezes time',time===await page.evaluate(()=>window.racingThemesPreview.state.time));
  await page.click('#restart');check('Reset returns to beginning',0===await page.evaluate(()=>window.racingThemesPreview.state.time));
  await page.click('#atlas');await page.click('#motion');
  check('Play from the asset view returns to a moving scene',await page.evaluate(()=>window.racingThemesPreview.state.mode==='scene'&&window.racingThemesPreview.state.playing));
  await page.evaluate(()=>window.racingThemesPreview.pause());
  // Rapid swaps must not let an older load overwrite the most recent choice.
  await page.evaluate(()=>{const p=window.racingThemesPreview;return Promise.all(['city-night','snow','desert','coast'].map(id=>p.select(id)));});
  check('Rapid selection keeps the final theme',await page.evaluate(()=>window.racingThemesPreview.state.id==='coast'));
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.evaluate(()=>window.racingThemesPreview.ready);
  check('Reduced motion starts paused',await page.evaluate(()=>!window.racingThemesPreview.state.playing));
  await page.setViewportSize({width:390,height:844});
  check('No horizontal overflow at 390px',await page.evaluate(()=>document.documentElement.scrollWidth===390));
  await page.screenshot({path:`${out}responsive-390x844.png`});
  // Check native file:// opening with all network access disabled. No fetch needed.
  const filePage=await browser.newPage({viewport:{width:844,height:390},offline:true,reducedMotion:'reduce'});
  const fileErrors=[];filePage.on('pageerror',e=>fileErrors.push(e.message));
  let directFile='verified';
  try{await filePage.goto(`file://${root}preview.html?paused`);}catch(error){
    if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
    directFile='blocked-by-managed-browser-policy';
    // Keep the managed browser policy intact. Read the same package from disk
    // and fulfill requests locally while the browser network stays offline.
    await filePage.route('http://127.0.0.1:8765/**',async route=>{
      const requested=new URL(route.request().url()).pathname;
      const prefix='/workout/island/design/racing-themes-v1/';
      if(!requested.startsWith(prefix)||requested.includes('..'))return route.abort();
      const rel=requested.slice(prefix.length),type=rel.endsWith('.png')?'image/png':rel.endsWith('.js')?'text/javascript':'text/html';
      await route.fulfill({body:await readFile(root+rel),contentType:type});
    });
    await filePage.goto(url);
  }
  await filePage.evaluate(()=>window.racingThemesPreview.ready);
  for(const id of ids){await filePage.evaluate(id=>window.racingThemesPreview.select(id),id);check(`${id}: offline package load`,await filePage.evaluate(()=>window.racingThemesPreview.state.loaded&&window.racingThemesPreview.assets.length===10));}
  check('No offline JavaScript errors',fileErrors.length===0);
  await filePage.close();
  check('No JavaScript errors',errors.length===0);check('No failed asset requests',failed.length===0);check('No external requests',external.length===0);
  const hashes={};for(const f of ['preview.html','preview.js','manifest.json','manifest.js'])hashes[f]=createHash('sha256').update(await readFile(root+f)).digest('hex');
  const result={passed:true,checkedAt:new Date().toISOString(),browser:await browser.version(),viewport:[844,390],checks,themes,errors,failed,external,hashes,
    offline:{directFile,networkDisabled:true,fallback:'Same local files fulfilled from disk if managed file:// navigation is blocked.'},
    limitations:['Canvas2D asset preview; not a gameplay integration or a physical-phone FPS measurement.']};
  await writeFile(`${out}browser.json`,JSON.stringify(result,null,2)+'\n');console.log(`${checks.length} browser checks passed; offline loading and all four themes verified.`);
} finally {await browser.close();}
