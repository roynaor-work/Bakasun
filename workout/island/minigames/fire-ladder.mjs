import {fireV21} from './polish-flag.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** 11/11/2026 pure: in wind mode the ladder balances itself (a child only has to start the rescue; the stick counts half, so even pushing it
 * the wrong way cannot tip the ladder past the tolerance: wind .94 at most plus .8 against 1.6*(4*sway) settles near .27 < .38).
 * `?fireRescue=v20` restores manual balancing. */
export function autoBalanceSteer(sway,gain=4){return clamp(-sway*gain,-1.6,1.6);}
/** 11/11/2026 pure: how the fire engine's own roof ladder points during a rescue, in the truck's local frame (`tip` = the sign of the local Z end the ladder tip is at; the Meshy engine's tip lies over the cab at -Z).
 * rootYaw is the model root's world rotation (yaw plus heading fix); dx/dz/dy are target minus pivot in world units; length is the stowed
 * ladder length. Stowed (extension 0): yaw 0, pitch 0, scale 1. Extended: it turns and lifts toward the window and stretches to reach it (at most 2.6x). */
export function ladderArmPose({dx,dz,dy,rootYaw,extension,length,sway=0,tip=-1}){
  const e=clamp(extension,0,1);if(e<=0)return {yaw:0,pitch:0,scale:1};
  const lx=dx*Math.cos(rootYaw)-dz*Math.sin(rootYaw),lz=dx*Math.sin(rootYaw)+dz*Math.cos(rootYaw),flat=Math.hypot(lx,lz);
  const yaw=Math.atan2(tip*lx,tip*lz)+sway*.12,pitch=-tip*Math.atan2(Math.max(0,dy),Math.max(.01,flat)),reach=Math.hypot(flat,Math.max(0,dy));
  return {yaw:yaw*e,pitch:pitch*e,scale:1+e*clamp(reach/Math.max(.1,length)-1,0,1.6)};
}
/** Ladder challenges share the fire simulation clock and ordinary controls. */
export function createFireLadder(settings,rescues,flames,balance){
  const mode=settings.ladderMode||'simple',rules=balance.ladder,autoBalance=fireV21('fireRescue');
  for(const r of rescues){r.world=[...r.world];r.baseHeight=r.world[1];r.floor=0;}
  const access=flames.flatMap((f,i)=>f.kind==='roof'&&!rescues.some(r=>r.fireIndex===i)?[{x:f.x,y:f.y,world:[...balance.render.sites[i]],fireIndex:i,seconds:rules.accessSeconds,progress:0,accessed:false,kind:'access'}]:[]);
  const ladder={mode,sway:0,wind:0,stable:true,engaged:false,extension:0,target:null,available:false,completed:0,targets:[...rescues,...access]};
  let heldTarget=null;
  const pending=r=>r.kind==='access'?flames[r.fireIndex].active&&flames[r.fireIndex].heat>0&&!r.accessed:!r.rescued&&!r.expired;
  function select(truck){const people=rescues.filter(pending),targets=people.length?people:ladder.targets.filter(pending);return targets.sort((a,b)=>Math.hypot(a.world[0]-truck.x,a.world[2]-truck.z)-Math.hypot(b.world[0]-truck.x,b.world[2]-truck.z))[0];}
  return {state:ladder,
    prepare(dt,time,input,truck){
      if(!input.rescue||heldTarget&&(!pending(heldTarget)&&mode!=='wind'||Math.hypot(truck.x-heldTarget.world[0],truck.z-heldTarget.world[2])>balance.rescue.truckRadius))heldTarget=null;
      ladder.target=heldTarget||select(truck);if(input.rescue&&!heldTarget&&ladder.target&&Math.hypot(truck.x-ladder.target.world[0],truck.z-ladder.target.world[2])<=balance.rescue.truckRadius)heldTarget=ladder.target;ladder.available=Boolean(ladder.target);ladder.engaged=Boolean(input.rescue&&ladder.target&&Math.hypot(truck.x-ladder.target.world[0],truck.z-ladder.target.world[2])<=balance.rescue.truckRadius);
      ladder.wind=mode==='wind'?.7+Math.sin(time*1.7)*.24:0;
      ladder.sway=mode==='wind'&&ladder.engaged?Math.max(-1,Math.min(1,ladder.sway+(ladder.wind+((input.moveX||0)*(autoBalance?.5:1)+(autoBalance?autoBalanceSteer(ladder.sway):0))*rules.stabilizePower)*dt)):ladder.sway*Math.exp(-dt*4);
      ladder.stable=Math.abs(ladder.sway)<rules.stableTolerance;
      if(mode==='moving')for(const r of rescues){if(r.rescued||r.expired)continue;const floor=Math.floor(time/rules.floorSeconds)%2;if(floor!==r.floor){r.floor=floor;r.world[1]=r.baseHeight+floor*rules.floorHeight;r.progress=0;}}
      return ladder.engaged&&mode==='wind';
    },
    allowed(r){return (mode!=='clear'||flames[r.fireIndex].heat===0)&&(mode!=='sequence'||rescues.slice(0,rescues.indexOf(r)).every(p=>p.rescued&&p.descent===1))&&(mode!=='wind'||ladder.stable);},
    finish(dt,model,sound){
      for(const r of access){const near=!model.truck.driving&&Math.hypot(model.truck.x-r.world[0],model.truck.z-r.world[2])<=balance.rescue.truckRadius;
        if(model.rescuing&&ladder.engaged&&ladder.target===r&&near){if(r.progress===0)sound('ladder');r.progress=Math.min(r.seconds,r.progress+dt);if(r.progress===r.seconds)r.accessed=true;}else if(!r.accessed)r.progress=0;
      }
      const visible=ladder.targets.find(r=>r.progress>0&&(r.kind==='access'?!r.accessed:!r.expired&&(!r.rescued||r.descent<1)))||(ladder.engaged?ladder.target:null);
      ladder.target=visible||select(model.truck);ladder.extension=visible?Math.min(1,visible.progress/visible.seconds):0;
      if(ladder.engaged&&mode==='wind')ladder.extension=Math.max(.75,ladder.extension);
      ladder.completed=rescues.filter(r=>r.rescued).length+access.filter(r=>r.accessed).length;
    }
  };
}
