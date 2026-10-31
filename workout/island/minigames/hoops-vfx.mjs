/** Basketball presentation only: two bounded atlas sprites and the authored dunk camera.
 * The flame accents an existing dunk animation; it never creates a hot-ball gameplay rule.
 * Recorded snapshots, scoring, physics and rewards remain owned by the engine.
 */
import * as THREE from '../vendor/three.module.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=u=>(u=clamp(u,0,1))*u*(3-2*u);
export const smootherstep=u=>(u=clamp(u,0,1))*u*u*(u*(u*6-15)+10);
const hermite=(a,b,ma,mb,u,d)=>{const u2=u*u,u3=u2*u;return (2*u3-3*u2+1)*a+(u3-2*u2+u)*d*ma+(-2*u3+3*u2)*b+(u3-u2)*d*mb;};

/** Path elapsed excludes entry/exit. Pass an output object to reuse its arrays each frame.
 * Local +Z faces into the court; the anchor is the ground below the selected rim.
 */
export function sampleDunkCamera(track,seconds,side,rimX,out={position:[0,0,0],target:[0,0,0],fov:0}){
 const t=track.pathDurationSeconds*smootherstep(seconds/track.pathDurationSeconds),points=track.points;
 let i=0;while(i<points.length-2&&points[i+1].time<t)i++;
 const a=points[i],b=points[i+1],d=b.time-a.time,u=clamp((t-a.time)/d,0,1),s=side<0?-1:1;
 for(let c=0;c<2;c++){
  const channel=c===0?'position':'target';
  const target=out[channel];
  const x=hermite(a[channel][0],b[channel][0],a[channel+'Tangent'][0],b[channel+'Tangent'][0],u,d);
  const y=hermite(a[channel][1],b[channel][1],a[channel+'Tangent'][1],b[channel+'Tangent'][1],u,d);
  const z=hermite(a[channel][2],b[channel][2],a[channel+'Tangent'][2],b[channel+'Tangent'][2],u,d);
  target[0]=s*rimX-s*z;target[1]=y;target[2]=s*x;
 }
 out.fov=hermite(a.fov,b.fov,a.fovTangent,b.fovTangent,u,d);
 return out;
}

function winner(snapshot){
 if(!snapshot?.players)return null;
 let first=null;for(const p of snapshot.players){if(p.controlled)return p;if(p.team===0&&!first)first=p;}return first;
}

function opacityAt(data,time){
 const keys=data.opacityEnvelope;let i=0;while(i<keys.length-2&&keys[i+1].time<time)i++;
 const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];
 if(a===b)return a.opacity;
 const u=smooth((time-a.time)/(b.time-a.time));return a.opacity+(b.opacity-a.opacity)*u;
}

async function atlas(scene,base,id){
 const url=new URL('design/vfx/atlases/'+id+'.json',base),response=await fetch(url);
 if(!response.ok)throw Error('Basketball VFX metadata: '+response.status);
 const data=await response.json(),texture=await new THREE.TextureLoader().loadAsync(new URL(data.image,url).href);
 texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
 texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
  blending:data.blendMode==='additive'?THREE.AdditiveBlending:THREE.NormalBlending});
 const sprite=new THREE.Sprite(material);sprite.name='hoops-vfx-'+id;sprite.visible=false;sprite.renderOrder=3;scene.add(sprite);
 return {data,texture,material,sprite,age:0,fade:0,frame:-1,active:false};
}

/** Assets are local and loaded before play. No particles, lights, shadows or post-processing.
 * update must be called only while the session clock runs (same pause policy as the view).
 */
export async function createHoopsVfx(scene,assetBase,{quality=2,court,reducedMotion}={}){
 const media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 let reduced=reducedMotion??!!media?.matches,disposed=false,firePlayer=null,fireOn=false,confettiPending=false;
 const changed=e=>{if(reducedMotion===undefined)reduced=e.matches;};
 const trackURL=new URL('design/vfx/cameras/dunk-replay.json',assetBase);
 const loaded=await Promise.allSettled([atlas(scene,assetBase,'burning-ball-glow'),atlas(scene,assetBase,'confetti'),fetch(trackURL).then(r=>{if(!r.ok)throw Error('Basketball camera metadata: '+r.status);return r.json();}),atlas(scene,assetBase,'net-spark'),atlas(scene,assetBase,'landing-dust'),atlas(scene,assetBase,'speed-lines')]);
 const failed=loaded.find(r=>r.status==='rejected');
 if(failed){for(const i of [0,1,3,4,5])if(loaded[i].status==='fulfilled'){const a=loaded[i].value;scene.remove(a.sprite);a.material.dispose();a.texture.dispose();}throw failed.reason;}
 const [fire,confetti,cameraTrack,spark,dust,lines]=loaded.map(r=>r.value),items=[fire,confetti,spark,dust,lines];media?.addEventListener?.('change',changed);
 const extras=new Map([['net-spark',spark],['landing-dust',dust],['speed-lines',lines]]);
 for(const item of items){item.resident=false;item.priority=item===lines?0:item===confetti?5:3;}
 const right=new THREE.Vector3(),up=new THREE.Vector3();
 const direction=new THREE.Vector3(),offset=new THREE.Vector3(),position=new THREE.Vector3();
 const pathOutput={position:[0,0,0],target:[0,0,0],fov:0};
 let confettiX=0,confettiY=1.8,confettiZ=0;
 function effects(events,snapshot){
  if(disposed)return;
  for(const e of events){
   if(e.type==='shotStart'&&e.shotType==='dunk'){
    firePlayer=e.playerId;fireOn=true;fire.age=0;fire.active=true;
   }
   if(e.type==='score'||e.type==='miss'||e.type==='final'||e.type==='outOfBounds'||e.type==='inbound'||e.type==='foul')fireOn=false;
   if(e.type==='final'&&e.won===true){
    confettiPending=true;confetti.age=0;confetti.active=true;
    const p=winner(snapshot);
    if(p){confettiX=p.x;confettiY=p.y+1.8;confettiZ=p.z;confettiPending=false;}
   }
  }
 }
 function frame(item){
  const {data,texture}=item;
  const index=data.loop?Math.floor(item.age*data.fps)%data.frameCount:Math.min(data.frameCount-1,Math.floor(item.age*data.fps));
  if(index===item.frame)return;item.frame=index;
  const inset=data.sampling.uvInsetPixels,aw=data.atlasSize.width,ah=data.atlasSize.height,fw=data.frameSize.width,fh=data.frameSize.height;
  texture.repeat.set((fw-2*inset)/aw,(fh-2*inset)/ah);
  texture.offset.set(((index%data.columns)*fw+inset)/aw,((data.rows-1-Math.floor(index/data.columns))*fh+inset)/ah);
 }
 function size(item,camera,desired,fractionOverride=Infinity){
  // Cap the complete sprite rectangle, including transparent margins, in screen area.
  camera.getWorldDirection(direction);offset.copy(item.sprite.position).sub(camera.position);
  const depth=Math.max(.01,offset.dot(direction)),fraction=Math.min(fractionOverride,item.data.lowEnd.maxScreenFractionPerInstance);
  const maxSize=2*depth*Math.tan(camera.fov*Math.PI/360)*Math.sqrt(fraction*Math.max(.01,camera.aspect));
  item.sprite.scale.setScalar(Math.min(desired,maxSize));
 }
 function update(dt,{ball,camera,snapshot,replaying=false}){
  if(disposed)return;
  dt=clamp(dt,0,.1);
  // Replays do not replay live event triggers. An unfinished live flame is hidden until return.
  if(fireOn&&snapshot&&firePlayer){
   let p=null;for(const candidate of snapshot.players||[])if(candidate.id===firePlayer){p=candidate;break;}
   if(!p||p.act!=='shoot'||p.shotType!=='dunk')fireOn=false;
  }
  const target=fireOn&&!replaying&&!reduced?1:0;
  fire.fade=clamp(fire.fade+(target?1:-1)*dt/.12,0,1);
  fire.sprite.visible=!!ball?.visible&&fire.fade>0;
  if(fire.sprite.visible){
   fire.age+=dt;ball.getWorldPosition(position);fire.sprite.position.copy(position);
   frame(fire);fire.material.opacity=fire.fade*opacityAt(fire.data,fire.age%fire.data.durationSeconds);
   size(fire,camera,quality>=1?court.ballR*7:court.ballR*5);
  }
  if(confettiPending&&snapshot){
   const p=winner(snapshot);
   if(p){confettiX=p.x;confettiY=p.y+1.8;confettiZ=p.z;confettiPending=false;}
  }
  confetti.sprite.visible=confetti.active&&!reduced&&!replaying;
  if(confetti.sprite.visible){
   confetti.age+=dt;confetti.sprite.position.set(confettiX,confettiY,confettiZ);
   frame(confetti);confetti.material.opacity=opacityAt(confetti.data,Math.min(confetti.age,confetti.data.durationSeconds));
   size(confetti,camera,3.4);
   if(confetti.age>=confetti.data.durationSeconds){confetti.active=false;confetti.sprite.visible=false;}
  }else if(reduced)confetti.active=false;
  for(const item of extras.values()){
   item.sprite.visible=item.active&&!reduced&&!replaying;
   if(!item.sprite.visible)continue;
   item.age+=dt;frame(item);item.material.opacity=(item.opacity??1)*opacityAt(item.data,Math.min(item.age,item.data.durationSeconds));
   if(item===lines){camera.updateMatrixWorld();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);camera.getWorldDirection(direction);const half=3*Math.tan(camera.fov*Math.PI/360);item.sprite.position.copy(camera.position).addScaledVector(direction,3).addScaledVector(right,half*camera.aspect*.86).addScaledVector(up,half*.12);}
   size(item,camera,item===spark?1.05:item===dust?1.4:4,item.fraction);if(item.age>=Math.min(item.data.durationSeconds,(item.burstMs??Infinity)/1000)){item.active=false;item.sprite.visible=false;}
  }
  // At most three atlas textures are resident on the GPU. Inactive maps retain
  // their decoded source image, and re-upload only if a later event needs them.
  const visible=items.filter(i=>i.sprite.visible).sort((a,b)=>b.priority-a.priority);
  for(const item of visible.slice(3))item.sprite.visible=false;
  for(const item of items){if(item.sprite.visible){if(!item.resident)item.texture.needsUpdate=true;item.resident=true;}else if(item.resident){item.texture.dispose();item.resident=false;}}
 }
 function trigger(cue,event,snapshot){const item=extras.get(cue.asset);if(!item||disposed||reduced)return false;item.active=true;item.age=0;item.frame=-1;item.opacity=cue.opacity??1;item.fraction=cue.screen_fraction??Infinity;item.burstMs=cue.burst_ms;
  if(item===spark){const side=snapshot?.dir?.[event?.team??0]??1;item.sprite.position.set(side*court.rimX,court.rimY,0);}
  else if(item===dust){const p=snapshot?.players?.find(p=>p.id===event?.playerId);item.sprite.position.set(p?.x??0,.06,p?.z??0);}return true;}
 function dispose(){
  if(disposed)return;disposed=true;media?.removeEventListener?.('change',changed);
  for(const item of items){scene.remove(item.sprite);item.material.dispose();item.texture.dispose();}
 }
 return {effects,update,trigger,dispose,cameraTrack,
  sampleDunkCamera(seconds,side,out=pathOutput){return sampleDunkCamera(cameraTrack,seconds,side,court.rimX,out);},
  get reducedMotion(){return reduced;},
  get celebrationSeconds(){return confetti.data.durationSeconds;},
  metrics(){return {sprites:items.filter(i=>i.sprite.visible).length,residentAtlases:items.filter(i=>i.resident).length,loadedAtlases:items.length,reducedMotion:reduced};}};
}
