#!/usr/bin/env node
/** Real DOM/keyboard/pointer checks for the local packaged viewer. No API seek is used. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {openPreview,root} from './browser-session.mjs';
const output=process.argv[2]||path.join(root,'verification/ui-controls.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceBytes=await fs.readFile(new URL(import.meta.url)),inputs={};
for(const file of ['preview.html','preview.css','preview.js','vendor/viewer-runtime.js','vendor/data.js'])inputs[file]={sha256:hash(await fs.readFile(path.join(root,file)))};
const s=await openPreview({clean:false,dpr:1.5}),p=s.page,steps=[];
const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=()=>p.evaluate(()=>soccerV7.state());
const record=async(name,detail={})=>steps.push({name,...detail,state:await state()});
try{
 assert.equal(await p.locator('#character option').count(),8);assert.equal(await p.locator('#clip option').count(),31);
 await p.selectOption('#character','goalkeeper');await p.waitForFunction(()=>soccerV7.state().characterID==='goalkeeper'&&soccerV7.state().models.every(m=>m.id==='goalkeeper'));await record('select goalkeeper');
 await p.selectOption('#clip','keeper_catch');assert.equal((await state()).clipID,'keeper_catch');
 await settle();const scrub=await p.locator('#scrub').boundingBox();await p.locator('#scrub').click({position:{x:scrub.width*.5,y:scrub.height*.5}});assert.equal((await state()).playing,false);assert.ok(Math.abs(await p.locator('#scrub').inputValue()-.5)<.01);const expectedSeekSeconds=await p.evaluate(()=>soccerV7.inspect().clipMap.get('keeper_catch').duration*.5);const seekState=await state();assert.ok(Math.abs(seekState.time-expectedSeekSeconds)<.015);assert.ok(seekState.models.every(model=>Math.abs(model.sampleSeconds-expectedSeekSeconds)<.015));await record('scrub actual range to half',{expectedSeekSeconds});
 await p.click('#play');assert.equal((await state()).playing,true);await p.click('#play');assert.equal((await state()).playing,false);await record('toggle play/pause');
 await p.selectOption('#view','face');await p.waitForFunction(()=>soccerV7.state().view==='face');await settle();
 const before=await p.evaluate(()=>soccerV7.inspect().camera.position.toArray());await p.locator('#stage').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('+');await settle();const after=await p.evaluate(()=>soccerV7.inspect().camera.position.toArray());assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))>.0001);await record('keyboard orbit and zoom',{cameraBefore:before,cameraAfter:after});
 await p.keyboard.press('Space');assert.equal((await state()).playing,true);await p.keyboard.press('Space');assert.equal((await state()).playing,false);
 const box=await p.locator('#stage').boundingBox();await p.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await p.mouse.down();await p.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:5});await p.mouse.up();await p.mouse.wheel(0,80);await settle();await record('pointer drag and wheel zoom');
 await p.locator('details.advanced summary').click();await p.selectOption('#lod','1');await p.waitForFunction(()=>soccerV7.state().models.every(m=>m.path.endsWith('lod1.glb')));await p.selectOption('#lighting','stadium');assert.equal((await state()).lighting,'stadium');
 await p.locator('#wireframe').check();assert.equal(await p.evaluate(()=>soccerV7.inspect().actors.every(a=>a.meshes.every(m=>(Array.isArray(m.material)?m.material:[m.material]).every(mat=>mat.wireframe)))),true);await p.locator('#wireframe').uncheck();
 await p.locator('#skeleton').check();assert.equal(await p.evaluate(()=>soccerV7.inspect().actors.every(a=>a.helper.visible)),true);await p.locator('#skeleton').uncheck();await record('advanced lighting LOD wireframe skeleton');
 await p.click('#controls-toggle');assert.equal(await p.locator('#controls-toggle').getAttribute('aria-expanded'),'false');await p.click('#controls-toggle');assert.equal(await p.locator('#controls-toggle').getAttribute('aria-expanded'),'true');
 await p.setViewportSize({width:844,height:390});await settle();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await record('landscape layout no horizontal overflow');
 await p.selectOption('#view','pitch');await p.waitForFunction(()=>soccerV7.state().models.length===12);assert.equal((await state()).models.length,12);await record('pitch via actual select');
 await p.selectOption('#view','body');await p.waitForFunction(()=>soccerV7.state().models.length===1);await p.click('#reset');assert.equal(Number(await p.locator('#scrub').inputValue()),0);await record('return from pitch and reset');
 for(const [file,stamp]of Object.entries(inputs))assert.equal(hash(await fs.readFile(path.join(root,file))),stamp.sha256,'Input changed: '+file);
 assert.deepEqual(s.errors,[]);assert.deepEqual(s.remoteRequests,[]);assert.deepEqual((await state()).errors,[]);
 const report={kind:'real-ui-controls-browser-smoke',generatedAt:new Date().toISOString(),complete:true,pass:true,method:'Actual DOM selects, range input, buttons, keyboard and pointer events against the packaged local viewer. Paused initial state; external HTTP blocked. Not a physical-touch-device or phone FPS test.',auditSource:{file:'source/audit-ui.mjs',sha256:hash(sourceBytes)},inputs,steps,errors:s.errors,remoteRequests:s.remoteRequests};
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:true,steps:steps.length,output}));
}finally{await s.close();}
