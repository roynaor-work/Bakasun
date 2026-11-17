const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function inPenaltyArea(player,point,state,c){const d=state.attackDir*(player.team===0?1:-1),hx=c.pitch.length/2;return point.x*d>=-hx&&point.x*d<=-hx+c.pitch.penaltyDepth&&Math.abs(point.z)<=c.pitch.penaltyWidth/2;}
/** Approaching the carrier from behind is harder than a front/side duel. */
export function stealApproach(player,owner,c){
 if(!owner)return 1;
 const dx=player.x-owner.x,dz=player.z-owner.z,length=Math.hypot(dx,dz)||1;
 return (dx*owner.fx+dz*owner.fz)/length < -c.steal.behindCosine ? c.steal.behindMultiplier : 1;
}
/** Skill and shot quality are separate from the common ball integrator. */
export function keeperSaveChance(keeper,shooter,shot,c){const k=c.goalkeeping;return clamp(k.baseSave+((keeper.reactions+keeper.catching)/2-shooter.shot)*k.cardWeight-shot.speed*k.speedWeight-Math.abs(shot.aim)*k.cornerWeight+shot.distance*k.distanceWeight,k.minSave,k.maxSave);}
export function rollBall(b,dt,c){const p=c.ball,r=c.physics.ballRadius;
 b.vx+=-b.vz*b.curve*dt;b.vz+=b.vx*b.curve*dt;b.curve*=Math.exp(-c.rules.ballCurveDecay*dt);
 b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.vy-=p.gravity*dt;
 if(b.y<r){b.y=r;b.vy=Math.abs(b.vy)>p.bounceThreshold?-b.vy*p.bounce:0;}
 const friction=Math.exp(-(b.y<=r+c.rules.groundThreshold?p.grassFriction:p.airDrag)*dt);b.vx*=friction;b.vz*=friction;
 if(b.y<=r&&Math.hypot(b.vx,b.vz)<p.restSpeed)b.vx=b.vz=0;
}
