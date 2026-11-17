/** Read-only reproduction, PR #461 / merge 43b27dc. Run from any directory:
 * node workout/island/design/external-review-v241/repro/soccer-air-choice-override.mjs
 * The production loft solver/integrator feeds the production match model.
 * Setting up a reachable incoming pass is the only state injection. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer as shippedCreateSoccer} from '../../../minigames/soccer.mjs';
import {expandSoccerConfig} from '../../../minigames/soccer-squad.mjs';
import {applySoccerFull} from '../../../minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../../../minigames/soccer-v23.mjs';
import {createLoftFlight,stepLoftBall} from '../../../minigames/soccer-loft.mjs';

const base=JSON.parse(readFileSync(new URL('../../../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const config=applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241:true}))),'v23');
const dt=config.match.fixedStep;
let createSoccer=shippedCreateSoccer;
// Optional proposed-fix experiment in memory only. No source file is changed.
// It tests both required priorities: explicit aerial contact over auto-header,
// and explicit aerial tracking over the ordinary pass receiver's landing run.
if(process.argv.includes('--simulate-fix')){
  const own=new URL('../../../minigames/soccer.mjs',import.meta.url);
  let source=readFileSync(own,'utf8').replace(/from\s+(['"])(\.[^'"]+)\1/g,(_m,q,p)=>'from '+q+new URL(p,own).href+q);
  source=source.replace('if(receivingCross){','if(receivingCross&&!(airChoice&&s.headerArm?.player===p.id&&s.headerArm.kind&&s.headerArm.kind!==\'header\')){')
    .replaceAll('s.passTarget?.player===member.id&&','s.passTarget?.player===member.id&&!s.headerArm&&');
  ({createSoccer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
}
function run({duration,receiverMarker}){
  const game=createSoccer({config,seed:5,stage:4,v241:true,airVersion:'v23'}),s=game.getState();
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
  assert.ok(offered?.alt,'the real model offers the alternative');
  const selected=offered.alt;
  game.update(dt,{airAlt:true});
  assert.equal(s.headerArm?.kind,selected,'the selected alternative really armed');
  let observed;
  for(let i=0;i<120&&!observed;i++){
    game.update(dt,{});
    observed=game.drainEvents().find(e=>['shot','header','possession'].includes(e.type)&&e.player===me.id);
  }
  return {duration,receiverMarker,offered:[offered.primary,offered.alt],selected,observed};
}
const cases=[];
for(const duration of [1.15,1.4])for(const receiverMarker of [false,true])cases.push(run({duration,receiverMarker}));
console.log(JSON.stringify(cases,null,2));
for(const c of cases.filter(c=>!c.receiverMarker))assert.equal(c.observed?.aerial,c.selected,'without an intended-receiver marker the chosen kick works');
// This fails in the merge: both real intended crosses produce a header instead.
for(const c of cases.filter(c=>c.receiverMarker))assert.equal(c.observed?.aerial,c.selected,'the intended cross must obey the child\'s aerial choice');
