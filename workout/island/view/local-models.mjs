import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import * as SkeletonUtils from './skeleton-utils.mjs?v=island-v2-20261107-12';
import {localModelURL,modelSpec,disposeObject} from '../minigames/model-art.mjs?v=island-v2-20261107-12';

/** Local GLBs share geometry, materials and clips across instances. Clones get
 * independent skeletons; callers own their mixers and skeleton disposal. The
 * cache releases shared resources once, including loads after view closure. */
export class LocalModels {
  constructor(adapters={}) {
    this.assets=new Map();this.animations=new Map();this.pending=new Map();this.failed=0;this.disposed=false;
    const root=new URL('../',import.meta.url),manager=new T.LoadingManager();
    manager.setURLModifier(path=>{if(path.startsWith('blob:')||path.startsWith('data:'))return path;const url=new URL(path,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('local model resources only');return url.href;});
    this.loader=adapters.loader||new GLTFLoader(manager);
  }
  load(value) {
    const spec=modelSpec(value),url=spec&&localModelURL(spec.path);
    if(!url||this.disposed)return Promise.resolve(false);
    if(!this.pending.has(spec.path))this.pending.set(spec.path,(async()=>{
      try{const gltf=await this.loader.loadAsync(url.href),object=gltf.scene;if(this.disposed){disposeObject(object);return false;}this.assets.set(spec.path,object);this.animations.set(spec.path,gltf.animations||[]);return true;}
      catch{this.failed++;return spec.fallback?this.load(spec.fallback):false;}
    })());
    return this.pending.get(spec.path);
  }
  /** `spec.fit` sizes a model from its own bounds; an explicit `fit` argument wins.
   * `spec.fallback` is the older model used when this one could not be loaded. */
  create(value,fit={}) {
    const spec=modelSpec(value),source=spec&&this.assets.get(spec.path);
    if(this.disposed)return null;
    if(!source)return spec?.fallback?this.create(spec.fallback,fit):null;
    return fitModel(SkeletonUtils.clone(source),spec,Object.keys(fit).length?fit:spec.fit||{});
  }
  has(value){const spec=modelSpec(value);return Boolean(spec&&(this.assets.has(spec.path)||(spec.fallback&&this.has(spec.fallback))));}
  metrics(){return {requested:this.pending.size,loaded:this.assets.size,failed:this.failed};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const object of this.assets.values())disposeObject(object);this.assets.clear();this.animations.clear();}
}

/** Keep the authored proportions, center X/Z, and put the lowest vertex at Y=0.
 * A supplied dimension fits that axis; scale then applies a relative art size. */
export function fitModel(object,spec,fit={}) {
  const root=new T.Group();root.add(object);object.rotation.y=T.MathUtils.degToRad(spec.rotationY);object.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const box=fit.box,limits=box?[box.length&&box.length/Math.max(size.x,size.z,.001),box.w&&box.w/Math.max(size.x,.001),box.d&&box.d/Math.max(size.z,.001),box.h&&box.h/Math.max(size.y,.001)].filter(v=>v>0&&Number.isFinite(v)):[];
  const factor=limits.length?Math.min(...limits):fit.width?fit.width/Math.max(size.x,.001):fit.height?fit.height/Math.max(size.y,.001):fit.length?fit.length/Math.max(size.x,size.z,.001):1;
  const scale=factor*spec.scale;object.scale.multiplyScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  root.userData.modelPath=spec.path;return root;
}
