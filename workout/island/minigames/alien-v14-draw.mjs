/** v14 presentation: a thin heat bar under the ship (green, yellow, red) that blinks while the guns cool. */
export function drawV14Heat(p,m,aspect=1,scale=1){
 if(!m.v14||!(m.heat>.03))return;
 const w=4*scale,h=34*scale,heat=Math.min(1,m.heat),hot=heat>.85,cool=m.overheated,blink=cool&&Math.floor(m.time*8)%2===0;
 p.save();p.translate(m.player.x,m.player.y);p.scale(1/aspect,1);
 const x=38*scale,y=16*scale;
 p.globalAlpha=.9;p.fillStyle='#0a1622';p.fillRect(x-1,-y+h-h-1,w+2,h+2);p.fillStyle='#1c2c3c';p.fillRect(x,-y,w,h);
 p.fillStyle=blink?'#ffffff':cool||hot?'#ff4a30':heat>.6?'#ffc94a':'#7fe0a0';p.fillRect(x,-y+h*(1-heat),w,h*heat);
 p.restore();
}
