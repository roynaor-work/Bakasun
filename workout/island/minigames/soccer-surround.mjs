import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** Everything the match camera can see beyond the stands, so that no pixel of the
 * frame is ever left to the sky backdrop: a dark ground to the horizon, a gently
 * rising terrace on the camera's own touchline (the authored bank on that side is
 * omitted so it cannot hide players), closed corners, and a skyline of buildings
 * and trees that the fog softens. Presentation only; one draw call per material.
 *
 * Sight-line rule for the near terrace: rise/run stays below tan(camera elevation)
 * (28 degrees landscape, 40 portrait), so a player on the touchline is never hidden. */
export const SURROUND={
  groundY:-.32,groundSize:700,
  terrace:{start:2.6,rows:9,run:1.15,rise:.4,first:.3,margin:9,backWall:6.2},
  ring:{buildings:44,trees:70,innerRadius:78,spread:46},
};
/** Largest rise/run of the camera-side terrace; the camera never looks down shallower than this. */
export const terraceSlope=()=>SURROUND.terrace.rise/SURROUND.terrace.run;

function seeded(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

/** Spectator dots: small coloured heads on a seat-blue field. Procedural, 128px, CSP-safe. */
function crowdTexture(track){
  const size=128,bytes=new Uint8Array(size*size*4),random=seeded(4421),shirts=[[231,139,105],[246,207,106],[40,104,238],[233,77,81],[99,173,147],[235,235,225]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const at=(y*size+x)*4;bytes[at]=38;bytes[at+1]=62;bytes[at+2]=86;bytes[at+3]=255;}
  for(let row=0;row<16;row++)for(let col=0;col<32;col++){
    if(random()<.12)continue;const c=shirts[Math.floor(random()*shirts.length)],cx=col*4+2,cy=row*8+3;
    for(let dy=-2;dy<=3;dy++)for(let dx=-1;dx<=1;dx++){const px=cx+dx,py=cy+dy;if(px<0||py<0||px>=size||py>=size)continue;const at=(py*size+px)*4,head=dy<=-1;
      bytes[at]=head?214:c[0];bytes[at+1]=head?170:c[1];bytes[at+2]=head?138:c[2];}
  }
  const texture=track(new T.DataTexture(bytes,size,size));texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

export function createSoccerSurround(scene,config,track=x=>x){
  const hx=config.pitch.length/2,hz=config.pitch.width/2,S=SURROUND,root=new T.Group();root.name='soccer-surround';
  const random=seeded(90210);let disposed=false;
  const lambert=(color,extra={})=>track(new T.MeshLambertMaterial({color,...extra}));
  const part=(geometry,matrix)=>{const g=geometry;g.applyMatrix4(matrix);return g;};
  const place=(geometry,x,y,z,sx=1,sy=1,sz=1,ry=0)=>{const m=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(0,ry,0)),new T.Vector3(sx,sy,sz));return part(geometry,m);};
  const mesh=(geometries,material)=>{const geometry=track(mergeGeometries(geometries));geometries.forEach(g=>g.dispose());const m=new T.Mesh(geometry,material);m.frustumCulled=false;return m;};

  // 1. Ground to the horizon (stone apron, fades into the fog).
  const ground=new T.Mesh(track(new T.PlaneGeometry(S.groundSize,S.groundSize)),lambert('#3f4d49'));ground.rotation.x=-Math.PI/2;ground.position.y=S.groundY;ground.frustumCulled=false;root.add(ground);
  // Mown run-off just outside the touchlines and goal lines.
  const runoff=new T.Mesh(track(new T.PlaneGeometry(config.pitch.length+9,config.pitch.width+9)),lambert('#2f5a3e'));runoff.rotation.x=-Math.PI/2;runoff.position.y=S.groundY+.2;runoff.frustumCulled=false;root.add(runoff);

  // 2. The camera-side terrace: seats in rows, aisle stripes, back wall. Mirrored by update().
  const crowd=crowdTexture(track),seatMat=lambert('#ffffff',{map:crowd,side:T.DoubleSide}),stone=lambert('#8d9a96',{side:T.DoubleSide});
  const T0=S.terrace,length=config.pitch.length+2*T0.margin,seatParts=[],stoneParts=[];
  for(let row=0;row<T0.rows;row++){
    const z=hz+T0.start+row*T0.run,top=T0.first+(row+1)*T0.rise;
    stoneParts.push(place(new T.BoxGeometry(length,top-S.groundY,T0.run),0,(top+S.groundY)/2,z+T0.run/2));
    const seat=new T.PlaneGeometry(length,T0.run*.92);const uv=seat.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*length/4,uv.getY(i)*1.2);
    seat.rotateX(-Math.PI/2);seatParts.push(place(seat,0,top+.012,z+T0.run*.5));
  }
  const backZ=hz+T0.start+T0.rows*T0.run,backTop=T0.first+T0.rows*T0.rise+T0.backWall;
  stoneParts.push(place(new T.BoxGeometry(length+2,backTop-S.groundY,.5),0,(backTop+S.groundY)/2,backZ+.25));
  // Closed corners: terrace wings turn the corner so the end stands never meet bare ground.
  for(const sx of [-1,1])stoneParts.push(place(new T.BoxGeometry(T0.margin,T0.first+T0.rows*T0.rise-S.groundY,T0.rows*T0.run),sx*(hx+T0.margin/2+1.5),(T0.first+T0.rows*T0.rise+S.groundY)/2,hz+T0.start+T0.rows*T0.run/2));
  const terrace=new T.Group();terrace.add(mesh(stoneParts,stone),mesh(seatParts,seatMat));root.add(terrace);

  // 3. Skyline: buildings and trees on a ring, beyond the stands, thinned by fog.
  const buildingParts=[],treeParts=[],leafParts=[],tints=['#5d6a72','#6b7479','#4f5f68','#7a7f7c'];
  const ringBuildings=[];
  for(let i=0;i<S.ring.buildings;i++){
    const a=i/S.ring.buildings*Math.PI*2+random()*.08,r=S.ring.innerRadius+random()*S.ring.spread,w=8+random()*12,h=9+random()*20,d=8+random()*10;
    ringBuildings.push({x:Math.cos(a)*r*1.35,z:Math.sin(a)*r,w,h,d,ry:a});
  }
  const buildingMaterial=lambert('#66737a',{vertexColors:true});
  for(const b of ringBuildings){
    const g=place(new T.BoxGeometry(b.w,b.h,b.d),b.x,S.groundY+b.h/2,b.z,1,1,1,b.ry),tint=new T.Color(tints[Math.floor(random()*tints.length)]),count=g.attributes.position.count,colors=new Float32Array(count*3);
    for(let i=0;i<count;i++){const shade=.78+(g.attributes.position.getY(i)-S.groundY)/b.h*.22;colors[i*3]=tint.r*shade;colors[i*3+1]=tint.g*shade;colors[i*3+2]=tint.b*shade;}
    g.setAttribute('color',new T.BufferAttribute(colors,3));buildingParts.push(g);
  }
  for(let i=0;i<S.ring.trees;i++){
    const a=random()*Math.PI*2,r=(S.ring.innerRadius-14)+random()*(S.ring.spread+12),x=Math.cos(a)*r*1.35,z=Math.sin(a)*r,h=4+random()*5;
    treeParts.push(place(new T.CylinderGeometry(.22,.34,h*.5,5),x,S.groundY+h*.25,z));
    leafParts.push(place(new T.IcosahedronGeometry(h*.42,0),x,S.groundY+h*.7,z,1,1.25,1));
  }
  root.add(mesh(buildingParts,buildingMaterial),mesh(treeParts,lambert('#4a3a2c')),mesh(leafParts,lambert('#2f5b44')));
  // Near-ring trees close to the pitch, behind the terraces on both ends.
  const closeParts=[];for(const sx of [-1,1])for(let i=0;i<9;i++){const x=sx*(hx+14+random()*6),z=(i-4)*4.5+random()*2,h=3+random()*3;closeParts.push(place(new T.IcosahedronGeometry(h*.5,0),x,S.groundY+h*.8,z,1,1.3,1));}
  root.add(mesh(closeParts,lambert('#2f5b44')));
  // Floodlight halos: soft additive glows where the authored stadium keeps its lamp bars
  // (authoring bounds mapped into game space: about 27 m along, 19 m across, 7 m up).
  const glowBytes=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5),a=Math.max(0,1-r),at=(y*64+x)*4;glowBytes[at]=255;glowBytes[at+1]=244;glowBytes[at+2]=214;glowBytes[at+3]=Math.round(255*a*a*a);}
  const glow=track(new T.DataTexture(glowBytes,64,64));glow.needsUpdate=true;
  const haloMaterial=track(new T.SpriteMaterial({map:glow,transparent:true,opacity:.4,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
  const halos=[];for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const h=new T.Sprite(haloMaterial);h.position.set(x*hx*1.12,7.2,z*(hz+4.3));h.scale.setScalar(7);h.renderOrder=5;root.add(h);halos.push(h);}
  scene.add(root);
  return {
    root,terrace,halos,
    /** direction = the touchline the camera stands on (sign of its z). */
    update(direction){if(disposed)return;terrace.scale.z=direction<0?-1:1;terrace.visible=true;},
    metrics:()=>({triangles:root.children.reduce((n,c)=>n+(c.geometry?(c.geometry.index?c.geometry.index.count:c.geometry.attributes.position.count)/3:0),0)+terrace.children.reduce((n,c)=>n+(c.geometry.index?c.geometry.index.count:c.geometry.attributes.position.count)/3,0)}),
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();}
  };
}
