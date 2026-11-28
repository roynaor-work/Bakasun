/** Island Pro Basketball v25.0 HUD: the DOM side of hoops-v250.mjs. One pointer-transparent layer over the court:
 * the shot meter beside the shooter (green window, marker, release result as an icon), thin rings under the team-mates
 * the child can tap, the rebound cue ring with its jump grade, and the special gauge. Icons only, no words on the court.
 * Taps are read on the game screen in the capture phase and never block the stick or the buttons. */
import {V250,meterModel,releaseGrade,pickTapTarget,isTap} from './hoops-v250.mjs';
import {meterAnchor,METER} from './hoops-v252.mjs';

const FLAME='<path d="M16 3c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1-5 3-7 0 3 1 4 2 4 1-4-1-7 2-12Z"/><path d="M16 27a3.5 3.5 0 0 1-3.5-3.5c0-2 1.5-3 3.5-5.5 2 2.5 3.5 3.5 3.5 5.5A3.5 3.5 0 0 1 16 27Z"/>';
const JUMP='<path d="M16 27V9"/><path d="m9 15 7-7 7 7"/>';

export function createHoopsV250Hud({stageEl,screenEl,doc=stageEl.ownerDocument,flags,balance,controls,signal,icon,bug,v252=null}){
 const node=(tag,cls)=>{const n=doc.createElement(tag);if(cls)n.className=cls;return n;};
 const svg=(paths)=>{const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 32 32');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','2.6');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.innerHTML=paths;return s;};
 const layer=node('div','hv250');layer.setAttribute('aria-hidden','true');stageEl.append(layer);
 screenEl.dataset.hoopsV250=[flags.meter&&'meter',flags.hud&&'hud',flags.tapPass&&'tap',flags.rebound&&'reb',flags.special&&'special'].filter(Boolean).join(' ');
 // v25.2: the smaller meter on the free side of the shooter and no large rebound ring (hoops-v252.mjs; ?hoopsMeterPos=old)
 const sideMeter=v252?.meterPos==='side';if(sideMeter)screenEl.dataset.hoopsMeterPos='side';
 const counts={taps:0,tapHits:0,meterShown:0,results:{perfect:0,good:0,early:0,late:0},rebCues:0,rebGrades:{perfect:0,good:0,early:0,late:0},specialReady:0,specialUsed:0};
 const pa={},pb={};

 // ---- shot meter
 const meter=node('div','hv250-meter'),track=node('span','hv250-track'),yellow=node('i','hv250-yellow'),green=node('i','hv250-green'),marker=node('i','hv250-marker'),badge=node('span','hv250-badge');
 track.append(yellow,green,marker);meter.append(track,badge);meter.hidden=true;if(flags.meter)layer.append(meter);
 let held=false,timed=false,result=null,meterPos={x:0,y:0};
 const pct=v=>(v*100).toFixed(1)+'%';
 function placeMeter(me,view,s){
  if(sideMeter){
   const p=view.project(me.x,1.1,me.z,pa),px=p.x,py=p.y,hd=view.project(me.x,1.95,me.z,pb),ft=view.project(me.x,0.03,me.z,pa),body=Math.abs(ft.y-hd.y),w=stageEl.clientWidth,h=stageEl.clientHeight,others=[];
   for(const o of s?.players||[]){if(o.id===me.id)continue;const q=view.project(o.x,1.1,o.z,pb);others.push({x:q.x,y:q.y});}
   // the stick on the left and the action buttons on the right (landscape) are not covered
   const avoid=w>h?[{x0:0,y0:h-220,x1:130,y1:h},{x0:w-172,y0:h-172,x1:w,y1:h},{x0:w-244,y0:h-98,x1:w,y1:h}]:[];
   const a=meterAnchor({shooter:{x:px,y:py},others,width:w,height:h,body,top:(bug?bug.offsetTop+bug.offsetHeight:56)+10+26,avoid});
   meterPos.x=Math.round(a.x-METER.width/2);meterPos.y=Math.round(a.y-METER.height/2);meter.dataset.side=String(a.side);
   meter.style.transform=`translate3d(${meterPos.x}px,${meterPos.y}px,0)`;return;
  }
  const p=view.project(me.x,1.25,me.z,pa),w=stageEl.clientWidth,h=stageEl.clientHeight,top=(bug?bug.offsetTop+bug.offsetHeight:56)+10;
  // beside the shooter, on the side with more room; never under the score bug, never off the screen
  // in landscape the stick column on the left and the action buttons on the right are out of bounds: nothing of the meter goes under them
  const land=w>h,minX=land?130:8,maxX=land?w-262:w-34,sideX=p.x>w*0.6?-58:44;meterPos.x=Math.round(Math.max(minX,Math.min(maxX,p.x+sideX)));meterPos.y=Math.round(Math.max(top+34,Math.min(h-150,p.y-78)));
  meter.style.transform=`translate3d(${meterPos.x}px,${meterPos.y}px,0)`;
 }
 function drawMeter(me,view,now,s){
  const shooting=!!(me&&me.act==='shoot'&&me.hasBall&&me.shotHeld);
  if(shooting){
   const rel=balance.anim[me.shotType==='ft'?'freethrow':me.shotType]?.release||0.8,m=meterModel(me.actT,rel,balance.shot);
   if(meter.hidden||result){meter.hidden=false;result=null;meter.dataset.result='';badge.replaceChildren();counts.meterShown++;}
   placeMeter(me,view,s);
   yellow.style.bottom=pct(m.yellow[0]);yellow.style.height=pct(m.yellow[1]-m.yellow[0]);
   green.style.bottom=pct(m.green[0]);green.style.height=pct(m.green[1]-m.green[0]);
   marker.style.bottom=pct(m.marker);meter.dataset.zone=m.zone;held=true;
  }else if(result){if(now>result.until){result=null;meter.hidden=true;}}
  else if(!meter.hidden)meter.hidden=true;
 }
 function showResult(grade,now){
  if(!flags.meter)return;counts.results[grade]++;
  result={grade,until:now+V250.meter.hold*1000};meter.hidden=false;meter.dataset.result=grade;badge.replaceChildren(icon(grade,doc));
 }

 // ---- team-mate rings and taps
 const rings=new Map();let candidates=[],pendingTap=null,down=null,flash=null;
 function drawMates(s,view,me,now){
  candidates=[];const seen=new Set(),show=flags.tapPass&&s.phase==='live'&&!!me;
  if(show)for(const p of s.players){
   if(p.team!==s.userTeam||p.id===s.controlled)continue;
   const f=view.project(p.x,0.03,p.z,pa),hd=view.project(p.x,p.y+1.95,p.z,pb);
   const c={id:p.id,foot:{x:f.x,y:f.y},head:{x:hd.x,y:hd.y},visible:f.visible&&hd.visible};candidates.push(c);
   if(!c.visible||!me.hasBall)continue;
   let r=rings.get(p.id);if(!r){r=node('i','hv250-mate');layer.append(r);rings.set(p.id,r);}
   const size=Math.max(26,Math.min(64,Math.abs(f.y-hd.y)*0.6));
   r.hidden=false;seen.add(p.id);r.style.width=size.toFixed(0)+'px';r.style.height=(size*0.4).toFixed(0)+'px';r.style.transform=`translate3d(${Math.round(f.x-size/2)}px,${Math.round(f.y-size*0.2)}px,0)`;
   r.dataset.flash=String(!!flash&&flash.id===p.id&&now<flash.until);
  }
  for(const [id,r] of rings)if(!seen.has(id))r.hidden=true;
 }
 if(flags.tapPass){
  const local=e=>{const r=stageEl.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top,t:e.timeStamp,id:e.pointerId};};
  const opt={signal,capture:true,passive:true};
  screenEl.addEventListener('pointerdown',e=>{if(e.button>0||e.target?.closest?.('button,dialog,[role=dialog]'))return;down=local(e);},opt);
  screenEl.addEventListener('pointercancel',e=>{if(down&&down.id===e.pointerId)down=null;},opt);
  screenEl.addEventListener('pointerup',e=>{
   if(!down||down.id!==e.pointerId)return;const up=local(e),d=down;down=null;
   if(!isTap(d,up))return;counts.taps++;
   const id=pickTapTarget(up,candidates);if(id==null)return;
   counts.tapHits++;pendingTap={id,at:performance.now()};flash={id,until:performance.now()+350};
  },opt);
 }

 // ---- rebound cue
 const reb=node('div','hv250-reb'),rebRing=node('i','hv250-reb-ring'),rebCore=node('span','hv250-reb-core');rebCore.append(svg(JUMP));reb.append(rebRing,rebCore);reb.hidden=true;
 const rebGrade=node('span','hv250-badge hv250-reb-grade');rebGrade.hidden=true;let rebGradeUntil=0,cueOn=false;
 if(flags.rebound)layer.append(reb,rebGrade);
 function drawRebound(s,view,me,now){
  const cue=flags.rebound&&s.phase==='live'&&me&&!me.hasBall?s.rebound:null;
  if(cue&&cue.t<1.4){
   const p=view.project(cue.x,0.03,cue.z,pa),q=view.project(cue.x+0.6,0.03,cue.z,pb),size=Math.max(30,Math.min(70,Math.abs(q.x-p.x)*2.4+18));
   if(!cueOn){cueOn=true;counts.rebCues++;}
   reb.hidden=!p.visible;reb.style.width=size.toFixed(0)+'px';reb.style.height=(size*0.46).toFixed(0)+'px';reb.style.transform=`translate3d(${Math.round(p.x-size/2)}px,${Math.round(p.y-size*0.23)}px,0)`;
   // the outer ring closes on the spot as the ball comes down; green = jump now
   rebRing.style.transform=`scale(${(1+Math.max(0,cue.t-V250.rebound.lead)*1.5).toFixed(2)})`;reb.dataset.go=String(!!cue.go);
  }else{if(cueOn)cueOn=false;if(!reb.hidden)reb.hidden=true;}
  if(!rebGrade.hidden&&now>rebGradeUntil)rebGrade.hidden=true;
 }

 // ---- special gauge
 const special=node('div','hv250-special');special.append(svg(FLAME));if(flags.special)layer.append(special);let lastV=-1,lastReady=null,fireUntil=0;
 function drawSpecial(s,now){
  const sp=s.special;if(!flags.special||!sp)return;
  if(sp.v!==lastV){lastV=sp.v;special.style.setProperty('--v',String(sp.ready?1:sp.v));}
  if(sp.ready!==lastReady){lastReady=sp.ready;special.dataset.ready=String(sp.ready);controls?.elements?.shoot?.classList.toggle('hv250-fire',sp.ready);}
  special.dataset.used=String(now<fireUntil);
 }

 return {
  update(s,view,now){
   if(!view)return;let me=null;for(const p of s.players)if(p.id===s.controlled){me=p;break;}
   if(flags.meter)drawMeter(me,view,now,s);
   drawMates(s,view,me,now);drawRebound(s,view,me,now);drawSpecial(s,now);
  },
  events(events,s,now){
   for(const e of events){
    if(e.type==='shotStart'&&e.playerId===s.controlled){held=false;timed=false;}
    else if(e.type==='timing'&&e.playerId===s.controlled){timed=true;showResult(releaseGrade(e),now);}
    // the button was never let go: the ball left late on its own
    else if(e.type==='release'&&e.playerId===s.controlled){if(held&&!timed)showResult('late',now);held=false;}
    else if(e.type==='shotCancel'){held=false;result=null;meter.hidden=true;}
    else if(e.type==='reboundTiming'&&flags.rebound){counts.rebGrades[e.grade]++;rebGrade.hidden=false;rebGrade.dataset.result=e.grade;rebGrade.replaceChildren(icon(e.grade,doc));rebGrade.style.transform=reb.style.transform;rebGradeUntil=now+800;}
    else if(e.type==='specialReady')counts.specialReady++;
    else if(e.type==='specialUsed'){counts.specialUsed++;fireUntil=now+900;}
   }
  },
  // a tap waits for the next simulation step only: one made during a pause or a replay is dropped, not thrown later
  takeTap(){const t=pendingTap;pendingTap=null;return t&&performance.now()-t.at<400?t.id:null;},
  get metrics(){return {...counts,meterVisible:!meter.hidden,meterResult:result?.grade||null,meterPos:{...meterPos},mates:[...rings.values()].filter(r=>!r.hidden).length,cue:!reb.hidden,candidates:candidates.map(c=>({id:c.id,x:Math.round((c.foot.x+c.head.x)/2),y:Math.round((c.foot.y+c.head.y)/2),visible:c.visible}))};},
  dispose(){layer.remove();controls?.elements?.shoot?.classList.remove('hv250-fire');delete screenEl.dataset.hoopsV250;},
 };
}
