// Headless measurement of the upgrade offer: plays N stages per game with a typical child (wins most, earns the stage reward, buys the
// offer about every other time) and counts how many stage ends show an offer. Usage: node tools/upgrade-offer-sim.mjs [out.json]
import {readFile,writeFile} from 'node:fs/promises';
import {loadData} from '../engine/load-data.mjs';
import {createEngine} from '../engine/engine.mjs';
import {createActivity} from '../activity/runtime.mjs';
import {moneyCandidates,leagueCandidates,pickOffer,createOfferMemory,dismiss,stageEligible,stageKey} from '../ui/upgrade-offer-core.mjs';
import {PRIZE,applyRace,createLeague,nextSeason,RACES_PER_SEASON} from '../minigames/racing-league-core.mjs';

const root=new URL('../',import.meta.url);
export const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const fresh=()=>{const engine=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1e6});engine.state.money=0;return engine;};

/** One game, `stages` stage ends. Policy: every 4th stage is lost with nothing earned (no offer), others win with the stage reward and 1-3 stars. */
export function simulateGame(gameId,stages=24,buyEvery=2){
  const engine=fresh(),activity=createActivity(engine,{now:()=>1e6}),memory=createOfferMemory();
  const levels=data.config.minigames[gameId]?.levels||[];const out={gameId,stages,eligible:0,offers:0,bought:0,declined:0,offerStages:[],first:null};
  for(let s=1;s<=stages;s++){
    const lost=s%4===0,reward=levels[Math.min(s,levels.length)-1]?.winMoney??40,stars=lost?0:1+(s%3);
    const result={outcome:lost?'lose':'win',score:lost?0:100,money:lost?0:reward,stars,stage:s};
    if(!lost){engine.state.money+=reward;const row=engine.state.minigameProgress[gameId];if(row){row.stars[Math.min(s,row.stars.length)-1]=Math.max(row.stars[Math.min(s,row.stars.length)-1]||0,stars);row.stage=Math.min(row.stars.length,Math.max(row.stage,s+1));}}
    if(!stageEligible(result))continue;out.eligible++;
    const key=stageKey(gameId,result),offer=pickOffer({gameId,key,candidates:moneyCandidates(engine.state,data,gameId,k=>k),memory});
    if(!offer)continue;out.offers++;out.offerStages.push(s);out.first??=s;
    if(out.offers%buyEvery===0){const r=activity.upgrade(gameId,offer.kind==='track'?offer.track:undefined);if(r.ok)out.bought++;}else{dismiss(memory,key,offer.id,gameId);out.declined++;}
  }
  out.share=out.eligible?+(out.offers/out.eligible).toFixed(2):0;return out;
}
/** League: three seasons, a race at a time; the child finishes 1st..4th in turn and buys the offer about every other time. */
export function simulateLeague(buyEvery=2){
  const L=createLeague(),memory=createOfferMemory(),out={gameId:'league',stages:0,eligible:0,offers:0,bought:0,declined:0,offerStages:[],first:null};
  const ids=['ai-1','ai-2','ai-3','ai-4'];let n=0;
  for(let season=1;season<=3;season++){
    for(let r=0;r<RACES_PER_SEASON;r++){
      n++;const place=1+(n%4),order=[...ids];order.splice(place-1,0,'player');
      const race=L.race,res=applyRace(L,{order:order.slice(0,5),fastestLapId:null});
      const result={outcome:place<=3?'win':'lose',score:6-place,money:0,stars:0,stage:1,league:{season,race,...res}};out.stages++;out.eligible++;
      const key=stageKey('islandRacing',result),offer=pickOffer({gameId:'islandRacing',key,candidates:leagueCandidates(L),memory});
      if(!offer)continue;out.offers++;out.offerStages.push(n);out.first??=n;
      if(out.offers%buyEvery===0){const name=offer.track,cost=offer.price;L.coins-=cost;L.upgrades[name]++;out.bought++;}else{dismiss(memory,key,offer.id,'islandRacing');out.declined++;}
    }
    if(!nextSeason(L).ok)break;
  }
  out.share=+(out.offers/out.eligible).toFixed(2);return out;
}
export function runAll(){
  const games=['islandRacing','tennis','streetSlam','soccer','navalDuel','alienDefense','fireRescue','alpineRush','catchCriminal'];
  return {league:simulateLeague(),games:games.map(g=>simulateGame(g))};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const report=runAll();console.log(JSON.stringify(report,null,1));
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,1));
}
