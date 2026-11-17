import * as T from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

/** Fire-local art. A level street datum, authored lots and unchanged road graph.
 * All detail is batched by material; no scene objects are made during play. */
export function createUltraFireCity(scene,city){
  const resources=new Set(),batches=new Map(),roots=[],textures=[];
  const own=o=>(resources.add(o),o);
  function grain(kind){
    const n=128,data=new Uint8Array(n*n*4);let seed=4179;
    const base={asphalt:[55,62,65],paving:[137,143,137],stone:[176,166,146],brick:[141,105,83],roof:[71,83,89],land:[89,105,83]}[kind];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      let shade=(seed/4294967296-.5)*.13;
      if(kind==='paving')shade+=(x%32<1||y%32<1?-.18:0);
      if(kind==='brick')shade+=(y%16<1||(x+((y>>4)%2)*16)%32<1?-.22:0);
      if(kind==='stone')shade+=(y%32<1||(x+((y>>5)%2)*32)%64<1?-.09:0);
      if(kind==='roof')shade+=(x%12<1?-.16:0);
      const at=(y*n+x)*4;for(let i=0;i<3;i++)data[at+i]=base[i]*(1+shade);data[at+3]=255;
    }
    const t=own(new T.DataTexture(data,n,n));textures.push(t);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.anisotropy=4;t.needsUpdate=true;return t;
  }
  const mat=(color,map=null,extra={})=>own(new T.MeshStandardMaterial({color,map,roughness:.86,...extra}));
  const road=mat('#ffffff',grain('asphalt')),paving=mat('#ffffff',grain('paving')),stone=mat('#ffffff',grain('stone'),{vertexColors:true}),
    brick=mat('#ffffff',grain('brick'),{vertexColors:true}),roof=mat('#ffffff',grain('roof')),
    detail=mat('#ffffff',null,{vertexColors:true,roughness:.73}),glass=mat('#38515a',null,{roughness:.28,metalness:.32}),
    land=mat('#ffffff',grain('land'));
  function add(g,m,x,y,z,rx=0,ry=0,rz=0,color){
    const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(1,1,1));
    let geom=g.index?g.toNonIndexed():g.clone();g.dispose();geom.applyMatrix4(matrix);
    if(m.vertexColors){const c=new T.Color(color||'#ffffff'),a=new Float32Array(geom.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}geom.setAttribute('color',new T.BufferAttribute(a,3));}
    if(!batches.has(m))batches.set(m,[]);batches.get(m).push(geom);
  }
  const box=(w,h,d,m,x,y,z,c)=>add(new T.BoxGeometry(w,h,d),m,x,y,z,0,0,0,c);
  function plane(w,d,m,x,z,y=.085,tile=1){const g=new T.PlaneGeometry(w,d);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*w/tile,uv.getY(i)*d/tile);add(g,m,x,y,z,-Math.PI/2);}
  const cylinder=(radius,height,c,x,y,z)=>add(new T.CylinderGeometry(radius,radius,height,8),detail,x,y,z,0,0,0,c);
  const width=city.extent+city.cameraLimit*2+80;
  plane(width,width,land,0,0,-.035,3);
  const edge=city.roadWidth/2,sw=city.sidewalkWidth;
  const zEdges=[-city.extent/2,...city.roadsZ.flatMap(z=>[z-edge,z+edge]),city.extent/2];
  for(const x of city.roadsX){
    plane(city.roadWidth,city.extent+10,road,x,0,.05,3);
    for(let i=0;i<zEdges.length-1;i+=2){const d=zEdges[i+1]-zEdges[i],z=(zEdges[i+1]+zEdges[i])/2;
      for(const side of [-1,1]){plane(sw,d,paving,x+side*(edge+sw/2),z,.16,1.8);box(.12,.17,d,detail,x+side*(edge+.04),.08,z,'#a6aea3');plane(.11,d,road,x+side*(edge-.1),z,.055,2);}
    }
  }
  // The horizontal road excludes intersections, avoiding coplanar surface seams.
  const edges=[-city.extent/2,...city.roadsX.flatMap(x=>[x-edge,x+edge]),city.extent/2];
  for(const z of city.roadsZ)for(let i=0;i<edges.length-1;i+=2){const l=edges[i],rr=edges[i+1],w=rr-l;if(w<=0)continue;plane(w,city.roadWidth,road,(l+rr)/2,z,.05,3);for(const side of [-1,1]){plane(w,sw,paving,(l+rr)/2,z+side*(edge+sw/2),.16,1.8);box(w,.17,.12,detail,(l+rr)/2,.08,z+side*(edge+.04),'#a6aea3');}}
  for(const x of city.roadsX)for(let z=-26;z<27;z+=city.dashGap)if(!city.roadsZ.some(r=>Math.abs(r-z)<edge+.2))box(.11,.012,city.dashLength,detail,x,.073,z,'#d7cdb1');
  for(const z of city.roadsZ)for(let x=-26;x<27;x+=city.dashGap)if(!city.roadsX.some(r=>Math.abs(r-x)<edge+.2))box(city.dashLength,.012,.11,detail,x,.073,z,'#d7cdb1');
  for(const x of city.roadsX)for(const z of city.roadsZ){
    for(const side of [-1,1])for(let i=0;i<6;i++)box(.38,.014,1.02,detail,x-1.75+i*.7,.077,z+side*(edge-.65),'#b5bcb0');
    for(const side of [-1,1]){box(2.8,.014,.1,detail,x+side*1.57,.077,z+side*(edge-1.35),'#b3b8ad');
      // Drain grates are inset into the gutter, with five narrow slots.
      const dx=x+side*(edge-.18),dz=z+edge+1;
      box(.32,.018,.6,detail,dx,.075,dz,'#343b3d');for(let j=0;j<5;j++)box(.28,.02,.025,detail,dx,.087,dz-.23+j*.115,'#7c8582');
    }
  }
  const lots=[];
  function architecture(lot,i){
    const {x,z,width:w,depth:d,height:h}=lot;
    plane(w+.22,d+.22,paving,x,z,.14,1.8);
    const group=new T.Group();scene.add(group);roots.push(group);lots.push(group);
    // These four authored facades are the fallback only. Meshy lots keep their GLB.
    const m=i%3===0?brick:stone;
    const localParts=[],localGlass=[];
    const local=(ww,hh,dd,c,xx,yy,zz,isGlass=false)=>{const g=new T.BoxGeometry(ww,hh,dd).toNonIndexed();g.translate(xx,yy,zz);const color=new T.Color(c),a=new Float32Array(g.attributes.position.count*3);for(let j=0;j<a.length;j+=3){a[j]=color.r;a[j+1]=color.g;a[j+2]=color.b;}g.setAttribute('color',new T.BufferAttribute(a,3));(isGlass?localGlass:localParts).push(g);};
    local(w,h,d,'#ffffff',x,h/2+.16,z);local(w+.2,.17,d+.2,'#b7b4a5',x,.23,z);local(w+.23,.2,d+.23,'#c8c1ad',x,h+.17,z);
    local(w-.18,.12,d-.18,'#56636a',x,h+.28,z);
    for(const side of [-1,1]){
      const zz=z+side*(d/2+.025);
      for(let floor=0;floor<Math.max(2,Math.floor(h/1.65));floor++)for(const dx of [-1.7,0,1.7]){
        const yy=1.1+floor*1.6;
        local(.96,1.1,.13,'#d2cbb9',x+dx,yy,zz);local(.72,.87,.16,'#38515a',x+dx,yy,zz+side*.03,true);
        local(.045,.88,.18,'#b6baaf',x+dx,yy,zz+side*.07);local(.86,.09,.28,'#d6d0bd',x+dx,yy-.55,zz+side*.1);
      }
      local(w+.12,.1,.15,'#a09987',x,2.02,zz);
    }
    for(const side of [-1,1])for(let floor=0;floor<2;floor++)for(const dz of [-1.6,1.3]){
      local(.14,1.05,.92,'#c9c3b2',x+side*w/2,1.1+floor*1.6,z+dz);
      local(.17,.84,.72,'#38515a',x+side*(w/2+.04),1.1+floor*1.6,z+dz,true);
    }
    local(.9,1.6,.19,'#4c5c5e',x,.95,z+d/2+.08);local(1.6,.12,.8,'#a9ab9f',x,.22,z+d/2+.15);
    local(1,.45,.7,'#89928d',x-1.1,h+.55,z-.9);for(let j=0;j<5;j++)local(.8,.035,.03,'#49565a',x-1.1,h+.6+j*.055,z-.53);
    const parts=[...localParts,...localGlass],g=own(mergeGeometries(parts));parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  city.buildings.forEach(architecture);
  function tree(x,z,h=3.2){
    const r=h*.29;box(1.5,.15,1.5,detail,x,.2,z,'#9b9c89');plane(1.25,1.25,land,x,z,.28,1);
    cylinder(.13,h*.62,'#6a6150',x,h*.31,z);
    for(const [dx,dy,dz,s,c]of [[0,0,0,1,'#526d50'],[-.42,-.2,.14,.72,'#677e59'],[.3,.35,-.2,.8,'#6b8159']]){
      const g=new T.SphereGeometry(r*s,7,5);g.scale(1,1.3,1);add(g,detail,x+dx,h*.79+dy,z+dz,0,0,0,c);
    }
  }
  // Street furniture stays on the outer sidewalk, outside the truck envelope.
  for(const [i,x]of [-25,25].entries())for(const [j,z]of [-23,-12,0,12,24].entries()){
    tree(x,z,3+(j%3)*.35);
    if(j%2===0){const xx=x+(i===0?1.3:-1.3);cylinder(.075,3.6,'#424c4d',xx,1.8,z-2);box(.72,.13,.3,detail,xx,3.63,z-2,'#e6dac0');box(.65,.05,.25,detail,xx,3.54,z-2,'#f3dfaf');}
  }
  for(const [x,z]of [[-22,-2],[22,10],[-22,20],[23,-20]]){
    for(let j=0;j<4;j++)box(1.65,.08,.1,detail,x,.58,z-.22+j*.15,'#866c4d');
    for(const side of [-1,1]){box(.09,.53,.5,detail,x+side*.64,.32,z,'#465354');cylinder(.07,.95,'#546263',x+side*1.1,.57,z);}
  }
  for(const z of [-28.5,28.5])for(const x of [-12,0,12]){
    plane(5.6,3,paving,x,z,.14,1.8);box(5.3,.25,.6,detail,x,.32,z,'#929d88');plane(5.05,.4,land,x,z,.46,1.6);
    for(let j=0;j<7;j++){const g=new T.SphereGeometry(.32,6,4);g.scale(1,1.2,1);add(g,detail,x-2.1+j*.7,.75,z,0,0,0,j%2?'#647857':'#788460');}
  }
  // Low skyline on the perimeter; authored profiles, never crossing a fire site.
  for(let i=0;i<9;i++){const x=-32+i*8,z=-33,h=3.8+(i%3)*1.5;box(5.4,h,4,stone,x,h/2,z);box(5.65,.2,4.25,roof,x,h+.1,z);for(let j=0;j<3;j++)for(let f=0;f<2;f++)box(.8,.9,.06,glass,x-1.7+j*1.7,1.2+f*1.8,z+2.04);}
  for(const [m,parts]of batches){if(!parts.length)continue;const g=own(mergeGeometries(parts));parts.forEach(p=>p.dispose());const mesh=new T.Mesh(g,m);mesh.receiveShadow=true;mesh.castShadow=m===detail||m===stone||m===roof;scene.add(mesh);roots.push(mesh);}
  let disposed=false;
  return {lots,dispose(){if(disposed)return;disposed=true;for(const root of roots)root.removeFromParent();for(const r of resources)r.dispose();resources.clear();},metrics(){return {batches:batches.size,geometries:[...resources].filter(r=>r.isBufferGeometry).length,materials:[...resources].filter(r=>r.isMaterial).length,textures:disposed?0:textures.length,disposed};}};
}
