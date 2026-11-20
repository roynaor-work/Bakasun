// racing-v24.7: the look of the six Codex v3 circuits (assets/racing-tracks-v3, built from design/racing-tracks-v3, CC0): the package's colours, its sky panorama
// on a dome and its eight trackside models per circuit. The existing scenery of the base theme (trees, stands, pits) stays under it. Any load problem leaves the
// circuit with the colours only; ?racingTracksV3=0 keeps the v2 circuits (racing-tracks.mjs), so nothing here runs.
const DIR='../assets/racing-tracks-v3/';
/** the v3 look of a track definition, or null (every circuit before v3) */
export const v3LookOf=track=>track?.v3&&track.v3.colors?track.v3:null;
/** Where the eight models stand in the game (pure; the view and the tests use it). The package puts them 6-10 m from the asphalt; the game keeps every solid
 * thing `clear` metres beyond the edge (the off-track flip brings a car back before that), so a model moves out until its whole footprint is beyond it. Along the
 * main straight the pits (left) and the stands (right) are in the way: there the models stand behind them. Models that float go out to the sea around the island.
 * reverse: the circuit runs the other way (stage.reverse): the same world places, mirrored distances. Returns [{id,asset,x,z,s,lat,yaw,r,water}] (yaw in radians). */
export function v3Placements(track,{clear=0,reverse=false,shore=null}={}){
 const look=v3LookOf(track);if(!look)return [];
 const L=track.length,half=track.width/2,main=track.mainStraight,out=[],k=look.scale||1;   // k: the plan was scaled (racing-tracks V3_LAP), so the distances along it are too
 const inMain=s=>{if(!main)return false;const d=((s-main.from)%L+L)%L;return d<main.length+25||d>L-25;};
 for(const o of look.props){
  const s=reverse?((L-o.s*k)%L+L)%L:o.s*k,side=(reverse?-1:1)*(Math.sign(o.lat)||1);
  let lat=Math.max(Math.abs(o.lat),half+clear+.6+o.r);
  if(!o.water&&inMain(s))lat=Math.max(lat,half+(side<0?46:32)+o.r);
  const p=track.sample(s);let x=p.x+p.normal.x*side*lat,z=p.z+p.normal.z*side*lat;
  if(o.water&&shore){const dx=x-shore.x,dz=(z-shore.z)/shore.k,d=Math.hypot(dx,dz)||1,R=Math.max(d,shore.r);x=shore.x+dx/d*R;z=shore.z+dz/d*R*shore.k;}
  out.push({id:o.id,asset:o.asset,x,z,s,lat:side*lat,yaw:p.heading+o.yaw*Math.PI/180+(reverse?Math.PI:0),r:o.r,water:!!o.water});
 }
 return out;
}
export async function loadV3Env({T,GLTFLoader,track,anisotropy=4}){
 const look=v3LookOf(track),loader=new GLTFLoader(),url=f=>new URL(DIR+f,import.meta.url).href;
 const [sky,models]=await Promise.all([
  new T.TextureLoader().loadAsync(url(look.sky)).then(t=>{t.colorSpace=T.SRGBColorSpace;t.wrapS=T.RepeatWrapping;t.anisotropy=anisotropy;return t;}),
  Promise.all(look.props.map(async o=>[o.asset,(await loader.loadAsync(url(o.asset))).scene]))
 ]);
 return {sky,models:new Map(models)};
}
/** bake = racing-env-v2 bake (one vertex-coloured mesh per model). groundAt(x,z) = the ground height the view drew there. */
export function buildV3Env({T,scene,track,keep,kit,bake,clear=0,reverse=false,groundAt,shore=null,seaY=-2.15}){
 const root=new T.Group();root.name='racing-tracks-v3';scene.add(root);let triangles=0,draws=0;
 // the sky: the panorama inside a sphere that follows the camera, drawn behind everything (no depth, no fog), over the gradient backdrop
 const dome=new T.Mesh(keep(new T.SphereGeometry(100,32,16)),keep(new T.MeshBasicMaterial({map:keep(kit.sky),side:T.BackSide,depthTest:false,depthWrite:false,fog:false})));
 dome.scale.x=-1;dome.frustumCulled=false;dome.renderOrder=-999;dome.onBeforeRender=(_r,_s,camera)=>{dome.position.copy(camera.position);dome.updateMatrixWorld(true);};root.add(dome);draws++;
 const placed=v3Placements(track,{clear,reverse,shore});
 for(const p of placed){const model=kit.models.get(p.asset);if(!model)continue;const group=new T.Group();group.name='v3-'+p.id;
  for(const part of bake(T,model,keep)){const mesh=new T.Mesh(part.geometry,part.material);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);draws++;triangles+=(part.geometry.index?part.geometry.index.count:part.geometry.attributes.position.count)/3;}
  group.position.set(p.x,p.water?seaY:groundAt(p.x,p.z),p.z);group.rotation.y=p.yaw;root.add(group);}
 return {root,placed,metrics:()=>({env:track.v3.env,sky:true,models:placed.length,triangles:Math.round(triangles),draws}),dispose(){root.removeFromParent();}};
}
