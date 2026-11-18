/** Aliens v23 (Roy, 13/11/2026, after testing v22 on his phone): "in the aliens game the fire changes, for some reason,
 * while you shoot. Maybe there could be Vulcan fire that heats up, and the regular fire available on another button".
 * v22 had one fire button whose hold ran three modes by itself: a Vulcan burst, a forced 2 s silence, then the steady
 * cannon. v23 splits them into two weapons, one button each, each doing one predictable thing:
 *  - the fire button is the steady cannon only: the v15 normal fire (about 5.6 shots per second, gear floor 6/s, rapid
 *    bonus floor 7.7/s) for as long as it is held, from the first shot. Never a burst, never a pause, never a new rate.
 *  - the Vulcan button is the Vulcan only: 10 bullets per second; every bullet adds heat to its gauge (green, yellow,
 *    red). When the gauge is full the Vulcan locks for lockSeconds with a red blink while the gauge drains, then it
 *    opens again. Heat is counted per Vulcan tick and only cools after restSeconds without one, so quick taps cannot
 *    dodge it. The steady cannon has its own clock: the Vulcan, its heat and its lock never slow the regular fire.
 * Both buttons together: the Vulcan's barrels set the pace (10 per second) and each tick carries the cannon's shot when it
 * is due, otherwise a Vulcan bullet, so the stream is never denser than the Vulcan alone (no 15/s wall like v20) and the
 * cannon keeps its rate inside it; when the Vulcan locks, the cannon simply fires on. Balance: the regular button alone is
 * v22's steady fire (stage 1 about 100 s); with the Vulcan used as well a good player needs about 93 s. Measured by the
 * headless phone-aspect bot in tests/island-aliens-v23.test.mjs and the browser bot in
 * workout/island/tests/aliens-v23-browser.mjs.
 * ?alienFire=v15 (or globalThis.__alienFire='v15') restores v22 exactly: one button and the v15 burst/cool/steady gate.
 * Numbers: config.json alienDefense.v23 (V23_DEFAULTS below are the fallback). Dependency-free so tests and sims can
 * import it. */
export function alienFireV23Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienFire){
 if(flag==='v15'||flag===false)return false;
 try{return new URLSearchParams(search).get('alienFire')!=='v15';}catch{return true;}
}
export const V23_DEFAULTS=Object.freeze({
 vulcanInterval:.1,  // Vulcan: 10 bullets per second while its button is held (the v15 burst rate); also the pace of the shared stream
 heatShots:12,       // Vulcan ticks from a cold gauge to a full one: 1.2 s of continuous Vulcan fire, as long as v22's burst
 lockSeconds:2,      // a full gauge locks the Vulcan this long (red blink) while the gauge drains to empty
 restSeconds:.5,     // the gauge cools only after this long without a Vulcan tick (taps cannot keep it cold)
 coolSeconds:2,      // a full gauge cools to empty in this long once resting
 regularDamage:.8,   // a steady-cannon shot: the v15 normal shot, so the regular button alone plays exactly like v22's steady fire
 vulcanDamage:.45,   // a Vulcan bullet (v15 burst: .5): alone it matches the cannon's damage per second while it fires; with both
                     // buttons the stream hits about 45% harder while the Vulcan runs, and stage 1 for a good player using both stays
                     // about 93 s (regular button alone: about 100 s, as v22); measured, not guessed (see the header)
 yellowAt:.5,        // gauge colours: green below yellowAt, yellow below redAt, red from redAt up
 redAt:.8,
 vulcanKey:'KeyZ'    // keyboard: Space = steady cannon (unchanged), Z = Vulcan
});
export function v23Config(balance){return {...V23_DEFAULTS,...(balance?.v23||{})};}
/** Vulcan gate, one frame. state={heat,lock,rest}. want = the Vulcan button (or key) is held this frame.
 * Returns the next state plus mode ('idle' | 'fire' | 'lock') and firing (the Vulcan may shoot this frame).
 * Heat rises only through vulcanShot (one call per bullet), so the gauge counts bullets, not button time. */
export function vulcanGate(state,want,dt,cfg=V23_DEFAULTS){
 let {heat=0,lock=0,rest=0}=state||{};
 if(lock>0){lock=Math.max(0,lock-dt);heat=cfg.lockSeconds>0?Math.min(1,lock/cfg.lockSeconds):0;return {heat,lock,rest:0,mode:lock>0?'lock':'idle',firing:false};}
 if(want)return {heat,lock:0,rest:0,mode:'fire',firing:true};
 rest+=dt;if(rest>(cfg.restSeconds||0))heat=Math.max(0,heat-dt/Math.max(.001,cfg.coolSeconds));
 return {heat,lock:0,rest,mode:'idle',firing:false};
}
/** One Vulcan bullet left the barrels: add its heat; a full gauge locks the Vulcan for lockSeconds. */
export function vulcanShot(state,cfg=V23_DEFAULTS){
 const heat=Math.min(1,(state?.heat||0)+1/Math.max(1,cfg.heatShots));
 if(heat>=1-1e-9)return {...state,heat:1,lock:cfg.lockSeconds,rest:0,mode:'lock',firing:false,overheat:true};
 return {...state,heat,rest:0,overheat:false};
}
/** Gauge colour band for the button ring and the bar next to the ship. */
export function vulcanLevel(heat,locked=false,cfg=V23_DEFAULTS){return locked?'lock':heat>=cfg.redAt?'red':heat>=cfg.yellowAt?'yellow':'green';}
export const VULCAN_COLORS=Object.freeze({green:'#7fe0a0',yellow:'#ffd34a',red:'#ff4a30',lock:'#ff4a30',blink:'#ffffff'});
/** Red blink while locked: on/off eight times per second of game time (the canvas bar and the button use the same phase). */
export function vulcanBlink(time,locked){return Boolean(locked)&&Math.floor(time*8)%2===0;}
