/** Aliens v24.5 laser (Roy, 18/11/2026, after v24.4 on the phone): "the laser upgrade does not work much, it stops quite quickly and does not
 * work, so the laser upgrade has to be handled properly."
 * What was found (v24.4):
 *  - phone fix C (v24.3) stops every cannon round at its first hull, the laser (kind 1) too: `s.hp=1` at the first contact. The pickup is
 *    called "לייזר חודר" (piercing laser) and the hangar's weapon-2 / purchased laser ranks were balanced on piercing (enemy HP is scaled by the
 *    laser's factor 2+.25 x rank, alien-v14.mjs gearFactor), but on the phone the beam stopped on the front ship like a plain bullet: "it stops";
 *  - the laser pickup shares the one powerup slot with rapid fire and the shield (`powerup=d.kind`): picking up either of them a few seconds
 *    later ended the laser at once, and on its own it lasted 10 s (v11.bonusSeconds): "it stops quite quickly";
 *  - a laser round was drawn as a 52-unit cyan streak, close to the regular tracer, so the child could not see which fire was the laser.
 * v24.5 (?alienLaser=0 restores v24.4 exactly):
 *  - a laser round of the cannon (and the escort wings) pierces again: it hits up to `pierce` ships in its path (pickups.laserPierce + the
 *    laser rank stack, 4 at rank 0), each one once, at the drawn hull (alien-hull.mjs, unchanged), with the pre-fix-C damage per ship (the
 *    fix-C first-hull compensation was the stand-in for the lost piercing, so it is not added on top). A shield bubble takes one charge and one
 *    pierce and the beam goes on. Plain cannon rounds and every Vulcan round still stop at their first hull (phone fix C, unchanged), so the
 *    "fire goes through the ship" bug does not come back: only the beam that looks like a beam pierces;
 *  - the pickup laser has its own clock (`seconds`, 16 s), not the shared powerup slot: rapid fire or the shield picked up meanwhile no longer
 *    end it; a second laser pickup refills it; a cyan ring around the ship shows the time left and blinks in the last 2 s;
 *  - the laser round is drawn as a long beam (`beamLength`, a white core in a wide cyan glow), with a short flash on every ship it passes.
 * Pure rules plus one canvas draw function; numbers: config.json alienDefense.laser25 (LASER25_DEFAULTS is the fallback). */
const param=(name,search)=>{try{return new URLSearchParams(search).get(name);}catch{return null;}};
export function alienLaserV25Enabled(search=globalThis.location?.search||'',flag=globalThis.__alienLaser){
 if(flag==='0'||flag===false||flag==='v24')return false;const v=param('alienLaser',search);return v!=='0'&&v!=='v24';
}
export const LASER25_DEFAULTS=Object.freeze({
 seconds:16,      // the pickup laser lasts this long on its own clock (v24.4: 10 s on the shared powerup slot)
 pierceAdd:0,     // added to pickups.laserPierce (4) + the laser rank stack: ships one beam can pass through
 shieldPierce:true,// a shield bubble takes a charge and the beam goes on (v24.4: the shield stopped every round)
 beamLength:78,   // drawn beam length in model units (v24.4 laser streak: 52)
 blinkSeconds:2   // the timer ring blinks in the last seconds
});
export function laser25Config(balance){return {...LASER25_DEFAULTS,...(balance?.laser25||{})};}
/** Ships a laser round passes through: pickups.laserPierce + the rank stack + pierceAdd (at least 2, or it would not be a piercing beam). */
export function laserPierceCount(balance,stack=0,cfg=LASER25_DEFAULTS){return Math.max(2,Math.round((balance?.pickups?.laserPierce??4)+(stack||0)+(cfg.pierceAdd||0)));}
/** Is the laser on: a purchased rank, the hangar's weapon 2, the v24.4 powerup slot, or the v24.5 laser clock. */
export function laserActive({upgrades,equipment,powerup,laserTime}){return (upgrades?.laser||0)>0||powerup===1||(laserTime||0)>0||(equipment?.weapon||0)>=2;}
/** Should round `s` pierce? Only the cannon's laser rounds marked at spawn (never a Vulcan round, never a plain round). */
export function shotPierces(s){return Boolean(s&&s.beam25&&s.kind===1&&!s.vulcan);}

const TAU=Math.PI*2;
/** The laser beam: a long white core in a wide cyan glow, drawn from the round's head back toward the ship. Canvas 2D, model units. */
export function drawLaserBeam(p,s,aspect=1,scale=1,cfg=LASER25_DEFAULTS,time=0){
 const L=(cfg.beamLength||78)*scale,flick=.85+.15*Math.sin(time*60+s.x);
 p.save();p.translate(s.x,s.y);p.scale(1/aspect,1);p.rotate(Math.atan2(s.vx||0,-(s.vy||-1)));
 const g=p.createLinearGradient(0,-8*scale,0,L);g.addColorStop(0,'rgba(127,243,255,.9)');g.addColorStop(.5,'rgba(79,232,255,.45)');g.addColorStop(1,'rgba(79,232,255,0)');
 p.globalAlpha=.5*flick;p.strokeStyle=g;p.lineWidth=11*scale;p.lineCap='round';p.beginPath();p.moveTo(0,-8*scale);p.lineTo(0,L);p.stroke();
 p.globalAlpha=1;const c=p.createLinearGradient(0,-10*scale,0,L*.85);c.addColorStop(0,'#ffffff');c.addColorStop(.35,'#bff9ff');c.addColorStop(1,'rgba(191,249,255,0)');
 p.strokeStyle=c;p.lineWidth=3.6*scale;p.beginPath();p.moveTo(0,-10*scale);p.lineTo(0,L*.85);p.stroke();
 p.fillStyle='#ffffff';p.beginPath();p.arc(0,-8*scale,3.4*scale,0,TAU);p.fill();
 p.restore();
}
/** Short flashes where a beam crossed a ship (model.laserHits: {x,y,at}). */
export function drawLaserHits(p,m,aspect=1,scale=1){
 for(const h of m.laserHits||[]){const u=(m.time-h.at)/.22;if(!(u>=0&&u<1))continue;
  p.save();p.translate(h.x,h.y);p.scale(1/aspect,1);p.globalAlpha=1-u;p.strokeStyle='#bff9ff';p.lineWidth=2.5*scale*(1-u)+.5;
  p.beginPath();p.arc(0,0,(8+16*u)*scale,0,TAU);p.stroke();p.fillStyle='#ffffff';p.globalAlpha=(1-u)*.8;p.beginPath();p.arc(0,0,4*scale*(1-u),0,TAU);p.fill();p.restore();}
}
/** The laser's own timer ring around the ship (outside the v11 bonus ring). */
export function drawLaserTimer(p,m,aspect=1,scale=1,cfg=LASER25_DEFAULTS){
 const left=m.laserTime||0,max=m.laserMax||0;if(!(left>0)||!(max>0))return;
 const f=Math.min(1,left/max),flash=left<(cfg.blinkSeconds||2)&&Math.floor(m.time*8)%2===0;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 p.strokeStyle='rgba(127,243,255,.18)';p.lineWidth=3*scale;p.beginPath();p.arc(0,0,36*scale,0,TAU);p.stroke();
 p.strokeStyle=flash?'#ffffff':'#4fe8ff';p.lineWidth=3.5*scale;p.beginPath();p.arc(0,0,36*scale,-Math.PI/2,-Math.PI/2+TAU*f);p.stroke();p.restore();
}
