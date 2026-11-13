import {fireControlsV9,fireV21} from './polish-flag.mjs';
/** 11/11/2026 pure: water gauge state. Blue above 35%, orange down to the low-water ratio, red below it; green while refilling. */
export function waterGaugeState(water,maxWater,lowRatio,refilling=false){const ratio=maxWater>0?Math.max(0,Math.min(1,water/maxWater)):0,percent=Math.round(ratio*100);return {percent,level:refilling?'refilling':ratio<=lowRatio?'critical':ratio<=.35?'low':'ok'};}
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
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./fire.css?v=island-v2-20261107-12',import.meta.url).href;document.head.append(link);
  const g2n=document.createElement('link');g2n.rel='stylesheet';g2n.href=new URL('./g2n-fire.css?v=island-v2-20261107-12',import.meta.url).href;document.head.append(g2n);
  const g2o=document.createElement('link');g2o.rel='stylesheet';g2o.href=new URL('./g2o-fire.css?v=island-v2-20261107-12',import.meta.url).href;document.head.append(g2o);
  const {controls,dialog,t,balance}=ctx;dialog.classList.add('fire-play');ctx.status.hidden=true;if(ctx.warning)ctx.warning.hidden=true;
  const pause=dialog.querySelector('[data-action=game-pause]');pause?.replaceChildren(fireIcon('pause'));
  const v9=fireControlsV9();if(v9)dialog.classList.add('fire-v9');controls.replaceChildren();controls.style.setProperty('--fire-action-size',(v9?96:balance.ui.actionSize)+'px');controls.style.setProperty('--fire-small-size',(v9?84:balance.ui.smallActionSize)+'px');controls.style.setProperty('--fire-stick-size',balance.ui.stickSize+'px');
  const zone=document.createElement('div');zone.className='soccer-stick-zone';const stick=document.createElement('div');stick.className='soccer-joystick';stick.id='joystick';stick.setAttribute('role','img');stick.setAttribute('aria-label',t('fire.drive'));const knob=document.createElement('span');knob.id='knob';knob.className='soccer-knob';stick.append(knob);zone.append(stick);if(v9){const hint=document.createElement('div');hint.className='fire-move-hint';hint.setAttribute('aria-hidden','true');zone.append(hint);}controls.append(zone);
  const hudV21=fireV21('fireHud'); // 11/11/2026 (Roy): no word inside the water button; a real water gauge in the HUD instead. `?fireHud=v20` restores.
  function action(id,key,icon,label){const button=document.createElement('button');button.type='button';button.id=id;button.dataset.gameControl=key;button.setAttribute('aria-label',t(label));button.append(fireIcon(icon));if(hudV21&&key==='refill'){controls.append(button);return button;}const caption=document.createElement('span');caption.className='fire-control-label';caption.setAttribute('aria-hidden','true');caption.textContent=t('fire.action.'+key);button.append(caption);controls.append(button);return button;}
  const spray=action('shoot','fire','drop','minigame.spray'),water=ring(spray,'#89cfdb',46),pressure=ring(spray,'#d6bd87',39);water.parentElement.dataset.meter='water';pressure.parentElement.dataset.meter='pressure';
  const refill=action('fire-refill','refill','hydrant','minigame.refill'),ladder=action('pass','rescue','ladder','minigame.rescue');ladder.hidden=!v9;
  const stabilizer=document.createElement('div');stabilizer.className='fire-ladder-balance';stabilizer.hidden=true;stabilizer.setAttribute('aria-label',t('fire.stabilize'));stabilizer.append(fireIcon('ladder'));const track=document.createElement('span');track.className='fire-balance-track';const marker=document.createElement('i');marker.className='fire-balance-marker';track.append(marker);stabilizer.append(track);dialog.append(stabilizer);
  const finish=action('fire-finish','finish','star','fire.finish');finish.dataset.action='fire-certificate';finish.hidden=true;
  const hud=document.createElement('div');hud.className='fire-hud';hud.setAttribute('aria-label',t('fire.mission'));const counters={};
  for(const [key,icon,label]of [['flames','flame','fire.firesLeft'],['rescues','person','fire.peopleLeft'],['clock','clock','fire.timeLeft']]){const item=document.createElement('div');item.className='fire-counter';item.dataset.counter=key;item.setAttribute('role','img');item.setAttribute('aria-label',t(label));item.append(fireIcon(icon));const number=document.createElement('bdi');item.append(number);counters[key]=number;hud.append(item);}
  const timeRing=ring(counters.clock.parentElement,'#d6bd87',46);
  let gauge=null;if(hudV21){gauge=document.createElement('div');gauge.className='fire-water-gauge';gauge.setAttribute('role','meter');gauge.setAttribute('aria-label',t('fire.waterGauge'));gauge.setAttribute('aria-valuemin','0');gauge.setAttribute('aria-valuemax','100');gauge.append(fireIcon('drop'));const track=document.createElement('span');track.className='fire-gauge-track';const fill=document.createElement('i');fill.className='fire-gauge-fill';track.append(fill);const text=document.createElement('bdi');text.className='fire-gauge-text';gauge.append(track,text);dialog.append(gauge);gauge.fill=fill;gauge.text=text;} // its own panel under the counters: the coach box starts 244px from the left and would cover a wider HUD
  dialog.append(hud);
  const coach=document.createElement('div');coach.className='fire-coach';const coachText=document.createElement('div');coachText.className='fire-coach-text';const missionTitle=document.createElement('span');missionTitle.className='fire-mission-title';const instruction=document.createElement('span');instruction.className='fire-instruction';instruction.setAttribute('role','status');instruction.setAttribute('aria-live','polite');const distance=document.createElement('bdi');distance.className='fire-coach-distance';coachText.append(missionTitle,instruction);const cancelNavigation=document.createElement('button');cancelNavigation.type='button';cancelNavigation.className='fire-navigation-cancel';cancelNavigation.setAttribute('aria-label',t('fire.navCancel'));cancelNavigation.title=t('fire.navCancel');cancelNavigation.textContent='×';cancelNavigation.hidden=true;const progress=document.createElement('i');progress.className='fire-coach-progress';progress.hidden=true;coach.append(coachText,distance,cancelNavigation,progress);dialog.append(coach);
  return {gauge,stabilizer,marker,spray,water,pressure,refill,ladder,finish,counters,timeRing,dialog,coach,missionTitle,instruction,distance,cancelNavigation,progress,t,dispose(){hud.remove();gauge?.remove();coach.remove();stabilizer.remove();link.remove();g2n.remove();g2o.remove();dialog.classList.remove('fire-play');delete dialog.dataset.fireAction;}};
}
const v9Controls=fireControlsV9();
export function updateFireUI(ui,m,b){
  ui.water.style.strokeDashoffset=String(100*(1-m.water/m.maxWater));ui.pressure.style.strokeDashoffset=String(100*(1-m.pressure/m.maxPressure));
  ui.timeRing.style.strokeDashoffset=String(100*(1-m.remaining/(m.settings.seconds+b.startGrace)));
  ui.counters.flames.textContent=String(m.flames.filter(f=>f.active&&f.heat>0).length);ui.counters.rescues.textContent=String(m.rescues.filter(r=>!r.rescued&&!r.expired).length);ui.counters.clock.textContent=String(Math.ceil(m.graceRemaining||m.remaining));
  ui.counters.clock.parentElement.dataset.grace=String(m.graceRemaining>0);
  if(ui.gauge){const g=waterGaugeState(m.water,m.maxWater,b.hydrant.lowWaterRatio,m.refilling&&m.water<m.maxWater);if(ui.gauge.dataset.percent!==String(g.percent)){ui.gauge.dataset.percent=String(g.percent);ui.gauge.setAttribute('aria-valuenow',String(g.percent));ui.gauge.fill.style.transform='scaleX('+(g.percent/100)+')';ui.gauge.text.textContent=g.percent+'%';}ui.gauge.dataset.level=g.level;}
  ui.dialog.dataset.fireAction=m.truck.driving?'driving':m.spraying?'spraying':m.rescuing?'rescuing':m.refilling?'refilling':'ready';
  ui.spray.classList.toggle('low-water',m.water/m.maxWater<=b.hydrant.lowWaterRatio);ui.ladder.hidden=v9Controls?false:!m.ladder.available;ui.ladder.disabled=!m.ladder.available;ui.ladder.classList.toggle('idle',!m.ladder.available);ui.ladder.classList.toggle('wind',m.ladder.mode==='wind');ui.ladder.classList.toggle('unstable',!m.ladder.stable);ui.stabilizer.hidden=!(m.ladder.engaged&&m.ladder.mode==='wind');ui.marker.style.left=String(50+m.ladder.sway*45)+'%';
  ui.refill.classList.toggle('available',m.atHydrant);ui.refill.classList.toggle('held',m.refilling);ui.spray.classList.toggle('empty',m.water<=0||m.pressureEmpty);ui.ladder.classList.toggle('available',m.rescues.some(r=>r.near&&r.safe&&!r.rescued&&!r.expired));ui.finish.hidden=!(m.canFinish??m.firesOut);
  ui.spray.classList.toggle('effective',m.spraying&&m.coolingTarget!==null&&m.coolingTarget!==undefined&&m.coolingPower>0);
  const coach=fireCoachState(m);ui.coach.dataset.kind=coach.kind;ui.cancelNavigation.hidden=!coach.active;ui.missionTitle.textContent=ui.t(coach.title);ui.missionTitle.title=coach.brief?ui.t(coach.brief):'';
  const instruction=ui.t(coach.key);if(ui.instruction.textContent!==instruction)ui.instruction.textContent=instruction;ui.distance.hidden=coach.distance===null;ui.distance.textContent=coach.distance===null?'':ui.t('fire.distance',{distance:coach.distance});ui.progress.hidden=coach.progress===null;ui.progress.style.transform='scaleX('+(coach.progress??0)+')';
}
