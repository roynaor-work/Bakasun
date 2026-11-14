/** Aliens v25 arsenal, HUD and enemy fire (Roy, 14/11/2026, after v24 on the phone): "the buttons are a good size, but better more reachable,
 * lower down; there is no need for text on the left, it just gets in the way; more kinds of weapons, and a way to fill them up; and the aliens
 * should fire a little more." Each change has its own switch back to v24:
 *  - ?alienHud=v24  : the button column goes back above the ship's lane and the text block next to the stick comes back (v25: the same rings,
 *                     from the bottom corner up, and no text on the left; the short notices show at the top centre instead).
 *  - ?alienArsenal=0: the special button is the missile only, as before. v25: three special weapons on that button, a small switch beside it:
 *      missile   - the homing missile with its blast, as before (2 per stage);
 *      lightning - an instant electric bolt from the ship to the nearest alien above it, jumping to up to 3 more nearby (each jump a little
 *                  weaker): a jagged blue-white arc, a crack (3 charges);
 *      shockwave - a ring that rolls up from the ship, wipes out the enemy bullets it touches and hits every alien it passes once: a cyan ring,
 *                  a deep thump (1 charge, the defensive one).
 *    Every one of them can be filled up: an ammo token (a crate for the missile, a battery for the lightning, a cell for the shockwave) falls from
 *    downed aliens, more often from the big ships, for the weapon that is emptiest, at most one at a time; flying into it adds charges.
 *  - ?alienEnemyFire=v24: v25 aliens fire about 25% more often (cadence x0.8) and keep two more bullets in the air.
 * Pure rules (no DOM, no clock, random passed in) for the model, the tests and the sims. Numbers: config.json alienDefense.arsenal25. */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienHudV25Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienHud){
 if(flag==='v24'||flag==='v23'||flag===false)return false;const v=param('alienHud',search);return v!=='v24'&&v!=='v23';
}
export function alienArsenalEnabled(search=globalThis.location?.search||'',flag=globalThis.__alienArsenal){
 if(flag==='0'||flag===false)return false;return param('alienArsenal',search)!=='0';
}
export function alienEnemyFireV25Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienEnemyFire){
 if(flag==='v24'||flag===false)return false;return param('alienEnemyFire',search)!=='v24';
}
export const SPECIALS=Object.freeze(['missile','lightning','shockwave']);
export const ARSENAL_DEFAULTS=Object.freeze({
 missile:Object.freeze({max:4,refill:1}),
 // Ranges are in the hit test's distance (x stretched by the screen aspect, about 2.9 on a phone): firstRange reaches the formation from the ship's
 // lane, jumpRange reaches the next alien in a row (46 units apart = 133 on a phone) or the row behind.
 lightning:Object.freeze({charges:3,max:5,refill:1,damage:2,falloff:.85,jumps:3,firstRange:460,jumpRange:160,seconds:.32}),
 shockwave:Object.freeze({charges:1,max:3,refill:1,damage:1.4,speed:520,maxRadius:420,seconds:.8}),
 drops:Object.freeze({chance:.12,bigChance:.45,bigKinds:Object.freeze([1,4]),gapSeconds:7,pitySeconds:16,speed:100,radius:24,maxOnScreen:1}),
 enemyFire:Object.freeze({cadence:.8,bulletCapAdd:2})
});
export function arsenalConfig(balance){
 const b=balance?.arsenal25||{},merge=k=>({...ARSENAL_DEFAULTS[k],...(b[k]||{})});
 return {missile:merge('missile'),lightning:merge('lightning'),shockwave:merge('shockwave'),drops:merge('drops'),enemyFire:merge('enemyFire')};
}
/** The next special weapon on the switch (all three in turn, empty ones too: an empty one shows its ammo is 0). */
export function nextSpecial(selected,count=SPECIALS.length){return ((Number(selected)||0)+1)%count;}
/** Which weapon an ammo token refills: the emptiest against its max (a tie goes to the selected one, then the order), or -1 when all are full. */
export function ammoDropKind(ammo,max,selected=0){
 let best=-1,score=Infinity;for(let i=0;i<ammo.length;i++){if(ammo[i]>=max[i])continue;const s=ammo[i]/max[i]-(i===selected?1e-6:0);if(s<score-1e-12){score=s;best=i;}}return best;
}
/** Should this kill drop an ammo token? Gap and screen cap first; then a weapon empty for pitySeconds always gets one; big ships often, others
 * by chance. state={time,lastDropAt,onScreen,kind,child,boss,emptyFor,random}. */
export function shouldDropAmmo(state,cfg=ARSENAL_DEFAULTS.drops){
 const s=state||{},time=Number(s.time)||0;
 if((s.onScreen||0)>=cfg.maxOnScreen)return false;
 if(time-(Number.isFinite(s.lastDropAt)?s.lastDropAt:-Infinity)<cfg.gapSeconds)return false;
 if((s.emptyFor||0)>=cfg.pitySeconds)return true;
 const big=s.boss||(!s.child&&cfg.bigKinds.includes(s.kind));
 return (typeof s.random==='function'?s.random():1)<(big?cfg.bigChance:cfg.chance);
}
/** Charges an ammo token of weapon `kind` adds (the missile's are the ship's missile charges). */
export function ammoRefill(kind,cfg){return kind===0?cfg.missile.refill:kind===1?cfg.lightning.refill:cfg.shockwave.refill;}
/** The lightning's path: the nearest alien above the ship within firstRange (distance with x stretched by `aspect`, as the hit test is), then up
 * to `jumps` hops, each to the nearest alien not yet struck within jumpRange of the last one. Damage falls by `falloff` per hop.
 * Returns [{id,x,y,damage}] in order (empty when nothing is in range). */
export function lightningChain(aliens,from,cfg=ARSENAL_DEFAULTS.lightning,aspect=1){
 const live=aliens.filter(a=>a.hp>0&&a.y<from.y-10&&a.y+a.radius>0),out=[],used=new Set(),dist=(a,b)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
 let at=from,range=cfg.firstRange,damage=cfg.damage;
 for(let hop=0;hop<=cfg.jumps;hop++){
  let best=null,bd=Infinity;for(const a of live){if(used.has(a.id))continue;const d=dist(a,at)-a.radius;if(d<=range&&d<bd){bd=d;best=a;}}
  if(!best)break;used.add(best.id);out.push({id:best.id,x:best.x,y:best.y,damage});at=best;range=cfg.jumpRange;damage*=cfg.falloff;
 }
 return out;
}
/** A jagged polyline from a to b for the bolt (deterministic from `seed`), in model units. */
export function boltPoints(a,b,seed=1,segments=7,jitter=9){
 const pts=[{x:a.x,y:a.y}];let s=seed>>>0||1;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296-.5;};
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
 for(let i=1;i<segments;i++){const t=i/segments,j=rnd()*jitter*2*Math.sin(Math.PI*t);pts.push({x:a.x+dx*t+nx*j,y:a.y+dy*t+ny*j});}
 pts.push({x:b.x,y:b.y});return pts;
}
