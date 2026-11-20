/** Aliens v24.6 laser burst (Roy, 20/11/2026, after v24.5 on the phone): "the laser fired just a tiny bit now and then. What I suggest: if there
 * is a short laser bonus, every press fires a laser for a few seconds".
 * What was found (v24.5): the pickup laser (16 s on its own clock) only turned the steady cannon's rounds into piercing beams. The Vulcan rounds
 * are never lasers (shotPierces), so with the Vulcan held, the usual way to play, a laser round left only when the steady cannon's clock was due
 * (a "ride" round): a short cyan streak every few tenths of a second among the Vulcan stream, "a tiny bit now and then".
 * v24.6 (?alienLaserBurst=0 keeps v24.5 exactly): while the pickup laser's clock runs, every new press of a fire button (the cannon or the Vulcan)
 * lights a continuous beam from the ship's nose straight up the screen. It lasts BURST.seconds after the press (a finger kept on the button keeps
 * it lit), follows the ship, and every BURST.tick it hits every ship it crosses (the drawn hull, alien-hull.mjs, the same contact as a round), with
 * BURST.tickDamage x the damage of one cannon laser round. A shield takes a charge on a tick instead of the damage. The purchased laser and the
 * hangar's weapon 2 (a permanent laser) do not light the beam: only the short bonus does, as Roy asked. The v24.5 piercing rounds stay as they are.
 * Pure rules plus one canvas draw function; numbers: BURST (config.json alienDefense.laserBurst may override any of them). */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienLaserBurstEnabled(search=globalThis.location?.search||''){return param('alienLaserBurst',search)!=='0';}
export const BURST=Object.freeze({
 seconds:2.5,     // the beam stays lit this long after the last press (or after the finger leaves the button)
 tick:.1,         // a hit on every ship in the beam this often
 tickDamage:.5,   // per tick, x the damage of one cannon laser round (10 ticks a second = 5 rounds a second on every ship in the column)
 halfWidth:7,     // the beam's half width for the contact, model units (the drawn core is narrower, the glow wider)
 top:-40          // the beam reaches past the top of the screen
});
export function burstConfig(balance){return {...BURST,...(balance?.laserBurst||{})};}
/** A press = a fire button that was up in the previous frame and is down now. */
export function burstPress(input,wasDown){const down=Boolean(input?.firing||input?.vulcan);return {down,press:down&&!wasDown};}
/** One frame of the beam clock: left (s) after a press or a held button while the bonus runs; returns the new time left. */
export function burstStep(left,{press,down,bonus,dt,cfg=BURST}){
 let next=Math.max(0,(left||0)-dt);
 if(bonus&&(press||(down&&next>0)))next=cfg.seconds;
 return next;
}

const TAU=Math.PI*2;
/** The beam: a wide cyan glow with a white core from the ship's nose to the top, flickering; a ring at the muzzle. Canvas 2D, model units. */
export function drawLaserBurst(p,m,aspect=1,scale=1){
 const b=m.laserBurst;if(!b||!(b.left>0))return;
 const fade=Math.min(1,b.left/.35),flick=.82+.18*Math.sin(m.time*55),x=b.x,y0=b.y,y1=b.top??-40,w=(b.halfWidth||7)*scale;
 p.save();p.translate(x,0);p.scale(1/aspect,1);
 const g=p.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'rgba(127,243,255,.85)');g.addColorStop(.6,'rgba(79,232,255,.5)');g.addColorStop(1,'rgba(79,232,255,.15)');
 p.globalAlpha=.55*fade*flick;p.strokeStyle=g;p.lineWidth=w*3.2;p.lineCap='round';p.beginPath();p.moveTo(0,y0);p.lineTo(0,y1);p.stroke();
 p.globalAlpha=fade;p.strokeStyle='#bff9ff';p.lineWidth=w*1.1;p.beginPath();p.moveTo(0,y0);p.lineTo(0,y1);p.stroke();
 p.strokeStyle='#ffffff';p.lineWidth=Math.max(1.5,w*.45);p.beginPath();p.moveTo(0,y0);p.lineTo(0,y1);p.stroke();
 p.fillStyle='#ffffff';p.globalAlpha=fade*.9;p.beginPath();p.arc(0,y0,w*.9*(1+.15*Math.sin(m.time*40)),0,TAU);p.fill();
 p.restore();
}
