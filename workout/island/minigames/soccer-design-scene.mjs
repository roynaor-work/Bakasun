import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {normalizeSoccerBallGeometry,soccerPitchUv,createSoccerStadiumSeatLod} from './soccer-scale.mjs';
import {retrying} from './soccer-design-character.mjs';

const modelUrl=name=>new URL('../design/'+(name==='soccer-stadium'?'models2/':'models/')+name+'.glb',import.meta.url).href;
const environmentUrl=name=>new URL('../design/environment/'+name,import.meta.url).href;
/** v6 goals (GPT, 04/11): volumetric tube net, runtime copy under assets/ (the review pack is not published). Off with ?soccerV6=0 or config soccer.v6.goals=false; any load or build failure keeps the v5 goals. */
const v6GoalUrl=new URL('../assets/soccer-v6/goals.glb',import.meta.url).href;
export const v6GoalsEnabled=(config,search=globalThis.location?.search||'')=>new URLSearchParams(search).get('soccerV6')!=='0'&&config?.v6?.goals!==false;

/** Presentation-only asset transaction. The caller keeps its fallback scenery
 * visible until onReady, and owns resources registered through track. Pitch,
 * goal mouth and ball dimensions always come from the simulation config. */
/** `stadium` (boolean or a promise of one): false = soccer v8 stadium is active, only the goals (with the net ripple) and the ball are built;
 * the stands, turf and sky come from soccer-v8-stadium.mjs and the old stadium files are never fetched. */
export function createSoccerDesignScene({scene,config,loader,track=x=>x,ballRoot,stadium:withStadium=true,onReady=()=>{},onError=()=>{}}){
  if(!loader?.loadAsync)throw new TypeError('Soccer scenery needs the local Draco GLTF loader');
  const root=new T.Group(),ball=new T.Group(),viewSides=[],meshes=[];
  root.name='soccer-design-scenery';ball.name='soccer-design-ball';root.visible=ball.visible=false;
  scene.add(root);ballRoot.add(ball);
  let disposed=false,status='loading',failure=null,textureCount=0,residentTriangles=0,lastWidth=0,lastHeight=0,viewDirection=1,renderQuality=0,seatLodStats=null;
  let goalsV6Used=false;const goalsV6Status=()=>goalsV6Used?'v6':'v5';
  let skyMaterial=null,skyLandscape=null,skyPortrait=null,netRipple=()=>{};
  const loadedTextures=[],loadedModels=[];
  const hx=config.pitch.length/2;
  const reportError=error=>{try{onError(error);}catch{}};

  function releaseSource(source){
    const released=new Set();
    source.traverse(object=>{
      for(const resource of [object.geometry,...(Array.isArray(object.material)?object.material:object.material?[object.material]:[])]){
        if(resource&&!released.has(resource)){released.add(resource);resource.dispose();}
      }
    });
  }
  function mesh(geometry,material,parent=root){
    const result=new T.Mesh(track(geometry),material);result.receiveShadow=true;
    result.castShadow=false;parent.add(result);meshes.push(result);
    residentTriangles+=(geometry.index?.count||geometry.attributes.position.count)/3;return result;
  }
  function bakedGeometry(object,matrix){return object.geometry.clone().applyMatrix4(matrix.clone().multiply(object.matrixWorld));}
  function merged(objects,transform){
    const parts=objects.map(object=>bakedGeometry(object,transform));
    const result=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    if(!result)throw new Error('Incompatible soccer scenery geometry');return result;
  }
  function projectedUv(geometry,metres){
    const positions=geometry.attributes.position,normals=geometry.attributes.normal,uv=new Float32Array(positions.count*2);
    for(let i=0;i<positions.count;i++){
      const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));
      // A plan-only projection collapses the UVs of vertical tier faces to a
      // line. Choose each flat face's dominant normal, keeping concrete grain
      // and distant supporters two-dimensional on risers and end terraces.
      if(nx>ny&&nx>nz){uv[i*2]=positions.getZ(i)/metres;uv[i*2+1]=positions.getY(i)/metres;}
      else if(ny>nz){uv[i*2]=positions.getX(i)/metres;uv[i*2+1]=positions.getZ(i)/metres;}
      else{uv[i*2]=positions.getX(i)/metres;uv[i*2+1]=positions.getY(i)/metres;}
    }
    geometry.setAttribute('uv',new T.BufferAttribute(uv,2));return geometry;
  }
  function sideVariant(geometry,side){
    const position=geometry.attributes.position,index=geometry.index,indices=[];
    for(let i=0;i<(index?.count||position.count);i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      const x=(position.getX(a)+position.getX(b)+position.getX(c))/3;
      // End terraces stay present. The bank on the camera's side is omitted:
      // its full-size imported tiers would otherwise hide touchline players
      // when viewed at the existing 28-degree gameplay elevation.
      if(Math.abs(x)>hx+.5||(position.getZ(a)+position.getZ(b)+position.getZ(c)>=0?1:-1)===side)indices.push(a,b,c);
    }
    const part=geometry.clone();part.setIndex(indices);part.computeBoundingBox();part.computeBoundingSphere();return part;
  }
  function refreshVisibility(){
    const detail=renderQuality>=3?'mobile':'full';
    for(const variant of viewSides)variant.mesh.visible=variant.side!==viewDirection&&(variant.detail==='all'||variant.detail===detail);
  }
  function sightlineMesh(geometry,material,detail='all'){
    // Each variant contains both end terraces plus only one side bank. Only
    // one variant renders: preserved end stands do not add a draw call.
    for(const side of [-1,1]){
      const result=mesh(sideVariant(geometry,side),material);
      viewSides.push({side,mesh:result,detail});
    }
    geometry.dispose();refreshVisibility();
  }
  function finish(texture,{repeat=null}={}){
    texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
    if(repeat){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(...repeat);}
    return track(texture);
  }
  function skyCrop(texture,width,height){
    if(!texture?.image||!width||!height)return;
    const aspect=width/height,imageAspect=texture.image.width/texture.image.height;
    texture.repeat.set(Math.min(1,aspect/imageAspect),Math.min(1,imageAspect/aspect));
    texture.offset.set((1-texture.repeat.x)/2,(1-texture.repeat.y)/2);
  }

  const textureLoader=new T.TextureLoader();
  // Settle the entire transaction so a failed texture never strands successful
  // GLB decodes or late image loads after the player has left the game.
  const useV6=v6GoalsEnabled(config),wantStadium=Promise.resolve(withStadium).then(Boolean);
  const requests=[...['soccer-stadium','soccer-goal','soccer-ball'].map(name=>name==='soccer-stadium'?wantStadium.then(want=>want?retrying(()=>loader.loadAsync(modelUrl(name)),name+'.glb').then(data=>{loadedModels.push(data.scene);return data.scene;}):null):retrying(()=>loader.loadAsync(modelUrl(name)),name+'.glb').then(data=>{loadedModels.push(data.scene);return data.scene;})),
    ...['textures/grass-mown.webp','textures/stand-concrete.webp','textures/crowd-dots.webp','backgrounds/stadium-day-landscape.webp','backgrounds/stadium-day-portrait.webp'].map(name=>wantStadium.then(want=>want?retrying(()=>textureLoader.loadAsync(environmentUrl(name)),name).then(texture=>{loadedTextures.push(texture);return texture;}):null)),
    useV6?retrying(()=>loader.loadAsync(v6GoalUrl),'soccer-v6/goals.glb').then(data=>{loadedModels.push(data.scene);return data.scene;}).catch(()=>null):Promise.resolve(null)];
  const ready=Promise.allSettled(requests).then(results=>{
    globalThis.performance?.mark?.('soccer:scene-build-start');
    const failure=results.find(result=>result.status==='rejected');
    if(disposed||failure){
      loadedModels.forEach(releaseSource);loadedTextures.forEach(texture=>texture.dispose());
      loadedModels.length=loadedTextures.length=0;
      if(!disposed){status='fallback';failure=String(failure.reason?.message||failure.reason);reportError(failure.reason);}return false;
    }
    const [stadiumSource,goalSource,ballSource,grass,concrete,crowd,landscape,portrait,v6Source]=results.map(result=>result.value);
    for(const source of loadedModels)source.updateMatrixWorld(true);
    const builtStadium=Boolean(stadiumSource);
    if(builtStadium){finish(grass,{repeat:[1,1]});finish(concrete,{repeat:[1,1]});finish(crowd,{repeat:[1,1]});
    skyLandscape=finish(landscape);skyPortrait=finish(portrait);textureCount=5;}
    const palette=track(new T.MeshStandardMaterial({color:'#d4dedb',vertexColors:true,roughness:.86,metalness:.02,side:T.FrontSide}));
    if(builtStadium){
    const concreteMaterial=track(new T.MeshStandardMaterial({color:'#b9c3c2',map:concrete,roughness:.96,metalness:0,side:T.FrontSide}));
    const crowdMaterial=track(new T.MeshLambertMaterial({color:'#aab5b8',map:crowd,side:T.FrontSide}));
    // Authoring pitch is 68m wide in X and 105m long in Z. Rotate its long
    // axis into game X, then scale each horizontal axis independently. Imported
    // full-size field markings are deliberately excluded: game lines stay exact.
    const sx=config.pitch.length/105,sz=config.pitch.width/68,sy=Math.min(sx,sz);
    const stadiumTransform=new T.Matrix4().makeScale(sx,sy,sz).multiply(new T.Matrix4().makeRotationY(Math.PI/2));
    const get=name=>stadiumSource.getObjectByName(name);
    sightlineMesh(merged(['aisles','beams','floodlights','upper_aisles','substitute_benches','advertising_boards','corner_flags'].map(get),stadiumTransform),palette);
    sightlineMesh(projectedUv(merged(['stand_shell','upper_stands'].map(get),stadiumTransform),3),concreteMaterial);
    sightlineMesh(projectedUv(merged(['seating','upper_seats'].map(get),stadiumTransform),10),crowdMaterial,'full');
    const upperSource=merged([get('upper_seats')],new T.Matrix4()),upperMobile=createSoccerStadiumSeatLod(upperSource);
    seatLodStats={...upperMobile.userData.soccerSeatLod};upperSource.dispose();upperMobile.applyMatrix4(stadiumTransform);
    const lowerSeats=merged([get('seating')],stadiumTransform),mobileSeats=mergeGeometries([lowerSeats,upperMobile]);lowerSeats.dispose();upperMobile.dispose();
    if(!mobileSeats)throw new Error('Incompatible soccer mobile seating geometry');
    sightlineMesh(projectedUv(mobileSeats,10),crowdMaterial,'mobile');
    sightlineMesh(merged([get('roof')],stadiumTransform),palette);
    const pitchMaterial=track(new T.MeshStandardMaterial({color:'#a6bba0',map:grass,roughness:.96,metalness:0}));
    // The 512px full-field tile has coarse high-contrast grass flecks. Bias
    // toward an existing mip level to soften those flecks while retaining its
    // authored mowing bands, UV scale and one texture sample per fragment.
    const sample='texture2D( map, vMapUv )',mapFragment=T.ShaderChunk.map_fragment;
    if(!mapFragment.includes(sample))throw new Error('Unsupported soccer turf map shader');
    // A second, finer sample of the same grass map breaks the visible tiling of
    // the full-field tile, and world-space wear (goal mouths, kick-off spot,
    // penalty spots) grounds the pitch like a used match surface. One extra
    // texture fetch per fragment; no extra draw call or texture.
    const turfMapFragment=mapFragment.replace(sample,'mix( texture2D( map, vMapUv, 1.25 ), texture2D( map, vMapUv * 7.0 + vec2( .13, .41 ), .5 ), .22 ) * vec4( vec3( ( 1. - soccerWear( vSoccerTurfWorld ) ) * mix( .93, 1.06, smoothstep( -.05, .05, sin( ( vSoccerTurfWorld.x + soccerHalfLength ) * 3.14159265 / 3.4 ) ) ) ), 1. )');
    pitchMaterial.onBeforeCompile=shader=>{
      shader.uniforms.soccerHalfLength={value:hx};shader.uniforms.soccerGoalHalf={value:config.pitch.goalWidth/2};shader.uniforms.soccerSpot={value:config.pitch.penaltySpot};
      shader.vertexShader='varying vec2 vSoccerTurfWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSoccerTurfWorld=vec2(position.x,position.z);');
      shader.fragmentShader='uniform float soccerHalfLength;uniform float soccerGoalHalf;uniform float soccerSpot;varying vec2 vSoccerTurfWorld;\n'+
        'float soccerWear(vec2 w){float mouth=exp(-dot((vec2(abs(w.x)-soccerHalfLength,w.y))/vec2(2.8,soccerGoalHalf*1.25),(vec2(abs(w.x)-soccerHalfLength,w.y))/vec2(2.8,soccerGoalHalf*1.25)));float spot=exp(-dot((vec2(abs(w.x)-(soccerHalfLength-soccerSpot),w.y))/1.1,(vec2(abs(w.x)-(soccerHalfLength-soccerSpot),w.y))/1.1));float centre=exp(-dot(w/2.6,w/2.6));return mouth*.16+spot*.08+centre*.07;}\n'+
        shader.fragmentShader.replace('#include <map_fragment>',turfMapFragment);
    };
    pitchMaterial.customProgramCacheKey=()=> 'soccer-design-turf-detail-wear-stripes-v4';
    // Use the imported texture-ready pitch, lowering its surface to y=0 so the
    // existing .018m lines and every contact shadow retain their depth order.
    const pitchGeometry=merged([get('pitch_surface')],stadiumTransform);pitchGeometry.translate(0,-.04*sy,0);
    soccerPitchUv(pitchGeometry,config.pitch.length,config.pitch.width);
    mesh(pitchGeometry,pitchMaterial);
    skyMaterial=track(new T.MeshBasicMaterial({map:skyLandscape,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
    skyMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position=vec4(transformed.xy,.9999,1.);');};
    const sky=mesh(new T.PlaneGeometry(2,2),skyMaterial);sky.frustumCulled=false;sky.renderOrder=-1000;sky.receiveShadow=false;
    }
    // Opening anchors are ±3.66 X at Z=.926, crossbar underside 2.44 Y.
    // Map those anchors to the existing game mouth, leaving collision rules alone.
    const goalParts=['crossbar','goal_post','goal_support','net'].map(name=>goalSource.getObjectByName(name));
    const goalGeometries=[];const depthScale=config.pitch.goalDepth/1.912;
    for(const direction of [-1,1]){
      const transform=new T.Matrix4().makeTranslation(direction*(hx+.926*depthScale),0,0)
        .multiply(new T.Matrix4().makeRotationY(-direction*Math.PI/2))
        .multiply(new T.Matrix4().makeScale(config.pitch.goalWidth/7.32,config.pitch.goalHeight/2.44,depthScale));
      goalGeometries.push(merged(goalParts,transform));
    }
    // The goal gets its own material so the net can billow after a goal: vertices
    // behind the goal line (the net, never the posts) are pushed along the pitch
    // axis by a uniform the view drives from the goal pulse.
    /** v6: both goals live in one tube-net file along Z (goal line at ±52.5, back at ±54.62). Each end is cut by the sign
     * of z, moved so its goal line is the origin, scaled to the game mouth and depth, turned onto X and placed at the goal line. */
    let goalsV6=null;
    if(v6Source){try{
      const parts=['goal_frames','woven_net'].map(name=>v6Source.getObjectByName(name));
      if(parts.some(part=>!part?.geometry))throw new Error('v6 goals incomplete');
      const ends=[];
      for(const end of [-1,1]){
        const pieces=parts.map(part=>{
          const source=part.geometry,position=source.attributes.position,index=source.index,keep=[];
          for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);if((position.getZ(a)+position.getZ(b)+position.getZ(c))*end>0)keep.push(a,b,c);}
          const piece=source.clone();piece.setIndex(keep);return piece;
        });
        const sz=config.pitch.goalDepth/2.12,transform=new T.Matrix4().makeTranslation(end*hx,0,0).multiply(new T.Matrix4().makeRotationY(Math.PI/2))
          .multiply(new T.Matrix4().makeScale(config.pitch.goalWidth/7.32,config.pitch.goalHeight/2.44,sz)).multiply(new T.Matrix4().makeTranslation(0,0,-end*52.5));
        const geometry=mergeGeometries(pieces.map(piece=>piece.applyMatrix4(transform)));pieces.forEach(piece=>piece.dispose());
        if(!geometry)throw new Error('v6 goals not mergeable');ends.push(geometry);
      }
      goalsV6=mergeGeometries(ends);ends.forEach(geometry=>geometry.dispose());
      if(!goalsV6||!goalsV6.attributes.color)throw new Error('v6 goals lack vertex colours');
    }catch(error){goalsV6=null;}}
    goalsV6Used=!!goalsV6;
    const goalMaterial=track(palette.clone());goalMaterial.userData.ripple={value:0};goalMaterial.userData.rippleTime={value:0};goalMaterial.userData.rippleSide={value:1};
    goalMaterial.onBeforeCompile=shader=>{
      shader.uniforms.soccerNetRipple=goalMaterial.userData.ripple;shader.uniforms.soccerNetTime=goalMaterial.userData.rippleTime;shader.uniforms.soccerNetSide=goalMaterial.userData.rippleSide;shader.uniforms.soccerNetLine={value:hx+.25};
      shader.vertexShader='uniform float soccerNetRipple;uniform float soccerNetTime;uniform float soccerNetSide;uniform float soccerNetLine;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nif(abs(position.x)>soccerNetLine&&sign(position.x)==soccerNetSide){float depth=clamp((abs(position.x)-soccerNetLine)/1.4,0.,1.);transformed.x+=sign(position.x)*sin(soccerNetTime*22.+position.z*2.3+position.y*2.)*soccerNetRipple*.3*depth;transformed.y-=soccerNetRipple*.05*depth;}');
    };
    goalMaterial.customProgramCacheKey=()=> 'soccer-design-goal-net-ripple-v3';
    if(goalsV6)goalMaterial.side=T.DoubleSide;
    const goalGeometry=goalsV6||mergeGeometries(goalGeometries);goalGeometries.forEach(geometry=>geometry.dispose());mesh(goalGeometry,goalMaterial);
    netRipple=(pulse,side,time)=>{goalMaterial.userData.ripple.value=pulse;goalMaterial.userData.rippleSide.value=side;goalMaterial.userData.rippleTime.value=time;};
    // Asset diameter .22m, anchor_ball_center (0,.11,0). BallRoot already
    // supplies simulation position and spin; imported ground offset is removed.
    const ballGeometry=merged([ballSource.getObjectByName('soccer_ball')],new T.Matrix4());
    normalizeSoccerBallGeometry(ballGeometry,config.physics.ballRadius);
    const ballMaterial=track(new T.MeshStandardMaterial({vertexColors:true,roughness:.48,metalness:.04}));
    mesh(ballGeometry,ballMaterial,ball).castShadow=true;
    loadedModels.forEach(releaseSource);loadedModels.length=0;loadedTextures.length=0;
    status='ready';root.visible=ball.visible=true;globalThis.performance?.mark?.('soccer:scene-build-end');
    try{onReady({stadium:builtStadium,goals:true,ball:true});}
    catch(error){root.visible=ball.visible=false;status='fallback';failure=String(error?.message||error);reportError(error);return false;}
    return true;
  }).catch(error=>{
    // Build errors also preserve the playable fallback. Registered resources
    // remain owned by the view and are reclaimed with the rest of the session.
    loadedModels.forEach(releaseSource);
    // Registered images are already owned by the caller's resource registry.
    // Only images not adopted into that registry need immediate disposal.
    if(!textureCount)loadedTextures.forEach(texture=>texture.dispose());
    loadedModels.length=loadedTextures.length=0;root.visible=ball.visible=false;
    if(!disposed){status='fallback';failure=String(error?.message||error);reportError(error);}return false;
  });
  return {
    ready,root,ball,
    metrics:()=>({status,failure,source:'design/models2/soccer-stadium',goals:goalsV6Status(),ballDiameterMetres:config.physics.ballRadius*2,seatDetail:renderQuality>=3?'mobile':'full',seatLod:seatLodStats,models:status==='ready'?3:0,textures:textureCount,
      triangles:status==='ready'?meshes.reduce((sum,mesh)=>sum+(mesh.visible?(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3:0),0):0,
      drawCalls:status==='ready'?meshes.filter(mesh=>mesh.visible).length:0,residentTriangles}),
    update(direction,width=lastWidth,height=lastHeight){
      viewDirection=direction;
      refreshVisibility();
      if(!skyMaterial||width===lastWidth&&height===lastHeight)return;
      lastWidth=width;lastHeight=height;const texture=height>width?skyPortrait:skyLandscape;
      skyCrop(texture,width,height);skyMaterial.map=texture;
    },
    setQuality(level){renderQuality=level;refreshVisibility();},
    /** Goal-net billow: pulse 0..1 decaying after a goal, side = sign of the scoring goal's x. */
    netRipple(pulse,side,time){netRipple(pulse,side,time);},
    dispose(){disposed=true;root.removeFromParent();ball.removeFromParent();}
  };
}
