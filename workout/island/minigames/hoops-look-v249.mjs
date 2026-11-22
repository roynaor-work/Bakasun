/** Basketball v24.9 "look" (22/11/2026). Roy: "the players look weird and bad". Measured on the shared athlete-body-v2 bodies in the game
 * (verification/hoops-v24-9): the body under the jersey pokes through it in motion (torn armholes and back), the socks are football socks up
 * to the knee with a toothed top, white shoes on white socks read as boots, a tall body is the 1.74 m body scaled whole (a 2.08 m centre has
 * a 28 cm head), flat one-colour kits, faces with no brows, and a crowd as bright as the players.
 *
 * Everything here works on the existing mesh, rig, atlas and clips (no new asset):
 *  - `cullCoveredSkin`     drops the body triangles that lie under the jersey and the shorts, so nothing can poke through (and fewer triangles);
 *  - the shader patch      crew socks with a clean top and a team stripe, a side stripe on jersey and shorts, a hem band, the number on the
 *                          chest, eyebrows, and a soft rim light that separates the player from the stands;
 *  - `hoopsLookProportions` head and hand scale per body height (about 7.8 heads instead of 7.3 on the tall bodies);
 *  - `hoopsLookKit`        shoes in the team colour;
 *  - `HOOPS_LOOK_CROWD_TINT` a darker crowd behind the players;
 *  - the scalp under the hair cap takes the hair colour (no bald patches), the football studs under the shoes go.
 * `?hoopsLook=0` (or `?hoopsV249=0`) returns v24.8 exactly. Pure except for the three.js objects it is handed. */
const read=(name,search)=>{try{return new URLSearchParams(search??globalThis.location?.search??'').get(name);}catch{return null;}};
export const hoopsV249Enabled=search=>read('hoopsV249',search)!=='0';
export const hoopsLookEnabled=search=>hoopsV249Enabled(search)&&read('hoopsLook',search)!=='0';

/** Rest-space measures of the body (metres at the body's natural 1.74 m; the three basketball bodies share them). */
export const HOOPS_LOOK=Object.freeze({
  sockTop:.272,        // crew sock: 10 cm over the shoe collar (the mesh sock ends at 0.396, under the knee)
  sockStripe:Object.freeze([.232,.252]),
  hemBand:.642,        // shorts hem at 0.615
  stripeZ:.012,stripeHalf:.02,stripeX:.105,stripeTop:1.2,
  chest:Object.freeze({y:1.235,w:.105,h:.125}),
  brow:Object.freeze({y:1.6165,x0:.014,x1:.047,rise:.003,half:.0034,zMin:.085}),
  rim:.55,lift:.05,
});
export const HOOPS_LOOK_CROWD_TINT='#6f7884';
const NATURAL=1.76;
/** Head and hand scale for a body `height` metres tall: the pack scales the whole 1.74 m body, so a tall player keeps a child's head ratio.
 * 70% of the way to a real head size, never under 0.86. */
export function hoopsLookProportions(height){
  const h=Number.isFinite(height)&&height>1?height:NATURAL,k=Math.max(.86,Math.min(1,1-.7*(1-NATURAL/h)));
  return {head:+k.toFixed(4),hand:+Math.max(.86,Math.min(.94,k-.02)).toFixed(4),heads:+(h/(.24*h/1.736*k)).toFixed(2)};
}
const hex=n=>n.toString(16).padStart(2,'0');
const rgb=h=>[1,3,5].map(i=>parseInt(String(h).slice(i,i+2),16)||0);
const lum=h=>{const [r,g,b]=rgb(h);return (.2126*r+.7152*g+.0722*b)/255;};
/** The kit with team-coloured shoes: the team's primary, darkened when it is light and lifted when it is nearly black, so the shoe never melts
 * into the white sock or the dark floor line. */
export function hoopsLookKit(kit){
  const p=kit?.primary||'#2868ee',[r,g,b]=rgb(p),l=lum(p),k=l>.6?.55:l<.12?1:.82,add=l<.12?46:0;
  return {...kit,boots:'#'+[r,g,b].map(v=>hex(Math.max(0,Math.min(255,Math.round(v*k+add))))).join(''),socks:'#f4f4f0'};
}

// ---- 1. body triangles under the kit ------------------------------------------------------------------------------------------------
const CLOTH=new Set([1,2,3]);
/** Pure. `positions` / `normals`: xyz per vertex in the pose the kit was fitted in (rest + the basketball morph); `regions`: one per vertex;
 * `index`: triangle list. A skin vertex is covered when a ray from it along its normal meets a kit triangle within `reach` metres (or the kit
 * is within `behind` metres under it: the body already touching the cloth). A skin triangle goes when its three vertices are covered.
 * `protect` (one flag per vertex): vertices that are never covered: the arms and hands hang beside the shorts in the rest pose, a ray from
 * them would meet the cloth. Returns {index (same array type), removed, kept, covered, studs}. */
export function cullCoveredSkin({positions,normals,regions,index,protect=null,reach=.06,behind=.012,yMin=.58,yMax=1.46,studs=.0125}){
  const cloth=[];
  for(let t=0;t<index.length;t+=3){
    const a=index[t],b=index[t+1],c=index[t+2];
    if(!CLOTH.has(regions[a])||!CLOTH.has(regions[b])||!CLOTH.has(regions[c]))continue;
    const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2],bx=positions[b*3],by=positions[b*3+1],bz=positions[b*3+2],cx=positions[c*3],cy=positions[c*3+1],cz=positions[c*3+2];
    cloth.push([ax,ay,az,bx-ax,by-ay,bz-az,cx-ax,cy-ay,cz-az,Math.min(ay,by,cy),Math.max(ay,by,cy)]);
  }
  const covered=new Uint8Array(regions.length);let n=0;
  for(let i=0;i<regions.length;i++){
    if(regions[i]!==0||protect&&protect[i])continue;
    const ox=positions[i*3],oy=positions[i*3+1],oz=positions[i*3+2];
    if(oy<yMin||oy>yMax)continue;
    let dx=normals[i*3],dy=normals[i*3+1],dz=normals[i*3+2];const dl=Math.hypot(dx,dy,dz)||1;dx/=dl;dy/=dl;dz/=dl;
    for(const tri of cloth){
      if(tri[9]>oy+reach||tri[10]<oy-reach)continue;
      // Moeller-Trumbore, both faces
      const e1x=tri[3],e1y=tri[4],e1z=tri[5],e2x=tri[6],e2y=tri[7],e2z=tri[8];
      const px=dy*e2z-dz*e2y,py=dz*e2x-dx*e2z,pz=dx*e2y-dy*e2x,det=e1x*px+e1y*py+e1z*pz;
      if(Math.abs(det)<1e-12)continue;
      const inv=1/det,tx=ox-tri[0],ty=oy-tri[1],tz=oz-tri[2],u=(tx*px+ty*py+tz*pz)*inv;
      if(u<-.02||u>1.02)continue;
      const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,v=(dx*qx+dy*qy+dz*qz)*inv;
      if(v<-.02||u+v>1.04)continue;
      const d=(e2x*qx+e2y*qy+e2z*qz)*inv;
      if(d>-behind&&d<reach){covered[i]=1;n++;break;}
    }
  }
  const out=new index.constructor(index.length);let k=0,removed=0,studTriangles=0;
  for(let t=0;t<index.length;t+=3){
    const a=index[t],b=index[t+1],c=index[t+2];
    if(covered[a]&&covered[b]&&covered[c]){removed++;continue;}
    // football studs under the sole (the shared body is the soccer body): the sole triangles that reach under `studs` metres
    if(studs>0&&regions[a]===5&&regions[b]===5&&regions[c]===5&&Math.min(positions[a*3+1],positions[b*3+1],positions[c*3+1])<studs){removed++;studTriangles++;continue;}
    out[k++]=a;out[k++]=b;out[k++]=c;
  }
  return {index:out.slice(0,k),removed,kept:k/3,covered:n,studs:studTriangles};
}
const PROTECTED=/Arm|Hand|Head|Neck/;
/** Pure: the vertices that belong to an arm, a hand, the neck or the head (over a third of their skin weight). `joint(i,k)` / `weight(i,k)`
 * read influence k (0..3) of vertex i; `names` are the skeleton's bone names. */
export function hoopsLookProtect(count,names,joint,weight){
  const out=new Uint8Array(count),hit=names.map(n=>PROTECTED.test(n));
  for(let i=0;i<count;i++){let w=0;for(let k=0;k<4;k++)if(hit[joint(i,k)])w+=weight(i,k);if(w>.34)out[i]=1;}
  return out;
}
/** The cull on a loaded body mesh (three.js BufferGeometry), once per geometry: the index is shared by every player cloned from the source.
 * Returns the stats, or null when the geometry is not a v2 body. */
export function cullBodyGeometry(T,mesh){
  const g=mesh?.geometry;if(!g?.index)return null;
  if(g.userData.hoopsLookCull)return g.userData.hoopsLookCull;
  const pos=g.attributes.position,nor=g.attributes.normal,reg=g.attributes._region||g.attributes._REGION;if(!pos||!nor||!reg)return null;
  const count=pos.count,positions=new Float32Array(count*3),normals=new Float32Array(count*3),regions=new Uint8Array(count);
  const at=mesh.morphTargetDictionary?.basketball,delta=at!==undefined?g.morphAttributes?.position?.[at]:null,rel=g.morphTargetsRelative!==false;
  for(let i=0;i<count;i++){
    let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(delta){if(rel){x+=delta.getX(i);y+=delta.getY(i);z+=delta.getZ(i);}else{x=delta.getX(i);y=delta.getY(i);z=delta.getZ(i);}}
    positions[i*3]=x;positions[i*3+1]=y;positions[i*3+2]=z;normals[i*3]=nor.getX(i);normals[i*3+1]=nor.getY(i);normals[i*3+2]=nor.getZ(i);regions[i]=reg.getX(i);
  }
  // arms, hands, neck and head are skinned to their own bones: never under the kit
  const si=g.attributes.skinIndex,sw=g.attributes.skinWeight,names=mesh.skeleton?.bones?.map(b=>b.name)||null;let protect=null;
  if(si&&sw&&names){protect=hoopsLookProtect(count,names,(i,k)=>si.getComponent(i,k),(i,k)=>sw.getComponent(i,k));}
  const r=cullCoveredSkin({positions,normals,regions,index:g.index.array,protect});
  if(r.removed){g.userData.hoopsLookIndex=g.index;g.setIndex(new T.BufferAttribute(r.index,1));}
  return g.userData.hoopsLookCull={removed:r.removed,kept:r.kept,covered:r.covered,studs:r.studs};
}

// ---- 2. the shader patch ------------------------------------------------------------------------------------------------------------
const f=n=>Number(n).toFixed(4);
const L=HOOPS_LOOK;
/** GLSL after the v2 number / glove block: `diffuseColor`, `vAthleteRest`, `vAthleteRegion`, `shirt`, `shorts`, `front`, `athleteTrim`,
 * `athleteNumbers` and `athleteNumberMask` are the v2 block's. Exported for the tests. */
export const HOOPS_LOOK_FRAGMENT=`
        // v24.9 look: crew socks (the mesh sock runs to the knee and the leg skin overlaps it with a toothed edge)
        float lookSock=1.0-step(.25,abs(vAthleteRegion-8.0));
        float lookAaY=max(fwidth(vAthleteRest.y),.0008);
        float lookAbove=smoothstep(${f(L.sockTop)}-lookAaY,${f(L.sockTop)}+lookAaY,vAthleteRest.y);
        // the skin texture was painted for a light body (pink knees and elbows): on the body it is flattened toward the player's own tone,
        // and the leg above the crew sock takes exactly that tone
        float lookSkin=1.0-step(.25,abs(vAthleteRegion));
        vec3 lookFlat=hoopsLookSkin*vec3(.52,.385,.375);
        diffuseColor.rgb=mix(diffuseColor.rgb,lookFlat,lookSkin*.75*(1.0-smoothstep(1.40,1.47,vAthleteRest.y)));
        diffuseColor.rgb=mix(diffuseColor.rgb,lookFlat,lookSock*lookAbove);
        // the shoulder under the jersey: the body pokes through the coarse armhole edge in motion; inside the armhole line it takes the jersey colour
        float lookAx=abs(vAthleteRest.x);
        float lookBack=step(vAthleteRest.z,-.055)*step(1.16,vAthleteRest.y)*step(vAthleteRest.y,1.385)*step(lookAx,.161+(vAthleteRest.y-1.252)*.3);
        float lookFrontArm=step(.062,vAthleteRest.z)*step(1.2,vAthleteRest.y)*step(vAthleteRest.y,1.345)*step(lookAx,.188-(vAthleteRest.y-1.204)/1.63);
        float lookStrap=step(.082,lookAx)*step(lookAx,.128)*step(1.345,vAthleteRest.y)*step(vAthleteRest.y,1.44);
        diffuseColor.rgb=mix(diffuseColor.rgb,hoopsLookShirt*.8,lookSkin*max(lookStrap,max(lookBack,lookFrontArm)));
        float lookStripe=lookSock*smoothstep(${f(L.sockStripe[0])}-lookAaY,${f(L.sockStripe[0])}+lookAaY,vAthleteRest.y)*(1.0-smoothstep(${f(L.sockStripe[1])}-lookAaY,${f(L.sockStripe[1])}+lookAaY,vAthleteRest.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,hoopsLookShirt,lookStripe);
        // side stripe on the jersey (under the armhole) and down the shorts, hem band
        float lookAaZ=max(fwidth(vAthleteRest.z),.0008);
        float lookSide=step(${f(L.stripeX)},abs(vAthleteRest.x))*(1.0-smoothstep(${f(L.stripeHalf)}-lookAaZ,${f(L.stripeHalf)}+lookAaZ,abs(vAthleteRest.z-${f(L.stripeZ)})));
        float lookPanel=lookSide*max(shorts,shirt*(1.0-smoothstep(${f(L.stripeTop)}-lookAaY,${f(L.stripeTop)}+lookAaY,vAthleteRest.y)));
        float lookHem=shorts*(1.0-smoothstep(${f(L.hemBand)}-lookAaY,${f(L.hemBand)}+lookAaY,vAthleteRest.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,max(lookPanel,lookHem));
        // the number on the chest
        vec2 lookChestUV=vec2(vAthleteRest.x/${f(L.chest.w)},(vAthleteRest.y-${f(L.chest.y)})/${f(L.chest.h)});
        diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,clamp(athleteNumbers*shirt*front*athleteNumberMask(lookChestUV),0.0,1.0));
        // the scalp pokes through the hair cap (bald patches on the crown): over the hairline and at the back of the head it takes the hair colour
        float lookScalp=lookSkin*max(step(1.695,vAthleteRest.y),step(1.635,vAthleteRest.y)*step(vAthleteRest.z,-.012)*step(abs(vAthleteRest.x),.082));
        diffuseColor.rgb=mix(diffuseColor.rgb,hoopsLookHair,lookScalp*.92);
        // eyebrows: a soft capsule over each eye in the hair colour
        vec2 lookBp=vec2(abs(vAthleteRest.x),vAthleteRest.y),lookBa=vec2(${f(L.brow.x0)},${f(L.brow.y)}),lookBd=vec2(${f(L.brow.x1-L.brow.x0)},${f(L.brow.rise)});
        float lookBrowD=length(lookBp-lookBa-lookBd*clamp(dot(lookBp-lookBa,lookBd)/dot(lookBd,lookBd),0.0,1.0))-${f(L.brow.half)}*(1.0-.45*smoothstep(${f(L.brow.x0)},${f(L.brow.x1)},lookBp.x));
        float lookBrow=lookSkin*step(${f(L.brow.zMin)},vAthleteRest.z)*(1.0-smoothstep(-.0012,.0012,lookBrowD));
        diffuseColor.rgb=mix(diffuseColor.rgb,hoopsLookHair,lookBrow*.88);
`;
export const HOOPS_LOOK_RIM=`
        #include <emissivemap_fragment>
        float hoopsLookRim=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),3.0);
        totalEmissiveRadiance+=diffuseColor.rgb*(hoopsLookRim*${f(L.rim)}+${f(L.lift)});
`;
const ANCHOR='diffuseColor.rgb=mix(diffuseColor.rgb,athleteTrim,cuff);';
/** Pure: the v2 fragment shader with the look block. Throws when the v2 anchor is missing (the caller keeps v24.8). */
export function patchHoopsLookFragment(src){
  if(!src.includes(ANCHOR))throw Error('Hoops look: v2 shader anchor missing');
  let out=src.replace(ANCHOR,ANCHOR+HOOPS_LOOK_FRAGMENT);
  if(out.includes('#include <emissivemap_fragment>'))out=out.replace('#include <emissivemap_fragment>',HOOPS_LOOK_RIM);
  return 'uniform vec3 hoopsLookSkin;\nuniform vec3 hoopsLookShirt;\nuniform vec3 hoopsLookHair;\n'+out;
}

/** The look on one player (a v22 instance of a v2 body, after decorateAthleteV2). `colors`: {skin, shirt, hair} hex. Returns a controller
 * ({uniforms, setKit(kit), proportions}) or null when the instance has no v2 material. */
export function applyHoopsLook(T,inst,{skin,shirt,hair='#1f1712',height=null}={}){
  const uniforms={hoopsLookSkin:{value:new T.Color(skin||'#9a6041')},hoopsLookShirt:{value:new T.Color(shirt||'#2868ee')},hoopsLookHair:{value:new T.Color(hair).multiplyScalar(.8)}};
  let n=0;
  for(const mesh of inst.meshes.full){
    const m=mesh.material;
    if(!mesh.isSkinnedMesh||m?.name!=='athlete_body_v2'||m.userData.hoopsLook)continue;
    const before=m.onBeforeCompile;
    m.onBeforeCompile=(shader,renderer)=>{before.call(m,shader,renderer);Object.assign(shader.uniforms,uniforms);shader.fragmentShader=patchHoopsLookFragment(shader.fragmentShader);};
    m.customProgramCacheKey=()=> 'athlete-body-v2-masks-1+hoops-look-v249-1';
    m.userData.hoopsLook=true;m.needsUpdate=true;n++;
  }
  if(!n)return null;
  const proportions=hoopsLookProportions(height??inst.height);
  inst.bones.Head?.scale.setScalar(proportions.head);
  for(const side of ['Left','Right'])inst.bones[side+'Hand']?.scale.setScalar(proportions.hand);
  return {uniforms,proportions,setKit(kit){if(kit?.primary)uniforms.hoopsLookShirt.value.set(kit.primary);}};
}
