import {readFileSync} from 'node:fs';
import {createSoccer} from '../../minigames/soccer.mjs';
import {createHumanBot} from '../../tools/soccer-gameplay-metrics.mjs';
const config=JSON.parse(readFileSync('../../data/config.json')).minigames.soccer;
const B=[1.55,3.4,4.8,6.3];const names=['walk(v9)','jog(v9)','run_4','run_5','sprint'];
const t={idle:0,walk:0,jog:0,run_4:0,run_5:0,sprint:0};let total=0,controlled={idle:0,walk:0,jog:0,run_4:0,run_5:0,sprint:0},ctot=0;
let kicks={pass:0,passRunning:0,shot:0,shotLong:0},brakes=0;
for(let seed=1;seed<=15;seed++){
  const g=createSoccer({config,seed,stage:5,difficulty:'normal',role:'field'}),bot=createHumanBot(seed);const prev=new Map();
  while(!g.result){const s=g.getState();g.update(1/60,bot(g,1/60,config));const c=g.getState();
    if(c.phase==='playing')for(const p of c.players){if(p.role==='keeper')continue;const v=Math.hypot(p.vx,p.vz);const k=v<.2?'idle':v<B[0]?'walk':v<B[1]?'jog':v<B[2]?'run_4':v<B[3]?'run_5':'sprint';t[k]++;total++;if(p.id===c.controlled){controlled[k]++;ctot++;}
      const pv=prev.get(p.id)||0;if(pv>=3&&v<.2)brakes++;prev.set(p.id,v);}
    for(const e of g.drainEvents()){if(e.type==='pass'||e.type==='loft'){kicks.pass++;const p=c.players[e.player];if(e.type==='pass'&&Math.hypot(p.vx,p.vz)>=3.2)kicks.passRunning++;}
      if(e.type==='shot'&&!e.punt){kicks.shot++;if(e.power>=.75)kicks.shotLong++;}}
  }
}
const pc=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,(v/Object.values(o).reduce((a,b)=>a+b,0)*100).toFixed(0)+'%']));
console.log('all outfield players, share of playing time:',JSON.stringify(pc(t)));
console.log('controlled player:',JSON.stringify(pc(controlled)));
console.log('per match (15 matches): brakes',(brakes/15).toFixed(1),'kicks',JSON.stringify(Object.fromEntries(Object.entries(kicks).map(([k,v])=>[k,+(v/15).toFixed(1)]))));
