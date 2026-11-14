import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {BossEncounter} from './encounter.mjs';
const $=id=>document.getElementById(id),manifest=await fetch('./manifest.json').then(r=>{if(!r.ok)throw new Error('manifest unavailable');return r.json();});
const canvas=$('scene'),overlay=$('overlay'),ctx=overlay.getContext('2d'),area=$('viewport');
const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new T.Scene(),camera=new T.OrthographicCamera(-6.4,6.4,2, -2,.1,60);camera.position.set(0,8,7.5);camera.lookAt(0,0,.1);
scene.add(new T.HemisphereLight('#fff1d9','#617583',1.8));const light=new T.DirectionalLight('#ffedce',2.4);light.position.set(-3,6,5);scene.add(light);const fill=new T.DirectionalLight('#88b8d0',.9);fill.position.set(4,2,-3);scene.add(fill);
const loader=new GLTFLoader(),bosses=[];let selected=0,paused=false,attacking=false,sound=false,last=performance.now(),clock=0;const sprites=[],shots=[],tells=[];let width=1,height=1;
const labels={hull:'ליבה',generator:'גנרטור',turret_left:'תותח שמאלי',turret_center:'תותח מרכזי',turret_right:'תותח ימני',segment_01:'מקטע 1',segment_02:'מקטע 2',segment_03:'מקטע 3',segment_04:'מקטע 4',segment_05:'מקטע 5'};
let audioVoice=null;const audioProbe=document.createElement('audio');const audioExtension=audioProbe.canPlayType('audio/ogg; codecs="vorbis"')?'ogg':'mp3';
function cue(b,key){if(!sound)return;if(audioVoice){audioVoice.pause();audioVoice.currentTime=0;}audioVoice=new Audio(b.spec.audio[key][audioExtension]);audioVoice.volume=.45;audioVoice.play().catch(()=>{});}
function say(text){$('event').textContent=text;}
function effect(b,kind,at){sprites.push({b,kind,at:at.clone(),age:0});if(sprites.length>20)sprites.shift();}
function worldPart(b,node){return b.model.getObjectByName(node)?.getWorldPosition(new T.Vector3())||b.model.getWorldPosition(new T.Vector3());}
function applyState(b){
  for(const [name,target] of Object.entries(b.encounter.targets)){
    const part=b.model.getObjectByName(name);part.visible=target.hp>0;
    const state=b.encounter.state(name);part.traverse(o=>{
      if(o.morphTargetInfluences){o.morphTargetInfluences[0]=state==='damaged'?1:0;o.morphTargetInfluences[1]=state==='critical'?1:0;}
      if(o.userData.stateLayer==='wear')o.scale.setScalar(state==='intact'?0:1);
      if(o.userData.stateLayer==='critical')o.scale.setScalar(state==='critical'?1:0);
    });
  }
  const shield=b.model.getObjectByName('shield');if(shield)shield.visible=b.encounter.shieldActive;
  if(b===bosses[selected]){
    $('status').textContent=`${b.spec.nameHe} · ${b.encounter.hp}/${b.encounter.maxHp} · ${b.spec.triangles.toLocaleString('he')} משולשים`;
    if($('target').value)$('state').value=b.encounter.state($('target').value);
  }
}
function processEvents(b){
  for(const e of b.encounter.drainEvents()){
    if(e.type==='entrance'){b.visual='entrance';b.visualAge=0;effect(b,'entrance',worldPart(b,'boss_root'));cue(b,'entrance');}
    else if(e.type==='hit'){cue(b,'hit');say(`פגיעה ב${labels[e.node]} — ${b.encounter.targets[e.node].hp} נקודות נותרו`);}
    else if(e.type==='blocked'){say('המגן פעיל! פוגעים קודם בגנרטור הקדמי');}
    else if(e.type==='shield-down'){say('הגנרטור כובה — הליבה פנויה לפגיעה!');}
    else if(e.type==='explosion'){effect(b,'explosion',worldPart(b,e.node));cue(b,'explosion');}
    else if(e.type==='death'||e.type==='retreat'){b.visual='retreat';b.visualAge=0;effect(b,'retreat',worldPart(b,'boss_root'));cue(b,e.type==='death'?'death':'entrance');say(e.type==='death'?'כל הכבוד! החללית מנופפת וחוזרת הביתה':'נתראה בטיול החלל הבא!');clearThreats(b);}
    else if(e.type==='tell'&&attacking&&b===bosses[selected]){tells.push({b,node:e.node,age:0});say(`מתכונן לירי: ${labels[e.node]} — יש זמן לזוז`);}
    else if(e.type==='shot'&&attacking&&b===bosses[selected]){
      const p=worldPart(b,e.anchor);shots.push({b,p,age:0,v:new T.Vector3(Math.sin(e.angle),0,Math.cos(e.angle)).multiplyScalar(b.spec.attack.projectileSpeedMetersPerSecond)});if(shots.filter(s=>s.b===b).length>12)shots.splice(shots.findIndex(s=>s.b===b),1);
    }
  }
  applyState(b);
}
function clearThreats(b){for(const a of [shots,tells])for(let i=a.length-1;i>=0;i--)if(!b||a[i].b===b)a.splice(i,1);}
function choose(index){
  selected=index;clearThreats();const b=bosses[index];
  document.querySelectorAll('[data-boss]').forEach((el,i)=>el.setAttribute('aria-pressed',String(i===index)));
  $('target').replaceChildren(...b.spec.targets.map(t=>{const o=document.createElement('option');o.value=t.node;o.textContent=labels[t.node];return o;}));
  if(b.spec.id==='cosmic-guardian')$('target').value='generator';
  say(b.spec.subtitleHe);applyState(b);
}
function resize(){const r=area.getBoundingClientRect();width=r.width;height=r.height;renderer.setSize(width,height,false);overlay.width=width*devicePixelRatio;overlay.height=height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);const h=12.8/(width/height);camera.left=-6.4;camera.right=6.4;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();}
function project(v){const p=v.clone().project(camera);return [(p.x*.5+.5)*width,(-p.y*.5+.5)*height];}
function paintOverlay(dt){
  ctx.clearRect(0,0,width,height);
  for(let i=tells.length-1;i>=0;i--){const t=tells[i];t.age+=dt;if(t.age>=t.b.spec.attack.warningSeconds){tells.splice(i,1);continue;}
    const [x,y]=project(worldPart(t.b,t.node));ctx.strokeStyle=t.b.spec.projectile.color;ctx.lineWidth=2;ctx.globalAlpha=.55+.35*t.age/t.b.spec.attack.warningSeconds;ctx.beginPath();ctx.arc(x,y,15+9*t.age,0,Math.PI*2);ctx.stroke();ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(x,y+20);ctx.lineTo(x,y+65);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.age+=dt;s.p.addScaledVector(s.v,dt);const [x,y]=project(s.p);if(s.age>4||y>height+25){shots.splice(i,1);continue;}const im=s.b.images.projectile;ctx.drawImage(im,x-9,y-13,18,26);}
  for(let i=sprites.length-1;i>=0;i--){const s=sprites[i];s.age+=dt;const cfg=s.b.spec.effects[s.kind];const frame=Math.floor(s.age*cfg.fps);if(frame>=6){sprites.splice(i,1);continue;}const [x,y]=project(s.at);ctx.drawImage(s.b.images[s.kind],frame*128,0,128,128,x-46,y-46,92,92);}
}
function animate(now){requestAnimationFrame(animate);const dt=paused?0:Math.max(0,Math.min(.05,(now-last)/1000));last=now;clock+=dt;
  for(const b of bosses){
    b.encounter.update(dt);processEvents(b);b.visualAge+=dt;
    const root=b.model;root.position.set(0,Math.sin(clock*1.7+b.index)*.055,0);root.scale.setScalar(1);root.visible=true;
    if(b.visual==='entrance'){const t=Math.min(1,b.visualAge/1.2),e=1-(1-t)**3;root.position.z=-4*(1-e);root.scale.setScalar(.65+.35*e);if(t===1)b.visual=null;}
    else if(b.visual==='retreat'){const t=Math.min(1,b.visualAge/1.1);root.position.z=-5*t*t;root.position.y=t*1.5;root.scale.setScalar(1-t*.75);if(t===1)root.visible=false;}
    if(b.encounter.status==='gone')root.visible=false;
    if(b.spec.id==='space-crawler')for(let i=0;i<5;i++){const part=root.getObjectByName(`segment_0${i+1}`);part.position.z=b.spec.parts[i].position[2]+Math.sin(clock*1.5-i*.6)*.10;part.rotation.y=Math.cos(clock*1.5-i*.6)*.06;}
  }
  scene.updateMatrixWorld();renderer.render(scene,camera);paintOverlay(dt);
}
try{
  for(const [index,spec] of manifest.bosses.entries()){
    const gltf=await loader.loadAsync(spec.model),group=new T.Group();group.position.set([-4,0,4][index],0,0);group.scale.setScalar([.82,.90,.64][index]);scene.add(group);group.add(gltf.scene);
    const images={};for(const key of ['projectile','explosion','entrance','retreat']){const im=new Image();im.src=key==='projectile'?spec.projectile.path:spec.effects[key].path;await im.decode();images[key]=im;}
    const b={index,spec,model:gltf.scene,group,images,encounter:new BossEncounter(spec),visual:null,visualAge:0};bosses.push(b);
    // Preserve the GLB's root hierarchy and damage clips. Presentation is on a wrapper.
    b.asset=gltf;b.model=gltf.scene.getObjectByName('boss_root');processEvents(b);
    const platform=new T.Mesh(new T.CircleGeometry(1.6,48),new T.MeshBasicMaterial({color:'#739d93',transparent:true,opacity:.08,depthWrite:false}));platform.rotation.x=-Math.PI/2;platform.position.set(group.position.x,-.52,0);scene.add(platform);
  }
  const obs=new ResizeObserver(resize);obs.observe(area);resize();choose(0);$('loading').hidden=true;animate(performance.now());
  document.querySelectorAll('[data-boss]').forEach((el,i)=>el.addEventListener('click',()=>choose(i)));
  $('state').addEventListener('change',()=>{const b=bosses[selected];if(b.encounter.status!=='active'){b.encounter.reset();b.encounter.update(1.2);b.encounter.drainEvents();b.visual=null;}b.encounter.previewState($('state').value);applyState(b);});
  $('target').addEventListener('change',()=>applyState(bosses[selected]));
  $('hit').addEventListener('click',()=>{const b=bosses[selected];b.encounter.hit($('target').value);processEvents(b);});
  $('attack').addEventListener('click',()=>{attacking=!attacking;$('attack').setAttribute('aria-pressed',String(attacking));if(!attacking)clearThreats();else{const b=bosses[selected];b.encounter.time=b.spec.entranceSeconds;b.encounter.cycle=0;b.encounter.next=0;}say(attacking?'טבעת מסמנת מראש מאיזה חלק תצא ההתקפה':'ההתקפה נעצרה');});
  $('entrance').addEventListener('click',()=>{const b=bosses[selected];clearThreats(b);b.encounter.reset();processEvents(b);$('state').value='intact';});
  $('retreat').addEventListener('click',()=>{const b=bosses[selected];b.encounter.retreat();processEvents(b);});
  $('explode').addEventListener('click',()=>{const b=bosses[selected];effect(b,'explosion',worldPart(b,$('target').value));cue(b,'explosion');say('פיצוץ מקטע — שישה פריימים של קוביות רכות וכוכבים');});
  $('pause').addEventListener('click',()=>{paused=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').textContent=paused?'המשך':'עצירה';});
  $('sound').addEventListener('click',()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').textContent=sound?'צליל פעיל':'צליל כבוי';if(sound)cue(bosses[selected],'entrance');else audioVoice?.pause();});
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){paused=true;$('pause').setAttribute('aria-pressed','true');$('pause').textContent='המשך';for(const b of bosses){b.encounter.update(1.2);b.encounter.drainEvents();b.visual=null;}}
  // Inspectable read-only telemetry for package QA; production does not import preview.
  window.bossPreview={manifest,bosses,renderer,scene,camera,choose,snapshot:()=>({selected,paused,attacking,sound,shots:shots.length,tells:tells.length,effects:sprites.length,bosses:bosses.map(b=>({id:b.spec.id,status:b.encounter.status,hp:b.encounter.hp,shield:b.encounter.shieldActive,targets:Object.fromEntries(Object.entries(b.encounter.targets).map(([k,v])=>[k,v.hp]))})),render:renderer.info.render})};
}catch(error){$('loading').textContent=`לא ניתן להציג את הנכסים. פתחו דרך שרת מקומי עם WebGL. ${error.message}`;console.error(error);}
