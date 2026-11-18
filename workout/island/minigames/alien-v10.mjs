/** Aliens v10 (Roy, 07/11/2026): temporary companion ship (bonus only, timed, blinks out),
 * a homing missile with a visible lock and trail, one unmistakable look for alien fire (red/orange
 * spikes) versus bonuses (green/gold round tokens with an icon), and slightly more alien fire in
 * stages 1-3. ?alienV10=0 (or globalThis.__alienV10=false) restores v9. Numbers: config.json
 * alienDefense.v10. Dependency-free so tests and sims can import it. */
export function alienV10Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienV10){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienV10')!=='0';
}
const TAU=Math.PI*2;
export const wrapAngle=a=>{a%=TAU;return a>Math.PI?a-TAU:a<-Math.PI?a+TAU:a;};
/** Nearest valid target for the missile: any alien that is at least partly on screen. */
export function nearestAlien(aliens,x,y,aspect=1){
 let best=null,bestD=Infinity;
 for(const a of aliens){if(a.y+a.radius<=0)continue;const d=Math.hypot((a.x-x)*aspect,a.y-y);if(d<bestD){bestD=d;best=a;}}
 return best;
}
/** One steering step: turn toward the target with a limited turn rate, then advance. */
export function steerMissile(m,target,dt,{speed,turn}){
 if(target){const want=Math.atan2(target.y-m.y,target.x-m.x),d=wrapAngle(want-m.angle),max=turn*dt;m.angle+=Math.max(-max,Math.min(max,d));}
 m.x+=Math.cos(m.angle)*speed*dt;m.y+=Math.sin(m.angle)*speed*dt;
}
