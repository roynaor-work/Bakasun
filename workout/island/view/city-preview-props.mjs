import * as T from '../vendor/three.module.js';
import {CITY_DIR,LOD_DIR} from './city-models.mjs?v=island-v2-20261107-6';

/** Model-only extras for the full-city preview, taken from the 58 city models: downtown towers, mall, hotel, cinema,
 * trees, bushes, rocks, traffic lights and a small bridge. They own no game state. Trees, rocks and lights are instanced. */
export const PROP_FILES=Object.freeze({13:'13-shopping-mall',14:'14-office-6-floors',15:'15-glass-skyscraper',16:'16-hotel',38:'38-cinema',41:'41-pine-tree',42:'42-round-leafy-tree',44:'44-bush',45:'45-rock-cluster',53:'53-small-bridge',55:'55-traffic-light'});
/** Instanced props: model id -> height in tiles (1 tile = 6.4 m). */
const TREE_HEIGHT={41:1.7,42:1.4,44:.28,45:.5,55:.85};

export class PreviewProps{
  constructor(view){this.view=view;this.group=new T.Group();this.group.name='City preview props';view.scene.add(this.group);this.token=0;this.disposed=false;}
  spec(id,lod){return {path:(lod?LOD_DIR:CITY_DIR)+PROP_FILES[id]+'.glb',rotationY:0,scale:1};}
  /** Replaces what is on the ground: plan = previewPlan(); lod picks the light copies. */
  async show(plan,{lod=false,half=false}={}){
    const token=++this.token,view=this.view,ids=[...new Set([...plan.props,...plan.trees,...plan.rocks,...plan.lights,plan.bridge].map(p=>p.model))];
    await Promise.all(ids.map(id=>view.models.load(this.spec(id,lod))));
    if(this.disposed||token!==this.token)return;
    this.clear();
    const offset=(view.size-1)/2;
    for(const p of [...plan.props,plan.bridge]){
      const object=view.models.create(this.spec(p.model,lod),{box:{w:p.w*.9,d:p.d*.9,h:p.h}});if(!object)continue;
      object.position.set(p.x+(p.w-1)/2-offset,view.worldPosition(0,0).y,p.z+(p.d-1)/2-offset);object.rotation.y=p.rot||0;this.mark(object,!lod);this.group.add(object);
    }
    const sets=new Map();
    for(const p of [...plan.trees.filter((_,i)=>!half||i%2===0),...plan.rocks,...plan.lights]){if(!sets.has(p.model))sets.set(p.model,[]);sets.get(p.model).push(p);}
    const dummy=new T.Object3D(),matrix=new T.Matrix4(),y=view.worldPosition(0,0).y;
    for(const [id,list] of sets){
      const template=view.models.create(this.spec(id,lod),{height:TREE_HEIGHT[id]||1});if(!template)continue;template.updateMatrixWorld(true);
      template.traverse(source=>{
        if(!source.isMesh)return;const mesh=new T.InstancedMesh(source.geometry,source.material,list.length);mesh.castShadow=!lod;mesh.receiveShadow=true;
        list.forEach((p,i)=>{dummy.position.set(p.x-offset,y,p.z-offset);dummy.rotation.set(0,p.rot||0,0);dummy.scale.setScalar(p.scale||1);dummy.updateMatrix();matrix.multiplyMatrices(dummy.matrix,source.matrixWorld);mesh.setMatrixAt(i,matrix);});
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.group.add(mesh);
      });
    }
  }
  mark(object,shadow){object.traverse(o=>{if(o.isMesh){o.castShadow=shadow;o.receiveShadow=true;}});}
  clear(){for(const child of [...this.group.children]){this.group.remove(child);child.traverse?.(o=>{if(o.isInstancedMesh)o.dispose();});}}
  dispose(){this.disposed=true;this.token++;this.clear();this.group.removeFromParent();}
}
