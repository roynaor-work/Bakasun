/** Larger squads on larger pitches, as a pure transform of the soccer config.
 * `?soccerTeams=6|8|11` (page URL) or an explicit option picks the preset; no value keeps today's 6-a-side
 * on the 48x30 pitch, so every existing contract is unchanged. Distances that describe the field
 * (pitch, lines, AI ranges, camera) grow with the pitch; distances between bodies (radius, pickup,
 * marking gap) barely do, and speeds grow with the square root so crossing the field takes longer
 * but not proportionally longer. Exponents were tuned in the headless simulation (gameplay-2 report). */
export const SOCCER_TEAM_PRESETS={
 '6':{extras:2,length:48,width:30},
 '7':{extras:3,length:58,width:36},
 '8':{extras:4,length:68,width:42},
 '11':{extras:7,length:105,width:68,tune:{speedExp:.7}}
};
/** The product default (session) is 7-a-side on 58x36; the model's own default stays 6 so every contract is unchanged. `?soccerTeams=6` restores today's game. */
export const SOCCER_PRODUCT_TEAMS='8';
export function resolveSoccerTeams(option,fallback='6'){
 const pick=v=>Object.hasOwn(SOCCER_TEAM_PRESETS,String(v))?String(v):null;
 const search=globalThis.location?.search;
 return pick(option)||(typeof search==='string'?pick(new URLSearchParams(search).get('soccerTeams')):null)||fallback;
}
const map=(list,f)=>Array.isArray(list)?list.map(f):list;
export function applySoccerTeams(config,option,override={}){
 const key=resolveSoccerTeams(option),preset=SOCCER_TEAM_PRESETS[key],tune={...preset.tune,...override};
 if(key==='6'&&config.pitch.length===preset.length&&config.pitch.width===preset.width&&(config.squad?.extraPlayersPerTeam??0)===preset.extras)return config;
 const base=SOCCER_TEAM_PRESETS['6'],kl=preset.length/base.length,kw=preset.width/base.width,kd=(kl+kw)/2,P=e=>Math.pow(kd,e),ks=P(tune.speedExp??.5),ps=P(tune.shootExp??.7);
 const round=n=>Math.round(n*1000)/1000,pitch=config.pitch;
 const scaled={...config,squad:{...config.squad,extraPlayersPerTeam:preset.extras},
  pitch:{...pitch,length:preset.length,width:preset.width,goalWidth:round(pitch.goalWidth*P(.4)),goalHeight:round(pitch.goalHeight*P(.1)),penaltyDepth:round(pitch.penaltyDepth*P(1.5)),penaltyWidth:round(pitch.penaltyWidth*P(1.3)),penaltySpot:round(pitch.penaltySpot*P(1.3)),goalAreaDepth:round(pitch.goalAreaDepth*P(1.1)),goalAreaWidth:round(pitch.goalAreaWidth*P(1))},
  players:{...config.players,speed:round(config.players.speed*ks)},
  physics:{...config.physics,shotSpeed:round(config.physics.shotSpeed*ks),shotBoost:round(config.physics.shotBoost*ks),passSpeed:round(config.physics.passSpeed*ks)},
  passing:{...config.passing,minDistance:round(config.passing.minDistance*P(.6)),maxDistance:round(config.passing.maxDistance*P(tune.passExp??.8)),groundTravelSeconds:round(config.passing.groundTravelSeconds*P(.3)),travelSeconds:round(config.passing.travelSeconds*P(.3))},
  goalkeeping:{...config.goalkeeping,puntMinDistance:round(config.goalkeeping.puntMinDistance*P(.7)),puntMaxDistance:round(config.goalkeeping.puntMaxDistance*P(.7))},
  restarts:{...config.restarts,throwReach:round(config.restarts.throwReach*P(.7))},
  stages:config.stages.map(row=>({...row,speed:round(row.speed*ks)})),
  ai:{...config.ai,
   kickoffX:map(config.ai.kickoffX,v=>round(v*kl)),kickoffZ:round(config.ai.kickoffZ*kw),
   requestDistance:round(config.ai.requestDistance*P(.5)),requestClearance:round(config.ai.requestClearance*P(.2)),
   supportAdvance:round(config.ai.supportAdvance*P(.8)),strikerAdvance:round(config.ai.strikerAdvance*P(.8)),supportGoalInset:round(config.ai.supportGoalInset*P(.5)),supportWidth:round(config.ai.supportWidth*P(.8)),
   defenseDepth:round(config.ai.defenseDepth*P(.8)),teamDefenseDepth:round(config.ai.teamDefenseDepth*P(.8)),
   teamShootDistance:round(config.ai.teamShootDistance*ps),opponentShootDistance:round(config.ai.opponentShootDistance*ps),
   crossRange:round(config.ai.crossRange*P(.8)),crossWidth:round(config.ai.crossWidth*P(.8)),wingWidth:round(config.ai.wingWidth*kw),
   attackCombinationDistance:round(config.ai.attackCombinationDistance*P(.7)),catchUpDistance:round(config.ai.catchUpDistance*P(.8)),
   keeperChaseDistance:round(config.ai.keeperChaseDistance*P(.5)),keeperChaseRadius:round(config.ai.keeperChaseRadius*P(.5)),keeperBaseReach:round(config.ai.keeperBaseReach*P(.4)),
   attack:Object.fromEntries(Object.entries(config.ai.attack).map(([name,row])=>[name,{...row,shootDistance:round(row.shootDistance*ps),speed:row.speed}]))},
  tactics:{...config.tactics,lanes:map(config.tactics.lanes,v=>round(v*kw)),advance:map(config.tactics.advance,v=>round(v*P(.8))),defenseDepth:round(config.tactics.defenseDepth*P(.8)),zoneBallShift:round((config.tactics.zoneBallShift??0)*P(.8)),minTeamWidth:round(config.tactics.minTeamWidth*P(.8)),
   wideAttack:config.tactics.wideAttack&&{...config.tactics.wideAttack,width:round(config.tactics.wideAttack.width*kw),range:round(config.tactics.wideAttack.range*P(.8))}},
  view:config.view&&{...config.view,camera:config.view.camera&&{...config.view.camera,nearDistance:round(config.view.camera.nearDistance*P(.7)),portraitNearDistance:round(config.view.camera.portraitNearDistance*P(.7)),portraitFollowRange:round(config.view.camera.portraitFollowRange*P(.7)),speedZoom:round(config.view.camera.speedZoom*P(.7)),farPlane:round(config.view.camera.farPlane*kl)}}
 };
 // Product preset only: a ground pass the player aims arrives at about 10 m/s instead of 14 (measured, pass-bench: -4 points of intended
 // receiver, +2 points intercepted, in return for a first touch that looks like a pass and not a shot).
 if(key===SOCCER_PRODUCT_TEAMS&&scaled.assistance?.passing)scaled.assistance={...scaled.assistance,passing:{...scaled.assistance.passing,travelBaseSeconds:.45,travelPerMetre:.03}};
 // Product preset: a slide takes about half a second longer to get up from. The authored fall and get-up are 2.6 s of clip; in 0.6 s they were
 // played at up to 3x (pops of 53-57 degrees per frame). With 1.1 s they play at about 1.5x and the body is upright when control returns.
 if(key===SOCCER_PRODUCT_TEAMS&&scaled.slide)scaled.slide={...scaled.slide,recoverSeconds:round(scaled.slide.recoverSeconds+.5),maxTotalSeconds:round((scaled.slide.maxTotalSeconds??1.2)+.5),
  variants:scaled.slide.variants&&Object.fromEntries(Object.entries(scaled.slide.variants).map(([name,v])=>[name,{...v,recoverSeconds:round(v.recoverSeconds+.5)}]))};
 return scaled;
}
