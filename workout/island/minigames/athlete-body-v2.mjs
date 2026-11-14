/** Codex athlete-body-v2 (13/11/2026, CC0) on the soccer players: the v22 shared body with real hands (thumb and two finger groups),
 * a keeper-glove morph and the shirt number on the back and on the left leg of the shorts, drawn in the shader (seven-segment digits,
 * no texture, no extra draw call). The body file is the pack's runtime/models/soccer.glb (runtime copy in assets/soccer-v24/body); its
 * atlas is byte for byte the v22 atlas, so the loader is pointed at that file (one download, one texture). Hair caps, skin, kit colours
 * and the 18-bone rig are the v22 ones: every motion library plays on it unchanged (the pack measured 475 clips, 0 m difference on the
 * original vertices). `?athleteBodyV2=0` keeps the v22 body exactly.
 * The shader below is the pack's runtime/appearance.mjs masks, applied to the v22 instance instead of a deep clone of the whole scene
 * (decorateAthlete clones every attribute and the four morphs per player: about 0.7 MB a player; here only the colour attribute is
 * per player, as in v22). The chest crest mask is off (no team mark yet). */
import {V22_BASE,V22_HAIR,V22_BODIES,V22_REGION,v22Colors} from './athlete-body-v22.mjs?v=island-v2-20261107-12';
import {athleteRig} from './athlete-body.mjs';
import {soccerV24Url,soccerShirtNumber} from './soccer-v24.mjs?v=island-v2-20261107-12';

export const V2_BODY_URL=()=>soccerV24Url('body/models/soccer.glb');
const CANON18=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
/** Shape of the soccer body in the pack (width, depth): the masks are measured in the rest space of this body. */
const SHAPE=[1,1];

const VARYINGS=`
varying vec3 vAthleteRest;
varying vec3 vAthleteNormal;
varying float vAthleteRegion;
varying float vAthleteGlove;
`;
const MASKS=`
uniform float athleteNumber;
uniform float athleteNumbers;
uniform float athleteCrest;
uniform float athleteGloves;
uniform vec3 athleteTrim;
uniform vec3 athleteSecondary;
float athleteSegment(vec2 p, vec2 a, vec2 b) {
  vec2 d = b-a;
  return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0))-.046;
}
float athleteDigit(vec2 p, float digit) {
  float n=floor(digit+.5);
  vec4 a; vec3 b;
  if(n<.5)      {a=vec4(1,1,1,1);b=vec3(1,1,0);}
  else if(n<1.5){a=vec4(0,1,1,0);b=vec3(0,0,0);}
  else if(n<2.5){a=vec4(1,1,0,1);b=vec3(1,0,1);}
  else if(n<3.5){a=vec4(1,1,1,1);b=vec3(0,0,1);}
  else if(n<4.5){a=vec4(0,1,1,0);b=vec3(0,1,1);}
  else if(n<5.5){a=vec4(1,0,1,1);b=vec3(0,1,1);}
  else if(n<6.5){a=vec4(1,0,1,1);b=vec3(1,1,1);}
  else if(n<7.5){a=vec4(1,1,1,0);b=vec3(0,0,0);}
  else if(n<8.5){a=vec4(1,1,1,1);b=vec3(1,1,1);}
  else         {a=vec4(1,1,1,1);b=vec3(0,1,1);}
  float d=2.0;
  if(a.x>.5)d=min(d,athleteSegment(p,vec2(-.20,.42),vec2(.20,.42)));
  if(a.y>.5)d=min(d,athleteSegment(p,vec2(.26,.35),vec2(.26,.07)));
  if(a.z>.5)d=min(d,athleteSegment(p,vec2(.26,-.07),vec2(.26,-.35)));
  if(a.w>.5)d=min(d,athleteSegment(p,vec2(-.20,-.42),vec2(.20,-.42)));
  if(b.x>.5)d=min(d,athleteSegment(p,vec2(-.26,-.35),vec2(-.26,-.07)));
  if(b.y>.5)d=min(d,athleteSegment(p,vec2(-.26,.07),vec2(-.26,.35)));
  if(b.z>.5)d=min(d,athleteSegment(p,vec2(-.20,0),vec2(.20,0)));
  float aa=max(length(fwidth(p))*.7,.003);
  return 1.0-smoothstep(-aa,aa,d);
}
float athleteNumberMask(vec2 uv) {
  if(athleteNumber<9.5)return athleteDigit(uv*vec2(1.05,1.0),athleteNumber);
  vec2 p=uv*vec2(1.8,1.0);
  return max(athleteDigit(p+vec2(.43,0),floor(athleteNumber/10.0)),
             athleteDigit(p-vec2(.43,0),mod(athleteNumber,10.0)));
}
float athleteCrestMask(vec2 p) {
  float d=max(abs(p.x)-.40, max(p.y-.44, -p.y+.7*abs(p.x)-.43));
  float aa=max(fwidth(d),.008);
  return 1.0-smoothstep(.025-aa,.025+aa,abs(d));
}
`;
/** Per-player material on the shared program (one compile for every player). */
function v2Material(T,shared,uniforms){
  const material=shared.clone();material.name='athlete_body_v2';material.vertexColors=true;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=VARYINGS+'attribute float _region;\nattribute float _glove;\nuniform vec2 athleteShape;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
        vAthleteRest=vec3(position.x/athleteShape.x,position.y,position.z/athleteShape.y);
        vAthleteNormal=normal;
        vAthleteRegion=_region;
        vAthleteGlove=_glove;
        #include <begin_vertex>
      `);
    shader.fragmentShader=VARYINGS+MASKS+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float shirt=1.0-step(.25,abs(vAthleteRegion-1.0));
        float shorts=1.0-step(.25,abs(vAthleteRegion-2.0));
        vec3 restNormal=normalize(vAthleteNormal);
        float back=shirt*step(.035,-vAthleteRest.z)*step(.35,-restNormal.z);
        float front=step(.035,vAthleteRest.z)*step(.35,restNormal.z);
        vec2 backUV=vec2(-vAthleteRest.x/ .23,(vAthleteRest.y-1.165)/ .27);
        vec2 shortsUV=vec2((vAthleteRest.x-.100)/ .072,(vAthleteRest.y-.732)/ .105);
        float marking=athleteNumbers*max(back*athleteNumberMask(backUV),shorts*front*athleteNumberMask(shortsUV));
        vec2 crestUV=vec2((vAthleteRest.x-.082)/ .058,(vAthleteRest.y-1.235)/ .070);
        marking=max(marking,athleteCrest*shirt*front*athleteCrestMask(crestUV));
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,clamp(marking,0.0,1.0));
        float glove=athleteGloves*step(.5,vAthleteGlove);
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteSecondary,glove);
        float cuff=glove*step(.768,vAthleteRest.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);
      `);
  };
  material.customProgramCacheKey=()=> 'athlete-body-v2-masks-1';
  return material;
}

let cache=null;
/** The v2 soccer body and the v22 hair caps, once per page; a failure is forgotten so the next match retries. Returns the same shape as
 * loadAthleteV22 ({bodies:{soccer}, hair, material}) plus v2:true, so createAthleteV22Instance takes it as it is. */
export function loadAthleteV2({T,GLTFLoader,retry=fn=>fn()}){
  if(cache)return cache;
  const v22=new URL(V22_BASE,import.meta.url).href,atlas=v22+'textures/athlete-atlas.png';
  // GLTFLoader asks for '<...>/soccer-v24/body/models/../textures/athlete-atlas.png' (not normalised): send it to the v22 file.
  const manager=new T.LoadingManager();manager.setURLModifier(url=>/\/soccer-v24\/body\/(?:[^?#]*\/)?athlete-atlas\.png(?:[?#]|$)/.test(url)?atlas:url);
  const loader=new GLTFLoader(manager);
  cache=(async()=>{
    const [body,...hair]=await Promise.all([retry(()=>loader.loadAsync(V2_BODY_URL())),...V22_HAIR.map(id=>retry(()=>loader.loadAsync(v22+'hair/'+id+'.glb')))]);
    const scene=body.scene;scene.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(scene),bones={};scene.traverse(o=>{if(o.isBone)bones[o.name]=o;});
    for(const name of CANON18)if(!bones[name])throw Error('Athlete body v2 lacks bone '+name);
    let mesh=null;scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
    if(!mesh?.geometry.attributes._glove||mesh.morphTargetDictionary?.goalkeeper_gloves===undefined)throw Error('Athlete body v2: no glove morph');
    const map=mesh.material.map||null;if(map)map.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshStandardMaterial({name:'athlete_shared',map,vertexColors:true,roughness:.88,metalness:0});
    return {bodies:{soccer:{scene,height:box.max.y-box.min.y,floor:box.min.y,rig:athleteRig(scene),bones,info:V22_BODIES.soccer,id:'soccer'}},
      hair:Object.fromEntries(V22_HAIR.map((id,i)=>[id,hair[i].scene])),material,v2:true};
  })();
  cache.catch(()=>{cache=null;});
  return cache;
}
export function resetAthleteV2(){cache=null;}

/** Numbers, gloves and the number / glove colours on one v22 instance of the v2 body. `kit` and `skin`/`hair` are the instance's own
 * (the number takes the kit's trim colour, the gloves its shorts colour, as the pack's appearance adapter does). Returns a controller. */
export function decorateAthleteV2(T,inst,{number=null,gloves=false,kit,appearance={},style='soccer'}){
  const colors=v22Colors({skin:appearance.skin,hair:appearance.hair,kit,style});
  const uniforms={athleteNumber:{value:0},athleteNumbers:{value:0},athleteCrest:{value:0},athleteGloves:{value:gloves?1:0},
    athleteTrim:{value:new T.Color(colors[V22_REGION.trim])},athleteSecondary:{value:new T.Color(colors[V22_REGION.shorts])},athleteShape:{value:new T.Vector2(...SHAPE)}};
  const owned=[];let decorated=0;
  for(const mesh of inst.meshes.full){
    if(!mesh.isSkinnedMesh||!mesh.geometry.attributes._glove)continue; // the hair cap keeps the shared material
    const material=v2Material(T,mesh.material,uniforms);mesh.material=material;owned.push(material);decorated++;
    const at=mesh.morphTargetDictionary?.goalkeeper_gloves;if(at!==undefined&&mesh.morphTargetInfluences)mesh.morphTargetInfluences[at]=gloves?1:0;
  }
  if(!decorated)throw Error('Athlete body v2: not a v2 body');
  let shown=null;
  const setNumber=n=>{const value=soccerShirtNumber(n);if(value===shown)return;shown=value;uniforms.athleteNumbers.value=value===null?0:1;uniforms.athleteNumber.value=value??0;};
  setNumber(number);
  return {uniforms,setNumber,get number(){return shown;},get gloves(){return uniforms.athleteGloves.value===1;},
    dispose(){for(const m of owned)m.dispose();owned.length=0;}};
}
