import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.env.PHONE_FIX_ROOT||path.resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
const load=name=>import(pathToFileURL(path.join(root,'workout/island/minigames/'+name)));
const {createPitUi}=await load('racing-pit-ui.mjs'),{createRacing}=await load('racing-physics.mjs');
const {playerInput,racingV24Flags,v24PhysicsConfig}=await load('racing-v24.mjs');
const {pilot}=await import(pathToFileURL(path.join(process.env.PHONE_FIX_ASSETS||root,'workout/island/tools/racing-v24-sim.mjs')));
function fakeDocument(){const el=tag=>({tagName:tag,children:[],dataset:{},style:{},attrs:{},listeners:{},hidden:false,setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},append(...n){this.children.push(...n);},addEventListener(t,fn){this.listeners[t]=fn;},remove(){},querySelectorAll(){return [];},press(){this.listeners.pointerdown?.({preventDefault(){},stopPropagation(){}});}});return {createElement:el};}
function hud(query,auto=true){globalThis.location={search:query};const doc=fakeDocument(),stage=doc.createElement('div'),controls=doc.createElement('div'),calls=[];const ui=createPitUi({stage,controls,document:doc,auto,onRequest:()=>calls.push('request'),onCancel:()=>calls.push('cancel'),onTap:()=>calls.push('change')});const player={tyre:.8,pits:0,pit:null,lap:1,pitRequest:true,pitAuto:true};ui.update({player,laps:2,cars:[player]});return {doc,stage,controls,calls,ui,player};}
test('D automatic race has no pit request/cancel button; change control still works at the box',()=>{
 const h=hud('');assert.equal(h.controls.children.filter(n=>n.dataset.action==='racing-pit').length,0,'remove the automatic pit cancellation control');
 assert.equal(h.stage.children.filter(n=>n.className==='racing-tyres').length,1,'wear meter retained');
 h.player.pit={phase:'stop',t:0};h.ui.update({player:h.player,laps:2,cars:[h.player]});const change=h.controls.children.find(n=>n.dataset.action==='racing-pit-change');assert.equal(change.hidden,false);change.press();assert.deepEqual(h.calls,['change']);
});
function race(query,stage){globalThis.location={search:query};return createRacing({stage,seed:3,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(racingV24Flags('')),pitAuto:true}});}
function drive(r,{tryCancel=false}={}){const p=r.state.player,st={},flags=racingV24Flags(''),log=[];let cancel=null;
 for(let n=0;n<240*60&&r.state.phase!=='finished';n++){r.step(1/60,p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(r,p,st,{aLat:24,aBrake:20}),flags));log.push(...r.state.events.map(e=>({...e,time:r.state.time})));if(tryCancel&&p.pitRequest&&cancel===null)cancel=r.cancelPit();if(log.some(e=>e.car==='player'&&e.type==='pitExit'))break;}
 return {cancel,log};}
test('D automatic entry and tyre replacement complete in 2- and 3-lap races, even through the cancel API',t=>{
 for(const stage of [1,13]){const r=race('',stage),p=r.state.player,out=drive(r,{tryCancel:true});t.diagnostic(JSON.stringify({stage,cancel:out.cancel,time:r.state.time,pits:p.pits,tyre:p.tyre,pitEvents:out.log.filter(e=>e.car==='player'&&/^pit/.test(e.type))}));assert.equal(out.cancel,false,'auto pit cancellation unavailable through the model');assert.ok(out.log.some(e=>e.type==='pitIn'&&e.car==='player'&&e.auto));assert.ok(out.log.some(e=>e.type==='pitDone'&&e.car==='player'));assert.equal(p.pits,1);assert.ok(p.tyre>.95);r.dispose();}
});
test('D individual/global rollback restores cancel UI and API; old manual-only mode retains its request',()=>{
 for(const q of ['?phoneFixD=0','?phoneFixes=0']){const h=hud(q),button=h.controls.children.find(n=>n.dataset.action==='racing-pit');assert.ok(button);button.press();assert.deepEqual(h.calls,['cancel']);const r=race(q,1),out=drive(r,{tryCancel:true});assert.equal(out.cancel,true);assert.equal(r.state.player.pits,0);r.dispose();}
 const old=hud('',false);const button=old.controls.children.find(n=>n.dataset.action==='racing-pit');assert.ok(button);old.player.pitRequest=false;old.ui.update({player:old.player,laps:3,cars:[old.player]});button.press();assert.deepEqual(old.calls,['request']);
});
