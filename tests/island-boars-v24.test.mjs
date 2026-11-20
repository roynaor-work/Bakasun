import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AIM24,V23,followAnchor,stickCurve,topSpeed,edgeDistance,magnetRadius,createAimAssist} from '../workout/island/minigames/boar-island/aim-v24.mjs';
import {runTrials,makeStick,boarPath} from '../workout/island/tests/boar-aim-model.mjs';
import {createKidBot,rng} from '../workout/island/tests/boar-kid-bot.mjs';

// 14/11/2026, Roy after v22.1: "היכולת להזיז את הכיוון ירי לא מספיק טובה. צריך לתקן את היכולת לכוון מדויק יותר ולהזיז בקלות יותר."
const read=p=>readFile(new URL('../workout/island/'+p,import.meta.url),'utf8');
const boar=(id,x,y,r=15)=>({id,x,y,zones:[{x:x+.3,y:y+.5,r},{x,y,r:r*.3,crit:true}]});

test('boars v24: the stick itself is the v23 stick (curve, dead zone, smoothing, top speeds), so the v23 checks still hold', ()=>{
  for(const k of ['R','DZ','LIN','POW','TAU','SPEED_X','SPEED_Y'])assert.equal(AIM24[k],V23[k],k);
  // game.js stickMag (STICK_V21): mag*(.3+.7*mag) after a dead zone of 8%
  const stickMag=m=>{const mag=Math.max(0,Math.min(1,(m-.08)/.92));return mag*(.3+.7*mag);};
  for(const m of [0,.05,.08,.081,.13,.2,.3,.5,.75,1,1.4])assert.ok(Math.abs(stickCurve(m,V23)-stickMag(m))<1e-12,String(m));
  // a 20% tilt is still the fine-aim speed of v21 (the browser acceptance asks for at most 60% of v20's 0.145 units/s)
  assert.ok(stickCurve(.2)*AIM24.SPEED_X<=.145*.6);
  // AIM_TRUE: pure sideways and pure up keep 1.6 and 1.3 screen halves per second
  assert.ok(Math.abs(topSpeed(1,0,844,390)-1.6*422)<1e-9&&Math.abs(topSpeed(0,1,844,390)-1.3*195)<1e-9);
});

test('boars v24: the ring follows the thumb past its edge, so coming back after a fast push turns the crosshair at once', ()=>{
  const s={ox:100,oy:300},R=AIM24.R;
  assert.deepEqual(followAnchor(s,140,300,R),{dx:40,dy:0,d:40,moved:false});assert.equal(s.ox,100,'inside the ring the centre stays');
  const a=followAnchor(s,300,300,R);assert.equal(a.moved,true);assert.ok(Math.abs(a.d-R)<1e-9&&Math.abs(s.ox-220)<1e-9&&s.oy===300,'the centre is dragged to 80 px behind the thumb');
  // the thumb comes back 100 px (still 100 px right of where it landed): v24 already points left, v23 still points right at full tilt
  const b=followAnchor(s,200,300,R);assert.ok(b.dx<0&&b.moved===false,'v24: left of the dragged centre');
  const v23dx=200-100;assert.ok(v23dx>R,'v23: the fixed centre still reads a full push to the right');
  // diagonal: the centre moves along the thumb's line, the offset keeps its direction
  const d={ox:0,oy:0};const c=followAnchor(d,300,-400,R);assert.ok(Math.abs(Math.atan2(c.dy,c.dx)-Math.atan2(-400,300))<1e-9&&Math.abs(Math.hypot(c.dx,c.dy)-R)<1e-9);
});

test('boars v24: the aim help works only while the thumb is on the stick and never fights a push away', ()=>{
  const A=createAimAssist();
  // thumb off: untouched, and the target is forgotten
  assert.deepEqual(A.step({dt:1/60,cx:400,cy:200,vx:120,vy:-30,held:false,targets:[boar(1,405,200)]}),{vx:120,vy:-30,info:null});assert.equal(A.target,null);
  // far from every boar: untouched
  const far=A.step({dt:1/60,cx:100,cy:100,vx:200,vy:0,held:true,tilt:.5,targets:[boar(1,500,250)]});assert.deepEqual([far.vx,far.vy],[200,0]);assert.equal(far.info,null);
  // over a boar: slower (60%), and pulled toward the eyes, never past them in one frame
  const A2=createAimAssist(),over=A2.step({dt:1/60,cx:400,cy:205,vx:100,vy:0,held:true,tilt:.3,targets:[boar(2,404,200)]});
  assert.equal(over.info.friction,AIM24.FRICTION_MIN);assert.ok(over.info.pull>0&&over.info.pull<=AIM24.MAGNET_SPEED);
  const toEyes=Math.hypot(404-400,200-205),step=Math.hypot(over.vx-100*AIM24.FRICTION_MIN,over.vy)/60;assert.ok(step<=toEyes+1e-9,'the pull never jumps past the aim point');
  // a deliberate push away from the boar switches the pull off (only the slowdown is left while still over it)
  const A3=createAimAssist(),away=A3.step({dt:1/60,cx:400,cy:205,vx:-300,vy:0,held:true,tilt:.6,targets:[boar(3,410,205)]});
  assert.equal(away.info.away,true);assert.equal(away.info.pull,0);assert.ok(away.vx<0&&Math.abs(away.vy)<1e-9,'it still moves the way the thumb pushes');
  // the slowdown fades out smoothly: 100% speed at 22 px from the boar's edge, no jump
  const f=d=>{const B=createAimAssist();return B.step({dt:1/60,cx:400-15-d,cy:300,vx:-50,vy:0,held:true,tilt:.6,targets:[{id:4,x:400,y:300,zones:[{x:400,y:300,r:15}]}]}).info?.friction??1;};
  assert.equal(f(AIM24.FRICTION_PAD+1),1);let prev=f(-15);for(let d=-14;d<=AIM24.FRICTION_PAD;d+=1){const v=f(d);assert.ok(v>=prev-1e-9&&v-prev<.08,`friction ${prev} -> ${v} at ${d} px`);prev=v;}
  // a boss's big body does not slow the crosshair, its small weak spot does
  const boss={id:5,x:420,y:150,zones:[{x:420,y:200,r:90},{x:420,y:150,r:12,crit:true}]};
  assert.equal(edgeDistance(boss,420,260,AIM24.FRICTION_MAX_R)>AIM24.FRICTION_PAD,true);assert.ok(magnetRadius(boss)<=AIM24.MAGNET_MAX_R);
});

test('boars v24: a push away always leaves the boar (the help never traps the crosshair), a firm push almost as fast as v23', ()=>{
  const leave=(version,r,tilt)=>{const st=makeStick(version),c={x:400,y:200},tg={id:1,x:400,y:200,zones:[{x:400.3,y:200.5,r},{x:400,y:200,r:r*.3,crit:true}]};st.down(100,300);st.move(100+tilt*80,300);
    for(let i=1;i<=60*6;i++){st.step(1/60,c,version==='v24'?[tg]:[]);if(c.x-400>r+AIM24.FRICTION_PAD)return i/60;}return Infinity;};
  for(const r of [7,15,25])for(const tilt of [.2,.3,.4,.6,1]){const a=leave('v23',r,tilt),b=leave('v24',r,tilt);
    assert.ok(Number.isFinite(b),`r${r} tilt ${tilt}: stuck`);assert.ok(b<=a*1.6+.05,`r${r} tilt ${tilt}: v24 ${b.toFixed(2)} s vs v23 ${a.toFixed(2)} s`);
    if(tilt>=.4)assert.ok(b<=.65,`r${r} tilt ${tilt}: a firm push leaves within 0.65 s (${b.toFixed(2)})`);}
  // a walking boar does not drag the crosshair against a thumb that pushes the other way
  const A=createAimAssist();let x=400;const c={x:400,y:200};for(let i=0;i<60;i++){x+=1.5;const o=A.step({dt:1/60,cx:c.x,cy:c.y,vx:-60,vy:0,held:true,tilt:.2,targets:[boar(9,x,200)]});c.x+=o.vx/60;}
  assert.ok(c.x<400,'pushed left while the boar walks right: the crosshair goes left '+c.x.toFixed(1));
});

test('boars v24: the crosshair follows a walking boar it is on, and stays put with the thumb off', ()=>{
  const A=createAimAssist();let x=400,info=null;const c={x:400,y:200};
  for(let i=0;i<30;i++){x+=1;const o=A.step({dt:1/60,cx:c.x,cy:c.y,vx:0,vy:0,held:true,tilt:0,targets:[boar(7,x,200)]});c.x+=o.vx/60;c.y+=o.vy/60;info=o.info;}
  assert.ok(info.follow>.5,'following');assert.ok(Math.abs(c.x-x)<3,`on the boar after half a second: ${c.x} vs ${x}`);
  const before={...c};const off=A.step({dt:1/60,cx:c.x,cy:c.y,vx:0,vy:0,held:false,targets:[boar(7,x+1,200)]});assert.deepEqual([off.vx,off.vy],[0,0]);assert.deepEqual(c,before);
});

test('boars v24: child-like touch model, 8-12 deg aim noise: hits up 30-60%, time to get on a new boar down 40% or more (median), fewer corrections', ()=>{
  const out=[];
  for(const sigmaDeg of [8,10,12]){const agg=v=>{const s={hit:0,med:0,mean:0,strokes:0};for(const seed of [1,2,3,4]){const r=runTrials({version:v,sigmaDeg,seed,trials:100});s.hit+=r.all.hitRate/4;s.med+=r.all.aimMedian/4;s.mean+=r.all.aimMean/4;s.strokes+=r.all.strokes/4;}return s;};
    const a=agg('v23'),b=agg('v24'),hit=b.hit/a.hit-1,med=1-b.med/a.med,mean=1-b.mean/a.mean;out.push({sigmaDeg,v23:a,v24:b,hit,med,mean});
    assert.ok(hit>=.3&&hit<=.6,`σ${sigmaDeg}: hit rate ${a.hit.toFixed(3)} -> ${b.hit.toFixed(3)} (+${(hit*100).toFixed(0)}%)`);
    assert.ok(med>=.4,`σ${sigmaDeg}: median time to get on a new boar ${a.med.toFixed(2)} -> ${b.med.toFixed(2)} s (-${(med*100).toFixed(0)}%)`);
    assert.ok(mean>=.3,`σ${sigmaDeg}: mean ${a.mean.toFixed(2)} -> ${b.mean.toFixed(2)} s`);
    assert.ok(b.strokes<a.strokes*.8,`σ${sigmaDeg}: corrections ${a.strokes.toFixed(1)} -> ${b.strokes.toFixed(1)}`);}
  console.log('boars v24 model',JSON.stringify(out.map(o=>({σ:o.sigmaDeg,hit:[+o.v23.hit.toFixed(3),+o.v24.hit.toFixed(3)],aimMedian:[+o.v23.med.toFixed(2),+o.v24.med.toFixed(2)],aimMean:[+o.v23.mean.toFixed(2),+o.v24.mean.toFixed(2)],strokes:[+o.v23.strokes.toFixed(1),+o.v24.strokes.toFixed(1)]}))));
});

test('boars v24: the model runs the same stick as game.js and the measured boars', ()=>{
  // v23 stick in the model: a full push right moves 675 px/s, up 253.5 px/s (AIM_TRUE), stops at once on release
  const st=makeStick('v23'),c={x:60,y:200};st.down(100,300);st.move(300,300);for(let i=0;i<30;i++)st.step(1/60,c);const x0=c.x;st.step(1/60,c);assert.ok(Math.abs((c.x-x0)*60-675.2)<2,'full tilt right: '+(c.x-x0)*60);
  const su=makeStick('v23'),cu={x:400,y:380};su.down(100,300);su.move(100,100);for(let i=0;i<30;i++)su.step(1/60,cu);const y0=cu.y;su.step(1/60,cu);assert.ok(Math.abs((y0-cu.y)*60-253.5)<1,'full tilt up: '+(y0-cu.y)*60);
  st.up();const x=c.x;st.step(1/60,c);assert.equal(c.x,x);
  // v24 without boars moves exactly like v23 (the help only acts near a boar)
  const a=makeStick('v23'),b=makeStick('v24'),ca={x:300,y:200},cb={x:300,y:200};a.down(100,300);b.down(100,300);a.move(150,270);b.move(150,270);
  for(let i=0;i<40;i++){a.step(1/60,ca);b.step(1/60,cb);}assert.ok(Math.abs(ca.x-cb.x)<1e-9&&Math.abs(ca.y-cb.y)<1e-9);
  // the boars are the ones measured in the game: a 15 px mortar, a runner that grows from 7 to 22 px
  const r=rng(3),m=boarPath('standing',r)(0),run=boarPath('moving',r);assert.equal(m.zones[0].r,15);assert.ok(Math.abs(run(0).zones[0].r-7.3)<1e-9&&run(7).zones[0].r>21);
  // the bot is deterministic
  const t=()=>{const k=createKidBot({seed:5});const o=[];for(let i=0;i<12;i++)o.push(k.tick({t:i*.12,cx:100,cy:100,target:{id:1,x:400,y:200,rv:10}}));return JSON.stringify(o);};assert.equal(t(),t());
});

test('boars v24: wired into game.js behind ?boarAim=v23, forwarded by the island, versioned import, listed for offline', async()=>{
  const src=await read('minigames/boar-island/game.js'),session=await read('minigames/boar-session.mjs'),tag=JSON.parse(await read('release.json')).version,offline=JSON.parse(await read('offline-manifest.json'));
  assert.match(src,/const AIM_V24=STICK_V21&&AIM_TRUE&&new URLSearchParams\(location\.search\)\.get\('boarAim'\)!=='v23';/);
  assert.ok(src.includes(`import {followAnchor,createAimAssist} from './aim-v24.mjs?v=${tag}';`),'the new import carries the release tag');
  // the help runs only inside the stick step (which returns at once with the thumb off) and is forgotten on release
  assert.match(src,/function aimStickStep\(dt\)\{if\(!AIMSTICK\|\|!aimStick\)return;/);assert.match(src,/if\(AIM_V24\)aimStep24\(dt,g\);\n  else if\(AIM_TRUE\)\{/);
  assert.match(src,/aimStick=null;ring\.classList\.remove\('on','precise'\);rest\.hidden=false;\$\('crosshair'\)\.classList\.remove\('moving'\);if\(AIM_V24\)\{aim24\.reset\(\);aim24State=null;/);
  assert.match(src,/if\(AIM_V24\)\{stickMove24\(e,ring,knob,R\);return;\}/);
  assert.equal((src.match(/aim24\.step\(/g)||[]).length,1,'one call site');assert.doesNotMatch(src,/fireBtn\.addEventListener\([^)]*aim24/,'the fire button never moves the crosshair');
  assert.match(src,/view\(\)\{camera\.updateMatrixWorld\(\);const h=castShot\(aimRay\(\),TOUCH\?1\.35:1\)/,'the QA eyes of the touch bot (read only, under ?qa)');
  // the bot's clock stop exists only as a QA hook: set in one place (installQA), read in the frame loop
  assert.deepEqual(src.match(/qaHold=[^;,]*/g),['qaHold=false','qaHold=!!on']);assert.match(src,/if\(islandPaused\|\|qaHold\)\{lastTime=t;return;\}/);
  assert.ok(src.indexOf('hold(on){qaHold=!!on;}')>src.indexOf('function installQA(){'),'hold() is part of installQA (only with ?qa)');
  assert.match(session,/if\(aim==='v23'\|\|aim==='axes'\)url\.searchParams\.set\('boarAim',aim\);/);
  assert.ok(offline.shell.includes('minigames/boar-island/aim-v24.mjs'),'offline shell lists aim-v24.mjs');
  assert.match(src,/AIM_V24\?'כשהכוונת קרובה לחזיר, היא עוזרת לכוון לעיניים שלו\. היא עוקבת אחריו כל עוד האגודל על הג׳ויסטיק\. ':''/,'the in-game help tells the child');
});
