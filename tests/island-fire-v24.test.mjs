// 14/11/2026 fire v24: the building entry inside the campaign stages (Roy: "not separate: you reach the building in the stages and go in;
// on a clock; control, understanding and graphics"). Flag, entry stages, plans, the pure room model with its clock and gentle timeout, the
// building pick, the merged result, the stage map badge, assets, strings and the offline list. `?fireFlow=v23` keeps v23 untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,stat} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {fireFlowV24,isEntryStage,entryStages,ENTRY_PLANS,entryPlan,roomSeconds,ROOMS,FRIENDS,entryBuilding,arrivedAtBuilding,doorDistance,timeScore,insideStars,mergeResults,V24_TUNING,EFFECT,TOOLS} from '../workout/island/minigames/fire-v24.mjs';
import {createInteriorModel,spotAnchor,smokeLine,clockBand,ROOM_HEIGHT} from '../workout/island/minigames/fire-v24-interior.mjs';
import {ROOM_FIRE_ANCHORS} from '../workout/island/minigames/fire-v24-anchors.mjs';
import {V24_ASSETS,v24AssetFiles} from '../workout/island/minigames/fire-v24-scene.mjs';
import {drawDoorMarker} from '../workout/island/minigames/fire-v24-flow.mjs';
import {fireScenario} from '../workout/island/minigames/fire-campaign.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const balance=data.config.minigames.fireRescue;
const strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const read=path=>readFile(new URL(path,root),'utf8');
const exists=async path=>{try{await access(new URL(path,root));return true;}catch{return false;}};

/** A patient child: the right tool per fire, aim held on the fire, the friend tapped once their fire is out. */
function playThrough(plan,{idle=false,dt=.1,limitSteps=20000}={}){
  const m=createInteriorModel({plan});let steps=0;
  while(!m.result&&steps++<limitSteps){
    const r=m.room,p=m.phase;
    if(p==='intro'){m.update(dt,{skip:true});continue;}
    if(p!=='play'||idle){m.update(dt,{});continue;}
    const spot=r.spots.find(s=>!s.done),f=r.friend;
    if(spot){const tool=spot.kind==='electric'?'extinguisher':spot.kind==='oil'?'blanket':spot.kind==='heavy'&&m.tools.includes('foam')?'foam':'water';
      if(m.tool!==tool){m.update(.05,{tool});continue;}
      if(tool==='blanket'){m.update(dt,{tap:spot.pos});continue;}
      m.update(dt,m.empty?{}:{aim:spot.pos});continue;}
    if(f.state==='waiting'){m.update(dt,{tap:[f.pos[0],.5,f.pos[2]]});continue;}
    m.update(dt,{});
  }
  return m;
}

test('flag: on by default, ?fireFlow=v23 restores v23; entry stages are every third stage from 3',()=>{
  assert.equal(fireFlowV24(''),true);assert.equal(fireFlowV24('?fireFlow=v23'),false);assert.equal(fireFlowV24('?fireFlow=v24'),true);
  assert.deepEqual(entryStages(30),[3,6,9,12,15,18,21,24,27,30]);
  for(const l of [1,2,4,5,31,0,-3,2.5])assert.equal(isEntryStage(l,30),false,String(l));
  for(const l of entryStages(30))assert.equal(isEntryStage(l,30),true);
  assert.equal(balance.levels.length,30);
});

test('plans: one per entry stage, rooms and fires exist, tools grow one at a time, every fire has a 3D anchor, friends are girl/cat/dog',()=>{
  assert.deepEqual(ENTRY_PLANS.map(p=>p.level),entryStages(30));
  assert.equal(ENTRY_PLANS[0].tutorial,true);assert.deepEqual(ENTRY_PLANS[0].tools,['water']);assert.equal(ENTRY_PLANS[0].rooms.length,1);
  let tools=1;
  for(const p of ENTRY_PLANS){
    assert.ok(p.tools.length>=tools,'tools never shrink');tools=p.tools.length;assert.ok(p.tools.every(t=>TOOLS.includes(t)));
    assert.ok(p.rooms.length>=1&&p.rooms.length<=3);assert.ok(p.seconds>=40&&p.seconds<=60);
    for(const [i,r]of p.rooms.entries()){const room=ROOMS[r.room];assert.ok(room,r.room);assert.ok(strings[room.titleKey],room.titleKey);assert.ok(FRIENDS[r.friend],r.friend);
      assert.ok(r.fires.length>=2&&r.fires.length<=4,`${p.level}:${r.room}`);
      for(const key of r.fires){const spot=room.spots[key];assert.ok(spot,`${r.room}.${key}`);const a=spotAnchor(r.room,key);assert.ok(a&&a.length===3,`${r.room}.${key} anchor`);assert.ok(Math.abs(a[0])<=3.3&&a[1]>=0&&a[1]<=ROOM_HEIGHT&&Math.abs(a[2])<=2.5,`${r.room}.${key} inside the room`);
        const kinds={electric:'extinguisher',oil:'blanket',heavy:'foam'};if(kinds[spot.kind]&&spot.kind!=='heavy')assert.ok(p.tools.includes(kinds[spot.kind]),`${p.level}: ${key} needs ${kinds[spot.kind]}`);}
      assert.ok(roomSeconds(p,i)>=p.seconds);}
  }
  for(const p of ENTRY_PLANS.slice(1))assert.ok(!p.tutorial);
});

test('the Codex manifest and the generated anchors agree; the GLB and friend files are in the branch',async()=>{
  const manifest=JSON.parse(await read('assets/fire-v24/rooms/manifest.json')),ids={'living-room':'living',kitchen:'kitchen',bedroom:'bedroom'};
  for(const room of manifest.rooms){for(const item of room.items){const a=ROOM_FIRE_ANCHORS[ids[room.id]][item.name];assert.ok(a,item.name);item.fireWorld.forEach((v,i)=>assert.ok(Math.abs(v-a[i])<.002));}
    assert.ok(await exists('assets/fire-v24/rooms/'+room.file),room.file);const size=(await stat(new URL('assets/fire-v24/rooms/'+room.file,root))).size;assert.equal(size,room.bytes,room.file+' bytes as delivered');assert.ok(room.visibleTriangles<=3500);}
  for(const f of Object.values(FRIENDS))assert.ok(await exists('assets/fire-v24/friends/'+f.file),f.file);
  assert.ok(await exists('assets/fire-v24/rooms/palette-1024.png'));assert.ok(await exists('assets/fire-v24/rooms/LICENSES.md'));assert.ok(await exists('assets/fire-v24/friends/LICENSES.md'));
  for(const id of Object.keys(V24_ASSETS.sheets))assert.ok(await exists('assets/fire-v23/fx/'+id+'.png'),id);
  assert.ok(await exists(V24_ASSETS.firefighter.replace('../','')));
  const files=v24AssetFiles(entryPlan(30));for(const f of files)assert.ok(await exists(f),f);
  let bytes=0;for(const f of new Set(ENTRY_PLANS.flatMap(p=>v24AssetFiles(p))))bytes+=(await stat(new URL(f,root))).size;
  assert.ok(bytes<4.5*1048576,'inside assets stay a small download: '+(bytes/1048576).toFixed(2)+' MB');
});

test('room model: a patient child clears every plan with full time score; nobody is ever stuck',()=>{
  for(const plan of ENTRY_PLANS){const m=playThrough(plan),r=m.result;
    assert.ok(r,'plan '+plan.level+' ends');assert.equal(r.outcome,'win');assert.equal(r.rooms,plan.rooms.length);assert.equal(r.rescued,plan.rooms.length);assert.equal(r.handovers,0);assert.equal(r.mistakes,0);
    assert.ok(r.performance>=.99,'full performance: '+r.performance);assert.ok(r.seconds<plan.rooms.length*plan.seconds*.5,'under par: '+r.seconds);assert.ok(r.score>0);}
});

test('room model: the clock is gentle: doing nothing hands the room to the crew at zero, the stage still ends in a win with a low time score',()=>{
  const m=playThrough(entryPlan(3),{idle:true}),r=m.result;
  assert.ok(r);assert.equal(r.outcome,'win');assert.equal(r.handovers,1);assert.equal(r.rescued,0);assert.ok(r.performance<=.05);assert.equal(r.score,0);
  assert.ok(Math.abs(r.seconds-roomSeconds(entryPlan(3),0))<.3,'the room ran its whole clock: '+r.seconds);
  assert.ok(m.events.some(e=>e.kind==='tenSeconds'),'the ten-second warning fired');assert.ok(m.events.some(e=>e.kind==='handover'));
  assert.ok(m.rooms[0].spots.every(s=>s.done&&s.how==='team'));
});

test('room model: rules teach without punishing: water on electricity sparks, water on oil flares, the friend waits for their fire',()=>{
  const plan=entryPlan(12),m=createInteriorModel({plan});for(let i=0;i<30&&m.phase!=='play';i++)m.update(.1,{skip:true});
  const r=m.room,oil=r.spots.find(s=>s.kind==='oil'),electric=r.spots.find(s=>s.kind==='electric');
  const heat0=oil.heat;for(let i=0;i<5;i++)m.update(.1,{aim:oil.pos});assert.ok(oil.heat>heat0,'oil grows under water');assert.equal(m.feedback.key,'fire.v24.say.oil');assert.equal(r.mistakes,1,'one mistake per cooldown');
  for(let i=0;i<5;i++)m.update(.1,{aim:electric.pos});assert.ok(electric.spark>0);assert.equal(electric.heat,electric.maxHeat);
  m.update(.1,{tap:[r.friend.pos[0],.5,r.friend.pos[2]]});assert.equal(r.friend.state,'waiting');assert.equal(m.feedback.key,'fire.v24.say.clearPet');
  m.update(.05,{tool:'blanket'});assert.equal(m.tool,'blanket');m.update(.1,{tap:oil.pos});assert.ok(oil.done&&oil.smothered);assert.equal(m.blankets,0);
  m.update(.05,{tool:'extinguisher'});let guard=0;while(!electric.done&&guard++<200)m.update(.1,{aim:electric.pos});assert.ok(electric.done);
  assert.equal(smokeLine({smoke:0}),ROOM_HEIGHT);assert.ok(Math.abs(smokeLine({smoke:1})-V24_TUNING.smokeFloor)<1e-9);
  assert.equal(clockBand(30,50),'ok');assert.equal(clockBand(20,50),'warn');assert.equal(clockBand(9,50),'critical');
  assert.equal(EFFECT.electric.water,'spark');assert.equal(EFFECT.oil.water,'flare');
});

test('room model: pressure drains while spraying and refills when the finger lifts; the aim help snaps onto a fire',()=>{
  const m=createInteriorModel({plan:entryPlan(3)});for(let i=0;i<30&&m.phase!=='play';i++)m.update(.1,{skip:true});
  const far=[2.9,2.6,-2.2];let guard=0;while(!m.empty&&guard++<200)m.update(.1,{aim:far});assert.equal(m.empty,true);assert.equal(m.tanks.water,0);
  m.update(.1,{aim:far});assert.equal(m.spraying,false,'empty: nothing comes out');
  guard=0;while(m.empty&&guard++<100)m.update(.1,{});assert.ok(m.tanks.water>=.3);
  const sofa=m.room.spots.find(s=>s.id==='sofa'),help=m.assist([sofa.pos[0]+.6,sofa.pos[1]+.3,sofa.pos[2]]);assert.equal(help.spot,'sofa');assert.deepEqual(help.point,sofa.pos);
  assert.equal(m.assist([3,2.5,-2]).spot,null);
});

test('the building: the farthest burning lot from the start, never reached before driving; arrival = parked at the door',()=>{
  for(const level of entryStages(30)){const b=fireScenario(balance,level),e=entryBuilding(b,level);
    assert.ok(e&&e.door.length===3,String(level));assert.ok(b.city.buildings[e.index]);
    assert.ok(doorDistance({x:b.vehicle.x,z:b.vehicle.z},e)>V24_TUNING.arriveRadius*2,level+': there is a drive');
    assert.equal(arrivedAtBuilding({x:b.vehicle.x,z:b.vehicle.z,driving:false},e),false);
    assert.equal(arrivedAtBuilding({x:e.door[0],z:e.door[2]+3,driving:false,velocityX:0,velocityZ:0},e),true);
    assert.equal(arrivedAtBuilding({x:e.door[0],z:e.door[2]+3,driving:true},e),false,'still driving');
    assert.equal(arrivedAtBuilding({x:e.door[0],z:e.door[2]+3,driving:false,velocityX:3,velocityZ:0},e),false,'still rolling');}
  assert.equal(entryBuilding({render:{sites:[]},city:{buildings:[]}},3),null);
});

test('merged result: scores add up to the campaign cap, performance is the weighted mean, rescues and rooms join the summary, a loss is untouched',()=>{
  const street={outcome:'win',score:300,performance:.6,summary:{out:4,rescued:1,water:30},certificate:{won:true}};
  const inside={score:500,performance:1,rescued:2,rooms:2,seconds:30};
  const merged=mergeResults(street,inside,balance);
  assert.equal(merged.score,800);assert.ok(Math.abs(merged.performance-.8)<1e-9);assert.deepEqual(merged.summary,{out:4,rescued:3,water:30,rooms:2,insideSeconds:30,insideStars:3});assert.deepEqual(merged.certificate,{won:true});
  assert.equal(mergeResults({...street,score:900},inside,balance).score,balance.maximumScore);
  const lost={outcome:'lose',score:10};assert.equal(mergeResults(lost,inside,balance),lost);assert.equal(mergeResults(street,null,balance),street);
  assert.equal(timeScore(10,50),1);assert.equal(timeScore(25,50),1);assert.ok(Math.abs(timeScore(37.5,50)-.5)<1e-9);assert.equal(timeScore(60,50),0);
  assert.equal(insideStars(1),3);assert.equal(insideStars(.5),2);assert.equal(insideStars(.1),1);
});

test('door marker: a marker when the door is on screen, an edge arrow when it is off screen (pure drawing on a stub context)',()=>{
  const calls=[];const p=new Proxy({},{get(_,k){if(k==='restore'||k==='save')return()=>calls.push(k);return(...a)=>calls.push(k);},set(){return true;}});
  assert.equal(drawDoorMarker(p,{x:400,y:200},{state:'drive',time:1,width:844,height:390,label:'x',enterLabel:'y'}),'marker');
  assert.equal(drawDoorMarker(p,{x:-200,y:200},{state:'ready',time:1,width:844,height:390,label:'x',enterLabel:'y'}),'arrow');
  assert.equal(calls.filter(c=>c==='save').length,calls.filter(c=>c==='restore').length);
});

test('wiring: fire.mjs routes entry stages through the flow behind the flag; the stage map marks them; strings exist; the offline lists know the files',async()=>{
  const fire=await read('minigames/fire.mjs');assert.ok(fire.includes('fireFlowV24()&&isEntryStage(ctx.level'));assert.ok(fire.includes('startFireEntry('));
  const ui=await read('ui/fire-bonus-ui.mjs');assert.ok(ui.includes('markEntryStages(activity,dialog)'));assert.ok(ui.includes("dataset.fireEntry='true'"));
  for(const file of ['minigames/fire-v24.mjs','minigames/fire-v24-interior.mjs','minigames/fire-v24-anchors.mjs','minigames/fire-v24-scene.mjs','minigames/fire-v24-session.mjs','minigames/fire-v24-flow.mjs','minigames/fire-v24.css']){
    const text=await read(file);for(const m of text.matchAll(/from '\.\.?\/[^']+\.mjs(\?v=[^']*)?'/g))if(!/polish-flag|vendor\//.test(m[0]))assert.equal(m[1],'?v=island-v2-20261107-13',file+': '+m[0]);}
  const used=new Set();for(const file of ['minigames/fire-v24-session.mjs','minigames/fire-v24-flow.mjs','ui/fire-bonus-ui.mjs'])for(const m of (await read(file)).matchAll(/t\('(fire\.v24\.[\w.]+)'[,)]/g))used.add(m[1]);
  for(const m of (await read('minigames/fire-v24-interior.mjs')).matchAll(/'(fire\.v24\.say\.[\w]+)'/g))used.add(m[1]);
  for(const key of ['fire.v24.guide.building','fire.v24.guide.arrived','fire.v24.room.living','fire.v24.room.hallway','fire.v24.room.stairwell','fire.v24.friend.girl','fire.v24.friend.cat','fire.v24.friend.dog','fire.v24.tutorial.aim','fire.v24.tutorial.spray','fire.v24.tutorial.rescue'])used.add(key);
  for(const key of used)assert.ok(strings[key],key);
  for(const key of Object.keys(strings).filter(k=>k.startsWith('fire.v24.')))assert.ok(!/[!]/.test(strings[key]),key+' without exclamation marks');
  const manifest=JSON.parse(await read('offline-manifest.json'));
  for(const file of ['minigames/fire-v24.mjs','minigames/fire-v24-interior.mjs','minigames/fire-v24-scene.mjs','minigames/fire-v24-session.mjs','minigames/fire-v24-flow.mjs','minigames/fire-v24.css','minigames/fire-v24-anchors.mjs'])assert.ok(manifest.shell.includes(file),file+' in the offline shell');
  for(const f of new Set(ENTRY_PLANS.flatMap(p=>v24AssetFiles(p))))assert.ok(manifest.games.fire.includes(f),f+' in the fire asset list');
});
