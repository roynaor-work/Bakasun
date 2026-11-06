import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {defenseV7Enabled,v7Specs,V7_BASE,V7_FILES} from '../workout/island/minigames/alien-v7.mjs';
import {alienModelSpecs} from '../workout/island/minigames/alien-assets.mjs';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')),balance=config.minigames.alienDefense;

test('defense v7: switch (?defenseV7=0, __defenseV7=false) and specs keep the legacy scale',()=>{
 assert.equal(defenseV7Enabled('',undefined),true);assert.equal(defenseV7Enabled('?defenseV7=0',undefined),false);assert.equal(defenseV7Enabled('?x=1',false),false);assert.equal(defenseV7Enabled('?defenseV7=1',undefined),true);
 const s=v7Specs(balance);assert.equal(s.enemies.length,balance.models.enemies.length);
 s.enemies.forEach((e,i)=>{assert.equal(e.scale,balance.models.enemies[i].scale);assert.equal(e.regularScale,balance.models.enemies[i].regularScale);});
 // after the view adds the facing correction, +Z-forward enemies end at 0 and the +Z-forward plane at 180 (nose up the screen)
 const turned=alienModelSpecs({...balance,models:s});assert.equal(turned.player.rotationY,180);for(const e of turned.enemies)assert.equal(e.rotationY,0);
 assert.ok(s.player.path.startsWith(V7_BASE));assert.ok(!JSON.stringify(s).includes('design/'));
});

test('defense v7: every runtime file exists under assets/defense-v7 and stays small',async()=>{
 let total=0;for(const f of [V7_FILES.player,...V7_FILES.enemies]){const st=await stat(new URL('../workout/island/'+V7_BASE+f,import.meta.url));assert.ok(st.size>1000&&st.size<60000,f);total+=st.size;}
 assert.ok(total<200000);
});

// Opt-in browser run (like the other island browser checks): ISLAND_CSP_BROWSER=1 node --test tests/island-defense-v7.test.mjs
test('defense v7: loads under the production CSP, and with its files blocked or ?defenseV7=0 the earlier models play',
 {skip:process.env.ISLAND_CSP_BROWSER!=='1',timeout:240000},async()=>{
 const server=await serveIsland(),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 async function run(qs,{block=false}={}){
  const context=await browser.newContext({viewport:{width:844,height:390}}),csp=await installIslandCspMonitor(context),page=await context.newPage();await csp.attachPage(page);
  const requests=[];page.on('request',r=>requests.push(r.url()));
  if(block)await page.route(/assets\/defense-v7\//,route=>route.abort());
  await page.goto(server.url+'tools/defense-v7.html'+qs);await page.waitForFunction(()=>window.__defense,null,{timeout:30000});await page.evaluate(()=>window.__defense.ready);
  await page.evaluate(()=>window.__defense.step(240));let drew=false;for(let i=0;i<3;i++)drew=await page.evaluate(()=>window.__defense.draw());
  const metrics=await page.evaluate(()=>window.__defense.metrics());await csp.assertClean();await context.close();return {drew,metrics,requests};
 }
 try{
  const live=await run('?level=5');
  assert.equal(live.drew,true);assert.equal(live.metrics.defenseV7,true);assert.equal(live.metrics.models.failed,0);
  assert.ok(live.requests.every(u=>u.startsWith(server.url)||/^(data|blob):/.test(u)),'no request leaves the island origin');
  assert.ok(live.requests.some(u=>u.includes('assets/defense-v7/defender-plane.glb')));assert.ok(!live.requests.some(u=>/design\/defense-v7/.test(u)),'runtime never reads design/');
  assert.ok(!live.requests.some(u=>u.includes('assets/models/alien-a.glb')),'the earlier ships are not downloaded when v7 loads');
  const blocked=await run('?level=5',{block:true});
  assert.equal(blocked.drew,true,'a missing v7 file never stops the game');assert.equal(blocked.metrics.defenseV7,false);assert.equal(blocked.metrics.models.loaded,6);
  assert.ok(blocked.requests.some(u=>u.includes('assets/models/alien-a.glb')),'the earlier ships come back');
  const off=await run('?defenseV7=0&level=5');
  assert.equal(off.metrics.defenseV7,false);assert.ok(!off.requests.some(u=>u.includes('assets/defense-v7/')),'the off switch requests no v7 file');
 }finally{await browser.close();await server.close();}
});
