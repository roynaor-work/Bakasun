// Can the child return the computer's drop shots? A bot runs to the predicted contact point at the speed of rank 1 and swings on time.
//   node workout/island/tools/tennis-drop-sim.mjs [points=30] [--json out.json] [--old]   (--old = pre-fix drop numbers)
import {readFile,writeFile} from 'node:fs/promises';
import {createTennis} from '../minigames/tennis.mjs';
const base=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.tennis;
const args=process.argv.slice(2),points=Number(args[0])||30,old=args.includes('--old');
const config=structuredClone(base);if(old){config.drop.aiDepth=config.drop.depth;config.drop.aiFlightMin=0;config.drop.minApex=0;}
for(const l of config.levels){l.dropChance=1;l.lobChance=0;}
const DT=1/120;
function play(stage,difficulty,speedRank,seed){
  const m=createTennis({config,stage,seed,difficulty,ranks:{speed:speedRank,hit:3,serve:3}}),s=m.getState();
  let drops=0,returned=0,pendingDrop=false,tossed=false,serveDown=false,swingHold=0,guard=0,reasons={};
  let lastEvent=s.event.id,pointsPlayed=0;
  while(pointsPlayed<points&&guard++<DT**-1*60*60){
    const input={};
    if(s.phase==='serve'&&s.server===0){input.serve=!serveDown;serveDown=!serveDown;}
    else if(s.phase==='toss'&&s.server===0){input.serve=serveDown?false:Math.abs(s.serveMeter-.5)<.08;serveDown=input.serve;}
    if(s.phase==='rally'&&s.contact?.side===0&&s.shot?.side===1){
      const dx=s.contact.x-s.players[0].x,dz=s.contact.z-s.players[0].z,d=Math.hypot(dx,dz);
      if(d>.12){input.move=dx/d;input.moveZ=dz/d;}
      if(s.contact.eta<=.02&&swingHold<=0){input.swing=true;swingHold=.15;}
    }
    swingHold-=DT;
    m.update(DT,input);
    if(s.event.id!==lastEvent){lastEvent=s.event.id;const e=s.event;
      if(e.type==='hit'&&e.side===1&&s.shot?.drop){drops++;pendingDrop=true;}
      else if(e.type==='hit'&&e.side===0&&pendingDrop){returned++;pendingDrop=false;}
      if(['point','game','complete'].includes(e.type)){pointsPlayed++;if(pendingDrop){reasons[e.reason]=(reasons[e.reason]||0)+1;pendingDrop=false;}}
    }
    if(s.phase==='complete')break;
  }
  return {drops,returned,reasons};
}
const rows=[];
for(const difficulty of ['easy','normal','hard'])for(const speedRank of [1,3])for(const stage of [4,10,15,20,30]){
  let drops=0,returned=0;const reasons={};
  for(let seed=1;seed<=3;seed++){const r=play(stage,difficulty,speedRank,seed*101+stage);drops+=r.drops;returned+=r.returned;for(const [k,v] of Object.entries(r.reasons))reasons[k]=(reasons[k]||0)+v;}
  rows.push({difficulty,speedRank,stage,drops,returned,rate:drops?returned/drops:null,reasons});
}
console.log('difficulty speed stage drops returned rate');
for(const r of rows)console.log(r.difficulty.padEnd(9),String(r.speedRank).padStart(3),String(r.stage).padStart(5),String(r.drops).padStart(5),String(r.returned).padStart(8),r.rate==null?'-':(r.rate*100).toFixed(0)+'%');
const j=args.indexOf('--json');if(j>=0)await writeFile(args[j+1],JSON.stringify(rows,null,1));
