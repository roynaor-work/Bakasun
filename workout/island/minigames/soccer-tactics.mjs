const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const laneClearance=(p,a,b)=>{
 const dx=b.x-a.x,dz=b.z-a.z,u=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
 return distance(p,{x:a.x+dx*u,z:a.z+dz*u});
};
/** One ball press; everyone else returns to a zone or finds a passing lane. */
export function fieldTarget(p,s,c){
 const a=c.tactics,b=s.ball,d=s.attackDir*(p.team===0?1:-1),hx=c.pitch.length/2,hz=c.pitch.width/2;
 const owner=b.owner===null?null:s.players[b.owner],mates=s.players.filter(q=>q.team===p.team&&q.role!=='keeper');
 const chaser=mates.reduce((best,q)=>distance(q,b)<distance(best,b)?q:best,mates[0]);
 const role=c.players.roles.indexOf(p.role),lane=a.lanes[role]*d;
 const opponents=s.players.filter(q=>q.team!==p.team),minimum=a.markDistance[s.difficulty]+a.spacingBuffer;
 let x,z,duty;
 if(owner?.team===p.team){
  const advance=a.advance[c.players.roles.indexOf(p.role)];
  x=owner.x+d*advance;z=lane+owner.z*a.ballWidth;duty='support';
  if(p.role==='striker')x+=d*a.strikerRun;
  // Search nearby space, rewarding both room to receive and a clear pass lane.
  const ideal={x:clamp(x,-hx+a.goalInset,hx-a.goalInset),z:clamp(z,-hz+a.sideInset,hz-a.sideInset)};
  let best=-Infinity;
  if(p.team===0)for(const ox of [-1,0,1])for(const oz of [-1,0,1]){
   const q={x:clamp(ideal.x+ox*a.openSpaceStep,-hx+a.goalInset,hx-a.goalInset),z:clamp(ideal.z+oz*a.openSpaceStep,-hz+a.sideInset,hz-a.sideInset)};
   const clearance=Math.min(...opponents.map(o=>distance(o,q))),passing=Math.min(...opponents.map(o=>laneClearance(o,owner,q)));
   const value=Math.min(clearance,minimum*2)+Math.min(passing,minimum)-distance(q,ideal)*.35-Math.max(0,c.ai.requestDistance-distance(q,owner))*2;
   if(value>best){best=value;x=q.x;z=q.z;}
  }
 }else if(chaser.id===p.id){x=b.x+b.vx*a.interceptSeconds;z=b.z+b.vz*a.interceptSeconds;duty='press';}
 else{
  x=d*c.ai.kickoffX[role]+clamp(b.x,-a.zoneBallShift,a.zoneBallShift);
  z=lane+b.z*a.ballWidth;duty='cover';
 }
 // Avoid off-ball opponents, including on the presser's route to the ball.
 // This steers AI only: the child can cross every pitch/penalty-area line.
 if(owner&&owner.team!==p.team)for(let pass=0;pass<a.separationIterations;pass++)for(const q of opponents){
  if(q.id===b.owner||q.role==='keeper')continue;
  const dx=x-q.x,dz=z-q.z,l=Math.hypot(dx,dz);
  if(l<minimum){x=q.x+(l?dx/l:-d)*minimum;z=q.z+(l?dz/l:0)*minimum;}
 }
 return {x:clamp(x,-hx+a.goalInset,hx-a.goalInset),z:clamp(z,-hz+a.sideInset,hz-a.sideInset),duty};
}
/** Iterative positional constraints also resolve exactly coincident players. */
export function separatePlayers(s,c){
 const hx=c.pitch.length/2-c.rules.playerBoundary,hz=c.pitch.width/2-c.rules.playerBoundary;
 for(let pass=0;pass<c.tactics.separationIterations;pass++)for(let i=0;i<s.players.length;i++)for(let j=i+1;j<s.players.length;j++){
  const a=s.players[i],b=s.players[j],fixedA=a.recover>0,fixedB=b.recover>0;if(fixedA&&fixedB)continue;
  let dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
  const min=a.team===b.team?c.tactics.teammateDistance:c.players.radius*2;
  if(l>=min)continue;if(!l){dx=((i+j)%2?1:-1);dz=0;l=1;}
  const overlap=min-distance(a,b),pushA=fixedA?0:fixedB?overlap:overlap/2,pushB=fixedB?0:fixedA?overlap:overlap/2;
  a.x=clamp(a.x-dx/l*pushA,-hx,hx);a.z=clamp(a.z-dz/l*pushA,-hz,hz);
  b.x=clamp(b.x+dx/l*pushB,-hx,hx);b.z=clamp(b.z+dz/l*pushB,-hz,hz);
 }
}
