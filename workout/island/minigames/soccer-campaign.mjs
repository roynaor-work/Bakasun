// Match-only campaign tuning. No storage or rewards: the existing score decides
// wins and stars, while optional objectives teach different football actions.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>Number.isFinite(n)?n:0;
const lerp=(a,b,t)=>a+(b-a)*t;
const round=n=>Math.round(n*1000)/1000;
const campaignBase=Symbol('soccerCampaignBase');
export const SOCCER_CAMPAIGN_STAGES=30;
const formations=[
  ['balanced','wide','compact','counter','diamond'],
  ['wide','counter','balanced','compact','press'],
  ['diamond','wide','counter','press','compact'],
  ['counter','balanced','diamond','compact','press'],
  ['compact','press','wide','counter','diamond'],
  ['press','wide','diamond','counter','balanced']
];
const styles={
  balanced:{pace:1,pass:1,build:1,shot:1,press:1},
  wide:{pace:.99,pass:.86,build:1.06,shot:1.03,press:.95},
  compact:{pace:.97,pass:1.04,build:1.08,shot:1.04,press:1.06},
  counter:{pace:1.03,pass:1.08,build:.86,shot:.92,press:.94},
  press:{pace:1.01,pass:.94,build:.94,shot:.98,press:1.08},
  diamond:{pace:.99,pass:.80,build:1.10,shot:1.06,press:1}
};
const objectiveRows=[
  [['goals',1],['passes',2],['shots',2],['tackles',1],['cleanSheet',1]],
  [['passes',3],['lofts',1],['goals',2],['tackles',2],['shots',3]],
  [['passes',4],['headers',1],['tackles',2],['lofts',2],['cleanSheet',1]],
  [['goals',2],['passes',5],['headers',1],['tackles',3],['shots',4]],
  [['tackles',3],['lofts',2],['passes',6],['goals',3],['cleanSheet',1]],
  [['passes',6],['headers',2],['tackles',4],['shots',5],['goals',3]]
];
const keeperObjectives=[['saves',2],['passes',2],['passes',3],['saves',3],['cleanSheet',1]];
const statKeys={goals:'goals',passes:'completedPasses',shots:'shots',lofts:'lofts',headers:'headers',tackles:'tackles',saves:'saves',clearances:'clearances'};
const objective=(row)=>({id:row[0],nameId:`soccer.campaign.objective.${row[0]}`,target:row[1],optional:true});

/** Finite, detached profile for menu, simulation and the in-match objective HUD. */
export function campaignStage(stage=1,config={}){
  stage=clamp(Math.round(finite(stage))||1,1,SOCCER_CAMPAIGN_STAGES);
  const region=Math.floor((stage-1)/5),index=(stage-1)%5,formation=formations[region][index];
  const teams=config.opponents?.teams||[],configured=config.campaign?.stages?.[stage-1];
  return {
    stage,region:region+1,round:index+1,
    nameId:`soccer.campaign.stage.${stage}`,regionId:`soccer.campaign.region.${region+1}`,
    opponentId:teams[(stage-1)%Math.max(1,teams.length)]?.nameId||`soccer.campaign.opponent.${stage}`,
    formation,formationId:`soccer.campaign.formation.${formation}`,
    pace:styles[formation].pace,
    difficulty:round((stage-1)/(SOCCER_CAMPAIGN_STAGES-1)),
    objective:objective(objectiveRows[region][index]),
    keeperObjective:objective(keeperObjectives[index]),
    ...(configured&&typeof configured==='object'?{
      // Presentation may override labels, never numeric difficulty or save data.
      ...(typeof configured.nameId==='string'?{nameId:configured.nameId}:{}),
      ...(typeof configured.regionId==='string'?{regionId:configured.regionId}:{})
    }:{})
  };
}

/** Extend legacy ten-stage opposition without saturating every card at 99. */
export function campaignOpponent(config,stage){
  const n=campaignStage(stage,config).stage,rows=config.stages||[];
  if(n<=10&&rows[n-1])return {...rows[n-1]};
  if(rows[n-1])return {...rows[n-1]};
  const base=rows[Math.min(9,rows.length-1)]||{},t=(n-10)/20;
  return {...base,speed:round(lerp(base.speed??4.95,5.65,t)),pressure:round(lerp(base.pressure??1.25,1.7,t)),
    stealRate:round(lerp(base.stealRate??3.6,4.4,t)),keeper:round(lerp(base.keeper??.84,.94,t)),
    thinkSeconds:round(lerp(base.thinkSeconds??.38,.24,t)),accuracy:round(lerp(base.accuracy??.95,1,t)),
    tackleReach:round(lerp(base.tackleReach??1.455,1.65,t)),help:false};
}

/** Runtime clone: city ranks, saved roster, match duration and result economics
 * remain byte-for-byte values. AI timing and spacing make each fixture different. */
export function campaignConfig(config,stage=1){
  // A session may pass its already tuned view config to the pure model. Always
  // derive tuning from its original values rather than multiplying it twice.
  config=config[campaignBase]||config;
  const profile=campaignStage(stage,config),n=profile.stage,style=styles[profile.formation],early=clamp((n-1)/9,0,1),late=clamp((n-10)/20,0,1);
  const ai={...config.ai,attack:{}};
  for(const [key,value] of Object.entries(config.ai.attack)){
    ai.attack[key]={...value,
      speed:round(value.speed*lerp(.86,1,early)*lerp(1,1.08,late)*style.pace),
      stealRate:round(value.stealRate*lerp(.10,1,early)*style.press),
      tackleReach:round(value.tackleReach*lerp(.62,1,early)),
      thinkSeconds:round(value.thinkSeconds*lerp(2.9,1,early)*lerp(1,.88,late)),
      passHold:round(value.passHold*style.pass*lerp(1.22,1,early)),
      buildSeconds:round(value.buildSeconds*style.build*lerp(1.18,1,early)),
      shotHold:round(value.shotHold*style.shot*lerp(1.3,1,early)),
      shotIntervalSeconds:round(value.shotIntervalSeconds*lerp(1.6,1,early)*lerp(1,.86,late))
    };
  }
  // stage itself still reaches 30; only the formula for opponent attributes is
  // softened after stage ten. Home cards and purchased ranks are never rewritten.
  const roster={...config.roster};
  if(n>10){const first=roster.opponentBase+9*roster.stageGain,target=lerp(first,Math.min(config.card.max-5,90),late);roster.stageGain=(target-roster.opponentBase)/(n-1);}
  const result={...config,ai,roster,campaign:profile,
    stages:Array.from({length:SOCCER_CAMPAIGN_STAGES},(_,i)=>campaignOpponent(config,i+1)),
    tactics:{...config.tactics,stageFormation:profile.formation},
    opponents:{...config.opponents,minSpeedRatio:round(lerp(.4,config.opponents.minSpeedRatio,early)*lerp(1,1.08,late))}
  };
  Object.defineProperty(result,campaignBase,{value:config});return result;
}

export function createCampaignStats(){
  return {completedPasses:0,shots:0,lofts:0,headers:0,tackles:0,goals:0,saves:0,clearances:0,pendingPass:null,pendingShot:null,lastEventId:0};
}

/** Observes real contact events. It cannot take possession, move a ball, award
 * currency or alter the legacy eight-field result. Replayed events count once. */
export function recordCampaignEvent(stats,event,state){
  if(!stats||!event||!Number.isSafeInteger(event.id)||event.id<=stats.lastEventId)return stats;
  stats.lastEventId=event.id;
  const player=state.players?.[event.player],team=event.team??player?.team;
  if(event.type==='pass'||event.type==='loft'){
    stats.pendingPass=team===0?{from:event.player,target:event.target,kind:event.type}:null;
    if(team===0&&event.type==='loft')stats.lofts++;
    stats.pendingShot=null;
  }else if(event.type==='shot'){
    if(team===0)stats.shots++;
    stats.pendingPass=null;stats.pendingShot={team,player:event.player};
  }else if(event.type==='header'||event.type==='clearance'){
    if(team===0){stats[event.type==='header'?'headers':'clearances']++;if(event.type==='header')stats.shots++;}
    stats.pendingPass=null;stats.pendingShot={team,player:event.player};
  }else if(event.type==='possession'){
    if(team===0&&stats.pendingPass?.target===event.player&&stats.pendingPass.from!==event.player)stats.completedPasses++;
    if(team===0&&player?.role==='keeper'&&player.hands&&stats.pendingShot?.team===1)stats.saves++;
    stats.pendingPass=null;stats.pendingShot=null;
  }else if(['steal','slide-contact'].includes(event.type)){
    if(event.won){if(team===0)stats.tackles++;stats.pendingPass=null;stats.pendingShot=null;}
  }else if(event.type==='goal'){
    if(team===0)stats.goals++;
    stats.pendingPass=null;stats.pendingShot=null;
  }else if(event.type==='restart'||event.type==='halftime'){
    stats.pendingPass=null;stats.pendingShot=null;
  }
  return stats;
}

/** Optional achievement is transient: a loss can still teach a good action. */
export function stageObjective(state,profile=state.campaign){
  profile=profile||campaignStage(state.stage);
  const row=state.role==='keeper'?profile.keeperObjective:profile.objective,stats=state.campaignStats||{};
  const current=row.id==='cleanSheet'?(state.phase==='finished'&&state.score?.[1]===0?1:0):Math.max(0,finite(stats[statKeys[row.id]]));
  return {...row,current,complete:current>=row.target};
}
