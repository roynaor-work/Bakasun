import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {resolveSoccerAI} from '../workout/island/minigames/soccer-ai-flag.mjs';
import {aiPassLaneOpen,rivalPassBudget} from '../workout/island/minigames/soccer-teamplay.mjs';
import {autoSwitchDwell} from '../workout/island/minigames/soccer-assistance.mjs';

const config=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;

test('soccerAI flag: option beats URL beats default v2',()=>{
  const had=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    delete globalThis.location;
    assert.equal(resolveSoccerAI(),'v2');
    assert.equal(resolveSoccerAI('v1'),'v1');
    assert.equal(resolveSoccerAI('nonsense'),'v2');
    globalThis.location={search:'?x=1&soccerAI=v1'};
    assert.equal(resolveSoccerAI(),'v1');
    assert.equal(resolveSoccerAI('v2'),'v2');
    globalThis.location={search:'?soccerAI=banana'};
    assert.equal(resolveSoccerAI(),'v2');
  }finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}
});

// Digests of four scripted-input matches produced by the model on main (before gameplay-1):
// score, ticks, event count and a position checksum. `v1` must reproduce them exactly.
const MAIN_DIGESTS=[
  '1,2,normal,3-3,11955,446,47.7558','2,5,normal,0-2,12213,441,3.1701','3,8,hard,0-10,12963,485,30.0076','4,5,easy,0-0,13001,459,96.1786'
];
function digest(opt){
  const out=[];
  for(const [seed,stage,difficulty] of [[1,2,'normal'],[2,5,'normal'],[3,8,'hard'],[4,5,'easy']]){
    const g=createSoccer({config,seed,stage,difficulty,role:'field',...opt});let n=(seed*7919)>>>0;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
    let mx=0,mz=0,ticks=0,ev=0;
    while(!g.result&&ticks<30000){if(ticks%20===0){const a=rnd()*6.283;mx=Math.cos(a);mz=Math.sin(a);}
      g.update(1/60,{moveX:mx,moveZ:mz,kickHeld:rnd()<.05,passHeld:false,passPressed:rnd()<.04,sprintHeld:rnd()<.3,switchPlayer:rnd()<.02});ticks++;ev+=g.drainEvents().length;}
    const s=g.getState();let h=0;for(const p of s.players)h+=p.x*1.3+p.z*1.7+p.vx*.3;
    out.push([seed,stage,difficulty,s.score.join('-'),ticks,ev,+(s.ball.x+s.ball.z+h).toFixed(4)].join(','));
  }
  return out;
}
test('aiVersion v1 reproduces the pre-gameplay-1 model exactly; v2 differs',()=>{
  assert.deepEqual(digest({aiVersion:'v1'}),MAIN_DIGESTS);
  assert.notDeepEqual(digest({aiVersion:'v2'}),MAIN_DIGESTS);
});

test('rival pass budget: v1 one pass per possession, v2 builds up (default 3, configurable, never below 1)',()=>{
  assert.equal(rivalPassBudget({},false),1);
  assert.equal(rivalPassBudget({rivalBuildPasses:5},false),1);
  assert.equal(rivalPassBudget({},true),3);
  assert.equal(rivalPassBudget({rivalBuildPasses:5},true),5);
  assert.equal(rivalPassBudget({rivalBuildPasses:0},true),1);
  assert.equal(rivalPassBudget({rivalBuildPasses:Number.NaN},true),3);
});

test('aiPassLaneOpen: a rival standing in the corridor closes it; keepers, recovering players and the receiver side do not',()=>{
  const carrier={id:0,team:1,role:'striker',x:0,z:0,vx:0,vz:0},mate={id:1,team:1,role:'support',x:10,z:0,vx:0,vz:0};
  const rival=(x,z,extra={})=>({id:9,team:0,role:'wing',x,z,vx:0,vz:0,...extra});
  const ball={x:0,z:0};
  const lane=(...others)=>aiPassLaneOpen(carrier,mate,[carrier,mate,...others],ball,config);
  assert.equal(lane(),true);
  assert.equal(lane(rival(5,0.2)),false,'on the line');
  assert.equal(lane(rival(5,3)),true,'3 m wide of the line');
  assert.equal(lane(rival(5,0.2,{role:'keeper'})),true,'keepers are ignored');
  assert.equal(lane(rival(5,0.2,{recover:1})),true,'a recovering rival cannot intercept');
  assert.equal(lane(rival(-6,0)),true,'behind the passer');
  assert.equal(aiPassLaneOpen(carrier,mate,[carrier,mate,rival(5,0.2)],ball,{...config,ai:{...config.ai,passLaneClearance:0}}),true,'switched off');
  // A rival that runs across the corridor during the pass is seen, one running away is not.
  assert.equal(lane(rival(5,1.6)),true,'standing 1.6 m off the line');
  assert.equal(lane(rival(5,1.6,{vz:-4})),false,'the same rival running into the lane');
  assert.equal(lane(rival(5,1.2,{vz:4})),true,'running out of the lane');
});

test('autoSwitchDwell: clearly closer team-mates take over sooner, a player just left always waits the full time',()=>{
  const c={autoSwitchSeconds:0.5,ai:{}};
  assert.equal(autoSwitchDwell(c,0.1),0.5);
  assert.equal(autoSwitchDwell(c,2.5),0.375);
  assert.equal(autoSwitchDwell(c,3.4),0.25);
  assert.equal(autoSwitchDwell(c,5,true),0.5,'switching straight back waits');
  assert.equal(autoSwitchDwell({...c,ai:{switchFast:[]}},9),0.5,'table can be emptied');
  assert.equal(autoSwitchDwell({...c,ai:{switchFast:[[1,0.01]]}},2),0.1,'factor is bounded at 0.2');
  assert.ok(autoSwitchDwell(c,3.4)<autoSwitchDwell(c,2.5)&&autoSwitchDwell(c,2.5)<autoSwitchDwell(c,1));
});

// A rival holds the ball; team-0 player A (selected) is far, B is 4 m closer. Everyone else is frozen.
function switchTime(aiVersion){
  const game=createSoccer({config,seed:11,stage:5,difficulty:'normal',role:'field',aiVersion}),s=game.getState();
  game.clearInput();s.attackDir=1;s.phase='playing';s.switchCooldown=0;s.passTarget=null;
  for(const p of s.players)Object.assign(p,{x:p.team===0?-20:20,z:(p.id%5-2)*3,vx:0,vz:0,recover:1e9,cooldown:0,slideTime:0,hands:false});
  const holder=s.players.find(p=>p.team===1&&p.role!=='keeper'),a=s.players.find(p=>p.team===0&&p.role==='striker'),b=s.players.find(p=>p.team===0&&p.role==='support');
  Object.assign(holder,{x:0,z:0,recover:1e9});Object.assign(a,{x:-14,z:0,recover:0});Object.assign(b,{x:-4,z:0,recover:0});
  s.controlled=a.id;
  Object.assign(s.ball,{owner:holder.id,x:0,z:0,y:config.physics.ballRadius,vx:0,vz:0,vy:0,grace:100,lastTeam:1,lastPlayer:holder.id,flight:null,shot:null,thrower:null});
  for(let i=0;i<120;i++){
    for(const p of s.players)if(p.recover>1e8){p.vx=p.vz=0;}
    Object.assign(a,{x:-14,z:0,vx:0,vz:0});Object.assign(b,{x:-4,z:0,vx:0,vz:0});Object.assign(holder,{x:0,z:0});Object.assign(s.ball,{x:0,z:0,owner:holder.id,grace:100});
    game.update(1/60,{});
    if(s.controlled===b.id)return (i+1)/60;
  }
  return Infinity;
}
test('model: a clearly closer team-mate takes control sooner in v2 than in v1',()=>{
  const v1=switchTime('v1'),v2=switchTime('v2');
  assert.ok(Number.isFinite(v1)&&Number.isFinite(v2),`both versions switch (${v1}, ${v2})`);
  assert.ok(v2<=v1-0.15,`v2 ${v2}s should beat v1 ${v1}s by at least 0.15 s`);
  assert.ok(v1>=0.45&&v1<=0.8,`v1 keeps the 0.5 s dwell (${v1})`);
});
