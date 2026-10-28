import {createSoccer} from './soccer.mjs?v=island-easy-city-20261027-1';
import {drillAttribute} from '../activity/soccer-roster.mjs?v=island-easy-city-20261027-1';
/** Three short, playable practices use the actual match controls and ball. */
export function createSoccerDrill(options){
 const {config:c,kind}=options;if(!Object.hasOwn(drillAttribute,kind))throw Error('Invalid practice');
 const game=createSoccer({...options,role:'field'}),s=game.getState(),drill=s.drill={kind,attempts:0,hits:0,elapsed:0,flying:0,hit:false},hx=c.pitch.length/2;let result=null;
 function setup(){
  s.phase='playing';s.phaseTime=0;s.restart=null;s.controlled=0;s.passTarget=null;s.charge=0;s.charging=false;s.chargeKind=null;s.attackDir=1;game.clearInput();
  for(const p of s.players)Object.assign(p,{x:p.team?hx-1:-hx+1,z:p.id%2?8:-8,vx:0,vz:0,recover:100,cooldown:0,kickTime:0,slideTime:0,headerTime:0,throwTime:0,diveTime:0,think:100});
  const z=c.training.targetZ[drill.attempts%c.training.targetZ.length],x=kind==='cones'?0:hx,from=kind==='cones'?-c.training.coneDistance:hx-(kind==='penalties'?c.training.penaltyDistance:c.training.shotDistance);
  Object.assign(s.players[0],{x:from,z:0,fx:1,fz:0,recover:0});Object.assign(s.players[1],{x:x+.5,z,vx:0,vz:0});
  if(kind==='penalties')Object.assign(s.players[5],{x:hx-c.ai.keeperInset,z:0,recover:0,think:0});
  Object.assign(s.ball,{x:from+c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,curve:0,owner:0,lastPlayer:0,lastTeam:0,grace:0,flight:null});
  s.practiceTarget={x,z,radius:c.training.targetRadius,cones:kind==='cones'};drill.flying=0;drill.hit=false;
 }
 setup();
 return {drainEvents:()=>game.drainEvents(),getState:()=>s,snapshot:()=>JSON.parse(JSON.stringify(s)),clearInput:()=>game.clearInput(),get result(){return result;},
  update(dt,input={}){if(result||!Number.isFinite(dt)||dt<=0)return s;const step=Math.min(dt,c.rules.maxUpdateSeconds);drill.elapsed+=step;
   game.update(step,input);
   if(!drill.flying&&s.ball.owner!==0)drill.flying=Number.EPSILON;
   if(drill.flying){drill.flying+=step;const target=s.practiceTarget;if(Math.abs(s.ball.x-target.x)<target.radius&&Math.abs(s.ball.z-target.z)<target.radius)drill.hit=true;
    if(drill.flying>=c.training.attemptSeconds){drill.attempts++;drill.hits+=Number(drill.hit);if(drill.attempts>=c.training.drillAttempts)result={kind,attempts:drill.attempts,hits:drill.hits,elapsed:drill.elapsed};else setup();}
   }
   if(drill.elapsed>=c.training.drillSeconds)result={kind,attempts:drill.attempts,hits:drill.hits,elapsed:drill.elapsed};return s;
  }};
}
