import {createSoccer} from './soccer.mjs?v=island-soccer-league-20261029-1';
/** Bonus penalties after every league match (29/10/2026): the child takes
 * league.penalties.kicks shots from the spot against the rival keeper. Each goal
 * pays coinsPerGoal; the match result is already final and never changes here.
 * Same controls and ball as the match; every other player stands aside. */
export function createSoccerPenalties(options){
 const c=options.config,rule=c.league?.penalties||{kicks:3},kicks=Math.max(1,Math.round(rule.kicks)||3);
 const idleSeconds=rule.idleSeconds??7,attemptSeconds=rule.attemptSeconds??2.6;
 const game=createSoccer({...options,role:'field'}),s=game.getState(),hx=c.pitch.length/2;
 const shoot=s.shootout={attempts:0,hits:0,elapsed:0,attemptElapsed:0,flying:0,scored:false,kicks};
 // The existing HUD banner reads s.drill: show "kick/kicks · goals" there, no new text.
 s.drill={kind:'shootout',attempts:0,hits:0};
 let result=null,goalsBefore=0,autoKick=0;
 // Everyone else waits in the centre circle, standing (not in a fallen recover pose).
 const bystanders=s.players.filter(p=>p.id!==0&&p.id!==5),stand=p=>{const i=bystanders.indexOf(p);return i<0?{x:p.x,z:p.z}:{x:-.5+(i%2)*1.2,z:(i-(bystanders.length-1)/2)*1.1,fx:1,fz:0};};
 function pin(){for(const p of bystanders){const at=stand(p);p.x=at.x;p.z=at.z;p.vx=p.vz=0;p.fx=1;p.fz=0;p.request=false;}}
 function setup(){
  s.phase='playing';s.phaseTime=0;s.restart=null;s.controlled=0;s.passTarget=null;s.charge=0;s.charging=false;s.chargeKind=null;s.attackDir=1;s.practiceTarget=null;game.clearInput();
  for(const p of s.players)Object.assign(p,{...stand(p),vx:0,vz:0,recover:0,cooldown:100,kickTime:0,slideTime:0,headerTime:0,throwTime:0,diveTime:0,diveCooldown:0,hands:false,think:100});
  const spot=hx-c.pitch.penaltySpot,from=spot-c.physics.dribbleOffset;
  Object.assign(s.players[0],{x:from,z:0,fx:1,fz:0,recover:0,cooldown:0});
  Object.assign(s.players[5],{x:hx-c.ai.keeperInset,z:0,fx:-1,fz:0,recover:0,think:0,cooldown:0});
  Object.assign(s.ball,{x:spot,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0,lastPlayer:0,lastTeam:0,grace:0,flight:null,thrower:null,shot:null});
  shoot.flying=0;shoot.scored=false;shoot.attemptElapsed=0;autoKick=0;goalsBefore=s.score[0];
 }
 setup();
 function finishAttempt(){shoot.attempts++;shoot.hits+=Number(shoot.scored);s.drill.attempts=shoot.attempts;s.drill.hits=shoot.hits;if(shoot.attempts>=kicks)result={attempts:shoot.attempts,hits:shoot.hits};else setup();}
 return {drainEvents:()=>game.drainEvents(),getState:()=>s,snapshot:()=>JSON.parse(JSON.stringify(s)),clearInput:()=>game.clearInput(),renderState:()=>game.renderState?.()??s,get result(){return result;},
  update(dt,input={}){
   if(result||!Number.isFinite(dt)||dt<=0)return s;const step=Math.min(dt,c.rules.maxUpdateSeconds);shoot.elapsed+=step;shoot.attemptElapsed+=step;
   // A child who waits gets an automatic gentle shot, so the bonus never stalls.
   let feed=input;if(!shoot.flying&&shoot.attemptElapsed>=idleSeconds){autoKick++;feed={...input,kickHeld:autoKick<=3};}
   game.update(step,feed);pin();
   if(s.score[0]>goalsBefore){shoot.scored=true;goalsBefore=s.score[0];}
   if(!shoot.flying&&s.ball.owner!==0)shoot.flying=Number.EPSILON;
   if(shoot.flying){shoot.flying+=step;if(shoot.scored&&s.phase==='goal'&&shoot.flying>=Math.min(attemptSeconds,1.4))finishAttempt();else if(shoot.flying>=attemptSeconds)finishAttempt();}
   return s;
  }};
}
