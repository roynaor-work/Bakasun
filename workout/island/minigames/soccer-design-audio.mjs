import {whistleFor,whistleAllowedInPhase,createWhistleGate,WHISTLE_SPACING} from './sports-audio-rules.mjs';
const mixURL=new URL('../design/audio/mix.json',import.meta.url);
const linear=db=>Math.pow(10,db/20);
const wallClock=()=>(globalThis.performance?.now()??Date.now())/1000;
const aliases={kick:'soccer/kick',pass:'soccer/pass',whistle:'soccer/whistle',net:'soccer/net',cheer:'soccer/crowd-goal',crowd:'soccer/crowd-calm',excited:'soccer/crowd-excited',opening:'scenes/opening',victory:'scenes/victory',defeat:'scenes/defeat'};

/** Soccer's asset mixer. The shell remains the owner of island.sound. */
/** `show` (soccerShow v1): the goal cheer is a little louder for the child's team and muffled and quiet for a rival goal (the groan the bank has no
 * sample for), and the ambience bed swells with the excitement variable (ball in the box, a goal) instead of staying flat. Same cooldowns, same whistle rules. */
export function createSoccerDesignAudio({storage,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch,pitchLength=36,clock=wallClock,show=false,home=0}={}){
  let context,master,bedBus,eventBus,bed,loading,disposed=false,paused=false,muted=false,mix=null,excitement=0,lastCrowd=-20,duckUntil=0,duckGain=1,resultPlayed=false,phase=null,bedSwell=1,mood=null;
  // The whistle gate runs on the wall clock, not context.currentTime: the context
  // is created on the first pointer, after kickoff may already have asked.
  const controller=new AbortController(),buffers=new Map(),voices=new Set(),pending=[],lastPlayed=new Map(),failed=new Set(),inflight=new Map(),counts={},gate=createWhistleGate(WHISTLE_SPACING.soccer);
  const readMute=()=>{try{return storage?.getItem('island.sound')==='off';}catch{return false;}};
  const manifest=Promise.resolve().then(()=>fetcher(mixURL,{signal:controller.signal})).then(response=>{if(!response.ok)throw Error('soccer mix unavailable');return response.json();}).then(value=>(mix=value)).catch(()=>null);
  function fade(param,value,time,seconds){param.cancelScheduledValues(time);param.setTargetAtTime(value,time,Math.max(.005,seconds/3));}
  function sync(force=false){
    const value=readMute(),changed=value!==muted;muted=value;
    if(context&&master&&(changed||force))fade(master.gain,muted||paused?0:linear(mix?.master.recommended_gain_db??-3),context.currentTime,(mix?.playback.start_stop_fade_ms??40)/1000);
  }
  function stopVoice(voice,fadeSeconds=.04){
    if(voice.stopped)return;voice.stopped=true;
    try{fade(voice.gain.gain,0,context.currentTime,fadeSeconds);voice.source.stop(context.currentTime+fadeSeconds);}catch{}
  }
  function chain(source,gain,asset,destination,lowpass=null){
    const nodes=[source];let previous=source;
    for(const [type,key]of [['highpass','highpass_hz'],['lowpass','lowpass_hz']])if(asset.filters?.[key]||type==='lowpass'&&lowpass){const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=type==='lowpass'&&lowpass?Math.min(lowpass,asset.filters?.[key]||lowpass):asset.filters[key];filter.Q.value=asset.filters?.q??.7071;previous.connect(filter);previous=filter;nodes.push(filter);}
    previous.connect(gain);gain.connect(destination);nodes.push(gain);return nodes;
  }
  function load(key){
    const asset=mix?.assets[key];if(buffers.has(key))return Promise.resolve(true);
    if(!asset||disposed||failed.has(key))return Promise.resolve(false);
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{try{const response=await fetcher(new URL(asset.file,mixURL),{signal:controller.signal});if(!response.ok)throw Error('missing soccer sound');const bytes=await response.arrayBuffer(),buffer=await context.decodeAudioData(bytes);if(disposed)return false;buffers.set(key,buffer);return true;}catch{failed.add(key);return false;}finally{inflight.delete(key);}})();inflight.set(key,task);return task;
  }
  function startBed(){
    if(disposed||bed||!context||!mix)return;
    const key=mix.layers.soccer_play.bed,asset=mix.assets[key],buffer=buffers.get(key);if(!buffer)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;
    // Full decoded loop, without trimming or synthetic padding at the seam.
    gain.gain.value=asset.recommended_gain_linear;const nodes=chain(source,gain,asset,bedBus);source.start();bed={source,gain,nodes};
  }
  async function unlock(){
    if(disposed||paused||!AudioContext)return;
    try{
      if(!context){
        context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);bedBus=context.createGain();eventBus=context.createGain();bedBus.connect(master);eventBus.connect(master);
        loading=manifest.then(async()=>{
          if(!mix||disposed)return;
          // Short result cues are ready before the shell disposes a completed
          // session. No other sport's bank is downloaded.
          await Promise.all(Object.keys(mix.assets).filter(key=>key.startsWith('soccer/')||key.startsWith('scenes/')).map(load));
          if(disposed)return;startBed();sync(true);
          const now=context.currentTime;for(const item of pending.splice(0))if(item.expires>=now)voice(item.cue,item.delay,item.priority,{gain:item.scale,lowpass:item.lowpass});
        });
      }
      sync(true);if(context.state==='suspended')await context.resume();startBed();
    }catch{/* Autoplay denial or audio interruption is non-fatal. */}
  }
  function duck(layer){
    if(!context||!bedBus||layer?.duck_bed_db===undefined)return;
    const now=context.currentTime;duckUntil=Math.max(duckUntil,now+layer.duck_hold_ms/1000);duckGain=Math.min(duckGain,linear(layer.duck_bed_db));fade(bedBus.gain,duckGain,now,mix.master.duck_attack_ms/1000);
  }
  function voice(cue,delay=0,priority=2,{gain:scale=1,lowpass=null}={}){
    if(disposed||paused||readMute()||!context||context.state==='closed')return false;
    const key=aliases[cue]||cue,asset=mix?.assets[key],buffer=buffers.get(key),now=context.currentTime;
    if(!asset||!buffer){
      if(key.startsWith('scenes/')&&asset&&!failed.has(key)){void load(key).then(loaded=>{if(loaded&&!disposed&&!paused)voice(cue,delay,priority);});}
      else if(pending.length<12)pending.push({cue,delay,priority,expires:now+.4,scale,lowpass});
      return false;
    }
    const scheduled=now+Math.max(0,delay),last=lastPlayed.get(key)??-100;
    if(scheduled-last<(asset.cooldown_ms??0)/1000)return false;
    const group=Object.entries(mix.exclusive_groups).find(([,members])=>members.includes(key))?.[0];
    let perAsset=0,active=0,lowest=null;
    for(const old of voices){if(old.stopped)continue;if(old.key===key)perAsset++;if(group&&old.group===group&&old.key!==key)stopVoice(old);else{active++;if(!lowest||old.priority<lowest.priority)lowest=old;}}
    if(perAsset>=asset.max_voices)return false;
    const limit=priority>=3?mix.master.max_simultaneous_events:Math.min(mix.master.max_simultaneous_events,mix.layers.soccer_play.max_concurrent_events);
    if(active>=limit){if(!lowest||lowest.priority>=priority)return false;stopVoice(lowest);}
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=0;
    const nodes=chain(source,gain,asset,eventBus,lowpass),item={key,group,source,gain,nodes,priority,stopped:false};voices.add(item);lastPlayed.set(key,scheduled);
    const fadeSeconds=mix.playback.start_stop_fade_ms/1000,duration=buffer.duration,level=asset.recommended_gain_linear*scale;
    gain.gain.setValueAtTime(0,scheduled);gain.gain.linearRampToValueAtTime(level,scheduled+Math.min(fadeSeconds,duration/4));gain.gain.setValueAtTime(level,scheduled+Math.max(fadeSeconds,duration-fadeSeconds));gain.gain.linearRampToValueAtTime(0,scheduled+duration);
    source.onended=()=>{voices.delete(item);for(const node of nodes)node.disconnect();if(disposed&&!voices.size&&context.state!=='closed')void context.close().catch(()=>{});};
    source.start(scheduled);source.stop(scheduled+duration);return true;
  }
  function play(cue,delay=0,priorityOverride,options){
    if(disposed||paused||readMute())return;
    counts[cue]=(counts[cue]||0)+1;
    const key=aliases[cue]||cue,priority=priorityOverride??(key.startsWith('scenes/')?5:key==='soccer/whistle'?4:key==='soccer/crowd-goal'||key==='soccer/net'?3:key.includes('crowd')?1:2);
    voice(cue,delay,priority,options);
  }
  /** soccerShow v1 goal crowd: the cheer sample at +2 dB for the child's team, at -10 dB through a 650 Hz low-pass for the rival (a groan). */
  const goalCrowd=team=>show?(team===home?{gain:1.25}:{gain:.32,lowpass:650}):undefined;
  /** The referee's whistle. Match events pass the rule table (sports-audio-rules)
   * and the live-phase guard; the session's own cues (kickoff, shootout start)
   * are deliberate, so they only set the spacing clock. Either way no two
   * whistles sound within WHISTLE_SPACING.soccer seconds, except a forced cue. */
  function whistle(reason,{force=false,detail={}}={}){
    if(disposed||paused)return false;
    const now=clock();
    if(!force){if(!whistleFor(reason,detail)||!whistleAllowedInPhase(reason,phase))return false;if(!gate.allow(now))return false;}
    else gate.mark(now);
    duck(mix?.layers.soccer_restart);play('whistle');return true;
  }
  function event(value){
    if(!value)return;
    switch(value.type){
      case 'goal':duck(mix?.layers.soccer_goal);for(const item of mix?.layers.soccer_goal.timeline||[{asset:'soccer/net',at_ms:0},{asset:'soccer/crowd-goal',at_ms:80}])play(item.asset,item.at_ms/1000,3,item.asset==='soccer/crowd-goal'?goalCrowd(value.team):undefined);break;
      // Throw-ins, corners and goal kicks stay silent here (whistleFor); play
      // resuming after a goal or half time, half/full time and calls whistle.
      case 'restart':case 'halftime':case 'play':case 'fulltime':case 'kickoff':case 'foul':case 'penalty':whistle(value.type,{detail:value});break;
      case 'shot':case 'header':case 'volley':case 'post':play('kick');break;
      case 'pass':case 'loft':case 'throw':play('pass');break;
    }
  }
  return {
    unlock,play,event,whistle,
    update(state,crowdMood=null){
      if(disposed)return;phase=state?.phase??phase;sync();if(!context||!mix)return;
      const now=context.currentTime;if(duckUntil&&now>=duckUntil){duckUntil=0;duckGain=1;fade(bedBus.gain,1,now,mix.master.duck_release_ms/1000);}
      const ball=state.ball,owner=ball.owner===null?null:state.players[ball.owner],danger=owner?Math.max(0,owner.x*(owner.team===0?state.attackDir:-state.attackDir)/(pitchLength/2)):Math.abs(ball.x)/(pitchLength/2);
      excitement=state.phase==='goal'?1:Math.min(1,danger*.8+(Math.hypot(ball.vx,ball.vz)>10?.2:0));
      // soccerShow v1: the bed swells up to +4.6 dB with the excitement (ball in the box, the cheer after a home goal); a rival goal keeps it flat.
      if(show&&bed){mood=crowdMood;const swell=1+.7*Math.max(excitement,crowdMood?.excitement||0)*(1-.5*(crowdMood?.groan||0))+.3*(crowdMood?.cheer||0);if(Math.abs(swell-bedSwell)>.03){bedSwell=swell;fade(bed.gain.gain,mix.assets[mix.layers.soccer_play.bed].recommended_gain_linear*swell,now,.4);}}
      if(!paused&&!muted&&state.phase==='playing'&&now-lastCrowd>8){lastCrowd=now;play(excitement>.65?'excited':'crowd');}
      if(!resultPlayed&&state.phase==='finished'){resultPlayed=true;const cue=state.score[0]>state.score[1]?'victory':state.score[0]<state.score[1]?'defeat':null;if(cue){duck(mix.layers[cue]);const excluded=mix.layers[cue].exclude||[];for(const old of voices)if(excluded.includes(old.key))stopVoice(old);play(cue);}}
      if(state.phase==='playing')resultPlayed=false;
    },
    setPaused(value){paused=Boolean(value);pending.length=0;sync(true);if(paused){for(const item of voices)stopVoice(item,0);if(context?.state==='running')void context.suspend().catch(()=>{});}else void unlock();},
    get snapshot(){return {bank:'design/audio/mix.json',muted,paused,disposed,contextState:context?.state||'uninitialized',loaded:[...buffers.keys()],crowd:Boolean(bed),excitement,show,bedSwell,mood,counts:{...counts},active:voices.size,ducking:duckUntil>0,whistle:{last:gate.last,blocked:gate.blocked,phase}};},
    get ready(){return loading||manifest;},
    dispose({finish=false}={}){
      if(disposed)return;disposed=true;controller.abort();pending.length=0;
      if(bed){try{bed.source.stop();}catch{}for(const node of bed.nodes)node.disconnect();bed=null;}
      if(!finish)for(const item of voices)stopVoice(item,0);
      if(context&&context.state!=='closed'&&(!finish||!voices.size))void context.close().catch(()=>{});
    }
  };
}
