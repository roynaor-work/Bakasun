import * as T from '../vendor/three.module.js';
import {Citizens as PrimitiveCitizens} from './avatar.mjs?v=island-naval-aim-20261027-1';
import {LocalModels} from './local-models.mjs?v=island-naval-aim-20261027-1';

const MODELS=Object.freeze([
  Object.freeze({path:'assets/models/adult-man-rigged-512.glb',rotationY:0,scale:.32}),
  Object.freeze({path:'assets/models/adult-woman-rigged-512.glb',rotationY:0,scale:.32})
]);
const LIMITS={high:12,low:4},SOLE_FRAME=2/24;

function releaseWalker(walker) {
  walker.mixer.stopAllAction();walker.mixer.uncacheRoot(walker.root);
  const skeletons=new Set();walker.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
  for(const skeleton of skeletons)skeleton.dispose();
  walker.root.removeFromParent();
}

/** Cosmetic city life: the existing connected sidewalk routing, with the two
 * original animated GLBs. Each walker owns its skeleton and mixer; original
 * geometry, materials, textures and animation clips belong to LocalModels.
 * Primitive citizens remain visible only while no Walking rig is available. */
export class Citizens extends PrimitiveCitizens {
  constructor(scene,max=12,options={}) {
    super(scene,Math.max(0,Math.min(LIMITS.high,Number.isFinite(max)?Math.floor(max):12)));
    this.enabled=options.enabled!==false;this.quality=options.quality==='low'?'low':'high';
    this.models=options.models||new LocalModels(options);this.ownsModels=!options.models;
    this.visuals=[];this.available=[];this.soleOffsets=new Map();this.requestedCount=0;this.disposed=false;
    this.root.visible=this.enabled;
    this.ready=this.enabled?Promise.all(MODELS.map(spec=>this.models.load(spec))).then(()=>{
      if(this.disposed)return false;
      this.available=MODELS.filter(spec=>this.models.animations.get(spec.path)?.some(clip=>clip.name==='Walking'));
      this.rebuildVisuals();return this.available.length>0;
    }):Promise.resolve(false);
  }
  setPoints(points=[],count=0) {
    if(this.disposed)return;
    this.requestedCount=Number.isFinite(count)?Math.max(0,Math.floor(count)):0;
    this.clearVisuals();
    super.setPoints(points,this.enabled?Math.min(this.requestedCount,LIMITS[this.quality]):0);
    this.rebuildVisuals();
  }
  setQuality(quality) {
    quality=quality==='low'?'low':'high';if(this.disposed||quality===this.quality)return;
    this.quality=quality;if(this.points)this.setPoints(this.points,this.requestedCount);
  }
  createWalker(spec,index) {
    const root=this.models.create(spec),clip=this.models.animations.get(spec.path)?.find(c=>c.name==='Walking');
    if(!root||!clip)return null;
    const mixer=new T.AnimationMixer(root),action=mixer.clipAction(clip).play();
    // Ground the authored Walking pose once per model, using deformed mesh
    // bounds. This changes only the clone's placement, never the source mesh.
    if(!this.soleOffsets.has(spec.path)){
      action.time=SOLE_FRAME;mixer.update(0);root.updateMatrixWorld(true);
      root.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});
      this.soleOffsets.set(spec.path,new T.Box3().setFromObject(root).min.y);
    }
    root.children[0].position.y-=this.soleOffsets.get(spec.path);
    action.time=(index*.173)%Math.max(clip.duration,.001);mixer.update(0);
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return {root,mixer,action};
  }
  rebuildVisuals() {
    if(this.disposed)return;this.clearVisuals();
    if(this.available.length)for(let i=0;i<this.people.length;i++){
      const walker=this.createWalker(this.available[i%this.available.length],i);
      if(!walker)break;this.visuals.push(walker);this.root.add(walker.root);this.positionWalker(walker,this.people[i],1);
    }
    // A cache closed by its owner cannot leave a partly invisible population.
    if(this.visuals.length!==this.people.length)this.clearVisuals();
    for(const mesh of this.meshes)mesh.visible=this.visuals.length===0;
  }
  positionWalker(walker,person,turn) {
    walker.root.position.set(person.x,person.y,person.z);
    const target=this.points?.[person.target];if(!target)return;
    const angle=Math.atan2(target.x-person.x,target.z-person.z),yaw=walker.root.rotation.y;
    walker.root.rotation.y+=Math.atan2(Math.sin(angle-yaw),Math.cos(angle-yaw))*turn;
  }
  tick(delta,time=0) {
    if(this.disposed||!this.enabled||!Number.isFinite(delta)||delta<=0)return;
    super.tick(delta,time);
    for(let i=0;i<this.visuals.length;i++){
      const walker=this.visuals[i],person=this.people[i];this.positionWalker(walker,person,Math.min(1,delta*8));
      walker.mixer.update(delta*person.speed/.34);
    }
  }
  clearVisuals(){for(const walker of this.visuals)releaseWalker(walker);this.visuals.length=0;}
  metrics(){return {enabled:this.enabled,quality:this.quality,count:this.people.length,animated:this.visuals.length,fallback:this.visuals.length===0&&this.people.length>0,models:this.available.map(spec=>spec.path)};}
  dispose() {
    if(this.disposed)return;this.disposed=true;this.clearVisuals();
    // Legacy primitive materials are shared by the environment, so only the
    // instance buffers and their private geometry are released here.
    for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();}
    this.people.length=0;this.root.clear();this.root.removeFromParent();
    if(this.ownsModels)this.models.dispose();
  }
}

export {Citizens as CityCitizens};
