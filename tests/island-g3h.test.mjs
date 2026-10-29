import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {soccerAudioCues,createG3hAudio,G3H_AUDIO_FILES} from '../workout/island/minigames/g3h-audio.mjs';
const root=new URL('../workout/island/',import.meta.url),c=JSON.parse(await readFile(new URL('data/config.json',root))).minigames.soccer,dt=c.match.fixedStep;
// Wall time includes every stoppage: no controller, forced turnovers or resets.
// Early opponents can threaten by carrying or passing into the area. A shot-only
// quota rejected those attacks; possession alone would also accept sterile play.
for(const difficulty of ['easy','normal','hard'])for(const stage of [1,5,10])test(`G3h ${difficulty} stage ${stage}: rival builds and threatens in 90 seconds without input`,t=>{
 const rows=[];
 for(let seed=1;seed<=20;seed++){
  const game=createSoccer({config:c,seed,stage,difficulty}),s=game.getState();let shots=0,passes=0,goals=0,metres=0,progressivePassMetres=0,possessionSeconds=0,attackHalfSeconds=0,finalThirdSeconds=0,boxEntries=0,longestHold=0,wasInBox=false,passStart=null;
  for(let tick=0;tick<90/dt;tick++){
   const owner=s.ball.owner===null?null:s.players[s.ball.owner],before=owner?.x,passInFlight=passStart&&s.ball.owner===null&&s.ball.lastTeam===1,ballX=s.ball.x,attackDir=s.attackDir;game.update(dt);
   // Count the ball's actual travel, including a pass that scores or is stopped.
   // Restart placement and halftime changes never contribute to progression.
   if(passInFlight&&s.attackDir===attackDir&&(s.phase==='playing'||s.phase==='goal')&&s.ball.lastTeam===1)progressivePassMetres+=Math.max(0,(s.ball.x-ballX)*-attackDir);
   if(s.ball.owner!==null||s.ball.lastTeam!==1)passStart=null;
   for(const e of game.drainEvents())if(e.team===1){if(e.type==='shot'){shots++;passStart=null;}if(e.type==='pass'){passes++;passStart=true;}if(e.type==='goal')goals++;}
   if(s.phase!=='playing'){wasInBox=false;passStart=null;continue;}
   if(owner?.team===1&&s.ball.owner===owner.id)metres+=Math.max(0,(owner.x-before)*-s.attackDir);
   const carrier=s.ball.owner===null?null:s.players[s.ball.owner],rivalBall=carrier?.team===1||!carrier&&s.ball.lastTeam===1,progress=-s.attackDir*s.ball.x;
   if(carrier?.team===1){possessionSeconds+=dt;longestHold=Math.max(longestHold,carrier.hold);}
   if(rivalBall&&progress>0)attackHalfSeconds+=dt;
   if(rivalBall&&progress>c.pitch.length/6)finalThirdSeconds+=dt;
   const inBox=rivalBall&&progress>c.pitch.length/2-c.pitch.penaltyDepth&&Math.abs(s.ball.z)<c.pitch.penaltyWidth/2;
   if(inBox&&!wasInBox)boxEntries++;wasInBox=inBox;
  }
  const minimumShots=stage>=5?2:0,row={seed,shots,passes,goals,boxEntries,metres,progressivePassMetres,possessionSeconds,attackHalfSeconds,finalThirdSeconds,longestHold},detail=JSON.stringify({difficulty,stage,...row});
  assert.ok(passes>0,`must build with a pass: ${detail}`);assert.ok(metres+progressivePassMetres>5,`must progress with carries or physical pass travel: ${detail}`);
  assert.ok(possessionSeconds>=2,`must establish possession: ${detail}`);assert.ok(attackHalfSeconds>=.5,`must progress beyond own half: ${detail}`);
  if(stage>1||difficulty!=='easy')assert.ok(boxEntries+shots+goals>0,`must reach the area or threaten goal: ${detail}`);
  assert.ok(shots>=minimumShots,`stage ${stage} needs ${minimumShots} shots: ${detail}`);
  assert.ok(longestHold<12,`must not stall on the ball: ${detail}`);rows.push(row);
 }
 // An introductory opponent may lose individual transitions to the idle help.
 // It must still create danger consistently across the unchanged 20-seed cohort.
 const threateningSeeds=rows.filter(r=>r.finalThirdSeconds>=.5||r.boxEntries+r.shots+r.goals>0).length;
 assert.ok(threateningSeeds>=Math.ceil(rows.length*.8),JSON.stringify({difficulty,stage,threateningSeeds,seeds:rows.length}));
 t.diagnostic(JSON.stringify({difficulty,stage,minimumShots:Math.min(...rows.map(r=>r.shots)),threateningSeeds,rows}));
});
test('G3h a goal and every out-of-play restart emit a referee whistle; a goal also cheers',()=>{
 for(const kind of ['goal','throwIn','corner','goalKick']){
  const game=createSoccer({config:c}),s=game.getState();for(const p of s.players)p.recover=100;
  Object.assign(s.ball,{owner:null,x:kind==='throwIn'?0:c.pitch.length/2-.05,z:kind==='goal'?0:kind==='throwIn'?c.pitch.width/2-.05:6,y:c.physics.ballRadius,vx:kind==='throwIn'?0:30,vz:kind==='throwIn'?30:0,vy:0,lastTeam:kind==='corner'?1:0,grace:100});
  game.update(dt);const event=game.drainEvents().find(e=>e.type===(kind==='goal'?'goal':'restart'));assert.ok(event,kind);if(kind!=='goal')assert.equal(event.restart,kind);
  assert.ok(soccerAudioCues(event).includes('whistle'));if(kind==='goal')assert.ok(soccerAudioCues(event).includes('cheer'));
 }
 assert.deepEqual(soccerAudioCues({type:'fulltime'}),['whistle','whistle','whistle']);
});
test('G3h event delivery preserves a shot even when the same update immediately reports possession',()=>{
 const game=createSoccer({config:c}),s=game.getState();s.players[0].cooldown=0;s.players[3].x=2;s.players[3].z=0;game.update(.2,{kickHeld:true});game.update(.2);assert.ok(game.drainEvents().some(e=>e.type==='shot'));assert.deepEqual(game.drainEvents(),[]);
});
test('G3h an unattended home restart resumes; an early human pass still releases immediately',()=>{
 for(const pressed of [false,true]){const game=createSoccer({config:c}),s=game.getState();Object.assign(s.ball,{owner:null,x:0,z:c.pitch.width/2-.05,vx:0,vz:30,lastTeam:1,grace:100});game.update(dt);for(let i=0;i<Math.ceil((c.match.restartSeconds+c.restarts.idleReleaseSeconds+.2)/dt)&&s.phase!=='playing';i++)game.update(dt,pressed?{passPressed:true}:{});assert.equal(s.phase,'playing');}
});
test('G3h soccer delegates its single pause element and glyph to the shell',async()=>{
 const session=await readFile(new URL('minigames/soccer-session.mjs',root),'utf8'),css=await readFile(new URL('minigames/g3h-soccer.css',root),'utf8'),host=await readFile(new URL('ui/activity.mjs',root),'utf8');
 assert.equal((host.match(/pause=button\([^\n]*?'game-pause'/g)||[]).length,1);assert.doesNotMatch(session,/element\([^\n]*(?:game-pause|pause-button)|actionIcon\('pause'\)/);assert.match(css,/game-pause::before\s*\{\s*content:'';/);assert.doesNotMatch(css,/content:\s*['"](?:Ⅱ|❚❚|⏸)/);assert.match(session,/g3h-soccer\.css\?v=island-soccer-athlete-20261029-1/);
});
test('G3h movement eases up/down, turns the body ahead of momentum and keeps the dribble within a footstep',()=>{
 const game=createSoccer({config:c}),s=game.getState(),p=s.players[0];for(const other of s.players)if(other!==p)other.recover=100;s.ball.grace=100;
 const touchSpeed=c.assistance.dribble.maxCorrectionSpeed,releaseDistance=c.assistance.dribble.releaseDistance;
 const move=input=>{const before={x:s.ball.x,z:s.ball.z};game.update(dt,input);assert.equal(s.ball.owner,p.id);assert.ok(Math.hypot(s.ball.x-p.x,s.ball.z-p.z)<=releaseDistance);assert.ok(Math.hypot(s.ball.x-before.x,s.ball.z-before.z)<=(Math.hypot(p.vx,p.vz)+touchSpeed)*dt+1e-8,'a touch must travel physically');};
 let previous=0;for(let i=0;i<15;i++){move({moveX:1});assert.ok(p.vx>previous);previous=p.vx;}
 move({moveZ:1});assert.ok(Math.atan2(p.fz,p.fx)>Math.atan2(p.vz,p.vx));
 const footError=()=>Math.hypot(s.ball.x-p.x-p.fx*c.physics.dribbleOffset,s.ball.z-p.z-p.fz*c.physics.dribbleOffset),turnError=footError();
 assert.ok(turnError>.001,'a sharp turn must leave a short physical touch rather than attach the ball instantly');
 const speed=Math.hypot(p.vx,p.vz);move();assert.ok(Math.hypot(p.vx,p.vz)<speed&&Math.hypot(p.vx,p.vz)>0);
 for(let i=0;i<60;i++)move();assert.ok(footError()<.02&&footError()<turnError,'the touch must settle at the stationary foot');
});
test('G3h the CC0 bank is local, versioned OGG under 400 KB and the shared mute key suppresses playback',async()=>{
 let bytes=0;for(const url of Object.values(G3H_AUDIO_FILES)){const u=new URL(url);assert.equal(u.searchParams.get('v'),'island-soccer-athlete-20261029-1');assert.match(u.pathname,/assets\/audio\/g3h\/.*\.ogg$/);u.search='';bytes+=(await stat(u)).size;}assert.ok(bytes<=400000,bytes);
 let muted='off';const audio=createG3hAudio({storage:{getItem:key=>{assert.equal(key,'island.sound');return muted;}},AudioContext:null});audio.play('kick');assert.deepEqual(audio.snapshot.counts,{});muted='on';audio.event({type:'goal'});assert.deepEqual(audio.snapshot.counts,{whistle:1,net:1,cheer:1});audio.setPaused(true);audio.play('pass');assert.equal(audio.snapshot.counts.pass,undefined);audio.dispose();assert.equal(audio.snapshot.disposed,true);
});
