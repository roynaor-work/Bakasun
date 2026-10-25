/** Street Slam computer players. They read only the visible match state (no
 * future input), decide at a human reaction interval and act through the same
 * press/release/move intents as the child. Difficulty changes reaction,
 * decision quality and aim spread, never speed beyond the shared limit. */
const len=(x,z)=>Math.hypot(x,z);

function nearestOpponentDistance(p,ctx){let m=Infinity;for(const q of ctx.opponents(p))m=Math.min(m,len(q.x-p.x,q.z-p.z));return m;}

function laneClear(a,b,ctx,team,width=.8){
 const dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz||1;
 for(const q of ctx.state.players){if(q.team===team||q.inactive)continue;const t=((q.x-a.x)*dx+(q.z-a.z)*dz)/d2;if(t<.08||t>.95)continue;if(len(a.x+dx*t-q.x,a.z+dz*t-q.z)<width)return false;}
 return true;
}

function landing(ctx){const b=ctx.state.ball;const t=b.vy>0?Math.min(1,b.vy/9.8+.3):.25;return {x:b.x+b.vx*t,z:b.z+b.vz*t};}

function spots(ctx,team){
 const ring=ctx.court.ring(team),s=-Math.sign(ring.z)||1;
 return [[3.8,3.2],[-3.8,3.2],[5.4,.9],[-5.4,.9],[0,5.6],[1.6,1.7],[-1.6,1.7]].map(([x,f])=>({x,z:ring.z+s*f}));
}

function offBallSpot(p,ctx,skill){
 const o=ctx.owner,best={v:-Infinity,spot:null};
 for(const sp of spots(ctx,p.team)){
  let v=0;for(const q of ctx.opponents(p))v+=Math.min(3.5,len(q.x-sp.x,q.z-sp.z));
  v-=len(sp.x-p.x,sp.z-p.z)*.25;
  if(o){const d=len(o.x-sp.x,o.z-sp.z);if(d<2.6)v-=3;if(!laneClear(o,sp,ctx,p.team))v-=2.5*skill.decision;}
  v+=(ctx.rng.next()-.5)*(1-skill.decision)*2;
  if(v>best.v){best.v=v;best.spot=sp;}
 }
 return best.spot;
}

function withBall(p,ctx,skill){
 const ring=ctx.court.ring(p.team),d=len(ring.x-p.x,ring.z-p.z),open=nearestOpponentDistance(p,ctx),held=ctx.state.ball.heldTicks/60;
 if(p.charge>=0&&p.plan?.action?.type==='shoot')return p.plan;
 if(ctx.dunkEligible(p)&&ctx.rng.next()<skill.dunkRate)return {target:{x:ring.x,z:ring.z},action:{type:'dunk'}};
 const w=ctx.config.shot,hold=Math.max(w.tapMax+.02,Math.min(w.maxHold-.02,(w.perfectFrom+w.perfectTo)/2+(ctx.rng.next()-.5)*2*skill.timingNoise));
 const three=ctx.court.points(p.team,p.x,p.z)===3;
 if(d<skill.shootRange&&open>skill.openNeeded||three&&d<skill.shootRange+1.4&&open>skill.openNeeded+.6&&ctx.rng.next()<skill.threeRate||held>skill.patience&&d<skill.shootRange+2.2)return {target:{x:p.x,z:p.z},action:{type:'shoot',hold}};
 const mate=ctx.teammate(p);
 if(mate&&!mate.inactive&&held>skill.minHold){
  const mOpen=nearestOpponentDistance(mate,ctx),mD=len(ring.x-mate.x,ring.z-mate.z);
  if(mOpen>skill.openNeeded+.4&&laneClear(p,mate,ctx,p.team)&&(mD<d-1||open<1.1)&&ctx.rng.next()<skill.passRate)return {target:{x:p.x,z:p.z},action:{type:'pass'}};
 }
 // Drive: toward the rim, sliding away from the nearest defender in the way.
 let tx=ring.x-(ring.x-p.x)/(d||1)*1.4,tz=ring.z-(ring.z-p.z)/(d||1)*1.4;
 let blocker=null,bd=Infinity;for(const q of ctx.opponents(p)){const qd=len(q.x-p.x,q.z-p.z);const ahead=((q.x-p.x)*(ring.x-p.x)+(q.z-p.z)*(ring.z-p.z))>0;if(ahead&&qd<bd){bd=qd;blocker=q;}}
 if(blocker&&bd<2.4){const ux=(ring.x-p.x)/(d||1),uz=(ring.z-p.z)/(d||1),side=((blocker.x-p.x)*uz-(blocker.z-p.z)*ux)>0?-1:1;tx=p.x+ux*1.6+uz*side*1.7;tz=p.z+uz*1.6-ux*side*1.7;}
 return {target:{x:tx,z:tz},action:null};
}

function defend(p,ctx,skill){
 const o=ctx.owner,hoop=ctx.court.ring(o.team),mates=ctx.state.players.filter(q=>q.team===p.team&&!q.inactive);
 const attackers=ctx.opponents(p),other=attackers.find(q=>q!==o)||o;
 // Role: guard the handler if I am the nearest of my team to him (the
 // child's player counts as covering whoever he is nearer to).
 const mine=mates.reduce((m,q)=>len(q.x-o.x,q.z-o.z)<len(m.x-o.x,m.z-o.z)?q:m,p);
 const man=mine===p?o:other;
 const toHoopX=hoop.x-man.x,toHoopZ=hoop.z-man.z,dh=len(toHoopX,toHoopZ)||1;
 const gap=man===o?skill.guardDistance:Math.min(dh*skill.sag+.9,dh-.6);
 const target={x:man.x+toHoopX/dh*gap,z:man.z+toHoopZ/dh*gap};
 let action=null;
 if(man===o&&len(o.x-p.x,o.z-p.z)<ctx.config.steal.range&&p.cd.steal<=0&&ctx.rng.next()<skill.stealRate)action={type:'steal'};
 return {target,action};
}

function loose(p,ctx,skill){
 const b=ctx.state.ball,mates=ctx.state.players.filter(q=>q.team===p.team&&!q.inactive),land=landing(ctx);
 if(b.pass&&b.pass.to===p.id)return {target:land,action:null};
 const chaser=mates.reduce((m,q)=>len(q.x-land.x,q.z-land.z)<len(m.x-land.x,m.z-land.z)?q:m,p);
 if(chaser===p||ctx.controlledId===mates.find(q=>q!==p)?.id&&len(p.x-land.x,p.z-land.z)<3)return {target:land,action:null};
 if(ctx.state.ball.lastTeam===p.team){const sp=spots(ctx,p.team)[4];return {target:sp,action:null};}
 const own=ctx.court.own(p.team);return {target:{x:own.x*.5+b.x*.25,z:own.z-Math.sign(own.z)*2.6},action:null};
}

export function thinkAI(p,ctx,skill){
 const o=ctx.owner;
 if(o===p)return withBall(p,ctx,skill);
 if(o&&o.team===p.team)return {target:offBallSpot(p,ctx,skill),action:null};
 if(o)return defend(p,ctx,skill);
 return loose(p,ctx,skill);
}

/** Reflexes between decisions: contest a visible shot start, jump for a rebound. */
export function aiBlockReaction(p,ctx,skill,dt){
 const o=ctx.owner,b=ctx.state.ball;
 if(p.blockAt>=0){p.blockAt-=dt;if(p.blockAt<0){p.plan={...(p.plan||{}),action:{type:'jump'}};}return;}
 if(o&&o.team!==p.team&&(o.state==='shoot'||o.state==='dunk')&&!o.blockSeen?.[p.id]){
  o.blockSeen={...(o.blockSeen||{}),[p.id]:true};
  if(len(o.x-p.x,o.z-p.z)<ctx.config.block.aiRange&&ctx.rng.next()<skill.blockRate)p.blockAt=skill.reaction*ctx.config.block.aiTiming*(.8+.4*ctx.rng.next());
  return;
 }
 if(o&&o.blockSeen&&o.state!=='shoot'&&o.state!=='dunk')o.blockSeen=null;
 if(!o&&(!b.shot||b.shot.resolved)&&!b.pass&&b.vy<0&&b.y>2&&b.y<3.1&&len(b.x-p.x,b.z-p.z)<.9&&p.jumpT<0&&p.cd.block<=0&&ctx.rng.next()<skill.reboundRate)p.plan={...(p.plan||{}),action:{type:'jump'}};
}
