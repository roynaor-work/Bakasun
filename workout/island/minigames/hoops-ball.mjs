/** Island Pro Basketball — free ball physics: gravity, rim torus, backboard, stanchion
 * pad, floor and the arena walls. Pure and deterministic. A basket is reported only for a
 * descending crossing of the ring plane inside the ring; the rules decide what it means. */

function bounce(ball,nx,ny,nz,depth,restitution,tangent,events,kind){
 ball.x+=nx*depth;ball.y+=ny*depth;ball.z+=nz*depth;
 const vn=ball.vx*nx+ball.vy*ny+ball.vz*nz;
 if(vn<0){
  ball.vx-=(1+restitution)*vn*nx;ball.vy-=(1+restitution)*vn*ny;ball.vz-=(1+restitution)*vn*nz;
  ball.vx*=tangent;ball.vz*=tangent;
  if(-vn>.5)events.push({type:kind,speed:-vn,x:ball.x,y:ball.y,z:ball.z});
 }
}

export function hoopsColliders(court,c){
 return [1,-1].map(side=>({
  side,ring:court.rim(side),
  board:{x0:side*court.boardX-(side>0?0:court.boardT),x1:side*court.boardX+(side>0?court.boardT:0),
   y0:court.boardBottom,y1:court.boardBottom+court.boardH,z0:-court.boardW/2,z1:court.boardW/2},
  pad:{x:side*(court.hx+c.stanchionBehind),z:0,r:c.stanchionRadius,top:c.stanchionTop},
 }));
}

function collideRing(ball,ring,court,p,events){
 const dx=ball.x-ring.x,dz=ball.z-ring.z,r=Math.hypot(dx,dz);
 const ux=r>1e-6?dx/r:1,uz=r>1e-6?dz/r:0;
 const px=ring.x+ux*court.rimR,pz=ring.z+uz*court.rimR;
 const ex=ball.x-px,ey=ball.y-ring.y,ez=ball.z-pz,d=Math.hypot(ex,ey,ez),min=court.ballR+p.rimTube;
 if(d<min&&d>1e-6){bounce(ball,ex/d,ey/d,ez/d,min-d,p.rimRestitution,p.rimTangent,events,'rim');return true;}
 return false;
}

function collideBox(ball,b,court,p,events){
 const cx=Math.max(b.x0,Math.min(b.x1,ball.x)),cy=Math.max(b.y0,Math.min(b.y1,ball.y)),cz=Math.max(b.z0,Math.min(b.z1,ball.z));
 const ex=ball.x-cx,ey=ball.y-cy,ez=ball.z-cz,d=Math.hypot(ex,ey,ez),R=court.ballR;
 if(d>=R)return false;
 if(d>1e-6)bounce(ball,ex/d,ey/d,ez/d,R-d,p.boardRestitution,.96,events,'board');
 else {const nx=ball.x<(b.x0+b.x1)/2?-1:1;bounce(ball,nx,0,0,R+Math.abs(ball.x-(nx<0?b.x0:b.x1)),p.boardRestitution,.96,events,'board');}
 return true;
}

/** Advances a free ball. Returns {events, crossings:[{side,radius}], touchedRim:bool}. */
export function stepBall(ball,dt,court,colliders,p){
 const events=[],crossings=[],n=p.substeps,h=dt/n;let touchedRim=false;
 for(let i=0;i<n;i++){
  const py=ball.y,px=ball.x,pz=ball.z;
  ball.vy-=p.gravity*h;
  ball.x+=ball.vx*h;ball.y+=ball.vy*h;ball.z+=ball.vz*h;
  for(const col of colliders){
   const ring=col.ring;
   if(py>ring.y&&ball.y<=ring.y&&ball.vy<0){
    const t=(py-ring.y)/(py-ball.y),x=px+(ball.x-px)*t,z=pz+(ball.z-pz)*t,r=Math.hypot(x-ring.x,z-ring.z);
    if(r<=court.rimR-court.ballR*p.scoreSlack)crossings.push({side:col.side,radius:r});
   }
   if(Math.abs(ball.x-ring.x)<1.2&&ball.y>2.2){
    if(collideRing(ball,ring,court,p,events))touchedRim=true;
    collideBox(ball,col.board,court,p,events);
   }
   const dr=Math.hypot(ball.x-ring.x,ball.z-ring.z);
   if(ball.y<ring.y&&ball.y>ring.y-p.netDepth&&dr<court.rimR){ball.vx*=p.netDamping;ball.vz*=p.netDamping;if(ball.vy<-p.netMaxDrop)ball.vy=-p.netMaxDrop;}
   const pad=col.pad,ddx=ball.x-pad.x,ddz=ball.z-pad.z,dd=Math.hypot(ddx,ddz),mn=court.ballR+pad.r;
   if(ball.y<pad.top&&dd<mn&&dd>1e-6)bounce(ball,ddx/dd,0,ddz/dd,mn-dd,.4,.8,events,'pad');
  }
  if(ball.y<court.ballR){
   const vy=-ball.vy;ball.y=court.ballR;
   if(vy>p.rollSpeed){ball.vy=vy*p.floorRestitution;ball.vx*=p.floorFriction;ball.vz*=p.floorFriction;if(vy>.8)events.push({type:'floor',speed:vy,x:ball.x,z:ball.z});}
   else {ball.vy=0;const s=Math.hypot(ball.vx,ball.vz),slow=Math.max(0,s-p.rollFriction*h);if(s>1e-6){ball.vx*=slow/s;ball.vz*=slow/s;}}
  }
  const wx=court.hx+p.wallGap,wz=court.hz+p.wallGap;
  if(Math.abs(ball.x)>wx){ball.x=Math.sign(ball.x)*wx;ball.vx*=-.4;}
  if(Math.abs(ball.z)>wz){ball.z=Math.sign(ball.z)*wz;ball.vz*=-.4;}
 }
 return {events,crossings,touchedRim};
}

/** Launch velocity from `from` to `to` that peaks with the given entry angle. */
export function launch(from,to,angleDeg,gravity){
 const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz),h=to.y-from.y;
 let a=angleDeg*Math.PI/180;
 for(let k=0;k<24&&d*Math.tan(a)-h<=.05;k++)a=Math.min(1.45,a+.05);
 const cos=Math.cos(a),den=2*cos*cos*(d*Math.tan(a)-h),v=Math.sqrt(gravity*d*d/Math.max(1e-6,den));
 const ux=d>1e-6?dx/d:0,uz=d>1e-6?dz/d:0;
 return {vx:ux*v*cos,vy:v*Math.sin(a),vz:uz*v*cos,time:d/Math.max(1e-6,v*cos)};
}

/** Velocity for a flat pass that reaches `to` after `time` seconds. */
export function passVelocity(from,to,time,gravity){
 return {vx:(to.x-from.x)/time,vz:(to.z-from.z)/time,vy:(to.y-from.y)/time+.5*gravity*time};
}
