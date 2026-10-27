/** Island Pro Basketball — the child's club: roster and lineup, training and upgrades,
 * chemistry, the season and its rewards. Pure functions over the saved `hoops` object; the
 * island engine calls them and persists the result. Every grant or spend leaves a receipt, and
 * a finished game is credited once by its id. */
import {TEAMS,generateRoster,overall,chemistry,seasonSchedule,standings,quickResult,teamRating,DRILLS,drillPreview,RATING_KEYS} from './hoops-league.mjs?v=island-alpine-20261027-1';

export const HOOPS_VERSION=1;
const USER_TEAM='waves';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

export function teamLevel(id,c){const t=TEAMS.find(x=>x.id===id);return (c?.league?.baseLevel??72)+(t?.strength||0);}

export function initialHoops(c){
 const base=generateRoster(USER_TEAM,c?.league?.userLevel??68);
 const ids=TEAMS.map(t=>t.id);
 return {v:HOOPS_VERSION,team:USER_TEAM,roster:base.map(p=>({id:p.id,ratings:{...p.ratings},potential:p.potential,gp:0,pts:0,reb:0,ast:0,stl:0,blk:0})),
  lineup:base.slice(0,5).map(p=>p.id),tactics:{offense:'motion',defense:'man'},autoSub:true,profile:'standard',difficulty:'normal',
  season:{n:1,schedule:seasonSchedule(ids,1),champion:null},credits:c?.economy?.startCredits??6,together:0,receipts:[],rewarded:[]};
}

/** Full cards for the child's team: generated identity + the saved, trained ratings. */
export function userCards(h){
 const base=generateRoster(h.team,68);
 return h.roster.map(r=>{const b=base.find(x=>x.id===r.id)||base[0];const card={...b,ratings:{...b.ratings,...r.ratings},potential:r.potential};card.ovr=overall(card);return card;});
}

/** Older club versions are upgraded here (none yet: v1 is the first). Unknown versions fail. */
export function migrateHoops(h,c){
 if(!h||typeof h!=='object')return null;
 if(h.v===HOOPS_VERSION)return h;
 return null;
}

/** Import keeps the club with more credited games; the current one wins a tie. */
export function mergeHoops(current,incoming){
 if(!incoming)return current;
 const played=h=>(h.season?.n||1)*1000+(h.rewarded?.length||0);
 return played(incoming)>played(current)?JSON.parse(JSON.stringify(incoming)):current;
}

export function validHoops(h,c){
 if(!h||typeof h!=='object'||Array.isArray(h)||h.v!==HOOPS_VERSION||typeof h.team!=='string')return false;
 if(!Array.isArray(h.roster)||h.roster.length<8||h.roster.length>15)return false;
 const ids=new Set();
 for(const p of h.roster){
  if(!p||typeof p.id!=='string'||ids.has(p.id))return false;ids.add(p.id);
  if(!p.ratings||typeof p.ratings!=='object')return false;
  for(const k of RATING_KEYS)if(!Number.isFinite(p.ratings[k])||p.ratings[k]<20||p.ratings[k]>99)return false;
  if(!Number.isFinite(p.ratings.height))return false;
  for(const k of ['gp','pts','reb','ast','stl','blk'])if(!Number.isSafeInteger(p[k])||p[k]<0)return false;
 }
 if(!Array.isArray(h.lineup)||h.lineup.length!==5||new Set(h.lineup).size!==5||!h.lineup.every(id=>ids.has(id)))return false;
 if(!h.tactics||!['motion','pnr','iso'].includes(h.tactics.offense)||!['man','zone'].includes(h.tactics.defense))return false;
 if(!['quick','standard','pro'].includes(h.profile)||!['easy','normal','hard'].includes(h.difficulty)||typeof h.autoSub!=='boolean')return false;
 if(!Number.isSafeInteger(h.credits)||h.credits<0||!Number.isSafeInteger(h.together)||h.together<0)return false;
 if(!Array.isArray(h.receipts)||!Array.isArray(h.rewarded)||!h.season||!Array.isArray(h.season.schedule))return false;
 return true;
}

/** Who plays the next game of the season (or a friendly when the season is over). */
export function nextGame(h){
 for(const r of h.season.schedule)for(const g of r.games)if(!g.score&&(g.home===h.team||g.away===h.team))return {...g,round:r.round};
 return null;
}

function receipt(h,kind,amount,ref,now){h.receipts.push({t:Math.floor(now),kind,amount,ref});if(h.receipts.length>60)h.receipts.splice(0,h.receipts.length-60);}

/** Teams for the engine: the child's team (with equipment and chemistry) and the opponent. */
export function matchTeams(c,h,{stage=1,equipment={},power=1,game=null}={}){
 h=h&&validHoops(h,c)?h:initialHoops(c);
 const me=TEAMS.find(t=>t.id===h.team)||TEAMS[0];
 const g=game||nextGame(h);
 const oppId=g?(g.home===h.team?g.away:g.home):TEAMS[1+((stage-1)%(TEAMS.length-1))].id;
 const opp=TEAMS.find(t=>t.id===oppId)||TEAMS[1];
 const chem=chemistry(userCards(h),h.lineup,h.together).total;
 const gear={speed:(equipment.shoes||1)-1,touch:equipment.touch||0,vertical:(equipment.spring||1)-1};
 const boost=chem/100*(c.league?.chemistryBonus??3);
 const cards=userCards(h).map(card=>{
  const r={...card.ratings};
  for(const k of RATING_KEYS)r[k]=clamp(r[k]+boost,20,99);
  r.speed=clamp(r.speed*(1+gear.speed),20,99);r.vertical=clamp(r.vertical*(1+gear.vertical),20,99);
  for(const k of ['mid','three','ft','inside'])r[k]=clamp(r[k]+gear.touch*100*0.3,20,99);
  return {...card,ratings:r};
 });
 const lineup=h.lineup.slice();
 const ordered=[...lineup.map(id=>cards.find(c=>c.id===id)),...cards.filter(c=>!lineup.includes(c.id))];
 const oppCards=generateRoster(opp.id,teamLevel(opp.id,c)+(c.league?.stageLevel??0.6)*(stage-1));
 const diff=h.difficulty;
 return {profile:h.profile,difficulty:diff,assist:diff==='easy'?0.6:diff==='normal'?0.25:0,autoSub:h.autoSub,quality:2,game:g,chemistry:chem,
  teams:[{id:me.id,name:me.name,look:me,players:ordered,lineup,tactics:{...h.tactics}},
         {id:opp.id,name:opp.name,look:opp,players:oppCards,lineup:oppCards.slice(0,5).map(p=>p.id),tactics:{offense:hash(opp.id)%2?'pnr':'motion',defense:hash(opp.id)%3?'man':'zone'}}]};
}

/** Credits one finished game (by id) to the season, the players and the club account. */
export function applyResult(h,res,c,now=Date.now()){
 if(!res)return {ok:false,reason:'invalid'};
 const key=res.gameId||`friendly-${now}`;
 if(res.gameId&&h.rewarded.includes(res.gameId))return {ok:false,reason:'duplicate'};
 for(const b of res.box){const p=h.roster.find(x=>x.id===b.id);if(!p)continue;if(b.sec>0)p.gp++;p.pts+=b.pts;p.reb+=b.reb;p.ast+=b.ast;p.stl+=b.stl;p.blk+=b.blk;}
 if(res.gameId){
  let round=null;
  for(const r of h.season.schedule)for(const g of r.games)if(g.id===res.gameId){g.score=g.home===h.team?[res.score[0],res.score[1]]:[res.score[1],res.score[0]];round=r;}
  // the other games of that round are decided from the clubs' ratings
  if(round)for(const g of round.games)if(!g.score){g.score=quickResult(teamLevel(g.home,c),teamLevel(g.away,c),hash(g.id+h.season.n),h.profile);}
  h.rewarded.push(res.gameId);if(h.rewarded.length>200)h.rewarded.splice(0,h.rewarded.length-200);
  const done=h.season.schedule.every(r=>r.games.every(g=>g.score));
  if(done&&!h.season.champion){const table=standings(h.season.schedule,TEAMS.map(t=>t.id));h.season.champion=table[0].id;
   if(table[0].id===h.team){const bonus=c.economy?.championCredits??10;h.credits+=bonus;receipt(h,'champion',bonus,`season-${h.season.n}`,now);}}
 }
 const earn=res.won?(c.economy?.winCredits??3):(c.economy?.lossCredits??1);
 h.credits+=earn;receipt(h,res.won?'win':'loss',earn,key,now);
 h.together=Math.min(500,h.together+1);
 return {ok:true,credits:earn};
}

export function newSeason(h){
 if(!h.season.champion)return {ok:false,reason:'seasonRunning'};
 h.season={n:h.season.n+1,schedule:seasonSchedule(TEAMS.map(t=>t.id),h.season.n+1),champion:null};
 return {ok:true};
}

export function setLineup(h,ids){
 if(!Array.isArray(ids)||ids.length!==5||new Set(ids).size!==5||!ids.every(id=>h.roster.some(p=>p.id===id)))return {ok:false,reason:'invalid'};
 const changed=ids.some(id=>!h.lineup.includes(id));
 h.lineup=ids.slice();if(changed)h.together=Math.floor(h.together/2);
 return {ok:true};
}

export function trainingOffer(h,playerId,drill,c){
 const p=h.roster.find(x=>x.id===playerId),card=userCards(h).find(x=>x.id===playerId);
 if(!p||!DRILLS[drill])return null;
 const cost=(c.economy?.drillCost??2)+Math.floor(Math.max(0,overall(card)-70)/6);
 return {cost,after:drillPreview(card,drill,1)};
}

export function train(h,playerId,drill,c,now=Date.now(),quality=1){
 const offer=trainingOffer(h,playerId,drill,c);if(!offer)return {ok:false,reason:'invalid'};
 if(h.credits<offer.cost)return {ok:false,reason:'credits',cost:offer.cost};
 const p=h.roster.find(x=>x.id===playerId),card=userCards(h).find(x=>x.id===playerId);
 const after=drillPreview(card,drill,quality);
 if(!after||!Object.keys(after).length)return {ok:false,reason:'maxed'};
 h.credits-=offer.cost;receipt(h,'train',-offer.cost,`${playerId}:${drill}`,now);
 for(const [k,v] of Object.entries(after))p.ratings[k]=Math.min(99,+v.toFixed(1));
 return {ok:true,cost:offer.cost,after};
}

export function hoopsSummary(h,c){
 const cards=userCards(h),chem=chemistry(cards,h.lineup,h.together);
 return {cards,team:TEAMS.find(t=>t.id===h.team),rating:teamRating(cards,h.lineup),chemistry:chem,next:nextGame(h),table:standings(h.season.schedule,TEAMS.map(t=>t.id)),teams:TEAMS};
}
