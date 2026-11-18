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
  if(ai.lastPossession!==S.possession){ai.lastPossession=S.possession;ai.plan=null;ai.planT=0;ai.transition=1.6;ai.chain=0;ai.oopTried=null;}
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
   if(api.aiV2)tgt=inboundReceiverSpot(tgt,ib.spot,s,api.court);
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

/** v2: the man receiving an inbound pass is never sent beyond the baseline or sideline. A throw-in
 * near the baseline of the attacked basket used to send him `spot.x + s*1.8`, i.e. out of bounds,
 * and the pass was caught there: a violation. Pure: returns a point at least `margin` inside. */
export function inboundReceiverSpot(tgt,spot,s,court,margin=1.2){
 const out={x:tgt.x,z:tgt.z};
 if(Math.abs(spot.x)>court.hx-3.5&&Math.sign(spot.x)===s&&Math.abs(spot.z)>court.hz)out.x=spot.x-s*1.8;   // sideline throw-in near the attacked baseline: come back, not forward
 out.x=clamp(out.x,-(court.hx-margin),court.hx-margin);out.z=clamp(out.z,-(court.hz-margin),court.hz-margin);
 return out;
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
  if(api.aiV2){
   // v2: two crash the glass (the bigs), the rest get back; v1 sent three of the four, leaving the
   // defence outnumbered in the paint and the offence taking 47% of the rebounds
   if(!reboundCrasher(p,api.onCourt(t),sh.shooter)){setGoal(p,spot(api,t,p.pos==='PG'?-8:-6.5,p.z>0?3:-3),0.7);return;}
   setGoal(p,{x:rim.x-Math.sign(rim.x)*1.8,z:(p.z>0?1.3:-1.3)},0.9);
  } else {
  if(p.pos==='PG'||p.pos==='SG'&&p.slot%2){setGoal(p,spot(api,t,-8,0),0.6);return;}   // floor balance
  setGoal(p,{x:rim.x-Math.sign(rim.x)*1.8,z:(p.z>0?1.3:-1.3)},0.9);
  }
 } else if(api.aiV2){
  // v2 defence: the three men nearest the rim take the glass around it, the others still box out their man
  const near=api.onCourt(t).filter(q=>q.id!==S.controlled||S.autopilot).sort((a,c)=>api.dist(a,rim)-api.dist(c,rim)).slice(0,3),ix=near.indexOf(p);
  const o=api.byId(S.teams[t].ai.assign[p.id]);
  if(ix>=0){setGoal(p,{x:rim.x-Math.sign(rim.x)*(ix===1?2.0:1.6),z:(ix-1)*1.5},1,Math.atan2(rim.x-p.x,rim.z-p.z));}
  else if(o){const k=1.2/Math.max(0.5,api.dist(o,rim));setGoal(p,{x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k},1,Math.atan2(rim.x-p.x,rim.z-p.z));}
  else setGoal(p,{x:rim.x-Math.sign(rim.x)*1.5,z:0},1);
 } else {
  // box out: get between the assigned man and the rim
  const o=api.byId(S.teams[t].ai.assign[p.id]);
  if(o){const k=0.9/Math.max(0.5,api.dist(o,rim));setGoal(p,{x:o.x+(rim.x-o.x)*k,z:o.z+(rim.z-o.z)*k},1,Math.atan2(rim.x-p.x,rim.z-p.z));}
  else setGoal(p,{x:rim.x-Math.sign(rim.x)*1.5,z:0},1);
 }
 const reach=(p.r.height||200)/100*1.25,d=hyp(p.x-b.x,p.z-b.z);
 if(d<1.6&&b.vy<0&&b.y<reach+1.3&&b.y>reach-0.2&&(b.touchedRim||b.y<rim.y-0.1))api.startJump(p,'rebound');
}

/** v2: who crashes the offensive boards: the two biggest on the floor (C, PF), never the shooter. */
export function reboundCrasher(p,mates,shooterId){
 if(p.id===shooterId)return false;
 const bigs=mates.filter(q=>q.id!==shooterId&&(q.pos==='C'||q.pos==='PF'));
 const rank=(q)=>(q.pos==='C'?2:1);
 return bigs.sort((a,c)=>rank(c)-rank(a)).slice(0,2).includes(p);
}
/** How a player's position and abilities tilt the man with the ball (pure; the difficulty
 * numbers and shot chances stay untouched, only the choice between shot, drive and pass):
 * bigs rarely launch threes and like to drive, shooters take an open three a little earlier,
 * point guards look for the pass first. `pace` (team tactics, 0..1) makes a team shoot earlier
 * or wait for a better look. */
export function rolePreference(p,pace=0.5){
 const a=p.abilities||{},pos=p.pos,shooting=(a.shooting??50)/100,dunk=(a.dunk??50)/100,passing=(a.passing??50)/100;
 return {
  three:pos==='C'?0.6:pos==='PF'?0.85:clamp(0.9+0.3*(shooting-0.5),0.8,1.03),
  drive:clamp(0.95+0.5*(dunk-0.5)+(pos==='C'||pos==='PF'?0.1:0),0.8,1.2),
  pass:clamp(0.92+0.25*(passing-0.5)+(pos==='PG'?0.05:0),0.85,1.1),
  patience:clamp(1.15-0.3*pace,0.95,1.15),
 };
}
/** Off-ball defence by the man's abilities: stay home on a shooter, sag further off a non-shooter
 * to clog the lane. A multiplier on the help-side gap, bounded to a fifth either way. */
export function offBallSag(q){
 const shooting=((q.abilities?.shooting??50)-50)/50;   // -0.6..1
 return clamp(1-0.2*shooting,0.8,1.2);
}
/** Who on the floor deserves the ball: an open shooter behind the arc, a rolling big at the rim. */
export function receiverBonus(q,open,threePoint){
 const a=q.abilities||{};let bonus=0;
 if(threePoint&&open>2.2&&(a.shooting??50)>=68)bonus+=0.1*((a.shooting-60)/30);
 if(!threePoint&&(q.role==='roll'||q.role==='cut')&&(a.dunk??50)>=65)bonus+=0.1;
 return clamp(bonus,0,0.2);
}

// v1: any man within 1.1 m was "pressure", but the on-ball defender normally stands 0.9-1.0 m away,
// so a handler was under pressure all the time and passed sideways after 0.6 s. v2: tight = 0.8 m.
const PRESSURE_V1={close:1.1,near:1.9,hold:0.6},PRESSURE_V2={close:0.8,near:1.6,hold:1.1};
/** How much the man with the ball is bothered: 0 free, 1 a defender on him, 2 two defenders
 * within reach (a trap). Read only from positions. */
function passPressure(api,p,t){
 const tight=api.aiV2?PRESSURE_V2:PRESSURE_V1;
 let close=0,near=0;for(const o of api.onCourt(1-t)){const d=api.dist(o,p);if(d<tight.close)close++;if(d<tight.near)near++;}
 return close>=1&&near>=2?2:close>=1?1:0;
}
/** Why the handler may pass (pure; null = keep the ball). `progress` is how much closer to the
 * rim the receiver stands than the passer (metres). Sideways or backward passes (progress < 1,
 * receiver not cutting or rolling) go only under pressure, with the clock dying, when the
 * receiver's look is clearly better than mine and open, or after a long fruitless probe; and
 * a pass never bounces straight back to the man who just delivered the ball unless I am pressured. */
export function passReason({progress=0,role=null,receiverOpen=0,receiverShot=0,myShot=0,worth=1,pressure=0,hold=0,clock=24,backToPasser=false,pressureHold=0.6,sidewaysNeed=null,stuckHold=3.2}){
 const advancing=progress>=1||role==='cut'||role==='roll'||role==='giveGo';
 if(backToPasser&&pressure<1&&clock>=5)return null;
 if(advancing)return 'advance';
 if(clock<5&&receiverOpen>1.4)return 'clock';
 // v2 (sidewaysNeed = {open,gain}): a sideways pass must go to a man who is really open and whose
 // look is at least as good as mine; otherwise the pass only moves the ball around
 const worthwhile=!sidewaysNeed||receiverOpen>=sidewaysNeed.open&&receiverShot>=myShot*sidewaysNeed.gain;
 if(pressure>=2||pressure>=1&&hold>=pressureHold)return worthwhile?'pressure':null;
 if(receiverOpen>2.2&&receiverShot>myShot+0.25&&receiverShot>worth&&hold>=0.5)return 'look';
 if(hold>=stuckHold&&receiverOpen>1.2&&worthwhile)return 'stuck';
 return null;
}

function openness(api,t,pt){let m=9;for(const o of api.onCourt(1-t))m=Math.min(m,hyp(o.x-pt.x,o.z-pt.z));return m;}

function laneClear(api,t,from,to,r,except){
 const dx=to.x-from.x,dz=to.z-from.z,L=hyp(dx,dz)||1;
 for(const o of api.onCourt(1-t)){
  if(o===except)continue;
  const u=((o.x-from.x)*dx+(o.z-from.z)*dz)/(L*L);if(u<0||u>1)continue;
  const px=from.x+dx*u,pz=from.z+dz*u;if(hyp(o.x-px,o.z-pz)<r)return false;
 }
 return true;
}

// v3: AI defenders go for blocks 1.6x as often (the shot mix moved to the rim, where blocks happen, and they fell 2.52 -> 2.21)
const BLOCK_V3=1.6;
function shotValue(api,p,t,pref){
 const S=api.S,s=api.side(t),d=api.court.distToRim(s,p.x,p.z),pts=api.court.points(s,p.x,p.z);
 const open=openness(api,t,p);
 const skill=pts===3?api.eff(p,'three'):d<3?api.eff(p,'inside'):api.eff(p,'mid');
 const base=pts===3?0.33:d<3?0.6:0.42;
 const contest=clamp((1.8-open)/1.5,0,1);
 return pts*base*(0.55+0.65*skill)*(1-0.45*contest)*(pts===3&&pref?pref.three:1);
}

function offenseMove(api,p,t){
 const S=api.S,T=S.teams[t],s=api.side(t),rim=api.court.rim(s),h=api.holder();
 const transition=T.ai.transition>0;
 if(h===p){handlerMove(api,p,t);return;}
 // three-second rule: leave the lane before the count runs out
 if(h&&p.paintT>1.7){const o=FIVE_OUT[p.pos]||[-5,0];p.role=null;setGoal(p,spot(api,t,o[0],o[1]),1);return;}
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
 // M3: the handler is doubled (two defenders on him) and nobody is cutting: the nearest free mate cuts to the rim,
 // the release pass or the lob is what breaks a trap (measured: a cutter existed in 46% of doubled moments before).
 // Only a cut that can win: from outside the trap (2.5 m+ from the handler), with his own man not ahead of him
 // to the rim and the line past that man open. A cut into traffic was measured as +1.4 turnovers a game.
 if(api.play&&api.play.doubledCut!==false&&h&&passPressure(api,h,t)>=2&&!api.onCourt(t).some(q=>q!==h&&q!==p&&q.role==='cut')){
  const near=api.onCourt(t).filter(q=>q!==h&&api.dist(q,h)>=(api.play.cutFrom??2.5)&&(q.id!==S.controlled||S.autopilot)).sort((a,c)=>api.dist(a,h)-api.dist(c,h))[0];
  const canWin=!dfd||api.dist(dfd,rim)>api.dist(p,rim)-0.4;
  if(near===p&&canWin&&laneClear(api,t,p,rim,0.8,dfd)){setGoal(p,{x:rim.x-s*1.2,z:p.z>0?0.8:-0.8},1,null,true);p.role='cut';return;}
 }
 // relocate a little around the spot so the defence has to move
 const wob=Math.sin((S.tick/60+p.slot*1.7)*0.9)*0.9;
 let goal={x:pt.x,z:pt.z+wob};
 // M3 spacing: at most play.spacingMax mates within play.spacingRadius of the handler. A spot that would make one
 // more is pushed out along its own line from the handler (cutters and rollers are exempt: they are the play)
 if(api.play&&api.play.spacing!==false&&h){const R=api.play.spacingRadius??2.5,gd=hyp(goal.x-h.x,goal.z-h.z);
  if(gd<R){const crowd=api.onCourt(t).filter(q=>q!==h&&q!==p&&api.dist(q,h)<R).length;if(crowd>=(api.play.spacingMax??2)){const k=(R+0.4)/Math.max(gd,0.3);goal={x:h.x+(goal.x-h.x)*k,z:h.z+(goal.z-h.z)*k};}}}
 setGoal(p,goal,0.7);
}

function handlerMove(api,p,t){
 const S=api.S,T=S.teams[t],s=api.side(t),rim=api.court.rim(s);
 const front=api.court.frontcourt(s,p.x);
 const top=spot(api,t,-7.4,p.z*0.3);
 if(p.act)return;
 // A dead dribble (ball held in both hands): shoot or pass, never walk with it.
 if(p.dead){const q=api.onCourt(t).filter(o=>o!==p&&laneClear(api,t,p,o,0.7)).sort((a,c)=>openness(api,t,c)-openness(api,t,a))[0];if(q&&(S.shotClock>6||api.rand()<0.5)&&api.dist(p,rim)>3)api.startPass(p,q,'chest');else api.startShot(p,false);return;}
 if(!front||S.teams[t].ai.transition>0&&api.court.distToRim(s,p.x,p.z)>9){
  // push the ball up the floor; attack in transition if the lane is clear
  if(laneClear(api,t,p,rim,1.6)&&S.teams[t].ai.transition>0){setGoal(p,{x:rim.x-s*0.8,z:0},1,null,true);}
  else setGoal(p,top,1,null,!front);
  return;
 }
 const d=api.court.distToRim(s,p.x,p.z),open=openness(api,t,p),clock=S.shotClock;
 const hurry=clock<6.5;
 // someone asked for the ball (the child's teammate pressed pass)
 if(p.intent.wantPass){const q=api.byId(p.intent.wantPass);p.intent.wantPass=null;if(q){api.startPass(p,q,null);return;}}
 // M3: a mate at the rim asked for the lob (the child's off-ball shoot button): thrown when he is still eligible and the line is open
 if(p.intent.wantOop){const w=p.intent.wantOop;if(S.tick>w.until)p.intent.wantOop=null;else{const q=api.byId(w.id);if(q&&api.oopEligible(q)&&laneClear(api,t,p,q,0.6)){p.intent.wantOop=null;api.startPass(p,q,'lob');return;}}}
 const pref=rolePreference(p,T.tactics.pace??0.5),myShot=shotValue(api,p,t,pref);
 // options
 // what the rest of the possession is worth: a good team waits for a shot better than that,
 // early in the clock it needs a really good look, late it takes what is there; a fast-paced
 // team is happier with an early look, a patient point guard waits for a better one
 const worth=(clock>16?1.08:0.62+clamp((clock-4.5)/11.5,0,1)*0.46)*pref.patience;
 const settled=24-clock>3.5||open>2.6;
 let best={kind:'hold',v:0.55+(1-clamp(clock/24,0,1))*-0.2};
 if(myShot>worth&&settled||hurry&&myShot>0.3)best={kind:'shoot',v:myShot+(hurry?0.4:0)};
 if(d<2.4&&open>0.8)best={kind:'shoot',v:1.5};
 // drive when the lane is clear
 // v2: after 1.5 s with the ball a narrower lane is enough to attack (0.72 m instead of 1.1) and a lesser handle (0.45 instead of 0.55): the handler attacks instead of waiting
 const holdT=S.ball.dribbleT||0,patient=api.aiV2&&holdT>=1.5,laneR=patient?0.72:1.1,needHandle=patient?0.45:0.55;
 if(d>2.2&&laneClear(api,t,p,rim,laneR)&&api.eff(p,'handle')>needHandle){const v=(0.9+api.eff(p,'inside')*0.6)*pref.drive;if(v>best.v)best={kind:'drive',v};}
 // passes: the receiver's own look, plus who he is (an open shooter, a big rolling to the rim).
 // v4: a pass needs a reason (passReason): a man advancing to the rim down an open line, a look
 // clearly better than mine, pressure on me, a dying clock, or a stuck probe. Sideways and
 // backward passes without one of those are not thrown, and never straight back to the man who
 // just gave me the ball.
 const hold=S.ball.dribbleT||0,pressure=passPressure(api,p,t);
 // M3: a mate cutting or rolling to the rim down an open line gets the alley-oop lob with probability
 // play.aiOopChance, rolled once per cut (the roll is forgotten when he stops cutting)
 if(api.play&&api.play.aiOop!==false){const tried=T.ai.oopTried||(T.ai.oopTried=new Set());
  for(const q of api.onCourt(t)){if(q===p)continue;const cutting=q.role==='cut'||q.role==='roll'||q.role==='giveGo';if(!cutting){tried.delete(q.id);continue;}
   if(tried.has(q.id)||!api.oopEligible(q)||!laneClear(api,t,p,q,0.6))continue;tried.add(q.id);
   if(api.rand()<(api.play.aiOopChance??0.08)){T.ai.chain=(T.ai.chain||0)+1;p.lastPassReason='oop';api.startPass(p,q,'lob');return;}}}
 // a short chain only: two passes (three under pressure) before somebody must shoot or attack
 const chain=T.ai.chain||0;
 if(chain<(pressure>=1?2:1)+(api.aiV2?1:0))for(const q of api.onCourt(t)){
  if(q===p)continue;
  if(S.frontcourtSet&&!api.court.frontcourt(s,q.x))continue;
  if(!laneClear(api,t,p,q,0.7))continue;
  if(d-api.court.distToRim(s,q.x,q.z)<1&&pressure<2&&clock>=5)continue;
  const qOpen=openness(api,t,q),three=api.court.points(s,q.x,q.z)===3;
  const qShot=shotValue(api,q,t,rolePreference(q));
  const v=(qShot*0.92+(q.role==='cut'||q.role==='roll'?0.35:0)+receiverBonus(q,qOpen,three))*pref.pass;
  const reason=passReason({pressureHold:api.aiV2?PRESSURE_V2.hold:PRESSURE_V1.hold,sidewaysNeed:api.aiV2?{open:1.8,gain:0.95}:null,progress:d-api.court.distToRim(s,q.x,q.z),role:q.role,receiverOpen:qOpen,receiverShot:qShot,myShot,worth,pressure,hold,clock,backToPasser:!!(S.lastPasser&&S.lastPasser.id===q.id&&S.tick-S.lastPasser.tick<150)});
  if(!reason)continue;
  const margin=reason==='advance'||reason==='pressure'||reason==='clock'?0.08:0.2;
  if(v>best.v+margin||reason==='pressure'&&v>best.v-0.1||reason==='stuck'&&v>best.v-0.05)best={kind:'pass',v,q,reason};
 }
 // play call: pick and roll if the defender is close
 if(best.kind==='hold'&&(T.tactics.offense==='pnr'||T.call==='pnr')&&!T.ai.plan){T.ai.plan='pnr';T.ai.planT=0;}
 if(best.kind==='shoot'){api.startShot(p,false);return;}
 if(best.kind==='pass'){p.lastPassReason=best.reason;T.ai.chain=(T.ai.chain||0)+1;api.startPass(p,best.q,api.dist(p,best.q)>9?'lob':(api.rand()<0.25?'bounce':'chest'));return;}
 if(best.kind==='drive'){setGoal(p,{x:rim.x-s*0.9,z:p.z*0.3},1,null,true);if(d<3.2)api.startShot(p,false);return;}
 // isolation / patience: probe toward an open lane, sometimes a crossover
 const ang=Math.sin(S.tick/70+p.slot)*0.8;
 const prog=clamp((24-clock)/18,0,1),reach=6.4-prog*3.2;
 setGoal(p,{x:rim.x-s*(reach+Math.cos(ang)*0.6),z:clamp(p.z+Math.sin(ang)*2*(1-prog*0.6),-5,5)},0.6+prog*0.35,null,prog>0.5);
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
  const ballD=api.dist(o,h);gap=clamp((1.2+ballD*0.22)*offBallSag(o),1.0,3.8);
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
  if(h.act==='shoot'&&d<1.8&&h.actT>h.shot.releaseAt-0.35&&api.rand()<api.diff.blockRate*(api.aiV2?BLOCK_V3:1)*(0.5+api.eff(p,'block')))api.startJump(p,'block');
 }
 // rim protection
 if(h&&h.act==='shoot'&&!onBall&&api.dist(p,h)<2.2&&(h.shot.type==='layup'||h.shot.type==='dunk')&&api.rand()<api.diff.blockRate*(api.aiV2?BLOCK_V3:1)*api.eff(p,'block'))api.startJump(p,'block');
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
 if(h&&h.act==='shoot'&&api.dist(p,h)<1.9&&api.rand()<api.diff.blockRate*(api.aiV2?BLOCK_V3:1)*(0.5+api.eff(p,'block')))api.startJump(p,'block');
}
