// racing-liveries-v1 (Codex, CC0; assets/racing-liveries-v1, copied from design/racing-liveries-v1 without its preview and evidence): the six league teams race in their
// own liveries. Both cars of a team wear the team colour of TEAMS (racing-league-core) on the body, the wings and the engine fin wear the team's darker secondary colour,
// a centre stripe runs along X = 0 (7 cm on car A, 10 cm on car B, with pinstripes beside it) and the number plates sit on the nose, the sidepods, the rear-wing
// endplates and (from the chase camera) the rear face of the rear wing. Far cars (the light silhouettes) get the same body, wing and stripe colours.
// Off with ?racingLiveries=0: every car, the tower, the grid card and the podium keep each driver's own colour exactly as before; any load problem keeps the plain
// team colour on the cars (the palettes and plates are checked against TEAMS and GRID_DRIVERS first, all or nothing).
// The GLB has no UVs, so the paint is object space (the Codex adapter, apply-livery.mjs): one shader material per formula car on the merged paint mesh, so a car
// still costs one paint draw call; a per-vertex `livPart` attribute, written before racing-view merges the paint parts, tells body, rear wing, front wing and fin apart.
import {TEAMS,GRID_DRIVERS,LIVERIES,liveriesEnabled} from './racing-league-core.mjs?v=island-v2-20261107-11';
export {LIVERIES,liveriesEnabled};

export const LIVERY_DIR='../assets/racing-liveries-v1/';
/** Paint parts of the formula model, by node name (manifest.mapping: primaryNodes Body, secondaryNodes FrontWing/RearWing/EngineFin, stripeNodes Body/FrontWing/RearWing). */
export const PART=Object.freeze({Body:0,RearWing:1,FrontWing:2,EngineFin:3});
/** The number plate of a driver: numbers/<team>-<number>.png (the palettes name the same file; loadLiveries checks it). */
export const plateFile=d=>`numbers/${d.teamId}-${d.number}.png`;
export const LIVERY_FILES=Object.freeze(['manifest.json',...TEAMS.map(t=>`palettes/${t.id}.json`),...GRID_DRIVERS.map(plateFile)]);
export const liveryUrl=(file,version='island-v2-20261107-11')=>new URL(LIVERY_DIR+file+(version?'?v='+version:''),import.meta.url).href;
/** The plate inside its 512 x 512 PNG (measured: x 20..492, y 122..390 from the top), as texture coordinates [u0, v0, u1, v1] (v up). */
export const PLATE_UV=Object.freeze([20/512,1-390/512,492/512,1-122/512]);

const hex=c=>String(c||'').toLowerCase();
async function json(file,version){const r=await fetch(liveryUrl(file,version));if(!r.ok)throw Error(`racing livery ${file}: ${r.status}`);return r.json();}

/** Loads and checks the manifest and the six palettes (seven small JSON files), then the number plates of `drivers` (ids; the formula cars). Rejects on any mismatch with
 * TEAMS / GRID_DRIVERS, so the caller keeps the plain team colours. `readJson` and `loadTexture` are for tests. */
export async function loadLiveries({T=null,drivers=[],version='island-v2-20261107-11',readJson=file=>json(file,version),loadTexture=null,keep=v=>v,anisotropy=4}={}){
 const manifest=await readJson('manifest.json'),mapping=manifest?.mapping;
 if(manifest?.version!==1||mapping?.material!=='Paint 1'||!Array.isArray(manifest.teams))throw Error('racing liveries: manifest');
 for(const name of Object.keys(PART))if(![...mapping.primaryNodes,...mapping.secondaryNodes].includes(name))throw Error('racing liveries: no part '+name);
 for(const face of ['top','both-sides','endplates'])if(!mapping.numberProjections?.some(p=>p.face===face))throw Error('racing liveries: no '+face+' plate');
 const palettes=await Promise.all(manifest.teams.map(t=>readJson(t.palette))),byTeam=new Map(),byDriver=new Map();
 for(const p of palettes){
  const team=TEAMS.find(t=>t.id===p?.id);
  if(!team||hex(p.primary)!==hex(team.color)||!/^#[0-9a-f]{6}$/i.test(p.secondary)||!/^#[0-9a-f]{6}$/i.test(p.stripe))throw Error('racing liveries: palette '+p?.id);
  byTeam.set(p.id,p);
  for(const car of p.cars||[]){const d=GRID_DRIVERS.find(x=>x.id===car.driverId);
   if(!d||d.teamId!==p.id||d.number!==car.number||car.numberPlate!==plateFile(d)||!(car.stripeWidth>0))throw Error('racing liveries: car '+car.driverId);
   byDriver.set(car.driverId,{palette:p,car});}
 }
 if(byTeam.size!==TEAMS.length||byDriver.size!==GRID_DRIVERS.length)throw Error('racing liveries: incomplete');
 const plates=new Map();
 if(drivers.length&&(T||loadTexture)){
  const load=loadTexture||(file=>new T.TextureLoader().loadAsync(liveryUrl(file,version)));
  await Promise.all([...new Set(drivers)].map(async id=>{const e=byDriver.get(id);if(!e)return;const t=keep(await load(e.car.numberPlate));
   // sRGB sampler: the GPU decodes the PNG, so the same texture serves the paint shader and the plain decal material
   if(T){t.colorSpace=T.SRGBColorSpace;t.anisotropy=anisotropy;}plates.set(id,t);}));
 }
 return {manifest,mapping,byTeam,byDriver,plates,
  /** livery of a grid driver: {palette, car} or null */
  of:id=>byDriver.get(id)||null};
}

/** Part index of a paint mesh by its node (GLTFLoader turns a multi-material node into a group of meshes, so the group's name counts too); -1 = not paint. */
export function partOf(object){
 for(const name of [object.name,object.parent?.isGroup?object.parent.name:''])if(name in PART)return PART[name];
 return -1;
}
/** Writes the per-vertex part index on every paint mesh of the loaded formula scene (before racing-view merges the paint meshes into one). Returns how many. */
export function tagParts(T,scene,material='Paint 1'){
 let tagged=0;
 scene.traverse(o=>{if(!o.isMesh)return;const part=partOf(o),list=Array.isArray(o.material)?o.material:[o.material];if(part<0||!list.some(m=>m?.name===material))return;
  o.geometry.setAttribute('livPart',new T.Float32BufferAttribute(new Float32Array(o.geometry.attributes.position.count).fill(part),1));tagged++;});
 if(!tagged)throw Error('racing liveries: no paint parts');
 return tagged;
}

/** The paint of one formula car: the palette finish with the Codex object-space shader (body / secondary sill, wings and fin, centre stripe and pinstripes, number
 * plates on the nose, the sidepods and the rear-wing endplates). All cars share one program (customProgramCacheKey); only the uniforms differ. */
export function liveryMaterial(T,{palette,car,mapping,plate=null,envMapIntensity=1}){
 const m=new T.MeshPhysicalMaterial({...palette.finish,color:palette.primary,name:mapping.material,envMapIntensity});
 const proj=face=>{const p=mapping.numberProjections.find(x=>x.face===face);return new T.Vector4(p.center[0],p.center[1],p.size[0],p.size[1]);};
 const s=mapping.bodySecondary;
 const uniforms={livPrimary:{value:new T.Color(palette.primary)},livSecondary:{value:new T.Color(palette.secondary)},livStripe:{value:new T.Color(palette.stripe)},livPin:{value:new T.Color(palette.pinstripe||palette.secondary)},
  livPlate:{value:plate},livHasPlate:{value:plate?1:0},livHalfWidth:{value:car.stripeWidth/2},livPinWidth:{value:car.pinstripeWidth||0},
  livSill:{value:new T.Vector3(s.maxY,s.minAbsX,s.feather)},livNose:{value:proj('top')},livSide:{value:proj('both-sides')},livRear:{value:proj('endplates')}};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='attribute float livPart;\nvarying vec3 livPosition;\nvarying vec3 livNormal;\nvarying float livPartV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlivPosition = position; livNormal = normal; livPartV = livPart;');
  shader.fragmentShader=`varying vec3 livPosition; varying vec3 livNormal; varying float livPartV;
uniform vec3 livPrimary, livSecondary, livStripe, livPin, livSill;
uniform vec4 livNose, livSide, livRear;
uniform float livHalfWidth, livPinWidth, livHasPlate;
uniform sampler2D livPlate;
vec4 livPlateAt(vec2 uv){ if(livHasPlate < 0.5 || min(uv.x, uv.y) < 0.0 || max(uv.x, uv.y) > 1.0) return vec4(0.0); return texture2D(livPlate, uv); }
`+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 {
  vec3 p = livPosition; vec3 n = normalize(livNormal);
  float role = livPartV < 0.5 ? 0.0 : (livPartV < 1.5 ? 1.0 : 2.0);
  float hasStripe = livPartV < 2.5 ? 1.0 : 0.0;
  vec3 paint = role < 0.5 ? livPrimary : livSecondary;
  if (role < 0.5) {
   float sill = (1.0 - smoothstep(livSill.x - livSill.z, livSill.x + livSill.z, p.y)) * smoothstep(livSill.y, livSill.y + livSill.z, abs(p.x));
   paint = mix(paint, livSecondary, sill);
  }
  float edge = max(fwidth(p.x), 0.0008);
  float line = 1.0 - smoothstep(livHalfWidth - edge, livHalfWidth + edge, abs(p.x));
  float pin = 1.0 - smoothstep(livPinWidth - edge, livPinWidth + edge, abs(abs(p.x) - (livHalfWidth + 0.016)));
  paint = mix(paint, livPin, pin * hasStripe);
  paint = mix(paint, livStripe, line * hasStripe);
  vec4 plate = vec4(0.0);
  if (role < 0.5 && n.y > 0.25) plate = livPlateAt(vec2(0.5 + (p.x - livNose.x) / livNose.z, 0.5 - (p.z - livNose.y) / livNose.w));
  if (role < 0.5 && abs(n.x) > 0.5 && abs(p.x) > 0.34) plate = livPlateAt(vec2(0.5 - sign(p.x) * (p.z - livSide.x) / livSide.z, 0.5 + (p.y - livSide.y) / livSide.w));
  if (role > 0.5 && role < 1.5 && abs(n.x) > 0.5 && abs(p.x) > 0.64) plate = livPlateAt(vec2(0.5 - sign(p.x) * (p.z - livRear.x) / livRear.z, 0.5 + (p.y - livRear.y) / livRear.w));
  diffuseColor.rgb = mix(paint, plate.rgb, plate.a);
 }`);
 };
 m.customProgramCacheKey=()=>'racing-liveries-v1';
 m.userData.livery={team:palette.id,driverId:car.driverId,number:car.number,variant:car.variant};
 return m;
}

/** Number plate on the rear face of the rear wing (what the chase camera sees of the cars ahead): the same PNG as the shader, cropped to the plate, one quad. */
export function addRearPlate(T,car,plate,keep,{x=-.27,y=.92,z=-2.312,width=.46}={}){
 const [u0,v0,u1,v1]=PLATE_UV,g=keep(new T.PlaneGeometry(width,width*(v1-v0)/(u1-u0))),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)?u1:u0,uv.getY(i)?v1:v0);uv.needsUpdate=true;
 const m=new T.Mesh(g,keep(new T.MeshBasicMaterial({map:plate,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false})));
 m.name='livery-rear-plate';m.position.set(x,y,z);m.rotation.y=Math.PI;car.add(m);return m;
}

/** Colours of the light far-car silhouette (racing-car-look createStandIn): body, wings and the centre stripe of the team's livery. */
export function standInColors(livery){
 if(!livery)return null;
 const {palette,car}=livery;return {paint:palette.primary,accent:palette.secondary,stripe:palette.stripe,stripeWidth:car.stripeWidth};
}
