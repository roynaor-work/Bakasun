const NS='http://www.w3.org/2000/svg';
const paths={
  spray:'M5 17l5-5 4 4-5 5zm5-5 4-4 3 3-3 5M17 7l3-3m-1 7 3-1m-7-5 1-3',
  hydrant:'M8 21V9a4 4 0 0 1 8 0v12M5 21h14M6 12H3v4h5m8-4h5v4h-5M7 8h10M10 3h4',
  ladder:'M5 21 11 3m2 18 6-18M7 16h8M9 10h8M10 6h8',
  flame:'M13 2c2 6-2 6 2 9l2-4c7 8 2 15-5 15S2 15 7 9c0 4 3 4 3 1s3-5 3-8z',
  person:'M9 21v-7l-4 2m10 5v-7l4 2M6 10l6 3 6-3M12 13v-4m3-4a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  clock:'M12 7v6l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  pause:'M8 5v14M16 5v14',
  star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  drop:'M12 2C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-13z'
};
/** Derive presentation only; the simulation remains the source of truth. */
export function fireCoachState(m){
  const guide=m.guidance||{},mission=m.settings.mission||{},active=Boolean(m.navigation?.active);
  let key=guide.key||m.hintId||(m.refilling?'fire.guide.refill':m.pressureEmpty?'fire.guide.pressure':m.spraying?(m.inRange?'fire.guide.cool':'fire.guide.approachFire'):m.firesOut?'fire.guide.complete':'fire.guide.select');
  if(m.graceRemaining>0&&key==='fire.guide.select'&&mission.briefKey)key=mission.briefKey;
  const progress=Number.isFinite(guide.progress)?Math.max(0,Math.min(1,guide.progress)):m.refilling?m.water/m.maxWater:null;
  return {key,title:mission.titleKey||'fire.mission.'+(mission.kind||'suppression'),brief:mission.briefKey,kind:guide.kind||'drive',active,progress,distance:Number.isFinite(guide.distance)&&(active||key.includes('approach'))?Math.ceil(guide.distance):null};
}
export function fireIcon(name){const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(NS,'path');p.setAttribute('d',paths[name]||paths.star);svg.append(p);return svg;}
function ring(node,color,radius){const svg=document.createElementNS(NS,'svg');svg.classList.add('fire-ring');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');const track=document.createElementNS(NS,'circle'),circle=document.createElementNS(NS,'circle');for(const [key,value]of Object.entries({cx:50,cy:50,r:radius,pathLength:100,fill:'none','stroke-width':3.5}))for(const item of [track,circle])item.setAttribute(key,String(value));track.classList.add('fire-ring-track');circle.setAttribute('stroke',color);circle.setAttribute('stroke-dasharray','100');circle.setAttribute('stroke-linecap','round');svg.append(track,circle);node.append(svg);return circle;}
export function installFireUI(ctx){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./fire.css?v=island-naval-aim-20261028-1',import.meta.url).href;document.head.append(link);
  const g2n=document.createElement('link');g2n.rel='stylesheet';g2n.href=new URL('./g2n-fire.css?v=island-naval-aim-20261028-1',import.meta.url).href;document.head.append(g2n);
  const g2o=document.createElement('link');g2o.rel='stylesheet';g2o.href=new URL('./g2o-fire.css?v=island-naval-aim-20261028-1',import.meta.url).href;document.head.append(g2o);
  const {controls,dialog,t,balance}=ctx;dialog.classList.add('fire-play');ctx.status.hidden=true;if(ctx.warning)ctx.warning.hidden=true;
  const pause=dialog.querySelector('[data-action=game-pause]');pause?.replaceChildren(fireIcon('pause'));
  controls.replaceChildren();controls.style.setProperty('--fire-action-size',balance.ui.actionSize+'px');controls.style.setProperty('--fire-small-size',balance.ui.smallActionSize+'px');controls.style.setProperty('--fire-stick-size',balance.ui.stickSize+'px');
  const zone=document.createElement('div');zone.className='soccer-stick-zone';const stick=document.createElement('div');stick.className='soccer-joystick';stick.id='joystick';stick.setAttribute('role','img');stick.setAttribute('aria-label',t('fire.drive'));const knob=document.createElement('span');knob.id='knob';knob.className='soccer-knob';stick.append(knob);zone.append(stick);controls.append(zone);
  function action(id,key,icon,label){const button=document.createElement('button');button.type='button';button.id=id;button.dataset.gameControl=key;button.setAttribute('aria-label',t(label));button.append(fireIcon(icon));const caption=document.createElement('span');caption.className='fire-control-label';caption.setAttribute('aria-hidden','true');caption.textContent=t('fire.action.'+key);button.append(caption);controls.append(button);return button;}
  const spray=action('shoot','fire','drop','minigame.spray'),water=ring(spray,'#89cfdb',46),pressure=ring(spray,'#d6bd87',39);water.parentElement.dataset.meter='water';pressure.parentElement.dataset.meter='pressure';
  const refill=action('fire-refill','refill','hydrant','minigame.refill'),ladder=action('pass','rescue','ladder','minigame.rescue');ladder.hidden=true;
  const stabilizer=document.createElement('div');stabilizer.className='fire-ladder-balance';stabilizer.hidden=true;stabilizer.setAttribute('aria-label',t('fire.stabilize'));stabilizer.append(fireIcon('ladder'));const track=document.createElement('span');track.className='fire-balance-track';const marker=document.createElement('i');marker.className='fire-balance-marker';track.append(marker);stabilizer.append(track);dialog.append(stabilizer);
  const finish=action('fire-finish','finish','star','fire.finish');finish.dataset.action='fire-certificate';finish.hidden=true;
  const hud=document.createElement('div');hud.className='fire-hud';hud.setAttribute('aria-label',t('fire.mission'));const counters={};
  for(const [key,icon,label]of [['flames','flame','fire.firesLeft'],['rescues','person','fire.peopleLeft'],['clock','clock','fire.timeLeft']]){const item=document.createElement('div');item.className='fire-counter';item.dataset.counter=key;item.setAttribute('role','img');item.setAttribute('aria-label',t(label));item.append(fireIcon(icon));const number=document.createElement('bdi');item.append(number);counters[key]=number;hud.append(item);}
  const timeRing=ring(counters.clock.parentElement,'#d6bd87',46);dialog.append(hud);
  const coach=document.createElement('div');coach.className='fire-coach';const coachText=document.createElement('div');coachText.className='fire-coach-text';const missionTitle=document.createElement('span');missionTitle.className='fire-mission-title';const instruction=document.createElement('span');instruction.className='fire-instruction';instruction.setAttribute('role','status');instruction.setAttribute('aria-live','polite');const distance=document.createElement('bdi');distance.className='fire-coach-distance';coachText.append(missionTitle,instruction);const cancelNavigation=document.createElement('button');cancelNavigation.type='button';cancelNavigation.className='fire-navigation-cancel';cancelNavigation.setAttribute('aria-label',t('fire.navCancel'));cancelNavigation.title=t('fire.navCancel');cancelNavigation.textContent='×';cancelNavigation.hidden=true;const progress=document.createElement('i');progress.className='fire-coach-progress';progress.hidden=true;coach.append(coachText,distance,cancelNavigation,progress);dialog.append(coach);
  return {stabilizer,marker,spray,water,pressure,refill,ladder,finish,counters,timeRing,dialog,coach,missionTitle,instruction,distance,cancelNavigation,progress,t,dispose(){hud.remove();coach.remove();stabilizer.remove();link.remove();g2n.remove();g2o.remove();dialog.classList.remove('fire-play');delete dialog.dataset.fireAction;}};
}
export function updateFireUI(ui,m,b){
  ui.water.style.strokeDashoffset=String(100*(1-m.water/m.maxWater));ui.pressure.style.strokeDashoffset=String(100*(1-m.pressure/m.maxPressure));
  ui.timeRing.style.strokeDashoffset=String(100*(1-m.remaining/(m.settings.seconds+b.startGrace)));
  ui.counters.flames.textContent=String(m.flames.filter(f=>f.active&&f.heat>0).length);ui.counters.rescues.textContent=String(m.rescues.filter(r=>!r.rescued&&!r.expired).length);ui.counters.clock.textContent=String(Math.ceil(m.graceRemaining||m.remaining));
  ui.counters.clock.parentElement.dataset.grace=String(m.graceRemaining>0);
  ui.dialog.dataset.fireAction=m.truck.driving?'driving':m.spraying?'spraying':m.rescuing?'rescuing':m.refilling?'refilling':'ready';
  ui.spray.classList.toggle('low-water',m.water/m.maxWater<=b.hydrant.lowWaterRatio);ui.ladder.hidden=!m.ladder.available;ui.ladder.disabled=!m.ladder.available;ui.ladder.classList.toggle('wind',m.ladder.mode==='wind');ui.ladder.classList.toggle('unstable',!m.ladder.stable);ui.stabilizer.hidden=!(m.ladder.engaged&&m.ladder.mode==='wind');ui.marker.style.left=String(50+m.ladder.sway*45)+'%';
  ui.refill.classList.toggle('available',m.atHydrant);ui.refill.classList.toggle('held',m.refilling);ui.spray.classList.toggle('empty',m.water<=0||m.pressureEmpty);ui.ladder.classList.toggle('available',m.rescues.some(r=>r.near&&r.safe&&!r.rescued&&!r.expired));ui.finish.hidden=!(m.canFinish??m.firesOut);
  ui.spray.classList.toggle('effective',m.spraying&&m.coolingTarget!==null&&m.coolingTarget!==undefined&&m.coolingPower>0);
  const coach=fireCoachState(m);ui.coach.dataset.kind=coach.kind;ui.cancelNavigation.hidden=!coach.active;ui.missionTitle.textContent=ui.t(coach.title);ui.missionTitle.title=coach.brief?ui.t(coach.brief):'';
  const instruction=ui.t(coach.key);if(ui.instruction.textContent!==instruction)ui.instruction.textContent=instruction;ui.distance.hidden=coach.distance===null;ui.distance.textContent=coach.distance===null?'':ui.t('fire.distance',{distance:coach.distance});ui.progress.hidden=coach.progress===null;ui.progress.style.transform='scaleX('+(coach.progress??0)+')';
}
