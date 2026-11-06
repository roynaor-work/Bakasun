import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {StadiumDracoLoader} from './draco-loader.mjs';
import {LEVELS, LOD_DISTANCES, NON_PLAYER_BUDGET, crowdPlacements} from './layout.mjs';

export {THREE};
export {NON_PLAYER_BUDGET, LEVELS, LOD_DISTANCES} from './layout.mjs';
const URL_BASE=new URL('./',import.meta.url);
const occupiedScenes=new WeakSet();

/** Counts submitted triangles, including every instance and hidden LODs only
 * when explicitly requested. Does not confuse stored geometry with draw cost. */
export function measureTriangles(root,{visibleOnly=true}={}) {
  const parts=new Map();
  const visit=(node,ancestorsVisible=true)=>{
    const shown=ancestorsVisible&&node.visible;
    if(visibleOnly&&!shown)return;
    if(node.isMesh||node.isSprite){
      const g=node.geometry,draw=g?.drawRange;
      const full=node.isSprite?6:(g?.index?.count??g?.attributes.position?.count??0);
      const count=Math.max(0,Math.min(full-(draw?.start??0),draw?.count??Infinity));
      const materials=Array.isArray(node.material)?node.material:[node.material];
      const passes=materials.some(m=>m?.transparent&&m.side===THREE.DoubleSide&&!m.forceSinglePass)?2:1;
      const triangles=count/3*(node.isInstancedMesh?node.count:1)*passes;
      const name=node.userData.part??node.name.split('_')[0]??'Other';
      parts.set(name,(parts.get(name)??0)+triangles);
    }
    for(const child of node.children)visit(child,shown);
  };
  visit(root);return {total:[...parts.values()].reduce((a,b)=>a+b,0),parts:Object.fromEntries(parts)};
}

function makeCrowd(level,texture,uniform,resources) {
  const root=new THREE.Group();root.name='Crowd';
  const placements=crowdPlacements(level),dummy=new THREE.Object3D();
  // Eight bounded sections can be frustum culled independently.
  for(let section=0;section<8;section++){
    const people=placements.filter(p=>p.section===section);
    const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(0,.5,0);
    geometry.setAttribute('atlasVariant',new THREE.InstancedBufferAttribute(new Float32Array(people.map(p=>p.variant)),1));
    geometry.setAttribute('wavePhase',new THREE.InstancedBufferAttribute(new Float32Array(people.map(p=>p.phase)),1));
    const material=new THREE.MeshBasicMaterial({map:texture,color:'#c5d0d4',side:THREE.DoubleSide,alphaTest:.4,alphaToCoverage:true,transparent:false,depthWrite:true,fog:true});
    material.onBeforeCompile=shader=>{
      shader.uniforms.stadiumTime=uniform;
      shader.vertexShader='attribute float atlasVariant; attribute float wavePhase; uniform float stadiumTime;\n'+shader.vertexShader;
      const uvChunk='#include <uv_vertex>';
      if(!shader.vertexShader.includes(uvChunk))throw new Error('Stadium crowd requires the three.js r160 uv_vertex shader chunk');
      shader.vertexShader=shader.vertexShader.replace(uvChunk,
        uvChunk+'\nvMapUv = (uv + vec2(mod(atlasVariant,4.0),floor(atlasVariant/4.0))) * 0.25;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.x += sin(stadiumTime*1.45+wavePhase)*0.018*uv.y;');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        mat4 stadiumWorld = modelMatrix * instanceMatrix;
        vec3 stadiumCentre = stadiumWorld[3].xyz;
        vec3 stadiumUp = normalize(stadiumWorld[1].xyz);
        vec3 stadiumToCamera = cameraPosition - stadiumCentre;
        vec3 stadiumRight = normalize(cross(stadiumUp,stadiumToCamera) + vec3(0.00001,0.0,0.0));
        vec3 stadiumPosition = stadiumCentre
          + stadiumRight * transformed.x * length(stadiumWorld[0].xyz)
          + stadiumUp * transformed.y * length(stadiumWorld[1].xyz);
        vec4 mvPosition = viewMatrix * vec4(stadiumPosition,1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
    };
    material.customProgramCacheKey=()=> 'stadium-crowd-atlas-r160-v3';
    const mesh=new THREE.InstancedMesh(geometry,material,people.length);mesh.name='Crowd_'+section;mesh.userData.part='Crowd';
    for(let i=0;i<people.length;i++){
      const p=people[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.width,p.height,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
    resources.add(geometry);resources.add(material);
  }
  return root;
}

/** Load the exact local runtime files; no CDN, bundler, network API or textures
 * larger than 1024. Caller owns scene, renderer, RAF, players and game logic. */
export async function loadStadium({scene,baseURL=URL_BASE,initialLOD=0,signal,omitParts=[]}={}) {
  if(!scene?.isScene)throw new TypeError('loadStadium requires a THREE.Scene');
  if(!Number.isInteger(initialLOD)||initialLOD<0||initialLOD>2)throw new RangeError('LOD must be 0, 1 or 2');
  if(!Array.isArray(omitParts)||omitParts.some(p=>typeof p!=='string'))throw new TypeError('omitParts must be an array of part names');
  const omitted=new Set(omitParts);
  signal?.throwIfAborted();
  if(occupiedScenes.has(scene))throw new Error('This scene already has a stadium loading or mounted');
  const base=new URL(baseURL,URL_BASE),resources=new Set(),time={value:0},root=new THREE.Group();root.name='SoccerStadiumV8';
  const roofPlane={value:new THREE.Vector4(0,0,0,-1)};let roofCutawayActive=false;
  const manager=new THREE.LoadingManager(),textures=new THREE.TextureLoader(manager);
  const draco=new StadiumDracoLoader(manager,new URL('draco-worker.js',base)).setDecoderPath(new URL('vendor/draco/',base).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(2);
  const loader=new GLTFLoader(manager).setDRACOLoader(draco);
  const texNames=['pitch.webp','crowd-atlas.webp','crowd-bed.webp','goal-net.webp','perimeter-led.webp','evening-sky.webp','lamp-glow.webp','goal-shadow.webp','crowd-distant.webp'];
  let levels=[],maps=[],disposed=false,lod=initialLOD;
  const previousBackground=scene.background,previousFog=scene.fog;
  let ownedFog;
  const release=()=>{
    if(disposed)return;disposed=true;root.removeFromParent();occupiedScenes.delete(scene);
    for(const item of resources)item.dispose?.();draco.dispose();
  };
  occupiedScenes.add(scene);
  try{
    // Settle every in-flight request before cleanup. A single missing texture
    // must not strand geometries or decoder workers that finish a moment later.
    const loaded=await Promise.allSettled([
      ...texNames.map(async name=>{
        const tex=await textures.loadAsync(new URL(name,base).href);resources.add(tex);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;
      }),
      ...LEVELS.map(async(_,i)=>{
        const gltf=await loader.loadAsync(new URL(`stadium-lod${i}.glb`,base).href);
        gltf.scene.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.add(m);}});
        return gltf.scene;
      }),
    ]);
    const rejected=loaded.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;
    maps=loaded.slice(0,texNames.length).map(result=>result.value);levels=loaded.slice(texNames.length).map(result=>result.value);signal?.throwIfAborted();
    const [pitch,atlas,bed,net,led,sky,glow,shadow,distant]=maps;
    for(const texture of [bed,net,led,distant])texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    const materialMaps={Turf:pitch,Net:net,Led:led,ContactShadow:shadow};
    for(let i=0;i<levels.length;i++){
      const group=levels[i];group.name=LEVELS[i].name;
      const levelMaps={...materialMaps,Seats:i?distant:bed,Risers:i?distant:undefined};
      const roofMaterials=new Map();
      group.traverse(o=>{
        if(!o.isMesh)return;o.userData.part=o.userData.part??o.name.split('_')[0];
        if(omitted.has(o.userData.part))o.visible=false;
        let mats=Array.isArray(o.material)?o.material:[o.material];
        if(o.userData.part==='Roof'||o.userData.part==='Structure'){
          mats=mats.map(original=>{
            if(roofMaterials.has(original))return roofMaterials.get(original);
            const m=original.clone();resources.add(m);roofMaterials.set(original,m);
            m.onBeforeCompile=shader=>{
              shader.uniforms.stadiumRoofPlane=roofPlane;
              shader.vertexShader='varying vec3 stadiumRoofPosition;\n'+shader.vertexShader;
              // All authored positions are baked in stadium-local metres.
              shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstadiumRoofPosition=transformed;');
              shader.fragmentShader='varying vec3 stadiumRoofPosition; uniform vec4 stadiumRoofPlane;\n'+shader.fragmentShader;
              shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
                '#include <clipping_planes_fragment>\nif(dot(vec4(stadiumRoofPosition,1.0),stadiumRoofPlane)>0.0) discard;');
            };
            m.customProgramCacheKey=()=> 'stadium-roof-cutaway-r160-v1';return m;
          });
          o.material=Array.isArray(o.material)?mats:mats[0];
        }
        for(const m of mats){
          if(levelMaps[m.name]){m.map=levelMaps[m.name];m.needsUpdate=true;}
          if(m.name==='Net'){m.alphaTest=.32;m.alphaToCoverage=true;m.transparent=false;m.depthWrite=true;}
          if(m.name==='ContactShadow'){m.transparent=true;m.forceSinglePass=true;m.depthWrite=false;m.opacity=.52;}
          // Opaque, single-pass materials: no shadow maps or postprocessing.
          if(m.name==='Steel'){m.roughness=.72;m.metalness=.12;}
        }
      });
      const crowd=makeCrowd(LEVELS[i],atlas,time,resources);crowd.visible=!omitted.has('Crowd');group.add(crowd);group.visible=i===lod;root.add(group);
    }
    const lamps=new THREE.Group();lamps.name='Halos';
    // Four camera-facing halos share one instanced draw, including at corners
    // where all towers are visible. They remain eight triangles in the budget.
    const glowGeometry=new THREE.PlaneGeometry(1,1);
    const glowMat=new THREE.MeshBasicMaterial({map:glow,color:'#d7eaff',transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
    glowMat.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        mat4 stadiumGlowWorld = modelMatrix * instanceMatrix;
        vec3 stadiumGlowRight = vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
        vec3 stadiumGlowUp = vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 stadiumGlowPosition = stadiumGlowWorld[3].xyz
          + stadiumGlowRight * transformed.x * length(stadiumGlowWorld[0].xyz)
          + stadiumGlowUp * transformed.y * length(stadiumGlowWorld[1].xyz);
        vec4 mvPosition = viewMatrix * vec4(stadiumGlowPosition,1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
    };
    glowMat.customProgramCacheKey=()=> 'stadium-glow-batch-r160-v1';resources.add(glowGeometry);resources.add(glowMat);
    const glowMesh=new THREE.InstancedMesh(glowGeometry,glowMat,4),glowDummy=new THREE.Object3D();
    glowMesh.name='Halos';glowMesh.userData.part='Halos';glowMesh.frustumCulled=false;let glowIndex=0;
    for(const sx of [-1,1])for(const sz of [-1,1]){
      glowDummy.position.set(sx*72.3,38,sz*53.5);glowDummy.scale.set(14,9,1);glowDummy.updateMatrix();glowMesh.setMatrixAt(glowIndex++,glowDummy.matrix);
    }
    glowMesh.instanceMatrix.needsUpdate=true;lamps.add(glowMesh);
    lamps.visible=!omitted.has('Halos');root.add(lamps);
    const hemi=new THREE.HemisphereLight('#bed7ed','#263b42',2.3);
    const key=new THREE.DirectionalLight('#dce8f0',2.4);key.position.set(-12,65,24);
    const fill=new THREE.DirectionalLight('#d9b286',.45);fill.position.set(34,22,-40);
    root.add(hemi,key,fill,key.target,fill.target);
    ownedFog=new THREE.Fog('#182b3b',170,540);scene.background=sky;scene.fog=ownedFog;scene.add(root);
    const setLOD=(index)=>{
      if(!Number.isInteger(index)||index<0||index>2)throw new RangeError('LOD must be 0, 1 or 2');
      if(disposed)throw new Error('Stadium has been disposed');
      levels.forEach((group,i)=>{group.visible=i===index;});lod=index;return lod;
    };
    const localPosition=new THREE.Vector3();
    return {
      root,levels,lights:{hemi,key,fill},textures:maps,
      get lod(){return lod;},setLOD,
      get roofCutawayActive(){return roofCutawayActive;},
      update(camera,seconds=0,{autoLOD=true,reducedMotion=false,roofCutaway=true}={}){
        if(disposed)return;time.value=reducedMotion?0:seconds;
        if(camera){
          root.updateWorldMatrix(true,false);camera.getWorldPosition(localPosition);root.worldToLocal(localPosition);
          // Tracking cameras can sit above the near canopy at the touchline.
          // Cut only the near roof/supports, retaining the continuous bowl,
          // facade and windscreen. Geometry submissions remain conservative.
          const dx=Math.max(Math.abs(localPosition.x)-48,0),dz=Math.max(Math.abs(localPosition.z)-29,0);
          roofCutawayActive=roofCutaway&&(dx*dx+dz*dz>28.9*28.9);
          if(roofCutawayActive){const length=Math.hypot(localPosition.x,localPosition.z);roofPlane.value.set(localPosition.x/length,0,localPosition.z/length,-16);}
          else roofPlane.value.set(0,0,0,-1);
          if(autoLOD){
            const distance=localPosition.length(),current=LOD_DISTANCES[lod];
            // Hysteresis prevents rapid level flicker near a threshold.
            if(lod<2&&distance>LOD_DISTANCES[lod+1]+5)setLOD(lod+1);
            else if(lod>0&&distance<current-5)setLOD(lod-1);
          }
        }
      },
      metrics(){const metric=measureTriangles(root);metric.parts.Sky=2;metric.total+=2;return {...metric,lod,budget:NON_PLAYER_BUDGET,remaining:NON_PLAYER_BUDGET-metric.total};},
      dispose(){if(disposed)return;if(scene.background===sky)scene.background=previousBackground;if(scene.fog===ownedFog)scene.fog=previousFog;release();},
    };
  }catch(error){release();throw error;}
}
