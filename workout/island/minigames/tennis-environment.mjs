import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {seededRandom} from './tennis.mjs?v=island-hoops-r3-20261029-1';
import {tennisSeats,seatedVertex} from './tennis-crowd.mjs?v=island-hoops-r3-20261029-1';
import {createUltraTennisVenue} from './ultra-tennis-environment.mjs?v=island-hoops-r3-20261029-1';

export async function createTennisEnvironment(scene,config,keep,renderer,camera){
 const e=config.render.environment,rand=seededRandom(config.seed),seats=tennisSeats(config),trees=[],near=[],loaded=[],failures=[],people=[];
 const venue=createUltraTennisVenue(scene,config,keep,seats),crowdPalette=['#586b75','#d8d0b9','#68816c','#b8a489','#6d8987','#b08a77'];
 const results=await Promise.allSettled(config.environment.models.map(async path=>{
  const gltf=await new GLTFLoader().loadAsync(new URL('../'+path+'?v=island-hoops-r3-20261029-1',import.meta.url).href);
  gltf.scene.updateMatrixWorld(true);let source;gltf.scene.traverse(o=>{if(o.isMesh&&!source)source=o;});if(!source)throw Error(path);
  const name=path.split('/').at(-1),geometry=keep(source.geometry);geometry.applyMatrix4(source.matrixWorld);geometry.computeBoundingBox();
  const b=geometry.boundingBox,height=name.startsWith('adult')?e.crowdHeight:e.treeHeight,scale=height/(b.max.y-b.min.y);
  geometry.translate(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);geometry.scale(scale,scale,scale);
  const material=keep(source.material);if(material.map)keep(material.map);loaded.push(name);
  return {name,geometry,material};
 }));
 results.forEach((r,i)=>{if(r.status==='rejected')failures.push(config.environment.models[i].split('/').at(-1));else if(r.value.name.startsWith('adult'))people.push(r.value);else{
  const {geometry,material}=r.value;e.treePositions.forEach(([x,z],i)=>{const tree=new T.Mesh(geometry,material);tree.position.set(x,0,z);tree.rotation.set((rand()-.5)*.06,rand()*Math.PI*2,(rand()-.5)*.06);tree.scale.setScalar(e.treeScales[i]);tree.receiveShadow=true;scene.add(tree);trees.push(tree);});
 }});
 people.sort((a,b)=>a.name.localeCompare(b.name));
 function human(type,variant,color){
  const source=people[type],geometry=keep(source.geometry.clone()),p=source.geometry.attributes.position,base=[],open=[],closed=[],shirt=[];
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);base.push(...seatedVertex(x,y,z,variant,0,type));open.push(...seatedVertex(x,y,z,variant,.3,type));closed.push(...seatedVertex(x,y,z,variant,1,type));shirt.push(y>1.02&&y<1.48&&Math.abs(x)<.45?1:0);}
  geometry.setAttribute('position',new T.Float32BufferAttribute(base,3));geometry.setAttribute('tennisShirt',new T.Float32BufferAttribute(shirt,1));geometry.morphAttributes.position=[new T.Float32BufferAttribute(open,3),new T.Float32BufferAttribute(closed,3)];geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mat=keep(source.material.clone());mat.onBeforeCompile=s=>{s.uniforms.shirtColor={value:new T.Color(color)};s.vertexShader='attribute float tennisShirt; varying float shirtMask;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nshirtMask=tennisShirt;');s.fragmentShader='uniform vec3 shirtColor; varying float shirtMask;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat fabricLight=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.28,.6,1.3);\ndiffuseColor.rgb=mix(diffuseColor.rgb,shirtColor*fabricLight,shirtMask*.88);\ndiffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.82);');};
  const mesh=new T.Mesh(geometry,mat);mesh.updateMorphTargets();return mesh;
 }
 // Render the SAME full meshes into a transparent three-frame, four-view atlas.
 // No vertex clustering or triangle removal is used for people or trees.
 const atlas=document.createElement('canvas');atlas.width=8*192;atlas.height=9*256;const ctx=atlas.getContext('2d');
 const target=new T.WebGLRenderTarget(192,256,{samples:4}),bakeScene=new T.Scene(),bakeCamera=new T.OrthographicCamera(-.75,.75,1,-1,.1,20);
 bakeScene.add(new T.HemisphereLight('#e9f1f1','#5b6850',1.08));const light=new T.DirectionalLight('#fff1d3',2.55);light.position.set(-9,18,8);bakeScene.add(light);
 const previous=renderer.getRenderTarget(),clear=new T.Color();renderer.getClearColor(clear);const alpha=renderer.getClearAlpha(),pixels=new Uint8Array(192*256*4);
 renderer.setClearColor(0,0);
 for(let type=0;type<people.length;type++)for(let variant=0;variant<3;variant++){
  const mesh=human(type,variant,crowdPalette[type*3+variant]);bakeScene.add(mesh);
  for(let frame=0;frame<3;frame++)for(let view=0;view<4;view++){
   mesh.morphTargetInfluences[0]=frame===1?1:0;mesh.morphTargetInfluences[1]=frame===2?1:0;
   const angle=view*Math.PI/2;bakeCamera.position.set(Math.sin(angle)*4,2.3,Math.cos(angle)*4);bakeCamera.lookAt(0,.8,0);
   renderer.setRenderTarget(target);renderer.render(bakeScene,bakeCamera);renderer.readRenderTargetPixels(target,0,0,192,256,pixels);
   const tile=frame*24+type*12+variant*4+view,data=ctx.createImageData(192,256);
   for(let y=0;y<256;y++)data.data.set(pixels.subarray((255-y)*192*4,(256-y)*192*4),y*192*4);
   ctx.putImageData(data,(tile%8)*192,Math.floor(tile/8)*256);
  }
  bakeScene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();
 }
 renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();
 const texture=keep(new T.CanvasTexture(atlas));texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;
 const plane=keep(new T.PlaneGeometry(1.5,2));plane.translate(0,.8,0);
 const tiles=new Float32Array(seats.length),spriteMat=keep(new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.2,side:T.DoubleSide,depthWrite:true,toneMapped:false}));
 plane.setAttribute('tennisTile',new T.InstancedBufferAttribute(tiles,1));const clapUniform={value:0};
 spriteMat.onBeforeCompile=s=>{s.uniforms.clapFrame=clapUniform;s.vertexShader='attribute float tennisTile; varying float spriteTile;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nspriteTile=tennisTile;');s.fragmentShader='uniform float clapFrame; varying float spriteTile;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
 float tile=spriteTile+24.0*clapFrame;
 vec2 atlasUV=(vec2(mod(tile,8.0),8.0-floor(tile/8.0))+vMapUv)/vec2(8.0,9.0);
 vec4 sampledDiffuseColor=texture2D(map,atlasUV);diffuseColor*=sampledDiffuseColor;
 #endif`);};
 const sprites=new T.InstancedMesh(plane,spriteMat,seats.length);sprites.frustumCulled=false;scene.add(sprites);
 const nearSeats=[0,36,72,108].map(i=>i+5),dummy=new T.Object3D();let quality=0,clapLeft=0,lastEvent=-1,time=0;
 nearSeats.forEach((seat,i)=>{if(!people.length)return;const mesh=human(i%people.length,i%3,crowdPalette[i]);const s=seats[seat];mesh.position.set(s.x,s.y,s.z);mesh.rotation.y=s.facing;mesh.receiveShadow=true;scene.add(mesh);near.push(mesh);});
 let umpire;if(people.length){umpire=human(0,1,'#f5edda');umpire.position.set(-5.15,1.63,0);umpire.rotation.y=Math.PI/2;scene.add(umpire);}
 function updateSprites(){
  let count=0;const limit=config.render.crowdCounts[quality];
  seats.forEach((s,i)=>{if(i>=limit||quality===0&&nearSeats.includes(i))return;
   const angle=Math.atan2(camera.position.x-s.x,camera.position.z-s.z)-s.facing,view=((Math.round(angle/(Math.PI/2))%4)+4)%4;
   tiles[count]=(i%Math.max(1,people.length))*12+(i%3)*4+view;
   dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,Math.atan2(camera.position.x-s.x,camera.position.z-s.z),0);dummy.scale.set(1,1,1);dummy.updateMatrix();sprites.setMatrixAt(count++,dummy.matrix);
  });sprites.count=count;sprites.instanceMatrix.needsUpdate=true;plane.attributes.tennisTile.needsUpdate=true;
 }
 function setQuality(q){quality=q;near.forEach((m,i)=>m.visible=i<e.nearCount[q]);trees.forEach((t,i)=>t.visible=i<e.treeCounts[q]);venue.setQuality(q);updateSprites();}
 function render(state,dt){if(state.event.id!==lastEvent){lastEvent=state.event.id;if(['point','game','complete'].includes(state.event.type))clapLeft=e.clapSeconds;}clapLeft=Math.max(0,clapLeft-dt);time+=dt;clapUniform.value=clapLeft>0?(Math.sin(time*e.clapFrequency)>0?1:2):0;near.forEach((m,i)=>{m.morphTargetInfluences[0]=clapLeft>0?(1+Math.sin(time*e.clapFrequency+i))*.5:0;m.morphTargetInfluences[1]=clapLeft>0?1-m.morphTargetInfluences[0]:0;});updateSprites();}
 function metrics(){return {...venue.metrics(),loadedModels:loaded.sort(),missingModels:failures,crowd:sprites.count+near.filter(n=>n.visible).length,fullCrowd:near.filter(n=>n.visible).length,spriteCrowd:sprites.count,crowdSides:[0,1,2,3].map(side=>seats.filter((s,i)=>s.side===side&&i<config.render.crowdCounts[quality]).length),crowdTrianglesPerModel:people.map(p=>p.geometry.index.count/3),trees:trees.filter(t=>t.visible).length,applauding:clapLeft>0,umpire:Boolean(umpire),atlasFromFullModels:true};}
 setQuality(0);return {setQuality,render,metrics};
}
