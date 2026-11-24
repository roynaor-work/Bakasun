/** v14 presentation: a thin heat bar under the ship (green, yellow, red) that blinks while the guns cool.
 * v15 (final fix, 11/11/2026): the same bar, wider and framed so a child notices it: green while the Vulcan
 * burst runs, red and blinking during the forced cool-down, a steady amber mark while the cannon fires at
 * its normal pace. Hidden when the guns are cold (a burst is ready). */
import {drawV23Heat} from './alien-v23-draw.mjs?v=island-v2-20261107-23';
import {drawV24Refills,drawV24Cold} from './alien-v24-draw.mjs?v=island-v2-20261107-23';
import {drawV25Fx,drawV25Arsenal} from './alien-v25-draw.mjs?v=island-v2-20261107-23';
export function drawV14Heat(p,m,aspect=1,scale=1){
 // v23 (13/11/2026): the bar shows the Vulcan's own heat (the steady cannon has none); ?alienFire=v15 keeps the v15 bar below.
 // v24 (14/11/2026): the falling Vulcan magazines, and while one keeps the barrels cold a cyan bar in place of the heat bar (?alienRefill=0: v23 as is).
 // v25: the Vulcan's muzzle flashes, impacts and lock steam (both render paths call this right after the cannons).
 if(m.v25)drawV25Fx(p,m,aspect,scale);
 if(m.arsenalOn)drawV25Arsenal(p,m,aspect,scale);/* v25 arsenal: the bolt, the rings, the ammo tokens */
 if(m.v23){if(m.refillOn){drawV24Refills(p,m,aspect,scale);if(drawV24Cold(p,m,aspect,scale))return;}drawV23Heat(p,m,aspect,scale);return;}
 if(!m.v14||!(m.heat>.03))return;
 const v15=Boolean(m.v15),w=(v15?8:4)*scale,h=(v15?42:34)*scale,heat=Math.min(1,m.heat),hot=heat>.85,cool=m.overheated,blink=cool&&Math.floor(m.time*8)%2===0;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 const x=(v15?40:38)*scale,y=16*scale;
 p.globalAlpha=.9;p.fillStyle='#0a1622';p.fillRect(x-1,-y+h-h-1,w+2,h+2);p.fillStyle='#1c2c3c';p.fillRect(x,-y,w,h);
 // 12/11/2026 (QA): steady fire holds the gauge at warmHeat (.35), under the .6 amber mark, so it showed green like a burst; with v15 the steady mode itself is amber.
 // 12/11/2026 (QA retest): amber follows the warm barrels (burst spent, not cooling), not the press, so taps during steady fire no longer flick it green between presses.
 p.fillStyle=blink?'#ffffff':cool||hot?'#ff4a30':heat>.6||(v15&&(m.fireMode==='normal'||m.gunsWarm))?'#ffc94a':'#7fe0a0';p.fillRect(x,-y+h*(1-heat),w,h*heat);
 if(v15){p.globalAlpha=1;p.lineWidth=1.5*scale;p.strokeStyle=cool?(blink?'#ffffff':'#ff4a30'):'#9bd7ff';p.strokeRect(x-1.5*scale,-y-1.5*scale,w+3*scale,h+3*scale);
  if(cool){p.fillStyle=blink?'#ffffff':'#ff4a30';p.beginPath();p.moveTo(x+w/2,-y-10*scale);p.lineTo(x+w/2+4*scale,-y-3*scale);p.lineTo(x+w/2-4*scale,-y-3*scale);p.closePath();p.fill();}}
 p.restore();
}
