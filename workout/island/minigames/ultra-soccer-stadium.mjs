import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** The Island Ground. Static scenery is merged by finish, never built in the loop.
 * Original character/ball assets and all pitch dimensions remain authoritative. */
export function createUltraSoccerStadium(scene,config,track){
  const hx=config.pitch.length/2,hz=config.pitch.width/2;
  const dummy=new T.Object3D(),batches=new Map(),roofs=[];let roofSide=0,disposed=false,turfStatus='loading',quality=0;
  const material=(color,extra={})=>track(new T.MeshStandardMaterial({color,roughness:.85,metalness:.05,...extra}));
  const finishes={stone:material('#7c8d89'),navy:material('#163c49'),seat:material('#436b76'),cream:material('#d8dbce'),steel:material('#6d8589',{metalness:.5,roughness:.4}),leaf:material('#355b4b'),light:material('#eff7e9',{emissive:'#e6f7df',emissiveIntensity:1.4})};
  function queue(g,m){const key=m.uuid+':'+roofSide;if(!batches.has(key))batches.set(key,{material:m,side:roofSide,geometries:[]});batches.get(key).geometries.push(g);}
  function add(g,m,x,y,z,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(1,1,1);dummy.updateMatrix();g.applyMatrix4(dummy.matrix);queue(g,m);}
  const box=(m,x,y,z,w,h,d,ry=0)=>add(new T.BoxGeometry(w,h,d),m,x,y,z,0,ry);
  const plane=(m,x,y,z,w,h,rx=0,ry=0)=>add(new T.PlaneGeometry(w,h),m,x,y,z,rx,ry);
  function beam(a,b,r=.055,m=finishes.steel){const av=new T.Vector3(...a),bv=new T.Vector3(...b),v=bv.clone().sub(av),g=new T.CylinderGeometry(r,r,v.length(),4);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());queue(g,m);}
  box(finishes.navy,0,-.63,0,54,.8,41);
  box(finishes.stone,0,-.2,0,51,.15,38);
  const apron=material('#284f44');plane(apron,0,-.06,0,config.pitch.length+3.4,config.pitch.width+3.4,-Math.PI/2);
  // Four terraces, with alternating quiet seat blocks and clear concrete aisles.
  for(const side of [-1,1]){
    for(let row=0;row<3;row++){
      const z=side*(hz+3.2+row*1.15),floor=.24+row*.65;
      box(finishes.stone,0,floor-.32,z,39,.64,1.2);
      for(let col=0;col<48;col++){
        if(col%12===0)continue;const x=-18.3+col*.78,m=col<12||col>=36?finishes.seat:finishes.navy;
        plane(m,x,floor+.24,z,.59,.58,-Math.PI/2);
        plane(m,x,floor+.49,z+side*.29,.59,.48,-side*.12,side<0?0:Math.PI);
      }
    }
    // A thin perimeter barrier keeps the near stand below the playing view.
    box(finishes.navy,0,.38,side*(hz+1.7),40,.7,.16);
    beam([-20,.82,side*(hz+1.7)],[20,.82,side*(hz+1.7)],.035);
    box(finishes.cream,0,2.1,side*(hz+6),41,.19,.22);
    // Floating cantilever roof: thin fascia, ribs and rear columns.
    roofSide=side;
    plane(finishes.cream,0,4.8,side*(hz+4.1),43,5.9,-Math.PI/2);
    box(finishes.navy,0,4.74,side*(hz+1.2),43,.24,.15);
    box(finishes.navy,0,4.73,side*(hz+7),43,.18,.16);
    for(let x=-20;x<=20;x+=8){
      beam([x,.25,side*(hz+6.7)],[x,4.75,side*(hz+6.7)],.085);
      beam([x,3.6,side*(hz+6.7)],[x,4.7,side*(hz+1.4)],.05);
      beam([x,4.68,side*(hz+6.7)],[x,4.68,side*(hz+1.4)],.045);
    }
    roofSide=0;
    // End terraces are open, preserving sight lines to the net and goalkeeper.
    for(let row=0;row<3;row++){
      const x=side*(hx+4.5+row*1.1),floor=.24+row*.65;
      box(finishes.stone,x,floor-.32,0,1.12,.64,22.4);
      for(let col=0;col<28;col++){
        if(col%7===0)continue;const z=-10.6+col*.78;
        plane(finishes.seat,x,floor+.24,z,.58,.59,-Math.PI/2);
        plane(finishes.seat,x+side*.29,floor+.49,z,.59,.48,0,-side*Math.PI/2);
      }
    }
    box(finishes.navy,side*(hx+2.8),.36,0,.15,.72,24);
    beam([side*(hx+2.8),.8,-12],[side*(hx+2.8),.8,12],.035);
    for(const z of [-hz-3,hz+3]){
      const x=side*(hx+6.3);
      beam([x,.2,z],[x,8.8,z],.10);
      box(finishes.navy,x,8.8,z,1.9,.8,.4);
      for(let i=0;i<4;i++)plane(finishes.light,x-.69+i*.46,8.8,z+.23,.34,.48,0,0);
    }
  }
  // Short dugouts, replacing bright block advertising with a calm club identity.
  for(const x of [-7,7]){
    box(finishes.navy,x,.46,hz+2.5,4.6,.14,.8);
    plane(finishes.seat,x,1.1,hz+2.85,4.8,1.4);
    plane(finishes.cream,x,1.84,hz+2.35,5,1.2,-Math.PI/2);
  }
  // A quiet grove beyond the terraces roots the arena in its island setting.
  for(let i=0;i<20;i++){
    const x=-36+i*3.8,z=-hz-11-(i%3)*1.7,h=2.3+(i%4)*.45;
    add(new T.CylinderGeometry(.09,.16,h*1.25,4),finishes.navy,x,h*.5,z);
    add(new T.IcosahedronGeometry(h*.52,0),finishes.leaf,x,h*1.05,z);
    for(const d of [-1,1])add(new T.IcosahedronGeometry(h*.39,0),finishes.leaf,x+d*h*.37,h*.76,z+.25);
  }
  const skyWidth=256,skyHeight=128,skyBytes=new Uint8Array(skyWidth*skyHeight*4);
  for(let y=0;y<skyHeight;y++)for(let x=0;x<skyWidth;x++){
    const u=x/skyWidth,v=y/skyHeight,cloud=Math.exp(-Math.pow((v-.76-.03*Math.sin(u*14))/.055,2))*Math.max(0,Math.sin(u*15)+.25)*.08;
    const at=(y*skyWidth+x)*4;skyBytes[at]=190-v*75+cloud*255;skyBytes[at+1]=210-v*48+cloud*255;skyBytes[at+2]=210-v*23+cloud*255;skyBytes[at+3]=255;
  }
  const sky=track(new T.DataTexture(skyBytes,skyWidth,skyHeight));sky.colorSpace=T.SRGBColorSpace;sky.needsUpdate=true;
  // Own the screen background geometry explicitly; the r160 background-texture
  // helper otherwise retains one internal geometry in renderer.info on exit.
  const skyMaterial=track(new T.MeshBasicMaterial({map:sky,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
  skyMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position=vec4(transformed.xy,.9999,1.);');};
  const skyMesh=new T.Mesh(track(new T.PlaneGeometry(2,2)),skyMaterial);skyMesh.frustumCulled=false;skyMesh.renderOrder=-1000;scene.add(skyMesh);
  // Local canvas typography is original signage, not a remote image or font.
  const sign=document.createElement('canvas');sign.width=1024;sign.height=64;
  const ctx=sign.getContext('2d');ctx.fillStyle='#183c49';ctx.fillRect(0,0,1024,64);
  ctx.fillStyle='#d5e4dd';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 22px sans-serif';
  ctx.fillText('ISLAND LEAGUE     /     THE ISLAND GROUND     /     PLAY TOGETHER',512,32);
  const signMap=track(new T.CanvasTexture(sign));signMap.colorSpace=T.SRGBColorSpace;signMap.anisotropy=4;
  const signMat=track(new T.MeshBasicMaterial({map:signMap}));
  for(const d of [-1,1])plane(signMat,0,.39,d*(hz+1.8),35,.55,0,d<0?0:Math.PI);
  for(const {material,side,geometries}of batches.values()){const geometry=track(mergeGeometries(geometries));const mesh=new T.Mesh(geometry,material);mesh.receiveShadow=true;scene.add(mesh);if(side)roofs.push({mesh,side});geometries.forEach(g=>g.dispose());}
  // One bounded texture covers the pitch. Fine fibers are mipmapped; mowing is
  // a luminance change of only a few percent, not separate saturated planes.
  const width=512,height=256,bytes=new Uint8Array(width*height*4);let seed=9127;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=seed/4294967296-.5,band=Math.sin((x/width)*Math.PI*12)>.0?1.025:.975;
    const wear=Math.exp(-((x-width*.5)**2/(width*width*.026)+(y-height*.5)**2/(height*height*.08)))*.04;
    const shade=band+grain*.13+Math.sin(y*2.7+x*.4)*.018-wear;
    const at=(y*width+x)*4;bytes[at]=70*shade;bytes[at+1]=112*shade;bytes[at+2]=65*shade;bytes[at+3]=255;
  }
  const map=track(new T.DataTexture(bytes,width,height));map.colorSpace=T.SRGBColorSpace;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=8;map.needsUpdate=true;
  const pitchMaterial=material('#ffffff',{map,roughness:.94,metalness:0});
  // UVs repeat at the scale of the grass, while mowing direction and foot wear
  // use world metres. The image therefore remains detailed in a player closeup.
  pitchMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vTurfWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTurfWorld=vec2(position.x,-position.y);');
    shader.fragmentShader='varying vec2 vTurfWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float stripe=sin((vTurfWorld.x+${hx.toFixed(2)})*3.14159265/3.0);
      float mowing=mix(.88,1.04,smoothstep(-.04,.04,stripe));
      float centre=exp(-dot(vTurfWorld/vec2(3.2,2.4),vTurfWorld/vec2(3.2,2.4)));
      vec2 goalDelta=vec2((abs(vTurfWorld.x)-${(hx-1.1).toFixed(2)})/1.6,vTurfWorld.y/2.0);
      float goals=exp(-dot(goalDelta,goalDelta));
      diffuseColor.rgb*=mowing;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,.94,.74),min(.2,centre*.06+goals*.2));`);
  };
  pitchMaterial.customProgramCacheKey=()=> 'soccer-turf-world-mowing-v1';
  const pitch=new T.Mesh(track(new T.PlaneGeometry(config.pitch.length,config.pitch.width)),pitchMaterial);pitch.rotation.x=-Math.PI/2;pitch.receiveShadow=true;scene.add(pitch);
  const loader=new T.TextureLoader(),maps=[];
  const ready=Promise.all(['turf-albedo-1k.jpg','turf-normal-gl-1k.jpg'].map(file=>loader.loadAsync(new URL('../assets/soccer-realism/'+file,import.meta.url).href).then(texture=>{
    // An exited session must never upload a late texture to a disposed renderer.
    if(disposed){texture.dispose();return null;}maps.push(texture);track(texture);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(config.pitch.length/2,config.pitch.width/2);texture.anisotropy=8;return texture;
  }))).then(([albedo,normal])=>{
    if(disposed)return;if(!albedo||!normal)return;
    albedo.colorSpace=T.SRGBColorSpace;normal.colorSpace=T.NoColorSpace;
    pitchMaterial.map=albedo;pitchMaterial.normalMap=normal;pitchMaterial.normalScale.setScalar(quality>=2?.12:.28);pitchMaterial.color.set('#b5d2b7');pitchMaterial.needsUpdate=true;turfStatus='ready';
  }).catch(()=>{if(!disposed)turfStatus='fallback';});
  // Gradient contact-shadow texture shared by all eight original characters.
  const shadowBytes=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),at=(y*64+x)*4;shadowBytes[at]=12;shadowBytes[at+1]=27;shadowBytes[at+2]=21;shadowBytes[at+3]=Math.round(Math.max(0,1-r)**2*210);}
  const shadowMap=track(new T.DataTexture(shadowBytes,64,64));shadowMap.needsUpdate=true;
  return {shadowMap,ready,finishCount:batches.size,identity:'The Island Ground',metrics:()=>({turfStatus,turfMaps:maps.length}),setQuality(level){quality=level;pitchMaterial.normalScale.setScalar(quality>=2?.12:.28);},update(direction){for(const {mesh,side}of roofs)mesh.visible=side!==direction;},dispose(){disposed=true;}};
}
