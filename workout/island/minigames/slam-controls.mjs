/** Street Slam input: multi-touch joystick (left), primary and secondary
 * buttons (right), keyboard (WASD/arrows, Space, E). Every touch is locked to
 * its pointerId. Edges are queued and handed to the engine one per fixed step,
 * so 30/60/120 Hz rendering delivers the same commands. */
export function createSlamControls({root,doc=root.ownerDocument,icons,labels,basis}){
 const win=doc.defaultView,abort=new AbortController(),on={signal:abort.signal};
 const edges=[],keys=new Set();let enabled=true,stick={x:0,y:0},stickPointer=null,primaryPointer=null,secondaryPointer=null,primaryKey=false;
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};

 const zone=node('div','slam-stick-zone'),ring=node('div','slam-stick'),knob=node('span','slam-knob');
 ring.append(knob);zone.append(ring);zone.setAttribute('role','application');zone.setAttribute('aria-label',labels.stick);
 const actions=node('div','slam-actions');
 const secondary=node('button','slam-action slam-secondary'),primary=node('button','slam-action slam-primary');
 for(const [b,key] of [[secondary,'secondary'],[primary,'primary']]){b.type='button';b.dataset.gameControl=key;b.dataset.slamControl=key;}
 actions.append(secondary,primary);root.append(zone,actions);

 function setStick(clientX,clientY){
  const r=ring.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width/2;
  let dx=(clientX-cx)/max,dy=(clientY-cy)/max;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}
  const dead=.12,mm=Math.hypot(dx,dy);stick=mm<dead?{x:0,y:0}:{x:dx,y:-dy};
  knob.style.transform=`translate(${dx*max*.55}px,${dy*max*.55}px)`;
 }
 function releaseStick(){stickPointer=null;stick={x:0,y:0};knob.style.transform='';zone.classList.remove('active');}
 zone.addEventListener('pointerdown',e=>{if(!enabled||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;zone.setPointerCapture?.(e.pointerId);zone.classList.add('active');setStick(e.clientX,e.clientY);},on);
 zone.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)setStick(e.clientX,e.clientY);},on);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])zone.addEventListener(type,e=>{if(e.pointerId===stickPointer)releaseStick();},on);

 function press(which){edges.push({type:which});}
 primary.addEventListener('pointerdown',e=>{if(!enabled||primaryPointer!==null)return;e.preventDefault();primaryPointer=e.pointerId;primary.setPointerCapture?.(e.pointerId);primary.classList.add('held');press('primaryPressed');},on);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])primary.addEventListener(type,e=>{if(e.pointerId!==primaryPointer)return;primaryPointer=null;primary.classList.remove('held');press('primaryReleased');},on);
 secondary.addEventListener('pointerdown',e=>{if(!enabled||secondaryPointer!==null)return;e.preventDefault();secondaryPointer=e.pointerId;secondary.setPointerCapture?.(e.pointerId);secondary.classList.add('held');press('secondaryPressed');},on);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])secondary.addEventListener(type,e=>{if(e.pointerId!==secondaryPointer)return;secondaryPointer=null;secondary.classList.remove('held');},on);
 // Keyboard or assistive activation of a focused button arrives as a click
 // with detail 0 and no pointer events; pointer clicks are ignored here.
 primary.addEventListener('click',e=>{if(e.detail!==0||!enabled)return;press('primaryPressed');press('primaryReleased');},on);
 secondary.addEventListener('click',e=>{if(e.detail!==0||!enabled)return;press('secondaryPressed');},on);
 for(const b of [primary,secondary,zone])for(const type of ['contextmenu','selectstart','dragstart'])b.addEventListener(type,e=>e.preventDefault(),on);

 const MOVE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 win.addEventListener('keydown',e=>{
  if(!enabled||e.target?.closest?.('input,textarea,select'))return;
  if(MOVE.has(e.code)){e.preventDefault();keys.add(e.code);return;}
  if(e.code==='Space'){e.preventDefault();if(!e.repeat&&!primaryKey){primaryKey=true;press('primaryPressed');}return;}
  if(e.code==='KeyE'||e.code==='KeyQ'){e.preventDefault();if(!e.repeat)press('secondaryPressed');}
 },{...on,capture:true});
 win.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&primaryKey){e.preventDefault();primaryKey=false;press('primaryReleased');}},{...on,capture:true});

 function keyStick(){const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),m=Math.hypot(x,y);return m?{x:x/m,y:y/m}:null;}

 /** Release everything held; a pending press gets its matching release so no
  * charge is left open across a pause, tab switch or lost pointer. */
 function cancel(){
  const wasPrimary=primaryPointer!==null||primaryKey;
  releaseStick();keys.clear();primaryPointer=secondaryPointer=null;primaryKey=false;primary.classList.remove('held');secondary.classList.remove('held');
  edges.length=0;if(wasPrimary)edges.push({type:'primaryReleased'});
 }
 win.addEventListener('blur',cancel,on);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},on);

 let lastLabels={};
 return {
  /** One InputFrame per engine step: current stick, at most one queued edge. */
  consume(){
   const s=keyStick()||stick,b=basis();
   const frame={move:{x:s.x*b.rx+s.y*b.ux,z:s.x*b.rz+s.y*b.uz},primaryPressed:false,primaryReleased:false,secondaryPressed:false};
   if(!enabled){frame.move={x:0,z:0};return frame;}
   const e=edges.shift();if(e)frame[e.type]=true;
   // A press and its release never share a step: the engine sees a 1-step tap.
   return frame;
  },
  setActions(actions,{dunkReady=false}={}){
   const key=actions.primary+actions.secondary+dunkReady;if(lastLabels.key===key)return;lastLabels={key};
   const p=dunkReady?'dunk':actions.primary;primary.replaceChildren(icons(p));primary.dataset.action=p;primary.setAttribute('aria-label',labels[p]);primary.title=labels[p];
   secondary.replaceChildren(icons(actions.secondary));secondary.dataset.action=actions.secondary;secondary.setAttribute('aria-label',labels[actions.secondary]);secondary.title=labels[actions.secondary];
   primary.classList.toggle('dunk-ready',dunkReady);
  },
  setEnabled(v){enabled=!!v;primary.disabled=secondary.disabled=!enabled;if(!enabled)cancel();},
  cancel,
  get held(){return {primary:primaryPointer!==null||primaryKey,secondary:secondaryPointer!==null,stick:stickPointer!==null,queued:edges.length};},
  elements:{zone,primary,secondary,knob},
  dispose(){enabled=false;cancel();edges.length=0;abort.abort();},
 };
}
