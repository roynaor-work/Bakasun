/** First boundary crossed by the whole ball, with its height at that instant. */
export function pitchCrossing(from,to,config){
  const limits={x:config.pitch.length/2+config.physics.ballRadius,z:config.pitch.width/2+config.physics.ballRadius};
  let first=null;
  for(const axis of ['x','z']){
    const limit=limits[axis];if(Math.abs(to[axis])<=limit)continue;
    const side=Math.sign(to[axis]),delta=to[axis]-from[axis];
    const time=Math.abs(from[axis])>limit?0:delta?(side*limit-from[axis])/delta:0;
    if(time<0||time>1||first&&time>=first.time)continue;
    first={axis,side,time,x:from.x+(to.x-from.x)*time,y:from.y+(to.y-from.y)*time,z:from.z+(to.z-from.z)*time};
  }
  return first;
}

/** A swept sphere against the goal's capped cylinders. A fast ball cannot skip
 * a post between ticks; return the first entering contact and its outward normal. */
export function goalFrameContact(from,to,config){
  const radius=config.physics.ballRadius+config.pitch.postRadius,hx=config.pitch.length/2,half=config.pitch.goalWidth/2,height=config.pitch.goalHeight;
  if(!Number.isFinite(radius))return null;
  const velocity={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};let first=null;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  function test(origin,axis,min,max,kind){
    const offset={x:from.x-origin.x,y:from.y-origin.y,z:from.z-origin.z},radial={...offset},motion={...velocity};
    if(axis){radial[axis]=0;motion[axis]=0;}
    const a=dot(motion,motion),b=dot(radial,motion),c=dot(radial,radial)-radius*radius;
    if(a<1e-12)return;
    const discriminant=b*b-a*c;if(discriminant<0)return;
    const time=c<=0?0:(-b-Math.sqrt(discriminant))/a;
    if(time<0||time>1||first&&time>=first.time)return;
    const point={x:from.x+velocity.x*time,y:from.y+velocity.y*time,z:from.z+velocity.z*time};
    if(axis&&(point[axis]<min||point[axis]>max))return;
    const normal={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z};if(axis)normal[axis]=0;
    const length=Math.hypot(normal.x,normal.y,normal.z);if(length<1e-12)return;
    for(const key of ['x','y','z'])normal[key]/=length;
    if(dot(velocity,normal)>=0)return;
    first={time,point,normal,kind};
  }
  for(const side of [-1,1]){
    if(Math.min(Math.abs(from.x-side*hx),Math.abs(to.x-side*hx))>radius&&Math.sign(from.x-side*hx)===Math.sign(to.x-side*hx))continue;
    for(const z of [-half,half]){
      test({x:side*hx,y:0,z},'y',0,height,'post');
      test({x:side*hx,y:height,z},null,0,0,'post');
    }
    test({x:side*hx,y:height,z:0},'z',-half,half,'crossbar');
  }
  return first;
}
