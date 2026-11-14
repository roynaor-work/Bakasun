// Offline model of the boar game's aiming on a 844 x 390 phone (14/11/2026): the v23 stick exactly as game.js runs it
// (STICK_V21 + AIM_TRUE, sensitivity "mid"), the v24 stick (the same + aim-v24.mjs), the camera that turns a little with the crosshair,
// two boars measured in the real game (a standing mortar at z -28 and a runner coming from z -60), the machine gun, and the child-like
// thumb from boar-kid-bot.mjs. Used by tests/island-boars-v24.test.mjs; the browser run (boar-aim-v24-browser.mjs) checks the same numbers
// with real touch. Game time only.
import {AIM24,V23,followAnchor,stickCurve,topSpeed as top,createAimAssist} from '../minigames/boar-island/aim-v24.mjs';
import {createKidBot,rng,gauss} from './boar-kid-bot.mjs';

export const SCREEN={W:844,H:390};
const FX=(SCREEN.W/2)/(Math.tan(22*Math.PI/180)*SCREEN.W/SCREEN.H),FY=(SCREEN.H/2)/Math.tan(22*Math.PI/180); // px per radian (fov 44)
/** The stick parameters of a version ('v23' = game.js before v24, 'v24' = AIM24 with optional overrides). */
export const stickParams=(version,params=null)=>version==='v24'?(params?{...AIM24,...params}:AIM24):V23;
export const topSpeed=(ux,uy,P=V23)=>top(ux,uy,SCREEN.W,SCREEN.H,P);

/** The left stick. version 'v23' = game.js before v24 (fixed centre, no help); 'v24' = following centre + aim help. */
export function makeStick(version='v24',{sens=1,params=null,follow=true}={}){
  const P=stickParams(version,params),R=P.R;
  let s=null;const assist=version==='v24'?createAimAssist(P):null;
  const api={
    P,get held(){return !!s;},get anchor(){return s?{x:s.ox,y:s.oy}:null;},get assist(){return assist;},info:null,
    curve:m=>stickCurve(m,P),speedOf:(ux,uy)=>topSpeed(ux,uy,P)*sens,
    down(x,y){if(!s)s={ox:x,oy:y,vx:0,vy:0,sx:0,sy:0};},
    move(x,y){if(!s)return;let dx,dy,d;
      if(version==='v24'&&follow)({dx,dy,d}=followAnchor(s,x,y,R));
      else{dx=x-s.ox;dy=y-s.oy;const raw=Math.hypot(dx,dy),k=raw>R?R/raw:1;dx*=k;dy*=k;d=Math.min(raw,R);}
      const mag=stickCurve(d/R,P);s.vx=d?dx/d*mag:0;s.vy=d?dy/d*mag:0;},
    up(){s=null;},
    /** One game step: moves the crosshair c ({x,y} px) and returns it. targets: boars as screen circles (for v24). */
    step(dt,c,targets=[]){
      if(!s){if(assist)assist.step({held:false});api.info=null;return c;}
      const k=1-Math.exp(-dt/P.TAU);s.sx+=(s.vx-s.sx)*k;s.sy+=(s.vy-s.sy)*k;const m=Math.hypot(s.sx,s.sy);let vx=0,vy=0;
      if(m>1e-6){const ux=s.sx/m,uy=s.sy/m,sp=topSpeed(ux,uy,P)*m*sens;vx=ux*sp;vy=uy*sp;}
      if(assist){const o=assist.step({dt,cx:c.x,cy:c.y,vx,vy,held:true,tilt:m,targets});vx=o.vx;vy=o.vy;api.info=o.info;}
      c.x=Math.min(SCREEN.W*.975,Math.max(SCREEN.W*.025,c.x+vx*dt));c.y=Math.min(SCREEN.H*.925,Math.max(SCREEN.H*.075,c.y+vy*dt));return c;}
  };
  return api;
}

/** Two boars measured through the island (14/11/2026, view() of the QA build), as functions of time: aim point and hit circles (touch radius). */
export function boarPath(kind,r){
  const phase=r()*Math.PI*2,x0=300+r()*240;
  if(kind==='standing'){// mortar standing at z -28: body 15 px, head 8.9, eyes 4.6, slow sway of about 7 px
    return t=>{const x=x0+6.5*Math.sin(.9*t+phase),y=234;return {x,y,zones:[{x:x+.3,y:y+.5,r:15},{x:x+.1,y:y+1,r:8.9},{x,y,r:4.6,crit:true}]};};}
  // runner from z -60 to the shore in 7 s: grows from 7.3 to 22 px, sways sideways 1.75 x its radius at 2.4 rad/s, moves down the screen
  return t=>{const u=Math.min(1,t/7),rb=7.3+14.8*u**2.2,y=208+69*u**1.8,x=x0+1.75*rb*Math.sin(2.4*t+phase),q=rb/7.3;
    return {x,y,zones:[{x:x+2.7*q,y:y+1*q,r:rb},{x:x+.7*q,y:y+.7*q,r:.58*rb},{x,y,r:.31*rb,crit:true}]};};
}
const HP={standing:75,moving:26},ARMOR={standing:.15,moving:0};

/** Runs `trials` boars one after another with one child on one stick. Returns per-trial rows and the totals. */
export function runTrials({version='v24',sigmaDeg=10,seed=1,trials=60,kinds=['standing','moving'],dt=1/60,timeout=6,kid={},stickOpts={}}={}){
  const r=rng(seed*7919+13),stick=makeStick(version,stickOpts),bot=createKidBot({seed,sigmaDeg,speedOf:stick.speedOf,curve:stick.curve,R:stick.P.R,anchor:()=>stick.anchor,...kid});
  const c={x:SCREEN.W/2,y:SCREEN.H*.525};let t=0,camY=0,camX=0,heat=0,hot=false,cool=0,id=0;const rows=[];
  const camStep=()=>{const px=(c.x/SCREEN.W)*2-1,py=-((c.y/SCREEN.H)*2-1);camY=-px*.1+(camY+px*.1)*Math.pow(2,-dt/.12);camX=py*.045+(camX-py*.045)*Math.pow(2,-dt/.12);};
  const onScreen=p=>{const sx=camY*FX,sy=(camX+.05*.045)*FY;return {x:p.x+sx,y:p.y+sy,zones:p.zones.map(z=>({...z,x:z.x+sx,y:z.y+sy}))};};
  let thumbDown=false;const apply=d=>{if(d.thumb&&!thumbDown){stick.down(d.thumb.x,d.thumb.y);thumbDown=true;}else if(d.thumb)stick.move(d.thumb.x,d.thumb.y);else if(thumbDown){stick.up();thumbDown=false;}};
  for(let n=0;n<trials;n++){
    const kind=kinds[n%kinds.length],path=boarPath(kind,r),t0=t,off=r()*1.5;id++;
    // the crosshair starts 140-320 px from the boar (as after the previous boar)
    {const p=onScreen(path(off));for(let k=0;k<50;k++){const a=r()*Math.PI*2,d=140+r()*180,x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d*.6;if(x>30&&x<SCREEN.W-30&&y>40&&y<SCREEN.H-40){c.x=x;c.y=y;break;}}}
    let hp=HP[kind],shots=0,hits=0,onFor=0,tOn=null,tIn=null,tHit=null,tMove=null,strokesAtOn=null,nextTick=t,killedAt=null;
    while(t-t0<timeout&&hp>0){
      const p=onScreen(path(off+t-t0)),tg={id,x:p.x,y:p.y,zones:p.zones};
      if(t>=nextTick){const rb=Math.max(...p.zones.map(z=>z.r));apply(bot.tick({t,cx:c.x,cy:c.y,target:{id,x:p.x,y:p.y,rv:rb/1.35}}));nextTick=t+bot.step;if(tMove===null&&bot.moved)tMove=t;}
      stick.step(dt,c,[tg]);camStep();
      const inside=p.zones.some(z=>Math.hypot(c.x-z.x,c.y-z.y)<z.r);onFor=inside?onFor+dt:0;if(inside&&tIn===null)tIn=t;if(tOn===null&&onFor>=.1){tOn=t-.1+dt;strokesAtOn=bot.strokes;}
      // machine gun: 9 shots/s, heat +27.9/s while firing, -21/s otherwise, overheat at 100 until under 25
      const firing=bot.fire&&!hot;heat=Math.max(0,Math.min(100,heat+(firing?27.9:-21)*dt));if(heat>=100)hot=true;if(hot&&heat<25)hot=false;cool-=dt;
      if(firing&&cool<=0){cool+=1/9;shots++;const jx=c.x+gauss(r)*1.2*(1+heat/100*1.6),jy=c.y+gauss(r)*1.2*(1+heat/100*1.6);
        const z=p.zones.filter(z=>Math.hypot(jx-z.x,jy-z.y)<z.r);if(z.length){hits++;if(tHit===null)tHit=t;const crit=z.some(q=>q.crit);hp-=15*(crit?2:1)*(1-ARMOR[kind]*(crit?.5:1));}}
      if(!firing&&cool<0)cool=0;
      t+=dt;if(hp<=0)killedAt=t;}
    const since=x=>x===null?null:+(x-(tMove??t0)).toFixed(3);rows.push({kind,shots,hits,firstIn:since(tIn),firstHit:since(tHit),aimTime:tOn===null?null:+(tOn-(tMove??t0)).toFixed(3),totalTime:tOn===null?null:+(tOn-t0).toFixed(3),strokes:strokesAtOn,killed:killedAt!==null,killTime:killedAt===null?null:+(killedAt-t0).toFixed(3)});
    // between boars: a short pause with no target
    const tEnd=t+.4;while(t<tEnd){if(t>=nextTick){apply(bot.tick({t,cx:c.x,cy:c.y,target:null}));nextTick=t+bot.step;}stick.step(dt,c,[]);camStep();heat=Math.max(0,heat-21*dt);if(hot&&heat<25)hot=false;t+=dt;}
  }
  return {rows,...summarize(rows,timeout)};
}

export function summarize(rows,timeout=6){
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0),med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2:null;};
  const by=k=>rows.filter(x=>!k||x.kind===k),out={};
  for(const k of [null,'standing','moving']){const rs=by(k);if(!rs.length)continue;const shots=sum(rs,x=>x.shots),hits=sum(rs,x=>x.hits);
    const aim=rs.map(x=>x.aimTime??timeout),tot=rs.map(x=>x.totalTime??timeout),on=rs.filter(x=>x.strokes!==null);
    const fin=rs.map(x=>x.firstIn??timeout),fhit=rs.map(x=>x.firstHit??timeout),kill=rs.map(x=>x.killTime??timeout);
    out[k||'all']={n:rs.length,hitRate:shots?+(hits/shots).toFixed(4):null,shots,hits,aimMedian:+med(aim).toFixed(3),aimMean:+(sum(aim,x=>x)/aim.length).toFixed(3),totalMedian:+med(tot).toFixed(3),
      firstInMedian:+med(fin).toFixed(3),firstHitMedian:+med(fhit).toFixed(3),firstHitMean:+(sum(fhit,x=>x)/fhit.length).toFixed(3),killMedian:+med(kill).toFixed(3),
      reached:+(on.length/rs.length).toFixed(3),strokes:on.length?+(sum(on,x=>x.strokes)/on.length).toFixed(2):null,killed:+(rs.filter(x=>x.killed).length/rs.length).toFixed(3)};}
  return out;
}
