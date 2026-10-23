import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {disposeBoat} from './patrol-boat.mjs?v=island-art-20261022-3';

/** The approved scene's rocks, palms, soft clouds and moving wake, in the real arena. */
export function createNavalScenery(scene,model,balance,adapters={}){
  const resources=new Set(),root=new T.Group();root.name='naval-adventure-scenery';scene.add(root);
  let disposed=false,palmsLoaded=false,seed=37,wakeTime=0;
  const keep=value=>(resources.add(value),value);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const rock=keep(new T.IcosahedronGeometry(1,2));
  const stone=keep(new T.MeshStandardMaterial({color:'#9a9c8d',roughness:.96,flatShading:true}));
  const grass=keep(new T.MeshStandardMaterial({color:'#4e8152',roughness:1,flatShading:true}));
  const sand=keep(new T.MeshStandardMaterial({color:'#ddd0aa',roughness:.95}));
  const islands=[];
  for(const [x,z,size]of [[-55,-90,.82],[75,-116,1.2],[-15,-180,.75]]){
    const island=new T.Group();island.position.set(x,0,z);island.scale.setScalar(size);root.add(island);islands.push(island);
    for(let i=0;i<8;i++){
      const boulder=new T.Mesh(rock,i<2?sand:stone),h=4+random()*9;
      boulder.position.set((random()-.5)*23,h*.12-1,(random()-.5)*11);boulder.scale.set(7+random()*6,h,5+random()*5);boulder.rotation.y=random()*3;island.add(boulder);
      if(i>1){const top=new T.Mesh(rock,grass);top.position.copy(boulder.position);top.position.y+=h*.57;top.scale.set(boulder.scale.x*.81,h*.4,boulder.scale.z*.82);island.add(top);}
    }
  }
  // Bake all rocks into three material batches; no per-frame scenery allocation.
  function bake(group){
    group.updateWorldMatrix(true,true);const batches=new Map(),meshes=[];
    group.traverse(node=>{if(!node.isMesh||Array.isArray(node.material))return;const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);if(!batches.has(node.material))batches.set(node.material,[]);batches.get(node.material).push(geometry);meshes.push(node);});
    for(const mesh of meshes)mesh.removeFromParent();
    for(const [material,parts]of batches){const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();if(geometry)root.add(new T.Mesh(keep(geometry),material));}
  }
  bake(root);
  const loader=adapters.loader||new GLTFLoader();
  const ready=loader.loadAsync(new URL('../assets/models/palm-tree-512.glb',import.meta.url).href).then(gltf=>{
    if(disposed){disposeBoat(gltf.scene);return;}
    const palm=gltf.scene,bounds=new T.Box3().setFromObject(palm),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=6/size.y;
    const grove=new T.Group();root.add(grove);
    for(let j=0;j<2;j++)for(let i=0;i<3;i++){
      const holder=new T.Group(),object=palm.clone(true);object.scale.setScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      holder.add(object);holder.position.set(i*7-7,5+i%2*2,-4+i*3);holder.scale.setScalar(.72+i*.13);islands[j].add(holder);grove.attach(holder);
    }
    palm.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
    bake(grove);grove.removeFromParent();palmsLoaded=true;
  }).catch(()=>{});
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=512;cloudCanvas.height=256;const brush=cloudCanvas.getContext('2d');brush.filter='blur(8px)';
  for(let i=0;i<24;i++){const x=65+random()*380,y=110+random()*42,r=25+random()*40,g=brush.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,253,237,.9)');g.addColorStop(.65,'rgba(242,248,245,.65)');g.addColorStop(1,'rgba(240,246,248,0)');brush.fillStyle=g;brush.fillRect(x-r,y-r,r*2,r*2);}
  const cloudMap=keep(new T.CanvasTexture(cloudCanvas));cloudMap.colorSpace=T.SRGBColorSpace;
  const cloudMaterial=keep(new T.SpriteMaterial({map:cloudMap,transparent:true,opacity:.8,depthWrite:false,fog:false})),clouds=[];
  for(let i=0;i<10;i++){const cloud=new T.Sprite(cloudMaterial);cloud.position.set(-185+i*40,28+random()*29,-150-random()*65);cloud.scale.set(42+random()*25,19+random()*12,1);root.add(cloud);clouds.push({cloud,x:cloud.position.x});}
  const wakeMaterial=keep(new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0},strength:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float strength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){float edge=pow(max(0.,sin(vUv.x*3.14159)),.7),fade=pow(1.-vUv.y,1.4);
        float grain=hash(floor(vUv*vec2(38.,130.)+vec2(0.,-time*6.)));
        float foam=smoothstep(.12,.7,grain+sin(vUv.y*150.-time*9.)*.18);
        gl_FragColor=vec4(.90,.98,.93,edge*fade*foam*.78*strength);}`,
  }));
  const wakes=new T.Group();scene.add(wakes);
  for(const side of [-1,1]){
    const positions=[],uvs=[],indices=[],segments=32;
    for(let i=0;i<=segments;i++){const u=i/segments,z=3+u*24,x=side*(1.5+u*5.5),width=.8+u*2.5;positions.push(x-width/2,.12,z,x+width/2,.12,z);uvs.push(0,u,1,u);if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const geometry=keep(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);wakes.add(new T.Mesh(geometry,wakeMaterial));
  }
  return {ready,update(player){const dt=Math.max(0,model.time-wakeTime),target=Math.min(1,(model.playerShip.speed||0)/16);wakeTime=model.time;wakeMaterial.uniforms.time.value=model.time;wakeMaterial.uniforms.strength.value=target+(wakeMaterial.uniforms.strength.value-target)*Math.exp(-dt*3);wakes.position.copy(player.position);wakes.position.y=0;wakes.rotation.y=player.rotation.y;for(const {cloud,x}of clouds)cloud.position.x=x+Math.sin(model.time*.012)*4;},
    metrics(){return {palmsLoaded,islands:3,clouds:clouds.length,wake: wakeMaterial.uniforms.strength.value,disposed};},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();wakes.removeFromParent();for(const resource of resources)resource.dispose();root.clear();wakes.clear();},
  };
}
