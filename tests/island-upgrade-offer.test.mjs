import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {createActivity} from '../workout/island/activity/runtime.mjs';
import {offerEnabled,stageEligible,stageKey,moneyCandidates,leagueCandidates,pickOffer,createOfferMemory,dismiss,affordable,TRACK_ICON,CATEGORY} from '../workout/island/ui/upgrade-offer-core.mjs';
import {createLeague,UPGRADE_COST} from '../workout/island/minigames/racing-league-core.mjs';
import {simulateGame,simulateLeague} from '../workout/island/tools/upgrade-offer-sim.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const fresh=()=>{const e=createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1e6});e.state.money=0;return e;};
const cand=(over={})=>({id:'a',kind:'track',gameId:'tennis',category:'טניס',name:'מחבט',icon:'racket',unit:'coins',price:100,balance:120,...over});

test('flag: on by default, ?upgradeOffer=0 turns it off',()=>{
  assert.equal(offerEnabled(''),true);assert.equal(offerEnabled('?upgradeOffer=1'),true);assert.equal(offerEnabled('?upgradeOffer=0'),false);
});
test('stages that earn an offer: win, a star, coins, a league race; never cancelled or empty',()=>{
  assert.equal(stageEligible({outcome:'win',stars:2,money:10}),true);
  assert.equal(stageEligible({outcome:'lose',stars:0,money:12}),true,'partial success: coins earned');
  assert.equal(stageEligible({outcome:'lose',stars:0,money:0,score:5}),false);
  assert.equal(stageEligible({outcome:'lose',league:{place:5}}),true);
  assert.equal(stageEligible({cancelled:true,outcome:'win',stars:3}),false);
  assert.equal(stageEligible(null),false);
});
test('nothing is offered when the child cannot pay, the upgrade is locked or the price is not valid',()=>{
  const k='tennis:1';
  assert.equal(pickOffer({gameId:'tennis',key:k,candidates:[cand({balance:99})]}),null);
  assert.equal(pickOffer({gameId:'tennis',key:k,candidates:[cand({locked:true})]}),null);
  for(const price of [0,-5,NaN,1.5,Infinity])assert.equal(affordable(cand({price})),false,String(price));
  assert.equal(pickOffer({gameId:'tennis',key:k,candidates:[]}),null);
  assert.equal(pickOffer({gameId:'tennis',key:k,candidates:null}),null);
});
test('only the played category, and the cheapest affordable upgrade',()=>{
  const list=[cand({id:'x',price:90,gameId:'soccer'}),cand({id:'b',price:110}),cand({id:'c',price:70}),cand({id:'d',price:130,balance:120})];
  const offer=pickOffer({gameId:'tennis',key:'tennis:1',candidates:list});
  assert.equal(offer.id,'c');
  assert.equal(pickOffer({gameId:'alienDefense',key:'alienDefense:1',candidates:list}),null);
});
test('a part comes before a game level at the same price',()=>{
  const offer=pickOffer({gameId:'tennis',key:'tennis:2',candidates:[cand({id:'level',kind:'level',price:80}),cand({id:'track:hit',price:80})]});
  assert.equal(offer.id,'track:hit');
});
test('"later" does not come back at the same stage, and the game rests one stage',()=>{
  const memory=createOfferMemory(),list=[cand({id:'a',price:50}),cand({id:'b',price:60})];
  const first=pickOffer({gameId:'tennis',key:'tennis:3',candidates:list,memory});assert.equal(first.id,'a');
  dismiss(memory,'tennis:3',first.id,'tennis');
  assert.equal(pickOffer({gameId:'tennis',key:'tennis:3',candidates:list,memory}).id,'b','same stage, same upgrade is not repeated');
  assert.equal(pickOffer({gameId:'tennis',key:'tennis:4',candidates:list,memory}),null,'the next stage is quiet');
  assert.equal(pickOffer({gameId:'tennis',key:'tennis:5',candidates:list,memory}).id,'a','after one quiet stage the offers resume');
  assert.equal(pickOffer({gameId:'soccer',key:'soccer:1',candidates:[cand({gameId:'soccer'})],memory})?.gameId,'soccer','another game is not affected');
});
test('one stage counts once however many times it is asked',()=>{
  const memory=createOfferMemory(),list=[cand()];
  pickOffer({gameId:'tennis',key:'tennis:9',candidates:list,memory});pickOffer({gameId:'tennis',key:'tennis:9',candidates:list,memory});
  assert.equal(memory.count.tennis,1);
});
test('island coins: every game level and equipment track becomes a candidate with a known icon',()=>{
  const engine=fresh();engine.state.money=500;
  for(const gameId of Object.keys(data.config.minigameLevels)){
    const list=moneyCandidates(engine.state,data,gameId,k=>k);
    assert.ok(list.some(c=>c.kind==='level'),gameId+' level');
    for(const track of Object.keys(data.config.minigames[gameId].equipment||{}))assert.ok(TRACK_ICON[gameId]?.[track],`${gameId}.${track} has an icon`);
    assert.ok(CATEGORY[gameId],gameId+' has a category');
    for(const c of list)assert.ok(c.price>0&&c.balance===500,gameId+' '+c.id);
  }
});
test('island coins: locked tracks (not enough stars) are never offered and the cheapest affordable one is',()=>{
  const engine=fresh();engine.state.money=60;
  const list=moneyCandidates(engine.state,data,'tennis',k=>k),offer=pickOffer({gameId:'tennis',key:'tennis:1',candidates:list});
  assert.ok(offer&&offer.price<=60&&!offer.locked);
  engine.state.money=39;assert.equal(pickOffer({gameId:'tennis',key:'tennis:2',candidates:moneyCandidates(engine.state,data,'tennis',k=>k)}),null);
  engine.state.money=5000;
  const locked=moneyCandidates(engine.state,data,'tennis',k=>k).filter(c=>c.locked);
  assert.ok(locked.length===0||locked.every(c=>!affordable(c)),'zero stars: higher ranks locked');
});
test('a bought offer goes through the existing path and the next offer is a different, dearer one',()=>{
  const engine=fresh(),activity=createActivity(engine,{now:()=>1e6});engine.state.money=200;
  const memory=createOfferMemory();
  const a=pickOffer({gameId:'tennis',key:'tennis:1',candidates:moneyCandidates(engine.state,data,'tennis',k=>k),memory});
  const r=activity.upgrade('tennis',a.kind==='track'?a.track:undefined);assert.equal(r.ok,true);assert.equal(engine.state.money,200-a.price);
  const b=pickOffer({gameId:'tennis',key:'tennis:2',candidates:moneyCandidates(engine.state,data,'tennis',k=>k),memory});
  assert.ok(!b||b.id!==a.id||b.price>a.price);
});
test('island money with a fraction (income ticks) still offers, in whole coins',()=>{
  const engine=fresh();engine.state.money=400.6;
  const list=moneyCandidates(engine.state,data,'tennis',k=>k);assert.ok(list.every(c=>c.balance===400));
  assert.ok(pickOffer({gameId:'tennis',key:'tennis:1',candidates:list}));
});
test('league coins: a separate purse, cost by level, none at the top level',()=>{
  const league=createLeague();league.coins=99;
  assert.equal(pickOffer({gameId:'islandRacing',key:'k1',candidates:leagueCandidates(league)}),null);
  league.coins=100;const o=pickOffer({gameId:'islandRacing',key:'k2',candidates:leagueCandidates(league)});
  assert.equal(o.kind,'league');assert.equal(o.price,UPGRADE_COST[0]);
  for(const k of Object.keys(league.upgrades))league.upgrades[k]=5;league.coins=1e6;
  assert.equal(leagueCandidates(league).length,0);
  assert.deepEqual(leagueCandidates(null),[]);assert.deepEqual(leagueCandidates({}),[]);
});
test('damaged input fails closed, never throws',()=>{
  assert.deepEqual(moneyCandidates(null,data,'tennis'),[]);assert.deepEqual(moneyCandidates({},data,'nope'),[]);
  assert.equal(pickOffer({gameId:'tennis',key:'x',candidates:[null,undefined,{}]}),null);
  assert.equal(stageKey('tennis',{stage:4}),'tennis:4');assert.equal(stageKey('islandRacing',{league:{season:2,race:3}}),'islandRacing:league:2:3');
});
test('simulation: offers appear in a share of stage ends, never in every one, and nothing is spent without a tap',()=>{
  for(const id of Object.keys(data.config.minigameLevels)){const r=simulateGame(id);assert.ok(r.offers>0&&r.share<0.8,`${id} share ${r.share}`);assert.equal(r.offers,r.bought+r.declined);}
  const l=simulateLeague();assert.ok(l.offers>0&&l.share<0.8);
});
test('runtime assets are in the offline manifest and carry no exclamation marks',async()=>{
  const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8')),shell=new Set(manifest.shell);
  const icons=await readdir(new URL('assets/upgrade-offer/icons/',root));assert.equal(icons.length,22);
  for(const f of ['ui/upgrade-offer.mjs','ui/upgrade-offer-core.mjs','assets/upgrade-offer/offer.mjs','assets/upgrade-offer/offer.css',...icons.map(i=>'assets/upgrade-offer/icons/'+i)])assert.ok(shell.has(f),f);
  const code=await readFile(new URL('assets/upgrade-offer/offer.mjs',root),'utf8');
  assert.ok(!/['"`][^'"`\n]*[א-ת][^'"`\n]*![^=][^'"`\n]*['"`]/.test(code),'no Hebrew string with an exclamation mark');
});
