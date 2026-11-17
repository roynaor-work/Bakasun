import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const source=process.env.SOCCER_QUALITY_SOURCE||process.env.SOCCER_QUALITY_ROOT;
const root=source?pathToFileURL(source.replace(/\/$/,'')+'/'):new URL('../../../../../',import.meta.url);
const {updateQualityKeeper,predictQualityKeeperBall,qualityKeeperCanContact,qualityKeeperSaveChance,keeperMotionV3Cue}=await import(new URL('workout/island/minigames/soccer-quality-keeper.mjs',root));
const original=JSON.parse(await readFile(new URL('workout/island/data/config.json',root),'utf8')).minigames.soccer;
const config={...original,quality:{keeper:true}},dt=config.match.fixedStep;
function fixture(){
 const p={id:2,team:0,role:'keeper',x:-config.pitch.length/2+config.ai.keeperInset,z:0,diveTime:0,diveCooldown:0,card:{reactions:60,catching:60}};
 const b={owner:null,lastTeam:1,lastPlayer:3,shot:{speed:20},x:p.x+9,y:.8,z:-1.5,vx:-20,vy:3,vz:5,curve:0};
 return {p,s:{role:'field',controlled:0,attackDir:1,ball:b,players:[p]}};
}
test('keeper flag absent: helpers preserve state and save probability',()=>{
 const {p,s}=fixture(),before=structuredClone(p);
 assert.equal(updateQualityKeeper(p,s,original,dt),null);assert.deepEqual(p,before);
 assert.equal(qualityKeeperCanContact(p,s,original),true);assert.equal(qualityKeeperSaveChance(.37,p,s,original),.37);
});
test('keeper reaction cannot start a dive or contact before its bounded observation delay',()=>{
 const {p,s}=fixture();
 for(let i=0;i<4;i++){assert.equal(updateQualityKeeper(p,s,config,dt),null);assert.equal(p.diveTime,0);assert.equal(qualityKeeperCanContact(p,s,config),false);}
 assert.ok(p.qualityKeeper.reaction>=.08&&p.qualityKeeper.reaction<=.18);
});
test('keeper predicts curve/gravity from the ball and chooses its future side, not current side',()=>{
 const {p,s}=fixture(),prediction=predictQualityKeeperBall(p,s,config);
 assert.ok(prediction?.onFrame);assert.ok(prediction.z>0,'ball starts left but crosses the home plane on the right');
 let target;for(let i=0;i<12;i++)target=updateQualityKeeper(p,s,config,dt);
 assert.ok(target);assert.ok(p.diveZ>0);assert.ok(['high','low'].includes(p.qualityKeeper.choice));
 const side=p.diveZ;s.ball.z=-2;s.ball.vz=-8;for(let i=0;i<6;i++)updateQualityKeeper(p,s,config,dt);
 assert.equal(p.diveZ,side,'committed dive does not flick sides during flight');
});
test('keeper prediction and target stay legal in both attacking directions',()=>{
 for(const attackDir of [-1,1])for(const team of [0,1]){
  const {p,s}=fixture();p.team=team;s.attackDir=attackDir;const d=attackDir*(team===0?1:-1);p.x=-d*(config.pitch.length/2-config.ai.keeperInset);
  Object.assign(s.ball,{x:p.x+d*9,vx:-d*20,lastTeam:1-team,z:1.7,vz:0});
  let target;for(let i=0;i<12;i++)target=updateQualityKeeper(p,s,config,dt);
  assert.ok(target);assert.ok(target.x*d>=-config.pitch.length/2+config.goalkeeping.areaInset);assert.ok(Math.abs(target.z)<=config.pitch.goalWidth/2-config.ai.keeperPostInset);
 }
});
test('human keeper retains manual timing; a back-pass and a ball outside the area never gain a quality catch',()=>{
 const {p,s}=fixture();s.role='keeper';s.controlled=p.id;
 assert.equal(updateQualityKeeper(p,s,config,dt),null);assert.equal(qualityKeeperCanContact(p,s,config),true);
 s.role='field';s.ball.lastTeam=p.team;assert.equal(updateQualityKeeper(p,s,config,dt),null);assert.equal(qualityKeeperCanContact(p,s,config),false);
 s.ball.lastTeam=1;for(let i=0;i<12;i++)updateQualityKeeper(p,s,config,dt);s.ball.x=0;
 assert.equal(qualityKeeperCanContact(p,s,config),false);
});
test('v3 cue uses verified asset IDs and retains native timing independently of gameplay contact',()=>{
 const {p,s}=fixture();for(let i=0;i<12;i++)updateQualityKeeper(p,s,config,dt);
 const cue=keeperMotionV3Cue(p,s,config);assert.match(cue.clip,/^keeper_dive_(low|high)$/);assert.equal(cue.nativeSave,1.1);assert.equal(cue.rootMotion,false);
 assert.equal(cue.side,'right','facing +X, positive world Z is anatomical right');
 p.hands=true;assert.equal(keeperMotionV3Cue(p,s,config).clip,'keeper_catch_two_hands');
});
