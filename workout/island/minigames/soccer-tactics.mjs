import {passLaneClearance,teamFormation,teamPresser} from './soccer-teamplay.mjs?v=island-integration-20261030-1';
export {selectTeamPass,keeperTarget,hasShootingLane,teamPassPoint,passLaneClearance} from './soccer-teamplay.mjs?v=island-integration-20261030-1';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
/** First element under a comparator: the same choice as sort(compare)[0], without the sort or its copies. */
const first=(list,compare,filter)=>{let best=null;for(const e of list){if(filter&&!filter(e))continue;if(best===null||compare(e,best)<0)best=e;}return best;};
const byStriker=d=>(u,v)=>(v.role==='striker')-(u.role==='striker')||(v.x-u.x)*d||u.id-v.id;
const byAdvance=d=>(u,v)=>u.x*d-v.x*d||u.id-v.id;
/** One ball press; everyone else returns to a zone or finds a passing lane. */
export function fieldTarget(p,s,c){
 const a=c.tactics,b=s.ball,d=s.attackDir*(p.team===0?1:-1),hx=c.pitch.length/2,hz=c.pitch.width/2,formation=teamFormation(p.team,s,c);
 const owner=b.owner===null?null:s.players[b.owner],mates=[],opponents=[];
 for(const q of s.players){if(q.team!==p.team)opponents.push(q);else if(q.role!=='keeper')mates.push(q);}
 const chaser=teamPresser(p.team,s,c);
 const role=Math.max(0,c.players.roles.indexOf(p.role)),lane=a.lanes[role]*d*formation.width;
 const minimum=a.markDistance[s.difficulty]+a.spacingBuffer;
 let x,z,duty;
 if(owner?.team===p.team){
  const advance=a.advance[role]*formation.advance;
  x=owner.x+d*advance;z=lane+owner.z*a.ballWidth;duty='support';
  if(p.role==='striker')x+=d*a.strikerRun*formation.advance;
  // Wide carrier in the final third: one runner attacks the box for a header,
  // another comes square and central for the lateral pass (29/10/2026 sim: 0 headers in 12 matches).
  const w=a.wideAttack,wide=w&&Math.abs(owner.z)>=w.width&&hx-owner.x*d<=w.range;
  if(wide){
   const runner=first(mates,byStriker(d),q=>q.id!==owner.id);
   if(runner?.id===p.id){x=d*(hx-c.pitch.penaltySpot-w.boxDepth);z=-Math.sign(owner.z)*w.farPost;duty='box-run';}
   else{x=owner.x-d*w.squareBack;z=owner.z*w.squareInside;duty='square';}
  }
  // A pressed carrier gets a safe outlet: the support player drops diagonally behind,
  // on the side away from the nearest presser, instead of running further ahead.
  const o=a.outlet,presser=o&&p.role==='support'?first(opponents,(u,v)=>distance(u,owner)-distance(v,owner),q=>q.role!=='keeper'):null;
  if(presser&&duty==='support'&&distance(presser,owner)<o.pressure){const side=owner.z>=presser.z?1:-1,wide=Math.abs(owner.z+side*o.wide)<hz-a.sideInset?side:-side;x=owner.x-d*o.back;z=owner.z+wide*o.wide;duty='outlet';}
  // Search nearby space, rewarding both room to receive and a clear pass lane.
  const ideal={x:clamp(x,-hx+a.goalInset,hx-a.goalInset),z:clamp(z,-hz+a.sideInset,hz-a.sideInset)};
  let best=-Infinity;
  for(const ox of [0,-1,1])for(const oz of [0,-1,1]){
   const q={x:clamp(ideal.x+ox*a.openSpaceStep,-hx+a.goalInset,hx-a.goalInset),z:clamp(ideal.z+oz*a.openSpaceStep,-hz+a.sideInset,hz-a.sideInset)};
   let clearance=minimum*2,passing=minimum,room=a.teammateDistance*2;
   for(const o of opponents){clearance=Math.min(clearance,distance(o,q));passing=Math.min(passing,passLaneClearance(o,owner,q));}
   for(const o of mates)if(o.id!==p.id&&o.id!==owner.id)room=Math.min(room,distance(o,q));
   const travel=distance(p,q),continuation=travel?((q.x-p.x)*(p.vx||0)+(q.z-p.z)*(p.vz||0))/travel:0;
   const value=clearance+passing*1.15+room*.45-distance(q,ideal)*.48-travel*.035+clamp(continuation,-4,4)*.05-Math.max(0,c.ai.requestDistance-distance(q,owner))*3;
   if(value>best){best=value;x=q.x;z=q.z;}
  }
 }else if(chaser?.id===p.id){x=b.x+(b.vx||0)*a.interceptSeconds*formation.press;z=b.z+(b.vz||0)*a.interceptSeconds*formation.press;duty='press';}
 else{
  // Cover a goal-side zone rather than joining a chase or marking an off-ball run.
  const depth=Math.max(a.defenseDepth,minimum)*formation.depth;
  const stagger=(c.ai.kickoffX[role]-c.ai.kickoffX[0])*.25;
  x=d*(b.x*d-depth+stagger)+(b.vx||0)*a.interceptSeconds;
  z=lane+b.z*a.ballWidth+(b.vz||0)*a.interceptSeconds;duty='cover';
  // Screen the most dangerous pass: goal-side on the line from the carrier to the
  // most advanced visible attacker, so one presser and one cover never both chase.
  const k=a.coverLane,threat=owner&&owner.team!==p.team&&k?first(opponents,byAdvance(d),q=>q.id!==owner.id&&q.role!=='keeper'):null;
  if(threat){const lx=owner.x+(threat.x-owner.x)*k.fraction-d*k.goalSide,lz=owner.z+(threat.z-owner.z)*k.fraction,point={x:lx,z:lz};
   // Only the nearest non-pressing team-mate takes the lane; the rest hold their zones and width.
   const screen=first(mates,(u,v)=>distance(u,point)-distance(v,point)||u.id-v.id,q=>q.id!==chaser?.id&&!(q.recover>0));
   if(screen?.id===p.id){x+=(lx-x)*k.blend;z+=(lz-z)*k.blend;}}
 }
 // Avoid off-ball opponents, including on the presser's route to the ball.
 // This steers AI only: the child can cross every pitch/penalty-area line.
 if(owner&&owner.team!==p.team)for(let pass=0;pass<a.separationIterations;pass++)for(const q of opponents){
  if(q.id===b.owner||q.role==='keeper')continue;
  const dx=x-q.x,dz=z-q.z,l=Math.hypot(dx,dz);
  const clearance=duty==='press'?c.players.radius*2:minimum;
  if(l<clearance){x=q.x+(l?dx/l:-d)*clearance;z=q.z+(l?dz/l:0)*clearance;}
 }
 return {x:clamp(x,-hx+a.goalInset,hx-a.goalInset),z:clamp(z,-hz+a.sideInset,hz-a.sideInset),duty};
}
/** Iterative positional constraints also resolve exactly coincident players. */
export function separatePlayers(s,c){
 const hx=c.pitch.length/2-c.rules.playerBoundary,hz=c.pitch.width/2-c.rules.playerBoundary;
 for(let pass=0;pass<c.tactics.separationIterations;pass++)for(let i=0;i<s.players.length;i++)for(let j=i+1;j<s.players.length;j++){
  const a=s.players[i],b=s.players[j],fixedA=a.recover>0||a.id===s.controlled,fixedB=b.recover>0||b.id===s.controlled;if(fixedA&&fixedB)continue;
  let dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
  // Tactical spacing steers a target. Only a small body clearance moves AI,
  // and the controlled child is never repositioned by a distant spacing rule.
  const min=a.team===b.team?Math.min(c.tactics.teammateDistance,c.players.radius*2+.4):c.players.radius*2;
  if(l>=min)continue;if(!l){dx=((i+j)%2?1:-1);dz=0;l=1;}
  const overlap=min-distance(a,b),pushA=fixedA?0:fixedB?overlap:overlap/2,pushB=fixedB?0:fixedA?overlap:overlap/2;
  a.x=clamp(a.x-dx/l*pushA,-hx,hx);a.z=clamp(a.z-dz/l*pushA,-hz,hz);
  b.x=clamp(b.x+dx/l*pushB,-hx,hx);b.z=clamp(b.z+dz/l*pushB,-hz,hz);
 }
}
