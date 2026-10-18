import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {shotLift} from '../workout/island/minigames/soccer-shot.mjs';
import {inPenaltyArea} from '../workout/island/minigames/soccer-physics.mjs';
import {slideWeight} from '../workout/island/minigames/soccer-presentation.mjs';
import {bot} from '../workout/island/tests/g3c-bot.mjs';
import {separatePlayers} from '../workout/island/minigames/soccer-tactics.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer,dt=c.match.fixedStep;
const advance=(g,seconds,input={})=>{for(let i=0;i<Math.round(seconds/dt);i++)g.update(dt,input);};
function isolated(role='field',attackDir=1){
 const g=createSoccer({config:c,seed:41,role}),s=g.getState();s.attackDir=attackDir;
 for(const p of s.players)Object.assign(p,{x:p.team?14:-14,z:p.id%2?9:-9,cooldown:100,think:100,recover:100,vx:0,vz:0});
 const p=s.players[s.controlled];Object.assign(p,{x:-12*attackDir,z:0,fx:attackDir,fz:0,cooldown:0,recover:0});
 Object.assign(s.ball,{owner:p.id,x:p.x+c.physics.dribbleOffset*attackDir,y:c.physics.ballRadius,z:0,grace:100});
 return g;
}
test('G3g measured movement starts on the first fixed tick; a low speed 90 degree turn is tight',t=>{
 const g=isolated(),p=g.getState().players[0],x=p.x;g.update(dt,{moveX:1});assert.ok(p.x>x);
 advance(g,.3,{moveX:.3});let length=0,angle=0,previous={x:p.x,z:p.z};
 for(let i=0;i<60&&angle<Math.PI/2-.08;i++){g.update(dt,{moveZ:.3});length+=Math.hypot(p.x-previous.x,p.z-previous.z);angle=Math.atan2(p.vz,p.vx);previous={x:p.x,z:p.z};}
 const radius=length/angle;assert.ok(radius<.7,`${radius}m`);
 assert.ok(Math.abs(Math.hypot(g.getState().ball.x-p.x,g.getState().ball.z-p.z)-c.physics.dribbleOffset)<1e-6);
 t.diagnostic(JSON.stringify({responseSeconds:dt,turnRadiusMetres:radius,dribbleCentreMetres:c.physics.dribbleOffset}));
});
test('G3g actual shots have three increasing apex heights and a long hold can clear the crossbar',t=>{
 const heights=[];
 for(const seconds of [.1,.65,1.1]){
  const g=isolated(),s=g.getState();advance(g,seconds,{kickHeld:true});const power=s.charge/c.physics.chargeSeconds;
  g.update(dt);assert.ok(s.ball.vy>0);let peak=s.ball.y;
  for(let i=0;i<100&&s.phase==='playing'&&s.ball.owner===null;i++){g.update(dt);peak=Math.max(peak,s.ball.y);}
  heights.push(peak);assert.ok(shotLift(power,1,c)>shotLift(power,0,c));
 }
 assert.ok(heights[0]<c.aerial.minHeight);assert.ok(heights[1]>heights[0]&&heights[1]<c.pitch.goalHeight);assert.ok(heights[2]>c.pitch.goalHeight);
 for(const attackDir of [-1,1]){const g=isolated('field',attackDir),s=g.getState(),p=s.players[0];p.x=attackDir*(c.pitch.length/2-8);s.ball.x=p.x+attackDir*c.physics.dribbleOffset;advance(g,1.1,{kickHeld:true});g.update(dt);for(let i=0;i<150&&s.phase==='playing';i++)g.update(dt);assert.equal(s.restart?.type,'goalKick');assert.deepEqual(s.score,[0,0]);}
 t.diagnostic(JSON.stringify({shotApexMetres:heights}));
});
test('G3g upward aiming preserves charge height, and only an explicit backward drag can aim a short shot at own goal',()=>{
 for(const attackDir of [-1,1])for(const drag of [false,true]){
  const g=isolated('field',attackDir),s=g.getState(),p=s.players[0],aim={x:-attackDir,z:0,manual:drag,height:0};p.fx=-attackDir;
  advance(g,.1,{kickHeld:true,kickAim:aim});g.update(dt,{kickAim:aim});assert.ok(s.ball.vx*(drag?-attackDir:attackDir)>0);
 }
 const heights=[0,.8].map(height=>{const g=isolated(),s=g.getState(),kickAim={manual:true,x:1,z:0,height};advance(g,1.1,{kickHeld:true,kickAim});g.update(dt,{kickAim});return s.ball.vy;});assert.ok(heights[1]>heights[0]);
});
test('G3g sprint drains, refuses empty use, recovers slowly, and switching does not refill it',()=>{
 const g=isolated(),s=g.getState();advance(g,c.sprint.capacity/c.sprint.drainPerSecond+.1,{moveZ:1,sprintHeld:true});assert.ok(s.sprint.locked);assert.equal(s.sprint.active,false);
 const value=s.sprint.value;g.update(dt,{switchPlayer:true,sprintHeld:true,moveX:1});assert.ok(s.sprint.value<=value+1e-6);assert.equal(s.sprint.active,false);
 advance(g,c.sprint.regenDelaySeconds/2);assert.equal(s.sprint.value,0);advance(g,2);assert.ok(s.sprint.value>0&&s.sprint.value<s.sprint.capacity);
});
for(const attackDir of [-1,1])test(`G3g keeper carries within the penalty area in both axes and releases after the hold limit, direction ${attackDir}`,()=>{
 const g=isolated('keeper',attackDir),s=g.getState(),p=s.players[2];Object.assign(p,{x:-attackDir*(c.pitch.length/2-2),z:0,hands:true});s.ball.owner=p.id;
 const x=p.x;advance(g,1,{moveX:attackDir,moveZ:1});assert.ok(Math.abs(p.x-x)>.5&&p.z>.5);assert.equal(p.hands,true);
 assert.ok(inPenaltyArea(p,p,s,c)&&inPenaltyArea(p,s.ball,s,c));
 advance(g,c.goalkeeping.maxHoldSeconds-1.2,{moveX:attackDir,moveZ:1});assert.ok(inPenaltyArea(p,p,s,c)&&inPenaltyArea(p,s.ball,s,c));assert.ok(p.hands);
 advance(g,.4);assert.equal(p.hands,false);assert.equal(s.ball.owner,null);
});
test('G3g keeper aimed throw leaves both hands and retains its height',()=>{
 const g=isolated('keeper'),s=g.getState(),p=s.players[2];Object.assign(p,{x:-16,z:0,hands:true});Object.assign(s.ball,{owner:2,x:-15.6,y:c.goalkeeping.holdHeight,z:0});
 g.update(dt,{passHeld:true,passAim:{x:1,z:0,manual:true}});g.update(dt,{passAim:{x:1,z:0,manual:true}});assert.equal(p.hands,false);assert.equal(s.ball.owner,null);assert.ok(s.ball.y>c.physics.ballRadius);assert.ok(p.throwTime>0);
});
for(const seed of [1,9,41])test(`G3g every field player is active and teammates stay apart for 30 seconds, seed ${seed}`,t=>{
 const g=createSoccer({config:c,seed,difficulty:'normal'}),s=g.getState(),travel=s.players.map(()=>0),previous=s.players.map(p=>({...p})),overlaps=new Map();let playing=0,maxOverlap=0,width=0,samples=0;
 for(let i=0;i<Math.round(30/dt);i++){
  const active=s.phase==='playing';g.update(dt,bot(g,c));
  if(active&&s.phase==='playing'){
   playing+=dt;samples++;
   for(const p of s.players)travel[p.id]+=Math.hypot(p.x-previous[p.id].x,p.z-previous[p.id].z);
   for(const team of [0,1]){const fields=s.players.filter(p=>p.team===team&&p.role!=='keeper');width+=Math.max(...fields.map(p=>p.z))-Math.min(...fields.map(p=>p.z));}
   for(let a=0;a<s.players.length;a++)for(let b=a+1;b<s.players.length;b++)if(s.players[a].team===s.players[b].team){const key=a+':'+b,d=Math.hypot(s.players[a].x-s.players[b].x,s.players[a].z-s.players[b].z),time=d<c.tactics.teammateDistance-.01?(overlaps.get(key)||0)+dt:0;overlaps.set(key,time);maxOverlap=Math.max(maxOverlap,time);}
  }
  for(const p of s.players)previous[p.id]={...p};
 }
 const fields=s.players.filter(p=>p.role!=='keeper').map(p=>({id:p.id,metres:travel[p.id],speed:travel[p.id]/playing}));
 assert.ok(fields.every(p=>p.metres>=c.tactics.minTravel30Seconds&&p.speed>=c.tactics.minAverageSpeed),JSON.stringify(fields));
 assert.ok(maxOverlap<=c.tactics.maxOverlapSeconds,`${maxOverlap}s`);assert.ok(width/(samples*2)>=c.tactics.minTeamWidth,`${width/(samples*2)}m`);
 t.diagnostic(JSON.stringify({seed,fields,maxOverlapSeconds:maxOverlap,averageTeamWidth:width/(samples*2)}));
});
test('G3g nearest-player switching clears charge and automatic switching has a settling interval',()=>{
 const g=isolated(),s=g.getState();Object.assign(s.players[1],{x:0,z:1,recover:0});Object.assign(s.ball,{owner:3,x:0,z:0});s.charging=true;s.charge=.5;g.update(dt,{switchPlayer:true});assert.equal(s.controlled,1);assert.equal(s.charging,false);assert.ok(s.switchCooldown>0);
});
test('G3g exactly coincident teammates separate, including around a recovering player',()=>{
 for(const recovery of [0,c.slide.recoverSeconds]){const g=isolated(),s=g.getState(),a=s.players[0],b=s.players[1];Object.assign(a,{x:0,z:0,recover:recovery});Object.assign(b,{x:0,z:0,recover:0});separatePlayers(s,c);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=c.tactics.teammateDistance-1e-6);if(recovery)assert.equal(a.x,0);}
});
test('G3g slide transitions through descent, extension, glide and recovery without a pose jump',()=>{
 const p={slideTime:c.slide.seconds,recover:0},weights=[0,.2,.45,.8].map(u=>{p.slideTime=c.slide.seconds*(1-u);return slideWeight(p,c);});assert.ok(weights[0]<weights[1]&&weights[1]<weights[2]);assert.equal(weights[2],weights[3]);p.slideTime=0;p.recover=c.slide.recoverSeconds/2;assert.equal(slideWeight(p,c),.5);
});
test('G3g a successful slide also rises through recovery before running again',()=>{
 const g=isolated(),s=g.getState(),p=s.players[0];Object.assign(p,{slideTime:dt,slideWon:true,slideAttempted:true,slideX:1,slideZ:0});g.update(dt);assert.ok(p.recover>0);const x=p.x;g.update(dt,{moveX:1});assert.equal(p.x,x);
});
test('G3g unchanged bot wins at least 7/10 easy stage one and easy >= normal >= hard',t=>{
 const wins=[];for(const difficulty of ['easy','normal','hard']){let n=0;for(let seed=1;seed<=10;seed++){const g=createSoccer({config:c,seed,difficulty});for(let i=0;i<24000&&!g.result;i++)g.update(dt,bot(g,c));assert.ok(g.result);n+=Number(g.result.won);}wins.push(n);}
 assert.ok(wins[0]>=7&&wins[0]>=wins[1]&&wins[1]>=wins[2],JSON.stringify(wins));t.diagnostic(JSON.stringify({stage:1,seeds:10,wins}));
});
