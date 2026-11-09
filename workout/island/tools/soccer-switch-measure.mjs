// Directional switch: how often the chosen teammate lies inside a 45-degree cone of the stick, v1 vs v2.
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../minigames/soccer.mjs';
import {selectControlledPlayer} from '../minigames/soccer-assistance.mjs';
const config=JSON.parse(await readFile(new URL('../data/config.json',import.meta.url),'utf8')).minigames.soccer;
const N=Number(process.argv[2]||300);
function rate(version){let hit=0,total=0,none=0,avail=0;
  for(let seed=1;seed<=N;seed++){
    const g=createSoccer({config,seed,aiVersion:version,difficulty:'easy',stage:2});
    for(let t=0;t<60*(3+seed%9);t++)g.update(1/60,{moveX:1,moveZ:0});
    const s=g.getState();if(!s)return {error:'no state'};
    for(let k=0;k<8;k++){
      const a=k*Math.PI/4,mx=Math.cos(a),mz=Math.sin(a);
      const cur=s.players.find(p=>p.id===s.controlled);
      const id=selectControlledPlayer(s,config,{manual:true,directional:version==='v2',moveX:mx,moveZ:mz});
      const p=s.players.find(q=>q.id===id);if(!p||p.id===cur.id){none++;continue;}
      avail+=s.players.some(q=>q.team===cur.team&&q.id!==cur.id&&q.role!=='keeper'&&((q.x-cur.x)*mx+(q.z-cur.z)*mz)/(Math.hypot(q.x-cur.x,q.z-cur.z)||1)>=.707)?1:0;const dx=p.x-cur.x,dz=p.z-cur.z,d=Math.hypot(dx,dz)||1;total++;if((dx*mx+dz*mz)/d>=.707)hit++;
    }}
  return {version,inCone:+(hit/total).toFixed(3),ceiling:+(avail/total).toFixed(3),switches:total,noChange:none};}
console.log(JSON.stringify([rate('v1'),rate('v2')]));
