import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {normalizeSoccerBallGeometry,soccerPitchUv,createSoccerStadiumSeatLod} from './soccer-scale.mjs';

const modelUrl=name=>new URL('../design/'+(name==='soccer-stadium'?'models2/':'models/')+name+'.glb',import.meta.url).href;
const environmentUrl=name=>new URL('../design/environment/'+name,import.meta.url).href;

/** Presentation-only asset transaction. The caller keeps its fallback scenery
 * visible until onReady, and owns resources registered through track. Pitch,
 * goal mouth and ball dimensions always come from the simulation config. */
export function createSoccerDesignScene({scene,config,loader,track=x=>x,ballRoot,onReady=()=>{},onError=()=>{}}){
  if(!loader?.loadAsync)throw new TypeError('Soccer scenery needs the local Draco GLTF loader');
  const root=new T.Group(),ball=new T.Group(),viewSides=[],meshes=[];
  root.name='soccer-design-scenery';ball.name='soccer-design-ball';root.visible=ball.visible=false;
  scene.add(root);ballRoot.add(ball);
  let disposed=false,status='loading',textureCount=0,residentTriangles=0,lastWidth=0,lastHeight=0,viewDirection=1,renderQuality=0,seatLodStats=null;
  let skyMaterial=null,skyLandscape=null,skyPortrait=null;
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
  const requests=[...['soccer-stadium','soccer-goal','soccer-ball'].map(name=>loader.loadAsync(modelUrl(name)).then(data=>{loadedModels.push(data.scene);return data.scene;})),
    ...['textures/grass-mown.webp','textures/stand-concrete.webp','textures/crowd-dots.webp','backgrounds/stadium-day-landscape.webp','backgrounds/stadium-day-portrait.webp'].map(name=>textureLoader.loadAsync(environmentUrl(name)).then(texture=>{loadedTextures.push(texture);return texture;}))];
  const ready=Promise.allSettled(requests).then(results=>{
    const failure=results.find(result=>result.status==='rejected');
    if(disposed||failure){
      loadedModels.forEach(releaseSource);loadedTextures.forEach(texture=>texture.dispose());
      loadedModels.length=loadedTextures.length=0;
      if(!disposed){status='fallback';reportError(failure.reason);}return false;
    }
    const [stadiumSource,goalSource,ballSource,grass,concrete,crowd,landscape,portrait]=results.map(result=>result.value);
    for(const source of loadedModels)source.updateMatrixWorld(true);
    finish(grass,{repeat:[1,1]});finish(concrete,{repeat:[1,1]});finish(crowd,{repeat:[1,1]});
    skyLandscape=finish(landscape);skyPortrait=finish(portrait);textureCount=5;
    const palette=track(new T.MeshStandardMaterial({color:'#d4dedb',vertexColors:true,roughness:.86,metalness:.02,side:T.FrontSide}));
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
    const pitchMaterial=track(new T.MeshStandardMaterial({color:'#a0b3a0',map:grass,roughness:.96,metalness:0}));
    // The 512px full-field tile has coarse high-contrast grass flecks. Bias
    // toward an existing mip level to soften those flecks while retaining its
    // authored mowing bands, UV scale and one texture sample per fragment.
    const sample='texture2D( map, vMapUv )',mapFragment=T.ShaderChunk.map_fragment;
    if(!mapFragment.includes(sample))throw new Error('Unsupported soccer turf map shader');
    const turfMapFragment=mapFragment.replace(sample,'texture2D( map, vMapUv, 1.25 )');
    pitchMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',turfMapFragment);};
    pitchMaterial.customProgramCacheKey=()=> 'soccer-design-turf-mip-1.25';
    // Use the imported texture-ready pitch, lowering its surface to y=0 so the
    // existing .018m lines and every contact shadow retain their depth order.
    const pitchGeometry=merged([get('pitch_surface')],stadiumTransform);pitchGeometry.translate(0,-.04*sy,0);
    soccerPitchUv(pitchGeometry,config.pitch.length,config.pitch.width);
    mesh(pitchGeometry,pitchMaterial);
    skyMaterial=track(new T.MeshBasicMaterial({map:skyLandscape,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
    skyMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position=vec4(transformed.xy,.9999,1.);');};
    const sky=mesh(new T.PlaneGeometry(2,2),skyMaterial);sky.frustumCulled=false;sky.renderOrder=-1000;sky.receiveShadow=false;
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
    const goalGeometry=mergeGeometries(goalGeometries);goalGeometries.forEach(geometry=>geometry.dispose());mesh(goalGeometry,palette);
    // Asset diameter .22m, anchor_ball_center (0,.11,0). BallRoot already
    // supplies simulation position and spin; imported ground offset is removed.
    const ballGeometry=merged([ballSource.getObjectByName('soccer_ball')],new T.Matrix4());
    normalizeSoccerBallGeometry(ballGeometry,config.physics.ballRadius);
    const ballMaterial=track(new T.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:0}));
    mesh(ballGeometry,ballMaterial,ball).castShadow=true;
    loadedModels.forEach(releaseSource);loadedModels.length=0;loadedTextures.length=0;
    status='ready';root.visible=ball.visible=true;
    try{onReady({stadium:true,goals:true,ball:true});}
    catch(error){root.visible=ball.visible=false;status='fallback';reportError(error);return false;}
    return true;
  }).catch(error=>{
    // Build errors also preserve the playable fallback. Registered resources
    // remain owned by the view and are reclaimed with the rest of the session.
    loadedModels.forEach(releaseSource);
    // Registered images are already owned by the caller's resource registry.
    // Only images not adopted into that registry need immediate disposal.
    if(!textureCount)loadedTextures.forEach(texture=>texture.dispose());
    loadedModels.length=loadedTextures.length=0;root.visible=ball.visible=false;
    if(!disposed){status='fallback';reportError(error);}return false;
  });
  return {
    ready,root,ball,
    metrics:()=>({status,source:'design/models2/soccer-stadium',ballDiameterMetres:config.physics.ballRadius*2,seatDetail:renderQuality>=3?'mobile':'full',seatLod:seatLodStats,models:status==='ready'?3:0,textures:textureCount,
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
    dispose(){disposed=true;root.removeFromParent();ball.removeFromParent();}
  };
}
