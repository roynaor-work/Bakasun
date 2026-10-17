import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DATA_VERSION} from '../workout/island/release.mjs';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,migrations,validateSave,CURRENT_VERSION,STORAGE_KEY} from '../workout/island/engine/persistence.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {equipmentValues} from '../workout/island/activity/equipment.mjs';
import {recordStageWin} from '../workout/island/activity/progress.mjs';
import {soccerAvailability,soccerTeam,soccerViewConfig,teamRank} from '../workout/island/activity/soccer-team.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {createVessel,createNavalView} from '../workout/island/minigames/naval-view.mjs';
import {loadPatrolBoat} from '../workout/island/minigames/patrol-boat.mjs';
import * as T from '../workout/island/vendor/three.module.js';
const root=new URL('../workout/island/',import.meta.url),data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})),balance=data.config.minigames.soccer;
const fixture=()=>{const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},engine=createEngine(data,{storage,now:()=>123456});engine.setSoccerDifficulty('normal');return {engine,storage,values,activity:createActivity(engine,{now:()=>123456})};};
function pitch(engine){engine.state.buildings.push({id:'soccer-test',typeId:'soccer',x:1,z:0,level:1});}
const payload=(extra={})=>({won:true,goalsFor:3,goalsAgainst:0,stage:1,stars:3,seed:42,durationSeconds:150,difficulty:'normal',...extra});
const envelope=r=>({outcome:r.won?'win':'lose',score:r.goalsFor,performance:1,soccer:r});
function round(f){let ctx;const game=f.engine.registry.minigames.get('soccer'),start=game.start;f.engine.registry.minigames.set('soccer',{...game,start:c=>{ctx=c;return start(c);}});const response=f.engine.startMinigame('soccer',gameContext(f.engine,data.config.minigames,42,'soccer',1));return {ctx,response};}

test('G3b soccer registers once as both sport and game with pinned original lab and pure island simulation',async()=>{
 const f=fixture(),game=f.engine.registry.minigames.get('soccer');assert.equal(game.icon,'⚽');assert.equal(game.featureFlag,'soccer');assert.equal(game.helpId,'minigame.soccer.help');assert.equal(f.engine.registry.sports.get('soccer').teamSize,3);assert.equal(f.engine.registry.sports.get('soccer').buildingId,'soccer');assert.equal(data.config.playerDefaults.speed,3);assert.equal(balance.levels.length,10);assert.equal(data.config.minigameLevels.soccer.length,3);
 assert.equal(createHash('sha256').update(await readFile(new URL('../../codex-lab/island-soccer/soccer.mjs',root))).digest('hex'),'aaaf74218c45e080a2578fcca8b4e8c20ae81d0c7b68e9dc03e7846022eefbc0');
 assert.doesNotMatch((await readFile(new URL('minigames/soccer.mjs',root),'utf8')).replace(/\/\/[^\n]*/g,''),/\b(document|window|localStorage|Date|Math\.random)\b/);
});
test('G3b the same pitch availability locks the menu and engine; city construction rules stay in place',()=>{
 const f=fixture();assert.deepEqual(soccerAvailability(f.engine.state),{ok:false,reason:'minigame.soccer.locked'});assert.equal(f.engine.startMinigame('soccer').reason,'minigame.soccer.locked');pitch(f.engine);assert.equal(soccerAvailability(f.engine.state).ok,true);const r=f.engine.startMinigame('soccer');assert.equal(r.ok,true);r.cancel();
});
test('G3b view receives city colors and stage-cycled opponents from data, including changed palettes',()=>{
 const f=fixture(),ctx={...gameContext(f.engine,data.config.minigames,42,'soccer',1),state:f.engine.state};
 const first=soccerViewConfig(ctx,balance);assert.deepEqual(first.team.colors,data.team.colors);assert.deepEqual(first.opponent.colors,balance.opponents.teams[0].colors);assert.equal(first.opponent.colors[0],'#e94d51');
 f.engine.state.team.colors=['#269847','#ebda61'];const palettes=[['#a83491','#f3edcb'],['#435fa1','#dfde76'],['#31764b','#fdc263']],custom={...balance,opponents:balance.opponents.teams.map((row,i)=>({...row,colors:palettes[i]}))};
 for(const level of [1,2,3,4,10]){const supplied=soccerViewConfig({...ctx,level},custom);assert.deepEqual(supplied.team.colors,f.engine.state.team.colors);assert.deepEqual(supplied.opponent.colors,custom.opponents[(level-1)%custom.opponents.length].colors);assert.notEqual(supplied.team.colors[0],supplied.opponent.colors[0]);}
});
test('G3b single session, one payment, stage unlocking and neutral cancellation use the island lifecycle',()=>{
 const f=fixture();pitch(f.engine);const money=f.engine.state.money,parts=structuredClone(f.engine.state.parts),r=round(f);assert.equal(r.response.ok,true);assert.equal(f.engine.startMinigame('navalDuel').reason,'reason.gameBusy');
 r.response.session.setPaused(true);assert.equal(r.response.session.snapshot.paused,true);r.response.session.setPaused(false);
 assert.equal(r.ctx.finish(envelope(payload())).ok,true);assert.equal(f.engine.state.money,money+balance.levels[0].winMoney+1);assert.equal(f.engine.state.minigameProgress.soccer.stage,2);assert.equal(f.engine.state.minigameProgress.soccer.stars[0],3);assert.equal(f.engine.state.team.wins,1);assert.equal(r.response.session.snapshot.disposed,true);assert.equal(r.ctx.finish(envelope(payload())).ok,false);assert.equal(f.engine.state.team.wins,1);
 const before=f.engine.exportJSON(),next=round(f);assert.equal(next.response.cancel().cancelled,true);assert.equal(next.response.cancel().ok,false);assert.equal(f.engine.exportJSON(),before);assert.deepEqual(f.engine.state.parts,parts);
});
for(const score of [[0,1],[1,1]])test(`G3b ${score[0]}:${score[1]} receives no coins, stars, wins or next stage`,()=>{
 const f=fixture();pitch(f.engine);const before=f.engine.state.money,r=round(f),result=r.ctx.finish(envelope(payload({won:false,goalsFor:score[0],goalsAgainst:score[1],stars:1})));assert.equal(result.ok,true);assert.equal(result.result.outcome,'lose');assert.equal(result.result.money,0);assert.equal(result.result.stars,0);assert.equal(f.engine.state.money,before);assert.equal(f.engine.state.team.wins,0);assert.equal(f.engine.state.minigameProgress.soccer.stage,1);
});
for(const [field,value]of [['won',false],['goalsFor',1.5],['goalsAgainst',-1],['stage',2],['stars',1],['seed',43],['durationSeconds',1],['goalsFor',balance.maximumScore+1],['seed','42'],['durationSeconds',NaN]])test(`G3b malformed laboratory result ${field}=${value} is rejected before settlement`,()=>{
 const f=fixture();pitch(f.engine);const r=round(f),before=f.engine.exportJSON();assert.equal(r.ctx.finish(envelope(payload({[field]:value}))).ok,false);assert.equal(f.engine.exportJSON(),before);assert.equal(f.engine.isMinigameActive(),true);r.response.cancel();
});
test('G3b result requires exactly the eight G3c fields and agrees with the envelope',()=>{
 const ctx={level:1,seed:42,difficulty:'normal'};for(const r of [payload({unknown:1}),Object.fromEntries(Object.entries(payload()).filter(([key])=>key!=='seed')),null])assert.equal(soccerResult({soccer:r},ctx,balance),null);assert.equal(soccerResult({...envelope(payload()),outcome:'lose'},ctx,balance),null);
 for(const r of [payload({goalsFor:1}),payload({goalsFor:3,goalsAgainst:1,stars:2}),payload({goalsFor:2,goalsAgainst:1,stars:1})])assert.equal(soccerResult(envelope(r),ctx,balance).stars,r.stars);
});
test('G3b all three equipment tracks spend coins, require stars from their second purchase and merge max',()=>{
 const f=fixture();f.engine.state.money=5000;
 for(const key of ['speed','kick','guard']){const before=f.engine.state.money;assert.equal(f.activity.upgrade('soccer',key).ok,true);assert.equal(f.engine.state.money,before-balance.equipment[key].levels[0].cost);assert.equal(f.activity.upgrade('soccer',key).reason,'equipment.starsReason');}
 for(let stage=1;stage<=5;stage++)recordStageWin(f.engine.state,data,'soccer',stage,3);
 for(const key of ['speed','kick','guard'])for(let i=1;i<balance.equipment[key].levels.length;i++)assert.equal(f.activity.upgrade('soccer',key).ok,true);
 const context={...gameContext(f.engine,data.config.minigames,42,'soccer'),state:f.engine.state},team=soccerTeam(context,balance),model=createSoccer({config:balance,team});assert.deepEqual(team.players.map(p=>p.id),data.players.map(p=>p.id));assert.deepEqual(team.colors,data.team.colors);for(const p of model.getState().players.slice(0,3))for(const key of ['speed','kick','guard'])assert.equal(p[key],5);
 const poor=fixture();assert.equal(poor.engine.importJSON(f.engine.exportJSON()).ok,true);assert.equal(poor.engine.importJSON(fixture().engine.exportJSON()).ok,true);assert.deepEqual(poor.engine.state.minigameEquipment.soccer,f.engine.state.minigameEquipment.soccer);
 pitch(f.engine);const r=round(f);assert.equal(f.activity.upgrade('soccer','speed').reason,'reason.gameBusy');r.response.cancel();
});
test('G3b match starts at data equipment base while city playerDefaults remain three',()=>{
 const f=fixture(),context={...gameContext(f.engine,data.config.minigames,42,'soccer'),state:f.engine.state},team=soccerTeam(context,balance);for(const p of team.players)assert.equal(p.speed,1);assert.equal(f.engine.state.players[0].speed,3);
 const base=createSoccer({config:balance,team});context.equipment={speed:3,kick:4,guard:2};const upgraded=createSoccer({config:balance,team:soccerTeam(context,balance)});assert.ok(upgraded.getState().players[0].speed>base.getState().players[0].speed);
});
test('G3b team wins cross each data threshold exactly; rank bonus reaches all model attributes and clamps',()=>{
 const f=fixture();pitch(f.engine);for(let i=0;i<25;i++){const r=round(f);assert.equal(r.ctx.finish(envelope(payload())).ok,true);assert.equal(f.engine.state.team.rank,teamRank(i+1,balance));}
 assert.equal(f.engine.state.team.rank,4);const ctx={...gameContext(f.engine,data.config.minigames,42,'soccer'),state:f.engine.state};assert.equal(soccerTeam(ctx,balance).players[0].speed,2);assert.equal(f.engine.state.minigameWins.soccer,25);
 const target=fixture();assert.equal(target.engine.importJSON(f.engine.exportJSON()).ok,true);assert.equal(target.engine.importJSON(fixture().engine.exportJSON()).ok,true);assert.equal(target.engine.state.team.wins,25);assert.equal(target.engine.state.team.rank,4);
});
test('G3b authentic f131be2 v7 save migrates, reloads and imports without resetting existing equipment',async()=>{
 const f=fixture(),old=JSON.parse(await readFile(new URL('tests/fixtures/save-v7.json',root),'utf8')),before=structuredClone(old),r=migrateSave(old,data,f.engine.registry);assert.equal(old.version,7);assert.equal(CURRENT_VERSION,15);assert.equal(STORAGE_KEY,'island.v1');assert.equal(r.ok,true);assert.deepEqual(old,before);
 assert.deepEqual(r.state.minigameEquipment.soccer,{speed:0,kick:0,guard:0});assert.deepEqual(r.state.team,{...old.team,wins:0,rank:0,sportWins:{soccer:0,tennis:0}});for(const key of ['money','avatar','resources','alienUpgrades'])assert.deepEqual(r.state[key],old[key]);assert.deepEqual(r.state.buildings.filter(b=>b.typeId!=='cityHall'),old.buildings);assert.equal(r.state.minigameEquipment.navalDuel.damage,2);assert.equal(r.state.minigameProgress.alienDefense.stars[0],3);
 f.storage.setItem(STORAGE_KEY,JSON.stringify(old));const loaded=createEngine(data,{storage:f.storage});assert.equal(loaded.state.version,15);assert.equal(loaded.state.money,321);assert.equal(loaded.importJSON(old).ok,true);assert.equal(validateSave(loaded.state,data,loaded.registry).ok,true);assert.deepEqual([...f.values.keys()],[STORAGE_KEY]);
 const direct={...before,minigameEquipment:{...before.minigameEquipment,soccer:{speed:2,kick:1,guard:3}},team:{...before.team,wins:8,rank:2}};assert.deepEqual(migrations[7](direct).minigameEquipment.soccer,direct.minigameEquipment.soccer);assert.equal(migrations[7](direct).team.wins,8);
});
for(const [label,mutate]of [['negative rank',s=>s.minigameEquipment.soccer.speed=-1],['fractional rank',s=>s.minigameEquipment.soccer.kick=1.5],['excess rank',s=>s.minigameEquipment.soccer.guard=5],['missing track',s=>delete s.minigameEquipment.soccer.guard],['unknown track',s=>s.minigameEquipment.soccer.bad=0],['missing soccer',s=>delete s.minigameEquipment.soccer],['string wins',s=>s.team.wins='3'],['negative wins',s=>s.team.wins=-1],['unsafe wins',s=>s.team.wins=2**53],['bad rank',s=>s.team.rank=5],['fractional team rank',s=>s.team.rank=.5],['inconsistent rank',s=>s.team.rank=1]])test(`G3b corrupt save rejects ${label} without changing current progress`,()=>{
 const f=fixture(),raw=f.engine.exportJSON(),save=JSON.parse(raw);mutate(save);assert.equal(validateSave(save,data,f.engine.registry).ok,false);assert.equal(f.engine.importJSON(save).ok,false);assert.equal(f.engine.exportJSON(),raw);
});
function fakeBoat(){const root=new T.Group(),texture=new T.Texture(),material=new T.MeshStandardMaterial({map:texture});root.add(new T.Mesh(new T.BoxGeometry(10,2,3),material));return root;}
const naval=data.config.minigames.navalDuel;
test('G3b patrol normalizes locally, keeps articulated cannon/flag, and releases texture/material/geometry once',async()=>{
 const object=fakeBoat(),resources=[object.children[0].geometry,object.children[0].material,object.children[0].material.map],counts=resources.map(()=>0);resources.forEach((r,i)=>r.addEventListener('dispose',()=>counts[i]++));
 const vessel=createVessel(T,naval.render,{}, {},naval.playerModel,{loader:{async loadAsync(url){const requested=new URL(url);assert.match(requested.pathname,/boat-patrol-512\.glb$/);assert.equal(requested.searchParams.get('v'),DATA_VERSION);return {scene:object};}}});await vessel.ready;assert.equal(vessel.modelStatus.loaded,true);assert.equal(vessel.root.children[0].visible,false);assert.ok(vessel.turret.parent);assert.ok(vessel.flag.parent);const bounds=new T.Box3().setFromObject(object);assert.ok(Math.abs(bounds.getSize(new T.Vector3()).z-naval.playerModel.length)<1e-6);vessel.turret.rotation.y=.7;assert.equal(vessel.turret.rotation.y,.7);vessel.dispose();vessel.dispose();assert.deepEqual(counts,[1,1,1]);
});
for(const path of ['../codex-lab/boat.glb','https://example.com/boat.glb','assets/%2e%2e/%2e%2e/boat.glb'])test(`G3b external patrol path rejected: ${path}`,async()=>{let requests=0;assert.equal(await loadPatrolBoat({...naval.playerModel,path},{loader:{loadAsync(){requests++;}}}),null);assert.equal(requests,0);});
test('G3b missing/corrupt patrol keeps code ship; late model completion releases its resources',async()=>{
 for(const error of [Error('404'),Error('invalid GLB')]){const v=createVessel(T,naval.render,{}, {},naval.playerModel,{loader:{async loadAsync(){throw error;}}});await v.ready;assert.equal(v.modelStatus.failed,true);assert.equal(v.root.children[0].visible,true);v.dispose();}
 let resolve,released=0;const object=fakeBoat();object.children[0].geometry.addEventListener('dispose',()=>released++);const v=createVessel(T,naval.render,{}, {},naval.playerModel,{loader:{loadAsync:()=>new Promise(r=>resolve=r)}});v.dispose();resolve({scene:object});await v.ready;assert.equal(released,1);assert.equal(v.modelStatus.loaded,false);
});

test('G3b unavailable WebGL returns to the existing canvas code ship without requesting a model',()=>{assert.equal(createNavalView({config:data.config.minigames,balance:naval},null,{canvas:{},createRenderer(){throw Error('no WebGL');}}),null);});
