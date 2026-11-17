/** Browser and Node share the same actual-engine fixtures. No RNG replacement,
 * no duplicate save model: all possession/goal outcomes come from createSoccer.
 * Targets declared before tuning: reachable-shot save rate +10 pp; no premature
 * dives (<80 ms); correct committed side >=95%; no target outside legal area.
 * Native v3 motion is a separate package and is not claimed as rendered here. */
export const KEEPER_TARGETS={saveRateGainPercentagePoints:10,prematureDiveCount:0,correctSideRate:.95,illegalTargetCount:0};
export function keeperShotFixture(createSoccer,config,{seed=1,quality=false,side=1,speed=20,range=10,height=.6,curve=0,category='reachable'}={}){
 const c={...config,quality:{...config.quality,keeper:quality}},g=createSoccer({config:c,seed,stage:3,difficulty:'normal',aiVersion:'v2',rulesVersion:'v1',feelVersion:'v2'}),s=g.getState(),dt=c.match.fixedStep,hx=c.pitch.length/2;
 s.phase='playing';s.phaseTime=0;s.attackDir=1;s.controlled=0;s.switchCooldown=100;s.restart=null;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:0,z:c.pitch.width/2-2,vx:0,vz:0,fx:p.team?-1:1,fz:0,cooldown:100,think:100,recover:100,slideTime:0,hands:false});
 const k=s.players.find(p=>p.team===0&&p.role==='keeper');Object.assign(k,{x:-hx+c.ai.keeperInset,z:0,cooldown:0,recover:0,think:0,diveTime:0,diveCooldown:0});
 const shooter=s.players.find(p=>p.team===1&&p.role!=='keeper'),goalZ=side*(category==='extreme'?c.pitch.goalWidth*.42:c.pitch.goalWidth*.30),launchX=k.x+range;
 // Aim at the entire-ball goal crossing plane, with room inside the posts.
 const t=(range+c.ai.keeperInset+c.physics.ballRadius)/speed,launchZ=-side*.45,vz=(goalZ-launchZ)/t;
 Object.assign(s.ball,{owner:null,thrower:null,flight:null,shot:{speed:Math.hypot(speed,vz),aim:Math.abs(goalZ)/(c.pitch.goalWidth/2),distance:range,shooter:shooter.id},x:launchX,z:launchZ,y:height,vx:-speed,vz,vy:Math.max(0,c.ball.gravity*t*.5),curve,lastTeam:1,lastPlayer:shooter.id,grace:0});
 let firstDive=null,observedSide=null,saved=false,goal=false,illegalTargets=0,targetSamples=0;
 for(let i=0;i<Math.ceil(2.5/dt);i++){
  g.update(dt,{moveX:0,moveZ:0});const at=(i+1)*dt;
  if(firstDive===null&&k.diveTime>0){firstDive=at;observedSide=Math.sign(k.diveZ);}
  if(k.qualityKeeper?.target){const target=k.qualityKeeper.target;targetSamples++;if(target.x< -hx+c.goalkeeping.areaInset-1e-6||target.x> -hx+c.pitch.penaltyDepth-c.goalkeeping.areaInset+1e-6||Math.abs(target.z)>c.pitch.goalWidth/2-c.ai.keeperPostInset+1e-6)illegalTargets++;}
  // A goal-kick restart assigns owner to the keeper too: that is not a save.
  if(s.phase==='playing'&&s.ball.owner===k.id&&k.hands){saved=true;break;}
  if(s.score[1]>0){goal=true;break;}
  if(s.phase!=='playing')break;
 }
 return {seed,quality,side,speed,range,height,category,saved,goal,firstDive,observedSide,correctSide:observedSide===null?null:observedSide===Math.sign(goalZ),illegalTargets,targetSamples};
}
export function measureKeeperScenarios(createSoccer,config,quality=false,{seeds=[7,19,41,67,101,143,211,307]}={}){
 const trials=[];
 for(const seed of seeds)for(const side of [-1,1])for(const speed of [16,20,24])for(const range of [8,12])trials.push(keeperShotFixture(createSoccer,config,{seed,quality,side,speed,range}));
 for(const seed of seeds)for(const side of [-1,1])trials.push(keeperShotFixture(createSoccer,config,{seed,quality,side,speed:30,range:3,height:1.6,category:'extreme'}));
 const reachable=trials.filter(t=>t.category==='reachable'),extreme=trials.filter(t=>t.category==='extreme'),dives=reachable.filter(t=>t.firstDive!==null),times=dives.map(t=>t.firstDive).sort((a,b)=>a-b);
 return {quality,targets:KEEPER_TARGETS,reachableTrials:reachable.length,reachableSaves:reachable.filter(t=>t.saved).length,reachableSaveRate:reachable.filter(t=>t.saved).length/reachable.length,extremeTrials:extreme.length,extremeSaveRate:extreme.filter(t=>t.saved).length/extreme.length,prematureDiveCount:dives.filter(t=>t.firstDive<.08-1e-8).length,correctSideRate:dives.length?dives.filter(t=>t.correctSide).length/dives.length:null,medianFirstDiveSeconds:times.length?times[Math.floor(times.length/2)]:null,illegalTargetCount:trials.reduce((n,t)=>n+t.illegalTargets,0),targetSamples:trials.reduce((n,t)=>n+t.targetSamples,0),trials};
}
