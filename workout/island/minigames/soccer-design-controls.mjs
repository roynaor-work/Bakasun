const normalize=(x,z)=>{const length=Math.hypot(x,z)||1;return {x:x/length,z:z/length};};
const channels={primary:'kick',secondary:'pass',sprint:'sprint',trick:'switch'};

/** Authoritative restart/keeper ownership wins over the last attack-mode flag. */
export function soccerDesignControlState(state){
  if(state.restart&&state.phase.startsWith('restart')){
    if(state.restart.team!==0)return 'opponent_restart';
    return {throwIn:'throw_in',corner:'corner',goalKick:'goal_kick',freeKick:'free_kick'}[state.restart.type]||'free_kick';
  }
  if(state.role==='keeper')return state.ball.owner===state.controlled?'keeper_ball':'goalkeeper';
  return state.mode==='defense'?'defense':'attack';
}

export function soccerDesignControlPlan(state,contract){
  const key=soccerDesignControlState(state),definition=contract.states[key];
  if(!definition)throw Error(`Missing soccer control state ${key}`);
  // A chosen goalkeeper stays locked to that role in the simulation. The
  // generic rival-restart contract's field-player switch is not available.
  const available=definition.controls.filter(entry=>!(state.role==='keeper'&&key==='opponent_restart'&&entry.id==='switch'));
  const slots=Object.fromEntries(available.map(entry=>[entry.slot,{...entry,...contract.controls[entry.id]}]));
  return {key,label:definition.label,note:definition.note,slots,allowed:available.filter(entry=>!entry.disabled).map(entry=>entry.slot==='stick'?'stick':channels[entry.slot]).filter(Boolean)};
}

/** Resolve physical anchors without applying RTL to movement geometry. */
export function soccerDesignLayout(contract,width,height,rightHanded=true){
  const reference=contract.layouts[height>width?'390x844':'844x390'];
  return Object.fromEntries(Object.entries(reference.slots).map(([name,slot])=>{
    let anchor=slot.anchor_x;if(!rightHanded&&name!=='pause')anchor=anchor==='left'?'right':'left';
    const w=Math.max(48,slot.width),h=Math.max(48,slot.height);
    return [name,{...slot,width:w,height:h,anchor_x:anchor,x:anchor==='left'?slot.offset_x:width-slot.offset_x-w,y:slot.anchor_y==='top'?slot.offset_y:height-slot.offset_y-h}];
  }));
}

export function applySoccerDesignLayout({root,nodes,contract,width,height,rightHanded=true}){
  const layout=soccerDesignLayout(contract,width,height,rightHanded);root.dataset.designControls='true';
  for(const [slot,node]of Object.entries(nodes)){
    if(!node||!layout[slot])continue;const place=layout[slot];node.dataset.designSlot=slot;
    for(const side of ['left','right','top','bottom'])node.style.setProperty(side,'auto','important');
    node.style.setProperty(place.anchor_x,`calc(${place.offset_x}px + env(safe-area-inset-${place.anchor_x}, 0px))`,'important');
    node.style.setProperty(place.anchor_y,`calc(${place.offset_y}px + env(safe-area-inset-${place.anchor_y}, 0px))`,'important');
    node.style.setProperty('width',`${place.width}px`,'important');node.style.setProperty('height',`${place.height}px`,'important');
  }
  return layout;
}

/** Pure recognizer, independent of DOM clocks. Cancellation clears an unfinished
 * charge through onCancel; it never invents a release that could shoot. */
export function createSoccerGestureRecognizer({thresholds,onCancel=()=>{}}){
  let enabled=false,key='',allowed=new Set(),stick=null,movement={x:0,z:0},sprintSince=null,autoSprint=false,switchPulse=false;
  const actions=new Map(),arrows=new Set();
  const reset=()=>{stick=null;movement={x:0,z:0};sprintSince=null;autoSprint=false;switchPulse=false;actions.clear();arrows.clear();onCancel();};
  const setState=(value,available)=>{const next=[...available].sort().join(',');if(value!==key||next!==[...allowed].sort().join(',')){reset();key=value;allowed=new Set(available);}};
  const actionByPointer=id=>[...actions.values()].find(action=>action.pointer===id&&action.held);
  const begin=(action,pointer,x,y,rect,time)=>{
    if(!enabled||!allowed.has(action)||actions.get(action)?.held)return false;
    actions.set(action,{action,pointer,x,y,dx:0,dy:0,rect,time,held:true,pulse:action!=='switch',transferred:false});return true;
  };
  const cancelAction=()=>reset();
  const moveAction=(action,x,y)=>{
    const outside=Math.max(action.rect.left-x,x-action.rect.right,action.rect.top-y,y-action.rect.bottom,0);
    if(outside>thresholds.cancel_outside_action_px){cancelAction(action);return false;}
    action.dx=x-action.x;action.dy=y-action.y;return true;
  };
  const updateStick=(x,y,time,zones=[])=>{
    if(!stick)return;
    if(stick.mode==='action'){const action=actionByPointer(stick.pointer);if(action)moveAction(action,x,y);return;}
    const dx=x-(stick.rect.left+stick.rect.width/2),dz=y-(stick.rect.top+stick.rect.height/2),radius=Math.min(stick.rect.width,stick.rect.height)/2,length=Math.hypot(dx,dz),factor=length>radius?radius/length:1;
    movement=length/radius<thresholds.stick_dead_zone?{x:0,z:0}:{x:dx*factor/radius,z:dz*factor/radius};
    const magnitude=Math.hypot(movement.x,movement.z);
    if(magnitude>=thresholds.one_finger_sprint_on){if(sprintSince===null)sprintSince=time;}
    else if(!autoSprint||magnitude<thresholds.one_finger_sprint_off){sprintSince=null;if(magnitude<thresholds.one_finger_sprint_off)autoSprint=false;}
    const hit=zones.find(zone=>allowed.has(zone.action)&&x>=zone.rect.left&&x<=zone.rect.right&&y>=zone.rect.top&&y<=zone.rect.bottom);
    if(!hit){stick.candidate=null;return;}
    if(stick.candidate?.action!==hit.action)stick.candidate={...hit,since:time,x,y};
    else {stick.candidate.x=x;stick.candidate.y=y;}
  };
  function transfer(time){
    const candidate=stick?.candidate;if(!candidate||time-candidate.since<120)return;
    const aim=normalize(movement.x,movement.z);
    if(begin(candidate.action,stick.pointer,candidate.x,candidate.y,candidate.rect,time)){
      const action=actions.get(candidate.action);action.transferred=true;action.transferAim=aim;stick.mode='action';movement={x:0,z:0};autoSprint=false;sprintSince=null;
    }
  }
  return {
    reset,setState,setEnabled(value){if(enabled!==Boolean(value)){reset();enabled=Boolean(value);}},
    begin,
    beginStick(pointer,x,y,rect,time){if(!enabled||!allowed.has('stick')||stick)return false;stick={pointer,rect,mode:'move',candidate:null};updateStick(x,y,time);return true;},
    move(pointer,x,y,time,zones){if(stick?.pointer===pointer){updateStick(x,y,time,zones);transfer(time);return;}const action=actionByPointer(pointer);if(action)moveAction(action,x,y);},
    end(pointer,x,y,time){
      if(stick?.pointer===pointer){if(stick.mode==='move')updateStick(x,y,time);else{const action=actionByPointer(pointer);if(action){moveAction(action,x,y);if(actions.has(action.action)){action.held=false;if(action.action==='switch')switchPulse=true;}}}stick=null;movement={x:0,z:0};sprintSince=null;autoSprint=false;return;}
      const action=actionByPointer(pointer);if(!action)return;moveAction(action,x,y);if(!actions.has(action.action))return;action.held=false;if(action.action==='switch')switchPulse=true;
    },
    cancelPointer(pointer){if(stick?.pointer===pointer||actionByPointer(pointer))reset();},
    arrow(code,down){if(!enabled)return;if(down)arrows.add(code);else arrows.delete(code);},
    sample(direction=1,time=0,automatic={}){
      transfer(time);
      if(sprintSince!==null&&time-sprintSince>=thresholds.one_finger_sprint_hold_ms)autoSprint=true;
      const mx=arrows.has('ArrowRight')?1:arrows.has('ArrowLeft')?-1:movement.x,mz=arrows.has('ArrowDown')?1:arrows.has('ArrowUp')?-1:movement.z;
      const input={moveX:mx*direction,moveZ:mz*direction,kickHeld:false,passHeld:false,sprintHeld:autoSprint&&allowed.has('sprint'),switchPlayer:switchPulse};switchPulse=false;
      for(const name of ['kick','pass','sprint']){
        const action=actions.get(name);if(!action)continue;
        input[`${name}Held`]=Boolean(action.held||action.pulse)||input[`${name}Held`];action.pulse=false;
      }
      for(const name of ['kick','pass']){
        const action=actions.get(name),length=Math.hypot(action?.dx||0,action?.dy||0),manual=length>=thresholds.swipe_min_distance_px;
        const aim=manual?normalize(action.dx,action.dy):action?.transferAim;
        input[`${name}Aim`]=aim?{x:aim.x*direction,z:aim.z*direction,manual:true,height:Math.max(0,Math.min(1,-(action?.dy||0)/120))}:{...normalize(automatic[name]?.x??direction,automatic[name]?.z??0),manual:false,height:0};
      }
      return input;
    },
    get snapshot(){return {state:key,enabled,movement:{...movement},autoSprint,held:Object.fromEntries([...actions].map(([name,a])=>[name,a.held])),aim:Object.fromEntries([...actions].filter(([name])=>name!=='sprint').map(([name,a])=>[name,{dx:a.dx,dy:a.dy}])),stickMode:stick?.mode||null};},
  };
}

/** Soccer owns this recognizer; other games keep the shared controls module. */
export function createSoccerDesignInput({root,nodes,config,interaction,onGesture=()=>{},onCancel=()=>{},autoAim,now=()=>performance.now()}){
  const abort=new AbortController(),options={signal:abort.signal},recognizer=createSoccerGestureRecognizer({thresholds:interaction.gesture_thresholds,onCancel}),captures=new Map(),keys=new Map(),suppressed=new WeakMap();
  const window=root.ownerDocument.defaultView,document=root.ownerDocument,stick=root.querySelector('#joystick'),knob=root.querySelector('#knob');
  let allowed=new Set(),enabled=false,viewportWidth=window.innerWidth,viewportHeight=window.innerHeight;
  const point=event=>[event.clientX??0,event.clientY??0];
  const capture=(node,id)=>{try{node.setPointerCapture(id);captures.set(id,node);}catch{}};
  const release=id=>{const node=captures.get(id);captures.delete(id);try{if(node?.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}};
  function reset(){recognizer.reset();keys.clear();for(const id of [...captures.keys()])release(id);for(const node of Object.values(nodes))node?.classList?.remove('held');if(knob)knob.style.transform='translate(0px,0px)';}
  const zones=()=>Object.entries(channels).filter(([slot,name])=>allowed.has(name)&&nodes[slot]&&!nodes[slot].hidden&&!nodes[slot].disabled).map(([slot,action])=>({action,rect:nodes[slot].getBoundingClientRect()}));
  const zone=nodes.stick;
  zone.addEventListener('pointerdown',event=>{if(recognizer.beginStick(event.pointerId,...point(event),stick.getBoundingClientRect(),now())){event.preventDefault();onGesture();capture(zone,event.pointerId);}},options);
  zone.addEventListener('pointermove',event=>{recognizer.move(event.pointerId,...point(event),now(),zones());},options);
  zone.addEventListener('pointerup',event=>{recognizer.end(event.pointerId,...point(event),now());release(event.pointerId);},options);
  for(const [slot,channel]of Object.entries(channels)){
    const node=nodes[slot];if(!node)continue;
    node.addEventListener('pointerdown',event=>{if(!node.disabled&&!node.hidden&&recognizer.begin(channel,event.pointerId,...point(event),node.getBoundingClientRect(),now())){event.preventDefault();onGesture();suppressed.set(node,now()+600);capture(node,event.pointerId);}},options);
    node.addEventListener('pointermove',event=>{recognizer.move(event.pointerId,...point(event),now());},options);
    node.addEventListener('pointerup',event=>{recognizer.end(event.pointerId,...point(event),now());release(event.pointerId);},options);
    node.addEventListener('click',event=>{if(event.detail!==0||event.pointerType||!enabled||node.hidden||node.disabled||now()<(suppressed.get(node)||0))return;const rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,id=`assistive:${channel}`;if(recognizer.begin(channel,id,x,y,rect,now())){onGesture();recognizer.end(id,x,y,now());}},options);
    node.addEventListener('blur',()=>{if([...keys.values()].some(key=>key.node===node))reset();},options);
  }
  for(const node of [zone,...Object.keys(channels).map(slot=>nodes[slot])].filter(Boolean))for(const type of ['pointercancel','lostpointercapture'])node.addEventListener(type,event=>{recognizer.cancelPointer(event.pointerId);release(event.pointerId);},options);
  function keyboardAction(event){
    if(event.target?.matches?.('input,select,textarea,[contenteditable=true]'))return null;
    if(event.target?.matches?.('button')){
      const slot=Object.keys(channels).find(slot=>nodes[slot]===event.target);
      if(!slot)return null;
      if(['Space','Enter'].includes(event.code))return channels[slot];
    }
    if(event.code===config.kickKey)return 'kick';if(event.code===config.passKey)return 'pass';if(config.sprintKeys.includes(event.code))return 'sprint';if(event.code===config.switchKey)return 'switch';return null;
  }
  window.addEventListener('keydown',event=>{
    if(!enabled||event.repeat)return;
    if(event.target?.matches?.('button')&&!Object.keys(channels).some(slot=>nodes[slot]===event.target))return;
    if(event.code.startsWith('Arrow')){if(event.target?.matches?.('input,select,textarea,[contenteditable=true]'))return;event.preventDefault();recognizer.arrow(event.code,true);onGesture();return;}
    const action=keyboardAction(event);if(!action||!allowed.has(action)||keys.has(event.code))return;
    const node=nodes[Object.keys(channels).find(slot=>channels[slot]===action)],rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,id=`key:${event.code}`;
    if(recognizer.begin(action,id,x,y,rect,now())){event.preventDefault();keys.set(event.code,{id,x,y,node});suppressed.set(node,now()+600);onGesture();}
  },options);
  window.addEventListener('keyup',event=>{if(event.code.startsWith('Arrow'))recognizer.arrow(event.code,false);const key=keys.get(event.code);if(key){event.preventDefault();recognizer.end(key.id,key.x,key.y,now());suppressed.set(key.node,now()+600);keys.delete(event.code);}},options);
  window.addEventListener('blur',reset,options);document.addEventListener('visibilitychange',reset,options);
  for(const type of ['resize','orientationchange'])window.addEventListener(type,reset,options);
  for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,event=>event.preventDefault(),options);
  return {
    setPlan(plan){const signature=plan.key+':'+plan.allowed.join(',');if(root.dataset.designState!==signature){reset();root.dataset.designState=signature;}allowed=new Set(plan.allowed);recognizer.setState(signature,plan.allowed);},
    setEnabled(value){if(enabled!==Boolean(value)){reset();enabled=Boolean(value);recognizer.setEnabled(enabled);}},reset,
    setHanded(value){root.classList.toggle('left-handed',!value);reset();},
    sample(direction=1){
      // Resize notifications can trail a keyboard/touch release in Chromium.
      // Cancel before feeding that release into the model, even in that order.
      if(viewportWidth!==window.innerWidth||viewportHeight!==window.innerHeight){viewportWidth=window.innerWidth;viewportHeight=window.innerHeight;reset();}
      const sample=recognizer.sample(direction,now(),{kick:autoAim?.('kick'),pass:autoAim?.('pass')}),snapshot=recognizer.snapshot;
      for(const [slot,name]of Object.entries(channels))nodes[slot]?.classList.toggle('held',Boolean(snapshot.held[name])||(name==='sprint'&&snapshot.autoSprint));
      if(knob){const rect=stick.getBoundingClientRect(),radius=Math.max(0,Math.min(rect.width,rect.height)/2-16);knob.style.transform=`translate(${snapshot.movement.x*radius}px,${snapshot.movement.z*radius}px)`;}
      return sample;},
    get snapshot(){return recognizer.snapshot;},
    dispose(){enabled=false;reset();abort.abort();},
  };
}
