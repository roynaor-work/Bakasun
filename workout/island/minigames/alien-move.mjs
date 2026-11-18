/** Aliens v15 ship movement (Roy, 11/11/2026, live v20 on his phone: "the movement of the ships should be more
 * dynamic"). The old step (g2m-motion.mjs) ramps to a constant velocity in 0.15 s and stops dead (its lean follows
 * the velocity directly). Here: acceleration with easing toward the stick's
 * speed, a short glide after the stick is released, a critically damped spring for the drag target, a lean
 * (bank) that follows the velocity, and a small recoil nudge on each shot. Positions change only through
 * velocity integration, so there are no jumps; the hit model (radii, segment contacts) is untouched.
 * ?alienMove=v20 (or globalThis.__alienMove=false) restores the old step. Numbers: config.json
 * alienDefense.move (MOVE_DEFAULTS below are the fallback). Dependency-free so tests and sims can import it. */
export function alienMoveEnabled(search=globalThis.location?.search||'',flag=globalThis.__alienMove){
 if(flag===false)return false;
 return new URLSearchParams(search).get('alienMove')!=='v20';
}
export const MOVE_DEFAULTS=Object.freeze({
 maxSpeed:265,        // model units per second (v20: 221)
 accelSeconds:.11,    // easing time constant toward the stick's speed (90% in about 0.25 s)
 reverseSeconds:.05,  // quicker when the stick flips direction
 driftSeconds:.08,    // glide after the stick is released: about 20 units, under half an alien column (12/11 QA: 0.2 glided 50 units, past the next column)
 dragSpring:24,       // rad/s of the critically damped spring that follows a drag target
 bankSeconds:.08,     // how fast the lean follows the velocity
 bankMax:1,           // bank = velocity / maxSpeed, clamped to this
 recoilSeconds:.14,   // decay of the recoil nudge
 recoilPixels:3       // how far the ship is drawn back (model units) at full recoil
});
export function moveConfig(balance){return {...MOVE_DEFAULTS,...(balance?.move||{})};}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
/** One movement step. Mutates player {x,vx,bank,recoil}. input: {moveX|left|right, x (drag target), flight}. */
export function alienMoveStep(player,input,dt,balance,width,cfg=MOVE_DEFAULTS){
 if(!(dt>0))return;
 const min=balance.playerRadius,max=width-balance.playerRadius;
 const axis=Number(Boolean(input.right))-Number(Boolean(input.left)),stick=clamp(axis||input.moveX||0,-1,1);
 const target=Number.isFinite(input.x)?clamp(input.x,min,max):null;
 let vx=player.vx||0;
 if(stick){const desired=stick*cfg.maxSpeed,reversing=vx*desired<0,tau=reversing?cfg.reverseSeconds:cfg.accelSeconds;vx+=(desired-vx)*Math.min(1,dt/tau);}
 else if(target!==null){
  const w=cfg.dragSpring,ax=w*w*(target-player.x)-2*w*vx;vx=clamp(vx+ax*dt,-cfg.maxSpeed,cfg.maxSpeed);
  if(Math.abs(target-player.x)<.3&&Math.abs(vx)<6){player.x=target;vx=0;}
 }else{vx*=Math.exp(-dt/cfg.driftSeconds);if(Math.abs(vx)<4)vx=0;}
 const next=player.x+vx*dt;
 if(next<=min){player.x=min;vx=Math.max(0,vx)*0;}else if(next>=max){player.x=max;vx=0;}else player.x=next;
 player.vx=vx;
 const bankTarget=clamp(vx/cfg.maxSpeed,-cfg.bankMax,cfg.bankMax);player.bank=(player.bank||0)+(bankTarget-(player.bank||0))*Math.min(1,dt/cfg.bankSeconds);
 if(Math.abs(player.bank)<.002)player.bank=0;
 player.recoil=Math.max(0,(player.recoil||0)-dt/cfg.recoilSeconds);
}
/** Draw offset of the ship (model units, positive = toward the player) for the current recoil. */
export function recoilOffset(player,cfg=MOVE_DEFAULTS){return (player?.recoil||0)*cfg.recoilPixels;}
