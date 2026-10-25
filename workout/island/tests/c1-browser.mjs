import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {cityBrowser} from './city-fixture.mjs';

const width=Number(process.env.C1_WIDTH||844),height=Number(process.env.C1_HEIGHT||390);
const directory=fileURLToPath(new URL('../verification/c1/',import.meta.url));await mkdir(directory,{recursive:true});
const fixture=await cityBrowser(width,height),{page,ids}=fixture,shots=[];
const show=id=>page.evaluate(id=>window.__island.ui.showInfo(id),id);
const shot=async name=>{const file=`${width}x${height}-${name}.png`;await page.screenshot({path:directory+file});shots.push(file);};
try {
  await show(ids.factory);assert.ok(await page.locator('[data-action=city-upgrade]').isVisible());assert.equal(await page.locator('[data-action=upgrade]').isVisible(),false);
  await page.locator('[data-action=city-invest]').tap();assert.match(await page.locator('.city-production-tier').innerText(),/2/);
  await page.locator('[data-action=city-upgrade]').tap();assert.equal(await page.evaluate(id=>window.__island.engine.state.buildings.find(b=>b.id===id).level,ids.factory),2);await shot('production');
  await show(ids.tower);assert.match(await page.locator('.city-depth').innerText(),/12 מתוך 32/);await shot('water');
  await show(ids.harbor);await page.locator('[data-action=city-port]').tap();assert.equal(await page.locator('[data-action=city-deliver]').count(),2);
  const money=await page.evaluate(()=>window.__island.engine.state.money);await page.locator('[data-action=city-deliver]').first().tap();assert.ok(await page.evaluate(before=>window.__island.engine.state.money>before,money));await page.locator('[data-action=city-skip]').tap();await shot('orders');
  await page.evaluate(id=>{const {engine:e}=window.__island;e.state.events.repairs[id]=e.now()+180000;e.city.emergency();},ids.factory);
  await show(ids.factory);assert.equal(await page.locator('[data-city-status=damaged]').count(),1);await page.locator('[data-action=city-repair]').tap();assert.equal(await page.locator('[data-city-status=damaged]').count(),0);
  await show('city-hall');await page.locator('[data-city-goal=production] [data-action=city-goal]').tap();assert.ok(await page.locator('[data-city-goal=production] [data-action=city-goal]').isDisabled());await shot('goals');
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);
  const restored=await page.evaluate(id=>({version:window.__island.engine.state.version,tier:window.__island.engine.city.report().buildings.find(b=>b.id===id).production.tier,claimed:window.__island.engine.state.city.claimedGoals}),ids.factory);
  assert.equal(restored.version,18);assert.equal(restored.tier,2);assert.ok(restored.claimed.includes('production'));await fixture.check();
  await writeFile(directory+`${width}x${height}.json`,JSON.stringify({viewport:{width,height},checks:['city-upgrade','investment','water-capacity','delivery','skip','damage','repair','one-time-goal','reload-v18'],errors:fixture.errors,shots},null,2)+'\n');
  console.log(`C1 passed ${width}x${height}`);
} catch(error) {await shot('failure').catch(()=>{});throw error;} finally {await fixture.close();}
