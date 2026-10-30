import * as T from '../vendor/three.module.js';
import {LocalModels} from './local-models.mjs?v=island-perf-20261030-1';
import {GROUND} from './environment.mjs?v=island-perf-20261030-1';

/** One cosmetic walker. Each instance owns its mixer and cloned skeleton;
 * geometry, materials and clips remain owned by LocalModels. */
export class PilotWalker {
  constructor(root,clip,settings) {
    this.root=root;this.settings=settings;this.mixer=new T.AnimationMixer(root);
    // At Walking frame 2/24 both soles are level (within .0023 model units).
    // The clip's sole height differs from the asset's unanimated Y=0 feet.
    root.children[0].position.y-=settings.stopSoleHeight*settings.walker.scale;
    this.action=this.mixer.clipAction(clip).play();this.wait=0;this.target=1;
    root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    this.hold();
  }
  hold() {
    this.action.time=this.settings.stopTime;this.action.timeScale=0;
    this.mixer.update(0);this.stopped=true;
  }
  setRoute(points) {
    this.points=points.map(p=>p.clone());this.root.position.copy(this.points[0]);
    this.target=1;this.wait=this.settings.pauseSeconds;this.hold();this.face(this.points[1]);
  }
  face(point) {
    // The authored front is +Z, so +X travel is yaw +90 degrees.
    this.root.rotation.y=Math.atan2(point.x-this.root.position.x,point.z-this.root.position.z);
  }
  tick(delta) {
    if(!this.points||delta<=0)return;
    // Consume elapsed time across boundaries so the route behaves identically
    // at slow and fast frame rates, including the complete endpoint pause.
    while(delta>1e-8){
      if(this.wait>0){const step=Math.min(delta,this.wait);this.wait-=step;delta-=step;continue;}
      const point=this.points[this.target],distance=this.root.position.distanceTo(point);
      const step=Math.min(delta,distance/this.settings.speed);
      this.face(point);this.stopped=false;this.action.timeScale=1;
      this.root.position.lerp(point,distance?Math.min(1,step*this.settings.speed/distance):1);
      this.mixer.update(step);delta-=step;
      if(this.root.position.distanceTo(point)<1e-7){
        this.root.position.copy(point);this.target=1-this.target;
        this.wait=this.settings.pauseSeconds;this.hold();
      }
    }
  }
  dispose() {
    this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);
    this.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});
    this.root.removeFromParent();
  }
}

/** Select a free path segment by a house. No simulation/save fields are added,
 * and placement follows the derived network when buildings move or disappear. */
export function pilotSegment(buildings,paths,definition) {
  const house=buildings.find(b=>(b.typeId||b.type)==='house');if(!house)return null;
  const footprint=definition('house')?.footprint||[1,1];
  const center={x:house.x+(footprint[0]-1)/2,z:house.z+(footprint[1]-1)/2};
  const cells=paths.cells.filter(p=>p.neighbors.length).sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z));
  const a=cells[0];if(!a)return null;
  const b=paths.cells[a.neighbors[0]],roadAt=p=>buildings.some(b=>{const type=definition(b.typeId||b.type),[w,d]=type?.footprint||[1,1];return type?.isRoad&&p.x>=b.x&&p.x<b.x+w&&p.z>=b.z&&p.z<b.z+d;});
  return {a,b,house:center,surface:roadAt(a)&&roadAt(b) ? .158 : .018};
}

export class MeshyPilot {
  constructor(scene,settings,adapters={}) {
    this.scene=scene;this.settings=settings;this.models=new LocalModels(adapters);this.disposed=false;
  }
  async load() {
    await Promise.all([this.models.load(this.settings.car),this.models.load(this.settings.walker)]);
    if(this.disposed)return;
    this.car=this.models.create(this.settings.car);
    this.car?.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    if(this.car)this.scene.add(this.car);
    this.walker=this.createWalker();if(this.walker)this.scene.add(this.walker.root);
  }
  createWalker() {
    if(this.disposed)return null;
    const clip=this.models.animations.get(this.settings.walker.path)?.find(c=>c.name==='Walking');
    if(!clip)return null;
    const root=this.models.create(this.settings.walker);
    return root?new PilotWalker(root,clip,this.settings):null;
  }
  sync(buildings,paths,definition,worldPosition) {
    const segment=pilotSegment(buildings,paths,definition);
    if(this.car)this.car.visible=!!segment;
    if(this.walker)this.walker.root.visible=!!segment;
    if(!segment){this.routeKey=null;return;}
    const {a,b,house,surface}=segment,key=JSON.stringify([a.x,a.z,b.x,b.z,house,surface,worldPosition(a.x,a.z).toArray()]);
    if(key===this.routeKey)return;this.routeKey=key;
    const p=worldPosition(a.x,a.z),q=worldPosition(b.x,b.z),dx=q.x-p.x,dz=q.z-p.z;
    // Match the existing procedural road/path top; the sidewalk follows its edge.
    p.y=q.y=GROUND+surface;
    if(this.car){this.car.position.copy(p).lerp(q,.5);this.car.rotation.y=Math.atan2(-dx,-dz);}
    const sign=(house.x-a.x)*(-dz)+(house.z-a.z)*dx>=0?1:-1;
    const offset=new T.Vector3(-dz,0,dx).multiplyScalar(sign*this.settings.sidewalkOffset);
    p.add(offset);q.add(offset);this.walker?.setRoute([p,q]);
  }
  tick(delta){if(this.walker?.root.visible)this.walker.tick(delta);}
  metrics(){return {carLoaded:!!this.car,walkerLoaded:!!this.walker,carVisible:!!this.car?.visible,walkerVisible:!!this.walker?.root.visible,stopped:this.walker?.stopped??null,position:this.walker?.root.position.toArray(),models:this.models.metrics()};}
  dispose(){if(this.disposed)return;this.disposed=true;this.walker?.dispose();this.car?.removeFromParent();this.models.dispose();}
}
