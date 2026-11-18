// Return shot quality by how long the button is held (press when the opponent's ball leaves, release after `hold`, or keep holding: auto-fire).
// node hold3.mjs [N] [off]   off = ?tennisHold carry off (v12 behaviour: the release has to meet the ball)
import {baseConfig} from './sim.mjs';
import {rally} from './hold-sim.mjs';
const N=+process.argv[2]||150,off=process.argv[3]==='off';
const config=off?{...baseConfig,v9:{...baseConfig.v9,hold:{...baseConfig.v9.hold,carry:{...baseConfig.v9.hold.carry,enabled:false}}}}:baseConfig;
const rows=[];
for(const diff of ['easy','normal','hard']){console.log('--',diff);
 for(const hold of [0.2,0.5,0.8,1.0,1.2,1.4,null]){
  const t={n:0,good:0,medium:0,weak:0,err:0,none:0,power:0};
  for(let seed=1;seed<=N;seed++){const r=rally(diff,hold,seed,config);if(!r){t.none++;continue;}t.n++;t[r.grade]++;if(r.error==='net'||r.error==='out')t.err++;t.power+=r.power;}
  console.log(`hold ${hold===null?'whole flight (auto-fire)':hold.toFixed(1)+' s'} n=${t.n}${t.none?' (no hit: '+t.none+')':''}: good ${(100*t.good/t.n).toFixed(0)}% medium ${(100*t.medium/t.n).toFixed(0)}% weak ${(100*t.weak/t.n).toFixed(0)}% | error net/out ${(100*t.err/t.n).toFixed(0)}% | avg power ${(t.power/t.n).toFixed(2)}`);
 }}
