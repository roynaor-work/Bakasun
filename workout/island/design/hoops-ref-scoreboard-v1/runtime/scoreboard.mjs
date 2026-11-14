/**
 * Independent score/time model and Three.js scene binding.
 * All time values are seconds. tick(dt) takes elapsed simulation time, so the
 * host owns pausing for document visibility, replays and application suspension.
 * No wall-clock timers, DOM, audio, network, or global Three dependency.
 */
const DEFAULTS = Object.freeze({home:72,away:68,gameSeconds:134,shotSeconds:24,period:4,running:false});
const LIMITS = Object.freeze({home:[0,999,true],away:[0,999,true],gameSeconds:[0,5999,false],shotSeconds:[0,99,false],period:[1,9,true]});
const EPSILON=1e-9;

/** Create a deterministic clock. Expiring either clock stops the possession. */
export function createClock(initial={},onEvent=()=>{}) {
  let state={...DEFAULTS,redRemaining:0,lastEvent:null};
  let disposed=false;
  function snapshot(){return {...state};}
  function setState(patch={}){
    if(disposed)return snapshot();
    for(const [key,[min,max,integer]] of Object.entries(LIMITS)){
      const value=patch[key];
      if(typeof value!=='number'||!Number.isFinite(value))continue;
      state[key]=Math.min(max,Math.max(min,integer?Math.round(value):value));
    }
    if(typeof patch.running==='boolean')state.running=patch.running;
    if(state.gameSeconds<=0||state.shotSeconds<=0)state.running=false;
    return snapshot();
  }
  function start(){
    if(!disposed&&state.gameSeconds>0&&state.shotSeconds>0)state.running=true;
    return snapshot();
  }
  function pause(){state.running=false;return snapshot();}
  function flashRed(seconds=2){
    if(!disposed&&Number.isFinite(seconds)&&seconds>=0)state.redRemaining=Math.min(seconds,60);
    return snapshot();
  }
  function tick(dt){
    if(disposed||typeof dt!=='number'||!Number.isFinite(dt)||dt<0)return snapshot();
    state.redRemaining=Math.max(0,state.redRemaining-dt);
    if(!state.running||dt===0)return snapshot();
    const deadline=Math.min(state.gameSeconds,state.shotSeconds);
    const elapsed=Math.min(dt,deadline);
    const gameExpired=state.gameSeconds<=state.shotSeconds;
    state.gameSeconds=Math.max(0,state.gameSeconds-elapsed);
    state.shotSeconds=Math.max(0,state.shotSeconds-elapsed);
    if(dt+EPSILON>=deadline){
      state.running=false;
      if(gameExpired)state.gameSeconds=0;else state.shotSeconds=0;
      state.lastEvent=gameExpired?'game-clock-expired':'shot-clock-expired';
      state.redRemaining=Math.max(0,2-Math.max(0,dt-deadline));
      onEvent({type:state.lastEvent,...snapshot()});
    }
    return snapshot();
  }
  function resetShot(seconds=24){
    if(disposed)return snapshot();
    setState({shotSeconds:seconds});
    state.redRemaining=0;state.lastEvent=null;
    return snapshot();
  }
  function resetGame(seconds=600){
    if(disposed)return snapshot();
    setState({gameSeconds:seconds,running:false});
    state.redRemaining=0;state.lastEvent=null;
    return snapshot();
  }
  function dispose(){state.running=false;disposed=true;}
  setState(initial);
  return {setState,tick,start,pause,resetShot,resetGame,flashRed,snapshot,dispose};
}

/** Displayed countdown uses ceil so a positive fraction still reads one second. */
export function formatScoreboard(state){
  const seconds=Math.ceil(Math.max(0,state.gameSeconds)-EPSILON);
  const mm=String(Math.floor(seconds/60)).padStart(2,'0');
  const ss=String(seconds%60).padStart(2,'0');
  const home=String(state.home).padStart(3,'0');
  const away=String(state.away).padStart(3,'0');
  const game=mm+ss;
  const shot=String(Math.ceil(Math.max(0,state.shotSeconds)-EPSILON)).padStart(2,'0');
  const digits={period0:state.period};
  for(const [field,text] of Object.entries({home,away,game,shot}))for(let i=0;i<text.length;i++)digits[field+i]=Number(text[i]);
  return {home,away,game:`${mm}:${ss}`,shot,period:state.period,digits};
}

/**
 * Bind the decoded models/scoreboard.glb scene. Every numeric glyph is a quad
 * using a 1/16-wide cell in one shared, embedded 1024x512 atlas. Only UVs change.
 * Pass the same THREE instance used by GLTFLoader. Returns the clock API plus
 * sync(), display(), and the number of bound digit quads.
 */
export function createScoreboard({THREE,root,initial={},onEvent=()=>{}}={}){
  if(!THREE||!root?.traverse)throw new TypeError('createScoreboard requires THREE and a loaded scoreboard scene');
  const digits=[];const lamps=[];const originalMaterials=new Map();
  root.traverse(node=>{
    if(!node.isMesh)return;
    const match=/^digit_(front|right|back|left)_((?:home|away|game|shot|period)\d)$/.exec(node.name);
    if(match){
      const original=node.geometry;
      node.geometry=original.clone();
      digits.push({node,field:match[2],original,last:-1});
    }
    if(node.userData?.scoreboardLamp||node.name.startsWith('lamp_')){
      const original=node.material;
      if(!originalMaterials.has(original)){
        const lamp=original.clone();
        // Keep an expiry lamp red under the host's filmic tone mapper.
        lamp.toneMapped=false;
        originalMaterials.set(original,lamp);
      }
      node.material=originalMaterials.get(original);
      lamps.push({node,original});
    }
  });
  if(digits.length!==52){
    for(const {node,original} of digits){node.geometry.dispose();node.geometry=original;}
    for(const {node,original} of lamps)node.material=original;
    for(const material of originalMaterials.values())material.dispose();
    throw new Error(`Scoreboard asset contract requires 52 digit quads; found ${digits.length}`);
  }
  const clock=createClock(initial,onEvent);
  let disposed=false;
  function sync(){
    if(disposed)return clock.snapshot();
    const state=clock.snapshot();
    const shown=formatScoreboard(state);
    for(const digit of digits){
      const value=shown.digits[digit.field];
      if(value===digit.last)continue;
      const uv=digit.node.geometry.getAttribute('uv');
      const u0=value/16,u1=(value+1)/16;
      uv.setXY(0,u0,.25);uv.setXY(1,u1,.25);uv.setXY(2,u1,0);uv.setXY(3,u0,0);
      uv.needsUpdate=true;digit.last=value;
    }
    const active=state.redRemaining>0;
    const pulse=active?.55+.45*Math.pow(Math.sin(state.redRemaining*Math.PI*5),2):0;
    for(const material of originalMaterials.values()){
      material.color.setRGB(active?.72:.12,.002,.001);
      material.emissive.setRGB(active?pulse:.08,0,0);
      material.emissiveIntensity=active?2:1;
    }
    return state;
  }
  const result={};
  for(const method of ['setState','tick','start','pause','resetShot','resetGame','flashRed'])result[method]=(...args)=>{clock[method](...args);return sync();};
  result.snapshot=clock.snapshot;
  result.display=()=>formatScoreboard(clock.snapshot());
  result.sync=sync;
  result.digitCount=digits.length;
  result.dispose=()=>{
    if(disposed)return;
    clock.dispose();disposed=true;
    for(const {node,original} of digits){node.geometry.dispose();node.geometry=original;}
    for(const {node,original} of lamps)node.material=original;
    for(const material of originalMaterials.values())material.dispose();
  };
  sync();
  return result;
}
