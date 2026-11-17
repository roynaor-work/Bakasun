/** Input is released on every lifecycle boundary; pointer IDs are independent. */
export function createRacingControls({root,canvas,t,wheelMode,automatic:automaticOption}){
 const abort=new AbortController(),options={signal:abort.signal},keys=new Set(),held=new Set(),pointers=new Map(),doc=canvas.ownerDocument;let enabled=true,steer=0;
 // racing-sound-start: the race starts with ordinary (manual) throttle; automatic acceleration is a choice, kept in localStorage 'island.racing.auto'.
 // ?racingAuto=1 restores the previous default (automatic) for everyone; an explicit `automatic` option wins (tests).
 const prefs=(()=>{try{return doc.defaultView?.localStorage||null;}catch{return null;}})(),search=(()=>{try{return new URLSearchParams(doc.defaultView?.location?.search||'');}catch{return new URLSearchParams('');}})();
 let automatic=automaticOption!==undefined?!!automaticOption:search.get('racingAuto')==='1'?true:(()=>{try{return prefs?.getItem('island.racing.auto')==='1';}catch{return false;}})();
 // ?racingWheel=0 (or wheelMode:false) restores the old slider; default is the real, floating wheel on the whole left half.
 const query=(()=>{try{return new URLSearchParams(doc.defaultView?.location?.search||'').get('racingWheel');}catch{return null;}})();
 const wheelV1=wheelMode!==undefined?!!wheelMode:query!=='0';
 const node=(tag,cls,text='')=>{const n=doc.createElement(tag);n.className=cls||'';n.textContent=text;return n;};
 const icon=path=>{const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 32 32');s.innerHTML=`<path d="${path}"/>`;s.setAttribute('aria-hidden','true');return s;};
 root.classList.add('racing-controls');root.dataset.racingAutomatic=String(automatic);
 const steering=node('div','racing-steering'),wheel=node('div','racing-wheel');wheel.setAttribute('aria-hidden','true');
 // v1: a real steering wheel (rim, three spokes, hub, yellow 12 o'clock mark) that turns with the steering angle.
 if(wheelV1){const s=doc.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 100 100');s.setAttribute('aria-hidden','true');
  s.innerHTML='<circle cx="50" cy="50" r="41" class="rim-shadow"/><circle cx="50" cy="50" r="41" class="rim"/><circle cx="50" cy="50" r="41" class="rim-hi"/><path class="spokes" d="M12 54h25M88 54H63M50 63v27"/><circle cx="50" cy="52" r="15" class="hub"/><path class="mark" d="M44 11h12v10H44z"/>';
  wheel.append(s);steering.dataset.wheel='v1';}
 else wheel.append(icon('M3 21a13 13 0 0 1 26 0M7 21a9 9 0 0 1 18 0M16 8v5m-9 1 3 3m15-3-3 3M13 25h6'));
 const slider=node('input','racing-steer');slider.type='range';slider.min='-1';slider.max='1';slider.step='.01';slider.value='0';slider.setAttribute('aria-label',t('racing.steer'));slider.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight A D');slider.setAttribute('aria-valuetext','מרכז');
 steering.append(wheel,slider,node('span','racing-steering-label',t('racing.steer')));root.append(steering);
 // The pad is the whole left half of the screen: a touch anywhere puts the wheel under the thumb at once.
 const pad=wheelV1?node('div','racing-pad'):null;if(pad){pad.dataset.racingPad='true';root.insertBefore?.(pad,steering)||root.append(pad);}
 let padPointer=null,padOrigin=null;
 const WHEEL_MAX=95,STEER_DEAD=.04,STEER_EXPO=1.2;
 const shapeSteer=raw=>{const a=Math.abs(raw);if(a<=STEER_DEAD)return 0;const u=Math.min(1,(a-STEER_DEAD)/(1-STEER_DEAD));return Math.sign(raw)*Math.pow(u,STEER_EXPO);};
 const padRect=()=>pad.getBoundingClientRect?.()||{left:0,top:0,width:0,height:0};
 // Travel for full lock: a short, comfortable thumb stroke that scales with the pad (never under 44px, never over 70px).
 const travel=r=>Math.max(44,Math.min(70,(r.width||300)*.14));
 function placeWheel(x,y){wheel.style.setProperty('--wx',Math.round(x)+'px');wheel.style.setProperty('--wy',Math.round(y)+'px');}
 function setSteer(v){steer=Math.max(-1,Math.min(1,v));slider.value=String(steer);wheel.style.setProperty('--turn',`${steer*WHEEL_MAX}deg`);slider.setAttribute('aria-valuetext',Math.round(Math.abs(steer)*100)+'% '+(steer<0?'שמאלה':'ימינה'));}
 if(pad){
  pad.addEventListener('pointerdown',e=>{if(!enabled||padPointer!==null)return;e.preventDefault();pad.setPointerCapture?.(e.pointerId);padPointer=e.pointerId;
   const r=padRect(),x=e.clientX-r.left,y=e.clientY-r.top;padOrigin={x:e.clientX,r};
   // The wheel stays fully inside the pad; steering origin is the real touch point so the thumb never "starts turned".
   const half=wheel.offsetWidth?wheel.offsetWidth/2:60;placeWheel(Math.max(half,Math.min((r.width||2*half)-half,x)),Math.max(half,Math.min((r.height||2*half)-half,y)));
   steering.classList.add('active','floating');setSteer(0);},options);
  pad.addEventListener('pointermove',e=>{if(!enabled||e.pointerId!==padPointer)return;setSteer(shapeSteer((e.clientX-padOrigin.x)/travel(padOrigin.r)));},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,e=>{if(e.pointerId!==padPointer)return;padPointer=null;padOrigin=null;resetSteer();},options);
 }
 const actions=node('div','racing-actions'),buttons={};
 for(const [id,path]of [['drift','M5 24c-4-7 5-5 1-12m8 13c-4-7 5-5 1-12m7 12h7M20 5h7v13h-7Z'],['nitro','m18 2-12 17h9l-2 11L27 12H17Z'],['accelerate','m8 22 8-13 8 13M8 15l8-13 8 13']]){
  const b=node('button','racing-action racing-'+id);b.type='button';b.dataset.gameControl=id;b.setAttribute('aria-label',t('racing.'+id));b.setAttribute('aria-keyshortcuts',id==='drift'?'Space':id==='nitro'?'Shift':'ArrowUp W');b.append(icon(path),node('span','racing-action-copy',t('racing.'+id)));buttons[id]=b;actions.append(b);pointers.set(id,new Set());
  b.addEventListener('pointerdown',e=>{if(!enabled)return;e.preventDefault();b.setPointerCapture?.(e.pointerId);pointers.get(id).add(e.pointerId);held.add(id);b.classList.add('held');},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{pointers.get(id).delete(e.pointerId);if(!pointers.get(id).size){held.delete(id);b.classList.remove('held');}},options);
 }
 buttons.accelerate.hidden=automatic;root.append(actions);
 const auto=node('button','racing-auto');auto.type='button';auto.dataset.action='racing-auto';auto.setAttribute('aria-label',t('racing.auto'));auto.setAttribute('aria-pressed',String(automatic));auto.textContent=t('racing.auto');root.append(auto);
 auto.addEventListener('click',()=>{if(!enabled)return;automatic=!automatic;try{prefs?.setItem('island.racing.auto',automatic?'1':'0');}catch{}auto.setAttribute('aria-pressed',String(automatic));root.dataset.racingAutomatic=String(automatic);buttons.accelerate.hidden=automatic;held.delete('accelerate');pointers.get('accelerate').clear();buttons.accelerate.classList.remove('held');},options);
 const resetSteer=()=>{steer=0;slider.value='0';wheel.style.setProperty('--turn','0deg');steering.classList.remove('active','floating');wheel.style.removeProperty?.('--wx');wheel.style.removeProperty?.('--wy');padPointer=null;padOrigin=null;slider.setAttribute('aria-valuetext','מרכז');};
 slider.addEventListener('pointerdown',()=>{if(enabled)steering.classList.add('active');},options);
 slider.addEventListener('input',()=>{if(!enabled)return;steer=Math.max(-1,Math.min(1,Number(slider.value)||0));wheel.style.setProperty('--turn',`${steer*(wheelV1?WHEEL_MAX:38)}deg`);slider.setAttribute('aria-valuetext',Math.round(Math.abs(steer)*100)+'% '+(steer<0?'שמאלה':'ימינה'));},options);
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])slider.addEventListener(event,resetSteer,options);
 const relevant=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space','ShiftLeft','ShiftRight']);
 const win=doc.defaultView;
 win.addEventListener('keydown',e=>{if(!enabled||!relevant.has(e.code)||e.target?.closest?.('input:not(.racing-steer),textarea,select'))return;e.preventDefault();keys.add(e.code);},options);
 win.addEventListener('keyup',e=>{keys.delete(e.code);},options);
 function cancel(){keys.clear();held.clear();for(const group of pointers.values())group.clear();resetSteer();for(const b of Object.values(buttons))b.classList.remove('held');}
 win.addEventListener('blur',cancel,options);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},options);
 return {sample(){
  const direction=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),rawSteer=direction||steer;
  const drift=held.has('drift')||keys.has('Space'),brake=keys.has('ArrowDown')||keys.has('KeyS');
  // Holding turbo also holds gas, including at rest and after the energy runs out.
  // Keep this player-input mapping here so AI throttle decisions stay independent.
  const nitro=held.has('nitro')||keys.has('ShiftLeft')||keys.has('ShiftRight');
  // The chase camera follows +Z from behind. Its screen-right points toward -X,
  // so driver-right input needs negative world yaw; UI labels/arc stay clockwise.
  return {steer:enabled&&rawSteer?-rawSteer:0,throttle:enabled&&(nitro||held.has('accelerate')||keys.has('ArrowUp')||keys.has('KeyW'))?1:0,autoAccelerate:automatic,brake:enabled&&(brake||drift),drift:enabled&&drift,nitro:enabled&&nitro};
 },cancel,setEnabled(value){enabled=!!value;slider.disabled=auto.disabled=!enabled;for(const b of Object.values(buttons))b.disabled=!enabled;cancel();},dispose(){enabled=false;cancel();abort.abort();},get enabled(){return enabled;}};
}
