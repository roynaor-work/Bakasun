/** 13/11/2026 fire v23: canvas painting for the two bonus modes. Pictures and frame sheets come from fire-v23-assets.mjs:
 * the Codex street buildings, the three rooms, the rescue friends (girl/cat/dog), the knock-down cans, and the fire/smoke/water
 * sheets (fire-fx-v1). Nothing here draws a person or a flame "by hand" when an asset exists; a tiny fallback keeps the game
 * playable if a sheet has not loaded yet. Every draw call takes scene px of the current background. */
import {jetArc} from './fire-targets.mjs?v=island-v2-20261107-11';
import {smokeLine} from './fire-interior.mjs?v=island-v2-20261107-11';
import {FIRE_V23_ANCHOR_DATA as A,FIRE_V23_FX,spriteBox,spriteFrame,streetOverlay,roomOverlay,targetSprite} from './fire-v23-assets.mjs?v=island-v2-20261107-11';

const MAX_PARTICLES=150;
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
/** Fit a scene into the canvas: cover the screen, but never crop the safe rectangle (all targets) on any phone or tablet shape. */
export function fitScene(W,H,sceneW,sceneH,safe){
  const cover=Math.max(W/sceneW,H/sceneH),s=Math.min(cover,W/(safe.x1-safe.x0),H/(safe.y1-safe.y0));
  const clamp=(v,a,b)=>{const lo=Math.min(a,b),hi=Math.max(a,b);return Math.max(lo,Math.min(hi,v));};
  let ox=W/2-s*(safe.x0+safe.x1)/2,oy=H-s*sceneH;
  // keep the whole safe rectangle on screen (all targets visible on any phone or tablet shape)
  ox=clamp(ox,W-s*safe.x1,-s*safe.x0);oy=clamp(oy,H-s*safe.y1,-s*safe.y0);
  // when the scene is larger than the viewport on an axis show no border; when smaller, letterbox-center it
  if(sceneW*s>=W)ox=Math.min(0,Math.max(W-sceneW*s,ox));else ox=(W-sceneW*s)/2;
  if(sceneH*s>=H)oy=Math.min(0,Math.max(H-sceneH*s,oy));else oy=(H-sceneH*s)*.35;
  return {s,ox,oy,sceneW,sceneH};
}
export function createBonusPainter(images){
  const particles=[];let fit={s:1,ox:0,oy:0,sceneW:1,sceneH:1},W=1,H=1,seed=1;
  const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const img=id=>{const i=images.get(id);return i&&i.complete&&i.naturalWidth?i:null;};
  /** One frame of a fire-v7/Codex sheet (FIRE_V23_FX grid), placed so its ground/nozzle anchor sits at (x,y); `h` is the drawn
   * frame height in scene px. Returns false when the sheet has not loaded, so the caller can draw a code fallback. */
  function fx(g,id,index,x,y,h,{alpha=1,rot=0,add=false,anchorY}={}){
    const grid=FIRE_V23_FX[id],im=img(id);if(!grid||!im)return false;
    const n=grid.n,i=((Math.floor(index)%n)+n)%n,col=i%grid.cols,row=Math.floor(i/grid.cols),scale=h/grid.fh,w=grid.fw*scale;
    const ax=grid.ax*scale,ay=(anchorY??grid.ay)*scale;
    g.save();g.globalAlpha*=alpha;if(add)g.globalCompositeOperation='lighter';g.translate(x,y);if(rot)g.rotate(rot);
    g.drawImage(im,col*grid.fw,row*grid.fh,grid.fw,grid.fh,-ax,-ay,w,grid.fh*scale);g.restore();return true;
  }
  function sprite(g,id,x,y,w,h,alpha=1){const im=img(id);if(!im)return false;g.save();g.globalAlpha*=alpha;g.drawImage(im,x,y,w??im.naturalWidth,h??im.naturalHeight);g.restore();return true;}
  /** An overlay cut from a second render (a scorched window, a burnt sofa, the open door): draw at its own scene origin. */
  function overlay(g,o){if(!o)return false;return sprite(g,o.id,o.x,o.y,o.w,o.h);}
  /** A burning spot: the Codex flame sheet (large for heavy/roof fires, medium otherwise). `size` is the flame height in scene px. */
  function flame(g,x,y,size,amount,t,key=0){
    if(amount<=0)return;const a=Math.min(1,.55+amount*.45),id=size>=112?'flame-large':'flame-medium',h=size*1.25*(.78+.22*Math.min(1,amount));
    if(fx(g,id,t*FIRE_V23_FX[id].fps+key*3,x,y,h,{alpha:a,add:true}))return;
    g.save();g.globalCompositeOperation='lighter';const glow=g.createRadialGradient(x,y-size*.4,size*.05,x,y-size*.4,size*1.05);glow.addColorStop(0,`rgba(255,170,60,${.5*a})`);glow.addColorStop(1,'rgba(255,90,20,0)');g.fillStyle=glow;g.fillRect(x-size*1.1,y-size*1.5,size*2.2,size*2.2);
    for(let i=0;i<3;i++){const off=(i-1)*size*.3,hh=size*(.8+.2*Math.sin(t*7+key+i*2));g.fillStyle=`rgba(255,${120+i*40},40,${.6*a})`;g.beginPath();g.ellipse(x+off,y-hh*.45,hh*.22,hh*.5,0,0,6.28);g.fill();}g.restore();
  }
  function spawn(kind,x,y,vx,vy,life,size,extra={}){if(particles.length>=MAX_PARTICLES)particles.shift();particles.push({kind,x,y,vx,vy,life,max:life,size,born:seed&1023,rot:rnd()*6.28,spin:(rnd()-.5)*1.5,...extra});}
  const PART_SHEET={drop:'water-droplets',steam:'steam-white',smoke:'smoke-black',powder:'foam-bubbles',foam:'foam-bubbles',spark:'sparks',ember:'sparks'};
  function stepParticles(g,dt,t){
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.spin*dt;if(p.kind==='drop'){p.vy+=900*dt;}if(p.kind==='smoke'||p.kind==='steam'){p.vx*=.99;p.size*=1+dt*.5;}
      const u=p.life/p.max,alpha=p.kind==='drop'?Math.min(1,u*2):p.kind==='spark'?u:Math.min(1,u*1.6)*(p.alpha??.75);
      if(p.kind==='confetti'){g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.color;g.globalAlpha=Math.min(1,u*3);g.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);g.restore();continue;}
      const sheet=PART_SHEET[p.kind]||'smoke-black',grid=FIRE_V23_FX[sheet],frame=p.born+(1-u)*grid.n*1.4;
      const rot=p.kind==='drop'?Math.atan2(p.vy,p.vx):p.kind==='spark'||p.kind==='ember'?0:p.rot;
      if(!fx(g,sheet,frame,p.x,p.y,p.size*1.4,{alpha,rot,add:p.kind==='spark'||p.kind==='ember'})){
        g.save();g.globalAlpha=alpha*.6;g.fillStyle=p.kind==='drop'?'#bfe8ff':p.kind==='spark'||p.kind==='ember'?'#ffd070':'#5a5856';g.beginPath();g.arc(p.x,p.y,p.size*.3,0,6.28);g.fill();g.restore();}
    }
  }
  /** The water jet: the Codex jet sheet stretched from the nozzle to where it lands, a splash there, and a few droplets riding it. */
  function jet(g,from,to,{power=1,dt=0,tool='water',t=0}={}){
    const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx);
    const id=tool==='foam'?'foam-bubbles':'water-jet',grid=FIRE_V23_FX[id],im=img(id);
    if(im&&tool!=='extinguisher'){const h=(tool==='foam'?46:40)*(.6+.4*power),n=grid.n,i=((Math.floor(t*grid.fps)%n)+n)%n,col=i%grid.cols,row=Math.floor(i/grid.cols);
      g.save();g.globalAlpha*=Math.min(1,.5+.5*power);g.translate(from.x,from.y);g.rotate(ang);
      g.drawImage(im,col*grid.fw,row*grid.fh,grid.fw,grid.fh,-(grid.ax/grid.fw)*len,-(grid.ay/grid.fh)*h,len*1.02,h);g.restore();}
    else{const arc=jetArc(from,to,16,.16);g.save();g.lineCap='round';g.strokeStyle=`rgba(230,240,250,${.6*power})`;g.lineWidth=14;g.beginPath();g.moveTo(arc[0].x,arc[0].y);for(const q of arc)g.lineTo(q.x,q.y);g.stroke();g.restore();}
    if(dt>0){if(!fx(g,'water-impact',t*FIRE_V23_FX['water-impact'].fps,to.x,to.y,70,{alpha:.9}))spawn('drop',to.x,to.y,0,-120,.3,20);
      for(let i=0;i<2;i++)spawn(tool==='foam'?'foam':'drop',to.x+(rnd()-.5)*24,to.y,(rnd()-.5)*260,-120-rnd()*200,.4,tool==='foam'?34:18+rnd()*12,{alpha:.8});
      if(tool==='extinguisher')for(let i=0;i<3;i++){const u=rnd();spawn('powder',from.x+dx*u+(rnd()-.5)*30*u,from.y+dy*u+(rnd()-.5)*30*u,dx*.6,dy*.6,.35,30+u*70,{alpha:.55});}}
  }
  const scene=(g,dpr)=>{g.setTransform(dpr*fit.s,0,0,dpr*fit.s,dpr*fit.ox,dpr*fit.oy);};
  return {
    particles,
    resize(w,h){W=w;H=h;},
    layout(sceneW,sceneH,safe){fit=fitScene(W,H,sceneW,sceneH,safe);return fit;},
    get fit(){return fit;},
    toScene(x,y){return {x:(x-fit.ox)/fit.s,y:(y-fit.oy)/fit.s};},
    toScreen(x,y){return {x:fit.ox+x*fit.s,y:fit.oy+y*fit.s};},
    background(g,id,dpr,fill=['#9fc0de','#4b4f55']){g.setTransform(dpr,0,0,dpr,0,0);const grad=g.createLinearGradient(0,0,0,H);grad.addColorStop(0,fill[0]);grad.addColorStop(1,fill[1]);g.fillStyle=grad;g.fillRect(0,0,W,H);scene(g,dpr);if(!sprite(g,id,0,0,fit.sceneW,fit.sceneH)){g.fillStyle='#6f8597';g.fillRect(0,0,fit.sceneW,fit.sceneH);}},
    // ---- targets ---------------------------------------------------------------------------------------------------------------
    drawTargets(g,model,t,dt,dpr){
      this.layout(2000,900,{x0:600,x1:1420,y0:150,y1:880});this.background(g,'street',dpr);
      const truck=spriteBox('truck');if(truck)sprite(g,'truck',truck.x,truck.y,truck.w,truck.h);
      for(const tg of model.targets){
        if(tg.kind==='window'||tg.kind==='roof'){const amount=tg.heat/(tg.kind==='roof'?1.6:1);
          if(!tg.done){const size=(tg.kind==='roof'?122:86)*(.55+.45*amount);flame(g,tg.x,tg.y+(tg.kind==='roof'?20:26),size,amount,t,tg.id);if(tg.kind==='roof'){flame(g,tg.x-60,tg.y+22,size*.8,amount,t+.4,tg.id+3);flame(g,tg.x+58,tg.y+22,size*.85,amount,t+.8,tg.id+5);}
            if(dt&&rnd()<dt*3*amount)spawn('smoke',tg.x+(rnd()-.5)*30,tg.y-size*.6,(rnd()-.5)*12+model.wind*.03,-38-rnd()*22,2.6,60+rnd()*40,{alpha:.55});
            if(dt&&rnd()<dt*4*amount)spawn('ember',tg.x+(rnd()-.5)*40,tg.y,(rnd()-.5)*40,-90-rnd()*60,1.1,18,{});}
          else{if(tg.kind==='window')overlay(g,streetOverlay('burnt-win-'+tg.at.replace('win_','')));
            if(t-tg.doneAt<2.4&&dt&&rnd()<dt*8)spawn('steam',tg.x+(rnd()-.5)*40,tg.y,(rnd()-.5)*20,-50,1.6,50+rnd()*30,{alpha:.6});}}
        else if(tg.kind==='fireball'&&!tg.done){const amount=tg.heat/.9;g.save();g.globalCompositeOperation='lighter';const r=tg.r*(.85+.15*Math.sin(t*9));const glow=g.createRadialGradient(tg.x,tg.y,2,tg.x,tg.y,r*1.6);glow.addColorStop(0,`rgba(255,240,180,${.95*amount})`);glow.addColorStop(.35,`rgba(255,150,40,${.75*amount})`);glow.addColorStop(1,'rgba(255,60,10,0)');g.fillStyle=glow;g.beginPath();g.arc(tg.x,tg.y,r*1.6,0,6.29);g.fill();g.restore();
          flame(g,tg.x,tg.y+r*.7,r*1.9,amount,t,tg.id);if(dt&&rnd()<dt*14)spawn('ember',tg.x+(rnd()-.5)*r,tg.y+(rnd()-.5)*r,(rnd()-.5)*60,30+rnd()*50,.9,22,{});}
        else if(tg.kind==='fireball'&&tg.done&&t-tg.doneAt<.1&&dt)for(let i=0;i<10;i++)spawn('steam',tg.x,tg.y,(rnd()-.5)*240,(rnd()-.5)*240,1.1,60,{alpha:.7});
        else if(tg.kind==='smoke'&&!tg.done){const d=Math.max(.25,tg.density);for(let i=0;i<5;i++){const a=i/5*6.28+t*.3+tg.id;fx(g,'smoke-black',tg.id*3+i+t*4,tg.x+Math.cos(a)*tg.r*.5,tg.y+Math.sin(a)*tg.r*.32,tg.r*1.3,{alpha:.85*d});}}
        else if(tg.kind==='can'&&!(tg.done&&t-tg.doneAt>2.8)){const sid=targetSprite(tg.at),box=spriteBox(sid);
          const spin=tg.fall?tg.fall.spin:(tg.push>0?tg.push*.28+Math.sin(t*24)*.05*tg.push:0),dx=tg.x-tg.baseX,dy=tg.y-tg.baseY-20;
          if(box&&img(sid)){g.save();g.translate(box.x+box.w/2+dx,box.y+box.h*.62+dy);g.rotate(spin);g.drawImage(img(sid),-box.w/2,-box.h*.62,box.w,box.h);g.restore();}
          else{g.save();g.translate(tg.x+dx,tg.y+dy);g.rotate(spin);g.fillStyle='#8e9aa1';g.fillRect(-17,-22,34,44);g.restore();}}
      }
      stepParticles(g,dt,t);
      if(model.spraying)jet(g,model.nozzle,model.impact,{power:.45+.55*model.pressure,dt,t});
      const crew=spriteBox('crew-'+model.crew);if(crew)sprite(g,'crew-'+model.crew,crew.x,crew.y,crew.w,crew.h);
      const a=model.aim,on=model.hitTarget!==null,pulse=1+.08*Math.sin(t*10);g.save();g.lineWidth=4;g.strokeStyle='rgba(10,20,30,.55)';g.beginPath();g.arc(a.x,a.y,30*pulse,0,6.29);g.stroke();g.lineWidth=3;g.strokeStyle=on?'#8af0a6':'#ffffff';g.beginPath();g.arc(a.x,a.y,30*pulse,0,6.29);g.stroke();
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){g.beginPath();g.moveTo(a.x+dx*18,a.y+dy*18);g.lineTo(a.x+dx*42,a.y+dy*42);g.stroke();}g.restore();
      for(const p of model.popups){const u=t-p.at;g.save();g.globalAlpha=Math.max(0,1-u/1.4);g.font='800 34px system-ui,sans-serif';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#14202b';g.fillStyle='#ffe28a';g.strokeText(p.text,p.x,p.y-u*40);g.fillText(p.text,p.x,p.y-u*40);g.restore();}
    },
    // ---- interior --------------------------------------------------------------------------------------------------------------
    drawInterior(g,model,t,dt,dpr){
      const phase=model.phase;
      if(phase==='arrive'||phase==='door'||phase==='enter'||phase==='victory')return this.drawStreetPhase(g,model,t,dt,dpr);
      const room=model.room,crawl=room.crawl,id=room.image;
      this.layout(1600,1200,{x0:140,x1:1460,y0:300,y1:1140});if(crawl>0){const z=1+.1*crawl;fit.ox=W/2-(W/2-fit.ox)*z;fit.oy=H-(H-fit.oy)*z;fit.s*=z;}
      this.background(g,id,dpr,['#2b2a2a','#2b2a2a']);
      g.save();
      for(const s of room.spots){
        if(!s.done){const amount=Math.min(1.3,s.heat/s.maxHeat)*(1+s.flare*.8),size=(s.kind==='heavy'?122:s.kind==='oil'?94:88)*(.6+.4*Math.min(1,amount));flame(g,s.x,s.y+size*.28,size,Math.min(1,amount),t,s.id.length+s.x%7);
          if(s.kind==='heavy')flame(g,s.x+size*.45,s.y+size*.28,size*.8,Math.min(1,amount),t+.5,s.x%5);
          if(s.flare>0&&dt&&rnd()<dt*30)spawn('ember',s.x+(rnd()-.5)*60,s.y,(rnd()-.5)*160,-260-rnd()*160,.8,26,{});
          if(s.spark>0&&dt)for(let i=0;i<3;i++)spawn('spark',s.x+(rnd()-.5)*30,s.y+(rnd()-.5)*30,(rnd()-.5)*500,(rnd()-.5)*500,.2,20,{});
          if(dt&&rnd()<dt*2.4)spawn('smoke',s.x+(rnd()-.5)*30,s.y-size*.7,(rnd()-.5)*10,-30-rnd()*20,2.4,70,{alpha:.45});}
        else{overlay(g,roomOverlay(id,s.id));
          if(s.smothered)sprite(g,'tool-blanket',s.x-54,s.y-30,108,70);
          if(t-s.doneAt<2&&dt&&rnd()<dt*6)spawn('steam',s.x+(rnd()-.5)*30,s.y-10,(rnd()-.5)*16,-40,1.4,46,{alpha:.55});}
      }
      this.drawRescue(g,model,room,t);
      stepParticles(g,dt,t);
      g.restore();
      // smoke from the ceiling down to the smoke line; crawling lifts the clear zone (a gradient stop must stay inside 0..1)
      const line=smokeLine(room)-crawl*model.tuning.crawlLift,top=room.ceiling-160,bottom=line+80;g.save();
      if(bottom>top+2){const grad=g.createLinearGradient(0,top,0,bottom);grad.addColorStop(0,'rgba(44,42,42,.95)');grad.addColorStop(Math.min(.98,Math.max(.02,(line-top)/(bottom-top))),'rgba(56,54,54,.8)');grad.addColorStop(1,'rgba(60,58,58,0)');
        g.fillStyle=grad;g.fillRect(-200,top,2000,bottom-top);}
      for(let i=0;i<8;i++){const x=(i*233+t*26*(i%2?1:-1))%2000-200;fx(g,'smoke-black',i*5+t*3,x,line-6+Math.sin(t*.7+i)*14,210,{alpha:.5});}
      g.restore();
      // the tool in hand and its stream
      const hand={x:800,y:1130},aim=model.aim;
      if(model.spraying&&aim){const from={x:hand.x-46,y:hand.y-120},to={x:aim.x,y:aim.y};
        if(model.tool!=='blanket')jet(g,from,to,{power:.5+.5*(model.tanks[model.tool]??1),dt,t,tool:model.tool});}
      const held=model.tool==='extinguisher'?'tool-extinguisher':model.tool==='blanket'?'tool-blanket':'tool-hose',im=img(held);
      if(im){const h=held==='tool-extinguisher'?230:held==='tool-blanket'?130:170,w=h*im.naturalWidth/im.naturalHeight,lean=aim?Math.max(-.35,Math.min(.35,(aim.x-hand.x)/1600)):0;g.save();g.translate(hand.x,hand.y);g.rotate(lean);g.drawImage(im,-w/2,-h,w,h);g.restore();}
      if(aim&&model.tool!=='blanket'){g.save();g.strokeStyle=model.hitSpot?'#8af0a6':'#fff';g.lineWidth=3;g.beginPath();g.arc(aim.x,aim.y,24,0,6.29);g.stroke();g.restore();}
    },
    /** The child or the pet: the Codex friend sheets (scared loop while waiting, walk-out once when saved). */
    drawRescue(g,model,room,t){
      const c=room.rescue;if(c.state==='saved'||(c.state==='teammate'&&c.t>=1))return;
      const leaving=c.state==='leaving'||c.state==='teammate',clip=leaving?'walkout':'scared',sheetId=`friend-${room.id}-${clip}`;
      const fr=spriteFrame(sheetId,(leaving?c.t*9:t*6)),im=img(sheetId),u=leaving?ease(c.t):0;
      const dx=(c.exit.x-c.x)*u,dy=(c.exit.y-c.y)*u,scale=1-u*.4,fade=c.state==='teammate'?(1-u*.6):1;
      if(fr&&im){g.save();g.globalAlpha*=fade;g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(c.x+dx,c.y+dy,fr.w*scale*.28,12*scale,0,0,6.29);g.fill();
        g.drawImage(im,fr.sx,fr.sy,fr.w,fr.h,fr.x+dx+fr.w*(1-scale)/2,fr.y+dy+fr.h*(1-scale),fr.w*scale,fr.h*scale);g.restore();}
      else{g.save();g.globalAlpha=fade;g.fillStyle=c.kind==='pet'?'#d79a5a':'#e08a6a';g.beginPath();g.arc(c.x+dx,c.y+dy-40,34*scale,0,6.29);g.fill();g.restore();}
      if(c.state==='waiting'){const bob=Math.sin(t*4)*5,y=c.headY-40+bob;g.save();g.globalAlpha=.95;g.fillStyle='#ffe28a';g.strokeStyle='#1d2730';g.lineWidth=4;g.beginPath();g.moveTo(c.x-16,y-22);g.lineTo(c.x+16,y-22);g.lineTo(c.x,y);g.closePath();g.stroke();g.fill();g.restore();}
    },
    drawStreetPhase(g,model,t,dt,dpr){
      this.layout(2000,900,{x0:560,x1:1560,y0:120,y1:900});this.background(g,'street',dpr);
      const truck=spriteBox('truck');
      if(truck){const p=model.phase==='arrive'?ease(model.truckProgress):1,shift=(1-p)*-900,bounce=model.phase==='arrive'&&p<1?Math.sin(t*28)*1.5:0;sprite(g,'truck',truck.x+shift,truck.y+bounce,truck.w,truck.h);}
      if(model.phase!=='arrive')overlay(g,streetOverlay('door-open'));
      if(model.phase==='door'){const d=model.door,r=56+8*Math.sin(t*5);g.save();g.strokeStyle='#ffe28a';g.lineWidth=7;g.setLineDash([16,10]);g.lineDashOffset=-t*40;g.beginPath();g.ellipse(d.x,d.y-50,r,r*1.45,0,0,6.29);g.stroke();g.restore();}
      if(model.phase==='victory'){const crew=spriteBox('victory-crew');if(crew)sprite(g,'victory-crew',crew.x,crew.y,crew.w,crew.h);
        const who={living:'dog',kitchen:'cat',bedroom:'girl'};
        for(const r of model.rooms){if(r.rescue.state==='waiting')continue;const vid='victory-'+(who[r.id]||'girl'),fr=spriteFrame(vid,t*6),vim=img(vid);if(fr&&vim){const bob=Math.abs(Math.sin(t*3+r.index))*7;g.drawImage(vim,fr.sx,fr.sy,fr.w,fr.h,fr.x,fr.y-bob,fr.w,fr.h);}}
        if(dt&&particles.filter(p=>p.kind==='confetti').length<90&&rnd()<dt*40){const colors=['#ffd166','#ef476f','#06d6a0','#118ab2','#f78c6b'];spawn('confetti',600+rnd()*800,-20,(rnd()-.5)*120,140+rnd()*120,4,16+rnd()*10,{color:colors[Math.floor(rnd()*colors.length)],spin:(rnd()-.5)*8});}}
      stepParticles(g,dt,t);
      if(model.phase==='enter'){g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle=`rgba(10,8,8,${Math.min(1,model.phaseTime/model.tuning.enterSeconds)})`;g.fillRect(0,0,W,H);}
    },
  };
}
