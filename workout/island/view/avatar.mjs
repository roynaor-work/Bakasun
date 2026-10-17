import * as T from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { GROUND, primitive, material } from './environment.mjs?v=g4c-20261019-1';

const MODEL_URL=new URL('../assets/kid-full.glb',import.meta.url).href;
const color=new T.Color();
function recolor(mesh,record) {
  const attr=mesh.geometry.attributes.color;if(!attr)return;
  const original=mesh.userData.originalColors??(mesh.userData.originalColors=attr.array.slice());
  const positions=mesh.geometry.attributes.position;
  const targetSkin=new T.Color(record.skinColor||'#edac78'),targetHair=new T.Color(record.hairColor||'#593a29');
  const targetShirt=new T.Color(record.shirtColor||record.clothing?.shirtColor||'#ec9475'),targetPants=new T.Color(record.pantsColor||record.clothing?.pantsColor||'#387f89');
  const sourceSkin=new T.Color(mesh.name.startsWith('Head')?'#f3ba92':'#edac78'),sourceHair=new T.Color('#60402d');
  const sourceShirt=new T.Color('#214eb7'),sourcePants=new T.Color('#1c4099');
  for(let i=0;i<attr.count;i++) {
    const n=i*attr.itemSize,r=original[n],g=original[n+1],b=original[n+2];let src=null,dest=null;
    // The supplied GLB bakes its palette and lighting into vertex colors. Hue
    // ranges retain that shading; changing material.color would tint the eyes.
    if(mesh.name.startsWith('Head')&&r>g*1.25&&g>b*1.2&&r<.25) {src=sourceHair;dest=targetHair;}
    else if(r>g*1.16&&g>b*1.18&&r>.16) {src=sourceSkin;dest=targetSkin;}
    else if(mesh.name.startsWith('Skin_')&&b>r*1.4&&b>g*1.25) {const pants=positions.getY(i)<.88;src=pants?sourcePants:sourceShirt;dest=pants?targetPants:targetShirt;}
    if(dest){const lum=(r+g+b)/(src.r+src.g+src.b);color.copy(dest).multiplyScalar(lum);attr.setXYZ(i,color.r,color.g,color.b);}else attr.setXYZ(i,r,g,b);
  }
  attr.needsUpdate=true;
}
export class Avatar {
  constructor(scene) { this.holder=new T.Group();this.holder.position.y=GROUND;this.holder.scale.setScalar(.64);scene.add(this.holder);this.record={};this.root=null;this.moving=false; }
  async load(record) {
    const gltf=await new GLTFLoader().loadAsync(MODEL_URL);this.root=gltf.scene;
    this.root.getObjectByName('Ball')?.traverse(o=>{o.visible=false;});
    this.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
    this.holder.add(this.root);this.mixer=new T.AnimationMixer(this.root);
    // The existing run animation drives the real rig; it is slowed to a walk.
    this.walkClip=gltf.animations.find(c=>c.name==='run');this.standClip=gltf.animations.find(c=>c.name==='stand');
    this.setRecord(Object.keys(this.record).length?this.record:record);this.play(false);return this;
  }
  setRecord(record={}) {
    this.record=record;if(!this.root)return;
    this.root.traverse(mesh=>{if(mesh.isMesh)recolor(mesh,record);});
    const head=this.root.getObjectByName('Head');if(!head)return;
    if(this.extraHair){head.remove(this.extraHair);this.extraHair=null;}
    const style=record.hairstyle||record.hairStyle||'short';
    // Retain the authored scalp and hair. Extra locks attach to the same bone.
    if(style==='ponytail'||style==='long'||style==='bob'||style==='curly') {
      this.extraHair=new T.Group();head.add(this.extraHair);
      const hair=record.hairColor||'#593a29';
      if(style==='curly')for(let i=0;i<7;i++)primitive(this.extraHair,'sphere',hair,[Math.sin(i/7*Math.PI*2)*.3,.33+(i%2)*.07,Math.cos(i/7*Math.PI*2)*.3-.05],[.25,.24,.25]);
      else if(style==='ponytail') { primitive(this.extraHair,'sphere',hair,[0,.21,-.48],[.3,.55,.35]);primitive(this.extraHair,'sphere',hair,[0,-.05,-.54],[.24,.45,.26]); }
      else for(const side of [-1,1])primitive(this.extraHair,'sphere',hair,[side*.32,-.13,-.11],[.18,style==='long'?.67:.4,.3]);
    }
  }
  play(moving) {
    if(this.moving===moving&&this.action)return;this.moving=moving;
    const clip=moving?this.walkClip:this.standClip;if(!clip)return;
    const next=this.mixer.clipAction(clip);next.reset().setEffectiveTimeScale(moving?.55:1).play();
    if(this.action)this.action.crossFadeTo(next,.3,false);this.action=next;
  }
  tick(delta,time,route) {
    if(!this.root)return;const target=route?.[0];let moving=false;
    if(target) {
      const dx=target.x-this.holder.position.x,dz=target.z-this.holder.position.z,len=Math.hypot(dx,dz);
      if(len<.08)route.shift();else {const step=Math.min(len,delta*.85);this.holder.position.x+=dx/len*step;this.holder.position.z+=dz/len*step;const angle=Math.atan2(dx,dz);this.holder.rotation.y+=Math.atan2(Math.sin(angle-this.holder.rotation.y),Math.cos(angle-this.holder.rotation.y))*Math.min(1,delta*8);moving=true;}
    }
    this.play(moving);this.mixer?.update(delta);this.root.getObjectByName('Ball')?.traverse(o=>{o.visible=false;});
  }
  dispose() {this.mixer?.stopAllAction();this.root?.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
}

export class Citizens {
  constructor(scene,max=40) {
    this.max=Math.min(40,max);this.people=[];this.dummy=new T.Object3D();this.root=new T.Group();scene.add(this.root);
    this.body=new T.InstancedMesh(new T.CylinderGeometry(.095,.12,.28,6),material('#fff1d2'),this.max);
    this.head=new T.InstancedMesh(new T.IcosahedronGeometry(.09,1),material('#efbc8c'),this.max);
    this.hair=new T.InstancedMesh(new T.IcosahedronGeometry(.095,0),material('#695348'),this.max);
    this.leftLeg=new T.InstancedMesh(new T.CylinderGeometry(.035,.035,.17,5),material('#5b7c81'),this.max);
    this.rightLeg=new T.InstancedMesh(new T.CylinderGeometry(.035,.035,.17,5),material('#5b7c81'),this.max);
    this.meshes=[this.body,this.head,this.hair,this.leftLeg,this.rightLeg];
    for(const mesh of this.meshes){mesh.castShadow=true;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;this.root.add(mesh);}
  }
  setPoints(points,count) {
    this.points=points;count=Math.max(0,Math.min(this.max,count,points.length>1?this.max:0));
    this.people=[];
    while(this.people.length<count){const i=this.people.length,p=points[i%points.length];this.people.push({x:p.x,z:p.z,node:i%points.length,target:p.neighbors?.[0]??(i+1)%points.length,phase:i*1.7,speed:.32+(i%4)*.04});this.body.setColorAt(i,new T.Color(['#f8cc75','#eaa19b','#83bdb8','#b4a3d6','#e8eee0'][i%5]));}
    this.people.length=count;for(const mesh of this.meshes)mesh.count=count;
    if(this.body.instanceColor)this.body.instanceColor.needsUpdate=true;
  }
  tick(delta,time) {
    if(!this.points?.length)return;const dummy=this.dummy;
    for(let i=0;i<this.people.length;i++) {
      const p=this.people[i],target=this.points[p.target%this.points.length],dx=target.x-p.x,dz=target.z-p.z,len=Math.hypot(dx,dz);
      if(len<.12){const next=target.neighbors?.filter(n=>n!==p.node);p.node=p.target;p.target=next?.length?next[(i+Math.floor(time))%next.length]:target.neighbors?.[0]??(p.target+1+i%3)%this.points.length;}
      else {p.x+=dx/len*Math.min(len,delta*p.speed);p.z+=dz/len*Math.min(len,delta*p.speed);}
      const bob=Math.sin(time*6+p.phase)*.015;
      for(const [mesh,y,scale] of [[this.body,.24,1],[this.head,.47,1],[this.hair,.525,1]]) {dummy.position.set(p.x,GROUND+y+bob,p.z);dummy.rotation.set(0,Math.atan2(dx,dz),0);dummy.scale.setScalar(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
      for(const [mesh,side]of [[this.leftLeg,-1],[this.rightLeg,1]]){dummy.position.set(p.x+side*.043,GROUND+.08,p.z);dummy.rotation.set(Math.sin(time*7+p.phase)*.4*side,Math.atan2(dx,dz),0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
    }
    for(const mesh of this.meshes)mesh.instanceMatrix.needsUpdate=true;
  }
}
