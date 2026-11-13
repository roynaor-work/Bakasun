import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../workout/island/vendor/three.module.js';
import * as V24 from '../workout/island/minigames/soccer-v24.mjs';
import {applySoccerTeams} from '../workout/island/minigames/soccer-teams.mjs';
import {applySoccerPitchV23} from '../workout/island/minigames/soccer-v23.mjs';
import {crowdPlacements,LEVELS,TIERS} from '../workout/island/minigames/soccer-v8-layout.mjs';
import {planCrowd} from '../workout/island/assets/soccer-v24/crowd/runtime/lod-policy.mjs';
import {soccerCrowdLimit} from '../workout/island/minigames/soccer-v24-crowd.mjs';
import {decorateAthleteV2} from '../workout/island/minigames/athlete-body-v2.mjs';
import {createSoccerDesignAudio,soccerV24MixAssets} from '../workout/island/minigames/soccer-design-audio.mjs';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';

const root=new URL('../workout/island/',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8'),json=async p=>JSON.parse(await read(p));
const sha=async p=>createHash('sha256').update(await readFile(new URL(p,root))).digest('hex');
const balance=(await json('data/config.json')).minigames.soccer;
const pitchFor=(teams,v23=true)=>{const c=applySoccerTeams(balance,teams);return v23?applySoccerPitchV23(c,'v23').pitch:c.pitch;};
const product=pitchFor('8');
const glbJson=async p=>{const b=await readFile(new URL(p,root)),l=b.readUInt32LE(12);return JSON.parse(b.subarray(20,20+l).toString('utf8'));};

test('v24 switches: every pack on by default, each `?name=0` returns the previous look; ?soccerCrowd3d=full is the comparison mode',()=>{
  assert.deepEqual(V24.soccerV24Flags(''),{pitchAssets:true,clipsV13:true,fxV1:true,crowd3d:'budget',bodyV2:true});
  assert.deepEqual(V24.soccerV24Flags('?soccerPitchAssets=0&soccerClipsV13=0&soccerFxV1=0&soccerCrowd3d=0&athleteBodyV2=0'),{pitchAssets:false,clipsV13:false,fxV1:false,crowd3d:'off',bodyV2:false});
  for(const [name,key] of [['soccerPitchAssets','pitchAssets'],['soccerClipsV13','clipsV13'],['soccerFxV1','fxV1'],['athleteBodyV2','bodyV2']]){
    const flags=V24.soccerV24Flags(`?${name}=0`);assert.equal(flags[key],false,name);
    for(const [other,value] of Object.entries(flags))if(other!==key)assert.ok(value===true||value==='budget',`${name}=0 leaves ${other}`);
  }
  assert.equal(V24.soccerCrowd3dMode('?soccerCrowd3d=full'),'full');assert.equal(V24.soccerCrowd3dMode('?soccerCrowd3d=1'),'budget');
});

test('v24 runtime copies are byte for byte the Codex packs (design/ untouched), and no review sheet is copied',async()=>{
  const pairs=[...V24.SOCCER_KIT.files.map(f=>['assets/soccer-v24/pitch/'+f,'design/soccer-pitch-v1/'+f]),
    ...Object.keys(V24.SOCCER_FX_SPRITES).map(id=>['assets/soccer-v24/fx/sprites/'+id+'.png','design/soccer-fx-v1/sprites/'+id+'.png']),
    ...Object.values(V24.SOCCER_FX_SOUNDS).map(s=>['assets/soccer-v24/fx/audio/'+s.file,'design/soccer-fx-v1/audio/'+s.file]),
    ['assets/soccer-v24/crowd/assets.json','design/soccer-crowd-3d-v1/assets.json'],['assets/soccer-v24/crowd/lod-config.json','design/soccer-crowd-3d-v1/lod-config.json'],
    ['assets/soccer-v24/crowd/runtime/lod-policy.mjs','design/soccer-crowd-3d-v1/runtime/lod-policy.mjs'],['assets/soccer-v24/body/models/soccer.glb','design/athlete-body-v2/runtime/models/soccer.glb']];
  const crowd=await json('assets/soccer-v24/crowd/assets.json');
  for(const a of crowd.assets)pairs.push(['assets/soccer-v24/crowd/'+a.file,'design/soccer-crowd-3d-v1/'+a.file]);
  for(const [copy,source]of pairs)assert.equal(await sha(copy),await sha(source),copy);
  // the pack's own checksums still hold for the files the game ships
  const kit=await json('design/soccer-pitch-v1/manifest.json');
  for(const a of kit.assets.filter(a=>V24.SOCCER_KIT.files.includes(a.file)))assert.equal(await sha('assets/soccer-v24/pitch/'+a.file),a.sha256,a.file);
  assert.equal(await sha('assets/soccer-v24/pitch/atlas.png'),kit.atlas.sha256);
  for(const a of crowd.assets)assert.equal(await sha('assets/soccer-v24/crowd/'+a.file),a.sha256,a.file);
  const walk=async dir=>(await readdir(new URL(dir,root),{withFileTypes:true})).flatMap(e=>e.isDirectory()?[]:[dir+e.name]);
  const all=[];for(const d of ['assets/soccer-v24/','assets/soccer-v24/pitch/','assets/soccer-v24/clips/','assets/soccer-v24/fx/sprites/','assets/soccer-v24/fx/audio/','assets/soccer-v24/crowd/','assets/soccer-v24/body/models/'])all.push(...await walk(d));
  assert.ok(!all.some(f=>/verification|preview|sheet|validation|REPORT/i.test(f)),'no review material in the runtime copy: '+all.filter(f=>/verification|preview|sheet/i.test(f)));
});

test('pitch kit: the turf and its lines are the v23 markings the simulation plays on (8-a-side), goals on the mouth, real-size props outside play',()=>{
  const k=V24.soccerKitMarkings(product),lines=V24.soccerKitLines(product,{search:''});
  for(const key of ['penaltyDepth','penaltyWidth','goalAreaDepth','goalAreaWidth','penaltySpot'])assert.ok(Math.abs(k[key]-product[key])<.01,`${key}: kit ${k[key]} sim ${product[key]}`);
  assert.equal(lines.use,true);assert.equal(lines.reason,'match');assert.ok(lines.worstArc<.2,'arcs become ellipses within 0.2 m: '+lines.worstArc);
  // 6-a-side: v23 widens the box to 3.4 goals (the kit does not), so the game keeps its own lines; ?soccerPitch=v22 and ?soccerKitLines=0 too
  assert.equal(V24.soccerKitLines(pitchFor('6'),{search:''}).use,false);
  assert.equal(V24.soccerKitLines(pitchFor('8',false),{search:''}).reason,'pitch-v22');
  assert.equal(V24.soccerKitLines(product,{search:'?soccerKitLines=0'}).reason,'flag');
  for(const side of [-1,1]){
    const g=V24.soccerKitGoal(product,side),G=V24.SOCCER_KIT.goal,hx=product.length/2;
    const front=g.position[0]+side*G.frontCentre*g.scale[0],back=g.position[0]+side*G.depth*g.scale[0];
    assert.ok(Math.abs(front-side*hx)<1e-3,'front frame centre on the goal line');assert.ok(Math.abs(back-side*(hx+product.goalDepth))<1e-3,'net back at the simulation depth');
    assert.ok(Math.abs(g.scale[1]*G.height-product.goalHeight)<1e-3&&Math.abs(g.scale[2]*G.width-product.goalWidth)<1e-3,'opening = the game mouth');
  }
  const hz=product.width/2,hx=product.length/2,cover=1/Math.tan(28*Math.PI/180);
  for(const f of V24.soccerKitFlags(product))assert.deepEqual([Math.abs(f.position[0]),Math.abs(f.position[2])],[hx,hz]);
  for(const b of V24.soccerKitBoards(product)){
    const [x,,z]=b.position;
    if(Math.abs(z)>hz)assert.ok(Math.abs(z)-cover*1>hz,'a 1 m board hides nothing inside the touchline at 28 degrees');
    else assert.ok(Math.abs(x)>hx+product.goalDepth+1&&Math.abs(z)-V24.SOCCER_KIT.boards.width/2>product.goalWidth/2,'end boards clear of the goal and its net');
  }
});

test('pitch kit is presentation only: the simulation and its AI never import v24, the helpers never change the pitch they read',async()=>{
  for(const file of ['soccer.mjs','soccer-rules.mjs','soccer-restarts.mjs','soccer-design-tactics.mjs','soccer-teamplay.mjs','soccer-assistance.mjs','soccer-tactics.mjs'])
    assert.ok(!(await read('minigames/'+file)).includes('soccer-v24'),file);
  const frozen=Object.freeze({...product});
  V24.soccerKitMarkings(frozen);V24.soccerKitLines(frozen,{search:''});V24.soccerKitGoal(frozen,1);V24.soccerKitBoards(frozen);V24.soccerKitFlags(frozen);
  const view=await read('minigames/soccer-view.mjs'),kit=await read('minigames/soccer-v24-pitch.mjs');
  assert.ok(view.includes("v24Flags.pitchAssets?createSoccerPitchKit(")&&view.includes('hideV8KitParts(v8)')&&view.includes('if(kitReady)hideKitReplaced();'),'kit wired, v8 turf/flags/LED and the design goals/ball hidden only once the kit is up');
  assert.ok(kit.includes(".catch(error=>{status='fallback'"),'any load failure keeps the previous pitch');
});

test('clips v13: six clips with a simulation event are shipped, keeper_celebrate and volley stay out with a reason',async()=>{
  const clips=await json('assets/soccer-v24/clips/clips.json'),states=V24.soccerV24ClipStates(clips);
  assert.deepEqual(Object.keys(clips.states).sort(),[...V24.SOCCER_V24_CLIPS].sort());
  for(const [name,s] of Object.entries(states)){
    assert.ok(name.startsWith('v24_'));assert.equal(Object.keys(s.keyframes[0].rotations).length,18,name);
    assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);assert.ok(s.events.length>=1);
  }
  const catalog=await json('design/soccer-clips-v13/runtime/catalog.json');
  for(const id of V24.SOCCER_V24_CLIPS){const c=catalog.clips.find(c=>c.id===id);assert.equal(clips.states[id].durationSeconds,c.durationSeconds,id);}
  assert.deepEqual(Object.keys(V24.SOCCER_V24_LEFT_OUT).sort(),['keeper_celebrate','volley']);
  for(const reason of Object.values(V24.SOCCER_V24_LEFT_OUT))assert.ok(reason.length>40);
  // the simulation has no volley event to drive the clip
  assert.ok(!/event\('volley'/.test(await read('minigames/soccer.mjs')));
});

test('clips v13: restarts are scrubbed on the simulation clock, the release edge stays where the physics has it',()=>{
  const has=()=>true,R=V24.SOCCER_V24_RESTARTS;
  const gk={kind:'goalKick',elapsed:.528,contact:.528,duration:1.1};
  assert.deepEqual(V24.soccerV24RestartClip(gk,'goalKick',has),{name:'v24_goal_kick',time:R.goalKick.contact});
  assert.equal(V24.soccerV24RestartClip(gk,'freeKick',has),null,'free kicks and penalties keep their own clip');
  assert.equal(V24.soccerV24RestartClip({...gk,elapsed:0},'goalKick',has).time,R.goalKick.from,'the goal kick starts at its approach (ball already on the grass)');
  assert.equal(V24.soccerV24RestartClip({...gk,elapsed:1.1},'goalKick',has).time,R.goalKick.to);
  const ti={kind:'throwIn',elapsed:1.1176,contact:1.1176,duration:1.82};
  assert.equal(V24.soccerV24RestartClip(ti,null,has).time,R.throwIn.contact);
  const kt={kind:'keeperThrow',elapsed:.6608,contact:.6608,duration:1.18};
  assert.equal(V24.soccerV24RestartClip(kt,null,has).time,R.keeperThrow.contact);
  assert.equal(V24.soccerV24RestartClip({kind:'keeperPunt',elapsed:.3,contact:.8,duration:1.36},null,has),null,'the punt keeps its clip');
  assert.equal(V24.soccerV24RestartClip(kt,null,()=>false),null,'nothing when the pack did not load');
  let last=-1;for(let e=0;e<=1.82;e+=.01){const t=V24.soccerV24RestartTime(R.throwIn,{elapsed:e,contact:1.1176,duration:1.82});assert.ok(t>=last-1e-9);last=t;}
  assert.equal(V24.soccerV24SlideTime('slide',1),V24.SOCCER_V24_SLIDE.contact);assert.equal(V24.soccerV24SlideTime('recover',1),V24.SOCCER_V24_SLIDE.end);
  assert.equal(V24.soccerV24SlideTime('slide',0),0);
  const s={event:{type:'loft',player:3}};
  assert.equal(V24.soccerV24LobClip(s,{id:3},has),'v24_lob_pass');assert.equal(V24.soccerV24LobClip(s,{id:4},has),null);assert.equal(V24.soccerV24LobClip({event:{type:'pass',player:3}},{id:3},has),null);
  assert.equal(V24.soccerV24ChestClip(1.3,0,has),'v24_chest_control');assert.equal(V24.soccerV24ChestClip(.7,0,has),null,'thigh height keeps the v10 touch');
  assert.equal(V24.soccerV24ChestClip(1.3,3,has),null,'a running reception keeps the v10 running touch');
  assert.ok(V24.soccerV24Held('v24_lob_pass')&&V24.soccerV24Held('v24_chest_control')&&!V24.soccerV24Held('v24_slide_tackle'));
});

test('clips v13: the state machine reaches each clip from its event, and `?soccerClipsV13=0` leaves the state set as before',async()=>{
  const src=await read('minigames/soccer-design-character.mjs');
  assert.ok(src.includes('if(soccerClipsV13Enabled()){try{v24=soccerV24ClipStates(await fetchJson(soccerV24ClipsUrl()));}'),'pack loaded behind the switch');
  assert.ok(src.includes('const states={...extra.states,...v8,...v9,...v10,...v11,...v22,...v24};'));
  assert.ok(src.includes('soccerV24RestartClip(restart,s.restart?.player===p.id?s.restart.type:null,has)'),'restarts');
  assert.ok(src.includes("else if(mode==='slide'&&edge&&clipsV24&&actions[SOCCER_V24_SLIDE.clip])"),'slide');
  assert.ok(src.includes('const v24lob=clipsV24?soccerV24LobClip(s,p,has):null;'),'lofted pass');
  assert.ok(src.includes('soccerV24ChestClip(p.receiveHeight||0,p.receiveSpeed||0,has)'),'chest control');
  assert.ok(src.includes('v2:Boolean(slide.plan||slide.v24)'),'the slide keeps its yaw lock');
  // the throw clips let go lower than the simulation's release point: the shown ball joins the simulated flight within 0.12 s (no jump)
  const view=await read('minigames/soccer-view.mjs');
  assert.ok(view.includes('if(restartAttachment&&character?.motion?.restartClip){releaseBlend.x=ballRoot.position.x;')&&view.includes('const u=Math.min(1,releaseBlend.age/.12),w=(1-u)*(1-u);'),'release blend');
  // the v23 yaw cap now covers the v22 / v2 body too (main's v22.1 body path had skipped it)
  assert.equal((src.match(/this\.yaw\+=yawCapped&&this\.slideYaw==null\?capYawStep\(turnStep,dt\):turnStep;/g)||[]).length,3);
});

test('fx v1: sheets as in the pack manifest, frame and UV math, event and sound mapping, no whistle-band energy',async()=>{
  const manifest=await json('design/soccer-fx-v1/manifest.json');
  for(const [id,spec] of Object.entries(V24.SOCCER_FX_SPRITES)){
    const m=manifest.sprites.find(s=>s.id===id);assert.ok(m,id);
    assert.equal(spec.columns,m.columns);assert.equal(spec.rows,m.rows);assert.equal(spec.frames,m.frameCount);assert.equal(spec.fps,m.fps);assert.equal(spec.loop,m.loop);
    assert.equal(spec.additive,m.blend==='AdditiveBlending');assert.deepEqual(spec.anchor,m.anchor);if(m.durationSeconds)assert.ok(Math.abs(spec.seconds-m.durationSeconds)<1e-3,id);
    if(id!=='ball-trail')assert.equal(spec.columns*spec.px,m.width,id+' width');assert.equal(spec.rows*spec.px,m.height,id+' height'); // the trail is one 256 x 32 strip
  }
  const confetti=V24.SOCCER_FX_SPRITES['goal-confetti'];
  assert.equal(V24.soccerFxFrame(confetti,0),0);assert.equal(V24.soccerFxFrame(confetti,10),31,'a one-shot holds its last frame');
  assert.equal(V24.soccerFxFrame(V24.SOCCER_FX_SPRITES['selected-player-ring'],1.01),0,'the ring loops');
  const uv=V24.soccerFxUv(confetti,9);assert.ok(Math.abs(uv.offset[0]-(1/8+.5/512))<1e-9&&Math.abs(uv.offset[1]-(1-2/4+.5/256))<1e-9);
  assert.equal(V24.soccerFxForEvent({type:'slide',player:1}),'slide-turf');assert.equal(V24.soccerFxForEvent({type:'switch',player:1}),'click-ring');
  assert.equal(V24.soccerFxForEvent({type:'shot',power:.9}),'power-kick');assert.equal(V24.soccerFxForEvent({type:'shot',power:.3}),null);assert.equal(V24.soccerFxForEvent({type:'shot',power:.9,punt:true}),null);
  assert.ok(V24.soccerBallLanded(1.2,{y:.12,owner:null},.11));assert.ok(!V24.soccerBallLanded(.3,{y:.12,owner:null},.11),'a dribble hop is not a landing');assert.ok(!V24.soccerBallLanded(1.2,{y:.12,owner:2},.11));
  const s={players:[{role:'keeper',hands:true},{role:'field',hands:false}]};
  assert.equal(V24.soccerFxSound({type:'shot',power:.8},s),'v24/kick-strong');assert.equal(V24.soccerFxSound({type:'shot',power:.2},s),'v24/kick-soft');
  assert.equal(V24.soccerFxSound({type:'post',kind:'crossbar'},s),'v24/crossbar-hit');assert.equal(V24.soccerFxSound({type:'post',kind:'post'},s),'v24/post-hit');
  assert.equal(V24.soccerFxSound({type:'possession',player:0},s),'v24/keeper-catch');assert.equal(V24.soccerFxSound({type:'possession',player:1},s),null);
  assert.equal(V24.soccerFxSound({type:'restart'},s),null,'whistles stay with the rules table');
  // the Foley bank: the pack's measurement of every shipped file, against the 8% whistle-band threshold
  for(const [key,sound] of Object.entries(V24.SOCCER_FX_SOUNDS)){
    const entry=manifest.audio.flatMap(a=>a.files).find(f=>f.file==='audio/'+sound.file);assert.ok(entry,key);
    assert.ok(entry.energy2To5KhzPercent<8,`${key}: ${entry.energy2To5KhzPercent}% in 2-5 kHz`);assert.equal(await sha('assets/soccer-v24/fx/audio/'+sound.file),entry.sha256,key);
  }
});

function audioHarness(options){
  let ctx;
  class Param{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}}
  class Node{constructor(kind){this.kind=kind;this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();}connect(n){return n;}disconnect(){}start(){}stop(){}}
  class Ctx{constructor(){ctx=this;this.state='running';this.currentTime=1;this.destination=new Node('dest');}createGain(){return new Node('gain');}createBiquadFilter(){return new Node('filter');}createBufferSource(){return new Node('source');}
    async decodeAudioData(){return {duration:1};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
  const fetched=[],fetcher=async url=>{fetched.push(String(url));return String(url).endsWith('mix.json')?{ok:true,json:async()=>json('design/audio/mix.json')}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
  return {audio:createSoccerDesignAudio({storage:null,AudioContext:Ctx,fetcher,clock:()=>ctx?.currentTime??0,...options}),fetched};
}
test('fx v1 audio: the Foley replaces kick / pass / net cues and adds post, crossbar, catch and landing; `?soccerFxV1=0` plays the old bank',async()=>{
  const settle=()=>new Promise(r=>setTimeout(r,60));
  const on=audioHarness({fx:true});await on.audio.unlock();await settle();
  assert.ok(on.fetched.some(u=>u.includes('assets/soccer-v24/fx/audio/kick-strong.ogg')),'v24 bank fetched');
  on.audio.update({phase:'playing',players:[{role:'keeper',hands:true}],ball:{x:0,y:1.4,z:0,vx:0,vz:0,owner:null}});
  on.audio.event({type:'shot',power:.9});on.audio.event({type:'post',kind:'crossbar'});on.audio.event({type:'possession',player:0});on.audio.event({type:'goal',team:0});
  on.audio.update({phase:'playing',players:[{role:'keeper',hands:true}],ball:{x:0,y:.11,z:0,vx:0,vz:0,owner:null}});
  const c=on.audio.snapshot.counts;
  for(const key of ['v24/kick-strong','v24/crossbar-hit','v24/keeper-catch','v24/net-rustle','v24/ball-land'])assert.equal(c[key],1,key+' '+JSON.stringify(c));
  assert.ok(!c.kick&&!c['soccer/net'],'no double cue');
  const off=audioHarness({fx:false});await off.audio.unlock();await settle();
  assert.ok(!off.fetched.some(u=>u.includes('soccer-v24')),'?soccerFxV1=0 fetches nothing new');
  off.audio.event({type:'shot',power:.9});off.audio.event({type:'goal',team:0});
  assert.equal(off.audio.snapshot.counts.kick,1);assert.equal(off.audio.snapshot.counts['soccer/net'],1);
  for(const [key,asset] of Object.entries(soccerV24MixAssets())){assert.ok(asset.recommended_gain_linear<.4,key+' sits under the shipped -23 LUFS bank');assert.ok(asset.cooldown_ms>=90);}
});

test('crowd 3D: seats stand in for exactly the cards they replace, face the pitch, and the budget keeps the match on its tier',async()=>{
  const sx=product.length/105,sz=product.width/68,spec=V24.SOCCER_CROWD_BUDGET;
  const {seats,cards}=V24.soccerCrowdSeats(crowdPlacements(LEVELS[0]),{scale:{x:sx,y:Math.min(sx,sz),z:sz},rows:spec.rows,sections:[4],variants:spec.variants,fansPerCard:3,limit:1200,tread:.82*TIERS[0].rise});
  assert.ok(seats.length>=150&&seats.length%3===0,'three fans per card: '+seats.length);
  assert.ok(cards.every(p=>p.section===4&&p.tier===0&&p.row<spec.rows));
  for(const s of seats){
    assert.ok(s.z<-product.width/2,'on the far long stand');assert.ok(spec.variants.includes(s.variant));
    const forward=[Math.sin(s.yaw),Math.cos(s.yaw)];assert.ok(forward[1]>.9,'faces the pitch (+z from the z- stand)');
  }
  // ranks: the cards used are the top of their section, so hiding the top m of the section hides exactly them
  const rank=p=>V24.soccerCrowdCardRank(p,{rows:spec.rows,sections:[0,4]});
  const section4=crowdPlacements(LEVELS[0]).filter(p=>p.section===4&&rank(p)!==null).sort((a,b)=>rank(a)-rank(b));
  const used=Math.ceil(120/3);assert.deepEqual(section4.slice(0,used).map(p=>p.x),cards.slice(0,used).map(p=>p.x));
  assert.deepEqual([...V24.soccerCrowdHiddenCards(cards,120)],[[4,used]]);
  // the budget from the measured match (13/11: 123,471 triangles and 76 draw calls before the fans)
  const limit=soccerCrowdLimit({scene:123471,draws:76,maxTriangles:balance.view.maxTriangles,maxDrawCalls:balance.view.maxDrawCalls,mode:'budget',seats:seats.length});
  assert.ok(limit.fans>0&&limit.fans<=seats.length);assert.ok(123471+limit.triangles<=balance.view.maxTriangles,'under the tier budget');
  assert.ok(76+limit.levels.length*spec.variants.length<=balance.view.maxDrawCalls,'draw calls under budget');
  const plan=planCrowd(seats.slice(0,limit.fans),[0,9,30],{...(await json('assets/soccer-v24/crowd/lod-config.json')),distanceThresholds:[0,42],crowdTriangleLimit:limit.triangles});
  assert.ok(plan.triangles<=limit.triangles);assert.equal(plan.submitted[0],0,'no LOD0 in budget mode');
  assert.equal(soccerCrowdLimit({scene:129500,draws:76,maxTriangles:130000,maxDrawCalls:90,mode:'budget',seats:300}).fans,0,'no room: the cards stay');
  assert.deepEqual(soccerCrowdLimit({scene:0,draws:0,maxTriangles:130000,maxDrawCalls:90,mode:'full',seats:1500}),{fans:1200,triangles:80000,levels:[0,1,2]});
  const stadium=await read('minigames/soccer-v8-stadium.mjs');
  assert.ok(stadium.includes('setCrowdHidden(hidden=new Map())')&&stadium.includes('makeCrowd(LEVELS[i],atlas,time,resources,mood,i===0?crowdRank:null)'),'cards hidden only on LOD0, only with a rank');
  // every frame: the room the previous frame left decides (one frame over maxTriangles steps the match down a tier); shed at once, grow slowly
  const view=await read('minigames/soccer-view.mjs');
  assert.ok(view.includes('room=Math.floor(config.view.maxTriangles*CROWD_ROOM-(info.triangles-mine))')&&view.includes('if(fit<crowdCount){setCrowdCount(fit,room);'),'per-frame budget guard');
  assert.ok(view.includes("const allowed=assetStatus==='ready'&&quality<=crowdSpec.maxQuality&&v8.lod===0;"),'tiers 2-3: cards only');
});

test('body v2: hands with the glove morph on the canonical rig; numbers 0-99 and gloves on a v22 instance, one material per player on one program',async()=>{
  const glb=await glbJson('assets/soccer-v24/body/models/soccer.glb');
  const names=glb.nodes.map(n=>n.name);for(const bone of ['Root','Hips','Spine','Chest','Neck','Head','LeftHand','RightHand','LeftFoot','RightFoot'])assert.ok(names.includes(bone),bone);
  assert.ok(glb.meshes[0].extras.targetNames.includes('goalkeeper_gloves'));assert.ok('_GLOVE' in glb.meshes[0].primitives[0].attributes);
  assert.equal(glb.images[0].uri,'../textures/athlete-atlas.png');
  assert.equal(await sha('assets/athlete-body-v22/textures/athlete-atlas.png'),await sha('design/athlete-body-v2/runtime/textures/athlete-atlas.png'),'the loader points the body at the v22 atlas: same bytes');
  // a stand-in instance: one skinned body (with _glove) and a hair cap
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(9),3));geometry.setAttribute('_glove',new T.BufferAttribute(new Float32Array(3),1));
  const shared=new T.MeshStandardMaterial(),body=new T.Mesh(geometry,shared);body.isSkinnedMesh=true;body.morphTargetDictionary={goalkeeper_gloves:3};body.morphTargetInfluences=[0,0,0,0];
  const hair=new T.Mesh(new T.BufferGeometry(),shared);
  const keeper=decorateAthleteV2(T,{meshes:{full:[body,hair]}},{number:1,gloves:true,kit:{primary:'#cf9d2e',secondary:'#1d2430',shorts:'#1d2430'},appearance:{skin:'#c08a68'}});
  assert.notEqual(body.material,shared);assert.equal(hair.material,shared,'the hair cap keeps the shared material');
  assert.equal(body.morphTargetInfluences[3],1);assert.equal(keeper.gloves,true);assert.equal(keeper.number,1);
  assert.equal(body.material.customProgramCacheKey(),'athlete-body-v2-masks-1');
  const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};body.material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('vAthleteGlove=_glove;')&&shader.fragmentShader.includes('athleteNumberMask(backUV)'),'the masks hook three r160 chunks');
  keeper.setNumber(99);assert.equal(keeper.uniforms.athleteNumber.value,99);assert.equal(keeper.uniforms.athleteNumbers.value,1);
  keeper.setNumber(120);assert.equal(keeper.uniforms.athleteNumbers.value,0,'outside 0-99: no number, no throw');keeper.setNumber(0);assert.equal(keeper.uniforms.athleteNumbers.value,1,'0 is drawn');
  assert.equal(V24.soccerShirtNumber(7),7);assert.equal(V24.soccerShirtNumber(7.5),null);
  const src=await read('minigames/soccer-design-character.mjs');
  assert.ok(src.includes("athleteBodyV2Enabled()?loadAthleteV2({T,GLTFLoader,retry:fn=>retrying(fn,'soccer-v24/body')}).catch(error=>{lastAthleteV2Error=String(error?.message||error);return v22Body();}):v22Body()"),'v2 first, the v22 body on failure or ?athleteBodyV2=0');
  assert.ok(src.includes('decoration?.setNumber(p.card?.number??slot.matchNumber??null);'),'the number follows the player card');
});

test('offline: every v24 file of the default match is listed for soccer, the shell list is current, new code uses the current tag',async()=>{
  const manifest=await json('offline-manifest.json'),release=await json('release.json'),soccer=new Set(manifest.games.soccer);
  const crowd=await json('assets/soccer-v24/crowd/assets.json');
  const files=[...V24.SOCCER_KIT.files.map(f=>'assets/soccer-v24/pitch/'+f),'assets/soccer-v24/clips/clips.json',...Object.keys(V24.SOCCER_FX_SPRITES).map(id=>'assets/soccer-v24/fx/sprites/'+id+'.png'),
    ...Object.values(V24.SOCCER_FX_SOUNDS).map(s=>'assets/soccer-v24/fx/audio/'+s.file),'assets/soccer-v24/crowd/assets.json','assets/soccer-v24/crowd/lod-config.json','assets/soccer-v24/body/models/soccer.glb',
    ...crowd.assets.filter(a=>V24.SOCCER_CROWD_BUDGET.variants.includes(a.variant)&&V24.SOCCER_CROWD_BUDGET.levels.includes(a.level)).map(a=>'assets/soccer-v24/crowd/'+a.file)];
  for(const f of files){assert.ok(soccer.has(f),f);await access(new URL(f,root));}
  for(const f of ['minigames/soccer-v24.mjs','minigames/soccer-v24-pitch.mjs','minigames/soccer-v24-fx.mjs','minigames/soccer-v24-crowd.mjs','minigames/athlete-body-v2.mjs','assets/soccer-v24/crowd/runtime/lod-policy.mjs'])assert.ok(manifest.shell.includes(f),f);
  assert.deepEqual(manifest.shell,await buildShell(),'run node workout/island/tools/offline-shell.mjs');
  for(const f of ['minigames/soccer-v24.mjs','minigames/soccer-v24-pitch.mjs','minigames/soccer-v24-fx.mjs','minigames/soccer-v24-crowd.mjs','minigames/athlete-body-v2.mjs']){
    const tags=[...(await read(f)).matchAll(/\?v=(island-v2-[0-9-]+)/g)].map(m=>m[1]);for(const tag of tags)assert.equal(tag,release.version,f);
  }
  assert.equal(release.version,'island-v2-20261107-12','release.json is main\'s, not bumped here');
});
