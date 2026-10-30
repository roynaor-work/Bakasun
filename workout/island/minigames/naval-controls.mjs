import {navalWaterAt} from './naval-camera.mjs?v=island-perf-20261030-1';
import {navalWeaponIcons} from './naval-icons.mjs?v=island-perf-20261030-1';
/** Screen-relative analogue sailing: every direction travels, including a
 * sideways stick. Hull rotation and acceleration are handled by the model. */
export function navalSteeringInput(moveX=0,moveZ=0,cameraHeading=0,deadzone=.12){
 const x=Number.isFinite(moveX)?moveX:0,z=Number.isFinite(moveZ)?moveZ:0,length=Math.hypot(x,z),zone=Math.max(0,Math.min(.95,deadzone));
 return {active:length>zone,throttle:Math.max(0,Math.min(1,(length-zone)/(1-zone))),heading:(Number.isFinite(cameraHeading)?cameraHeading:0)+(length>zone?Math.atan2(x,-z):0)};
}
/** Select on projected hulls, never on an enemy behind the camera. A point
 * means a deliberate tap/drag; otherwise retain selection or use the centre. */
export function navalVisibleTarget(model,project,width,height,point,preferred=model.selectedTargetIndex){
 const candidates=(model.enemies||[]).filter(e=>e.active&&e.hp>0).map(e=>({enemy:e,point:project(e.x,e.z,1.5)})).filter(({point:q})=>q&&q.depth>0&&q.x>=12&&q.x<=width-12&&q.y>=18&&q.y<=height-12);
 if(!point){const selected=candidates.find(({enemy:e})=>e.index===preferred);if(selected)return selected.enemy.index;}
 const center=point||{x:width*.5,y:height*.42};
 candidates.sort((a,b)=>Math.hypot(a.point.x-center.x,a.point.y-center.y)-Math.hypot(b.point.x-center.x,b.point.y-center.y));
 const candidate=candidates[0];return candidate&&(!point||Math.hypot(candidate.point.x-center.x,candidate.point.y-center.y)<=44)?candidate.enemy.index:null;
}
/** Archery-style turret control. Hold (the Fire button or the aim pad) enters
 * aiming; horizontal drag turns the turret, vertical drag sets the distance
 * (reversible, see navalReachAim), release fires exactly once. A short tap is a quick
 * shot. Releasing on the cancel chip, a cancelled pointer, blur or a hidden
 * tab never fires. Movement keeps its own pointer, so two thumbs work. */
export function navalAimFromDrag(start,dx,dy,config){
 const c=config.aimControls||{},b=config.ballistics||{};
 return {yaw:start.yaw+dx*(c.yawPerPixel??.0042),elevation:Math.max(b.minElevation??3,Math.min(b.maxElevation??42,start.elevation-dy*(c.elevationPerPixel??.11)))};
}
/** Aim gain in degrees per CSS pixel, blended by drag speed: slow drags for
 * small steady corrections, fast drags to swing onto the target. The blend
 * is a smoothstep between `slowSpeed` and `fastSpeed`, so there is no step. */
export function navalAimGain(speed,config){
 const g=config.aimControls?.gain||{},lo=g.slowSpeed??80,hi=g.fastSpeed??240,t=Math.max(0,Math.min(1,((speed||0)-lo)/Math.max(1,hi-lo))),s=t*t*(3-2*t);
 return {yaw:(g.yawSlow??.08)+((g.yawFast??.2)-(g.yawSlow??.08))*s,elevation:(g.elevationSlow??.06)+((g.elevationFast??.12)-(g.elevationSlow??.06))*s,blend:s};
}
/** One pointer step of the accumulated aim. `track` keeps the smoothed drag
 * speed between steps; `ms` is the time since the previous step. Every pixel
 * moves the aim: there is no dead zone after the drag has begun, no jitter
 * and no correction toward a target. */
export function navalAimStep(aim,dx,dy,ms,track,config){
 const b=config.ballistics||{},g=config.aimControls?.gain||{},dt=Math.max(1,ms||16)/1000,instant=Math.hypot(dx,dy)/dt;
 track.speed=(track.speed??instant)+(instant-(track.speed??instant))*(1-Math.exp(-dt/(g.smoothSeconds??.05)));
 const k=navalAimGain(track.speed,config),DEG=Math.PI/180;
 return {yaw:aim.yaw+dx*k.yaw*DEG,elevation:Math.max(b.minElevation??3,Math.min(b.maxElevation??42,aim.elevation-dy*k.elevation))};
}
/** 28/10/2026 (Roy): one reversible control for distance instead of a time
 * charge. Vertical drag moves a single reach value: above `lowAngle` it is
 * the barrel elevation at full power; below it the barrel stays at
 * `lowAngle` and power falls toward the minimum, so short shots stay
 * possible. Dragging back always undoes it; holding still changes nothing. */
export function navalReachRange(config){const r=config.aimControls?.reach||{},b=config.ballistics||{},low=r.lowAngle??10;return {low,min:low-(r.powerSpan??14),max:b.maxElevation??42,minPower:b.minPower??.35};}
export function navalReachAim(v,config,ammo=0){
 const R=navalReachRange(config),x=Math.max(R.min,Math.min(R.max,v));
 // A torpedo ignores elevation: its run length follows power alone, so the whole drag maps onto power (28/10 audit).
 if(ammo===2)return {elevation:R.low,power:R.minPower+(1-R.minPower)*(x-R.min)/Math.max(1e-6,R.max-R.min)};
 return x>=R.low?{elevation:x,power:1}:{elevation:R.low,power:R.minPower+(1-R.minPower)*(x-R.min)/Math.max(1e-6,R.low-R.min)};
}
export function navalReachOf(turret,config,ammo=0){
 const R=navalReachRange(config),power=turret?.power??1,elevation=turret?.elevation??R.low;
 if(ammo===2)return R.min+(R.max-R.min)*Math.max(0,Math.min(1,(power-R.minPower)/Math.max(1e-6,1-R.minPower)));
 return power>=.999?Math.max(R.min,Math.min(R.max,elevation)):R.min+(R.low-R.min)*Math.max(0,Math.min(1,(power-R.minPower)/Math.max(1e-6,1-R.minPower)));
}
export function navalChargePower(seconds,config){
 const c=config.aimControls||{},min=config.ballistics?.minPower??.35;
 return min+(1-min)*Math.max(0,Math.min(1,seconds/Math.max(.05,c.chargeSeconds??.9)));
}
export function navalHanded(config,storage=globalThis.localStorage){
 const c=config.aimControls||{};let right=config.controls?.rightHanded!==false;
 try{const saved=storage?.getItem(c.handednessKey);if(saved==='left'||saved==='right')right=saved==='right';}catch{}
 return right;
}
export function createNavalInput(ctx,getModel,getView){
 navalWeaponIcons(ctx.controls);
 const abort=new AbortController(),options={signal:abort.signal},controls=ctx.controls,fire=controls.querySelector('#shoot'),canvas=ctx.canvas,balance=ctx.balance,c=balance.aimControls||{};
 // Headless harnesses provide no DOM factory; the input logic itself still runs.
 const element=tag=>typeof document.createElement==='function'?document.createElement(tag):{tag,hidden:false,dataset:{},style:{setProperty(){},removeProperty(){}},className:'',innerHTML:'',type:'',setAttribute(){},addEventListener(){},setPointerCapture(){},getBoundingClientRect:()=>({left:-1e4,right:-1e4,top:-1e4,bottom:-1e4}),remove(){}};
 const pad=element('div'),cancel=element('button'),gauge=element('div');
 pad.className='naval-aim-zone';pad.setAttribute('aria-hidden','true');
 cancel.type='button';cancel.className='naval-aim-cancel';cancel.hidden=true;cancel.setAttribute('aria-label',ctx.t?.('naval.aim.cancel')||'ביטול כיוון');cancel.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
 gauge.className='naval-aim-gauge';gauge.setAttribute('aria-hidden','true');gauge.innerHTML='<span class="naval-aim-arc"></span><span class="naval-aim-needle"></span>';
 controls.prepend?.(pad);controls.append?.(cancel,gauge);
 let side=1;const applyHand=()=>{const right=navalHanded(balance);side=right?1:-1;controls.dataset.movementSide=right?'left':'right';controls.dataset.actionSide=right?'right':'left';controls.classList?.toggle('left-handed',!right);return right;};applyHand();
 fire?.setAttribute?.('aria-describedby','naval-weapon-hint');
 let gesture=null,keyboard=null,queue=[],pendingSelection=null,keyboardClick=false;
 const project=(m,x,z,y=0)=>getView()?.projectTarget(x,z,y)||m.screenPoint(x,z,y);
 const choose=point=>{const m=getModel(),r=canvas.getBoundingClientRect();return m&&navalVisibleTarget(m,(x,z,y)=>project(m,x,z,y),r.width,r.height,point,m.selectedTargetIndex);};
 const show=held=>{controls.dataset.aiming=String(held);cancel.hidden=!held;};
 const reset=()=>{gesture=keyboard=null;queue=[];pendingSelection=null;keyboardClick=false;getModel()?.cancelAim?.();show(false);controls.style?.removeProperty?.('--naval-power');};
 const reachConfig={...balance,ballistics:{...(balance.ballistics||{}),minElevation:navalReachRange(balance).min}};
 const startState=()=>{const m=getModel(),t=m?.turret||{yaw:0,elevation:14,power:1};return {yaw:t.yaw,elevation:navalReachOf(t,balance,m?.ammoIndex),time:m?.time??0};};
 const startPixels=c.gain?.startPixels??2;
 // The aim moves from the first 2 pixels on, pixel for pixel, with the gain set by drag speed.
 const settle=(g,x,y,t)=>{const px=g.lastX??g.x,py=g.lastY??g.y,ms=Math.max(1,(t??performance.now())-(g.lastT??t??0));g.dx=x-g.x;g.dy=y-g.y;g.moved=Math.max(g.moved,Math.hypot(g.dx,g.dy));
  if(!g.engaged&&g.moved>=startPixels){g.engaged=true;g.aim=navalAimStep(g.aim,g.dx,g.dy,ms,g.track,reachConfig);}
  else if(g.engaged)g.aim=navalAimStep(g.aim,x-px,y-py,ms,g.track,reachConfig);
  g.lastX=x;g.lastY=y;g.lastT=t??performance.now();};
 const moveTo=(g,e)=>{const list=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():null;if(list?.length)for(const p of list)settle(g,p.clientX,p.clientY,p.timeStamp);else settle(g,e.clientX,e.clientY,e.timeStamp);};
 const state=g=>{const m=getModel(),reach=g.aim?.elevation??g.start.elevation,shot=navalReachAim(reach,balance,m?.ammoIndex),held=Math.max(0,(m?.time??0)-g.start.time),R=navalReachRange(balance);return {yaw:g.aim?.yaw??g.start.yaw,elevation:shot.elevation,power:shot.power,reach:(reach-R.min)/(R.max-R.min),held};};
 const overCancel=(x,y)=>{if(cancel.hidden)return false;const r=cancel.getBoundingClientRect();return x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8;};
 const finish=(g,x,y,t)=>{settle(g,x,y,t);const s=state(g);if(overCancel(x,y))queue.push({type:'cancel'});else if(!g.engaged&&s.held<=(c.tapSeconds??.22)&&g.moved<=(c.tapPixels??10))queue.push({type:'quick',target:getModel()?.lockedTargetIndex});else queue.push({type:'fire',...s,target:getModel()?.lockedTargetIndex});};
 const begin=e=>{if(gesture||e.button>0)return;const m=getModel();if(!m||m.result)return;e.preventDefault?.();m.beginAim?.(m.selectedTargetIndex);const start=startState();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,moved:0,start,aim:{yaw:start.yaw,elevation:start.elevation},track:{},engaged:false,lastX:e.clientX,lastY:e.clientY,lastT:e.timeStamp};show(true);};
 fire.addEventListener('pointerdown',begin,options);pad.addEventListener('pointerdown',e=>{try{pad.setPointerCapture(e.pointerId);}catch{}begin(e);},options);
 canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect(),index=choose({x:e.clientX-r.left,y:e.clientY-r.top});if(index!==null)pendingSelection=index;},options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){moveTo(gesture,e);cancel.dataset.hot=String(overCancel(e.clientX,e.clientY));}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;finish(gesture,e.clientX,e.clientY,e.timeStamp);gesture=null;show(false);cancel.dataset.hot='false';},options);
 window.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId){gesture=null;queue.push({type:'cancel'});show(false);}},options);
 cancel.addEventListener('click',e=>{if(e.detail===0&&gesture===null&&keyboard){keyboard=null;queue.push({type:'cancel'});show(false);}},options);
 window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select,[contenteditable=true]')&&(!e.target.matches('button')||e.target===fire)){e.preventDefault();if(!gesture&&!keyboard){getModel()?.beginAim?.(getModel().selectedTargetIndex);const start=startState();keyboard={x:0,y:0,dx:0,dy:0,moved:0,start,aim:{yaw:start.yaw,elevation:start.elevation},track:{}};show(true);}}
  if(keyboard&&['KeyA','KeyD','KeyW','KeyS'].includes(e.code)){e.preventDefault();const step=12,dx=e.code==='KeyA'?-step:e.code==='KeyD'?step:0,dy=e.code==='KeyW'?-step:e.code==='KeyS'?step:0;keyboard.dx+=dx;keyboard.dy+=dy;keyboard.track.speed=0;keyboard.aim=navalAimStep(keyboard.aim,dx,dy,1000,keyboard.track,reachConfig);keyboard.moved=99;}
 },options);
 // Escape while aiming cancels only the aim; it must not also open the pause sheet.
 window.addEventListener('keydown',e=>{if(e.code==='Escape'&&(gesture||keyboard)){e.preventDefault();e.stopImmediatePropagation?.();gesture=keyboard=null;queue.push({type:'cancel'});show(false);}},{signal:abort.signal,capture:true});
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){const s=state(keyboard);queue.push(keyboard.moved?{type:'fire',...s}:{type:'quick'});keyboard=null;show(false);}},options);
 // Keyboard activation of the Fire button: Enter on the button, then its detail-zero click.
 fire.addEventListener('keydown',e=>{if(!e.repeat&&e.code==='Enter'&&e.target===fire)keyboardClick=true;},options);
 fire.addEventListener('click',e=>{const valid=keyboardClick&&e.detail===0&&!['touch','mouse','pen'].includes(e.pointerType);keyboardClick=false;if(valid)queue.push({type:'quick'});},options);
 window.addEventListener('pointerdown',()=>{keyboardClick=false;},options);
 window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
 return {reset,applyHand,dispose(){reset();abort.abort();pad.remove();cancel.remove();gauge.remove();controls.classList?.remove('left-handed');},sample(input){
   const m=getModel(),g=gesture||keyboard,event=queue.shift(),live=g?state(g):null;
   const out={...input,firing:false,fireRelease:event?.type==='fire',quickShot:event?.type==='quick',aimCancel:event?.type==='cancel',releaseTarget:Number.isInteger(event?.target)?{target:event.target}:undefined,releaseCurrent:true,aimHeld:Boolean(g),angularAim:false,autoAim:false,assistAim:false,yaw:undefined,targetX:undefined,targetZ:undefined,selectTargetIndex:pendingSelection};
   const s=event?.type==='fire'?event:live;if(s){out.aimYaw=s.yaw;out.aimElevation=s.elevation;out.aimPower=s.power;}
   out.aimSide=side;pendingSelection=null;
   const b=balance.ballistics||{},power=s?.power??m?.power??1,elev=m?((s?.elevation??m.elevation)-(b.minElevation??3))/((b.maxElevation??42)-(b.minElevation??3)):0;
   controls.style?.setProperty?.('--naval-power',String(g?(s?.reach??power):0));gauge.style.setProperty('--naval-elev',String(Math.max(0,Math.min(1,elev))));gauge.dataset.visible=String(Boolean(g));
   if(m){controls.dataset.weapon=String(m.ammoIndex);fire.setAttribute?.('aria-valuetext',`${Math.round((s?.elevation??m.elevation))}° · ${Math.round(power*100)}%`);}
   return out;
 }};
}
