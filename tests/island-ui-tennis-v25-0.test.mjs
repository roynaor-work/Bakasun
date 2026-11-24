import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {statSync,existsSync} from 'node:fs';
import {clipForV3,poseV3,mirrorDirections,armTargets,loadMotionV3,tennisMotionV3Enabled,V3_CLIPS,V3_RULES} from '../workout/island/minigames/tennis-motion-v3.mjs';
import {clipFor} from '../workout/island/minigames/tennis-motion.mjs';
import {uiIconsEnabled,UI_ICONS,uiIconUrl,installUiIcons,uiIconOr} from '../workout/island/ui/ui-icons.mjs';

const root=new URL('../workout/island/',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const v3=JSON.parse(await read('assets/tennis-motion-v3/core.json')),v1=JSON.parse(await read('assets/tennis-motion-v1/core.json'));
const manifest=JSON.parse(await read('offline-manifest.json'));
const ARABIC=/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

test('motion v3: the runtime file is pose data on the v1 skeleton: no mesh, no triangles, small',async()=>{
  assert.deepEqual(v3.bones,v1.bones,'same canonical 18-bone skeleton as v1');
  assert.deepEqual(Object.keys(v3.clips),[...V3_CLIPS]);
  assert.deepEqual(Object.keys(v3).sort(),['bones','clips','fps','library'],'nothing but bones and clips: no geometry of any kind');
  for(const [name,clip] of Object.entries(v3.clips)){
    assert.ok(clip.frames.length>=30&&clip.dur>0,name);
    for(const f of [clip.frames[0],clip.frames.at(-1)]){assert.equal(Object.keys(f.rot).length,18);assert.equal(f.hips.length,3);for(const q of Object.values(f.rot))assert.ok(Math.abs(Math.hypot(...q)-1)<2e-3,name+' unit quaternion');}
  }
  for(const stroke of ['volley_low','volley_high','half_volley','lob','overhead_backward','serve_return_aggressive','defensive_slice','slide_to_ball'])assert.equal(v3.clips[stroke].events[0]?.name,'racket_contact',stroke);
  assert.ok(statSync(new URL('assets/tennis-motion-v3/core.json',root)).size<=600000);
  assert.deepEqual((await readdir(new URL('assets/tennis-motion-v3/',root))).sort(),['LICENSES.md','core.json'],'no model file travels with the clips');
  assert.match(await read('assets/tennis-motion-v3/LICENSES.md'),/CC0-1\.0/);
});

test('motion v3: clips are chosen from what the game already knows; anything else stays with v1',()=>{
  const clips=v3.clips,pick=(extra,player={})=>clipForV3({index:0,player:{swing:0,vx:0,vz:0,z:8,x:0,stroke:'forehand',...player},phase:'rally',...extra},clips);
  const hit=(player,extra={})=>pick(extra,{swing:.2,contactPoint:{x:.4,y:.9,z:8},...player});
  assert.equal(pick({}),null,'standing: the game pose');assert.equal(pick({},{vz:-3}),null,'running forward stays v1');assert.equal(pick({},{vx:-3}),null,'running to the left stays v1 (run_left)');
  assert.deepEqual(pick({},{vx:3}),{name:'lateral_crossover_run',kind:'run',mirror:true},'running to the racket-hand side: v1 had no clip');
  assert.deepEqual(clipForV3({index:1,player:{swing:0,vx:-3,vz:0,z:-8},phase:'rally'},clips),{name:'lateral_crossover_run',kind:'run',mirror:true},'the opponent faces the other way');
  assert.equal(hit({}),null,'a plain baseline forehand stays v1');
  assert.equal(hit({contactPoint:null}),null,'a swing that met nothing stays v1');
  assert.deepEqual(hit({lob:true}),{name:'lob',kind:'stroke',mirror:false});assert.equal(hit({lob:true,stroke:'backhand'}).mirror,true);
  assert.deepEqual(hit({},{shot:{side:0,drop:true}}),{name:'defensive_slice',kind:'stroke',mirror:true},'the slice is authored toward the left: mirrored for a forehand');
  assert.equal(hit({stroke:'backhand'},{shot:{side:0,drop:true}}).mirror,false);
  assert.equal(hit({},{shot:{side:1,drop:true}}),null,'the other player\'s drop is not this player\'s stroke');
  assert.equal(hit({contactPoint:{x:.4,y:2,z:8}}).name,'overhead_backward');
  assert.equal(hit({z:3,contactPoint:{x:.4,y:.3,z:3}}).name,'half_volley');assert.equal(hit({z:3,contactPoint:{x:.4,y:.8,z:3}}).name,'volley_low');assert.equal(hit({z:3,contactPoint:{x:.4,y:1.3,z:3}}).name,'volley_high');
  assert.equal(hit({contactPoint:{x:1.2,y:.9,z:8}}).name,'slide_to_ball');
  assert.equal(hit({},{shot:{side:0},rallyHits:2}).name,'serve_return_aggressive');assert.equal(hit({},{shot:{side:0},rallyHits:4}),null);
  assert.equal(hit({},{serving:true}),null,'the serve stays v1');assert.equal(pick({tossing:true}),null);
  assert.equal(pick({phase:'point',winner:0}).name,'point_win');assert.equal(pick({phase:'game',winner:0}).name,'childlike_joy');assert.equal(pick({phase:'point',winner:1}).name,'point_disappointment');
  assert.equal(clipForV3({index:1,player:{swing:0},phase:'game',winner:1},clips).name,'point_win','the opponent does not get the child\'s jump');
  assert.equal(pick({phase:'point',winner:undefined}),null);
  assert.equal(clipForV3({index:0,player:{swing:0,vx:3,vz:0},phase:'rally'},{}),null,'no clips loaded: nothing changes');
  assert.equal(clipFor({index:0,player:{swing:0,vx:3,vz:0},phase:'rally'},v1.clips),null,'v1 is unchanged: run_right is still not admitted');
  assert.ok(V3_RULES.reactSpeed>=1);
});

test('motion v3: sampled poses are sane, the crouch lowers the hips, and a mirror is exact',()=>{
  const ready=poseV3(v3.bones,v3.clips.half_volley,0),low=poseV3(v3.bones,v3.clips.half_volley,v3.clips.half_volley.events[0].at);
  for(const d of Object.values(low.dirs))assert.ok(Math.abs(Math.hypot(...d)-1)<1e-6);
  assert.ok(low.hips<ready.hips-.15,'the half volley is hit from a deep crouch');assert.ok(low.dirs.Spine[1]>.5);
  for(const leg of ['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightForeArm'])assert.ok(low.dirs[leg],leg);
  const m=mirrorDirections(low.dirs);assert.deepEqual(m.LeftUpLeg,[-low.dirs.RightUpLeg[0],low.dirs.RightUpLeg[1],low.dirs.RightUpLeg[2]]);assert.deepEqual(mirrorDirections(m),low.dirs);
  assert.deepEqual(poseV3(v3.bones,v3.clips.lob,.5,true).dirs,mirrorDirections(poseV3(v3.bones,v3.clips.lob,.5).dirs));
  const joy=v3.clips.childlike_joy.frames.map(f=>f.hips[1]);assert.ok(Math.max(...joy)>.1,'the child jumps');
  const win=poseV3(v3.bones,v3.clips.point_win,1).dirs,t=armTargets(win,'Right',[.2,1.4,0],.3,.25);
  assert.ok(Math.abs(Math.hypot(...t.elbow.map((v,i)=>v-[.2,1.4,0][i]))-.3)<1e-9&&Math.abs(Math.hypot(...t.hand.map((v,i)=>v-t.elbow[i]))-.25)<1e-9,'arm targets keep the character\'s own bone lengths');
  assert.equal(armTargets(win,'Right',[0,0,0],1,1,-1).elbow[0],-armTargets(win,'Right',[0,0,0],1,1).elbow[0]);
});

test('motion v3: the flag, a missing file and broken data fall back without throwing',async()=>{
  assert.equal(tennisMotionV3Enabled('?tennisMotionV3=0'),false);assert.equal(tennisMotionV3Enabled('?tennisMotionV1=0'),false);assert.equal(tennisMotionV3Enabled(''),true);
  let asked=0;const fetcher=async()=>{asked++;return {ok:true,json:async()=>v3};};
  assert.equal(await loadMotionV3({base:import.meta.url,fetcher,params:new URLSearchParams('tennisMotionV3=0')}),null);
  assert.equal(await loadMotionV3({base:import.meta.url,fetcher,params:new URLSearchParams('tennisMotionV1=0')}),null);assert.equal(asked,0,'switched off: the file is not even requested');
  await assert.rejects(loadMotionV3({base:import.meta.url,fetcher:async()=>({ok:false,status:404})}));
  await assert.rejects(loadMotionV3({base:import.meta.url,fetcher:async()=>({ok:true,json:async()=>({bones:[],clips:{}})})}));
  assert.ok((await loadMotionV3({base:import.meta.url,fetcher})).clips.lob);
  const view=await read('minigames/tennis-view.mjs');
  assert.match(view,/\.catch\(\(\)=>\{motion3=null;\}\)/,'a v3 failure leaves v1 running');
  assert.match(view,/tennis-motion-v3\.mjs\?v=/);
  assert.doesNotMatch(await read('minigames/tennis-motion-v3.mjs'),/three|GLTFLoader|fetch\(['"]https?:/,'pure math: no loader, no network address');
});

test('motion v3: the v24.9 line calls are untouched',async()=>{
  for(const file of ['minigames/tennis-callouts.mjs','minigames/tennis-session.mjs','minigames/tennis.mjs'])assert.doesNotMatch(await read(file),/motion-v3|motion3/,file+' does not know about the motion pack');
});

test('HUD icons v2: only icons in use are copied, CC0, plain vector shapes with no text, script or outside address',async()=>{
  assert.match(await read('assets/ui-icons-v2/LICENSE.txt'),/CC0-1\.0/);
  for(const state of ['normal','pressed']){
    assert.deepEqual((await readdir(new URL(`assets/ui-icons-v2/${state}/`,root))).sort(),UI_ICONS.map(i=>i+'.svg').sort());
    for(const id of UI_ICONS){const svg=await read(`assets/ui-icons-v2/${state}/${id}.svg`);
      assert.equal(svg,await read(`design/ui-icons-v2/svg/${state}/${id}.svg`),'the runtime copy is the package file');
      assert.doesNotMatch(svg,/<text|<script|<image|<foreignObject|href=|url\(|<style/i,id);assert.match(svg,/viewBox="0 0 32 32"/);
      assert.ok(manifest.core.includes(`assets/ui-icons-v2/${state}/${id}.svg`),id+' is in the offline core');}
  }
});

test('HUD icons v2: the flag, the fallback and the wiring',async()=>{
  assert.equal(uiIconsEnabled('?uiIcons=0'),false);assert.equal(uiIconsEnabled(''),true);assert.equal(uiIconsEnabled('?uiIcons=1'),true);
  assert.match(uiIconUrl('coin','pressed','https://x.test/workout/island/ui/ui-icons.mjs'),/\/workout\/island\/assets\/ui-icons-v2\/pressed\/coin\.svg\?v=/);
  const classes=new Set(),rootNode={classList:{toggle:(name,on)=>{on?classes.add(name):classes.delete(name);}}};
  assert.equal(installUiIcons(rootNode,''),true);assert.ok(classes.has('ui-icons-v2'));assert.equal(installUiIcons(rootNode,'?uiIcons=0'),false);assert.equal(classes.size,0);
  assert.equal(uiIconOr('coin',()=>'old',18,'?uiIcons=0'),'old','switched off: the earlier symbol');
  assert.equal(uiIconOr('no-such-icon',()=>'old',18,''),'old','an icon the kit does not carry: the earlier symbol');
  const css=await read('ui/ui-icons.css'),html=await read('index.html');
  assert.match(html,/ui\/ui-icons\.css\?v=/);assert.ok(manifest.shell.includes('ui/ui-icons.css')&&manifest.shell.includes('ui/ui-icons.mjs'));
  for(const [,url] of css.matchAll(/url\("\.\.\/([^"]+)"\)/g))assert.ok(manifest.core.includes(url)&&existsSync(new URL(url,root)),url+' is used by ui-icons.css and must be in the offline core');
  assert.doesNotMatch(css,/content:\s*"[^"]/,'the stylesheet adds no text');
  for(const rule of css.split('}').filter(r=>/game-pause|\.coin|round-button/.test(r)&&!/\.ui-icon2\s*\{/.test(r)))assert.match(rule,/\.ui-icons-v2 /,'every restyle is under the switch: '+rule.trim().slice(0,60));
  const shell=await read('ui/game-shell.mjs');assert.match(shell,/PACK_ICON=\{play:'resume',sound:'sound',muted:'mute',pause:'pause'\}/);
  const ui=await read('ui/interface.mjs');assert.match(ui,/button\('⚙', 'parent', 'round-button'\)/,'the parents\' gear is left as it was');assert.match(ui,/uiIconOr\('coin', \(\) => '●', 18\)/);assert.match(ui,/compactStat\(uiIconsEnabled\(\) \? coinFace\(\) : '●'/);
});

test('the two design packs are review material: not published, clean of other scripts and of exclamation marks in Hebrew labels',async()=>{
  const stage=await readFile(new URL('../.github/scripts/stage-pages.py',import.meta.url),'utf8'),unwired=stage.match(/UNWIRED_DESIGN = set\("""([\s\S]*?)"""/)[1].replace(/-\n\s*/g,'-').split(/\s+/);
  for(const pack of ['ui-icons-v2','tennis-motion-v2','tennis-motion-v3'])assert.ok(unwired.includes(pack),pack+' is listed in UNWIRED_DESIGN');
  const all=[...manifest.core,...manifest.shell,...Object.values(manifest.games).flat()];
  assert.ok(!all.some(p=>/design\/(ui-icons-v2|tennis-motion-v[23])\//.test(p)),'the offline manifest names no file of the design packs');
  const icons=JSON.parse(await read('design/ui-icons-v2/manifest.json')),catalog=JSON.parse(await read('design/tennis-motion-v3/catalog.json'));
  assert.equal(icons.license,'CC0-1.0');assert.equal(icons.icons.length,120);assert.equal(catalog.authorship.license,'CC0-1.0');
  for(const text of [...icons.icons.map(i=>i.nameHe),...catalog.clips.flatMap(c=>[c.label,c.category,c.description,...c.events.map(e=>e.label)])]){assert.doesNotMatch(text,ARABIC);assert.ok(!text.includes('!'),text);}
  for(const file of ['design/ui-icons-v2/preview.html','design/tennis-motion-v3/preview.html','design/tennis-motion-v3/preview.mjs','design/tennis-motion-v2/preview.html','design/tennis-motion-v2/preview.mjs','design/tennis-motion-v2/runtime.mjs'])
    assert.doesNotMatch(await read(file),/(?:src|href)=["']https?:|import\s*\(?\s*["']https?:|fetch\(["']https?:|\.wasm/,file+' loads nothing from outside');
});
