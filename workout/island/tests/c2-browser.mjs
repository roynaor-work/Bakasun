import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {cityBrowser} from './city-fixture.mjs';

const directory=fileURLToPath(new URL('../verification/c2/',import.meta.url));await mkdir(directory,{recursive:true});
const viewports=process.env.C2_WIDTH?[{width:Number(process.env.C2_WIDTH),height:Number(process.env.C2_HEIGHT)}]:[{width:844,height:390},{width:390,height:844}];
const reports=[];
for(const {width,height} of viewports) {
  const fixture=await cityBrowser(width,height),{page,ids}=fixture,shots=[];
  const markers=()=>page.evaluate(()=>window.__island.view.cityDepth.root.children.map(o=>({...o.userData})));
  const shot=async name=>{const file=`${width}x${height}-${name}.png`;await page.screenshot({path:directory+file,style:'#interface,#toast,#modal-root{visibility:hidden!important}'});shots.push(file);};
  try {
    await page.evaluate(()=>{const {engine:e,view}=window.__island;view.zoom=1.5;view.resize();view.focusCell(6,7);window.cityEvents=[];e.subscribe((_,event)=>window.cityEvents.push(event.type));});
    await shot('damage-before');
    await page.evaluate(id=>{const e=window.__island.engine;e.state.events.repairs[id]=e.now()+180000;e.city.emergency();},ids.factory);
    assert.equal(await page.evaluate(id=>window.__island.view.groups.get(id).repairMarker.visible,ids.factory),true);await shot('damage-after');
    await page.evaluate(id=>window.__island.engine.city.repair(id),ids.factory);assert.equal(await page.evaluate(id=>window.__island.view.groups.get(id).repairMarker.visible,ids.factory),false);
    await shot('range-before');assert.equal((await markers()).filter(m=>m.cityKind==='water').length,0);
    assert.ok(await page.evaluate(id=>window.__island.engine.move(id,14,5).ok,ids.third));
    assert.ok((await markers()).some(m=>m.buildingId===ids.third&&m.reason==='out-of-range'));await shot('range-after');
    await page.evaluate(()=>window.__island.engine.undo());
    await shot('capacity-before');
    await page.evaluate(ids=>{const {engine:e,data}=window.__island;e.grantParts(data.world.partGroup,data.config.worldStages[1].requiredParts);for(const id of [ids.house,ids.second,ids.third]){if(!e.upgrade(id).ok||!e.upgrade(id).ok)throw Error('house upgrade');}},ids);
    assert.ok((await markers()).some(m=>m.cityKind==='water'&&m.reason==='capacity'));await shot('capacity-after');
    await shot('coverage-before');
    await page.evaluate(id=>window.__island.ui.showInfo(id),ids.tower);
    const coverage=await page.evaluate(id=>{const {view,engine:e}=window.__island;const service=e.city.report().buildings.find(b=>b.id===id).service;return {service,radius:view.radius.geometry.parameters.outerRadius,highlighted:view.cityDepth.root.children.filter(o=>o.userData.cityKind==='served').map(o=>o.userData.buildingId)};},ids.tower);
    assert.equal(coverage.radius,coverage.service.radius+.05);assert.deepEqual(coverage.highlighted,coverage.service.serves);await shot('coverage-after');
    await page.evaluate(()=>window.__island.ui.closeInfo());
    for(const type of ['factory','farm','tower']) {
      await shot(`${type}-tier-before`);await page.evaluate(id=>window.__island.engine.city.invest(id),ids[type]);assert.ok((await markers()).some(m=>m.buildingId===ids[type]&&m.tier===2));await shot(`${type}-tier-after`);
    }
    await shot('port-before');assert.equal((await markers()).filter(m=>m.cityKind==='port').length,0);
    await page.evaluate(()=>window.__island.engine.city.port());assert.equal((await markers()).filter(m=>m.cityKind==='port').length,1);await shot('port-after');
    await page.evaluate(()=>{const e=window.__island.engine,slots=e.city.report().port.slots;e.city.deliver(slots[0].id);e.city.skip(slots[1].id);});assert.equal((await markers()).filter(m=>m.cityKind==='port').length,0);await shot('port-closed');
    await page.evaluate(()=>window.__island.engine.city.goal('production'));
    // Municipal management is opt-in. Its existing flow, funding and road
    // connection rules must also remain authoritative for C2's coverage.
    await page.evaluate(id=>{const {engine:e,ui}=window.__island;for(let z=8;z<=11;z++){const r=e.place('road',13,z);if(!r.ok)throw Error(r.reason);}e.setCityPolicy({enabled:true,funding:{water:50}});ui.showInfo(id);},ids.tower);
    const managed=await page.evaluate(id=>{const {engine:e,view}=window.__island,provider=e.cityReport().services.water.providers.find(p=>p.id===id),service=e.city.report().buildings.find(b=>b.id===id).service;return {provider,service,radius:view.radius?.geometry.parameters.outerRadius,highlighted:view.cityDepth.root.children.filter(o=>o.userData.cityKind==='served').map(o=>o.userData.buildingId)};},ids.tower);
    assert.ok(managed.provider);assert.equal(managed.service.radius,managed.provider.radius);assert.equal(managed.service.capacity,managed.provider.capacity);assert.equal(managed.radius,managed.provider.radius+.05);assert.deepEqual(managed.highlighted,managed.provider.serves);
    // Prove the view trusts the report, including values that disagree with
    // world state; this catches accidental rule calculations in the view.
    await page.evaluate(ids=>{const {engine:e,view}=window.__island,report=e.city.report();const house=report.buildings.find(b=>b.id===ids.third),tower=report.buildings.find(b=>b.id===ids.tower);house.status='unserved';house.water.reason='out-of-range';tower.service.radius=11;tower.service.serves=[ids.third];view.setCityReport(report,ids.tower);},ids);
    assert.ok((await markers()).some(m=>m.buildingId===ids.third&&m.reason==='out-of-range'));assert.ok((await markers()).some(m=>m.cityKind==='served'&&m.buildingId===ids.third));assert.equal(await page.evaluate(()=>window.__island.view.radius.geometry.parameters.outerRadius),11.05);
    await page.evaluate(()=>{const {engine:e,ui}=window.__island;ui.closeInfo();e.place('road',0,0);e.place('road',1,0);window.cityUndoCount=0;const undo=e.undo;window.restoreUndo=()=>{e.undo=undo;};e.undo=()=>{window.cityUndoCount++;const r=undo();const until=performance.now()+550;while(performance.now()<until){}return r;};});
    await page.locator('[data-action=undo]').tap();await page.waitForTimeout(700);
    assert.equal(await page.evaluate(()=>window.cityUndoCount),1,'one round undo tap must execute exactly once even beyond the compatibility click window');
    assert.equal(await page.evaluate(()=>window.__island.engine.state.buildings.filter(b=>b.z===0&&b.x<2).length),1);
    await page.locator('[data-action=undo]').tap();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.cityUndoCount),2,'a fresh finger can undo the next action');await page.evaluate(()=>window.restoreUndo());
    await page.evaluate(()=>{const e=window.__island.engine;e.place('road',3,0);e.place('road',4,0);window.keyboardUndoCount=0;const undo=e.undo;e.undo=()=>{window.keyboardUndoCount++;return undo();};window.restoreKeyboardUndo=()=>{e.undo=undo;};});
    await page.locator('[data-action=undo]').focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>window.keyboardUndoCount),2,'Enter and Space each activate undo once');
    const undoBox=await page.locator('[data-action=undo]').boundingBox();await page.mouse.move(undoBox.x+undoBox.width/2,undoBox.y+undoBox.height/2);await page.mouse.down();await page.mouse.move(undoBox.x+undoBox.width/2+25,undoBox.y+undoBox.height/2);await page.mouse.up();
    assert.equal(await page.evaluate(()=>window.keyboardUndoCount),2,'dragging a button cancels activation');await page.evaluate(()=>window.restoreKeyboardUndo());
    await page.evaluate(()=>{const e=window.__island.engine,r=e.place('road',2,0);e.remove(r.id);});
    const events=await page.evaluate(()=>window.cityEvents);
    for(const type of ['city-invest','city-repair','city-deliver','city-skip','city-goal','city-emergency','city-port','upgrade','move','undo','place','remove'])assert.ok(events.includes(type),type);
    await fixture.check();reports.push({viewport:{width,height},coverage,managedCoverage:managed,oneTapOneUndo:true,slowActionMs:550,keyboardUndo:true,dragCancellation:true,reportAuthoritative:true,events:[...new Set(events)],errors:fixture.errors,shots});
    console.log(`C2 passed ${width}x${height}`);
  } catch(error) {await shot('failure').catch(()=>{});throw error;} finally {await fixture.close();}
}
await writeFile(directory+'verification.json',JSON.stringify({environment:'Chromium / ANGLE SwiftShader; simulated touch; fresh synthetic local saves',worldScreenshots:'HUD hidden only during capture to expose every world marker; C1 captures the full application UI',physicalPhone:false,reports},null,2)+'\n');
