import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.REVIEW_FIX_ROOT||process.cwd());
const load=name=>import(pathToFileURL(resolve(root,'workout/island/minigames',name)).href);
const {createSoccer}=await load('soccer.mjs');
const {expandSoccerConfig}=await load('soccer-squad.mjs');
const {applySoccerFull}=await load('soccer-full.mjs');
const {applySoccerPitchV23,applySoccerControlV23}=await load('soccer-v23.mjs');
const {createLoftFlight,stepLoftBall}=await load('soccer-loft.mjs');
const base=JSON.parse(readFileSync(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;

function cross({duration,receiverMarker=true,v241=true,input='alternative',search}){
  if(typeof search==='string')globalThis.location={search};else delete globalThis.location;
  const config=applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241}))),'v23');
  const game=createSoccer({config,seed:5,stage:4,v241,airVersion:'v23'}),s=game.getState(),dt=config.match.fixedStep;
  for(let i=0;i<5;i++)game.update(dt,{});
  const me=s.players[s.controlled];
  Object.assign(me,{x:42,z:0,vx:0,vz:0,cooldown:0,recover:0,slideTime:0});
  for(const p of s.players)if(p!==me){p.x=-20;p.z=p.id*2-20;p.cooldown=20;}
  const ball={x:30,z:3,y:config.physics.ballRadius,owner:null,thrower:null,shot:null,lastTeam:0,lastPlayer:1,grace:0};
  Object.assign(ball,createLoftFlight(ball,{x:42.5,z:.2},config,.5,{durationSeconds:duration}));
  for(let i=0;i<12;i++)stepLoftBall(ball,dt,config);
  Object.assign(s.ball,ball);
  if(receiverMarker)s.passTarget={player:me.id,x:42.5,z:.2,time:3,kind:'loft'};
  game.update(dt,{});game.drainEvents();
  const offered=s.airOptions;
  if(v241&&input==='alternative'){
    assert.ok(offered?.alt,'the production solver offers an alternative');
    game.update(dt,{airAlt:true});
    assert.equal(s.headerArm?.kind,offered.alt,'semantic alternate input arms the offered action');
  }else if(input==='primary')game.update(dt,{kickHeld:true});
  let observed;
  for(let i=0;i<120&&!observed;i++){
    game.update(dt,{});
    observed=game.drainEvents().find(e=>['shot','header','possession'].includes(e.type)&&e.player===me.id);
  }
  return {selected:offered?.alt,offered,observed,position:{x:me.x,z:me.z}};
}
for(const [duration,kind] of [[1.15,'volley'],[1.4,'scissor']]){
  test(`V241-005: intended penalty-area cross obeys explicit ${kind}`,()=>{
    const marked=cross({duration}),unmarked=cross({duration,receiverMarker:false});
    assert.equal(marked.selected,kind);
    assert.equal(unmarked.observed?.aerial,kind,'control case without the pass-target assistance');
    assert.equal(marked.observed?.type,'shot','explicit foot contact must survive automatic reception');
    assert.equal(marked.observed?.aerial,kind,'the selected action has priority over auto-header and receiver tracking');
  });
}
test('V241-005: an unarmed intended cross still receives automatic heading assistance',()=>{
  const c=cross({duration:1.15,input:'none'});
  assert.equal(c.observed?.type,'header');
});
test('V241-005: soccerV241 rollback keeps legacy high-ball behavior',()=>{
  const c=cross({duration:1.15,v241:false,input:'primary'});
  assert.equal(c.offered,null);
  assert.equal(c.observed?.type,'header');
});
for(const search of ['?soccerAirChoice=0','?soccerV241=0'])test('V241-005: URL rollback '+search+' restores automatic heading',()=>{
  const c=cross({duration:1.15,v241:null,input:'primary',search});
  assert.equal(c.offered,null);assert.equal(c.observed?.type,'header');
});
