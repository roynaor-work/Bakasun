// 14/11/2026 fire v24: prototype for comparison (rule 5 of the design lessons): the same living room in three styles, side by side, so the
// level is chosen by looking, not by guessing. Panel 3 is the real v24 room scene (fire-v24-scene.mjs) driven by the real model.
import {createInteriorModel} from '../minigames/fire-v24-interior.mjs';
import {createInteriorScene} from '../minigames/fire-v24-scene.mjs';
import {entryPlan} from '../minigames/fire-v24.mjs';

const q=new URLSearchParams(location.search),fixed=q.get('t');
const room=new Image();room.src='../assets/fire-v23/room-living.webp';
const flame=new Image();flame.src='../assets/fire-v23/fx/flame-large.png';
const smoke=new Image();smoke.src='../assets/fire-v23/fx/smoke-black.png';
const FIRES=[[520,640,1.1],[1010,900,.9]]; // scene px of the 1600x1200 room picture (sofa, rug)
function frame(ctx,img,cols,rows,n,i,x,y,w,h,add){if(!img.complete||!img.naturalWidth)return;const fw=img.naturalWidth/cols,fh=img.naturalHeight/rows,k=i%n;ctx.save();if(add)ctx.globalCompositeOperation='lighter';ctx.drawImage(img,(k%cols)*fw,Math.floor(k/cols)*fh,fw,fh,x-w/2,y-h,w,h);ctx.restore();}
function draw2d(ctx,t,W,H){ctx.clearRect(0,0,W,H);const s=Math.max(W/1600,H/1200),ox=(W-1600*s)/2,oy=H-1200*s;if(room.complete)ctx.drawImage(room,ox,oy,1600*s,1200*s);
  for(const [x,y,k] of FIRES)frame(ctx,flame,4,2,8,Math.floor(t*12+x),ox+x*s,oy+y*s,160*s*k,320*s*k,true);}
function draw25(ctx,t,W,H){ctx.clearRect(0,0,W,H);const s=Math.max(W/1600,H/1200)*1.08,px=Math.sin(t*.6)*14,py=Math.cos(t*.45)*6,ox=(W-1600*s)/2,oy=H-1200*s;
  if(room.complete){ctx.save();ctx.filter='brightness(.72) blur(1px)';ctx.drawImage(room,ox+px*.4,oy+py*.4,1600*s,1200*s);ctx.restore();ctx.save();ctx.beginPath();ctx.rect(0,H*.45,W,H*.55);ctx.clip();ctx.drawImage(room,ox+px,oy+py,1600*s,1200*s);ctx.restore();}
  for(const [i,[x,y,k]] of FIRES.entries()){const lx=ox+x*s+px*(1+i*.4),ly=oy+y*s+py;frame(ctx,flame,4,2,8,Math.floor(t*12+x),lx,ly,170*s*k,340*s*k,true);for(let j=0;j<4;j++){const u=((t*.35+j*.25+i*.1)%1);ctx.globalAlpha=.5*(1-u);frame(ctx,smoke,4,4,16,Math.floor(u*16),lx+Math.sin(j+t)*20*s,ly-320*s*k-u*260*s,140*s*(.6+u),140*s*(.6+u),false);ctx.globalAlpha=1;}}
  const g=ctx.createLinearGradient(0,0,0,H*.5);g.addColorStop(0,'rgba(20,18,24,.85)');g.addColorStop(1,'rgba(20,18,24,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H*.5);}
const c2=document.getElementById('c2d').getContext('2d'),c25=document.getElementById('c25').getContext('2d');
// panel 3: the real scene and the real model
const model=createInteriorModel({plan:entryPlan(3)});for(let i=0;i<40&&model.phase!=='play';i++)model.update(.1,{skip:true});
const canvas3=document.getElementById('c3d'),scene=createInteriorScene({model,canvas:canvas3});scene.resize(844,390,1);
const sofa=model.room.spots.find(s=>s.id==='sofa');
let last=performance.now(),t=0,frames=0,acc=0;
function loop(now){const dt=Math.min(.1,(now-last)/1000);last=now;t+=dt;
  draw2d(c2,t,844,390);draw25(c25,t,844,390);
  // the 3D model sprays the sofa for a while, then rests, so both the water and the fire show
  const spray=(t%6)<3.2;model.update(dt,spray?{aim:sofa.pos}:{});if(model.room.spots.every(s=>s.done)||model.phase!=='play'){/* keep the picture: reload for another round */}
  scene.update(dt);scene.render();frames++;acc+=dt;
  if(acc>=1){const m=scene.metrics();document.getElementById('m3d').textContent=`משולשים ${m.triangles} · קריאות ציור ${m.drawCalls} · fps ${Math.round(frames/acc)}`;document.getElementById('m2d').textContent='תמונה אחת + 2 ספרייטים';document.getElementById('m25').textContent='3 שכבות + ספרייטים · פרלקסה';frames=0;acc=0;}
  window.__styles={t,metrics:scene.metrics(),ready:scene.ready};
  if(!fixed||t<Number(fixed))requestAnimationFrame(loop);}
requestAnimationFrame(loop);
