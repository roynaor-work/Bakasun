import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {disposeBoat} from './patrol-boat.mjs?v=island-naval-aim-20261028-2';
import {NAVAL_SHORES,navalShoreRadius,navalShoreHeight} from './ultra-naval-environment-layout.mjs';

/** A bounded, authored archipelago. All moving detail uses the simulation clock. */
export function createNavalScenery(scene,model,balance,adapters={}){
  const resources=new Set(),root=new T.Group();root.name='naval-ultra-archipelago';scene.add(root);
  let disposed=false,palmsLoaded=false,seed=37,wakeTime=0;
  const keep=value=>(resources.add(value),value);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const seaTime={value:0},terrainParts=[],rockParts=[],shoreParts=[];
  const terrainMaterial=keep(new T.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0}));
  const stoneMaterial=keep(new T.MeshStandardMaterial({vertexColors:true,roughness:.88,flatShading:true}));
  const sand=new T.Color('#e7d6a9'),wetSand=new T.Color('#b7bca1'),grass=new T.Color('#547d42'),grassLight=new T.Color('#718f4c'),stoneLight=new T.Color('#b6b4a0'),stoneDark=new T.Color('#747f79');
  const color=new T.Color(),tmp=new T.Object3D();
  function shorePoint(shore,r,a){const w=navalShoreRadius(a,shore.phase);return [shore.x+Math.cos(a)*shore.rx*r*w,navalShoreHeight(r,a,shore),shore.z+Math.sin(a)*shore.rz*r*w];}
  for(const shore of NAVAL_SHORES){
    const positions=[],colors=[],indices=[],segments=56,rings=11;
    for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
      const r=j/rings,a=i/segments*Math.PI*2,p=shorePoint(shore,r,a);positions.push(...p);
      const mottling=.5+.5*Math.sin(p[0]*1.4+Math.sin(p[2]*1.2))*Math.sin(p[2]*1.6);
      if(r>.87)color.copy(wetSand).lerp(sand,Math.max(0,(1-r)*8));
      else if(r>.66)color.copy(sand).lerp(grass,Math.min(1,(.87-r)*5.4));
      else color.copy(grass).lerp(grassLight,mottling*.6);
      color.multiplyScalar(.91+mottling*.14);colors.push(color.r,color.g,color.b);
      if(j<rings&&i<segments){const k=j*(segments+1)+i;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
    }
    const terrain=new T.BufferGeometry();terrain.setAttribute('position',new T.Float32BufferAttribute(positions,3));terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrain.setIndex(indices);terrain.computeVertexNormals();terrainParts.push(terrain.toNonIndexed());terrain.dispose();
    // Separate granite outcrops follow a geological ridge rather than repeated green caps.
    const count=shore.height>8?13:8;
    for(let n=0;n<count;n++){
      const angle=shore.phase+n*2.399,radial=n<4?.27+random()*.28:.62+random()*.3;
      const p=shorePoint(shore,radial,angle),scale=(n<4?3.6:1.5)+random()*2.5;
      const rock=new T.IcosahedronGeometry(1,1),attr=rock.attributes.position;
      for(let i=0;i<attr.count;i++){const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i),shape=1+.11*Math.sin(x*11+shore.phase)*Math.cos(z*9+y*7);attr.setXYZ(i,x*shape,y*shape,z*shape);}
      tmp.position.set(p[0],Math.max(.12,p[1])-.55,p[2]);tmp.rotation.set(random()*.45,random()*6.28,random()*.32);tmp.scale.set(scale*(1+random()*.6),scale*(.65+random()*.65),scale*(.8+random()*.4));tmp.updateMatrix();rock.applyMatrix4(tmp.matrix);
      const vertices=rock.attributes.position,vertexColors=[];
      for(let i=0;i<vertices.count;i++){const height=vertices.getY(i);color.copy(stoneDark).lerp(stoneLight,T.MathUtils.clamp(.48+height*.035+Math.sin(vertices.getX(i)*2.5+vertices.getZ(i))*.12,0,1));if(height<.65)color.multiplyScalar(.76);vertexColors.push(color.r,color.g,color.b);}
      rock.setAttribute('color',new T.Float32BufferAttribute(vertexColors,3));rock.deleteAttribute('uv');rockParts.push(rock);
    }
    const shorelinePositions=[],uv=[],shoreIndices=[];
    for(let i=0;i<=96;i++)for(let k=0;k<2;k++){
      const a=i/96*Math.PI*2,r=k?1.14:.978,p=shorePoint(shore,r,a);shorelinePositions.push(p[0],-.075,p[2]);uv.push(i/96,k);
      if(i<96&&k===0){const n=i*2;shoreIndices.push(n,n+1,n+2,n+1,n+3,n+2);}
    }
    const fringe=new T.BufferGeometry();fringe.setAttribute('position',new T.Float32BufferAttribute(shorelinePositions,3));fringe.setAttribute('uv',new T.Float32BufferAttribute(uv,2));fringe.setIndex(shoreIndices);shoreParts.push(fringe);
  }
  function batch(parts,material){const geometry=keep(mergeGeometries(parts));for(const part of parts)part.dispose();const mesh=new T.Mesh(geometry,material);root.add(mesh);return mesh;}
  batch(terrainParts,terrainMaterial);batch(rockParts,stoneMaterial);
  const shoreMaterial=keep(new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:seaTime},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float time;
      void main(){float u=vUv.x*6.283185,y=vUv.y;float swell=sin(y*17.-time*1.2+sin(u*8.)*.7);
        float lace=.55+.45*sin(u*87.+sin(u*31.)*2.+y*13.);float veil=pow(max(0.,1.-y),2.);
        float foam=smoothstep(.61,.95,swell)*smoothstep(.12,.55,lace)*sin(y*3.14159);
        gl_FragColor=vec4(mix(vec3(.27,.73,.69),vec3(.88,.96,.87),foam),veil*.13+foam*.39);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));batch(shoreParts,shoreMaterial);
  // Full-resolution Meshy mesh and original PBR material, shared by six instances.
  const loader=adapters.loader||new GLTFLoader();
  const ready=loader.loadAsync(new URL('../assets/models/palm-tree-512.glb',import.meta.url).href).then(gltf=>{
    if(disposed){disposeBoat(gltf.scene);return;}
    const palm=gltf.scene,bounds=new T.Box3().setFromObject(palm),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),placements=NAVAL_SHORES.flatMap(shore=>shore.palms.map(([x,z,height])=>({shore,x,z,height})));
    palm.updateWorldMatrix(true,true);
    palm.traverse(node=>{
      if(!node.isMesh)return;keep(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){keep(material);for(const value of Object.values(material))if(value?.isTexture)keep(value);}
      const mesh=keep(new T.InstancedMesh(node.geometry,node.material,placements.length)),normalize=new T.Matrix4(),placement=new T.Matrix4();
      // Keep every Meshy triangle in the main view. The 256px water reflection
      // renders layer 0 only: subpixel palm reflections do not merit 31,404 more
      // triangles per capture. Islands, rocks, clouds and vessels still reflect.
      mesh.layers.set(1);
      for(let i=0;i<placements.length;i++){
        const {shore,x,z,height}=placements[i],scale=height/size.y,r=Math.hypot(x/shore.rx,z/shore.rz),a=Math.atan2(z/shore.rz,x/shore.rx);
        tmp.position.set(shore.x+x,navalShoreHeight(r,a,shore)-.25,shore.z+z);tmp.rotation.set(0,i*2.399,0);tmp.scale.setScalar(scale);tmp.updateMatrix();
        normalize.makeTranslation(-center.x,-bounds.min.y,-center.z);placement.copy(tmp.matrix).multiply(normalize).multiply(node.matrixWorld);mesh.setMatrixAt(i,placement);
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
    });palmsLoaded=true;
  }).catch(()=>{});
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=512;cloudCanvas.height=256;const brush=cloudCanvas.getContext('2d');
  // Connected cloud volumes are blurred as one silhouette, then lit from above.
  // Stretched trailing wisps keep individual puffs from reading as floating beads.
  brush.filter='blur(9px)';brush.fillStyle='#fff';
  for(const [x,y,rx,ry]of [[249,151,194,26],[127,139,59,31],[218,116,93,45],[310,134,88,34],[402,155,83,12],[71,158,49,9]]){
    brush.beginPath();brush.ellipse(x,y,rx,ry,0,0,Math.PI*2);brush.fill();
  }
  brush.filter='none';brush.globalCompositeOperation='source-in';
  const cloudLight=brush.createLinearGradient(0,62,0,188);cloudLight.addColorStop(0,'rgba(255,250,231,.97)');cloudLight.addColorStop(.48,'rgba(247,249,238,.91)');cloudLight.addColorStop(.78,'rgba(201,222,225,.73)');cloudLight.addColorStop(1,'rgba(151,186,204,.17)');brush.fillStyle=cloudLight;brush.fillRect(0,0,512,256);brush.globalCompositeOperation='source-over';
  const cloudMap=keep(new T.CanvasTexture(cloudCanvas));cloudMap.colorSpace=T.SRGBColorSpace;
  const cloudGeometry=keep(new T.PlaneGeometry(1,1)),cloudMaterial=keep(new T.MeshBasicMaterial({map:cloudMap,transparent:true,opacity:.76,depthWrite:false,fog:false})),clouds=[];
  const cloudBatch=keep(new T.InstancedMesh(cloudGeometry,cloudMaterial,7));cloudBatch.name='naval-cloud-bank';cloudBatch.frustumCulled=false;cloudBatch.instanceMatrix.setUsage(T.DynamicDrawUsage);root.add(cloudBatch);
  for(const [x,y,z,w]of [[-146,45,-195,71],[-88,37,-216,52],[-24,58,-239,76],[65,48,-231,82],[141,37,-214,61],[200,66,-270,93],[-222,70,-278,90]]){
    const cloud=new T.Object3D();cloud.position.set(x,y,z);cloud.scale.set(w,w*.4,1);cloud.updateMatrix();cloudBatch.setMatrixAt(clouds.length,cloud.matrix);clouds.push({cloud,x});
  }
  cloudBatch.instanceMatrix.needsUpdate=true;
  const wakeMaterial=keep(new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:seaTime,strength:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float strength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){float across=sin(vUv.x*3.14159),fade=pow(1.-vUv.y,1.65);
        vec2 p=vUv*vec2(31.,115.)+vec2(sin(vUv.y*29.-time)*.6,-time*5.);float grain=hash(floor(p));
        float rib=sin(vUv.y*177.-time*10.+sin(vUv.x*15.)*1.3)*.5+.5;
        float foam=smoothstep(.25,.74,grain*.62+rib*.48);float rim=pow(max(0.,across),.7);
        gl_FragColor=vec4(.84,.96,.92,rim*fade*foam*.65*strength);}`,
  }));
  const wakes=new T.Group();scene.add(wakes);
  for(const side of [-1,1]){
    const positions=[],uvs=[],indices=[],segments=32;
    for(let i=0;i<=segments;i++){const u=i/segments,z=3+u*25,x=side*(1.6+u*5.5),width=.75+u*2.35;positions.push(x-width/2,.12,z,x+width/2,.12,z);uvs.push(0,u,1,u);if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const geometry=keep(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);wakes.add(new T.Mesh(geometry,wakeMaterial));
  }
  return {ready,update(player,camera){if(disposed)return;const dt=Math.max(0,model.time-wakeTime),target=Math.min(1,(model.playerShip.speed||0)/16);wakeTime=model.time;seaTime.value=model.time;wakeMaterial.uniforms.strength.value=target+(wakeMaterial.uniforms.strength.value-target)*Math.exp(-dt*3);wakes.position.copy(player.position);wakes.position.y=0;wakes.rotation.y=player.rotation.y;for(let i=0;i<clouds.length;i++){const {cloud,x}=clouds[i];cloud.position.x=x+Math.sin(model.time*.012)*3;if(camera)cloud.quaternion.copy(camera.quaternion);cloud.updateMatrix();cloudBatch.setMatrixAt(i,cloud.matrix);}cloudBatch.instanceMatrix.needsUpdate=true;},
    metrics(){return {palmsLoaded,palmInstances:NAVAL_SHORES.reduce((n,shore)=>n+shore.palms.length,0),islands:NAVAL_SHORES.length,clouds:clouds.length,shoreline:true,wake:wakeMaterial.uniforms.strength.value,disposed};},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();wakes.removeFromParent();for(const resource of resources)resource.dispose();root.clear();wakes.clear();},
  };
}
