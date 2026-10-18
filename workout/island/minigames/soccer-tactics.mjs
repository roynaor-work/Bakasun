const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
/** One press, two distinct passing lanes / goal-side markers. No match RNG. */
export function fieldTarget(p,s,c){
 const a=c.tactics,b=s.ball,d=s.attackDir*(p.team===0?1:-1),hx=c.pitch.length/2,hz=c.pitch.width/2;
 const owner=b.owner===null?null:s.players[b.owner],mates=s.players.filter(q=>q.team===p.team&&q.role!=='keeper');
 const chaser=mates.reduce((best,q)=>distance(q,b)<distance(best,b)?q:best,mates[0]);
 const lane=a.lanes[c.players.roles.indexOf(p.role)]*d;
 let x,z,duty;
 if(owner?.team===p.team){
  const advance=a.advance[c.players.roles.indexOf(p.role)];
  x=owner.x+d*advance;z=lane+owner.z*a.ballWidth;duty='support';
  if(p.role==='striker')x+=d*a.strikerRun;
 }else if(chaser.id===p.id){x=b.x+b.vx*a.interceptSeconds;z=b.z+b.vz*a.interceptSeconds;duty='press';}
 else if(!owner){x=b.x-d*a.defenseDepth;z=lane+b.z*a.ballWidth;duty='cover';}
 else{
  const marks=s.players.filter(q=>q.team!==p.team&&q.role!=='keeper'&&q.id!==owner?.id);
  const defenders=mates.filter(q=>q.id!==chaser.id),mark=marks[defenders.findIndex(q=>q.id===p.id)%marks.length];
  const zone=b.x-d*a.defenseDepth;
  x=mark?(mark.x-d*a.markDistance)*a.markWeight+zone*(1-a.markWeight):zone;
  z=mark?mark.z*a.markWeight+lane*(1-a.markWeight):lane;duty='mark';
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
