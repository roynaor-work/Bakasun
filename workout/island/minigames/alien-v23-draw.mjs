/** Aliens v23 presentation: the Vulcan heat bar next to the ship (where the child is looking), the same place and size as
 * the v15 bar. Green, yellow, red as the Vulcan heats; while it is locked the bar blinks red and white and drains, with
 * a warning mark on top. Hidden when the gauge is cold and the Vulcan is open. The steady cannon never shows here: it
 * has no heat. Reads model state only (vulcanHeat, vulcanLocked, time). */
import {vulcanLevel,vulcanBlink,VULCAN_COLORS} from './alien-v23.mjs?v=island-v2-20261107-11';
export function drawV23Heat(p,m,aspect=1,scale=1){
 const locked=Boolean(m.vulcanLocked),heat=Math.max(0,Math.min(1,m.vulcanHeat||0));
 if(!locked&&!(heat>.03))return;
 const w=8*scale,h=42*scale,x=40*scale,y=16*scale,level=vulcanLevel(heat,locked),blink=vulcanBlink(m.time||0,locked);
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 p.globalAlpha=.9;p.fillStyle='#0a1622';p.fillRect(x-1,-y-1,w+2,h+2);p.fillStyle='#1c2c3c';p.fillRect(x,-y,w,h);
 p.fillStyle=blink?VULCAN_COLORS.blink:VULCAN_COLORS[level];p.fillRect(x,-y+h*(1-heat),w,h*heat);
 p.globalAlpha=1;p.lineWidth=1.5*scale;p.strokeStyle=locked?(blink?VULCAN_COLORS.blink:VULCAN_COLORS.lock):'#9bd7ff';p.strokeRect(x-1.5*scale,-y-1.5*scale,w+3*scale,h+3*scale);
 if(locked){p.fillStyle=blink?VULCAN_COLORS.blink:VULCAN_COLORS.lock;p.beginPath();p.moveTo(x+w/2,-y-10*scale);p.lineTo(x+w/2+4*scale,-y-3*scale);p.lineTo(x+w/2-4*scale,-y-3*scale);p.closePath();p.fill();}
 p.restore();
}
