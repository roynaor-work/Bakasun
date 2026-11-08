/** Tennis v12: the Codex stadium package (design/tennis-stadium-v1, CC0, copied to assets/tennis-stadium-v1) in place of the v7 terraces and
 * 3D crowd: ten modular stands, 600 billboard fans in one draw call, sponsor boards with invented names, umpire chair, benches,
 * floodlights and a scoreboard, with an evening sky. The v7 court, net, ball and officials stay.
 * Upgrade only: ?tennisStadium=v11 (or 0) skips it, and any load error leaves the v7 venue untouched (nothing is hidden until
 * every file has loaded). Layout follows the package's scene.json; the game court is 18 m long where the package assumes 23.77 m,
 * so z positions are pulled in by the missing 2.89 m per end. */
const FILES=['stand-10m','ad-board','umpire-chair','player-bench','scoreboard','floodlight'];
export const PLACEMENTS=[
 ...[-1,1].flatMap(s=>[-10,0,10].map(z=>({model:'stand-10m',position:[s*10.4,0,z],rotationY:-s*Math.PI/2}))),
 ...[-1,1].flatMap(s=>[-5,5].map(x=>({model:'stand-10m',position:[x,0,s*19.5],rotationY:s<0?Math.PI:0}))),
 ...[-1,1].map(s=>({model:'player-bench',position:[s*8.1,0,5.8],rotationY:-s*Math.PI/2})),
 ...[-1,1].flatMap(s=>[-13,13].map(z=>({model:'floodlight',position:[s*10,0,z],rotationY:-s*Math.PI/2}))),
 ...[-1,1].flatMap(s=>[-8,-4,4,8].map(z=>({model:'ad-board',position:[s*9.35,0,z],rotationY:-s*Math.PI/2}))),
 ...[-6,6].map(x=>({model:'ad-board',position:[x,0,-17.5],rotationY:Math.PI})),
 ...[-6,6].map(x=>({model:'ad-board',position:[x,0,17.5],rotationY:0})),
 {model:'umpire-chair',position:[7.1,0,0],rotationY:-Math.PI/2},{model:'scoreboard',position:[0,0,-18.1],rotationY:Math.PI}
];
/** The package's real court is 36.57 m long with its baselines at +-11.885; ours are at +-halfLength. */
export function fitZ(z,halfLength){const missing=11.885-halfLength;return Math.abs(z)>=5?Math.sign(z)*(Math.abs(z)-missing):z;}
/** Seats (row, column) on a stand in its local frame, 5 rows x 12 columns = 60 fans per stand. */
export function standSeats(){const out=[];for(let row=0;row<5;row++)for(let col=0;col<12;col++)out.push({x:col<6?-4.5+col*.7:.95+(col-6)*.7,y:.28+row*.42-.025,z:.48+row*.88-.06,row,col});return out;}
export async function createTennisV12Stadium({T,scene,renderer,hemi,sun,keep,v7,params,config,GLTFLoader,base}){
 const flag=params?.get?.('tennisStadium');
 if(flag==='0'||flag==='v11'||!v7?.hideVenue||typeof document==='undefined')return null;
 const loader=new GLTFLoader(),url=n=>new URL(`../assets/tennis-stadium-v1/${n}?v=island-v2-20261107-5`,base);
 const [models,atlas,city]=await Promise.all([
  Promise.all(FILES.map(async n=>[n,(await loader.loadAsync(url(n+'.glb').href)).scene])),
  new T.TextureLoader().loadAsync(url('crowd-atlas.webp').href),new T.TextureLoader().loadAsync(url('evening-city.png').href)]);
 const library=new Map(models),halfLength=config.court.halfLength,group=new T.Group();group.name='tennis-v12-stadium';
 const disposables=[atlas,city],track=o=>{disposables.push(o);return o;};
 atlas.colorSpace=city.colorSpace=T.SRGBColorSpace;atlas.generateMipmaps=false;atlas.minFilter=atlas.magFilter=T.LinearFilter;
 // Static pieces are drawn instanced: one draw call per (model, mesh) instead of one per placed copy.
 const stands=[],byModel=new Map();
 for(const p of PLACEMENTS){const holder=new T.Object3D();holder.position.set(p.position[0],0,fitZ(p.position[2],halfLength));holder.rotation.y=p.rotationY;holder.updateMatrix();holder.matrixWorld.copy(holder.matrix);
  if(!byModel.has(p.model))byModel.set(p.model,[]);byModel.get(p.model).push(holder);if(p.model==='stand-10m')stands.push(holder);}
 for(const [name,holders] of byModel){const model=library.get(name);model.updateMatrixWorld(true);
  model.traverse(o=>{if(!o.isMesh)return;const mesh=new T.InstancedMesh(o.geometry,o.material,holders.length),m=new T.Matrix4();
   holders.forEach((h,k)=>{m.multiplyMatrices(h.matrixWorld,o.matrixWorld);mesh.setMatrixAt(k,m);});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.name=name;group.add(mesh);disposables.push(o.geometry);});}
 // 600 fans in one InstancedMesh: cell = variant, phase = when the hands go up.
 const plane=track(new T.PlaneGeometry(.88,1.76));plane.translate(0,.88,0);
 const count=stands.length*60,cells=new Float32Array(count*2),shades=new Float32Array(count);
 plane.setAttribute('cell',new T.InstancedBufferAttribute(cells,2));plane.setAttribute('shade',new T.InstancedBufferAttribute(shades,1));
 const cheer={value:0},material=track(new T.MeshBasicMaterial({map:atlas,side:T.DoubleSide,alphaTest:.5,color:'#b0c0cf'}));
 material.onBeforeCompile=shader=>{shader.uniforms.uCheer=cheer;
  shader.vertexShader=shader.vertexShader.replace('#include <uv_pars_vertex>','#include <uv_pars_vertex>\nattribute vec2 cell; attribute float shade; uniform float uCheer; varying vec2 vCellUv; varying float vShade;')
   .replace('#include <uv_vertex>','#include <uv_vertex>\nfloat cheering=step(cell.y,uCheer); float idx=cell.x*2.0+cheering; float col=mod(idx,8.0); float row=floor(idx/8.0); vec2 safeUv=mix(vec2(1.0/128.0,1.0/256.0),vec2(127.0/128.0,255.0/256.0),uv); vCellUv=(vec2(col,1.0-row-1.0)+safeUv)*vec2(1.0/8.0,1.0/2.0); vShade=shade;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>','#include <map_pars_fragment>\nvarying vec2 vCellUv; varying float vShade;').replace('#include <map_fragment>','diffuseColor*=texture2D(map,vCellUv); diffuseColor.rgb*=vShade;');};
 material.customProgramCacheKey=()=>'tennis-v12-crowd';
 const crowd=new T.InstancedMesh(plane,material,count);crowd.name='Crowd_v12';crowd.frustumCulled=false;
 const dummy=new T.Object3D(),point=new T.Vector3(),seats=standSeats();group.updateMatrixWorld(true);let i=0;
 for(const stand of stands)for(const s of seats){point.set(s.x,s.y,s.z).applyMatrix4(stand.matrixWorld);dummy.position.copy(point);dummy.rotation.set(0,stand.rotation.y+Math.PI,0);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);
  cells[i*2]=(i*7+s.row*3)%8;cells[i*2+1]=((i*47)%101)/101;shades[i]=.85-s.row*.04+(i%7)*.017;i++;}
 crowd.instanceMatrix.needsUpdate=true;group.add(crowd);
 const sky=new T.Mesh(track(new T.CylinderGeometry(95,95,70,48,1,true)),track(new T.MeshBasicMaterial({map:city,side:T.BackSide,fog:false,toneMapped:false,depthWrite:false})));sky.position.y=28;sky.renderOrder=-2;group.add(sky);
 // Everything is loaded: only now is the v7 venue hidden and the evening look applied.
 v7.hideVenue();scene.add(group);
 scene.background=new T.Color('#53647c');scene.fog?.color.set('#718095');
 hemi.color.set('#b4c8e6');hemi.groundColor.set('#343b35');hemi.intensity=1.35;sun.color.set('#ffd1a0');sun.intensity=2.1;sun.position.set(-24,19,10);renderer.toneMappingExposure=1.05;
 const clap={last:-1,left:0};let triangles=0;group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
 return {group,metrics:{fans:count,stands:stands.length,triangles},
  update(state,dt){const e=state?.event;if(e&&['point','game','complete'].includes(e.type)&&e.id!==clap.last){clap.last=e.id;clap.left=2.4;}clap.left=Math.max(0,clap.left-dt);cheer.value=clap.left>0?Math.min(1,clap.left):0;},
  dispose(){scene.remove(group);v7.showVenue?.();for(const d of disposables)d.dispose?.();group.traverse(o=>{if(o.isMesh&&o!==crowd&&o.geometry&&!o.geometry.userData?.shared)o.geometry.dispose?.();});}};
}
