import {navalWaterAt} from './naval-camera.mjs?v=naval-art-20261022-2';
import {navalWeaponIcons} from './naval-icons.mjs?v=naval-art-20261022-2';
/** A press locks immediately. Release carries the last rendered reticle point. */
export function createNavalInput(ctx,getModel,getView){
 navalWeaponIcons(ctx.controls);
 const abort=new AbortController(),options={signal:abort.signal},fire=ctx.controls.querySelector('#shoot'),canvas=ctx.canvas;
 let gesture=null,release=null,queue=[],keyboard=false,keyboardClick=false;
 const reset=()=>{gesture=release=null;queue=[];keyboard=keyboardClick=false;getModel()?.cancelAim?.();ctx.controls.dataset.aiming='false';};
 const aimNow=()=>getModel()?.beginAim?.();
 const enqueue=()=>{const m=getModel();if(!m.aiming)aimNow();queue.push({x:m.aim.x,z:m.aim.z,target:m.lockedTargetIndex});};
 const begin=(e,sea=false)=>{if(gesture||e.button>0)return;const m=getModel(),point=getView()?.projectTarget(m.aim.x,m.aim.z)||m.screenPoint(m.aim.x,m.aim.z),r=canvas.getBoundingClientRect();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,sea,bearing:m.yaw,point:sea?{x:e.clientX-r.left,y:e.clientY-r.top}:point,camera:m.camera,width:r.width,height:r.height};if(!sea)aimNow();};
 fire.addEventListener('keydown',e=>{if(!e.repeat&&e.code==='Enter'&&e.target===fire)keyboardClick=true;},options);
 fire.addEventListener('click',e=>{const valid=keyboardClick&&e.detail===0&&!['touch','mouse','pen'].includes(e.pointerType);keyboardClick=false;if(valid)enqueue();},options);
 window.addEventListener('pointerdown',()=>{keyboardClick=false;},options);
 fire.addEventListener('pointerdown',e=>begin(e),options);canvas.addEventListener('pointerdown',e=>begin(e,true),options);
 window.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId){gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;}},options);
 window.addEventListener('pointerup',e=>{if(gesture?.id!==e.pointerId)return;gesture.dx=e.clientX-gesture.x;gesture.dy=e.clientY-gesture.y;release=gesture;if(!gesture.sea)enqueue();gesture=null;},options);
 for(const type of ['pointercancel','lostpointercapture'])window.addEventListener(type,e=>{if(gesture?.id===e.pointerId)reset();},options);
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.matches('input,textarea,select')){e.preventDefault();keyboard=true;aimNow();}},options);
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keyboard){enqueue();keyboard=keyboardClick=false;}},options);
 window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
 return {reset,dispose(){reset();abort.abort();},sample(input){
   const m=getModel(),g=gesture||release,c=ctx.balance.controls,held=Boolean(gesture&&!gesture.sea||keyboard),target=queue.shift();
   const out={...input,firing:false,fireRelease:Boolean(target),releaseTarget:target,aimHeld:held,angularAim:false,autoAim:false,assistAim:false,yaw:undefined,targetX:undefined,targetZ:undefined};
   if(g?.sea){const point=navalWaterAt(g.point.x+g.dx,g.point.y+g.dy,g.camera,g.width,g.height,ctx.balance);if(point){out.targetX=point.x;out.targetZ=point.z;}else out.yaw=g.bearing+g.dx*c.dragDegreesPerPixel*Math.PI/180;}
   ctx.controls.dataset.aiming=String(held);ctx.controls.dataset.weapon=String(m.ammoIndex);release=null;return out;
 }};
}
