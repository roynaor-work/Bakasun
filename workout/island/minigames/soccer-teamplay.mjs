const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const formations={
 balanced:{width:1,advance:1,depth:1,press:1},
 wide:{width:1.16,advance:1,depth:1.04,press:.95},
 compact:{width:.77,advance:.9,depth:.95,press:.9},
 counter:{width:1.05,advance:1.25,depth:1.2,press:.9},
 press:{width:.92,advance:1.06,depth:.8,press:1.18},
 diamond:{width:.88,advance:1.12,depth:1.08,press:1}
};

/** Campaign formations belong to the rival; the child's team retains its shape. */
export function teamFormation(team,s,c){
 const value=team===1?s.campaign?.formation??c.tactics.stageFormation:s.campaign?.homeFormation;
 const name=typeof value==='string'&&Object.hasOwn(formations,value)?value:'balanced';
 return {name,...formations[name]};
}

/** Distance to a pass segment, ignoring defenders standing behind either end. */
export function passLaneClearance(point,from,to){
 const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
 if(!length)return distance(point,from);
 const u=((point.x-from.x)*dx+(point.z-from.z)*dz)/length;
 return u<0||u>1?Infinity:distance(point,{x:from.x+u*dx,z:from.z+u*dz});
}

/** Closest approach during a ground pass, using observed defender velocity.
 * A short, bounded prediction sees a defender running across an empty corridor;
 * it never reads the human's movement command or any future simulation state. */
export function passInterceptionClearance(point,from,to,seconds){
 const duration=Math.max(0,Number.isFinite(seconds)?seconds:0);
 if(!duration)return passLaneClearance(point,from,to);
 const dx=point.x-from.x,dz=point.z-from.z;
 const vx=(point.vx||0)-(to.x-from.x)/duration,vz=(point.vz||0)-(to.z-from.z)/duration,speed2=vx*vx+vz*vz;
 const at=speed2?clamp(-(dx*vx+dz*vz)/speed2,0,duration):0;
 return Math.hypot(dx+vx*at,dz+vz*at);
}

/** A carrier must see a real corridor past field defenders before shooting. */
export function hasShootingLane(p,s,c){
 const d=s.attackDir*(p.team===0?1:-1),goalX=d*c.pitch.length/2;
 const defenders=s.players.filter(q=>q.team!==p.team&&q.role!=='keeper'),clearance=c.players.radius+c.physics.ballRadius+.2;
 return [-.35,0,.35].some(corner=>defenders.every(q=>passLaneClearance(q,s.ball,{x:goalX,z:corner*c.pitch.goalWidth})>=clearance));
}

/** Selection and release share one bounded prediction, including at a touchline. */
export function teamPassPoint(member,c){
 const lead=c.ai.passLeadSeconds,inset=Math.max(c.physics.ballRadius,c.rules.playerBoundary);
 return {x:clamp(member.x+clamp((member.vx||0)*lead,-2,2),-c.pitch.length/2+inset,c.pitch.length/2-inset),z:clamp(member.z+clamp((member.vz||0)*lead,-2,2),-c.pitch.width/2+inset,c.pitch.width/2-inset)};
}

/** Score only visible positions and motion: an open lateral pass can beat a marked runner. */
export function selectTeamPass(p,s,c){
 const mates=s.players.filter(q=>q.team===p.team&&q.id!==p.id),fields=mates.filter(q=>q.role!=='keeper');
 const available=fields.filter(q=>!(q.recover>0)&&!(q.slideTime>0)),pool=available.length?available:fields.length?fields:mates;
 const opponents=s.players.filter(q=>q.team!==p.team),d=s.attackDir*(p.team===0?1:-1);
 const maxDistance=c.passing.maxDistance;
 let target=null,best=-Infinity;
 for(const member of pool){
  const destination=teamPassPoint(member,c);
  const range=distance(p,destination),clearance=Math.min(6,...opponents.map(o=>distance(o,destination)));
  const lane=Math.min(5,...opponents.map(o=>passLaneClearance(o,p,destination)));
  const movingLane=Math.min(5,...opponents.map(o=>passInterceptionClearance(o,p,destination,c.passing.groundTravelSeconds)));
  const advance=clamp((destination.x-p.x)*d,-6,10);
  const tooClose=Math.max(0,c.ai.requestDistance-range),tooFar=Math.max(0,range-maxDistance);
  const value=lane*2.7+clearance*1.15+advance*c.ai.passSelectionAdvanceWeight-range*.09-tooClose*3-tooFar*2-Math.max(0,lane-movingLane)*.8;
  if(value>best||value===best&&member.id<target.id){target=member;best=value;}
 }
 return target;
}

/** A small incumbent advantage prevents two equally close teammates swapping duties every tick. */
export function teamPresser(team,s,c){
 const b=s.ball,mates=s.players.filter(q=>q.team===team&&q.role!=='keeper');
 const active=mates.filter(q=>!(q.recover>0)&&!(q.slideTime>0)),pool=active.length?active:mates;
 const lead=c.tactics.interceptSeconds,point={x:b.x+(b.vx||0)*lead,z:b.z+(b.vz||0)*lead};
 let chaser=null,best=Infinity;
 for(const q of pool){
  const range=distance(q,point),closing=range?((point.x-q.x)*(q.vx||0)+(point.z-q.z)*(q.vz||0))/range:0;
  const cost=range-clamp(closing,-4,4)*.08-(q.duty==='press'?.65:0);
  if(cost<best||cost===best&&q.id<chaser.id){chaser=q;best=cost;}
 }
 return chaser;
}

/** Keeper anticipation starts after ball release; it never reads the shooter's aim or input. */
export function keeperTarget(p,s,c){
 const b=s.ball,a=c.ai,k=c.goalkeeping,d=s.attackDir*(p.team===0?1:-1),hx=c.pitch.length/2;
 const owner=b.owner==null?null:s.players[b.owner],goalLine=-d*(hx-a.keeperInset);
 const threat=1-clamp((b.x*d+hx)/c.pitch.length,0,1);
 let x=goalLine,z=b.z*a.keeperTracking*(.45+.55*threat),duty='keeper-track';
 const reaction=k.aiReactionSeconds??.12,released=b.grace<=Math.max(0,c.physics.possessionGrace-reaction);
 if(!owner&&b.lastTeam!==p.team&&released&&b.vx*d<-.1){
  const time=(goalLine-b.x)/b.vx;
  if(time>0&&time<.8)z=b.z+b.vz*time;
 }
 const ballDistance=distance(p,b),opposition=Math.min(Infinity,...s.players.filter(q=>q.team!==p.team).map(q=>distance(q,b)));
 if(!owner&&b.y<=c.rules.pickupHeight&&Math.hypot(b.vx,b.vz)<a.keeperFastBall&&b.x*d<-hx+a.keeperChaseDistance&&Math.abs(b.z)<c.pitch.penaltyWidth/2-k.areaInset&&ballDistance<a.keeperChaseRadius&&opposition>ballDistance+.6){x=b.x;z=b.z;duty='keeper-sweep';}
 const limit=duty==='keeper-sweep'?c.pitch.penaltyWidth/2-k.areaInset:c.pitch.goalWidth/2-a.keeperPostInset;
 return {x:d*clamp(x*d,-hx+k.areaInset,-hx+c.pitch.penaltyDepth-k.areaInset),z:clamp(z,-limit,limit),duty};
}
