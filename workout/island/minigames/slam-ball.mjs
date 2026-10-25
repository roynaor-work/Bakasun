/** Street Slam ball flight: gravity, rim torus, backboard, pole, floor and fence.
 * Pure and deterministic. Scoring is reported only for a descending crossing of
 * the ring plane inside the allowed radius; the caller decides about shot IDs. */
const HOOPS=['home','away'];

function bounce(ball,nx,ny,nz,depth,restitution,events,kind){
 ball.x+=nx*depth;ball.y+=ny*depth;ball.z+=nz*depth;
 const vn=ball.vx*nx+ball.vy*ny+ball.vz*nz;
 if(vn<0){
  ball.vx-=(1+restitution)*vn*nx;ball.vy-=(1+restitution)*vn*ny;ball.vz-=(1+restitution)*vn*nz;
  // Tangential damping keeps rim rattles short.
  const t=.92;ball.vx*=t;ball.vz*=t;
  if(-vn>.6)events.push({type:kind,speed:-vn});
 }
}

function collideRing(ball,ring,c,p,events){
 const dx=ball.x-ring.x,dz=ball.z-ring.z,r=Math.hypot(dx,dz);
 const ux=r>1e-6?dx/r:1,uz=r>1e-6?dz/r:0;
 const px=ring.x+ux*c.ringRadius,pz=ring.z+uz*c.ringRadius;
 const ex=ball.x-px,ey=ball.y-ring.y,ez=ball.z-pz,d=Math.hypot(ex,ey,ez),min=c.ballRadius+c.ringTube;
 if(d<min&&d>1e-6)bounce(ball,ex/d,ey/d,ez/d,min-d,p.rimRestitution,events,'rim');
}

function collideBox(ball,box,restitution,events,kind){
 const cx=Math.max(box.x0,Math.min(box.x1,ball.x)),cy=Math.max(box.y0,Math.min(box.y1,ball.y)),cz=Math.max(box.z0,Math.min(box.z1,ball.z));
 const ex=ball.x-cx,ey=ball.y-cy,ez=ball.z-cz,d=Math.hypot(ex,ey,ez),R=ball.radius;
 if(d>=R)return;
 if(d>1e-6){bounce(ball,ex/d,ey/d,ez/d,R-d,restitution,events,kind);return;}
 // Centre inside the box: push out along the thin axis (board normal).
 const nz=ball.z<(box.z0+box.z1)/2?-1:1;bounce(ball,0,0,nz,R+Math.abs(ball.z-(nz<0?box.z0:box.z1)),restitution,events,kind);
}

function collidePole(ball,x,z,radius,top,restitution,events){
 if(ball.y-ball.radius>top)return;
 const dx=ball.x-x,dz=ball.z-z,d=Math.hypot(dx,dz),min=ball.radius+radius;
 if(d<min&&d>1e-6)bounce(ball,dx/d,0,dz/d,min-d,restitution,events,'pole');
}

/** Static geometry derived once from the court. */
export function slamColliders(court){
 return HOOPS.map(team=>{
  const ring=court.ring(team),b=court.board(team);
  return {team,ring,board:{x0:b.x0,x1:b.x1,y0:b.y0,y1:b.y1,z0:b.z-b.t/2,z1:b.z+b.t/2},pole:{x:0,z:court.target(team).sign*court.poleZ}};
 });
}

/** Advance a free ball by dt seconds. Returns contact events and ring crossings. */
export function stepBall(ball,dt,court,colliders,physics){
 const events=[],crossings=[],n=physics.substeps,h=dt/n,c=court;ball.radius=c.ballRadius;
 for(let i=0;i<n;i++){
  const prevY=ball.y,prevX=ball.x,prevZ=ball.z;
  ball.vy-=physics.gravity*h;
  const drag=Math.max(0,1-physics.airDrag*h);ball.vx*=drag;ball.vz*=drag;
  ball.x+=ball.vx*h;ball.y+=ball.vy*h;ball.z+=ball.vz*h;
  for(const col of colliders){
   const ring=col.ring;
   // Hoop-plane crossing first, from the swept segment of this substep.
   if(prevY>ring.y&&ball.y<=ring.y&&ball.vy<0){
    const t=(prevY-ring.y)/(prevY-ball.y),x=prevX+(ball.x-prevX)*t,z=prevZ+(ball.z-prevZ)*t;
    const r=Math.hypot(x-ring.x,z-ring.z);
    if(r<=c.ringRadius-c.ballRadius*physics.scoreSlack)crossings.push({team:col.team,radius:r});
   }
   collideRing(ball,ring,c,physics,events);
   collideBox(ball,col.board,physics.boardRestitution,events,'board');
   collidePole(ball,col.pole.x,col.pole.z,c.poleRadius,c.poleTop,physics.boardRestitution,events);
   // Net: a ball inside the ring cylinder below the plane loses lateral speed.
   const dr=Math.hypot(ball.x-ring.x,ball.z-ring.z);
   if(ball.y<ring.y&&ball.y>ring.y-c.netDepth&&dr<c.ringRadius){ball.vx*=physics.netDamping;ball.vz*=physics.netDamping;if(ball.vy<-physics.netMaxDrop)ball.vy=-physics.netMaxDrop;}
  }
  if(ball.y<c.ballRadius){
   const vy=-ball.vy;ball.y=c.ballRadius;
   if(vy>physics.rollSpeed){ball.vy=vy*physics.floorRestitution;ball.vx*=physics.floorFriction;ball.vz*=physics.floorFriction;if(vy>1)events.push({type:'floor',speed:vy});}
   else {ball.vy=0;const s=Math.hypot(ball.vx,ball.vz),slow=Math.max(0,s-physics.rollFriction*h);if(s>1e-6){ball.vx*=slow/s;ball.vz*=slow/s;}}
  }
  for(const [axis,limit,v] of [['x',c.fence.x,'vx'],['z',c.fence.z,'vz']]){
   if(ball[axis]>limit-c.ballRadius){ball[axis]=limit-c.ballRadius;if(ball[v]>0){ball[v]*=-physics.fenceRestitution;events.push({type:'fence',speed:Math.abs(ball[v])});}}
   if(ball[axis]<-limit+c.ballRadius){ball[axis]=-limit+c.ballRadius;if(ball[v]<0){ball[v]*=-physics.fenceRestitution;events.push({type:'fence',speed:Math.abs(ball[v])});}}
  }
 }
 return {events,crossings};
}

/** Launch velocity for a ball from p to target at the given elevation angle. */
export function launchVelocity(from,to,angleDeg,gravity){
 const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz),h=to.y-from.y;
 let a=angleDeg*Math.PI/180;
 // A very flat or short geometry would need an impossible speed; steepen.
 for(let k=0;k<20&&d*Math.tan(a)-h<=.05;k++)a=Math.min(1.45,a+.05);
 const cos=Math.cos(a),den=2*cos*cos*(d*Math.tan(a)-h),v=Math.sqrt(gravity*d*d/Math.max(1e-6,den));
 const ux=d>1e-6?dx/d:0,uz=d>1e-6?dz/d:0;
 return {vx:ux*v*cos,vy:v*Math.sin(a),vz:uz*v*cos,time:d/Math.max(1e-6,v*cos)};
}
