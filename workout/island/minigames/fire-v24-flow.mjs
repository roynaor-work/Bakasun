/** 14/11/2026 fire v24: the entry stage flow around the regular street session. The street game is untouched (its model, view and session
 * run exactly as in v23); this wrapper adds, on an entry stage: the building the engine drives to (a door marker and an edge arrow on the
 * street picture), an "enter" button when the engine is parked at the door, the frozen street while the firefighter is inside (the room
 * session draws over it), and the merged raw result (score, performance, rescues) handed to the engine. `?fireFlow=v23` never reaches here. */
import {runFireSession} from './fire-session.mjs?v=island-v2-20261107-25';
import {drawFireCity} from './fire-canvas.mjs?v=island-v2-20261107-25';
import {fireRescueActionsEnabled} from './fire-levels-rescue.mjs?v=island-v2-20261107-25';
import {entryPlan,entryBuilding,arrivedAtBuilding,doorDistance,mergeResults,V24_TUNING} from './fire-v24.mjs?v=island-v2-20261107-25';

const loadInteriorModule=()=>import('./fire-v24-session.mjs?v=island-v2-20261107-25');

function markerPosition(x,y,width,height){
  const inset=34,top=74;
  return {x:Math.max(inset,Math.min(width-inset,x)),y:Math.max(top,Math.min(height-inset,y)),
    onScreen:x>=inset&&x<=width-inset&&y>=top&&y<=height-inset};
}

/** Marker and arrow for the building door on the street picture (config px, after the 3D frame). Pure drawing. */
export function drawDoorMarker(p,{x,y},{state,time,width,height,label,enterLabel}){
  const marker=markerPosition(x,y,width,height),pulse=.5+.5*Math.sin(time*4);
  p.save();p.lineJoin='round';p.lineCap='round';p.textAlign='center';p.textBaseline='middle';
  if(!marker.onScreen){ // edge arrow toward the door
    const cx=marker.x,cy=marker.y,ang=Math.atan2(y-cy,x-cx);
    p.translate(cx,cy);p.rotate(ang);p.fillStyle=state==='ready'?'#7cf0a8':'#ffb15a';p.strokeStyle='#1a1510';p.lineWidth=3;
    p.beginPath();p.moveTo(18+pulse*4,0);p.lineTo(-10,-13);p.lineTo(-4,0);p.lineTo(-10,13);p.closePath();p.fill();p.stroke();
    p.rotate(-ang);p.font='bold 13px sans-serif';p.fillStyle='#fff6e6';p.strokeStyle='#1a151099';p.lineWidth=4;p.strokeText(label,0,26);p.fillText(label,0,26);
    p.restore();return 'arrow';}
  const r=state==='ready'?26+pulse*6:16+pulse*4;
  p.strokeStyle=state==='ready'?'#7cf0a8':'#ffb15a';p.lineWidth=state==='ready'?5:3.5;p.globalAlpha=.55+.45*pulse;p.beginPath();p.arc(x,y,r,0,Math.PI*2);p.stroke();
  p.globalAlpha=.25;p.fillStyle=p.strokeStyle;p.beginPath();p.arc(x,y,r*.7,0,Math.PI*2);p.fill();p.globalAlpha=1;
  // door glyph
  p.fillStyle='#fff6e6';p.strokeStyle='#1a1510';p.lineWidth=2;p.beginPath();p.rect(x-6,y-9,12,18);p.fill();p.stroke();p.fillStyle='#1a1510';p.beginPath();p.arc(x+3,y+1,1.6,0,Math.PI*2);p.fill();
  p.font='bold 14px sans-serif';p.fillStyle='#fff6e6';p.strokeStyle='#1a1510aa';p.lineWidth=4;const text=state==='ready'?enterLabel:label;p.strokeText(text,x,y-r-12);p.fillText(text,x,y-r-12);
  p.restore();return 'marker';
}

export function startFireEntry(ctx,createModel,draw,createView,{runSession=runFireSession,loadInterior=loadInteriorModule,tuning=V24_TUNING}={}){
  const fireLevels=ctx.fireLevels===true,plan=entryPlan(ctx.level,{fireLevels,rescueActions:fireRescueActionsEnabled()}),building=entryBuilding(ctx.balance,ctx.level),t=ctx.t||(k=>k);
  if(!plan||!building)return runSession(ctx,createModel,draw,createView);
  const flow={state:'drive',inside:false,done:false,result:null,enterRequested:false,building,plan,enteredAt:null,markerKind:null,doorScreen:null,doorHit:null,navigateRequested:false};
  let street=null,interior=null,shellPaused=false,disposed=false,streetModel=null,noWebGL=false;
  let moduleReady=null;const warm=()=>{moduleReady=moduleReady||loadInterior().catch(()=>null);return moduleReady;};
  // ---- the model: frozen inside; the stage cannot end before the building is done; the coach points at the building ---------------
  function wrapModel(c){
    const m=createModel(fireLevels?{...c,balance:{...c.balance,fireLevelsBuilding:building}}:c);
    streetModel=m;
    const update=m.update.bind(m),canFinish=Object.getOwnPropertyDescriptor(m,'canFinish'),guidance=Object.getOwnPropertyDescriptor(m,'guidance');
    m.update=(dt,input)=>{
      if(flow.inside)return;
      if(flow.navigateRequested){
        flow.navigateRequested=false;
        input={...input,navigate:{kind:'building',index:0}};
      }
      if(fireLevels&&flow.enterRequested)input={...input,clearSelection:true};
      update(dt,input);
      if(flow.done){flow.state='done';return;}
      const arrived=arrivedAtBuilding(m.truck,building,tuning);flow.state=arrived?'ready':'drive';
      if(doorDistance(m.truck,building)<tuning.arriveRadius*2.5)warm();
      if(flow.enterRequested){flow.enterRequested=false;if(arrived)enter();}
    };
    if(canFinish?.get)Object.defineProperty(m,'canFinish',{configurable:true,enumerable:canFinish.enumerable,get(){return flow.done&&canFinish.get.call(m);}});
    if(guidance?.get)Object.defineProperty(m,'guidance',{configurable:true,enumerable:guidance.enumerable,get(){
      const g=guidance.get.call(m);
      if(flow.done)return g;
      if(flow.state==='ready')return {kind:'enter',key:'fire.v24.guide.arrived',distance:0,progress:0};
      const idle=g?.key==='fire.guide.complete'||g?.key==='fire.guide.select'||(canFinish?.get&&canFinish.get.call(m))||
        (fireLevels&&(g?.key==='fire.guide.fireOut'||g?.kind==='building'));
      return idle?{kind:'building',key:'fire.v24.guide.building',distance:Math.ceil(doorDistance(m.truck,building)),progress:0}:g;}});
    return m;
  }
  // ---- the view: no 3D render while inside (the room covers it); the door marker after the street frame -----------------------------
  function wrapView(c,m){
    const v=createView?.(c,m);
    if(!v&&!fireLevels){noWebGL=true;flow.done=true;return v;}
    const fallback={mode:'canvas',resize(){},dispose(){},degrade(){},targetAt(){},movementAt(){},metrics(){}};
    return new Proxy(v||fallback,{get(target,key){
      if(key==='draw')return p=>{
        if(flow.inside)return true;
        const drawn=target.draw?.(p);
        if(!drawn&&fireLevels)drawFireCity(p,m,c);
        if(!flow.done){
          const s=drawn&&target.mode==='three'?target.projectWorld(building.door):
            fireLevels?drawFireCity.projectWorld({x:building.door[0],z:building.door[2]},m,c):null;
          if(s){
            const {width,height}=c.config;
            flow.doorScreen={x:+s.x.toFixed(1),y:+s.y.toFixed(1)};
            flow.doorHit=fireLevels?markerPosition(s.x,s.y,width,height):flow.doorScreen;
            flow.markerKind=drawDoorMarker(p,s,{state:flow.state,time:m.time,width,height,label:t('fire.v24.doorLabel'),enterLabel:t('fire.v24.enter')});
          }
        }
        return fireLevels||drawn;
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  }
  // ---- the merged result --------------------------------------------------------------------------------------------------------------
  const wrappedCtx={...ctx,finish:raw=>{const merged=mergeResults(raw,flow.result,ctx.balance,tuning);return ctx.finish(merged);}};
  // ---- enter button and a tap on the door marker ---------------------------------------------------------------------------------------
  const {dialog,canvas}=ctx,events=new AbortController(),options={signal:events.signal};
  const enterButton=document.createElement('button');enterButton.type='button';enterButton.id='fire-enter';enterButton.className='fire-v24-enter';enterButton.dataset.action='fire-enter';enterButton.hidden=true;enterButton.setAttribute('aria-label',t('fire.v24.enter'));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M5 21V4l9-1v18M14 21h5V6h-5M11 12v1');svg.append(path);const cap=document.createElement('span');cap.className='fire-v24-enter-label';cap.textContent=t('fire.v24.enter');enterButton.append(svg,cap);dialog.append(enterButton);
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./fire-v24.css?v=island-v2-20261107-25',import.meta.url).href;document.head.append(link);
  enterButton.addEventListener('click',()=>{
    if(shellPaused||flow.inside||flow.done)return;
    if(flow.state==='ready')flow.enterRequested=true;
    else if(fireLevels)flow.navigateRequested=true;
  },options);
  const stage=fireLevels?dialog:canvas.parentElement;
  stage?.addEventListener('pointerdown',e=>{ // a tap on the door marker enters too; the street never sees that tap
    if(e.target===enterButton||enterButton.contains(e.target)||(!fireLevels&&flow.state!=='ready')||flow.inside||flow.done||shellPaused||!flow.doorHit)return;
    const r=canvas.getBoundingClientRect(),width=fireLevels?r.width:ctx.config.width,height=fireLevels?r.height:ctx.config.height;
    const x=(e.clientX-r.left)/r.width*width,y=(e.clientY-r.top)/r.height*height;
    if(Math.hypot(x-flow.doorHit.x,y-flow.doorHit.y)>44)return;
    e.stopPropagation();e.preventDefault();
    if(flow.state==='ready')flow.enterRequested=true;
    else flow.navigateRequested=true;},{...options,capture:true});
  function syncButton(){
    if(disposed)return;
    const ready=flow.state==='ready',drivingToDoor=streetModel?.navigation.active&&streetModel.navigation.kind==='building';
    enterButton.hidden=flow.inside||flow.done||(!ready&&(!fireLevels||drivingToDoor));
    if(fireLevels){
      const label=t(ready?'fire.v24.enter':'fire.levels.drive');
      if(cap.textContent!==label){cap.textContent=label;enterButton.setAttribute('aria-label',label);}
    }
    requestAnimationFrame(syncButton);
  }
  requestAnimationFrame(syncButton);
  // ---- inside ---------------------------------------------------------------------------------------------------------------------------
  function finishInside(result){interior=null;flow.inside=false;flow.done=true;flow.state='done';flow.result=result||{score:0,performance:0,rescued:0,rooms:plan.rooms.length,seconds:0,failed:true,...(fireLevels?{floors:plan.floorCount,handovers:plan.floorCount}:{})};if(!disposed&&!shellPaused)street?.setPaused(false);}
  function enter(){
    if(flow.inside||flow.done)return;flow.inside=true;flow.enteredAt=streetModel?.time??0;street?.setPaused(true);enterButton.hidden=true;
    warm().then(mod=>{if(disposed)return;if(!mod?.runFireV24Interior){finishInside(null);return;}
      try{interior=mod.runFireV24Interior(ctx,{plan,tutorial:Boolean(plan.tutorial),onDone:result=>finishInside(result)});if(shellPaused)interior.setPaused(true);}
      catch{finishInside(null);}
    });
  }
  street=runSession(wrappedCtx,wrapModel,draw,wrapView);
  if(noWebGL)flow.state='done';
  function snapshotV24(){return {state:flow.state,inside:flow.inside,done:flow.done,level:ctx.level,building:{index:building.index,door:[...building.door]},doorScreen:flow.doorScreen,...(fireLevels?{doorHit:flow.doorHit}:{}),markerKind:flow.markerKind,doorDistance:streetModel?+doorDistance(streetModel.truck,building).toFixed(2):null,plan:{rooms:plan.rooms.map(r=>r.room),tools:[...plan.tools],tutorial:Boolean(plan.tutorial),...(fireLevels?{floorCount:plan.floorCount}:{})},result:flow.result,interior:interior?interior.snapshot:null,enterButton:!enterButton.hidden};}
  const cleanup=()=>{if(disposed)return;disposed=true;events.abort();enterButton.remove();link.remove();};
  return new Proxy(street,{get(target,key){
    if(key==='setPaused')return v=>{shellPaused=Boolean(v);if(flow.inside)interior?.setPaused(shellPaused);else target.setPaused(shellPaused);};
    if(key==='dispose')return ()=>{interior?.dispose();interior=null;cleanup();target.dispose();};
    if(key==='snapshot')return {...target.snapshot,v24:snapshotV24()};
    if(key==='debug'){const d=target.debug;return d?{...d,flow,get interior(){return interior;}}:undefined;}
    if(key==='v24')return flow;
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
