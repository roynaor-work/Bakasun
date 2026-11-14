/** Soccer v24.1 headless measurement (evidence only): full 11 v 11 matches as the session builds them, v24 against v24.1 on the same seeds.
 * The child is the gameplay tools' human-like bot (profile `child`: it also slides) plus a high-ball habit: once per high ball (an offer =
 * the ticks in a row with state.airOptions for the same controlled player), when the meeting is 0.7 s away or nearer, it presses the kick
 * button (first choice) or, every third ball that has one, the fourth button (second choice).
 * Measures: fouls by kind and team (whistles), advantages, fouled carriers who went down, stumbles, the slider's time down (slide start to
 * free to move), high-ball offers (by the first way shown, and every second way shown during the offer), how often the labels changed
 * while one ball dropped (flips: the kick button's way, the fourth button's, and the fourth button going back inside a quarter second),
 * volleys / headers / scissor kicks struck and their goals, and the match totals.
 * `--press 0`: the bot never presses for a high ball (the labels as they change while he runs on his own).
 * Usage: node workout/island/tools/soccer-v241-sim.mjs [--n 12] [--stages 2,5] [--seconds 180] [--press 0] [--out file.json] */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createSoccer} from '../minigames/soccer.mjs';
import {expandSoccerConfig} from '../minigames/soccer-squad.mjs';
import {applySoccerFull} from '../minigames/soccer-full.mjs';
import {applySoccerPitchV23,applySoccerControlV23} from '../minigames/soccer-v23.mjs';
import {createHumanBot} from './soccer-gameplay-metrics.mjs';

export function fullConfig(base,{v241}){return applySoccerControlV23(applySoccerPitchV23(expandSoccerConfig(applySoccerFull(base,{v241}))),'v23');}
export function playV241Match({base,seed,stage,v241,maxSeconds=200,press=true}){
  const config=fullConfig(base,{v241}),game=createSoccer({config,seed,stage,difficulty:'normal',role:'field',airVersion:'v23',v241}),human=createHumanBot(seed,{profile:'child'}),step=config.match.fixedStep;
  const out={seed,stage,v241,fouls:{slide:[0,0],steal:[0,0]},advantages:0,fallen:0,stumbles:0,slides:0,slideDown:[],offers:{volley:0,header:0,scissor:0},alts:{volley:0,header:0,scissor:0},flips:{primary:0,alt:0,altBounce:0,offersFlipped:0,maxPerOffer:0},struck:{volley:0,header:0,scissor:0},aerialGoals:0,goals:[0,0],shots:[0,0],errors:0};
  let elapsed=0,offer=null,altOffers=0,pressAlt=false,hold=0,lastAerial=null;const sliding=new Map(),wasFouled=new Set(),wasStumble=new Set();
  const close=()=>{if(!offer)return;for(const k of offer.alts)out.alts[k]++;if(offer.flips)out.flips.offersFlipped++;out.flips.maxPerOffer=Math.max(out.flips.maxPerOffer,offer.flips);offer=null;};
  while(!game.result&&elapsed<maxSeconds){
    const s=game.getState(),input=human(game,step,config);
    const o=s.airOptions;
    if(o&&s.phase==='playing'){
      if(offer&&offer.player!==s.controlled)close();
      if(!offer){offer={player:s.controlled,primary:o.primary,alt:o.alt||'',prevAlt:null,altAt:-9,alts:new Set(),flips:0,pressed:false};out.offers[o.primary]++;}
      else{
        if(o.primary!==offer.primary){out.flips.primary++;offer.flips++;offer.primary=o.primary;}
        const alt=o.alt||'';if(alt!==offer.alt){out.flips.alt++;if(alt===offer.prevAlt&&s.elapsed-offer.altAt<.25)out.flips.altBounce++;offer.prevAlt=offer.alt;offer.alt=alt;offer.altAt=s.elapsed;}
      }
      if(o.alt)offer.alts.add(o.alt);
      if(press&&!offer.pressed&&(o.arrival?.t??0)<=.7){offer.pressed=true;pressAlt=Boolean(o.alt)&&++altOffers%3===0;hold=.12;}
      if(hold>0){hold-=step;if(pressAlt)input.switchPlayer=false,input.airAlt=true;else input.kickHeld=true;}
    }else{close();hold=0;}
    try{game.update(step,input);}catch(e){out.errors++;break;}
    elapsed+=step;const cur=game.getState();
    for(const p of cur.players){
      if(p.slideTime>0&&!sliding.has(p.id))sliding.set(p.id,cur.elapsed);
      else if(sliding.has(p.id)&&p.slideTime<=0&&p.recover<=0){out.slideDown.push(+(cur.elapsed-sliding.get(p.id)).toFixed(3));sliding.delete(p.id);}
      if(p.fouledTime>0&&!wasFouled.has(p.id)){wasFouled.add(p.id);out.fallen++;}else if(!(p.fouledTime>0))wasFouled.delete(p.id);
      if(p.stumbleTime>0&&!wasStumble.has(p.id)){wasStumble.add(p.id);out.stumbles++;}else if(!(p.stumbleTime>0))wasStumble.delete(p.id);
    }
    for(const e of game.drainEvents()){
      if(e.type==='foul'){const k=e.kind==='steal'?'steal':'slide';out.fouls[k][e.team]++;}
      else if(e.type==='advantage')out.advantages++;
      else if(e.type==='slide')out.slides++;
      else if(e.type==='shot'&&!e.punt){out.shots[e.team]++;if(e.aerial){out.struck[e.aerial]++;lastAerial={team:e.team,at:cur.elapsed};}}
      else if(e.type==='header'&&e.team===0){out.struck.header++;lastAerial={team:0,at:cur.elapsed};}
      else if(e.type==='goal'){out.goals[e.team]++;if(lastAerial&&lastAerial.team===e.team&&cur.elapsed-lastAerial.at<3)out.aerialGoals++;}
    }
  }
  close();out.seconds=+elapsed.toFixed(1);return out;
}
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(3):null,pct=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(q*b.length))];};
export function summarizeV241(runs){
  const sum=f=>runs.reduce((a,r)=>a+f(r),0),n=runs.length||1,down=runs.flatMap(r=>r.slideDown);
  return {matches:runs.length,perMatch:{foulsSlide:[sum(r=>r.fouls.slide[0])/n,sum(r=>r.fouls.slide[1])/n],foulsSteal:[sum(r=>r.fouls.steal[0])/n,sum(r=>r.fouls.steal[1])/n],advantages:sum(r=>r.advantages)/n,fallen:sum(r=>r.fallen)/n,stumbles:sum(r=>r.stumbles)/n,slides:sum(r=>r.slides)/n,
    offers:Object.fromEntries(Object.keys(runs[0]?.offers||{}).map(k=>[k,sum(r=>r.offers[k])/n])),alts:Object.fromEntries(Object.keys(runs[0]?.alts||{}).map(k=>[k,sum(r=>r.alts[k])/n])),
    flips:{primary:sum(r=>r.flips.primary)/n,alt:sum(r=>r.flips.alt)/n,altBounce:sum(r=>r.flips.altBounce)/n,offersFlipped:sum(r=>r.flips.offersFlipped)/n,maxPerOffer:Math.max(0,...runs.map(r=>r.flips.maxPerOffer))},struck:Object.fromEntries(Object.keys(runs[0]?.struck||{}).map(k=>[k,sum(r=>r.struck[k])/n])),aerialGoals:sum(r=>r.aerialGoals)/n,goals:[sum(r=>r.goals[0])/n,sum(r=>r.goals[1])/n],shots:[sum(r=>r.shots[0])/n,sum(r=>r.shots[1])/n]},
    slideDown:{mean:mean(down),p50:pct(down,.5),p90:pct(down,.9),max:down.length?Math.max(...down):null,count:down.length},errors:sum(r=>r.errors)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]]:a,[]));
  const base=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
  const n=Number(args.n||12),stages=String(args.stages||'2,5').split(',').map(Number),maxSeconds=Number(args.seconds||200),report={n,stages,maxSeconds,press:args.press!=='0',byStage:{}};
  for(const stage of stages){
    report.byStage[stage]={};
    for(const v241 of [false,true]){const runs=[];for(let i=0;i<n;i++)runs.push(playV241Match({base,seed:1000+i,stage,v241,maxSeconds,press:args.press!=='0'}));report.byStage[stage][v241?'v241':'v24']=summarizeV241(runs);}
    console.log(JSON.stringify({stage,v24:report.byStage[stage].v24,v241:report.byStage[stage].v241}));
  }
  if(args.out)await writeFile(args.out,JSON.stringify(report,null,1));
}
