import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// The firing rules as written in boar-island/game.js (FIRE_V21 / sceneIgnores / firingInput), kept here as pure functions; the source test below pins game.js to them.
const sceneIgnores=({v21,aimstick,pointerType})=>Boolean(v21)||Boolean(aimstick)&&pointerType==='touch';
const firingInput=({v21,down,keyF,swapTimer=0})=>(Boolean(down)||(!v21&&Boolean(keyF)))&&swapTimer<=0;
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const read=p=>readFile(new URL('../workout/island/'+p,import.meta.url),'utf8');

test('final-boar: on a touch phone the scene ignores every pointer type and F does not fire', ()=>{
  for(const pointerType of ['touch','mouse','pen'])assert.equal(sceneIgnores({v21:true,aimstick:true,pointerType}),true,pointerType);
  assert.equal(sceneIgnores({v21:false,aimstick:true,pointerType:'touch'}),true);
  assert.equal(sceneIgnores({v21:false,aimstick:true,pointerType:'mouse'}),false,'v20 let a mouse-type pointer on the scene fire');
  assert.equal(sceneIgnores({v21:false,aimstick:false,pointerType:'touch'}),false,'desktop/legacy keeps touch-to-aim-and-fire');
  assert.equal(firingInput({v21:true,down:false,keyF:true}),false);
  assert.equal(firingInput({v21:false,down:false,keyF:true}),true);
  assert.equal(firingInput({v21:true,down:true,keyF:false}),true);
  assert.equal(firingInput({v21:true,down:true,keyF:false,swapTimer:.2}),false);
});

test('final-boar: game.js writes the firing flag only through setFiring/releaseFire and the scene handlers use the v21 guard', async()=>{
  const src=await read('minigames/boar-island/game.js');
  const writes=[...src.matchAll(/pointer\.down=(true|false|on)/g)].map(m=>m[0]);
  assert.deepEqual(writes.sort(),['pointer.down=false','pointer.down=on'],'only releaseFire and setFiring may assign pointer.down');
  assert.match(src,/const FIRE_V21=AIMSTICK&&new URLSearchParams\(location\.search\)\.get\('boarFire'\)!=='v20'/);
  assert.match(src,/const sceneIgnores=e=>FIRE_V21\|\|AIMSTICK&&e\.pointerType==='touch'/);
  for(const ev of ['pointermove','pointerdown'])assert.match(src,new RegExp(`\\$\\('scene'\\)\\.addEventListener\\('${ev}',e=>\\{if\\(mode!=='battle'\\|\\|sceneIgnores\\(e\\)\\)return;`),ev);
  assert.match(src,/\$\('scene'\)\.addEventListener\(ev,e=>\{if\(sceneIgnores\(e\)\|\|touchAim&&e\.pointerId!==touchAim\.id\)return;/,'a stray scene touch must not release the held fire button');
  assert.match(src,/firingInput=\(pointer\.down\|\|\(!FIRE_V21&&keys\.has\('KeyF'\)\)\)&&swapTimer<=0/);
  assert.match(src,/setFiring\(true,'button'\)/);
  assert.doesNotMatch(src,/aimZone\.addEventListener\([^)]*setFiring/,'the stick never fires');
});

test('final-boar: the shell forwards the kill switch and the layout keeps the ability buttons out of the stick zone', async()=>{
  const session=await read('minigames/boar-session.mjs');
  assert.match(session,/get\('boarFire'\)==='v20'\)url\.searchParams\.set\('boarFire','v20'\)/);
  const css=await read('minigames/boar-island/style.css');
  assert.match(css,/\.aimstick\.firev21 #aim-zone\{width:36%/);
  assert.match(css,/\.aimstick\.firev21 \.abilities\{left:auto;right:136px;bottom:18px/);
  assert.match(css,/\.aimstick\.firev21 \.ammo-panel\{pointer-events:none\}/);
  // landscape 844x390: stick zone = left 36% x bottom 78%; abilities row = 3 x 62 + 2 x 6 at right:136px bottom:18px
  const zone={x:0,y:390*.22,w:844*.36,h:390*.78},abilities={x:844-136-(3*62+12),y:390-18-60,w:3*62+12,h:60},fire={x:844-18-108,y:390-18-108,w:108,h:108};
  assert.equal(overlaps(zone,abilities),false,'abilities inside the stick zone');
  assert.equal(overlaps(zone,fire),false);
  assert.equal(overlaps(abilities,fire),false);
  // v20 layout for the record: abilities at left:28px bottom:140px, 312x82, inside the 48% zone
  assert.equal(overlaps({x:0,y:390*.22,w:844*.48,h:390*.78},{x:28,y:390-140-82,w:312,h:82}),true,'v20 abilities sat inside the stick zone');
});
