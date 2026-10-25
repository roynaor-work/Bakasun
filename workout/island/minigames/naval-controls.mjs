import {navalWaterAt} from './naval-camera.mjs?v=island-cityplay-20261025-1';
import {navalWeaponIcons} from './naval-icons.mjs?v=island-cityplay-20261025-1';
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
/** A press locks immediately. Release carries the last rendered reticle point. */
export function createNavalInput(ctx,getModel,getView){
 navalWeaponIcons(ctx.controls);
 const abort=new AbortController(),options={signal:abort.signal},fire=ctx.controls.querySelector('#shoot'),canvas=ctx.canvas;
 let gesture=null,release=null,queue=[],keyboard=false,keyboardClick=false,pendingSelection=null,selected=null;
 const project=(m,x,z,y=0)=>getView()?.projectTarget(x,z,y)||m.screenPoint(x,z,y);
 const choose=(point,preferred)=>{const m=getModel(),r=canvas.getBoundingClientRect();return m&&navalVisibleTarget(m,(x,z,y)=>project(m,x,z,y),r.width,r.height,point,preferred??selected??m.selectedTargetIndex);};
 const reset=()=>{gesture=release=null;queue=[];keyboard=keyboardClick=false;pendingSelection=null;getModel()?.cancelAim?.();ctx.controls.dataset.aiming='false';};
 const aimNow=()=>{const m=getModel(),index=choose();if(index!==null)selected=index;m?.beginAim?.(index??undefined);};
 const enqueue=()=>{const m=getModel();if(!m)return;if(!m.aiming)aimNow();queue.push({x:m.aim.x,z:m.aim.z,target:m.lockedTargetIndex});};
 const begin=(e,sea=false)=>{if(gesture||e.button>0)return;const m=getModel();if(!m||m.result)return;e.preventDefault?.();if(!sea)aimNow();const r=canvas.getBoundingClientRect(),point=sea?{x:e.clientX-r.left,y:e.clientY-r.top}:project(m,m.aim.x,m.aim.z),target=sea?choose(point):null;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,sea,bearing:m.yaw,point,camera:m.camera,width:r.width,height:r.height,target};if(target!==null)selected=pendingSelection=target;};
 fire.addEventListener('keydown',e=>{if(!e.repeat&&e.code==='Enter'&&e.target===fire)keyboardClick=true;},options);
 fire.addEventListener('click',e=>{const valid=keyboardClick&&e.detail===0&&!['touch','mouse','pen'].includes(e.pointerType);keyboardClick=false;if(valid)enqueue();},options);
 window.addEventListener('pointerdown',()=>{keyboardClick=false;},options);
 fire.addEventListener('pointerdown',e=>begin(e),options);canvas.addEventListener('pointerdown',e=>begin(e,true),options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;if(!gesture.sea&&Math.hypot(gesture.dx,gesture.dy)>ctx.balance.controls.aimDragThreshold){const index=choose({x:gesture.point.x+gesture.dx,y:gesture.point.y+gesture.dy});if(index!==null&&index!==selected){selected=pendingSelection=index;getModel()?.beginAim?.(index);}}}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;release=gesture;if(!gesture.sea)enqueue();gesture=null;},options);
 for(const type of ['pointercancel','lostpointercapture'])window.addEventListener(type,e=>{if(gesture?.id===e.pointerId)reset();},options);
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select,[contenteditable=true]')&&(!e.target.matches('button')||e.target===fire)){e.preventDefault();keyboard=true;aimNow();}},options);
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){enqueue();keyboard=keyboardClick=false;}},options);
 window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
 return {reset,dispose(){reset();abort.abort();},sample(input){
   const m=getModel(),g=gesture||release,c=ctx.balance.controls,held=Boolean(gesture&&!gesture.sea||keyboard),target=queue.shift();
   const out={...input,firing:false,fireRelease:Boolean(target),releaseTarget:target,aimHeld:held,angularAim:false,autoAim:false,assistAim:false,yaw:undefined,targetX:undefined,targetZ:undefined,selectTargetIndex:pendingSelection};
   if(g?.sea&&(g.target===null||Math.hypot(g.dx,g.dy)>c.aimDragThreshold)){const point=navalWaterAt(g.point.x+g.dx,g.point.y+g.dy,g.camera,g.width,g.height,ctx.balance);if(point){out.targetX=point.x;out.targetZ=point.z;}}
   pendingSelection=null;
   ctx.controls.dataset.aiming=String(held);ctx.controls.dataset.weapon=String(m.ammoIndex);release=null;return out;
 }};
}
