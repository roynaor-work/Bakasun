/** Run with a repository-root HTTP server on 8765 and Playwright installed.
 * BOARS_CHROMIUM_PATH can select a system browser. Evidence stays in this pack.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const base=process.env.BOARS_PREVIEW_URL || 'http://127.0.0.1:8765/workout/island/design/boars-weapons-v2/preview.html';
const browser=await chromium.launch({executablePath:process.env.BOARS_CHROMIUM_PATH || '/usr/bin/chromium',
  headless:true, args:['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:844,height:390}, deviceScaleFactor:1});
const errors=[], failed=[], screenshots=[], scenarios=[];
page.on('pageerror', error=>errors.push(error.message));
page.on('console', message=>{if(message.type()==='error') errors.push(message.text());});
page.on('requestfailed', request=>failed.push({url:request.url(), error:request.failure()?.errorText}));
const evidence=new URL('./', import.meta.url);
const screenshot=async name=>{
  const path=fileURLToPath(new URL(name, evidence));
  await page.screenshot({path}); screenshots.push(name);
};
const state=()=>page.evaluate(()=>window.__weaponsPreview.state);
try {
  await page.goto(base);
  await page.waitForFunction(()=>window.__weaponsPreview?.ready, null, {timeout:30000});
  assert.equal(await page.locator('#fire').isEnabled(), true);
  assert.equal(await page.locator('#lab').evaluate(el=>el.getBoundingClientRect().width), 844);
  assert.equal(await page.locator('#lab').evaluate(el=>el.getBoundingClientRect().height), 390);
  const manifest=await page.evaluate(()=>window.__weaponsPreview.manifest);
  for (const [key, weapon] of Object.entries(manifest.weapons)) {
    await page.locator(`[data-weapon="${key}"]`).click();
    assert.equal((await state()).weapon,key);
    assert.equal(await page.locator(`[data-weapon="${key}"]`).getAttribute('aria-pressed'),'true');
    await page.locator('#fire').click();
    assert.equal((await state()).running,true);
    const flight=weapon.preview.flightSeconds;
    await page.evaluate(t=>window.__weaponsPreview.seek(t),flight*.5);
    assert.equal((await state()).impacted,false);
    assert.equal((await state()).shellVisible,key.startsWith('cannon'));
    if (key.startsWith('cannon')) assert.ok((await state()).shellNDC.slice(0,2).every(n=>Math.abs(n)<.94),'shell stays in frame');
    await screenshot(`${key}-flight-844x390.png`);
    await page.evaluate(t=>window.__weaponsPreview.seek(t),flight+.045);
    const hit=await state();
    assert.equal(hit.impacted,true);
    assert.equal(hit.hitCount,key.startsWith('cannon')?1:8);
    assert.ok(hit.activeEffects>0);
    await screenshot(`${key}-impact-844x390.png`);
    scenarios.push({weapon:key,flightSeconds:flight,hitCount:hit.hitCount});
    // Seek does not change the selected impact variant or leak lingering VFX.
    const previousVariation=hit.variation;
    await page.evaluate(t=>window.__weaponsPreview.seek(t),flight+.085);
    assert.equal((await state()).variation,previousVariation);
    await page.evaluate(()=>window.__weaponsPreview.seek(10));
    assert.equal((await state()).activeEffects,0);
    await page.evaluate(()=>window.__weaponsPreview.select('cannon'));
    assert.equal((await state()).activeEffects,0);
  }
  await page.evaluate(()=>{window.__weaponsPreview.select('cannon2');window.__weaponsPreview.target('ground');window.__weaponsPreview.seek(1.65);});
  assert.equal((await state()).craterVisible,true);
  await screenshot('crater-844x390.png');
  await page.evaluate(()=>{window.__weaponsPreview.target('boar');window.__weaponsPreview.select('shotgun');});
  const variations=new Set();
  for (let i=0;i<4;i++) {
    await page.evaluate(()=>window.__weaponsPreview.fire());
    await page.evaluate(()=>window.__weaponsPreview.seek(.31));
    variations.add((await state()).variation);
  }
  assert.equal(variations.size,4);
  await page.locator('#pause').click();
  await page.locator('#pause').click();
  const frozen=(await state()).time;
  await page.waitForTimeout(100);
  assert.equal((await state()).time,frozen);
  // Every delivered encoding is fetched and decoded by the real browser.
  const decoded=await page.evaluate(async()=>{
    const context=new AudioContext();
    const results=[];
    for (const [key,clip] of Object.entries(window.__weaponsPreview.manifest.audio)) {
      for (const [codec,path] of Object.entries(clip.sources)) {
        const response=await fetch(new URL(path,location.href));
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        results.push({key,codec,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate,duration:buffer.duration});
      }
    }
    await context.close();
    return results;
  });
  assert.equal(decoded.length,30);
  assert.ok(decoded.every(x=>x.channels===1&&x.duration>.1));
  // Actual HTMLAudio playback in both codecs, initiated from a user click.
  const playback=[];
  for (const codec of ['ogg','mp3']) {
    await page.evaluate(codec=>{
      document.getElementById('fire').onclick=()=>{
        window.__playbackResult=window.__weaponsPreview.playClip('impact-shotgun-1',codec);
      };
    },codec);
    await page.locator('#fire').click();
    assert.equal(await page.evaluate(()=>window.__playbackResult),true);
    assert.equal((await state()).lastCodec,codec);
    playback.push({codec,played:true});
    await page.evaluate(()=>window.__weaponsPreview.stopAudio());
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[]);
  // Simulate an unsupported/broken Ogg source to test the real MP3 fallback.
  await page.route('**/audio/cannon.ogg',route=>route.abort('failed'));
  await page.evaluate(()=>{
    document.getElementById('fire').onclick=()=>{
      window.__playbackResult=window.__weaponsPreview.playClip('cannon',null);
    };
  });
  await page.locator('#fire').click();
  assert.equal(await page.evaluate(()=>window.__playbackResult),true);
  assert.equal((await state()).lastCodec,'mp3');
  await page.unroute('**/audio/cannon.ogg');
  const fallbackEvidence={simulatedOggFailure:true,selectedCodec:(await state()).lastCodec};
  // Expected console/network failures above are recorded separately.
  const expectedFallbackFailures=failed.splice(0);
  const expectedFallbackErrors=errors.splice(0);
  assert.ok(expectedFallbackFailures.every(x=>x.url.endsWith('/audio/cannon.ogg')));
  await page.evaluate(()=>window.__weaponsPreview.stopAudio());
  await page.locator('#sound').click(); // enabled -> true, plays one short sample
  await page.locator('#sound').click(); // explicit mute stops every active voice
  assert.equal((await state()).audioVoices,0);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.__weaponsPreview.select('shotgun');window.__weaponsPreview.seek(.30);});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#fire').isVisible(),true);
  await screenshot('portrait-390x844.png');
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[]);
  const result={passed:true,browser:await browser.version(),viewport:[844,390],
    renderer:'Chromium WebGL / SwiftShader; functional verification only, no phone performance claim',
    scenarios,impactVariationsTested:4,browserDecodedAudio:decoded,playback,
    fallbackEvidence,expectedFallbackFailures,expectedFallbackErrors,
    unexpectedErrors:errors,unexpectedRequestsFailed:failed,screenshots};
  await writeFile(new URL('browser-validation.json',evidence),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:true,weaponScenarios:scenarios.length,decodedAudio:decoded.length,
    screenshots:screenshots.length,fallback:'mp3'},null,2));
} finally {await browser.close();}
