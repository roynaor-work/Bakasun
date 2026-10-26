import {drawAlienEffects,drawAlienBolts} from './g2m-effects.mjs?v=island-naval-aim-20261026-3';
import {drawUltraAlienEffects,drawAlienFallbackFeedback} from './ultra-alien-effects.mjs';
import {createAlienView} from './alien-view.mjs?v=island-naval-aim-20261026-3';
import {runAlienSession} from './alien-session.mjs';
import {createAlienModel} from './alien-flight-model.mjs';
import './alien-ui.mjs';
import {oval,drawHealthBar} from './art.mjs?v=island-naval-aim-20261026-3';
export {createAlienModel};
export {createAlienEntity,separateAliens,alienStack} from './alien-flight-combat.mjs';
const TAU=Math.PI*2;
export function drawAliens(p,m,{config,balance,art,quality,view,pixelAspect=1}) {
  if(view?.draw(p)){drawUltraAlienEffects(p,m,balance,pixelAspect,config);return;}
  const palette=config.visuals.palette;
  const {width:w,height:h,art:a,visuals:v}=config;
  p.drawImage(art.backdrop,0,0);p.fillStyle=a.creamColor;
  const count=quality.low?balance.starCount:v.stars;
  for(let i=0;i<count;i++){const depth=1+i%3,x=(i*a.starStrideX+a.starOffsetX)%w,y=(i*a.starStrideY+m.time*balance.starSpeed*depth)%h;p.globalAlpha=a.starOpacity+(i%a.starVariants)*a.starOpacityStep;p.fillRect(x,y,a.starSize*depth/2,a.starSize*depth/2);}p.globalAlpha=1;
  for(const e of m.aliens){if(e.shield>0){p.strokeStyle=palette.shieldGlow;p.lineWidth=3;p.beginPath();p.ellipse(e.x,e.y,e.radius+7,e.radius+5,0,0,TAU);p.stroke();}const modelScale=art.modelScales?.enemies[e.kind]||1,regularScale=modelScale!==1?(balance.models.enemies[e.kind]?.regularScale??modelScale):1,size=balance.alienRadius*3*(modelScale!==1&&e.boss?modelScale:e.scale*regularScale);p.save();p.translate(e.x,e.y);p.scale(1/pixelAspect,1);p.rotate(Math.sin(e.age*2+e.phase)*.09);p.drawImage(art.aliens[e.kind],-size/2,-size/2,size,size*.88);if(e.hitTime>0){p.globalCompositeOperation='screen';p.globalAlpha=e.hitTime/balance.hitFlashSeconds;p.drawImage(art.aliens[e.kind],-size/2,-size/2,size,size*.88);}p.restore();if(e.maxHp>2)drawHealthBar(p,e.x-size/3,e.y-size*.5,size*2/3,3,e.hp,e.maxHp,config);}
  for(const s of m.shots){p.strokeStyle=s.kind===1?v.foam:a.sandColor;p.lineWidth=s.kind===1?5:3;p.beginPath();p.moveTo(s.x,s.y+16);p.lineTo(s.x,s.y-9);p.stroke();oval(p,s.x,s.y,2,8,palette.white);}
  drawAlienBolts(p,m.bolts,balance,pixelAspect);
  for(const d of m.pickups){p.save();p.translate(d.x,d.y);p.rotate(m.time*2);p.fillStyle=balance.pickups.colors[d.kind];p.fillRect(-7,-7,14,14);p.fillStyle=palette.white;p.fillRect(-2,-2,4,4);p.restore();}
  for(const s of m.sparks){p.globalAlpha=s.life/balance.sparkSeconds;oval(p,s.x,s.y,3,3,a.creamColor);}p.globalAlpha=1;
  drawAlienEffects(p,m,balance,pixelAspect);
  for(const d of m.loot){if(d.kind){p.fillStyle=palette.cockpitShine;p.beginPath();p.moveTo(d.x,d.y-9);p.lineTo(d.x+7,d.y);p.lineTo(d.x,d.y+9);p.lineTo(d.x-7,d.y);p.fill();}else{oval(p,d.x,d.y,7,8,palette.gold);oval(p,d.x-1,d.y-2,3,4,palette.ivory);}}
  for(const wing of m.wings)if(wing.active){p.save();p.translate(wing.x,wing.y);p.rotate(m.time*.7);p.fillStyle=palette.gold;p.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?7:15;if(i)p.lineTo(Math.cos(a)*r,Math.sin(a)*r);else p.moveTo(Math.cos(a)*r,Math.sin(a)*r);}p.closePath();p.fill();oval(p,-4,-1,2,3,palette.cockpit);oval(p,4,-1,2,3,palette.cockpit);p.restore();}
  const {x,y}=m.player;p.save();p.translate(x,y);p.scale(1/pixelAspect,1);p.rotate(-(m.player.bank||0)*balance.render.bankAngle);if(m.invulnerable&&Math.floor(m.time*a.shipBlinkRate)%2)p.globalAlpha=balance.blinkOpacity;
  const exhaust=12+Math.sin(m.time*25)*4;oval(p,0,30,6,exhaust,palette.exhaust);oval(p,0,29,3,exhaust*.7,palette.exhaustCore);const playerScale=art.modelScales?.player||1;p.drawImage(art.player,-35*playerScale,-40*playerScale,70*playerScale,77*playerScale);
  if(m.upgrades.damage>0||(m.equipment.damage||1)>1){oval(p,0,-9,4+m.upgrades.damage,9,palette.gold);}if((m.equipment.rate||1)>1){oval(p,-20,26,3,12,palette.cockpitShine);oval(p,20,26,3,12,palette.cockpitShine);}if(m.upgrades.laser>0||m.spreadTime>0){p.fillStyle=palette.ivory;p.fillRect(-25,-6,5,21);p.fillRect(20,-6,5,21);}
  if(m.powerup===3||m.upgrades.shield>0||(m.equipment.shield||0)>0){p.strokeStyle=palette.shieldGlow;p.lineWidth=3;p.beginPath();p.arc(0,0,32+Math.sin(m.time*5)*2,0,TAU);p.stroke();}p.restore();drawAlienFallbackFeedback(p,m,balance,pixelAspect,config);
}
export function startAliens(ctx){return runAlienSession(ctx,createAlienModel,drawAliens,createAlienView);}
