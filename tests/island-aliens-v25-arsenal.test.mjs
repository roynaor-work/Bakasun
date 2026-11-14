// Aliens v25 (14/11/2026), Roy after v24 on the phone: "the buttons are a good size, but better more reachable, lower down; there is no need for
// text on the left, it just gets in the way; more kinds of weapons, and a way to fill them up; and the aliens should fire a little more."
//  ?alienHud=v24       the v24 column above the ship's lane and the text by the stick (v25: the same rings from the bottom corner up, no text);
//  ?alienArsenal=0     the special button is the missile alone (v25: missile, chain lightning, shockwave on it, a switch, ammo tokens for each);
//  ?alienEnemyFire=v24 the v24 enemy fire (v25: cadence x0.8, two more bullets in the air).
// Pure rules, the model headless (phone aspect), drawing on a recording canvas, the switch on a fake DOM, data and wiring. The phone path is
// workout/island/tests/tennis-aliens-v24-1-browser.mjs; the balance table is workout/island/tools/alien-v25-sim.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {alienHudV25Enabled,alienArsenalEnabled,alienEnemyFireV25Enabled,ARSENAL_DEFAULTS,arsenalConfig,nextSpecial,ammoDropKind,shouldDropAmmo,ammoRefill,lightningChain,boltPoints,SPECIALS} from '../workout/island/minigames/alien-v25-arsenal.mjs';
import {drawV25Arsenal} from '../workout/island/minigames/alien-v25-draw.mjs';
import {createAlienSpecialSwitch} from '../workout/island/minigames/alien-v25-ui.mjs';
import {alienFrameInput} from '../workout/island/minigames/alien-session.mjs';
import {alienFlightFeedbackText} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {make,play} from '../workout/island/tools/alien-v25-sim.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const config=JSON.parse(await read('../workout/island/data/config.json')).minigames,balance=config.alienDefense,cfg=arsenalConfig(balance),FRAME=1/60,PHONE=(844/390)/(360/480);
const run=(m,s,input={})=>{for(let i=0;i<Math.round(s/FRAME);i++)m.update(FRAME,typeof input==='function'?input(m,i):input);};
function recorder(){const calls=[];const p=new Proxy({canvas:{clientWidth:844,clientHeight:390},calls},{get(t,k){if(k in t)return t[k];if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return(...a)=>{calls.push([k,...a]);};},set(t,k,v){t[k]=v;calls.push(['set:'+String(k),v]);return true;}});return p;}
/** A stage with every alien in place (entry over) and nothing firing back, for the weapon checks. */
function range(opts={}){const m=make({vulcan:'v24',...opts});m.effectAspect=PHONE;for(const a of m.aliens){a.entry=0;a.hp=a.maxHp=50;a.shield=0;}m.behavior.shoots=false;return m;}

test('v25 flags: HUD, arsenal and enemy fire on by default; ?alienHud=v24|v23, ?alienArsenal=0, ?alienEnemyFire=v24 (or the globals) restore v24; config carries the numbers',()=>{
 assert.equal(alienHudV25Enabled('',undefined),true);assert.equal(alienHudV25Enabled('?alienHud=v24',undefined),false);assert.equal(alienHudV25Enabled('?alienHud=v23',undefined),false);assert.equal(alienHudV25Enabled('','v24'),false);
 assert.equal(alienArsenalEnabled('',undefined),true);assert.equal(alienArsenalEnabled('?alienArsenal=0',undefined),false);assert.equal(alienArsenalEnabled('','0'),false);
 assert.equal(alienEnemyFireV25Enabled('',undefined),true);assert.equal(alienEnemyFireV25Enabled('?alienEnemyFire=v24',undefined),false);
 assert.ok(balance.arsenal25);for(const k of Object.keys(ARSENAL_DEFAULTS))assert.ok(k in balance.arsenal25,k);
 const on=make(),off=make({arsenal:'v24',enemy:'v24'});assert.equal(on.arsenalOn,true);assert.equal(on.enemyFireV25,true);assert.equal(off.arsenalOn,false);assert.equal(off.enemyFireV25,false);
 assert.deepEqual(SPECIALS,['missile','lightning','shockwave']);assert.equal(nextSpecial(0),1);assert.equal(nextSpecial(2),0);
});

test('a little more enemy fire: the cadence x0.8 and two more bullets in the air; measured +15% or more bullets per minute, stage 1 still won',()=>{
 const a=make({enemy:'v24'}),b=make();assert.ok(Math.abs(b.behavior.fireCadence-a.behavior.fireCadence*cfg.enemyFire.cadence)<1e-9);assert.equal(b.behavior.bulletCap,a.behavior.bulletCap+cfg.enemyFire.bulletCapAdd);
 const seeds=[1,2,3],v24=seeds.map(seed=>play({vulcan:'v24',enemy:'v24',arsenal:'v24',seed})),v25=seeds.map(seed=>play({vulcan:'v24',enemy:'v25',arsenal:'v24',seed}));
 const rate=rs=>rs.reduce((n,r)=>n+r.boltsPerMin,0)/rs.length;assert.ok(rate(v25)>=rate(v24)*1.15,`enemy bullets per minute ${rate(v24).toFixed(1)} -> ${rate(v25).toFixed(1)}`);
 assert.ok(rate(v25)<=rate(v24)*1.6,'a little, not double');assert.ok(v25.every(r=>r.win),'stage 1 is still won by a good child');
});

test('the switch: one press = the next special weapon (missile, lightning, shockwave, missile), held does not repeat; the special button fires the selected one',()=>{
 const m=range();assert.equal(m.special,0);m.update(FRAME,{switchSpecial:true});assert.equal(m.special,1);m.update(FRAME,{switchSpecial:true});assert.equal(m.special,1,'held: no repeat');
 m.update(FRAME,{});m.update(FRAME,{switchSpecial:true});assert.equal(m.special,2);m.update(FRAME,{});m.update(FRAME,{switchSpecial:true});assert.equal(m.special,0);
 // The missile keeps its v24 behaviour on the special button.
 const n0=m.novaCharges;m.update(FRAME,{});m.update(FRAME,{nova:true});assert.equal(m.novaCharges,n0-1);assert.ok(m.nova.flight>0);
});

test('chain lightning: an instant bolt to the nearest alien above the ship, then up to 3 jumps, each weaker; a charge per use, nothing in range costs nothing',()=>{
 const aliens=[{id:1,x:100,y:140,radius:14,hp:3},{id:2,x:130,y:110,radius:14,hp:3},{id:3,x:160,y:100,radius:14,hp:3},{id:4,x:190,y:110,radius:14,hp:3},{id:5,x:220,y:100,radius:14,hp:3},{id:6,x:340,y:420,radius:14,hp:3}];
 const chain=lightningChain(aliens,{x:100,y:380},{...cfg.lightning,jumpRange:110},1);assert.equal(chain.length,cfg.lightning.jumps+1);assert.equal(chain[0].id,1,'the nearest first');
 for(let i=1;i<chain.length;i++)assert.ok(Math.abs(chain[i].damage-chain[i-1].damage*cfg.lightning.falloff)<1e-9);assert.ok(!chain.some(c=>c.id===6),'never an alien below the ship');
 assert.equal(lightningChain(aliens,{x:100,y:380},{...cfg.lightning,firstRange:10},1).length,0);
 const pts=boltPoints({x:0,y:0},{x:0,y:-100},7,8,10);assert.equal(pts.length,9);assert.deepEqual(pts[0],{x:0,y:0});assert.deepEqual(pts.at(-1),{x:0,y:-100});assert.deepEqual(boltPoints({x:0,y:0},{x:0,y:-100},7,8,10),pts,'deterministic');
 const m=range();m.update(FRAME,{switchSpecial:true});m.update(FRAME,{});const before=m.aliens.map(a=>a.hp),ammo=m.specialAmmo[1];
 m.update(FRAME,{nova:true});assert.equal(m.specialAmmo[1],ammo-1);assert.ok(m.lightningFx&&m.lightningFx.points.length>=2,'the bolt is on screen');
 const hit=m.aliens.filter((a,i)=>a.hp<before[i]-1e-9).length;assert.ok(hit>=2,`${hit} aliens struck at once`);run(m,cfg.lightning.seconds+.05,{});assert.equal(m.lightningFx,null,'the bolt fades');
 const empty=range();empty.update(FRAME,{switchSpecial:true});empty.update(FRAME,{});for(const a of empty.aliens)a.hp=0;empty.update(FRAME,{nova:true});assert.equal(empty.specialAmmo[1],cfg.lightning.charges,'no living alien to strike: no charge spent');
});

test('shockwave: a ring rolls up from the ship, wipes out the enemy bullets it touches, hits every alien it passes once, one ring at a time, gone at its radius',()=>{
 const m=range();m.update(FRAME,{switchSpecial:true});m.update(FRAME,{});m.update(FRAME,{switchSpecial:true});m.update(FRAME,{});assert.equal(m.special,2);
 for(let i=0;i<6;i++)m.bolts.push({x:m.player.x+(i-3)*20,y:m.player.y-60-i*10,vx:0,vy:40});
 const hp=m.aliens.map(a=>a.hp);m.update(FRAME,{nova:true});assert.equal(m.shockwaves.length,1);assert.equal(m.specialAmmo[2],cfg.shockwave.charges-1);
 m.update(FRAME,{});m.update(FRAME,{nova:true});assert.equal(m.shockwaves.length,1,'one ring at a time');
 let t=0;while(m.shockwaves.length&&t<2){m.update(FRAME,{});t+=FRAME;}
 assert.ok(Math.abs(t-cfg.shockwave.maxRadius/cfg.shockwave.speed)<.1,`the ring lasted ${t.toFixed(2)} s`);assert.ok(m.snapshot().arsenal.waveBolts>=5,`bullets wiped ${m.snapshot().arsenal.waveBolts}`);
 const struck=m.aliens.filter((a,i)=>a.hp<hp[i]-1e-9);assert.ok(struck.length>=3,`${struck.length} aliens hit`);
 const once=cfg.shockwave.damage*(1+0*balance.hpPerStage);for(const [i,a] of m.aliens.entries())assert.ok(hp[i]-a.hp<=once*1.0001+1e-9,'each alien at most once');
});

test('ammo: a token for the emptiest weapon (big ships often, others by chance, pity for a weapon empty a while), one at a time; flying into it fills, capped',()=>{
 const max=[cfg.missile.max,cfg.lightning.max,cfg.shockwave.max];
 assert.equal(ammoDropKind([2,3,1],max,0),2);assert.equal(ammoDropKind([0,6,3],max,1),0);assert.equal(ammoDropKind([4,6,3],max,0),-1,'all full');assert.equal(ammoDropKind([2,3,0],max,2),2);
 const never=()=>.99,always=()=>0,d=cfg.drops;
 assert.equal(shouldDropAmmo({time:20,kind:1,random:never},d),false);assert.equal(shouldDropAmmo({time:20,kind:1,random:()=>d.bigChance-.01},d),true,'big ship');assert.equal(shouldDropAmmo({time:20,kind:0,random:()=>d.chance-.01},d),true);
 assert.equal(shouldDropAmmo({time:20,kind:0,random:always,lastDropAt:20-d.gapSeconds+.1},d),false,'gap');assert.equal(shouldDropAmmo({time:20,kind:0,random:always,onScreen:1},d),false,'one at a time');
 assert.equal(shouldDropAmmo({time:20,kind:0,random:never,emptyFor:d.pitySeconds},d),true,'pity');assert.equal(ammoRefill(1,cfg),cfg.lightning.refill);
 // In the model: a token falls during a stage and the pick-up fills its weapon.
 const m=make({level:2,seed:4});m.effectAspect=PHONE;let picked=null;
 for(let f=0;f<60*200&&!m.result&&!picked;f++){const tok=m.ammoDrops[0],t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0],want=tok?tok.x:t?t.x:m.player.x,before=[...m.specialAmmo];m.update(FRAME,{moveX:Math.max(-1,Math.min(1,(want-m.player.x)/12)),firing:true});if(m.snapshot().arsenal.collected>0)picked={before,after:[...m.specialAmmo]};}
 assert.ok(picked,'an ammo token was taken');assert.ok(picked.after.some((n,i)=>n>picked.before[i]),'a weapon got charges');
 const full=range();full.ammoDrops.push({id:1,kind:1,x:full.player.x,y:full.player.y,vy:0});for(let i=0;i<5;i++){full.ammoDrops.push({id:2+i,kind:1,x:full.player.x,y:full.player.y,vy:0});full.update(FRAME,{});}assert.equal(full.specialAmmo[1],cfg.lightning.max,'capped at max');
 assert.match(alienFlightFeedbackText({kind:'ammo',id:3,life:1,value:1}).text,/ברק שרשרת/);
});

test('?alienArsenal=0 is v24: the special button is the missile, the switch input does nothing, no arsenal fields',()=>{
 const m=make({arsenal:'v24',vulcan:'v24',enemy:'v24'});assert.equal(m.arsenalOn,false);m.update(FRAME,{switchSpecial:true});assert.equal(m.special,0);
 const s=m.snapshot();assert.equal('arsenal' in s,false);assert.equal(s.ammoDrops,undefined);assert.deepEqual(m.specialAmmo,[m.novaCharges]);
 const shared={sample:()=>({moveX:0,kickHeld:false,passHeld:true})};assert.deepEqual(alienFrameInput(shared,FRAME,null,.12,null),{moveX:0,firing:false,nova:true});
 assert.deepEqual(alienFrameInput(shared,FRAME,null,.12,{sample:()=>false},{sample:()=>true}),{moveX:0,firing:false,nova:true,vulcan:false,switchSpecial:true});
});

test('drawing: the bolt (three strokes per hop), the ring, the ammo tokens, from model state only; nothing with the arsenal off',()=>{
 const m=range();m.update(FRAME,{switchSpecial:true});m.update(FRAME,{});m.update(FRAME,{nova:true});m.ammoDrops.push({id:9,kind:0,x:100,y:200,vy:0});
 const p=recorder();const n=drawV25Arsenal(p,m,PHONE,1);assert.ok(n>=2);assert.ok(p.calls.filter(c=>c[0]==='stroke').length>=3*m.lightningFx.points.length,'three strokes per hop');
 const w=range();w.update(FRAME,{switchSpecial:true});w.update(FRAME,{});w.update(FRAME,{switchSpecial:true});w.update(FRAME,{});w.update(FRAME,{nova:true});w.update(FRAME*6,{});const q=recorder();assert.ok(drawV25Arsenal(q,w,PHONE,1)>=1);assert.ok(q.calls.some(c=>c[0]==='arc'));
 assert.equal(drawV25Arsenal(recorder(),make({arsenal:'v24'}),PHONE,1),0);
});

/** Minimal DOM for the switch. */
function fakeDom(){
 const node=(tag)=>{const map={},attrs={},kids=[];const n={tagName:tag,children:kids,dataset:{},parent:null,textContent:'',style:{setProperty(){}},addEventListener(type,fn,opts){(map[type]||=[]).push({fn,signal:opts?.signal});},dispatch(type,e={}){for(const l of map[type]||[])if(!l.signal?.aborted)l.fn({preventDefault(){},button:0,target:{matches:()=>false},...e});},
  setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k]??null,append(...k){for(const c of k){c.parent=n;kids.push(c);}},remove(){if(n.parent){const i=n.parent.children.indexOf(n);if(i>=0)n.parent.children.splice(i,1);}},replaceWith(o){if(n.parent){const i=n.parent.children.indexOf(n);o.parent=n.parent;n.parent.children[i]=o;}},
  querySelector(sel){const want=sel.replace(/`/g,'');const find=list=>{for(const c of list){if((want==='svg'&&c.tagName==='svg')||c.id===want.replace('#',''))return c;const f=find(c.children);if(f)return f;}return null;};return find(kids);}};return n;};
 const doc={head:node('head'),createElement:t=>node(t),createElementNS:(ns,t)=>node(t)},win=node('window'),controls=node('div'),pass=node('button');pass.id='pass';const icon=node('svg');pass.append(icon);controls.append(pass);return {doc,win,controls,pass,icon};
}
test('the switch on a fake DOM: one press per tap (and the C key), the special button shows the selected weapon, the switch the next one and its charges',()=>{
 const {doc,win,controls,pass,icon}=fakeDom();const sw=createAlienSpecialSwitch({controls,special:pass,missileIcon:icon,labels:{missile:'טיל',lightning:'ברק שרשרת',shockwave:'גל הלם',switch:'החלפת נשק'},windowTarget:win,documentTarget:doc});
 assert.equal(sw.button.id,'special-switch');assert.equal(sw.sample(),false);sw.setEnabled(true);sw.button.dispatch('pointerdown');assert.equal(sw.sample(),true);assert.equal(sw.sample(),false,'an edge');
 win.dispatch('keydown',{code:'KeyC'});assert.equal(sw.sample(),true);win.dispatch('keydown',{code:'KeyC',repeat:true});assert.equal(sw.sample(),false);
 sw.update({special:0,specialAmmo:[2,3,1]});assert.equal(sw.button.dataset.next,'lightning');assert.equal(controls.dataset.alienSpecial,'missile');assert.match(sw.button.getAttribute('aria-label'),/ברק שרשרת/);
 sw.update({special:1,specialAmmo:[2,3,1]});assert.equal(pass.dataset.special,'lightning');assert.equal(pass.getAttribute('aria-label'),'ברק שרשרת');assert.equal(sw.button.dataset.next,'shockwave');
 assert.equal(sw.button.children.find(c=>c.tagName==='small').textContent,'1','the next weapon\'s charges');
 sw.dispose();assert.equal(controls.dataset.alienSpecial,undefined);
});

test('HUD v25 stylesheet and wiring: the same ring sizes from the bottom corner up, the switch beside the special button, no text by the stick; only with data-alien-low',async()=>{
 const css=await read('../workout/island/minigames/alien-v25.css'),v24=await read('../workout/island/minigames/alien-v24.css'),session=await read('../workout/island/minigames/alien-session.mjs');
 const scope='[data-alien-fire=v23][data-alien-hud=v24][data-alien-low=on] ',bottom=sel=>{const i=css.indexOf(scope+sel+'{');assert.ok(i>=0,sel);const r=css.slice(i,css.indexOf('}',i));const m=r.match(/\+ (\d+)px\)/);return m?Number(m[1]):0;};
 const b=['#shoot','#vulcan','#pass'].map(bottom);assert.deepEqual(b,[0,76,146],'14 px, then 76 and 146 px above it');
 const v24bottom=sel=>Number(v24.match(new RegExp(`\\[data-alien-hud=v24\\] ${sel}\\{[^}]*bottom:calc\\(16\\.4% \\+ (\\d+)px\\)`))[1]);assert.ok(v24bottom('#shoot')+60>b[0]+14,'lower than v24 (above the 16.4% lane)');
 assert.doesNotMatch(css,/#shoot\{[^}]*width/,'the sizes stay the v24 ones');assert.match(css,/\.alien-special-switch\{[^}]*width:46px/);
 assert.match(css,/\.alien-flight-hud\[data-low=on\] \.alien-flight-control,[^{]*\.alien-flight-weapon\{display:none!important\}/);
 assert.match(session,/const hudV25=hudV24&&alienHudV25Enabled\(\);if\(hudV25\)\{ensureAlienV25Style\(\);controls\.dataset\.alienLow='on';\}/);assert.match(session,/hudRoot\.dataset\.low='on'/);
 assert.match(session,/if\(model\.arsenalOn\)\{ensureAlienV25Style\(\);specialSwitch=createAlienSpecialSwitch/);
 const strings=JSON.parse(await read('../workout/island/data/strings.he.json'));for(const k of ['minigame.lightning','minigame.shockwave','minigame.weaponSwitch','minigame.alienDefense.help.3.v24'])assert.ok(strings[k],k);
 assert.match(strings['minigame.alienDefense.help.3'],/גל הלם/);assert.doesNotMatch(strings['minigame.alienDefense.help.3'],/!/);
 const manifest=JSON.parse(await read('../workout/island/offline-manifest.json'));for(const f of ['minigames/alien-v25-arsenal.mjs','minigames/alien-v25-ui.mjs','minigames/alien-v25.css'])assert.ok(manifest.shell.includes(f),f);
});
