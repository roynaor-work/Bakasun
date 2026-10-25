import {navalWaterAt} from './naval-camera.mjs?v=island-ready-plots-20261026-1';
import {navalWeaponIcons} from './naval-icons.mjs?v=island-ready-plots-20261026-1';
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
 * aiming; horizontal drag turns the turret, vertical drag raises the barrel,
 * the ring charges power, release fires exactly once. A short tap is a quick
 * shot. Releasing on the cancel chip, a cancelled pointer, blur or a hidden
 * tab never fires. Movement keeps its own pointer, so two thumbs work. */
export function navalAimFromDrag(start,dx,dy,config){
 const c=config.aimControls||{},b=config.ballistics||{};
 return {yaw:start.yaw+dx*(c.yawPerPixel??.0042),elevation:Math.max(b.minElevation??3,Math.min(b.maxElevation??42,start.elevation-dy*(c.elevationPerPixel??.11)))};
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
 const applyHand=()=>{const right=navalHanded(balance);controls.dataset.movementSide=right?'left':'right';controls.dataset.actionSide=right?'right':'left';controls.classList?.toggle('left-handed',!right);return right;};applyHand();
 fire?.setAttribute?.('aria-describedby','naval-weapon-hint');
 let gesture=null,keyboard=null,queue=[],pendingSelection=null,keyboardClick=false;
 const project=(m,x,z,y=0)=>getView()?.projectTarget(x,z,y)||m.screenPoint(x,z,y);
 const choose=point=>{const m=getModel(),r=canvas.getBoundingClientRect();return m&&navalVisibleTarget(m,(x,z,y)=>project(m,x,z,y),r.width,r.height,point,m.selectedTargetIndex);};
 const show=held=>{controls.dataset.aiming=String(held);cancel.hidden=!held;};
 const reset=()=>{gesture=keyboard=null;queue=[];pendingSelection=null;keyboardClick=false;getModel()?.cancelAim?.();show(false);controls.style?.removeProperty?.('--naval-power');};
 const startState=()=>{const m=getModel(),t=m?.turret||{yaw:0,elevation:6,power:1};return {yaw:t.yaw,elevation:t.elevation,time:m?.time??0};};
 const settle=(g,x,y)=>{g.dx=x-g.x;g.dy=y-g.y;g.moved=Math.max(g.moved,Math.hypot(g.dx,g.dy));};
 const state=g=>{const m=getModel(),aim=navalAimFromDrag(g.start,g.dx,g.dy,balance),held=Math.max(0,(m?.time??0)-g.start.time);return {...aim,power:navalChargePower(held*Math.max(1,m?.equipment?.rate||1),balance),held};};
 const overCancel=(x,y)=>{if(cancel.hidden)return false;const r=cancel.getBoundingClientRect();return x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8;};
 const finish=(g,x,y)=>{settle(g,x,y);const s=state(g);if(overCancel(x,y))queue.push({type:'cancel'});else if(s.held<=(c.tapSeconds??.22)&&g.moved<=(c.tapPixels??10))queue.push({type:'quick',target:getModel()?.lockedTargetIndex});else queue.push({type:'fire',...s,target:getModel()?.lockedTargetIndex});};
 const begin=e=>{if(gesture||e.button>0)return;const m=getModel();if(!m||m.result)return;e.preventDefault?.();m.beginAim?.(m.selectedTargetIndex);gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,moved:0,start:startState()};show(true);};
 fire.addEventListener('pointerdown',begin,options);pad.addEventListener('pointerdown',e=>{try{pad.setPointerCapture(e.pointerId);}catch{}begin(e);},options);
 canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect(),index=choose({x:e.clientX-r.left,y:e.clientY-r.top});if(index!==null)pendingSelection=index;},options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){settle(gesture,e.clientX,e.clientY);cancel.dataset.hot=String(overCancel(e.clientX,e.clientY));}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;finish(gesture,e.clientX,e.clientY);gesture=null;show(false);cancel.dataset.hot='false';},options);
 window.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId){gesture=null;queue.push({type:'cancel'});show(false);}},options);
 cancel.addEventListener('click',e=>{if(e.detail===0&&gesture===null&&keyboard){keyboard=null;queue.push({type:'cancel'});show(false);}},options);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&(gesture||keyboard)){e.preventDefault();gesture=keyboard=null;queue.push({type:'cancel'});show(false);return;}
  if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select,[contenteditable=true]')&&(!e.target.matches('button')||e.target===fire)){e.preventDefault();if(!gesture&&!keyboard){getModel()?.beginAim?.(getModel().selectedTargetIndex);keyboard={x:0,y:0,dx:0,dy:0,moved:0,start:startState()};show(true);}}
  if(keyboard&&['KeyA','KeyD','KeyW','KeyS'].includes(e.code)){e.preventDefault();const step=12;if(e.code==='KeyA')keyboard.dx-=step;if(e.code==='KeyD')keyboard.dx+=step;if(e.code==='KeyW')keyboard.dy-=step;if(e.code==='KeyS')keyboard.dy+=step;keyboard.moved=99;}
 },options);
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
   pendingSelection=null;
   const b=balance.ballistics||{},power=s?.power??m?.power??1,elev=m?((s?.elevation??m.elevation)-(b.minElevation??3))/((b.maxElevation??42)-(b.minElevation??3)):0;
   controls.style?.setProperty?.('--naval-power',String(g?power:0));gauge.style.setProperty('--naval-elev',String(Math.max(0,Math.min(1,elev))));gauge.dataset.visible=String(Boolean(g));
   if(m){controls.dataset.weapon=String(m.ammoIndex);fire.setAttribute?.('aria-valuetext',`${Math.round((s?.elevation??m.elevation))}° · ${Math.round(power*100)}%`);}
   return out;
 }};
}
