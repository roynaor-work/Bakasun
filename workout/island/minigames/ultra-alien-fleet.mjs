import * as T from '../vendor/three.module.js';

/** Measure the actual source, never infer a budget from file size. */
export function modelTriangles(root){let count=0;root?.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return count;}

/** The source GLB is shared. These clones own only their transform, not its maps. */
export function fleetModel(models,spec){
 const root=models.create({...spec,scale:1},{length:1});if(!root)return null;
 const bounds=new T.Box3().setFromObject(root),center=bounds.getCenter(new T.Vector3());
 root.children[0].position.y-=center.y;root.updateMatrixWorld(true);
 return root;
}

/** Reserve the frame for the player/FX, and retain true models nearest the player.
 * Only dense distant rows use a 512px source-material impostor, lit identically.
 * Sorting by id resolves equal-depth rows and avoids quality flicker. */
export function liveFleetIds(aliens,budget,costs,maxModels=16){
 const ids=new Set();let triangles=0;
 for(const a of [...aliens].sort((a,b)=>(b.boss-a.boss)||(b.diveAge>=0)-(a.diveAge>=0)||b.y-a.y||a.id-b.id)){
  const cost=costs[a.kind]||5000;if(ids.size>=maxModels||triangles+cost>budget)continue;ids.add(a.id);triangles+=cost;
 }return ids;
}

/** Bake original texture pixels, without resizing GLB textures or tinting paint. */
export function bakeFleet(renderer,scene,camera,models,specs){
 const result=[],size=renderer.getSize(new T.Vector2()),dpr=renderer.getPixelRatio(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
 const bakeCamera=new T.OrthographicCamera(-.72,.72,.72,-.72,.01,30);bakeCamera.up.set(0,0,-1);camera.getWorldDirection(bakeCamera.position).negate().multiplyScalar(6);bakeCamera.lookAt(0,0,0);
 const previous=renderer.getRenderTarget(),background=scene.background;scene.background=null;
 const hidden=[];for(const child of scene.children)if(!child.isLight){hidden.push([child,child.visible]);child.visible=false;}
 // Three r160 skips tone mapping for ordinary render targets. Copy the display
 // framebuffer so the LOD gets exactly the same ACES + sRGB path as live GLBs.
 try{renderer.setRenderTarget(null);renderer.setPixelRatio(1);renderer.setSize(512,512,false);for(const spec of specs){const root=fleetModel(models,spec);if(!root){result.push(null);continue;}scene.add(root);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,bakeCamera);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.getContext('2d').drawImage(renderer.domElement,0,0);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  const material=new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});result.push({texture,material});root.removeFromParent();
 }}finally{for(const [child,visible]of hidden)child.visible=visible;scene.background=background;renderer.setPixelRatio(dpr);renderer.setSize(size.x,size.y,false);renderer.setClearColor(clear,alpha);renderer.setRenderTarget(previous);}
 return result;
}
