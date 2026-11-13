/** 13/11/2026 fire v23: canvas painting for the two bonus modes. Pictures come from fire-v23-assets.mjs; the flame, smoke, steam, water
 * and ember sheets are the fire-v7 particle atlases (4x4 cells of 64 px). Only objects are drawn in code (cans, the jet, smoke veils,
 * confetti); people, the pet, the engine and the rooms are pictures. Every draw call takes scene px of the current background. */
import {jetArc} from './fire-targets.mjs?v=island-v2-20261107-11';
import {smokeLine} from './fire-interior.mjs?v=island-v2-20261107-11';
import {FIRE_V23_ANCHOR_DATA as A,spriteBox} from './fire-v23-assets.mjs?v=island-v2-20261107-11';

const CELL=64,MAX_PARTICLES=140;
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
/** Fit a scene into the canvas: cover the screen, but never crop the safe rectangle (all targets) on any phone or tablet shape. */
export function fitScene(W,H,sceneW,sceneH,safe){
  const cover=Math.max(W/sceneW,H/sceneH),s=Math.min(cover,W/(safe.x1-safe.x0),H/(safe.y1-safe.y0));
  let ox=W/2-s*(safe.x0+safe.x1)/2,oy=H-s*sceneH;
  if(sceneW*s>=W)ox=Math.min(0,Math.max(W-sceneW*s,ox));else ox=(W-sceneW*s)/2;
  if(sceneH*s<H)oy=(H-sceneH*s)*.35;else oy=Math.min(0,Math.max(H-sceneH*s,oy));
  return {s,ox,oy,sceneW,sceneH};
}
export function createBonusPainter(images){
  const particles=[];let fit={s:1,ox:0,oy:0,sceneW:1,sceneH:1},W=1,H=1,seed=1;
  const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const img=id=>{const i=images.get(id);return i&&i.complete&&i.naturalWidth?i:null;};
  function cell(g,sheet,index,x,y,size,{alpha=1,rot=0,anchor='center'}={}){const im=img(sheet);if(!im)return false;const c=index&15,sx=(c%4)*CELL,sy=Math.floor(c/4)*CELL;
    g.save();g.globalAlpha*=alpha;g.translate(x,y);if(rot)g.rotate(rot);g.drawImage(im,sx,sy,CELL,CELL,-size/2,anchor==='bottom'?-size*.97:-size/2,size,size);g.restore();return true;}
  function sprite(g,id,x,y,w,h,alpha=1){const im=img(id);if(!im)return false;g.save();g.globalAlpha*=alpha;g.drawImage(im,x,y,w??im.naturalWidth,h??im.naturalHeight);g.restore();return true;}
  /** A burning spot: glow, three animated flame tongues; `size` is the flame height in scene px. */
  function flame(g,x,y,size,amount,t,key=0){
    if(amount<=0)return;const a=Math.min(1,.35+amount*.65),k=key*1.37;
    g.save();g.globalCompositeOperation='lighter';
    const glow=g.createRadialGradient(x,y-size*.35,size*.05,x,y-size*.35,size*1.05);glow.addColorStop(0,`rgba(255,170,60,${.42*a})`);glow.addColorStop(1,'rgba(255,90,20,0)');g.fillStyle=glow;g.fillRect(x-size*1.1,y-size*1.4,size*2.2,size*2.2);
    for(let i=0;i<3;i++){const off=(i-1)*size*.32,frame=Math.floor(t*14+k*5+i*5),h=size*(.78+.22*Math.sin(t*7.3+k+i*2.1))*(i===1?1.15:.9);
      if(!cell(g,'flame',frame,x+off,y,h*1.25,{alpha:a,anchor:'bottom'})){g.fillStyle=`rgba(255,${120+i*40},40,${.6*a})`;g.beginPath();g.ellipse(x+off,y-h*.45,h*.22,h*.5,0,0,Math.PI*2);g.fill();}}
    g.restore();
  }
  function spawn(kind,x,y,vx,vy,life,size,extra={}){if(particles.length>=MAX_PARTICLES)particles.shift();particles.push({kind,x,y,vx,vy,life,max:life,size,frame:Math.floor(rnd()*16),rot:rnd()*6.28,spin:(rnd()-.5)*1.5,...extra});}
  function stepParticles(g,dt){
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.spin*dt;if(p.kind==='drop'){p.vy+=900*dt;}if(p.kind==='smoke'||p.kind==='steam'){p.vx*=.99;p.size*=1+dt*.5;}
      const u=p.life/p.max,alpha=p.kind==='drop'?Math.min(1,u*2):p.kind==='spark'?u:Math.min(1,u*1.6)*(p.alpha??.75);
      if(p.kind==='spark'){g.save();g.globalCompositeOperation='lighter';g.strokeStyle=`rgba(190,230,255,${alpha})`;g.lineWidth=2.4;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x-p.vx*.03,p.y-p.vy*.03);g.stroke();g.restore();continue;}
      if(p.kind==='confetti'){g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.color;g.globalAlpha=Math.min(1,u*3);g.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);g.restore();continue;}
      const sheet=p.kind==='drop'?'water':p.kind==='ember'?'ember':p.kind==='steam'?'steam':p.kind==='powder'||p.kind==='foam'?'steam':'smoke';
      if(p.kind==='ember'){g.save();g.globalCompositeOperation='lighter';cell(g,sheet,p.frame,p.x,p.y,p.size,{alpha});g.restore();}
      else cell(g,sheet,p.frame,p.x,p.y,p.size,{alpha,rot:p.kind==='drop'?Math.atan2(p.vy,p.vx)-Math.PI/2:p.rot});
    }
  }
  /** The water jet: a soft stroke along the arc, a bright core, droplets that ride it and a splash where it lands. */
  function jet(g,from,to,{power=1,color='rgba(200,236,255,',width=17,dt=0,kind='drop'}={}){
    const arc=jetArc(from,to,18,.18);g.save();g.lineCap='round';g.lineJoin='round';
    for(const [w,a]of [[width*1.9,.16],[width,.42],[width*.38,.85]]){g.strokeStyle=color+(a*power)+')';g.lineWidth=w;g.beginPath();g.moveTo(arc[0].x,arc[0].y);for(let i=1;i<arc.length;i++){const taper=1+i/arc.length*.6;g.lineWidth=w*taper;g.lineTo(arc[i].x,arc[i].y);}g.stroke();}
    g.restore();
    if(dt>0){for(let i=0;i<2;i++){const u=rnd(),j=Math.min(arc.length-2,Math.floor(u*(arc.length-1))),p=arc[j],q=arc[j+1];spawn(kind,p.x,p.y,(q.x-p.x)*8+(rnd()-.5)*40,(q.y-p.y)*8,.25,kind==='drop'?16+rnd()*10:28+rnd()*18,{alpha:.7});}
      for(let i=0;i<2;i++)spawn(kind==='drop'?'drop':kind,to.x+(rnd()-.5)*20,to.y,(rnd()-.5)*260,-120-rnd()*200,.45,kind==='drop'?18+rnd()*14:30+rnd()*20,{alpha:.75});}
  }
  function can(g,x,y,push,fall,t){ // a metal bin drawn as an object: body, ribs, lid and handle
    g.save();g.translate(x,y);g.rotate(fall?fall.spin:push>0?push*.3+Math.sin(t*25)*.05*push:0);
    const w=34,h=44,body=g.createLinearGradient(-w/2,0,w/2,0);body.addColorStop(0,'#5e6b73');body.addColorStop(.35,'#c7d0d5');body.addColorStop(.6,'#8e9aa1');body.addColorStop(1,'#4a555c');
    g.fillStyle=body;g.beginPath();g.moveTo(-w/2,-h/2);g.lineTo(w/2,-h/2);g.lineTo(w*.42,h/2);g.lineTo(-w*.42,h/2);g.closePath();g.fill();
    g.strokeStyle='#3a444a';g.lineWidth=1.4;for(const k of [-.15,.15])g.strokeRect(-w/2+2,h*k-1,w-4,2);
    g.fillStyle='#9aa6ad';g.beginPath();g.ellipse(0,-h/2,w*.56,5,0,0,Math.PI*2);g.fill();g.fillStyle='#6d7a82';g.fillRect(-5,-h/2-7,10,4);
    g.restore();
  }
  function veil(g,x,y,r,density,t,key){for(let i=0;i<6;i++){const a=i/6*6.28+t*.25+key,d=r*.45;cell(g,'smoke',i*3+key,x+Math.cos(a)*d,y+Math.sin(a)*d*.6,r*1.25,{alpha:.85*density,rot:a});}}
  const scene=(g,W2,H2,dpr)=>{g.setTransform(dpr*fit.s,0,0,dpr*fit.s,dpr*fit.ox,dpr*fit.oy);};
  return {
    particles,
    resize(w,h){W=w;H=h;},
    layout(sceneW,sceneH,safe){fit=fitScene(W,H,sceneW,sceneH,safe);return fit;},
    get fit(){return fit;},
    toScene(x,y){return {x:(x-fit.ox)/fit.s,y:(y-fit.oy)/fit.s};},
    toScreen(x,y){return {x:fit.ox+x*fit.s,y:fit.oy+y*fit.s};},
    background(g,id,dpr,fill=['#9fc0de','#4b4f55']){g.setTransform(dpr,0,0,dpr,0,0);const grad=g.createLinearGradient(0,0,0,H);grad.addColorStop(0,fill[0]);grad.addColorStop(1,fill[1]);g.fillStyle=grad;g.fillRect(0,0,W,H);scene(g,W,H,dpr);if(!sprite(g,id,0,0,fit.sceneW,fit.sceneH)){g.fillStyle='#6f8597';g.fillRect(0,0,fit.sceneW,fit.sceneH);}},
    // ---- targets ---------------------------------------------------------------------------------------------------------------
    drawTargets(g,model,t,dt,dpr){
      this.layout(2000,900,{x0:520,x1:1600,y0:40,y1:900});this.background(g,'street',dpr);
      const truck=spriteBox('truck');if(truck)sprite(g,'truck',truck.x,truck.y,truck.w,truck.h);
      for(const tg of model.targets){
        if(tg.kind==='window'||tg.kind==='roof'){const amount=tg.heat/(tg.kind==='roof'?1.6:1);
          if(!tg.done){const size=(tg.kind==='roof'?120:84)*(.55+.45*amount);flame(g,tg.x,tg.y+(tg.kind==='roof'?24:30),size,amount,t,tg.id);if(tg.kind==='roof'){flame(g,tg.x-62,tg.y+26,size*.8,amount,t+.4,tg.id+3);flame(g,tg.x+60,tg.y+26,size*.85,amount,t+.8,tg.id+5);}
            if(dt&&rnd()<dt*3*amount)spawn('smoke',tg.x+(rnd()-.5)*30,tg.y-size*.6,(rnd()-.5)*12+model.wind*.03,-38-rnd()*22,2.6,60+rnd()*40,{alpha:.55});
            if(dt&&rnd()<dt*4*amount)spawn('ember',tg.x+(rnd()-.5)*40,tg.y,(rnd()-.5)*40,-90-rnd()*60,1.1,18,{});}
          else if(t-tg.doneAt<2.4&&dt&&rnd()<dt*8)spawn('steam',tg.x+(rnd()-.5)*40,tg.y,(rnd()-.5)*20,-50,1.6,50+rnd()*30,{alpha:.6});}
        else if(tg.kind==='fireball'&&!tg.done){const amount=tg.heat/.9;g.save();g.globalCompositeOperation='lighter';const r=tg.r*(.85+.15*Math.sin(t*9));const glow=g.createRadialGradient(tg.x,tg.y,2,tg.x,tg.y,r*1.6);glow.addColorStop(0,`rgba(255,240,180,${.95*amount})`);glow.addColorStop(.35,`rgba(255,150,40,${.75*amount})`);glow.addColorStop(1,'rgba(255,60,10,0)');g.fillStyle=glow;g.beginPath();g.arc(tg.x,tg.y,r*1.6,0,6.29);g.fill();g.restore();
          flame(g,tg.x,tg.y+r*.7,r*1.9,amount,t,tg.id);if(dt&&rnd()<dt*14)spawn('ember',tg.x+(rnd()-.5)*r,tg.y+(rnd()-.5)*r,(rnd()-.5)*60,30+rnd()*50,.9,22,{});}
        else if(tg.kind==='fireball'&&tg.done&&t-tg.doneAt<.1&&dt)for(let i=0;i<10;i++)spawn('steam',tg.x,tg.y,(rnd()-.5)*240,(rnd()-.5)*240,1.1,60,{alpha:.7});
        else if(tg.kind==='smoke'&&!tg.done)veil(g,tg.x,tg.y,tg.r*1.1,Math.max(.25,tg.density),t,tg.id);
        else if(tg.kind==='can'&&!(tg.done&&t-tg.doneAt>2.5))can(g,tg.x,tg.y,tg.push,tg.fall,t);
      }
      stepParticles(g,dt);
      // the jet, then the firefighter in front of it
      if(model.spraying)jet(g,model.nozzle,model.impact,{power:.45+.55*model.pressure,dt});
      const crew=spriteBox('crew-'+model.crew);if(crew)sprite(g,'crew-'+model.crew,crew.x,crew.y,crew.w,crew.h);
      // aim ring: green when the water will act on a target
      const a=model.aim,on=model.hitTarget!==null,pulse=1+.08*Math.sin(t*10);g.save();g.lineWidth=4;g.strokeStyle='rgba(10,20,30,.55)';g.beginPath();g.arc(a.x,a.y,30*pulse,0,6.29);g.stroke();g.lineWidth=3;g.strokeStyle=on?'#8af0a6':'#ffffff';g.beginPath();g.arc(a.x,a.y,30*pulse,0,6.29);g.stroke();
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){g.beginPath();g.moveTo(a.x+dx*18,a.y+dy*18);g.lineTo(a.x+dx*42,a.y+dy*42);g.stroke();}g.restore();
      for(const p of model.popups){const u=t-p.at;g.save();g.globalAlpha=Math.max(0,1-u/1.4);g.font='800 34px system-ui,sans-serif';g.textAlign='center';g.lineWidth=6;g.strokeStyle='#14202b';g.fillStyle='#ffe28a';g.strokeText(p.text,p.x,p.y-u*40);g.fillText(p.text,p.x,p.y-u*40);g.restore();}
    },
    // ---- interior --------------------------------------------------------------------------------------------------------------
    drawInterior(g,model,t,dt,dpr){
      const phase=model.phase;
      if(phase==='arrive'||phase==='door'||phase==='enter'||phase==='victory')return this.drawStreetPhase(g,model,t,dt,dpr);
      const room=model.room,crawl=room.crawl,id=room.image;
      // crawling: the eyes go down, so the view zooms toward the floor (the floor edge stays at the bottom of the screen)
      this.layout(1600,740,{x0:120,x1:1520,y0:90,y1:740});if(crawl>0){const z=1+.12*crawl;fit.ox=W/2-(W/2-fit.ox)*z;fit.oy=H-(H-fit.oy)*z;fit.s*=z;}
      this.background(g,id,dpr,['#2b2a2a','#2b2a2a']);
      g.save();
      for(const s of room.spots){
        if(!s.done){const amount=Math.min(1.3,s.heat/s.maxHeat)*(1+s.flare*.8),size=(s.kind==='heavy'?120:s.kind==='oil'?92:86)*(.6+.4*Math.min(1,amount));flame(g,s.x,s.y+size*.3,size,Math.min(1,amount),t,s.id.length+s.x%7);
          if(s.kind==='heavy')flame(g,s.x+size*.45,s.y+size*.3,size*.8,Math.min(1,amount),t+.5,s.x%5);
          if(s.flare>0&&dt&&rnd()<dt*30)spawn('ember',s.x+(rnd()-.5)*60,s.y,(rnd()-.5)*160,-260-rnd()*160,.8,26,{});
          if(s.spark>0&&dt)for(let i=0;i<3;i++)spawn('spark',s.x+(rnd()-.5)*30,s.y+(rnd()-.5)*30,(rnd()-.5)*700,(rnd()-.5)*700,.18,4,{});
          if(dt&&rnd()<dt*2.4)spawn('smoke',s.x+(rnd()-.5)*30,s.y-size*.7,(rnd()-.5)*10,-30-rnd()*20,2.4,70,{alpha:.45});}
        else{g.save();g.globalCompositeOperation='multiply';const r=s.r*1.1,grd=g.createRadialGradient(s.x,s.y,4,s.x,s.y,r);grd.addColorStop(0,'rgba(40,34,30,.55)');grd.addColorStop(1,'rgba(40,34,30,0)');g.fillStyle=grd;g.beginPath();g.arc(s.x,s.y,r,0,6.29);g.fill();g.restore();
          if(s.smothered)sprite(g,'tool-blanket',s.x-48,s.y-34,96,72);
          if(t-s.doneAt<2&&dt&&rnd()<dt*6)spawn('steam',s.x+(rnd()-.5)*30,s.y-10,(rnd()-.5)*16,-40,1.4,46,{alpha:.55});}
      }
      this.drawRescue(g,model,room,t);
      stepParticles(g,dt);
      g.restore();
      // smoke from the ceiling down to the smoke line; crawling lifts the clear zone
      const line=smokeLine(room)-crawl*model.tuning.crawlLift;g.save();
      const top=room.ceiling-140,grad=g.createLinearGradient(0,top,0,line+70);grad.addColorStop(0,'rgba(48,46,46,.94)');grad.addColorStop(Math.max(.01,(line-top)/(line+70-top)),'rgba(58,56,56,.82)');grad.addColorStop(1,'rgba(60,58,58,0)');
      g.fillStyle=grad;g.fillRect(-200,top,2000,line+70-top);
      for(let i=0;i<9;i++){const x=(i*211+t*24*(i%2?1:-1))%1900-150;cell(g,'smoke',i*5,x,line-10+Math.sin(t*.7+i)*14,170,{alpha:.55});}
      g.restore();
      // the tool in hand and its stream
      const hand={x:900,y:760},aim=model.aim;
      if(model.spraying&&aim){const tool=model.tool,from={x:hand.x-40,y:hand.y-70},to={x:aim.x,y:aim.y};
        if(tool==='water')jet(g,from,to,{power:.5+.5*model.tanks.water,dt});
        else if(tool==='foam')jet(g,from,to,{power:.9,color:'rgba(250,250,245,',width:24,dt,kind:'foam'});
        else if(tool==='extinguisher'&&dt){for(let i=0;i<3;i++){const u=rnd();spawn('powder',from.x+(to.x-from.x)*u+(rnd()-.5)*30*u,from.y+(to.y-from.y)*u+(rnd()-.5)*30*u,(to.x-from.x)*.6,(to.y-from.y)*.6,.35,30+u*70,{alpha:.55});}}}
      const held=model.tool==='extinguisher'?'tool-extinguisher':model.tool==='blanket'?'tool-blanket':'tool-hose',im=img(held);
      if(im){const h=held==='tool-extinguisher'?210:held==='tool-blanket'?120:150,w=h*im.naturalWidth/im.naturalHeight,lean=aim?Math.max(-.35,Math.min(.35,(aim.x-hand.x)/1600)):0;g.save();g.translate(hand.x,hand.y);g.rotate(lean);g.drawImage(im,-w/2,-h,w,h);g.restore();}
      if(aim&&model.tool!=='blanket'){g.save();g.strokeStyle=model.hitSpot?'#8af0a6':'#fff';g.lineWidth=3;g.beginPath();g.arc(aim.x,aim.y,24,0,6.29);g.stroke();g.restore();}
    },
    drawRescue(g,model,room,t){
      const c=room.rescue;if(c.state==='saved'||(c.state==='teammate'&&c.t>=1))return;
      const leaving=c.state==='leaving'||c.state==='teammate',u=leaving?ease(c.t):0;
      const fx=c.x+(c.exit.x-c.x)*u,fy=c.y+(c.exit.y-c.y)*u,scale=1-u*(1-(c.exit.y-c.exitTop.y)/Math.max(1,c.y-c.headY));
      const fade=c.state==='teammate'?.55:1;
      if(c.kind==='pet'){const h=(c.y-c.headY)*1.5*scale,hop=leaving?Math.abs(Math.sin(t*10))*18*scale:Math.abs(Math.sin(t*2.2))*4;const im=img('pet');
        g.save();g.globalAlpha=fade*(c.state==='teammate'?1-u:1);g.fillStyle='rgba(0,0,0,.18)';g.beginPath();g.ellipse(fx,fy,h*.42,h*.1,0,0,6.29);g.fill();if(im){const w=h*im.naturalWidth/im.naturalHeight;g.drawImage(im,fx-w/2,fy-h-hop,w,h);}g.restore();return;}
      const box=spriteBox(c.sprite),frame=leaving?`${c.run}-${Math.floor(t*8)%4}`:c.sprite,fb=spriteBox(frame)||box;if(!fb)return;
      const w=fb.w*scale,h=fb.h*scale,footX=box.x+box.w/2,footY=box.y+box.h;
      g.save();g.globalAlpha=fade*(c.state==='teammate'?1-u*.7:1);g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(fx,fy,w*.4,10*scale,0,0,6.29);g.fill();
      sprite(g,frame,fx-(footX-fb.x)*scale,fy-(footY-fb.y)*scale,w,h);
      if(c.state==='waiting'&&!leaving){const bob=Math.sin(t*4)*5,y=c.headY-30+bob;g.globalAlpha=.95;g.fillStyle='#ffe28a';g.strokeStyle='#1d2730';g.lineWidth=4;g.beginPath();g.moveTo(fx-16,y-22);g.lineTo(fx+16,y-22);g.lineTo(fx,y);g.closePath();g.stroke();g.fill();}
      g.restore();
    },
    drawStreetPhase(g,model,t,dt,dpr){
      this.layout(2000,900,{x0:560,x1:1560,y0:120,y1:900});this.background(g,'street',dpr);
      const truck=spriteBox('truck');
      if(truck){const p=model.phase==='arrive'?ease(model.truckProgress):1,shift=(1-p)*-900,bounce=model.phase==='arrive'&&p<1?Math.sin(t*28)*1.5:0;sprite(g,'truck',truck.x+shift,truck.y+bounce,truck.w,truck.h);}
      if(model.phase==='door'){const d=model.door,r=56+8*Math.sin(t*5);g.save();g.strokeStyle='#ffe28a';g.lineWidth=7;g.setLineDash([16,10]);g.lineDashOffset=-t*40;g.beginPath();g.ellipse(d.x,d.y-50,r,r*1.45,0,0,6.29);g.stroke();g.restore();}
      if(model.phase==='victory'){for(const id of ['victory-crew','victory-kid']){const b=spriteBox(id);if(b)sprite(g,id,b.x,b.y,b.w,b.h);}
        const kid=spriteBox('victory-kid'),pet=img('pet');if(kid&&pet&&model.rooms.some(r=>r.rescue.kind==='pet'&&r.rescue.state!=='waiting')){const h=48,w=h*pet.naturalWidth/pet.naturalHeight;g.drawImage(pet,kid.x+kid.w+6,kid.y+kid.h-h-Math.abs(Math.sin(t*6))*10,w,h);}
        if(dt&&particles.filter(p=>p.kind==='confetti').length<90&&rnd()<dt*40){const colors=['#ffd166','#ef476f','#06d6a0','#118ab2','#f78c6b'];spawn('confetti',600+rnd()*800,-20,(rnd()-.5)*120,140+rnd()*120,4,16+rnd()*10,{color:colors[Math.floor(rnd()*colors.length)],spin:(rnd()-.5)*8});}}
      stepParticles(g,dt);
      if(model.phase==='enter'){g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle=`rgba(10,8,8,${Math.min(1,model.phaseTime/model.tuning.enterSeconds)})`;g.fillRect(0,0,W,H);}
    },
  };
}
