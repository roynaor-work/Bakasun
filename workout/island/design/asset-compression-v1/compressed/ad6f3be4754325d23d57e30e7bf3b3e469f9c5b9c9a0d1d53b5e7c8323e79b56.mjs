/** Enemy patrol: each hull sails a readable racetrack around its station.
 * Speed and patrol half-width come from the stage table and blend linearly
 * between rows. The hull runs along one of two parallel tracks a short
 * distance apart in range, turns at the end of its width and comes back on
 * the other track, so the loop is closed and never wanders. The bow always
 * follows the motion: turn rate eases toward its target with time constant
 * `turnSeconds`, so a turn builds up over roughly 0.6–1 s instead of
 * snapping. Each leg ends at a seeded share of the width, so the corners
 * shift from lap to lap without jitter. Early stages hold the current leg
 * while a player shell is airborne, so a shot is never spoiled by a sudden
 * reversal. Hulls yield to each other and to the player instead of being
 * pushed, and stay inside the arena. Deterministic for a seed and step
 * sequence. */
const TAU=Math.PI*2;
const delta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const NAVAL_PATROL_DEFAULTS=Object.freeze({
 table:[[1,5,12],[3,8,24],[10,14,48],[20,18,65]],turnSeconds:.3,trackShare:.4,maxTrack:9,legShare:[.72,1],
 steadyUntilStage:5,depthStagger:64,arena:{minZ:-185,maxZ:185,back:75,front:75},avoid:{distance:46,hard:30},
 behaviors:{flank:{speed:1,range:1},guard:{speed:.85,range:.6},flagship:{speed:.85,range:.6}},
});
export function navalPatrolConfig(balance){
 const c=balance?.patrol||{};return {...NAVAL_PATROL_DEFAULTS,...c,arena:{...NAVAL_PATROL_DEFAULTS.arena,...c.arena},avoid:{...NAVAL_PATROL_DEFAULTS.avoid,...c.avoid},behaviors:{...NAVAL_PATROL_DEFAULTS.behaviors,...c.behaviors}};
}
/** Stage speed (units/s) and half-width (units each side), blended between table rows. */
export function navalPatrolSpec(stage,balance){
 const t=navalPatrolConfig(balance).table,s=Math.max(1,Number(stage)||1);
 if(s<=t[0][0])return {speed:t[0][1],range:t[0][2]};
 for(let i=1;i<t.length;i++)if(s<=t[i][0]){const [a,va,ra]=t[i-1],[b,vb,rb]=t[i],u=(s-a)/(b-a);return {speed:va+(vb-va)*u,range:ra+(rb-ra)*u};}
 const last=t.at(-1);return {speed:last[1],range:last[2]};
}
function hash(seed,index,leg){let h=(seed*2654435761^index*40503^leg*2246822519)>>>0;h=Math.imul(h^(h>>>15),2246822507)>>>0;h=Math.imul(h^(h>>>13),3266489909)>>>0;return ((h^(h>>>16))>>>0)/4294967296;}
function legEnd(p,c){const [lo,hi]=c.legShare;p.reach=p.range*(lo+(hi-lo)*hash(p.seed,p.index,p.leg+1));}
/** Start a patrol at its station, already under way along its track. */
export function createNavalPatrol({x,z,index=0,seed=0,stage=1,behavior,scale=1},balance){
 const c=navalPatrolConfig(balance),spec=navalPatrolSpec(stage,balance),b=c.behaviors[behavior]||{},speed=spec.speed*(b.speed??1),range=spec.range*(b.range??1);
 const track=Math.min(c.maxTrack,range*c.trackShare),turnRate=speed/Math.max(1e-6,track)*1.15,side=hash(seed,index,0)<.5?-1:1,loop=hash(seed,index,99)<.5?-1:1;
 const p={x,z,cx:x,cz:z,heading:side*Math.PI/2,turn:0,speed,range,track,turnRate,side,loop,leg:0,index,seed,stage,scale,traveled:0,minZ:0,maxZ:0,held:0,pace:1,legs:0};
 legEnd(p,c);return p;
}
/** The station line a hull patrols around this step: its depth-staggered
 * slot, a flanker's slow closing drift, and never onto the track of a nearer
 * station. One rule for the live fleet and for the aim forecast. */
export function navalPatrolCentre(e,enemies,{time,concurrent,fleetLength,drift},balance){
 const spacing=balance.patrol?.depthStagger??64,station=balance.enemyX+spacing*(e.slot-(Math.min(concurrent,fleetLength)-1)/2),flank=e.behavior==='flank';
 let centreX=station-(flank?(1-Math.cos((time-e.spawnTime)*.3))*Math.min(55,drift*2):0);
 if(flank)for(const o of enemies)if(o!==e&&o.active&&o.hp>0&&o.patrol&&o.patrol.cx<station-1)centreX=Math.max(centreX,o.patrol.cx+spacing);
 return centreX;
}
/** What a hull yields to: the player and every other live hull, as they stand now. */
export function navalPatrolObstacles(e,enemies,player){return [{x:player.x,z:player.z},...enemies.filter(o=>o!==e&&o.active&&o.hp>0).map(o=>({x:o.x,z:o.z}))];}
/** Advance one step. `obstacles`: [{x,z}] other hulls and the player. `shellAirborne`: a player shell is in flight.
 * `config`: an optional navalPatrolConfig(balance) computed once by a caller that steps many times (the aim forecast). */
export function stepNavalPatrol(p,dt,{obstacles=[],shellAirborne=false,centreX,config}={},balance){
 if(!(dt>0))return p;const c=config||navalPatrolConfig(balance);
 if(Number.isFinite(centreX))p.cx=centreX;
 // The outbound track sits on one side of the station line and the return track on the other.
 const offset=(p.z-p.cz)*p.side,lead=p.track+p.speed*c.turnSeconds*2;
 const hold=shellAirborne&&p.stage<=c.steadyUntilStage&&offset<p.range-lead;
 let blocked=false;
 for(const o of obstacles){const dx=o.x-p.x,dz=o.z-p.z,d=Math.hypot(dx,dz);if(d<c.avoid.distance*p.scale&&dz*p.side>0&&(dx*Math.cos(p.heading)+dz*Math.sin(p.heading))>d*.3){blocked=true;break;}}
 const beyond=p.z+p.side*lead<c.arena.minZ||p.z+p.side*lead>c.arena.maxZ;
 if((offset>=p.reach-lead&&!hold)||offset>=p.range-lead||blocked||beyond){p.side=-p.side;p.leg++;p.legs++;legEnd(p,c);}
 else if(offset>=p.reach-lead&&hold)p.held+=dt;
 // Pure pursuit along the current track: aim a short way ahead on the line.
 const target=p.cx+p.loop*p.side*p.track,look=Math.max(p.track*2.2,p.speed*1.2),desired=Math.atan2(p.side*look,target-p.x);
 const want=clamp(delta(desired,p.heading)*2.4,-p.turnRate,p.turnRate);
 p.turn+=(want-p.turn)*(1-Math.exp(-dt/c.turnSeconds));p.heading=((p.heading+p.turn*dt)%TAU+TAU)%TAU;
 // Keep clear by yielding, never by shoving: a hull slows behind another so the bow always matches the motion.
 let yieldTo=1;for(const o of obstacles){const dx=o.x-p.x,dz=o.z-p.z,d=Math.hypot(dx,dz),ahead=dx*Math.cos(p.heading)+dz*Math.sin(p.heading),hard=c.avoid.hard*p.scale,near=hard*1.8;if(ahead>0&&d<near)yieldTo=Math.min(yieldTo,clamp((d-hard)/(near-hard),.2,1));}
 p.pace+=(yieldTo-p.pace)*(1-Math.exp(-dt/.35));const step=p.speed*p.pace*dt;
 const x=clamp(p.x+Math.cos(p.heading)*step,p.cx-c.arena.back,p.cx+c.arena.front),z=clamp(p.z+Math.sin(p.heading)*step,c.arena.minZ,c.arena.maxZ);
 p.traveled+=Math.hypot(x-p.x,z-p.z);p.x=x;p.z=z;p.minZ=Math.min(p.minZ,z-p.cz);p.maxZ=Math.max(p.maxZ,z-p.cz);
 return p;
}
