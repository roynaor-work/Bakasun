/** Browser-safe probes: supply actual runtime exports and config as `r`. */
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const options=(r,quality,extra={})=>({config:{...r.applySoccerFull(structuredClone(r.base),{v241:false}),quality},seed:18273,stage:5,difficulty:'normal',aiVersion:'v2',rulesVersion:'v1',feelVersion:'v2',airVersion:'v23',v241:false,...extra});
export function tacticalProbe(r,{enabled=false}={}){
 const lanes=[],errors=[],targets=[];
 // Same seeds and visible body layouts in both conditions. The baseline target
 // comes directly from the match's own compiled design controller.
 for(let k=0;k<24;k++){
  const game=r.createSoccer(options(r,{team:enabled})),s=game.getState(),home=s.players.filter(p=>p.team===0&&p.role!=='keeper'),rivals=s.players.filter(p=>p.team===1&&p.role!=='keeper');
  s.controlled=0;s.elapsed=3+k*.2;const carrier=s.players[0];carrier.x=-5+k*.7;carrier.z=Math.sin(k*.7)*13;carrier.hold=.8;
  for(const [i,p]of home.entries())if(p!==carrier){p.x=-22+i*5;p.z=(i%5-2)*9;p.vx=Math.sin(i+k);p.vz=Math.cos(i-k);}
  for(const [i,p]of rivals.entries()){p.x=-8+i*5+Math.sin(k+i)*3;p.z=(i%5-2)*8+Math.cos(k*.5+i)*3;p.vx=Math.sin(k+i)*2;p.vz=Math.cos(k+i)*2;}
  Object.assign(s.ball,{owner:carrier.id,lastTeam:0,x:carrier.x,z:carrier.z,vx:0,vz:0});
  for(const p of home)if(p!==carrier){const target=game.tacticalTarget(p);let clear=4;for(const rival of rivals)clear=Math.min(clear,r.passLaneClearance(rival,carrier,target));lanes.push(clear);targets.push({x:target.x,z:target.z});}
  // Turnover near midfield: one press, the remaining block returns to the same
  // authored defence anchors. The nearby danger zone keeps baseline marking.
  s.elapsed+=1;const rival=rivals[0];rival.x=12+k*.2;rival.z=Math.sin(k)*10;Object.assign(s.ball,{owner:rival.id,lastTeam:1,x:rival.x,z:rival.z});
  for(const p of home)if(p!==carrier){const target=game.tacticalTarget(p),anchor=r.soccerFullAnchor(p.tacticalRole,'defense',r.SOCCER_TACTICS_DATA.formations.find(f=>f.id==='4-4-2').phases.find(p=>p.id==='defense'),s.ball,s.attackDir,105,68);if(target.duty==='press'||!anchor)continue;errors.push(distance(target,anchor)**2);}
 }
 return {attackingTargets:lanes.length,meanLaneClearance:mean(lanes),returnTargets:errors.length,returnAnchorRms:Math.sqrt(mean(errors)),finite:targets.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))};
}
export function chaseProbe(r,{enabled=false,stage=5,difficulty='normal'}={}){
 const game=r.createSoccer(options(r,{difficulty:enabled},{stage,difficulty})),s=game.getState();
 s.controlled=0;const carrier=s.players[0],chaser=s.players[3];
 for(const p of s.players){p.recover=1000;p.vx=p.vz=0;}
 Object.assign(carrier,{x:12,z:0,recover:0,cooldown:100});Object.assign(chaser,{x:-8,z:0,recover:0,cooldown:100,think:100});
 Object.assign(s.ball,{owner:carrier.id,lastTeam:0,x:carrier.x,z:carrier.z,y:r.base.physics.ballRadius,grace:0});
 let seconds=0;while(seconds<20&&distance(chaser,carrier)>2){game.update(r.base.match.fixedStep,{moveX:0,moveZ:0});seconds+=r.base.match.fixedStep;}
 return {stage,difficulty,seconds:+seconds.toFixed(6),arrived:distance(chaser,carrier)<=2,remaining:distance(chaser,carrier)};
}
export function elevenProbe(r,{enabled=true,formation='4-4-2',seconds=60}={}){
 let config={...structuredClone(r.base),quality:{eleven:enabled}};
 if(formation==='4-3-3')config=r.applySoccerFull(config,{formation,v241:false});
 const game=r.createSoccer({config,seed:7291,stage:5,difficulty:'normal',v241:false}),s=game.getState();
 let invalid=0;for(let i=0;i<seconds/r.base.match.fixedStep;i++){game.update(r.base.match.fixedStep,{moveX:Math.sin(i/90)*.65,moveZ:Math.cos(i/90)*.65});for(const p of s.players)if(![p.x,p.z,p.vx,p.vz].every(Number.isFinite))invalid++;}
 return {formation,actors:s.players.length,teams:[0,1].map(team=>{const ps=s.players.filter(p=>p.team===team);return {count:ps.length,keepers:ps.filter(p=>p.role==='keeper').length,uniqueRoles:new Set(ps.map(p=>p.tacticalRole)).size};}),legacySlots:s.players.slice(0,8).map(p=>({id:p.id,team:p.team,role:p.role,templateId:p.templateId})),savedCards:config.team.players.length,invalid,elapsed:s.elapsed,phase:s.phase};
}
/** Physical recovery probe: actual integrator and AI for eight seconds. A fixed
 * rival carrier and unavailable rival runners isolate team movement; no target
 * is teleported into place and the same fixture is used for both conditions. */
export function returnMotionProbe(r,{enabled=false,seed=7301}={}){
 const game=r.createSoccer(options(r,{team:enabled},{role:'keeper',seed})),s=game.getState(),c=r.applySoccerFull(r.base,{v241:false}),phase=r.SOCCER_TACTICS_DATA.formations.find(f=>f.id==='4-4-2').phases.find(p=>p.id==='defense');
 s.controlled=2;s.elapsed=2;const carrier=s.players[3];Object.assign(carrier,{x:18,z:3,recover:1000,cooldown:1000});
 for(const [i,p]of s.players.filter(p=>p.team===1&&p.id!==3).entries())Object.assign(p,{x:15+i*2,z:(i%5-2)*9,recover:1000,cooldown:1000});
 const home=s.players.filter(p=>p.team===0&&p.role!=='keeper');
 for(const [i,p]of home.entries())Object.assign(p,{x:22+i*.8,z:(i%5-2)*9,vx:0,vz:0,cooldown:1000,think:1000});
 Object.assign(s.ball,{owner:carrier.id,lastTeam:1,x:carrier.x,z:carrier.z,grace:0});
 const sample=()=>{const fields=home.filter(p=>game.tacticalTarget(p).duty!=='press');return Math.sqrt(mean(fields.map(p=>distance(p,r.soccerFullAnchor(p.tacticalRole,'defense',phase,s.ball,s.attackDir,c.pitch.length,c.pitch.width,c.full.shape))**2)));};
 const out={initialRms:sample(),at4Seconds:null,at8Seconds:null};
 for(let i=1;i<=480;i++){Object.assign(s.ball,{owner:carrier.id,lastTeam:1,x:carrier.x,z:carrier.z,grace:0});game.update(1/60,{});if(i===240)out.at4Seconds=sample();if(i===480)out.at8Seconds=sample();}
 return out;
}
