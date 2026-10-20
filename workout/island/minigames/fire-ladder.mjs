/** Ladder challenges share the fire simulation clock and ordinary controls. */
export function createFireLadder(settings,rescues,flames,balance){
  const mode=settings.ladderMode||'simple',rules=balance.ladder;
  for(const r of rescues){r.world=[...r.world];r.baseHeight=r.world[1];r.floor=0;}
  const access=flames.flatMap((f,i)=>f.kind==='roof'&&!rescues.some(r=>r.fireIndex===i)?[{x:f.x,y:f.y,world:[...balance.render.sites[i]],fireIndex:i,seconds:rules.accessSeconds,progress:0,accessed:false,kind:'access'}]:[]);
  const ladder={mode,sway:0,wind:0,stable:true,engaged:false,extension:0,target:null,available:false,completed:0,targets:[...rescues,...access]};
  let heldTarget=null;
  const pending=r=>r.kind==='access'?flames[r.fireIndex].active&&flames[r.fireIndex].heat>0&&!r.accessed:!r.rescued&&!r.expired;
  function select(truck){return ladder.targets.filter(pending).sort((a,b)=>Math.hypot(a.world[0]-truck.x,a.world[2]-truck.z)-Math.hypot(b.world[0]-truck.x,b.world[2]-truck.z))[0];}
  return {state:ladder,
    prepare(dt,time,input,truck){
      if(!input.rescue)heldTarget=null;
      ladder.target=heldTarget||select(truck);if(input.rescue&&!heldTarget&&ladder.target&&Math.hypot(truck.x-ladder.target.world[0],truck.z-ladder.target.world[2])<=balance.rescue.truckRadius)heldTarget=ladder.target;ladder.available=Boolean(ladder.target);ladder.engaged=Boolean(input.rescue&&ladder.target&&Math.hypot(truck.x-ladder.target.world[0],truck.z-ladder.target.world[2])<=balance.rescue.truckRadius);
      ladder.wind=mode==='wind'?.7+Math.sin(time*1.7)*.24:0;
      ladder.sway=mode==='wind'&&ladder.engaged?Math.max(-1,Math.min(1,ladder.sway+(ladder.wind+(input.moveX||0)*rules.stabilizePower)*dt)):ladder.sway*Math.exp(-dt*4);
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
