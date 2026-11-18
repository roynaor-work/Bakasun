import {play} from './child.mjs';
for(const profile of ['child','teen'])for(const [stage,diff] of [[8,'normal'],[10,'normal'],[15,'normal']]){let met=0,balls=0,pts=0,hits=0,won=0;for(let m=1;m<=8;m++){const r=play(stage,diff,profile,m);met+=r.met;balls+=r.balls;pts+=r.points;hits+=r.rallyHits;won+=r.won?1:0;}
 console.log(profile,stage,diff,'meets',(100*met/balls).toFixed(0)+'%','rally',(hits/pts).toFixed(1),'wins',won+'/8');}
