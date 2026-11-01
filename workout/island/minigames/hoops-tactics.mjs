/** Runtime adapter for the authored five-player plans. It changes goals and decisions,
 * never possession, player coordinates, physics, scoring or the result contract. */
const POS=['PG','SG','SF','PF','C'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const entry=(list,id)=>list?.find(v=>v.id===id)?.parameters||{};
function numeric(spec,fallback){const n=spec?.example;if(!Number.isFinite(n))return fallback;const r=spec.recommendedRange;return Array.isArray(r)?clamp(n,r[0],r[1]):n;}
function positions(input){return POS.map(pos=>{const p=input?.[pos];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('Invalid basketball tactical position '+pos);return {x:p.x,y:p.y};});}
export function compileHoopsTactics(data){
 if(data?.sport!=='basketball'||data.schemaVersion!==1)throw Error('Invalid basketball tactics contract');
 const p=data.parameters||{},offBall=data.rules?.offBall,marking=data.rules?.markingAndHelp;
 const screen=entry(offBall,'screen_then_roll'),help=entry(marking,'one_helper'),gap=entry(marking,'on_ball_gap'),sag=entry(marking,'weak_side_sag');
 const offense={};for(const plan of data.offense||[]){let last=-1;offense[plan.id]={id:plan.id,label:plan.label,frames:plan.keyframes.map(frame=>{if(!Number.isFinite(frame.atMs)||frame.atMs<last)throw Error('Invalid basketball tactical timeline');last=frame.atMs;return {id:frame.id,time:frame.atMs/1000,owner:frame.ballOwner,positions:positions(frame.positions)};})};}
 const defense={};for(const plan of data.defense||[])defense[plan.id]={id:plan.id,label:plan.label,positions:positions(plan.positions)};
 if(!offense.spacing||!offense.pick_and_roll||!offense.isolation||!defense.man_to_man||!defense.zone_2_3)throw Error('Incomplete basketball tactics package');
 return {kind:'hoops-tactics-v1',source:'design/tactics/basketball.json',offense,defense,
  settings:{decision:numeric(p.decisionIntervalMs,240)/1000,arrival:numeric(p.arrivalRadiusM,.25),separation:Math.max(data.minSeparationM||.65,numeric(p.physicalClearanceM,.7)),speed:numeric(p.maxTargetSpeedMps,5.5),timeout:numeric(p.planTimeoutMs,5500)/1000,lateClock:numeric(p.lateClockSeconds,4.5),screenStop:numeric(screen.stationaryBeforeContactMs,250)/1000,screenSpacing:numeric(p.screenPartnerSpacingM,1.2),onBallGap:numeric(gap.onBallGapM,1),offBallGap:numeric(sag.offBallGapM,2.2),ballBlend:numeric(sag.ballBlend,.18),helpRange:numeric(help.helpRimRangeM,5.5),beatenMargin:numeric(help.beatenMarginM,.6)}};
}
export async function loadHoopsTactics({fetcher=globalThis.fetch,url=new URL('../design/tactics/basketball.json',import.meta.url)}={}){
 const response=await fetcher(url);if(!response.ok)throw Error('Basketball tactics unavailable: '+response.status);return compileHoopsTactics(await response.json());
}
export function tacticalWorldPoint(point,side,court,out={x:0,z:0}){out.x=side*(point.y-.5)*court.L;out.z=(point.x-.5)*court.W;return out;}
function mapRoles(players){
 const roles={},used=new Set();
 for(const pos of POS){let best=players.find(p=>p.pos===pos&&!used.has(p.id));
  if(!best){const skill=pos==='PG'?'pass':pos==='SG'?'three':pos==='PF'?'rebound':pos==='C'?'block':'dunk';for(const p of players)if(!used.has(p.id)&&(!best||p.r[skill]>best.r[skill]))best=p;}
  if(best){roles[pos]=best;used.add(best.id);}
 }
 return roles;
}
const offenseId=call=>call==='pnr'?'pick_and_roll':call==='iso'?'isolation':'spacing';
export function createHoopsTacticsController(compiled){
 const config=compiled?.kind==='hoops-tactics-v1'?compiled:compileHoopsTactics(compiled),K=config.settings;
 const states=[0,1].map(team=>({team,id:null,index:0,phaseTime:0,total:0,next:0,stationary:0,cancelled:false,roles:{},targets:[],active:false}));
 const scratch={x:0,z:0};
 function reset(state){state.id=null;state.index=0;state.phaseTime=state.total=state.stationary=0;state.targets.length=0;state.active=false;state.next=0;state.cancelled=false;}
 function ownerMatches(api,state,role){const expected=state.roles[role],h=api.holder(),b=api.S.ball;return !expected||h?.id===expected.id||b.state==='pass'&&b.pass?.to===expected.id;}
 function advancePlan(api,state,plan,dt){
  state.total+=dt;state.phaseTime+=dt;
  const current=plan.frames[state.index],next=plan.frames[state.index+1];if(!next)return;
  const pg=state.roles.PG,center=state.roles.C;
  if(state.id==='pick_and_roll'&&['screen_set','screen_ready','clear_screen','turn_corner'].includes(current.id)&&center){
   tacticalWorldPoint(current.positions[4],api.side(state.team),api.court,scratch);
   if(distance(center,scratch)<=K.arrival&&Math.hypot(center.vx,center.vz)<.35)state.stationary+=dt;else if(current.id==='screen_set')state.stationary=0;
  }
  if(state.phaseTime<next.time-current.time)return;
  if(current.id==='screen_set'&&state.stationary<K.screenStop)return;
  if(current.id==='clear_screen'&&pg&&center&&Math.abs(pg.z-center.z)<K.screenSpacing*.85)return;
  if(current.id==='turn_corner'&&pg&&center&&(pg.x-center.x)*api.side(state.team)<.2)return;
  if(!ownerMatches(api,state,next.owner))return;
  state.index++;state.phaseTime=0;state.next=0;
 }
 function target(state,p,x,z,role,face,speed=1){
  let v=state.targets.find(v=>v.player===p);if(!v){v={player:p,point:{x:0,z:0},role:null,face:null,speed:1};state.targets.push(v);}
  v.point.x=x;v.point.z=z;v.role=role;v.face=face;v.speed=speed;
 }
 function attackTargets(api,state,plan){
  const frame=plan.frames[state.index],dir=api.side(state.team),h=api.holder();
  for(let i=0;i<POS.length;i++){
   const p=state.roles[POS[i]];if(!p)continue;
   // A roll starts only after the real handler cleared the stationary screen.
   const point=state.id==='pick_and_roll'&&frame.id==='roll_start'&&POS[i]==='C'?plan.frames.at(-1).positions[i]:frame.positions[i];
   tacticalWorldPoint(point,dir,api.court,scratch);
   const role=state.id==='pick_and_roll'&&POS[i]==='C'?frame.id.startsWith('roll')?'roll':frame.id.startsWith('screen')||frame.id==='clear_screen'||frame.id==='turn_corner'?'screen':'spacing':state.id==='isolation'?'isolation-space':'spacing';
   target(state,p,scratch.x,scratch.z,role,h?Math.atan2(h.x-p.x,h.z-p.z):null);
  }
 }
 function defenseTargets(api,state,id){
  const h=api.holder(),rim=api.court.rim(-api.side(state.team)),team=api.S.teams[state.team],plan=config.defense[id],mine=api.onCourt(state.team);
  let helper=null,onBall=null;
  if(h){for(const p of mine)if(team.ai?.assign?.[p.id]===h.id){onBall=p;break;}
   if(onBall&&distance(h,rim)+K.beatenMargin<distance(onBall,rim)&&distance(h,rim)<K.helpRange){for(const p of mine)if(p!==onBall&&p.id!==api.S.controlled&&(!helper||distance(p,h)-api.eff(p,'block')*.6<distance(helper,h)-api.eff(helper,'block')*.6))helper=p;}
  }
  for(let i=0;i<POS.length;i++){
   const p=state.roles[POS[i]];if(!p)continue;
   tacticalWorldPoint(plan.positions[i],api.side(state.team),api.court,scratch);let x=scratch.x,z=scratch.z,role=id==='zone_2_3'?'zone':'mark';
   if(id==='zone_2_3')z+=clamp(api.S.ball.z*K.ballBlend,-2,2);
   else{
    const opponent=api.byId(team.ai?.assign?.[p.id]);if(opponent){const near=opponent===h,gap=near?K.onBallGap+(api.eff(opponent,'three')>.78?-.18:api.eff(opponent,'speed')>.8?.18:0):K.offBallGap,k=Math.min(gap/Math.max(.6,distance(opponent,rim)),.85);x=opponent.x+(rim.x-opponent.x)*k;z=opponent.z+(rim.z-opponent.z)*k;if(!near&&h){x+=(h.x-x)*K.ballBlend;z+=(h.z-z)*K.ballBlend;}}
   }
   if(p===helper){x=h.x+(rim.x-h.x)*.4;z=h.z+(rim.z-h.z)*.4;role='help';}
   target(state,p,x,z,role,h?Math.atan2(h.x-p.x,h.z-p.z):null);
  }
 }
 function reserveTargets(api,state){
  const min=Math.max(K.separation,api.C.player.radius*2);
  for(const t of state.targets)if(t.player.id===api.S.controlled&&!api.S.autopilot){t.point.x=t.player.x;t.point.z=t.player.z;}
  for(let i=0;i<state.targets.length;i++)for(let j=i+1;j<state.targets.length;j++){
   const a=state.targets[i],b=state.targets[j],d=distance(a.point,b.point);if(d>=min)continue;
   const offset=(min-d)*.5+.01,sign=i%2?1:-1;a.point.z+=sign*offset;b.point.z-=sign*offset;
  }
  for(const t of state.targets){t.point.x=clamp(t.point.x,-api.court.hx+.6,api.court.hx-.6);t.point.z=clamp(t.point.z,-api.court.hz+.6,api.court.hz-.6);}
 }
 function apply(api,state){
  const holder=api.holder(),clock=api.S.shotClock;
  for(const t of state.targets){
   const p=t.player;if(!p.onCourt||p.id===api.S.controlled&&!api.S.autopilot||p.act||p.intent.catchAt)continue;
   if(holder===p&&(clock<=K.lateClock||state.cancelled))continue;
   p.goal=t.point;p.goalFace=t.face;p.goalSpeed=Math.min(1,K.speed/(api.C.player.speed*(.72+.38*api.eff(p,'speed'))));p.goalSprint=false;p.role=t.role;
   const dx=t.point.x-p.x,dz=t.point.z-p.z,d=Math.hypot(dx,dz);p.intent.x=d>K.arrival?dx/d:0;p.intent.z=d>K.arrival?dz/d:0;p.intent.speed=d>K.arrival?clamp(d/1.2,.25,1)*p.goalSpeed:0;p.intent.face=t.face;p.intent.sprint=false;
  }
 }
 return {
  step(api,dt,mode){
   const S=api.S;if(mode!=='live'||S.phase!=='live'||!['held','pass'].includes(S.ball.state)){for(const state of states)reset(state);return;}
   for(const state of states){const T=S.teams[state.team],attacking=S.possession===state.team;let id=attacking?offenseId(T.call||T.tactics.offense):T.tactics.defense==='zone'?'zone_2_3':'man_to_man';
    if(state.id!==id||!state.active||POS.some(pos=>!state.roles[pos]?.onCourt)){reset(state);state.id=id;state.active=true;state.roles=mapRoles(api.onCourt(state.team));}
    if(attacking){let plan=config.offense[state.id];if(!state.cancelled)advancePlan(api,state,plan,dt);if(state.total>K.timeout||S.shotClock<=K.lateClock){if(!state.cancelled)state.next=0;state.cancelled=true;state.index=0;plan=config.offense.spacing;}
     if(state.next<=0)attackTargets(api,state,plan);
    }else if(state.next<=0)defenseTargets(api,state,id);
    if(state.next<=0){reserveTargets(api,state);state.next=K.decision;}state.next-=dt;apply(api,state);
   }
  },
  metrics(){return {loaded:true,source:config.source,decisionMs:K.decision*1000,teams:states.map(s=>({team:s.team,plan:s.cancelled?'spacing':s.id,phase:s.cancelled?'five_out':s.id&&config.offense[s.id]?config.offense[s.id].frames[s.index]?.id:s.id,cancelled:s.cancelled}))};}
 };
}
