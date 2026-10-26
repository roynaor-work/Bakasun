/** Island Pro Basketball — team AI. Every computer player has a role in a team plan:
 * offence (spacing spots, pick and roll, give and go, cuts, isolation, transition) and defence
 * (man to man with help and switches, or a 2-3 zone, box-outs). Decisions happen at a human
 * reaction rate and read only what is visible on the court: positions, the ball and the clocks. */
const hyp=Math.hypot,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// spacing spots relative to the attacked rim: [along (towards mid-court, metres), across]
const SPOTS={
 PG:[-7.6,0.4],SG:[-5.4,5.6],SF:[-5.4,-5.6],PF:[-0.3,6.6],C:[-1.4,-2.3],
};
const FIVE_OUT={PG:[-7.6,0.4],SG:[-5.4,5.6],SF:[-5.4,-5.6],PF:[-0.3,6.6],C:[-0.3,-6.6]};

export function teamThink(api,dt,mode){
 const S=api.S;
 for(const t of [0,1]){
  const T=S.teams[t];
  if(!T.ai)T.ai={assign:{},plan:null,planT:0,lastPossession:null,zoneShift:0};
  const ai=T.ai;
  if(ai.lastPossession!==S.possession){ai.lastPossession=S.possession;ai.plan=null;ai.planT=0;ai.transition=1.6;}
  ai.transition=Math.max(0,(ai.transition||0)-dt);
  assignDefence(api,t);
  for(const p of api.onCourt(t)){
   if(p.id===S.controlled&&!S.autopilot)continue;
   p.think-=dt;
   const reaction=api.diff.reaction*(t===S.userTeam?0.75:1);
   if(p.think<=0){p.think=reaction*(0.7+api.rand()*0.6);decide(api,p,t,mode);}
   steer(api,p);
  }
  if(T.call){T.callT+=dt;if(T.callT>6)T.call=null;}
 }
}

/** Rim-relative point -> court point for team t (along<0 = towards mid-court). */
function spot(api,t,along,across){const s=api.side(t),rim=api.court.rim(s);return {x:rim.x+s*along,z:across};}

function assignDefence(api,t){
 const S=api.S,T=S.teams[t],ai=T.ai,mine=api.onCourt(t),theirs=api.onCourt(1-t);
 const valid=Object.keys(ai.assign).length===mine.length&&mine.every(p=>theirs.some(o=>o.id===ai.assign[p.id]));
 if(valid)return;
 ai.assign={};
 const order=['PG','SG','SF','PF','C'],used=new Set();
 for(const pos of order){
  const d=mine.find(p=>p.pos===pos&&!ai.assign[p.id]);if(!d)continue;
  const o=theirs.find(q=>q.pos===pos&&!used.has(q.id))||theirs.filter(q=>!used.has(q.id)).sort((a,b)=>api.dist(a,d)-api.dist(b,d))[0];
  if(o){ai.assign[d.id]=o.id;used.add(o.id);}
 }
 for(const d of mine)if(!ai.assign[d.id]){const o=theirs.find(q=>!used.has(q.id));if(o){ai.assign[d.id]=o.id;used.add(o.id);}}
}

function setGoal(p,pt,speed,face,sprint){p.goal={x:pt.x,z:pt.z};p.goalSpeed=speed;p.goalFace=face??null;p.goalSprint=!!sprint;}

function steer(api,p){
 const it=p.intent;
 if(!p.goal){it.x=0;it.z=0;it.speed=0;return;}
 const dx=p.goal.x-p.x,dz=p.goal.z-p.z,d=hyp(dx,dz);
 if(d<0.25){it.x=0;it.z=0;it.speed=0;}
 else{it.x=dx/d;it.z=dz/d;it.speed=clamp(d/1.2,0.25,1)*p.goalSpeed;}
 it.sprint=p.goalSprint&&d>3;
 it.face=p.goalFace;
}

function decide(api,p,t,mode){
 const S=api.S,b=S.ball,offense=S.possession===t&&b.state!=='loose'&&b.state!=='shot'||(b.state==='shot'&&b.shot?.team===t);
 if(mode==='inbound'){inboundMove(api,p,t);return;}
 if(b.state==='loose'){chaseLoose(api,p,t);return;}
 if(b.state==='shot'){reboundMove(api,p,t);return;}
 if(offense)offenseMove(api,p,t);else defenseMove(api,p,t);
}

function inboundMove(api,p,t){
 const S=api.S,ib=S.inbound;if(!ib)return;
 const s=api.side(t);
 if(ib.team===t){
  if(p.id===ib.inbounder){setGoal(p,p,0);return;}
  if(p.id===ib.receiver){
   const sideline=Math.abs(ib.spot.z)>api.court.hz;
   let tgt=sideline?{x:ib.spot.x+s*1.8,z:Math.sign(ib.spot.z)*(api.court.hz-3.2)}:{x:ib.spot.x+s*3.0,z:ib.spot.z+ (ib.spot.z>0?-2:2)};
   if(S.frontcourtSet&&s*tgt.x<1.2)tgt.x=s*1.2;
   setGoal(p,tgt,0.85,Math.atan2(ib.spot.x-tgt.x,ib.spot.z-tgt.z));return;}
  const pos=SPOTS[p.pos]||[-5,0],back=Math.abs(ib.spot.x)>12&&Math.sign(ib.spot.x)===-s;
  const pt=back?{x:-s*4+s*(pos[1]>0?2:-2),z:pos[1]*0.7}:spot(api,t,pos[0],pos[1]);
  setGoal(p,pt,0.8);
 } else {
  const o=api.byId(S.teams[t].ai.assign[p.id]);
  if(!o){setGoal(p,spot(api,1-t,-3,0),0.8);return;}
  const rim=api.court.rim(api.side(1-t)),k=1.2/Math.max(1,api.dist(o,rim));
  setGoal(p,{x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k},0.9,Math.atan2(o.x-p.x,o.z-p.z));
 }
}

function chaseLoose(api,p,t){
 const S=api.S,b=S.ball;
 const mine=api.onCourt(t).filter(q=>q.id!==S.controlled).sort((a,c)=>api.dist(a,b)-api.dist(c,b));
 const rank=mine.indexOf(p);
 if(rank<2){
  // aim at where the ball comes down
  const tLand=b.vy>0?(b.vy/api.C.physics.gravity)*1.6:0.25;
  const pt={x:b.x+b.vx*tLand,z:b.z+b.vz*tLand};
  setGoal(p,pt,1,null,true);
  const reach=(p.r.height||200)/100*1.25;
  if(api.dist(p,b)<1.4&&b.y>reach&&b.y<reach+1.2&&b.vy<0)api.startJump(p,'rebound');
 } else {
  const s=api.side(t),back=spot(api,1-t,-6,p.pos==='PG'?0:(p.slot%2?3:-3));
  setGoal(p,api.onCourt(1-t).length?back:p,0.6);
 }
}

function reboundMove(api,p,t){
 const S=api.S,b=S.ball,sh=b.shot;if(!sh)return;
 const rim=api.court.rim(sh.side),attacking=sh.team===t;
 if(attacking){
  if(p.id===sh.shooter)return setGoal(p,p,0);
  if(p.pos==='PG'||p.pos==='SG'&&p.slot%2){setGoal(p,spot(api,t,-8,0),0.6);return;}   // floor balance
  setGoal(p,{x:rim.x-Math.sign(rim.x)*1.8,z:(p.z>0?1.3:-1.3)},0.9);
 } else {
  // box out: get between the assigned man and the rim
  const o=api.byId(S.teams[t].ai.assign[p.id]);
  if(o){const k=0.9/Math.max(0.5,api.dist(o,rim));setGoal(p,{x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k},1,Math.atan2(rim.x-p.x,rim.z-p.z));}
  else setGoal(p,{x:rim.x-Math.sign(rim.x)*1.5,z:0},1);
 }
 const reach=(p.r.height||200)/100*1.25,d=hyp(p.x-b.x,p.z-b.z);
 if(d<1.6&&b.vy<0&&b.y<reach+1.3&&b.y>reach-0.2&&(b.touchedRim||b.y<rim.y-0.1))api.startJump(p,'rebound');
}

function openness(api,t,pt){let m=9;for(const o of api.onCourt(1-t))m=Math.min(m,hyp(o.x-pt.x,o.z-pt.z));return m;}

function laneClear(api,t,from,to,r){
 const dx=to.x-from.x,dz=to.z-from.z,L=hyp(dx,dz)||1;
 for(const o of api.onCourt(1-t)){
  const u=((o.x-from.x)*dx+(o.z-from.z)*dz)/(L*L);if(u<0||u>1)continue;
  const px=from.x+dx*u,pz=from.z+dz*u;if(hyp(o.x-px,o.z-pz)<r)return false;
 }
 return true;
}

function shotValue(api,p,t){
 const S=api.S,s=api.side(t),d=api.court.distToRim(s,p.x,p.z),pts=api.court.points(s,p.x,p.z);
 const open=openness(api,t,p);
 const skill=pts===3?api.eff(p,'three'):d<3?api.eff(p,'inside'):api.eff(p,'mid');
 const base=pts===3?0.33:d<3?0.6:0.42;
 const contest=clamp((1.8-open)/1.5,0,1);
 return pts*base*(0.55+0.65*skill)*(1-0.45*contest);
}

function offenseMove(api,p,t){
 const S=api.S,T=S.teams[t],s=api.side(t),rim=api.court.rim(s),h=api.holder();
 const transition=T.ai.transition>0;
 if(h===p){handlerMove(api,p,t);return;}
 // catch a pass coming my way
 if(p.intent.catchAt){setGoal(p,p.intent.catchAt,1,null,false);return;}
 const call=T.call||(T.tactics.offense==='pnr'&&T.ai.planT<3?'pnr':null);
 // pick and roll: the big sets a screen beside the handler's defender, then rolls
 if(call==='pnr'&&h&&(p.pos==='C'||p.pos==='PF'&&!api.onCourt(t).some(q=>q.pos==='C'))){
  const hd=api.onCourt(1-t).find(o=>S.teams[1-t].ai.assign[o.id]===h.id);
  T.ai.planT+=api.diff.reaction;
  if(hd&&T.ai.planT<2.2){const side=h.z>0?-1:1;setGoal(p,{x:hd.x+0.1*s,z:hd.z+side*0.6},1,Math.atan2(h.x-p.x,h.z-p.z));p.role='screen';return;}
  p.role='roll';setGoal(p,{x:rim.x-s*1.6,z:h.z>0?0.9:-0.9},1,null,true);return;
 }
 p.role=null;
 const pos=FIVE_OUT[p.pos]||SPOTS[p.pos]||[-5,0];
 let pt=spot(api,t,pos[0],pos[1]);
 if(transition){pt=spot(api,t,pos[0]-1.5,pos[1]*0.9);setGoal(p,pt,1,null,true);return;}
 // cut to the rim when the defender is out of position (behind or far)
 const dfd=api.onCourt(1-t).find(o=>S.teams[1-t].ai.assign[o.id]===p.id);
 if(dfd&&h){
  const myRim=api.dist(p,rim),dRim=api.dist(dfd,rim);
  if(dRim>myRim+0.6||api.dist(dfd,p)>3.2){if(laneClear(api,t,p,rim,0.9)){setGoal(p,{x:rim.x-s*1.2,z:p.z>0?0.8:-0.8},1,null,true);p.role='cut';return;}}
 }
 // give and go: after passing, cut
 if(S.lastPasser&&S.lastPasser.id===p.id&&S.tick-S.lastPasser.tick<60){setGoal(p,{x:rim.x-s*1.6,z:p.z>0?1.2:-1.2},1,null,true);p.role='giveGo';return;}
 // relocate a little around the spot so the defence has to move
 const wob=Math.sin((S.tick/60+p.slot*1.7)*0.9)*0.9;
 setGoal(p,{x:pt.x,z:pt.z+wob},0.7);
}

function handlerMove(api,p,t){
 const S=api.S,T=S.teams[t],s=api.side(t),rim=api.court.rim(s);
 const front=api.court.frontcourt(s,p.x);
 const top=spot(api,t,-7.4,p.z*0.3);
 if(p.act)return;
 if(!front||S.teams[t].ai.transition>0&&api.court.distToRim(s,p.x,p.z)>9){
  // push the ball up the floor; attack in transition if the lane is clear
  if(laneClear(api,t,p,rim,1.6)&&S.teams[t].ai.transition>0){setGoal(p,{x:rim.x-s*0.8,z:0},1,null,true);}
  else setGoal(p,top,1,null,!front);
  return;
 }
 const d=api.court.distToRim(s,p.x,p.z),open=openness(api,t,p),clock=S.shotClock;
 const hurry=clock<4.5;
 // someone asked for the ball (the child's teammate pressed pass)
 if(p.intent.wantPass){const q=api.byId(p.intent.wantPass);p.intent.wantPass=null;if(q){api.startPass(p,q,null);return;}}
 const myShot=shotValue(api,p,t);
 // options
 // what the rest of the possession is worth: a good team waits for a shot better than that,
 // early in the clock it needs a really good look, late it takes what is there
 const worth=clock>16?1.08:0.62+clamp((clock-4.5)/11.5,0,1)*0.46;
 const settled=24-clock>3.5||open>2.6;
 let best={kind:'hold',v:0.55+(1-clamp(clock/24,0,1))*-0.2};
 if(myShot>worth&&settled||hurry&&myShot>0.3)best={kind:'shoot',v:myShot+(hurry?0.4:0)};
 if(d<2.4&&open>0.8)best={kind:'shoot',v:1.5};
 // drive when the lane is clear
 if(d>2.2&&laneClear(api,t,p,rim,1.1)&&api.eff(p,'handle')>0.55){const v=0.9+api.eff(p,'inside')*0.6;if(v>best.v)best={kind:'drive',v};}
 // passes
 for(const q of api.onCourt(t)){
  if(q===p)continue;
  if(S.frontcourtSet&&!api.court.frontcourt(s,q.x))continue;
  if(!laneClear(api,t,p,q,0.7))continue;
  const v=shotValue(api,q,t)*0.92+(q.role==='cut'||q.role==='roll'?0.35:0);
  if(v>best.v+0.08)best={kind:'pass',v,q};
 }
 // play call: pick and roll if the defender is close
 if(best.kind==='hold'&&(T.tactics.offense==='pnr'||T.call==='pnr')&&!T.ai.plan){T.ai.plan='pnr';T.ai.planT=0;}
 if(best.kind==='shoot'){api.startShot(p,false);return;}
 if(best.kind==='pass'){api.startPass(p,best.q,api.dist(p,best.q)>9?'lob':(api.rand()<0.25?'bounce':'chest'));return;}
 if(best.kind==='drive'){setGoal(p,{x:rim.x-s*0.9,z:p.z*0.3},1,null,true);if(d<3.2)api.startShot(p,false);return;}
 // isolation / patience: probe toward an open lane, sometimes a crossover
 const ang=Math.sin(S.tick/70+p.slot)*0.8;
 setGoal(p,{x:rim.x-s*(6.2+Math.cos(ang)),z:clamp(p.z+Math.sin(ang)*2,-5,5)},0.6);
 if(open<1.1&&api.rand()<0.25*api.eff(p,'handle'))api.startMove(p);
}

function defenseMove(api,p,t){
 const S=api.S,T=S.teams[t],other=1-t,s=api.side(other),rim=api.court.rim(s),h=api.holder();
 if(T.ai.transition>0&&h&&!api.court.frontcourt(s,h.x)){
  // sprint back: get below the ball
  const o=api.byId(T.ai.assign[p.id]);
  const pt=o?{x:(o.x+rim.x)/2,z:o.z*0.6}:{x:rim.x-s*3,z:0};
  setGoal(p,pt,1,null,true);return;
 }
 if(T.tactics.defense==='zone')return zoneMove(api,p,t);
 const o=api.byId(T.ai.assign[p.id]);if(!o){setGoal(p,{x:rim.x-s*2,z:0},0.8);return;}
 const onBall=h&&h.id===o.id;
 const dRim=Math.max(0.6,api.dist(o,rim));
 let gap=onBall?clamp(0.9+(api.court.points(s,o.x,o.z)===3&&api.eff(o,'three')>0.75?-0.2:0.3),0.7,1.4):1.6;
 if(!onBall&&h){
  // help side: sag towards the ball and the paint
  const ballD=api.dist(o,h);gap=clamp(1.2+ballD*0.22,1.2,3.6);
 }
 const k=Math.min(gap/dRim,0.85);
 let pt={x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k};
 if(!onBall&&h){const w=0.18;pt.x+=(h.x-pt.x)*w;pt.z+=(h.z-pt.z)*w;}
 // help the beaten defender: the driver is closer to the rim than his man
 if(h&&!onBall){
  const hd=api.onCourt(t).find(q=>T.ai.assign[q.id]===h.id);
  if(hd&&api.dist(h,rim)+0.6<api.dist(hd,rim)&&api.dist(h,rim)<5.5){
   const helpers=api.onCourt(t).filter(q=>q!==hd&&q.id!==S.controlled).sort((a,c)=>api.dist(a,h)-api.dist(c,h));
   if(helpers[0]===p){pt={x:h.x+(rim.x-h.x)*0.45,z:h.z+(rim.z-h.z)*0.45};p.role='help';}
  }
 }
 // switch on a screen: if a teammate's man is closer to me and mine is screened off, swap
 if(onBall&&h){
  const screener=api.onCourt(other).find(q=>q!==h&&api.dist(q,p)<1.0);
  if(screener&&api.rand()<api.eff(p,'perimD')){
   const mate=api.onCourt(t).find(q=>T.ai.assign[q.id]===screener.id);
   if(mate&&mate.id!==S.controlled){T.ai.assign[mate.id]=h.id;T.ai.assign[p.id]=screener.id;}
  }
 }
 setGoal(p,pt,1,Math.atan2((onBall?o.x:h?h.x:o.x)-p.x,(onBall?o.z:h?h.z:o.z)-p.z),api.dist(p,pt)>3);
 // on-ball pressure: steals and contests
 if(onBall&&h){
  const d=api.dist(p,h);
  if(d<1.3&&h.act!=='shoot'&&api.rand()<api.diff.stealRate*api.eff(p,'steal'))api.startSteal(p);
  if(h.act==='shoot'&&d<1.8&&h.actT>h.shot.releaseAt-0.35&&api.rand()<api.diff.blockRate*(0.5+api.eff(p,'block')))api.startJump(p,'block');
 }
 // rim protection
 if(h&&h.act==='shoot'&&!onBall&&api.dist(p,h)<2.2&&(h.shot.type==='layup'||h.shot.type==='dunk')&&api.rand()<api.diff.blockRate*api.eff(p,'block'))api.startJump(p,'block');
}

function zoneMove(api,p,t){
 const S=api.S,other=1-t,s=api.side(other),rim=api.court.rim(s),b=S.ball;
 // 2-3 zone, shifted towards the ball
 const zones={PG:[-5.6,2.2],SG:[-5.6,-2.2],SF:[-1.8,4.2],PF:[-1.8,-4.2],C:[-1.4,0]};
 const z=zones[p.pos]||[-3,0];
 const bx=clamp((b.z)*0.35,-2,2),bu=clamp(-s*(b.x-rim.x),0,8);
 const pt={x:rim.x+s*z[0]*(0.85+bu*0.02),z:z[1]+bx};
 setGoal(p,pt,0.9,Math.atan2(b.x-p.x,b.z-p.z));
 const h=api.holder();
 if(h&&api.dist(p,h)<1.2&&api.rand()<api.diff.stealRate*0.5*api.eff(p,'steal'))api.startSteal(p);
 if(h&&h.act==='shoot'&&api.dist(p,h)<1.9&&api.rand()<api.diff.blockRate*(0.5+api.eff(p,'block')))api.startJump(p,'block');
}
