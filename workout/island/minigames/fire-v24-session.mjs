/** 14/11/2026 fire v24: the on-screen part of "inside the building" (an entry stage). Runs over the frozen street session inside the same
 * game dialog: its own canvas on top of the street canvas, a clear room clock (ring + seconds, green/amber/red, "ten seconds" in voice and
 * colour), score and room chips, a coach line in simple Hebrew, slim tool buttons on the right only when the stage teaches a tool, a pressure
 * bar on the left, a three-step picture lesson on the first entry stage. Touch: one finger on the room aims and sprays (the water goes where
 * the finger is, with help onto the nearest fire); a short tap on the friend carries them out. The model is fire-v24-interior.mjs, the
 * picture is fire-v24-scene.mjs. Nothing is written to the save. */
import {createInteriorModel,clockBand} from './fire-v24-interior.mjs?v=island-v2-20261107-13';
import {createInteriorScene} from './fire-v24-scene.mjs?v=island-v2-20261107-13';
import {createG2nAudio} from './g2n-audio.mjs?v=island-v2-20261107-13';
import {FIRE_V23_ICONS} from './fire-v23-assets.mjs?v=island-v2-20261107-13';

const NS='http://www.w3.org/2000/svg';
const ICONS={...FIRE_V23_ICONS,clock:'M12 7v6l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',hand:'M8 13V5a1.5 1.5 0 0 1 3 0v6V4a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-12 0v-3a1.5 1.5 0 0 1 3 0',hold:'M12 3a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Zm0 4v3M5 20h14',friend:'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 10a6 6 0 0 1 12 0M4 9l2-2m14 2-2-2'};
function icon(name){const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(NS,'path');p.setAttribute('d',ICONS[name]||ICONS.star);svg.append(p);return svg;}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}

/** @param ctx the fire session context (dialog, canvas, controls, t, lite, engine); `plan` the entry plan; `onDone(result)` once the firefighter is out. */
export function runFireV24Interior(ctx,{plan,tutorial=false,onDone,createScene=createInteriorScene,createModel=createInteriorModel}){
  const {dialog,t}=ctx,host=ctx.canvas.parentElement||dialog,audio=createG2nAudio();audio.unlock();
  const model=createModel({plan,sound:e=>audio.play(e)});
  const canvas=el('canvas','fire-v24-canvas');canvas.setAttribute('aria-label',t('fire.v24.doorLabel'));host.append(canvas);
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./fire-v24.css?v=island-v2-20261107-13',import.meta.url).href;document.head.append(link);
  dialog.classList.add('fire-v24-inside');
  // the street HUD and controls step aside while we are inside (visibility only; the street session keeps its nodes)
  const hidden=[...dialog.children].filter(n=>!n.classList.contains('game-header')&&!n.classList.contains('game-stage')&&!n.classList.contains('shell-countdown')).map(n=>[n,n.style.visibility]);
  for(const [n]of hidden)n.style.visibility='hidden';
  const root=el('div','fv24');root.dataset.fireV24='inside';dialog.append(root);
  // ---- HUD -----------------------------------------------------------------------------------------------------------------------------
  const clock=el('div','fv24-clock');clock.setAttribute('role','timer');clock.setAttribute('aria-label',t('fire.v24.clock'));
  const ring=document.createElementNS(NS,'svg');ring.setAttribute('viewBox','0 0 100 100');ring.classList.add('fv24-ring');const track=document.createElementNS(NS,'circle'),arc=document.createElementNS(NS,'circle');
  const RING=2*Math.PI*44;for(const c of [track,arc]){c.setAttribute('cx','50');c.setAttribute('cy','50');c.setAttribute('r','44');c.setAttribute('fill','none');}track.classList.add('fv24-ring-track');arc.classList.add('fv24-ring-arc');arc.setAttribute('stroke-dasharray',String(RING));arc.setAttribute('stroke-dashoffset','0');arc.setAttribute('stroke-linecap','round');ring.append(track,arc);
  const clockText=el('bdi','fv24-clock-text','');clock.append(ring,clockText);
  const chips=el('div','fv24-chips');const scoreChip=el('div','fv24-chip fv24-score');scoreChip.append(icon('star'),el('bdi','fv24-chip-value','0'));const roomChip=el('div','fv24-chip fv24-room');roomChip.append(icon('door'),el('span','fv24-chip-value',''));chips.append(scoreChip,roomChip);
  const coach=el('div','fv24-coach');coach.setAttribute('role','status');coach.setAttribute('aria-live','polite');const coachText=el('span','fv24-coach-text','');coach.append(coachText);
  const gauge=el('div','fv24-gauge');gauge.setAttribute('role','meter');gauge.setAttribute('aria-label',t('fire.v24.pressure'));gauge.setAttribute('aria-valuemin','0');gauge.setAttribute('aria-valuemax','100');const gaugeTrack=el('span','fv24-gauge-track'),gaugeFill=el('i','fv24-gauge-fill');gaugeTrack.append(gaugeFill);gauge.append(icon('spray'),gaugeTrack);
  const tools=el('div','fv24-tools');tools.setAttribute('role','group');tools.setAttribute('aria-label',t('fire.v24.tools'));const toolButtons={};
  if(model.tools.length>1)for(const tool of model.tools){const b=el('button','fv24-tool');b.type='button';b.dataset.tool=tool;b.setAttribute('aria-label',t('fire.v23.tool.'+tool));b.append(icon(tool),el('span','fv24-tool-label',t('fire.v23.tool.'+tool)));const count=el('bdi','fv24-tool-count','');b.append(count);tools.append(b);toolButtons[tool]=b;b.addEventListener('click',()=>{if(!paused)input.tool=tool;});}
  const card=el('div','fv24-card');card.hidden=true;card.setAttribute('role','dialog');
  const fade=el('div','fv24-fade');fade.dataset.state='in';const fadeText=el('p','fv24-fade-text',t('fire.v24.loading'));fade.append(fadeText);
  root.append(clock,chips,coach,gauge,tools,card,fade);
  // ---- input -------------------------------------------------------------------------------------------------------------------------------
  const input={};let pointerId=null,downAt=0,downPoint=null,moved=false,paused=false,disposed=false,frame=0,last,W=1,H=1,dpr=1,tutorialShown=false,tutorialDone=!tutorial,lowQuality=Boolean(ctx.lite);
  const scene=createScene({model,canvas,lite:lowQuality});
  const events=new AbortController(),options={signal:events.signal};
  const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const aimAt=p=>{const world=scene.pick(p.x,p.y);if(!world){delete input.aim;return;}const help=model.assist(world);input.aim=help.point;input.aimRaw=world;};
  canvas.addEventListener('pointerdown',e=>{if(paused||pointerId!==null||!tutorialDone)return;e.preventDefault();audio.unlock();pointerId=e.pointerId;downAt=performance.now();moved=false;downPoint={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}
    if(model.phase==='intro'){input.skip=true;return;}aimAt(local(e));},options);
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;if(Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>14)moved=true;if(model.phase==='play')aimAt(local(e));},options);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId!==pointerId)return;pointerId=null;
    if(type==='pointerup'&&!moved&&performance.now()-downAt<320){const world=scene.pick(local(e).x,local(e).y);if(world)input.tap=world;}delete input.aim;delete input.aimRaw;},options);
  card.addEventListener('pointerdown',e=>{e.preventDefault();if(paused)return;if(!tutorialDone){tutorialDone=true;card.hidden=true;return;}input.skip=true;},options);
  for(const type of ['contextmenu','selectstart','dragstart'])root.addEventListener(type,e=>e.preventDefault(),options);
  const clear=()=>{for(const k of Object.keys(input))delete input[k];pointerId=null;};
  window.addEventListener('blur',clear,options);document.addEventListener('visibilitychange',()=>{clear();last=undefined;},options);
  // ---- sizing --------------------------------------------------------------------------------------------------------------------------------
  function resize(){if(disposed)return;const r=canvas.getBoundingClientRect();W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(globalThis.devicePixelRatio||1,lowQuality?1.25:2);scene.resize(W,H,dpr);}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  // ---- HUD text -----------------------------------------------------------------------------------------------------------------------------
  let lastCoach='',lastCard='',tenSaid=false;
  function coachKey(s){const f=model.feedback;if(f&&model.time-f.at<2.6)return f.key;
    const p=s.phase;if(p==='enter')return 'fire.v24.loading';if(p==='leave')return 'fire.v24.say.leave';if(p==='clear')return 'fire.v24.say.roomClear';if(p==='handover')return 'fire.v24.say.handover';
    const r=s.room;if(!r)return 'fire.v24.loading';const fr=r.friend,near=r.spots.find(x=>x.id===fr.near);
    if(fr.state==='waiting'&&(!near||near.done))return fr.kind==='pet'?'fire.v24.say.tapPet':'fire.v24.say.tapKid';
    if(fr.state!=='waiting'&&r.spots.some(x=>!x.done))return 'fire.v24.say.friendOut';
    return 'fire.v24.say.aim';}
  function updateHud(){const s=model.snapshot(),r=s.room;
    scoreChip.lastChild.textContent=String(s.score);roomChip.lastChild.textContent=t('fire.v24.roomOf',{n:s.roomIndex+1,total:s.roomCount});
    const inRoom=model.inRoom&&r;clock.hidden=!inRoom;gauge.hidden=!inRoom||s.phase!=='play';tools.hidden=!inRoom||s.phase!=='play';
    if(r){const frac=r.remaining/Math.max(1,r.limit);arc.setAttribute('stroke-dashoffset',String((RING*(1-Math.max(0,Math.min(1,frac)))).toFixed(1)));clockText.textContent=String(Math.ceil(r.remaining));clock.dataset.band=s.phase==='handover'?'critical':clockBand(r.remaining,r.limit);clock.setAttribute('aria-valuenow',String(Math.ceil(r.remaining)));
      if(r.remaining<=10&&!tenSaid&&s.phase==='play'){tenSaid=true;ctx.engine?.narration?.announce?.('fire.v24.say.tenSeconds');}if(s.phase==='intro')tenSaid=false;}
    const level=s.tanks[s.tool]??1;gaugeFill.style.transform=`scaleY(${level})`;gauge.dataset.level=s.empty?'critical':level<.3?'low':'ok';gauge.setAttribute('aria-valuenow',String(Math.round(level*100)));
    for(const [tool,b]of Object.entries(toolButtons)){b.classList.toggle('active',s.tool===tool);b.setAttribute('aria-pressed',String(s.tool===tool));const lvl=tool==='blanket'?(s.blankets?1:0):(s.tanks[tool]??1);b.style.setProperty('--fv24-level',String(lvl));b.querySelector('.fv24-tool-count').textContent=tool==='blanket'?String(s.blankets):'';
      const wants=r&&s.phase==='play'&&r.spots.some(x=>!x.done&&((x.kind==='electric'&&tool==='extinguisher')||(x.kind==='oil'&&tool==='blanket')||(x.kind==='heavy'&&tool==='foam')));b.classList.toggle('hint',Boolean(wants)&&s.tool!==tool);}
    // cards: the lesson (first entry stage) then the room card
    if(!tutorialDone&&scene.ready&&!tutorialShown){tutorialShown=true;card.hidden=false;card.dataset.card='tutorial';card.replaceChildren(el('h3','fv24-card-title',t('fire.v24.tutorial.title')));const steps=el('div','fv24-steps');for(const [ic,key]of [['hand','fire.v24.tutorial.aim'],['hold','fire.v24.tutorial.spray'],['friend','fire.v24.tutorial.rescue']]){const st=el('div','fv24-step');st.append(icon(ic),el('span','',t(key)));steps.append(st);}card.append(steps,el('p','fv24-card-tap',t('fire.v24.tutorial.go')));}
    else if(tutorialDone&&s.phase==='intro'&&r){const id='room:'+r.id+':'+s.roomIndex;card.hidden=false;if(lastCard!==id){lastCard=id;card.dataset.card='room';card.replaceChildren(el('h3','fv24-card-title',t('fire.v24.room.'+r.id)),el('p','fv24-card-rule',t('fire.v24.intro',{room:t('fire.v24.room.'+r.id),friend:t('fire.v24.friend.'+r.friend.id)})),el('p','fv24-card-clock',t('fire.v24.introClock',{seconds:r.limit})),el('p','fv24-card-tap',t('fire.v24.tutorial.go')));}}
    else if(tutorialDone)card.hidden=true;
    const key=coachKey(s);if(key!==lastCoach){lastCoach=key;coachText.textContent=t(key);}
    root.dataset.phase=s.phase;
  }
  // ---- audio adapter ---------------------------------------------------------------------------------------------------------------------------
  const audioModel={truck:{speed:0},spraying:false,pressure:1,flames:[],refilling:false,water:1,maxWater:1,rescuing:false,ladder:{extension:0}},audioBalance={vehicle:{speed:1}};
  function updateAudio(){audioModel.spraying=model.spraying&&model.tool!=='blanket';audioModel.pressure=model.tanks[model.tool]??1;audioModel.flames=model.room&&model.inRoom?model.room.spots.filter(s=>!s.done).map(()=>({active:true,heat:1})):[];audio.update(audioModel,audioBalance);}
  // ---- frame ------------------------------------------------------------------------------------------------------------------------------------
  let samples=0,slow=0,fadeT=0,done=false,fpsAcc=0,fpsN=0;const fps=[];
  function tick(now){
    if(disposed)return;frame=requestAnimationFrame(tick);
    const elapsed=last===undefined?0:now-last,dt=paused||document.hidden?0:Math.min(.1,elapsed/1000);last=now;
    if(dt>0){samples++;if(elapsed>40)slow++;fpsAcc+=elapsed;fpsN++;if(fpsN>=30){fps.push(Math.round(1000/(fpsAcc/fpsN)));if(fps.length>20)fps.shift();fpsAcc=fpsN=0;}if(samples>=90){if(slow>45&&!lowQuality){lowQuality=true;resize();}samples=slow=0;}}
    try{
      if(scene.ready&&fade.dataset.state==='in'){fadeT+=dt;if(fadeT>.35)fade.dataset.state='clear';}
      const running=scene.ready&&tutorialDone&&!paused&&dt>0&&fade.dataset.state!=='in';
      if(running){const step={...input};delete input.tap;delete input.skip;delete input.tool;model.update(dt,step);}
      scene.update(paused?0:dt);scene.render();updateAudio();updateHud();
      if(model.result&&!done){done=true;fadeText.textContent=t('fire.v24.leaving');fade.dataset.state='out';setTimeout(()=>{if(disposed)return;const result=model.result;session.dispose();onDone?.(result);},420);}
    }catch(error){cancelAnimationFrame(frame);if(!disposed){session.dispose();onDone?.(null,error);}if(new URLSearchParams(location.search).get('dev')==='1')console.error(error);}
  }
  frame=requestAnimationFrame(tick);
  const session={
    model,scene,
    get ready(){return scene.ready;},get loadFailed(){return scene.loadFailed;},
    setPaused(v){paused=Boolean(v);audio.setPaused(paused);clear();last=undefined;},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();observer.disconnect();audio.dispose();scene.dispose();canvas.remove();root.remove();link.remove();dialog.classList.remove('fire-v24-inside');for(const [n,v]of hidden)n.style.visibility=v;},
    /** Model state plus where the friend and the fires are on the screen (CSS px of the page), for the browser checks. */
    get snapshot(){const s=model.snapshot(),r=canvas.getBoundingClientRect(),screen=p=>{const q=scene.project(p);return {x:+(r.left+q.x).toFixed(1),y:+(r.top+q.y).toFixed(1)};};
      const out={...s,ready:scene.ready,tutorialOpen:!tutorialDone,paused,renderMetrics:{...scene.metrics(),fps:fps.slice(),dpr},audio:audio.snapshot(),viewport:{width:W,height:H}};
      if(s.room){out.screen={spots:s.room.spots.map(x=>({id:x.id,kind:x.kind,done:x.done,...screen([x.pos[0],x.pos[1]+.25,x.pos[2]])})),friend:{...screen([s.room.friend.pos[0],s.room.friend.height*.5,s.room.friend.pos[2]]),state:s.room.friend.state}};}
      return out;},
  };
  return session;
}
