/** 13/11/2026 fire v23, part A: water at targets. The engine stands still; one thumb aims (anywhere on the street, or a tap on a target),
 * the other holds the hose button. A pressure gauge empties while spraying and fills while resting; under a third of a tank the jet
 * sags and falls short. Wind pushes the jet sideways. Points for every hit, nothing is ever taken away, and the stage ends when every
 * target is done. Pure and deterministic: scene px of street.webp, no DOM. */
import {streetAnchor,crewNozzle} from './fire-v23-assets.mjs?v=island-v2-20261107-11';

export const TARGET_TUNING=Object.freeze({
  drain:.2,refill:.34,restart:.32,          // pressure per second; an empty tank waits for `restart` before it sprays again
  speed:1050,gravity:640,                  // jet speed at full pressure (px/s) and the drop it is aimed against
  sag:.3,                                  // low-pressure fall-off: share of the distance the jet drops at an empty tank
  splash:30,                               // jet radius at the target
  cool:.62,                                // heat per second at full power on a fire target
  push:.9,                                 // push per second on a can
  clear:.7,                                // density per second on smoke
  fall:1400,                               // can fall acceleration (px/s²)
  ground:792,                              // where knocked cans land (scene y)
  points:{window:60,roof:90,can:50,smoke:40,fireball:100},
  hitPoints:20,                            // per second of water on a target
  assist:40,                               // px the jet bends onto a near target (stage `assist` overrides)
});
const SIZE={window:{r:44,heat:1},roof:{r:70,heat:1.6},can:{r:24},smoke:{r:70},fireball:{r:56,heat:.9}};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

/** The target list of a stage with scene positions. */
export function resolveTargets(stage,anchor=streetAnchor){
  return stage.targets.map((t,i)=>{const at=anchor(t.at);if(!at)throw new RangeError('Unknown fire target anchor '+t.at);
    const size=SIZE[t.kind];if(!size)throw new RangeError('Unknown fire target kind '+t.kind);
    const r=t.kind==='window'?Math.max(size.r,Math.min(at.w,at.h)*.62):size.r;
    return {id:i,kind:t.kind,at:t.at,baseX:at.x,baseY:t.kind==='can'?at.y-20:t.kind==='roof'?at.y-14:at.y,x:at.x,y:at.y,r,move:t.move||null,covers:Number.isInteger(t.covers)?t.covers:null,
      heat:size.heat??0,maxHeat:size.heat??0,density:t.kind==='smoke'?1:0,push:0,fall:null,done:false,doneAt:null,lastHit:-10,hitTime:0};});
}
/** Where the jet lands for an aim point: the wind carries it sideways over its flight time, low pressure makes it sag below the aim. */
export function jetImpact(nozzle,aim,pressure,wind,tuning=TARGET_TUNING){
  const dx=aim.x-nozzle.x,dy=aim.y-nozzle.y,d=Math.hypot(dx,dy),p=clamp(pressure),speed=tuning.speed*(.55+.45*p),t=d/Math.max(1,speed);
  const sag=Math.pow(Math.max(0,1-p/.75),1.5)*tuning.sag*d;
  return {x:aim.x+.5*wind*t*t,y:aim.y+sag,flight:t,distance:d};
}
/** The jet's path for drawing: a ballistic arc from the nozzle through the impact point (n points, scene px). */
export function jetArc(nozzle,impact,n=16,lift=.22){
  const out=[];const dx=impact.x-nozzle.x,dy=impact.y-nozzle.y,d=Math.hypot(dx,dy),peak=d*lift;
  for(let i=0;i<=n;i++){const u=i/n;out.push({x:nozzle.x+dx*u,y:nozzle.y+dy*u-peak*4*u*(1-u)});}
  return out;
}
/** Which of the five firefighter sprites (0 aims right, 4 aims left) points closest to the aim. */
export function crewFor(aim,nozzles){const mid=nozzles[2];if(!mid)return 2;const dx=aim.x-mid.x;return dx>420?0:dx>140?1:dx>-140?2:dx>-420?3:4;}

export function createTargetsModel({stage,random=Math.random,sound=()=>{},tuning=TARGET_TUNING,anchor=streetAnchor,nozzle:nozzleFor=crewNozzle}){
  const targets=resolveTargets(stage,anchor),nozzles=[0,1,2,3,4].map(i=>nozzleFor(i)),aim={x:targets[0].x,y:targets[0].y},impact={x:aim.x,y:aim.y};
  let time=0,pressure=1,empty=false,spraying=false,score=0,scoreAcc=0,sprayTime=0,onTargetTime=0,result=null,crew=2,hitTarget=null,finishedAt=null,wind=stage.wind||0;
  const popups=[],events=[];
  function covered(t){return targets.some(o=>o.kind==='smoke'&&!o.done&&o.covers===t.id);}
  function hittable(t){return !t.done&&!(t.kind==='can'&&t.fall)&&!covered(t);}
  function finish(t,kind){t.done=true;t.doneAt=time;const pts=tuning.points[kind];score+=pts;popups.push({x:t.x,y:t.y-30,text:'+'+pts,at:time});events.push({kind,at:time,id:t.id});sound(kind==='can'?'clank':kind==='smoke'?'steam':kind==='fireball'?'pop':'steam');}
  const model={stage,targets,aim,impact,popups,events,tuning,nozzles,
    get time(){return time;},get pressure(){return pressure;},get empty(){return empty;},get spraying(){return spraying;},get score(){return score;},get wind(){return wind;},get crew(){return crew;},
    get nozzle(){return nozzles[crew]||nozzles[2];},get hitTarget(){return hitTarget;},get result(){return result;},
    get remaining(){return targets.filter(t=>!t.done).length;},get total(){return targets.length;},
    get accuracy(){return sprayTime>0?onTargetTime/sprayTime:0;},
    /** The nearest target the jet can act on, for a tap that should aim at it. */
    targetAt(x,y,reach=1.6){let best=null,dist=Infinity;for(const t of targets){if(!hittable(t)&&!(t.kind==='smoke'&&!t.done))continue;const d=Math.hypot(t.x-x,t.y-y);if(d<=t.r*reach&&d<dist){dist=d;best=t;}}return best;},
    update(dt,input={}){
      if(result||dt<=0)return;dt=Math.min(dt,.1);time+=dt;
      if(Number.isFinite(input.aimX)&&Number.isFinite(input.aimY)){aim.x=clamp(input.aimX,0,2000);aim.y=clamp(input.aimY,0,900);}
      wind=(stage.wind||0)+(stage.gust||0)*Math.sin(time*.45+.7)*Math.sin(time*.17+1.3);
      // pressure: drains while spraying, refills while resting, an empty tank waits for `restart`
      const firing=Boolean(input.firing);
      if(firing&&!empty){pressure=Math.max(0,pressure-tuning.drain*dt);if(pressure===0){empty=true;sound('timeout');}}
      else{pressure=Math.min(1,pressure+tuning.refill*dt);if(empty&&pressure>=tuning.restart)empty=false;}
      spraying=firing&&!empty;
      crew=crewFor(aim,nozzles);const n=nozzles[crew]||nozzles[2];
      const land=jetImpact(n,aim,pressure,wind,tuning);impact.x=land.x;impact.y=land.y;
      // aim help for small hands: a jet that lands near a target bends the last few pixels onto it (less help on later stages)
      const help=stage.assist??tuning.assist;if(help>0){let near=null,gap=Infinity;for(const t of targets){if(!hittable(t))continue;const d=Math.hypot(t.x-impact.x,t.y-impact.y);if(d<=t.r+tuning.splash+help&&d<gap){gap=d;near=t;}}
        if(near&&gap>near.r*.5){const pull=Math.min(help,gap-near.r*.5)/gap;impact.x+=(near.x-impact.x)*pull;impact.y+=(near.y-impact.y)*pull;}}
      for(const t of targets){if(t.move&&!t.done){const m=t.move;t.x=t.baseX+m.ax*Math.sin(time*m.wx+(m.phase||0));t.y=t.baseY+m.ay*Math.sin(time*(m.wy||0)+(m.phase||0)*.7);}
        if(t.kind==='can'&&t.fall&&!t.fall.landed){t.fall.vy+=tuning.fall*dt;t.x+=t.fall.vx*dt;t.y=Math.min(tuning.ground,t.y+t.fall.vy*dt);t.fall.spin+=t.fall.vx*.012*dt;if(t.y>=tuning.ground){t.fall.landed=true;if(!t.done)finish(t,'can');}}}
      hitTarget=null;
      if(spraying){
        sprayTime+=dt;const power=.35+.65*Math.min(1,pressure/.6);
        // smoke in front of a window takes the water first; otherwise the closest target under the jet
        let best=null,dist=Infinity;for(const t of targets){if(!hittable(t))continue;const d=Math.hypot(t.x-impact.x,t.y-impact.y);if(d<=t.r+tuning.splash&&(d<dist||t.kind==='smoke')){if(best?.kind==='smoke'&&t.kind!=='smoke')continue;best=t;dist=d;}}
        if(best){hitTarget=best;onTargetTime+=dt;best.lastHit=time;best.hitTime+=dt;scoreAcc+=tuning.hitPoints*dt;
          const accuracy=1-Math.min(1,dist/(best.r+tuning.splash))*.35;
          if(best.kind==='can'){best.push+=tuning.push*power*accuracy*dt;if(best.push>=1){const side=impact.x<best.x?1:-1;best.fall={vx:side*160,vy:-260,spin:0};sound('clank');}}
          else if(best.kind==='smoke'){best.density=Math.max(0,best.density-tuning.clear*power*accuracy*dt);if(best.density===0)finish(best,'smoke');}
          else{best.heat=Math.max(0,best.heat-tuning.cool*power*accuracy*dt);if(best.heat===0)finish(best,best.kind);}
        }
      }
      // a fire left half cooled creeps back, slowly (stages 3+). Nothing is lost: it only needs more water.
      if(stage.regrow)for(const t of targets)if(!t.done&&t.maxHeat&&t.heat<t.maxHeat&&time-t.lastHit>2)t.heat=Math.min(t.maxHeat,t.heat+stage.regrow*dt);
      if(scoreAcc>=1){const whole=Math.floor(scoreAcc);score+=whole;scoreAcc-=whole;}
      while(popups.length&&time-popups[0].at>1.4)popups.shift();
      if(targets.every(t=>t.done)){finishedAt??=time;if(time-finishedAt>=1.2){const timeScore=clamp(stage.par/Math.max(1,finishedAt));result={outcome:'win',score:Math.round(score),performance:.6*timeScore+.4*model.accuracy,summary:{hits:targets.length,seconds:Math.round(finishedAt),accuracy:Math.round(model.accuracy*100)}};sound('rescue');}}
    },
    snapshot(){return {mode:'targets',level:stage.level,time,pressure,empty,spraying,score:Math.round(score),wind,crew,aim:{...aim},impact:{...impact},nozzle:{...model.nozzle},remaining:model.remaining,total:targets.length,accuracy:model.accuracy,hitTarget:hitTarget?.id??null,
      targets:targets.map(t=>({id:t.id,kind:t.kind,at:t.at,x:t.x,y:t.y,r:t.r,heat:t.heat,density:t.density,push:t.push,falling:Boolean(t.fall),done:t.done,covered:covered(t)})),result};},
  };
  return model;
}
