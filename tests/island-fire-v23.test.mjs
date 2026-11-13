// 13/11/2026 fire v23: water targets and inside the building (Roy: "more than spraying and the ladder"). Flags, stage data, the two pure
// models, the engine path that pays coins only (no save field changes), the lazy session proxy, assets, strings and the offline list.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {FIRE_BONUS_MODES,fireBonusOn,TARGET_STAGES,INTERIOR_STAGES,fireBonusUnlocked,fireBonusNumber,fireBonusMission,fireBonusCards,fireBonusResult} from '../workout/island/minigames/fire-bonus.mjs';
import {createTargetsModel,resolveTargets,jetImpact,crewFor,TARGET_TUNING} from '../workout/island/minigames/fire-targets.mjs';
import {createInteriorModel,EFFECT,TOOLS,smokeLine,rescueCovered} from '../workout/island/minigames/fire-interior.mjs';
import {FIRE_V23_IMAGES,FIRE_V23_NEEDS,FIRE_V23_ICONS,FIRE_V23_ANCHOR_DATA,streetAnchor,roomAnchor,spriteBox,crewNozzle} from '../workout/island/minigames/fire-v23-assets.mjs';
import {startFireBonus} from '../workout/island/minigames/fire.mjs';
import {fitScene} from '../workout/island/minigames/fire-bonus-draw.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const balance=data.config.minigames.fireRescue;
const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const read=path=>readFile(new URL(path,root),'utf8');

test('flags: both modes on by default; ?fireTargets=0 and ?fireInterior=0 each take one mode out',()=>{
  assert.deepEqual(FIRE_BONUS_MODES,['targets','interior']);
  for(const mode of FIRE_BONUS_MODES)assert.equal(fireBonusOn(mode,''),true);
  assert.equal(fireBonusOn('targets','?fireTargets=0'),false);assert.equal(fireBonusOn('interior','?fireTargets=0'),true);
  assert.equal(fireBonusOn('interior','?fireInterior=0'),false);assert.equal(fireBonusOn('targets','?fireInterior=0'),true);
  assert.equal(fireBonusOn('ladder',''),false);
  assert.deepEqual(fireBonusCards(30,'?fireTargets=0&fireInterior=0'),[],'both off: the stage map is the old one');
});

test('stage data: five target stages that get harder, one building with three rooms, one rule and one tool each',()=>{
  assert.equal(TARGET_STAGES.length,5);
  TARGET_STAGES.forEach((s,i)=>{assert.equal(s.level,i+1);assert.equal(s.unlock,i+1);assert.ok(strings[s.titleKey],s.titleKey);if(i){assert.ok(s.winMoney>TARGET_STAGES[i-1].winMoney);assert.ok(s.targets.length>=TARGET_STAGES[i-1].targets.length);}});
  assert.equal(TARGET_STAGES[0].wind,0);assert.ok(Math.abs(TARGET_STAGES[2].wind)>0,'wind from stage 3');assert.ok(TARGET_STAGES.slice(3).every(s=>s.gust>0&&s.targets.some(t=>t.move)),'gusts and moving targets on 4-5');
  const kinds=new Set(TARGET_STAGES.flatMap(s=>s.targets.map(t=>t.kind)));for(const k of ['window','roof','can','smoke','fireball'])assert.ok(kinds.has(k),k);
  for(const s of TARGET_STAGES)for(const t of resolveTargets(s)){assert.ok(t.x>=0&&t.x<=2000&&t.y>=0&&t.y<=900,`${s.level}:${t.at}`);if(t.covers!==null)assert.equal(s.targets[t.covers].at,t.at,'smoke sits on the window it hides');}
  const [building]=INTERIOR_STAGES;assert.equal(building.rooms.length,3);
  assert.deepEqual(building.rooms.map(r=>r.id),['living','kitchen','bedroom']);
  assert.deepEqual(building.rooms.map(r=>r.rule),['electric','oil','smoke']);
  assert.deepEqual(building.rooms.map(r=>r.tool),['extinguisher','blanket','foam']);
  for(const r of building.rooms){assert.ok(r.spots.length>=2&&r.spots.length<=4,r.id);assert.ok(r.spots.some(s=>s.id===r.rescue.near),r.id);for(const s of r.spots)assert.ok(roomAnchor(r.image,s.at),`${r.id}.${s.at}`);assert.ok(roomAnchor(r.image,r.rescue.at));}
  assert.ok(building.rooms[0].spots.some(s=>s.kind==='electric')&&building.rooms[1].spots.some(s=>s.kind==='oil')&&building.rooms[2].spots.some(s=>s.kind==='heavy'));
  assert.deepEqual(new Set(building.rooms.map(r=>r.rescue.kind)),new Set(['kid','pet']));
});

test('bonus missions are numbered after the 30 campaign stages and open with campaign progress (no save field)',()=>{
  assert.equal(balance.levels.length,30);
  assert.deepEqual(TARGET_STAGES.map(s=>fireBonusNumber('targets',s.level)),[31,32,33,34,35]);assert.equal(fireBonusNumber('interior',1),36);
  assert.equal(fireBonusUnlocked('targets',1,1),true);assert.equal(fireBonusUnlocked('targets',2,1),false);assert.equal(fireBonusUnlocked('interior',1,2),false);assert.equal(fireBonusUnlocked('interior',1,3),true);
  assert.equal(fireBonusUnlocked('targets',9,30),false);assert.equal(fireBonusUnlocked('targets',1,undefined),false);
  const cards=fireBonusCards(3,'');assert.equal(cards.length,6);assert.deepEqual(cards.filter(c=>!c.locked).map(c=>c.number),[31,32,33,36]);
  assert.deepEqual(fireBonusMission('targets',1,{stage:1},''),{ok:true,mode:'targets',level:1,def:TARGET_STAGES[0]});
  assert.equal(fireBonusMission('targets',2,{stage:1},'').reason,'minigame.stageLockedReason');
  assert.equal(fireBonusMission('ladder',1,{stage:9},'').reason,'reason.invalid');assert.equal(fireBonusMission('targets',0,{stage:9},'').reason,'reason.invalid');assert.equal(fireBonusMission('targets',1.5,{stage:9},'').reason,'reason.invalid');
  assert.equal(fireBonusMission('targets',1,{stage:9},'?fireTargets=0').reason,'reason.locked');
});

test('result: coins from the score plus the mission reward, stars from performance, score capped like the campaign',()=>{
  assert.deepEqual(fireBonusResult({outcome:'win',score:300,performance:.9},'targets',1,balance),{outcome:'win',score:300,stars:3,money:60+24});
  assert.equal(fireBonusResult({outcome:'win',score:300,performance:.5},'targets',1,balance).stars,2);
  assert.equal(fireBonusResult({outcome:'win',score:300,performance:.1},'targets',1,balance).stars,1);
  assert.equal(fireBonusResult({outcome:'win',score:99999,performance:1},'interior',1,balance).score,balance.maximumScore);
  for(const bad of [null,{outcome:'lose',score:1},{outcome:'win',score:-1},{outcome:'win',score:1.5}])assert.equal(fireBonusResult(bad,'targets',1,balance),null);
  assert.equal(fireBonusResult({outcome:'win',score:1},'targets',8,balance),null);
});

test('targets model: pressure drains while spraying and refills, an empty tank waits for the restart level',()=>{
  const m=createTargetsModel({stage:TARGET_STAGES[0]}),t=m.targets[0];
  for(let i=0;i<3;i++)m.update(.1,{aimX:t.x,aimY:t.y,firing:true});assert.ok(m.pressure<1&&m.spraying&&m.hitTarget===t);assert.ok(t.heat<1);
  let guard=0;while(!m.empty&&guard++<200)m.update(.1,{aimX:0,aimY:0,firing:true});assert.equal(m.empty,true);assert.equal(m.pressure,0);
  m.update(.1,{firing:true});assert.equal(m.spraying,false,'empty: no water even with the button held');
  guard=0;while(m.empty&&guard++<200)m.update(.1,{firing:false});assert.ok(m.pressure>=TARGET_TUNING.restart&&m.pressure<TARGET_TUNING.restart+.05);
});

test('targets model: wind carries the jet sideways, low pressure makes it sag; the help bends a near miss onto the target',()=>{
  const n={x:600,y:820},aim={x:1000,y:400},calm=jetImpact(n,aim,1,0),windy=jetImpact(n,aim,1,300),weak=jetImpact(n,aim,.2,0);
  assert.deepEqual([calm.x,calm.y],[aim.x,aim.y]);assert.ok(windy.x-aim.x>20&&windy.y===aim.y);assert.ok(weak.y-aim.y>40&&weak.x===aim.x);
  assert.ok(jetImpact(n,aim,1,-300).x<aim.x);
  const nozzles=[0,1,2,3,4].map(i=>crewNozzle(i));assert.deepEqual([0,1,2,3,4].map(i=>crewFor({x:nozzles[2].x+[600,250,0,-250,-600][i],y:300},nozzles)),[0,1,2,3,4]);
});

test('targets model: smoke hides its window until it is cleared, cans fall and land, nothing is ever taken away, the stage ends when all are done',()=>{
  const stage=TARGET_STAGES[2],m=createTargetsModel({stage}),smoke=m.targets.find(t=>t.kind==='smoke'),window=m.targets[smoke.covers];
  m.update(.1,{aimX:window.x,aimY:window.y,firing:true});assert.equal(m.hitTarget,smoke,'the water acts on the smoke first');assert.equal(window.heat,1);
  let guard=0,last=0;const scores=[];
  while(!m.result&&guard++<6000){
    const t=m.targets.find(x=>x.kind==='smoke'&&!x.done)||m.targets.find(x=>!x.done&&!x.fall&&!m.targets.some(o=>o.kind==='smoke'&&!o.done&&o.covers===x.id));
    let aim=t?{x:t.x,y:t.y}:{x:1000,y:400};if(t)for(let k=0;k<4;k++){const imp=jetImpact(m.nozzle,aim,m.pressure,m.wind);aim={x:aim.x+t.x-imp.x,y:aim.y+t.y-imp.y};}
    m.update(1/30,{aimX:aim.x,aimY:aim.y,firing:m.pressure>.3||m.spraying});assert.ok(m.score>=last,'score never goes down');last=m.score;scores.push(m.score);
  }
  assert.equal(m.result.outcome,'win');assert.ok(m.result.score>0);assert.ok(m.targets.every(t=>t.done));
  const can=m.targets.find(t=>t.kind==='can');assert.equal(can.fall.landed,true);assert.equal(can.y,TARGET_TUNING.ground);
  assert.ok(m.result.performance>0&&m.result.performance<=1);assert.equal(m.result.summary.hits,stage.targets.length);
});

test('targets: a child-like player (finds each target, then follows the water) finishes every stage, stage 5 is the longest',()=>{
  const seconds=[];
  for(const stage of TARGET_STAGES){
    const m=createTargetsModel({stage});let t=0,firing=false,aim={x:900,y:500},target=null,look=0;
    while(!m.result&&t<300){const next=m.targets.find(x=>x.kind==='smoke'&&!x.done)||m.targets.find(x=>!x.done&&!x.fall&&!m.targets.some(o=>o.kind==='smoke'&&!o.done&&o.covers===x.id));
      if(next!==target){target=next;look=.6;}
      if(look>0)look-=1/30;else if(target){aim.x+=(target.x-aim.x)*.25;aim.y+=(target.y-aim.y)*.25;if(m.spraying){aim.x+=(target.x-m.impact.x)*.06;aim.y+=(target.y-m.impact.y)*.06;}}
      if(m.empty)firing=false;else if(m.pressure>.9)firing=true;
      m.update(1/30,{aimX:aim.x,aimY:aim.y,firing:look<=0&&firing});t+=1/30;}
    assert.ok(m.result,`stage ${stage.level} finished`);seconds.push(m.result.summary.seconds);assert.ok(m.result.summary.seconds<=stage.par*1.5,`stage ${stage.level}: ${m.result.summary.seconds}s`);
  }
  assert.ok(seconds[4]>seconds[0]*3,'stage 5 asks for much more than stage 1: '+seconds);
});

function playInterior({tools=true,crawl=true,rescue=true}={}){
  const m=createInteriorModel({stage:INTERIOR_STAGES[0]}),best={normal:'water',electric:'extinguisher',oil:'blanket',heavy:'foam'};let t=0;const log=[];
  while(!m.result&&t<400){const input={},r=m.room;
    if(m.phase==='door')input.tap={...m.door};else if(m.phase==='intro')input.skip=true;else if(m.phase==='victory')input.finish=true;
    else if(m.phase==='play'){const c=r.rescue,near=r.spots.find(x=>x.id===c.near);if(crawl&&r.rule==='smoke')input.crawl=true;
      if(rescue&&c.state==='waiting'&&near?.done&&(!r.rescue.low||r.crawl>.9||!crawl))input.tap={x:c.x,y:(c.y+c.headY)/2};
      else{const spot=near&&!near.done?near:r.spots.find(x=>!x.done);if(spot){const tool=tools?best[spot.kind]:'water';input.tool=tool;if(tool==='blanket')input.tap={x:spot.x,y:spot.y};else input.pointer={x:spot.x,y:spot.y};}}}
    m.update(1/30,input);t+=1/30;if(log.at(-1)!==m.phase)log.push(m.phase);}
  return {m,t,log};
}
test('interior model: door, three rooms with the right tools and rescues, victory and a result',()=>{
  const {m,log}=playInterior();
  assert.deepEqual(log.filter((p,i)=>log.indexOf(p)===i),['arrive','door','enter','intro','play','clear','victory']);
  assert.equal(m.result.outcome,'win');assert.deepEqual(m.result.summary,{...m.result.summary,rooms:3,rescued:3,mistakes:0});
  assert.ok(m.result.performance>.8);assert.ok(m.rooms.every(r=>r.clearedAt!==null&&r.rescue.state==='saved'));
  assert.deepEqual(m.unlocked.sort(),[...TOOLS].sort());
});
test('interior rules: water on electricity only sparks, water on oil makes it grow, the blanket smothers oil, foam beats heavy fire',()=>{
  assert.equal(EFFECT.electric.water,'spark');assert.equal(EFFECT.oil.water,'flare');assert.ok(EFFECT.heavy.foam>EFFECT.heavy.water*3);
  const m=createInteriorModel({stage:INTERIOR_STAGES[0]});const go=input=>m.update(.1,input);
  for(let i=0;i<40&&m.phase!=='door';i++)go({});go({tap:{x:m.door.x+200,y:m.door.y}});assert.equal(m.phase,'door','a tap away from the door does nothing');
  go({tap:{...m.door}});assert.equal(m.phase,'enter');for(let i=0;i<10;i++)go({});assert.equal(m.phase,'intro');go({skip:true});assert.equal(m.phase,'play');
  const tv=m.room.spots.find(s=>s.kind==='electric');for(let i=0;i<20;i++)go({pointer:{x:tv.x,y:tv.y}});
  assert.equal(tv.heat,1,'water never cools electricity');assert.ok(m.room.mistakes>=1);assert.equal(m.feedback.key,'fire.v23.say.electric');
  go({tool:'extinguisher'});for(let i=0;i<40&&!tv.done;i++)go({pointer:{x:tv.x,y:tv.y}});assert.equal(tv.done,true);
  // the kid waits for the sofa fire: a tap before it is out only explains
  const kid=m.room.rescue;go({tap:{x:kid.x,y:(kid.y+kid.headY)/2}});assert.equal(kid.state,'waiting');assert.equal(m.feedback.key,'fire.v23.say.clearKid');
  // kitchen
  const k=createInteriorModel({stage:{...INTERIOR_STAGES[0],rooms:[INTERIOR_STAGES[0].rooms[1]]}});const kg=input=>k.update(.1,input);for(let i=0;i<40&&k.phase!=='door';i++)kg({});kg({enter:true});for(let i=0;i<10;i++)kg({});kg({skip:true});
  const pot=k.room.spots.find(s=>s.kind==='oil');for(let i=0;i<10;i++)kg({pointer:{x:pot.x,y:pot.y}});assert.ok(pot.heat>1,'water on oil makes it grow');assert.ok(pot.flare>0);assert.equal(k.feedback.key,'fire.v23.say.oil');
  kg({tool:'blanket'});const bin=k.room.spots.find(s=>s.id==='bin');kg({tap:{x:bin.x,y:bin.y}});assert.equal(bin.done,false);assert.equal(k.feedback.key,'fire.v23.say.blanketOil');
  kg({tap:{x:pot.x,y:pot.y}});assert.equal(pot.done,true);assert.equal(pot.smothered,true);assert.equal(k.blankets,0);
});
test('interior smoke: the bedroom child is hidden in the smoke until the player crawls; smoke at the floor sends a second crew (no points)',()=>{
  const bedroom=INTERIOR_STAGES[0].rooms[2],m=createInteriorModel({stage:{...INTERIOR_STAGES[0],rooms:[bedroom]}}),go=input=>m.update(.1,input);
  for(let i=0;i<40&&m.phase!=='door';i++)go({});go({enter:true});for(let i=0;i<10;i++)go({});go({skip:true});
  assert.equal(rescueCovered(m.room),true,'hidden while standing');for(let i=0;i<10;i++)go({crawl:true});assert.equal(rescueCovered(m.room),false,'visible while crawling');
  const before=m.room.smoke;go({crawl:true});const crawlRate=m.room.smoke-before;const b2=m.room.smoke;go({});const standRate=m.room.smoke-b2;assert.ok(crawlRate<standRate,'smoke comes down slower while crawling');
  const kid=m.room.rescue,bed=m.room.spots.find(s=>s.id==='bed'),tapKid={x:kid.x,y:(kid.y+kid.headY)/2};
  go({crawl:true,tap:tapKid});assert.equal(kid.state,'waiting');assert.equal(m.feedback.key,'fire.v23.say.clearKid','crawling: the child is seen, the bed fire comes first');
  for(let i=0;i<20;i++)go({});assert.equal(rescueCovered(m.room),true);go({tap:tapKid});assert.equal(kid.state,'waiting');assert.equal(m.feedback.key,'fire.v23.say.crawl','standing: hidden in the smoke');
  const score=m.score;for(let i=0;i<800&&kid.state==='waiting';i++)go({});assert.equal(kid.state,'teammate');assert.equal(m.score,score,'a second crew rescue gives no points');
  assert.ok(smokeLine(m.room)>=m.room.floor-1);
  assert.ok(bed.heat>0);
});

test('engine: a bonus mission pays coins only; stage progress, stars, certificates, wins, high score and the save shape stay the same',()=>{
  // registry records are frozen: the fire game is registered here with a start that only keeps the context (no DOM in node)
  let captured=null;const stub=ctx=>{captured=ctx;return {dispose(){},setPaused(){}};};
  const installers=data.extensionInstallers.map(install=>(registry,d)=>install(new Proxy(registry,{get(target,prop){return prop==='registerMinigame'?record=>target.registerMinigame(record.id==='fireRescue'?{...record,start:stub}:record):Reflect.get(target,prop);}}),d));
  const engine=createEngine({...data,extensionInstallers:installers},{storage:null,now:()=>1e6});engine.skipTutorial();engine.state.money=100000;
  let placed=false;for(let z=0;z<engine.state.world.size&&!placed;z++)for(let x=0;x<engine.state.world.size&&!placed;x++)placed=engine.place('fireStation',x,z).ok;assert.ok(placed);
  {
    const before=JSON.parse(engine.exportJSON()),finished=[],context=gameContext(engine,data.config.minigames,7,'fireRescue',1);
    assert.equal(engine.startMinigame('fireRescue',{...context,fireMode:'interior',fireBonusLevel:1}).reason,'minigame.stageLockedReason','the building opens at stage 3');
    assert.equal(engine.startMinigame('fireRescue',{...context,fireMode:'ladder',fireBonusLevel:1}).reason,'reason.invalid');
    const run=engine.startMinigame('fireRescue',{...context,fireMode:'targets',fireBonusLevel:1,onFinish:r=>finished.push(r)});
    assert.equal(run.ok,true);assert.equal(captured.fireMode,'targets');assert.equal(captured.fireBonusLevel,1);assert.equal(captured.level,1);
    assert.equal(captured.finish({outcome:'win',score:300,performance:.9,summary:{hits:3,seconds:20,accuracy:80,bad:'x'}}).ok,true);
    const [result]=finished;assert.deepEqual(result.fireBonus,{mode:'targets',level:1,number:31,summary:{hits:3,seconds:20,accuracy:80}});
    assert.deepEqual([result.outcome,result.score,result.money,result.stars,result.parts],['win',300,84,3,0]);
    const after=JSON.parse(engine.exportJSON());assert.equal(after.money,before.money+84);
    for(const key of Object.keys(before))if(!['money','updatedAt','playTime','dailyPlay','learning','minutes'].includes(key)&&JSON.stringify(after[key])!==JSON.stringify(before[key]))assert.fail('changed: '+key);
    assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
    assert.deepEqual(after.minigameProgress.fireRescue,before.minigameProgress.fireRescue);assert.deepEqual(after.fireCertificates,before.fireCertificates);
    // a normal stage still records as before
    captured=null;const normal=engine.startMinigame('fireRescue',{...context,onFinish:r=>finished.push(r)});assert.equal(normal.ok,true);assert.equal(captured.fireMode,undefined);
    captured.finish({outcome:'win',score:100,performance:.9});assert.equal(engine.state.minigameProgress.fireRescue.stage,2);assert.equal(finished[1].fireBonus,undefined);
  }
});

test('session proxy: loads the bonus module lazily, reports loading through `ready`, a failed load is reported, dispose before load is safe',async()=>{
  const calls=[],inner={ready:true,loadFailed:false,snapshot:{mode:'targets',x:1},setPaused:v=>calls.push(['pause',v]),dispose:()=>calls.push(['dispose'])};
  let resolve;const proxy=startFireBonus({fireMode:'targets',fireBonusLevel:1,cancel(){}},()=>new Promise(r=>{resolve=r;}));
  assert.equal(proxy.ready,false);assert.equal(proxy.loadFailed,false);assert.equal(proxy.snapshot.loading,true);proxy.setPaused(true);
  resolve({runFireBonusSession:()=>inner});await new Promise(r=>setTimeout(r,0));
  assert.equal(proxy.ready,true);assert.deepEqual(proxy.snapshot,inner.snapshot);assert.deepEqual(calls,[['pause',true]]);proxy.dispose();assert.deepEqual(calls.at(-1),['dispose']);
  const failed=startFireBonus({fireMode:'interior'},()=>Promise.reject(Error('offline')));await new Promise(r=>setTimeout(r,0));assert.equal(failed.loadFailed,true);
  let made=0;const early=startFireBonus({fireMode:'targets'},async()=>({runFireBonusSession:()=>{made++;return inner;}}));early.dispose();await new Promise(r=>setTimeout(r,0));assert.equal(made,0);
});

test('assets: every picture exists, anchors cover them, the window grid is complete, and the offline list keeps them on the phone',async()=>{
  for(const [id,path] of Object.entries(FIRE_V23_IMAGES))await access(new URL(path.replace('../',''),root));
  for(const mode of Object.keys(FIRE_V23_NEEDS))for(const id of FIRE_V23_NEEDS[mode])assert.ok(FIRE_V23_IMAGES[id],id);
  for(const id of Object.keys(FIRE_V23_IMAGES).filter(id=>id.startsWith('crew')||id.startsWith('kid')||id.startsWith('room')||id.startsWith('victory')||id==='street'||id==='truck'))assert.ok(FIRE_V23_ANCHOR_DATA[id],'anchors for '+id);
  assert.equal(Object.keys(FIRE_V23_ANCHOR_DATA.street.grid).length,12);for(let r=1;r<=4;r++)for(let c=1;c<=3;c++)assert.ok(streetAnchor('w'+r+c));
  for(const i of [0,1,2,3,4]){assert.ok(spriteBox('crew-'+i));assert.ok(crewNozzle(i));}
  for(const name of ['door','roofCenter','rowRoof','storeRoof','awning1','skyLeft','balcony41','balcony33'])assert.ok(streetAnchor(name),name);
  for(const icon of ['water','extinguisher','blanket','foam'])assert.match(FIRE_V23_ICONS[icon],/^M/);
  const manifest=JSON.parse(await read('offline-manifest.json')),files=(await readdir(new URL('assets/fire-v23/',root))).filter(f=>!f.endsWith('.json')&&!f.endsWith('.md'));
  for(const f of files)assert.ok(manifest.games.fire.includes('assets/fire-v23/'+f),'offline: '+f);
  for(const m of ['minigames/fire-bonus.mjs','minigames/fire-targets.mjs','minigames/fire-interior.mjs','minigames/fire-bonus-session.mjs','minigames/fire-bonus-draw.mjs','minigames/fire-v23-assets.mjs','minigames/fire-v23-anchors.mjs','minigames/fire-v23.css','ui/fire-bonus-ui.mjs'])assert.ok(manifest.shell.includes(m),'shell: '+m);
});

test('screen fit: the targets and the room stay on screen on a phone, a wide phone and a tablet',()=>{
  for(const [W,H] of [[844,390],[915,412],[740,360],[1024,768],[1180,820]]){
    const street=fitScene(W,H,2000,900,{x0:520,x1:1600,y0:40,y1:900}),room=fitScene(W,H,1600,740,{x0:120,x1:1520,y0:90,y1:740});
    for(const [f,x0,x1,y0,y1] of [[street,520,1600,40,900],[room,120,1520,90,740]]){assert.ok(f.ox+x0*f.s>=-1&&f.ox+x1*f.s<=W+1,`${W}x${H} x`);assert.ok(f.oy+y0*f.s>=-1&&f.oy+y1*f.s<=H+1,`${W}x${H} y`);}
  }
});

test('strings: every fire v23 key used in code exists, Hebrew only, no exclamation marks',async()=>{
  const sources=await Promise.all(['minigames/fire-bonus.mjs','minigames/fire-interior.mjs','minigames/fire-bonus-session.mjs','ui/fire-bonus-ui.mjs'].map(read));
  const used=new Set(sources.flatMap(s=>[...s.matchAll(/'(fire\.v23\.[\w.]+)'/g)].map(m=>m[1])).filter(k=>!k.endsWith('.')));
  for(const room of ['living','kitchen','bedroom'])used.add('fire.v23.room.'+room);for(const rule of ['electric','oil','smoke'])used.add('fire.v23.rule.'+rule);for(const tool of TOOLS)used.add('fire.v23.tool.'+tool);
  for(const key of used)assert.ok(strings[key],'missing string '+key);
  for(const [key,value] of Object.entries(strings))if(key.startsWith('fire.v23.')){assert.ok(!value.includes('!'),key);assert.ok(!/[؀-ۿ]/.test(value),key);assert.ok(/[֐-׿]/.test(value),key);}
});
