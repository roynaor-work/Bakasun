/** Saved first names are optional, local and never interpreted as markup. */
export const rosterAttributes=['pace','shot','pass','defense','reactions','catching'];
export function cleanFirstName(value,config){return String(value??'').normalize('NFKC').replace(/[^\p{Script=Hebrew}\p{Script=Latin}\s]/gu,'').trim().split(/\s+/)[0].slice(0,config.roster.nameMaxLength);}
export function initialSoccerRoster(players,card,config){
 return {role:'field',players:(Array.isArray(players)?players:[]).map((p,i)=>({id:p.id,name:'',number:config.roster.numbers[i],attributes:Object.fromEntries(rosterAttributes.map(k=>[k,i===0?card?.attributes?.[{pace:'pace',shot:'power',pass:'accuracy',defense:'defense'}[k]]??config.card.initial:config.card.initial])),points:Object.fromEntries(rosterAttributes.map(k=>[k,0]))})),training:{day:-1,awarded:0,outdoorDay:-1,completed:0}};
}
export function validSoccerRoster(r,players,c){const integer=n=>Number.isSafeInteger(n)&&n>=0;
 return !!r&&['field','keeper'].includes(r.role)&&Array.isArray(r.players)&&r.players.length===players.length&&r.players.every((p,i)=>p&&p.id===players[i].id&&typeof p.name==='string'&&p.name===cleanFirstName(p.name,c)&&Number.isInteger(p.number)&&p.number>=1&&p.number<=99&&rosterAttributes.every(k=>Number.isInteger(p.attributes?.[k])&&p.attributes[k]>=c.card.min&&p.attributes[k]<=c.card.max&&integer(p.points?.[k])&&p.points[k]<c.training.pointsPerAttribute))&&!!r.training&&['day','outdoorDay'].every(k=>Number.isSafeInteger(r.training[k])&&r.training[k]>=-1)&&integer(r.training.completed)&&integer(r.training.awarded)&&r.training.awarded<=c.training.dailyCap;
}
export function editSoccerPlayer(roster,id,input,c){const p=roster.players.find(p=>p.id===id);if(!p||!input||!Number.isInteger(input.number)||input.number<1||input.number>99)return {ok:false,reason:'reason.invalid'};p.name=cleanFirstName(input.name,c);p.number=input.number;return {ok:true};}
export function rosterCards(config,team,legacy,stage=1,difficulty='normal'){
 const home=team.players||config.team.players;
 return config.players.roster.map((entry,id)=>{
  const source=home[entry.template]||config.team.players[entry.template],saved=source.card,level=entry.team?config.roster.opponentBase+(stage-1)*config.roster.stageGain+config.roster.difficultyGain[difficulty]:config.card.initial;
  const attributes=Object.fromEntries(rosterAttributes.map(k=>[k,Math.max(config.card.min,Math.min(config.card.max,entry.team?level:saved?.attributes?.[k]??(entry.template===0?legacy?.attributes?.[{pace:'pace',shot:'power',pass:'accuracy',defense:'defense'}[k]]:undefined)??level))]));
  const keys=entry.role==='keeper'?rosterAttributes:['pace','shot','pass','defense'];
  return {id,name:entry.team?'':saved?.name||'',nameId:entry.team?`soccer.opponentPlayer.${entry.template}`:source.nameId,number:entry.team?config.roster.numbers[entry.template]:saved?.number??config.roster.numbers[entry.template],role:entry.role,team:entry.team,overall:Math.round(keys.reduce((n,k)=>n+attributes[k],0)/keys.length),...attributes};
 });
}
export function mergeSoccerRoster(current,incoming,config){
 if(current.role==='field')current.role=incoming.role;
 for(const [i,p] of current.players.entries()){const q=incoming.players.find(q=>q.id===p.id);if(!q)continue;if(!p.name)p.name=q.name;if(p.number===config.roster.numbers[i])p.number=q.number;for(const k of rosterAttributes){if(q.attributes[k]>p.attributes[k]){p.attributes[k]=q.attributes[k];p.points[k]=q.points[k];}else if(q.attributes[k]===p.attributes[k])p.points[k]=Math.max(p.points[k],q.points[k]);}}
 const a=current.training,b=incoming.training;if(b.day>a.day){a.day=b.day;a.awarded=b.awarded;}else if(b.day===a.day)a.awarded=Math.max(a.awarded,b.awarded);a.outdoorDay=Math.max(a.outdoorDay,b.outdoorDay);a.completed=Math.max(a.completed,b.completed);
}
export const drillAttribute={targets:'shot',penalties:'shot',cones:'pass'};
export function awardSoccerPractice(state,c,kind,now){
 const r=state.soccerRoster,t=r.training,day=Math.floor(now/c.training.dayMilliseconds),outdoor=kind==='outdoor';
 if(!Number.isFinite(now)||now<0||(!outdoor&&!Object.hasOwn(drillAttribute,kind)))return {ok:false,reason:'reason.invalid'};
 // Rollback never reopens a day or a used outdoor bonus.
 if(day<t.day)return {ok:false,reason:'soccer.practice.cap'};
 if(day>t.day){t.day=day;t.awarded=0;}if(outdoor?day<=t.outdoorDay:t.awarded>=c.training.dailyCap)return {ok:false,reason:'soccer.practice.cap'};
 if(outdoor)t.outdoorDay=day;else {t.awarded++;t.completed++;}
 const player=r.players[r.role==='keeper'?2:0],key=outdoor?'pace':drillAttribute[kind],points=outdoor?c.training.outdoorPoints:c.training.pointsPerDrill;
 player.points[key]+=points;let gained=0;
 while(player.points[key]>=c.training.pointsPerAttribute){player.points[key]-=c.training.pointsPerAttribute;if(player.attributes[key]<c.card.max){player.attributes[key]++;gained++;}}
 const legacyKey={shot:'power',pass:'accuracy',pace:'pace'}[key];if(player===r.players[0]&&legacyKey)state.soccerCard.attributes[legacyKey]=Math.max(state.soccerCard.attributes[legacyKey],player.attributes[key]);
 return {ok:true,key,gained,points:player.points[key],required:c.training.pointsPerAttribute,awarded:t.awarded};
}
