/** Contact sheets and motion checks for the soccer-v7 clips the game plays (dev tool, not shipped logic).
 * ?view=side|front. window.__frames.sheet(clip,group) renders 8 evenly spaced poses of one clip into #sheet and
 * returns its measurements; window.__frames.measure(clip,group) returns them without drawing.
 * Measurements per clip (dense sampling at 30 Hz, metres): lowest skinned vertex over the clip (floor penetration
 * if negative), lowest vertex while both boots should be down (stance float), hips jump between samples, and for
 * locomotion the planted-foot speed against the clip's own stride (foot slide). */
import * as T from '../vendor/three.module.js';
import {loadDesignCharacters,soccerFloorCandidates} from '../minigames/soccer-design-character.mjs';

const q=new URLSearchParams(location.search),view=q.get('view')||'side';
const renderer=new T.WebGLRenderer({canvas:document.getElementById('gl'),antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,420,false);
const scene=new T.Scene();scene.background=new T.Color(0x93a8b8);
scene.add(new T.HemisphereLight(0xffffff,0x4b5d4b,1.5));const sun=new T.DirectionalLight(0xfff0d6,2.2);sun.position.set(3,6,5);scene.add(sun);
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:0x3d7a3d}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const config=(await (await fetch('../data/config.json')).json()).minigames.soccer;
const full={...config,team:{colors:['#1a6','#fff']},opponent:{colors:['#e62','#111']}};
const roster=group=>Array.from({length:8},(_,i)=>({role:group==='keeper'?'keeper':'field',team:i%2}));
const sets={field:await loadDesignCharacters({config:full,roster:roster('field'),scene}),keeper:await loadDesignCharacters({config:full,roster:roster('keeper'),scene})};
for(const set of Object.values(sets))for(const c of set.characters)c.setLod(0);
const SPACING=1.25;
const place=group=>{for(const [g,set] of Object.entries(sets))set.characters.forEach((c,i)=>{c.pivot.visible=g===group;const o=(i-3.5)*SPACING;view==='side'?c.pivot.position.set(0,0,o):c.pivot.position.set(o,0,0);c.pivot.rotation.set(0,view==='side'?0:0,0);});};
const camera=new T.PerspectiveCamera(45,1600/420,.1,60);
if(view==='side'){camera.position.set(3.4,1.15,0);camera.lookAt(0,1.0,0);}else{camera.position.set(0,1.15,3.4);camera.lookAt(0,1.0,0);}
const point=new T.Vector3();
const lowest=(c)=>{let low=Infinity;c.root.updateMatrixWorld(true);c.root.traverse(o=>{if(!o.isSkinnedMesh||!o.visible)return;o.skeleton.update();const cand=soccerFloorCandidates(o);for(const i of cand){o.getVertexPosition(i,point).applyMatrix4(o.matrixWorld);low=Math.min(low,point.y);}});return low;};
const pose=(c,clip,t)=>{const m=c.motion;for(const a of Object.values(m.actions)){a.stop();}const a=m.actions[clip];if(!a)throw Error('no clip '+clip);a.reset();a.setEffectiveWeight(1).setEffectiveTimeScale(0);a.play();a.time=t;c.mixer.update(0);c.root.updateMatrixWorld(true);return a;};
const bone=(c,name)=>c.root.getObjectByName(name);
function measure(clip,group='field'){
  const c=sets[group].characters[0],a=c.motion.actions[clip],duration=a.getClip().duration,n=Math.max(2,Math.round(duration*30)),rows=[];
  c.pivot.position.set(0,0,0);
  for(let i=0;i<=n;i++){
    const t=Math.min(duration,i/n*duration);pose(c,clip,t);
    const lf=new T.Vector3(),rf=new T.Vector3();bone(c,'LeftFoot').getWorldPosition(lf);bone(c,'RightFoot').getWorldPosition(rf);
    const hips=new T.Vector3();bone(c,'Hips').getWorldPosition(hips);
    rows.push({t,low:lowest(c),hipsY:hips.y,lf:lf.toArray(),rf:rf.toArray()});
  }
  const lowMin=Math.min(...rows.map(r=>r.low));
  let jump=0;for(let i=1;i<rows.length;i++)jump=Math.max(jump,Math.abs(rows[i].hipsY-rows[i-1].hipsY));
  const out={clip,duration,samples:rows.length,lowestVertexM:+lowMin.toFixed(4),maxHipsStepM:+jump.toFixed(4),clipEndGapM:+(Math.abs(rows.at(-1).hipsY-rows[0].hipsY)).toFixed(4)};
  const data=c.motion.actions[clip];
  // Stance float: samples where the lowest vertex is the boot (any grounded clip) should touch the floor in the contact windows.
  const floats=rows.filter(r=>r.low>.03);out.floatingSamples=floats.length;out.maxFloatM=+Math.max(0,...rows.map(r=>r.low)).toFixed(3);
  return out;
}
function footSlide(clip,speed,group='field'){
  // Treadmill clips: the planted foot should travel backwards at the clip speed; measure its forward speed (z) per sample while it is the lower boot.
  const c=sets[group].characters[0],a=c.motion.actions[clip],duration=a.getClip().duration,n=Math.round(duration*30),speeds=[];
  let prev=null;
  for(let i=0;i<=n;i++){
    const t=i/n*duration;pose(c,clip,t);
    const lf=new T.Vector3(),rf=new T.Vector3();bone(c,'LeftFoot').getWorldPosition(lf);bone(c,'RightFoot').getWorldPosition(rf);
    const planted=lf.y<rf.y?lf:rf,key=lf.y<rf.y?'l':'r';
    if(prev&&prev.key===key&&Math.min(lf.y,rf.y)<.14)speeds.push(-(planted.z-prev.z)/(duration/n));
    prev={key,z:planted.z};
  }
  const mean=speeds.reduce((s,v)=>s+v,0)/(speeds.length||1),dev=Math.max(0,...speeds.map(v=>Math.abs(v-speed)));
  return {clip,expectedMps:speed,plantedFootMps:+mean.toFixed(2),maxDeviationMps:+dev.toFixed(2),plantedSamples:speeds.length};
}
function sheet(clip,group='field'){
  place(group);const c0=sets[group].characters;const a=c0[0].motion.actions[clip];if(!a)throw Error('no clip '+clip);
  const duration=a.getClip().duration;
  c0.forEach((c,i)=>{pose(c,clip,i/7*duration*.999);});
  renderer.render(scene,camera);
  const ctx=document.getElementById('sheet').getContext('2d');ctx.drawImage(document.getElementById('gl'),0,0);
  ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${clip}  ${duration.toFixed(2)}s  ${view}`,8,18);
  return document.getElementById('sheet').toDataURL('image/png');
}
window.__frames={sheet,measure,footSlide,clips:()=>({field:Object.keys(sets.field.characters[0].motion.actions),keeper:Object.keys(sets.keeper.characters[0].motion.actions)})};
window.__ready=true;
