/** Soccer v24 pitch kit (Codex soccer-pitch-v1, CC0; runtime copy in assets/soccer-v24/pitch). Presentation only: the simulation, its
 * pitch numbers and the AI never read this module, so `?soccerPitchAssets=0` changes nothing but the look.
 *  - turf: the kit's mown grass (two stripe materials), scaled to the match pitch like the v23 markings;
 *  - lines: the kit's painted lines when they are the simulation's lines (soccerKitLines), otherwise the game keeps its own;
 *  - goals (frame, supports, net), four corner flags, eight blank boards and the ball, at real size on the game's mouth and corners.
 * Everything opaque is merged into two meshes (turf + props) with the colour factors baked into vertex colours, one material on the
 * shared atlas; the nets are one alpha-tested mesh; the ball one mesh: 4 draw calls for the whole kit, where the v8 turf, the game's
 * lines, the v6 goals, the v8 flags and LED boards and the design ball were 8. */
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {normalizeSoccerBallGeometry} from './soccer-scale.mjs';
import {SOCCER_KIT,soccerKitScale,soccerKitLines,soccerKitGoal,soccerKitFlags,soccerKitBoards,soccerV24Url} from './soccer-v24.mjs?v=island-v2-20261107-12';

const LINE_LIFT=.012; // the kit paints its lines 3 mm above the grass; the game's camera has no logarithmic depth, lift them to 15 mm (the game's own lines sit at 18 mm)
const matrix=(position,rotationY=0,scale=[1,1,1])=>new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),rotationY),new T.Vector3(...scale));

/** Geometry of every mesh of `source` (meshes named in `only`, all when null) transformed by `transform`, with the material's colour
 * factor written into a `color` attribute, UVs kept, index made non-shared; normals renormalised after a non-uniform scale. */
function bake(source,transform,{only=null,lift=0,flipSide=false}={}){
  const parts=[];source.updateMatrixWorld(true);
  source.traverse(o=>{
    if(!o.isMesh||only&&!only.includes(o.name)&&!only.includes(o.parent?.name))return;
    const g=o.geometry.clone();g.applyMatrix4(transform.clone().multiply(o.matrixWorld));
    if(lift){const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+lift);}
    const c=o.material.color||new T.Color(1,1,1),count=g.attributes.position.count,colors=new Float32Array(count*3);
    for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
    g.setAttribute('color',new T.BufferAttribute(colors,3));
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(name))g.deleteAttribute(name);
    if(g.attributes.normal){const n=g.attributes.normal,v=new T.Vector3();for(let i=0;i<n.count;i++){v.fromBufferAttribute(n,i).normalize();n.setXYZ(i,v.x,v.y,v.z);}}
    parts.push(g.index?g.toNonIndexed():g);
    // A double-sided cloth inside a single-sided merged mesh: add its back face (reversed winding, flipped normal).
    if(flipSide&&o.material.side===T.DoubleSide){
      const back=(g.index?g.toNonIndexed():g).clone(),p=back.attributes.position,n=back.attributes.normal,uv=back.attributes.uv,col=back.attributes.color;
      for(let i=0;i<p.count;i+=3)for(const a of [p,n,uv,col]){if(!a)continue;for(let k=0;k<a.itemSize;k++){const t=a.array[(i+1)*a.itemSize+k];a.array[(i+1)*a.itemSize+k]=a.array[(i+2)*a.itemSize+k];a.array[(i+2)*a.itemSize+k]=t;}}
      if(n)for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
      parts.push(back);
    }
  });
  return parts;
}

export function createSoccerPitchKit({scene,config,track=x=>x,renderer=null}){
  const pitch=config.pitch,lines=soccerKitLines(pitch),root=new T.Group(),ball=new T.Group();
  root.name='soccer-v24-pitch';ball.name='soccer-v24-ball';root.visible=ball.visible=false;scene.add(root);
  let status='loading',failure=null,disposed=false,triangles=0,drawCalls=0;
  const meshes=[];
  const loader=new GLTFLoader(),url=name=>soccerV24Url('pitch/'+name);
  const ready=Promise.all([new T.TextureLoader().loadAsync(url('atlas.png')),...['pitch','goal','corner_flag','ad_board','ball'].map(name=>loader.loadAsync(url(name+'.glb')))]).then(([atlas,...glbs])=>{
    // One shared atlas (TextureLoader, flipY false as glTF): the GLBs' own decodes of the same file are released, never uploaded.
    const sources=glbs.map(g=>g.scene);
    for(const source of sources)source.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat()){m.map?.dispose();}});
    if(disposed){atlas.dispose();sources.forEach(release);return false;}
    atlas.flipY=false;atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=renderer?Math.min(8,renderer.capabilities.getMaxAnisotropy()):4;track(atlas);
    const [pitchSource,goalSource,flagSource,boardSource,ballSource]=sources,{sx,sz}=soccerKitScale(pitch);
    const opaque=track(new T.MeshStandardMaterial({name:'soccer-v24-kit',map:atlas,vertexColors:true,roughness:.92,metalness:0}));
    // turf + lines: scaled to the pitch in both horizontal axes (the v23 way), lines lifted against depth fighting
    const turfScale=matrix([0,0,0],0,[sx,1,sz]);
    const turfParts=[...bake(pitchSource,turfScale,{only:['grass']}),...(lines.use?bake(pitchSource,turfScale,{only:['lines'],lift:LINE_LIFT}):[])];
    const turf=new T.Mesh(track(mergeGeometries(turfParts)),opaque);turf.name='soccer-v24-turf';turf.receiveShadow=true;turfParts.forEach(g=>g.dispose());
    // props: goal frames and supports, flags, boards (real size)
    const propParts=[];
    for(const side of [-1,1]){const g=soccerKitGoal(pitch,side);propParts.push(...bake(goalSource,matrix(g.position,g.rotationY,g.scale),{only:['frame','supports']}));}
    for(const f of soccerKitFlags(pitch))propParts.push(...bake(flagSource,matrix(f.position,f.rotationY),{flipSide:true}));
    for(const b of soccerKitBoards(pitch))propParts.push(...bake(boardSource,matrix(b.position,b.rotationY)));
    const props=new T.Mesh(track(mergeGeometries(propParts)),opaque);props.name='soccer-v24-props';props.castShadow=props.receiveShadow=true;propParts.forEach(g=>g.dispose());
    // nets: the kit's alpha-mask net on both goals (double sided, as authored)
    const netSource=goalSource.getObjectByName('net'),netMaterial=netSource.material;
    const net=track(new T.MeshStandardMaterial({name:'soccer-v24-net',map:atlas,vertexColors:true,roughness:.92,metalness:0,alphaTest:netMaterial.alphaTest||.45,side:T.DoubleSide}));
    const netParts=[];for(const side of [-1,1]){const g=soccerKitGoal(pitch,side);netParts.push(...bake(goalSource,matrix(g.position,g.rotationY,g.scale),{only:['net']}));}
    const nets=new T.Mesh(track(mergeGeometries(netParts)),net);nets.name='soccer-v24-nets';netParts.forEach(g=>g.dispose());
    // ball: centred, fitted to the simulation's radius (no camera-dependent enlargement)
    const ballGeometry=bake(ballSource,new T.Matrix4())[0];normalizeSoccerBallGeometry(ballGeometry,config.physics.ballRadius);
    const ballMesh=new T.Mesh(track(ballGeometry),opaque);ballMesh.name='soccer-v24-ball-mesh';ballMesh.castShadow=true;ball.add(ballMesh);
    sources.forEach(release);
    root.add(turf,props,nets);meshes.push(turf,props,nets,ballMesh);
    for(const m of meshes){if(!m.geometry)throw Error('Soccer v24 kit geometry missing');triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;}
    drawCalls=meshes.length;status='ready';root.visible=ball.visible=true;return true;
  }).catch(error=>{status='fallback';failure=String(error?.message||error);root.removeFromParent();ball.removeFromParent();return false;});
  function release(source){source.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of [o.material].flat())m.dispose();});}
  return {
    ready,root,ball,lines,
    get status(){return status;},
    metrics:()=>({status,failure,lines:lines.use?'kit':'game',linesReason:lines.reason,worstLineMetres:lines.worst,triangles,drawCalls,source:'assets/soccer-v24/pitch'}),
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();ball.removeFromParent();}
  };
}
/** Meshes of the v8 stadium the kit replaces: its turf, its corner flags and its LED ring (all LOD levels). The run-off, the bowl, the
 * benches and the rest stay. */
export const SOCCER_V8_KIT_PARTS=Object.freeze(['Pitch_Turf','PitchDetails_White','PitchDetails_WarmLight','Perimeter_Led','Perimeter_Steel']);
export function hideV8KitParts(v8){let hidden=0;v8?.root?.traverse(o=>{if(o.isMesh&&SOCCER_V8_KIT_PARTS.includes(o.name)){o.visible=false;hidden++;}});return hidden;}
export {SOCCER_KIT};
