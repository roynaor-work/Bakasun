/** Basketball v24.1 bodies (Roy: "upgraded players with the shared character"): Codex athlete-body-v2 guard / wing / centre (CC0; runtime copy in
 * assets/hoops-v241/body/models), the same upgraded shared body soccer v24 plays on: hands with a thumb and two finger groups, and the player's
 * number on the back and on the shorts drawn in the shader (athlete-body-v2.mjs decorateAthleteV2: seven-segment digits, no texture, no extra
 * draw call). Rig, rest pose, hair caps, atlas and region colours are the v22 ones: the pack measured 249 basketball clips x 3 bodies with 0 m
 * difference on the original vertices, so every motion library plays unchanged. The bodies' atlas is byte for byte the v22 atlas: the loader
 * is pointed at that file (one download, one texture). `?hoopsBodyV2=0` keeps the v22 bodies exactly. */
import {V22_BASE,V22_HAIR,V22_BODIES} from './athlete-body-v22.mjs?v=island-v2-20261107-23';
import {athleteRig} from './athlete-body.mjs';

export const HOOPS_V2_BODIES=Object.freeze(['guard','wing','center']);
/** Width and depth of each body in the pack's rest space (design/athlete-body-v2/runtime/appearance.mjs BODY_SHAPES): the number masks are
 * measured on the soccer body, a wider body stretches them by these factors. */
export const HOOPS_V2_BODY_SHAPES=Object.freeze({guard:Object.freeze([.97,.98]),wing:Object.freeze([1.045,1.035]),center:Object.freeze([1.12,1.09])});
export const hoopsV2BodyUrl=id=>new URL('../assets/hoops-v241/body/models/'+id+'.glb',import.meta.url).href;
const CANON18=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];

/** A GLTFLoader whose texture requests for the v2 bodies' '../textures/athlete-atlas.png' go to the v22 atlas (the same bytes). */
export function hoopsV2Loader(T,GLTFLoader){
  const atlas=new URL(V22_BASE,import.meta.url).href+'textures/athlete-atlas.png';
  const manager=new T.LoadingManager();manager.setURLModifier(url=>/\/hoops-v241\/body\/(?:[^?#]*\/)?athlete-atlas\.png(?:[?#]|$)/.test(url)?atlas:url);
  return new GLTFLoader(manager);
}

/** The three v2 bodies and the v22 hair caps. `load(loader, url)` is the game's GLB loader (loadHoopsGLTF). Returns the loadAthleteV22 shape
 * ({bodies:{guard,wing,center}, hair, material}) plus v2:true, so createAthleteV22Instance takes it as it is. Throws on a file that is not
 * a v2 body (no glove attribute / morph): the caller keeps the v22 bodies. */
export async function loadHoopsBodyV2({T,GLTFLoader,load,bodies=HOOPS_V2_BODIES}){
  const loader=hoopsV2Loader(T,GLTFLoader),v22=new URL(V22_BASE,import.meta.url).href;
  const [bodyData,hairData]=await Promise.all([Promise.all(bodies.map(id=>load(loader,hoopsV2BodyUrl(id)))),Promise.all(V22_HAIR.map(id=>load(loader,v22+'hair/'+id+'.glb')))]);
  const out={bodies:{},hair:{},material:null,v2:true};
  bodies.forEach((id,i)=>{
    const scene=bodyData[i].scene;scene.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(scene),bones={};scene.traverse(o=>{if(o.isBone)bones[o.name]=o;});
    for(const name of CANON18)if(!bones[name])throw Error('Athlete body v2 lacks bone '+id+'/'+name);
    let mesh=null;scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
    if(!mesh?.geometry.attributes._glove||mesh.morphTargetDictionary?.goalkeeper_gloves===undefined)throw Error('Athlete body v2: '+id+' has no glove morph');
    out.bodies[id]={scene,height:box.max.y-box.min.y,floor:box.min.y,rig:athleteRig(scene),bones,info:V22_BODIES[id],id};
    if(!out.material){const map=mesh.material.map||null;if(map)map.colorSpace=T.SRGBColorSpace;out.material=new T.MeshStandardMaterial({name:'athlete_shared',map,vertexColors:true,roughness:.88,metalness:0});}
  });
  V22_HAIR.forEach((id,i)=>{out.hair[id]=hairData[i].scene;});
  return out;
}
