/* CC0 original preview. Existing Three.js loaders (MIT) and v7 display asset are referenced, never copied. */
import * as THREE from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/GLTFLoader.js';
import {DRACOLoader} from '../../vendor/DRACOLoader.js';
const $=id=>document.getElementById(id), stage=$('stage');
const state={ready:false,clip:null,time:0,playing:true,speed:1,view:'three',error:null};
window.__alpine={ready:false,state};
try{
  const renderer=new THREE.WebGLRenderer({canvas:$('canvas'),antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#132338');scene.fog=new THREE.Fog('#132338',7,17);
  const camera=new THREE.PerspectiveCamera(37,1,.01,40);
  scene.add(new THREE.HemisphereLight(0xc5e7ff,0x4b5361,2.1));
  const key=new THREE.DirectionalLight(0xffecce,3.2);key.position.set(2,4,3);scene.add(key);
  const rim=new THREE.DirectionalLight(0x72c6ff,2);rim.position.set(-3,2,-2);scene.add(rim);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xbfcfd7,roughness:.95,metalness:0}));ground.rotation.x=-Math.PI/2;ground.position.y=-.008;scene.add(ground);
  const grid=new THREE.GridHelper(6,24,0x657e8b,0xa3b5bd);grid.position.y=-.006;grid.material.opacity=.25;grid.material.transparent=true;scene.add(grid);
  const draco=new DRACOLoader().setDecoderPath('../../vendor/draco/').setWorkerLimit(1);
  const loader=new GLTFLoader().setDRACOLoader(draco);
  const [model,motion,catalog]=await Promise.all([loader.loadAsync('../alpine-v7/characters/ski-male.glb'),loader.loadAsync('clips.glb'),fetch('catalog.json').then(r=>{if(!r.ok)throw Error(`catalog.json: ${r.status}`);return r.json();})]);
  const actor=model.scene;scene.add(actor);
  actor.traverse(o=>{if(o.isMesh){o.frustumCulled=false;if(o.material){o.material.depthWrite=true;}}});
  const skeleton=new THREE.SkeletonHelper(actor);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.8;skeleton.visible=false;skeleton.renderOrder=10;scene.add(skeleton);
  const mixer=new THREE.AnimationMixer(actor), clips=motion.animations;
  if(clips.length!==7)throw Error(`צפויים שבעה קליפים, נמצאו ${clips.length}`);
  const entries=Array.isArray(catalog.clips)?catalog.clips:Object.values(catalog.clips||{});
  const meta=name=>entries.find(c=>(c.name||c.id)===name)||{};
  const labels={snowplow:'מחרשה · בלימה',snowplow_brake:'מחרשה · בלימה',brake_wedge:'מחרשה · בלימה',landing:'נחיתה',land:'נחיתה',trick_180:'סיבוב 180° באוויר',air_180:'סיבוב 180° באוויר',trick_360:'סיבוב 360° באוויר',air_360:'סיבוב 360° באוויר',trick_landing:'נחיתה אחרי טריק',land_trick:'נחיתה אחרי טריק',fall:'נפילה',get_up:'קימה',getup:'קימה'};
  const label=name=>meta(name).label||labels[name]||name;
  $('clip').replaceChildren(...clips.map(c=>{const option=document.createElement('option');option.value=c.name;option.textContent=label(c.name);return option;}));
  let action,clip;
  const view=(name='three')=>{
    state.view=name;
    const positions={front:[0,1.05,4.0],side:[4,1.05,0],three:[2.7,1.25,3.15]};
    camera.position.fromArray(positions[name]||positions.three);camera.lookAt(0,.74,0);
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
    render();
  };
  const readout=()=>{
    $('scrub').value=state.time;
    $('readout').textContent=`${state.time.toFixed(2)} / ${clip.duration.toFixed(2)} s · ${Math.round(state.time*30)} / ${Math.round(clip.duration*30)}`;
  };
  const render=()=>{scene.updateMatrixWorld(true);renderer.render(scene,camera);};
  const sample=time=>{
    state.time=THREE.MathUtils.clamp(time,0,clip.duration);
    action.time=state.time;action.paused=true;action.enabled=true;action.setEffectiveWeight(1);mixer.update(0);
    readout();render();
  };
  const choose=name=>{
    clip=clips.find(c=>c.name===name);if(!clip)throw Error(`Unknown clip: ${name}`);
    mixer.stopAllAction();action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();action.paused=true;
    state.clip=name;state.time=0;$('clip').value=name;$('scrub').max=clip.duration;
    const m=meta(name),loop=m.loop===true;
    $('details').textContent=`${label(name)} · ${loop?'לולאה':'פעם אחת'} · ${clip.duration.toFixed(2)} שנ׳`;
    sample(0);
  };
  const seek=(name,time=0)=>{state.playing=false;$('play').textContent='ניגון';if(state.clip!==name)choose(name);sample(time);return {...state};};
  $('clip').onchange=()=>choose($('clip').value);
  $('play').onclick=()=>{state.playing=!state.playing;if(state.playing&&state.time>=clip.duration)sample(0);$('play').textContent=state.playing?'השהיה':'ניגון';};
  $('speed').onchange=()=>state.speed=Number($('speed').value);
  $('scrub').oninput=()=>seek(state.clip,Number($('scrub').value));
  $('bones').onchange=()=>{skeleton.visible=$('bones').checked;render();};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
  const resize=()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();};
  new ResizeObserver(resize).observe(stage);
  choose(clips[0].name);view('three');resize();
  state.ready=true;window.__alpine={ready:true,state,seek,render,view,actor,scene,camera,renderer,mixer,clips,catalog,skeleton};
  $('clip').disabled=$('play').disabled=$('scrub').disabled=false;stage.setAttribute('aria-busy','false');
  $('status').textContent='הגוף והציוד הקיימים מ־v7 נטענים לצפייה בלבד. החבילה מכילה תנועה.';
  let previous=performance.now(),accumulator=0;
  const tick=now=>{
    requestAnimationFrame(tick);accumulator+=(now-previous)/1000;previous=now;
    if(accumulator<1/30)return;const dt=Math.min(accumulator,.1);accumulator=0;
    if(state.playing){let t=state.time+dt*state.speed;
      if(t>=clip.duration){if(meta(clip.name).loop===true)t%=clip.duration;else{t=clip.duration;state.playing=false;$('play').textContent='ניגון';}}
      sample(t);
    }
  };requestAnimationFrame(tick);draco.dispose();
}catch(error){state.error=String(error);$('status').textContent=`לא ניתן לטעון את התצוגה: ${error.message}. יש לפתוח דרך שרת HTTP משורש הריפו.`;console.error(error);}
