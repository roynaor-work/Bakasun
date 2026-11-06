/** Authoring tool. No tooling dependencies are shipped to the browser.
 * STADIUM_TOOLS=/tmp/stadium-v8-tools/node_modules node source/build-assets.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as T from '../runtime/vendor/three.module.js';
import {mergeGeometries} from '../runtime/vendor/BufferGeometryUtils.js';
import {LEVELS,TIERS,bowlPoint,bowlArcPoint,bowlPerimeter,PITCH,crowdPlacements} from '../runtime/layout.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const deps=process.env.STADIUM_TOOLS || '/tmp/stadium-v8-tools/node_modules';
const {Document,NodeIO}=await import(pathToFileURL(path.join(deps,'@gltf-transform/core/dist/index.modern.js')));
const {KHRDracoMeshCompression,KHRMaterialsUnlit}=await import(pathToFileURL(path.join(deps,'@gltf-transform/extensions/dist/index.modern.js')));
const {draco}=await import(pathToFileURL(path.join(deps,'@gltf-transform/functions/dist/functions.modern.js')));
const {default:draco3d}=await import(pathToFileURL(path.join(deps,'draco3dgltf/draco3dgltf.js')));
const io=new NodeIO().registerExtensions([KHRDracoMeshCompression,KHRMaterialsUnlit]).registerDependencies({
  'draco3d.encoder':await draco3d.createEncoderModule(),
  'draco3d.decoder':await draco3d.createDecoderModule(),
});

function quad(a,b,c,d,uvs=[0,0,1,0,1,1,0,1]) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([...a,...b,...c,...d],3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g;
}
function point(t,hx,hz,r,y){const [x,z]=bowlPoint(t,hx,hz,r);return [x,y,z];}

const reports=[];
for(let li=0;li<LEVELS.length;li++) {
  const level=LEVELS[li],N=level.segments,buckets=new Map();
  const add=(part,mat,g,color='#ffffff',shade=1)=>{
    const key=part+'|'+mat;if(!buckets.has(key))buckets.set(key,[]);
    const c=new T.Color(color).multiplyScalar(shade),a=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
    g.setAttribute('color',new T.BufferAttribute(a,3));buckets.get(key).push(g);
  };
  const box=(part,mat,x,y,z,w,h,d,color='#ffffff',yaw=0)=>{
    const g=new T.BoxGeometry(w,h,d);g.rotateY(yaw);g.translate(x,y,z);add(part,mat,g,color);
  };
  const beam=(part,mat,a,b,r,color,segments=li?4:6)=>{
    const va=new T.Vector3(...a),vb=new T.Vector3(...b),diff=vb.clone().sub(va);
    const g=new T.CylinderGeometry(r,r,diff.length(),segments,1,false);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),diff.normalize()));
    g.translate(...va.add(vb).multiplyScalar(.5).toArray());add(part,mat,g,color);
  };
  const strip=(part,mat,inner,outer,color,textureRepeat=1,textureRows=1)=>{
    for(let i=0;i<N;i++) {
      const t=i/N,u=(i+1)/N;
      add(part,mat,quad(point(t,...inner),point(u,...inner),point(u,...outer),point(t,...outer),
        [i/N*textureRepeat,0,(i+1)/N*textureRepeat,0,(i+1)/N*textureRepeat,textureRows,i/N*textureRepeat,textureRows]),color);
    }
  };

  // Turf, run-off and a continuous closed outer ground. This remains in every
  // LOD, including the camera side and corners of the stadium.
  const ground=new T.PlaneGeometry(3000,3000);ground.rotateX(-Math.PI/2);ground.translate(0,-.24,0);add('Surround','Concrete',ground,'#151f2b');
  const apron=new T.PlaneGeometry(117,80);apron.rotateX(-Math.PI/2);apron.translate(0,-.06,0);add('Pitch','Runoff',apron,'#254e40');
  const turf=new T.PlaneGeometry(PITCH.length,PITCH.width);turf.rotateX(-Math.PI/2);add('Pitch','Turf',turf);
  // Broad light pools are baked into a few low-contrast floor polygons.
  const line=(x,z,w,d)=>{const g=new T.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);g.translate(x,.018,z);add('Markings','White',g,'#eeeedd');};
  const LW=.125,hx=PITCH.length/2,hz=PITCH.width/2;
  line(0,0,LW,PITCH.width);for(const s of [-1,1]){line(0,s*hz,PITCH.length,LW);line(s*hx,0,LW,PITCH.width);}
  const arc=(x,z,r,start,end,segments=li===2?32:64)=>{
    const g=new T.RingGeometry(r-LW/2,r+LW/2,segments,1,start,end-start);g.rotateX(-Math.PI/2);g.translate(x,.019,z);add('Markings','White',g,'#eeeedd');
  };
  arc(0,0,9.15,0,Math.PI*2);
  const spot=(x,z,r=.16)=>{const g=new T.CircleGeometry(r,li===2?8:12);g.rotateX(-Math.PI/2);g.translate(x,.023,z);add('Markings','White',g,'#eeeedd');};
  spot(0,0,.2);
  for(const s of [-1,1]) {
    for(const [depth,width] of [[16.5,40.32],[5.5,18.32]]){
      line(s*(hx-depth),0,LW,width);for(const side of [-1,1])line(s*(hx-depth/2),side*width/2,depth,LW);
    }
    spot(s*(hx-11),0);
    const theta=Math.acos(5.5/9.15);
    if(s<0)arc(-hx+11,0,9.15,-theta,theta,32);
    else arc(hx-11,0,9.15,Math.PI-theta,Math.PI+theta,32);
    for(const side of [-1,1]){
      const start=s<0?(side<0?Math.PI*1.5:0):(side<0?Math.PI:Math.PI/2);
      arc(s*hx,side*hz,1,start,start+Math.PI/2,16);
    }
  }

  // Ring steps are watertight. Coarse LODs collapse several risers into one,
  // retaining exactly the same front and rear boundaries.
  for(let ti=0;ti<TIERS.length;ti++) {
    const tier=TIERS[ti],rows=ti?level.upperRows:level.lowerRows;
    for(let row=0;row<rows;row++) {
      const from=row/rows*tier.rows,to=(row+1)/rows*tier.rows;
      const r0=from*tier.run,r1=to*tier.run,y0=tier.y+from*tier.rise,y1=tier.y+to*tier.rise;
      const inner=[tier.hx+r0,tier.hz+r0,tier.radius+r0,y0];
      const raised=[tier.hx+r0,tier.hz+r0,tier.radius+r0,y1];
      const outer=[tier.hx+r1,tier.hz+r1,tier.radius+r1,y1];
      strip('Bowl','Risers',inner,raised,li?'#b9c9cd':row%2?'#294050':'#2c4454',li?12:1,li?level.rowStep/4:1);
      strip('Bowl','Seats',raised,outer,li?'#b9c9cd':'#89a7b3',li?12:7.3+to*.12,li?level.rowStep/4:1);
    }
    const run=tier.rows*tier.run,rise=tier.rows*tier.rise;
    strip('Bowl','Concrete',[tier.hx+run,tier.hz+run,tier.radius+run,tier.y+rise],
      [tier.hx+run+1,tier.hz+run+1,tier.radius+run+1,tier.y+rise],'#5c6c78');
    // Solid undercroft joins the front and rear elevations, no open side faces.
    strip('Bowl','Concrete',[tier.hx,tier.hz,tier.radius,-.2],[tier.hx,tier.hz,tier.radius,tier.y],'#243847');
    strip('Facade','Concrete',[tier.hx+run,tier.hz+run,tier.radius+run,-.2],
      [tier.hx+run,tier.hz+run,tier.radius+run,tier.y+rise],'#243644');
    // Radial stair ribbons on top of the banks, plus pale safety edges.
    for(let aisle=0;aisle<16;aisle++){
      const f=aisle/16+.0123;
      const ap=(fraction,off,y)=>{const [x,z]=bowlArcPoint(fraction,tier.hx+off,tier.hz+off,tier.radius+off);return [x,y,z];};
      const w=.72/bowlPerimeter(tier.hx,tier.hz,tier.radius),w2=.72/bowlPerimeter(tier.hx+run,tier.hz+run,tier.radius+run);
      const a=ap(f-w,0,tier.y+.04),b=ap(f+w,0,tier.y+.04);
      const c=ap(f+w2,run,tier.y+rise+.04),d=ap(f-w2,run,tier.y+rise+.04);
      add('Aisles','Concrete',quad(a,b,c,d),'#778288');
      if(li===0)for(let step=0;step<tier.rows;step++){
        const off=(step+.96)*tier.run,y=tier.y+(step+1)*tier.rise+.05;
        const stepW=.72/bowlPerimeter(tier.hx+off,tier.hz+off,tier.radius+off);
        add('Aisles','White',quad(ap(f-stepW,off,y),ap(f+stepW,off,y),
          ap(f+stepW,off+.065,y),ap(f-stepW,off+.065,y)),'#c9bb8c');
      }
    }
  }

  // Continuous hospitality ribbon and warm internal lights between both tiers.
  for(const [y0,y1,mat,color] of [[10.1,10.5,'Concrete','#162630'],[10.5,12.1,'Glass','#355769'],[12.1,12.35,'WarmLight','#a59570']])
    strip('Concourse',mat,[77.2,58.2,29.2,y0],[77.2,58.2,29.2,y1],color,24);
  for(let i=0;i<N;i+=li===2?4:2){
    const [x,z]=bowlPoint(i/N,77.15,58.15,29.15);box('Concourse','Steel',x,11.35,z,.18,1.8,.18,'#172633');
  }

  // A closed windscreen joins the back row to the canopy. Leaving this strip
  // open exposes hairline sky gaps when a broadcast camera tilts toward the roof.
  strip('Windbreak','Steel',[92.56,73.56,44.56,21.32],[92.56,73.56,44.56,27.35],'#192d3d');

  // An uninterrupted low advertising ring; generic original typographic art.
  strip('Perimeter','Led',[56.2,37.5,6.2,.2],[56.2,37.5,6.2,1.15],'#ffffff',12);
  strip('Perimeter','Steel',[56.2,37.5,6.2,1.15],[56.5,37.8,6.5,1.18],'#253847');

  // Ribbed, floating canopy, compression ring, fascia and radial trusses.
  strip('Roof','Canopy',[77.4,58.4,29.4,25],[99.6,80.6,51.6,28.2],'#354b5d');
  strip('Roof','Soffit',[77.4,58.4,29.4,24.6],[99.6,80.6,51.6,27.7],'#344958');
  strip('Roof','Steel',[77.4,58.4,29.4,24.6],[77.4,58.4,29.4,25.05],'#91a6b1');
  strip('Roof','Steel',[99.6,80.6,51.6,27.7],[99.6,80.6,51.6,28.2],'#526779');
  strip('Roof','WarmLight',[77.25,58.25,29.25,24.47],[77.25,58.25,29.25,24.6],'#d5b87b');
  const trusses=li===0?32:li===1?16:8;
  for(let i=0;i<trusses;i++){
    const t=i/trusses;
    const a=point(t,77.5,58.5,29.5,24.35),b=point(t,99,80,51,27.5),c=point(t,99,80,51,24.4);
    beam('Structure','Steel',a,b,.14,'#758b98');beam('Structure','Steel',a,c,.1,'#415b6b');beam('Structure','Steel',b,c,.12,'#526b7b');
    const [x,z]=bowlPoint(t,95,76,47);beam('Structure','Steel',[x,15,z],[x,27,z],.24,'#486071');
  }
  if(li<2)for(let i=0;i<N;i+=2){
    const t=i/N;
    beam('Roof','Steel',point(t,77.4,58.4,29.4,25.03),point(t,99.6,80.6,51.6,28.24),.045,'#8ba2b0',4);
  }

  // Front handrails: merged rails, not a draw call or mesh per post.
  for(const tier of TIERS){
    strip('Rails','Steel',[tier.hx+.1,tier.hz+.1,tier.radius+.1,tier.y+1.04],
      [tier.hx+.22,tier.hz+.22,tier.radius+.22,tier.y+1.08],'#9babb4');
    for(let i=0;i<N;i+=li===0?3:6){const [x,z]=bowlPoint(i/N,tier.hx+.17,tier.hz+.17,tier.radius+.17);
      beam('Rails','Steel',[x,tier.y,z],[x,tier.y+1.08,z],.036,'#6e8493',4);}
  }

  // Four lattice floodlights. Lamp faces are emissive; halos are runtime quads.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*73,z=sz*54,top=38;
    for(const side of [-1,1])beam('Floodlights','Steel',[x+side*.8,17,z],[x+side*.5,top,z],.18,'#708292');
    for(let j=0;j<(li===2?3:6);j++){
      const y=18+j*(li===2?6:3);beam('Floodlights','Steel',[x-.8,y,z],[x+.8,y+2.7,z],.075,'#546b7e',4);
    }
    const aim=new T.Vector3(-x,-18,-z).normalize(),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),aim);
    const frame=new T.BoxGeometry(7.7,3.25,.35);frame.applyQuaternion(q);frame.translate(x,top,z);add('Floodlights','Steel',frame,'#354b5c');
    const columns=li===2?4:7,rows=li===2?2:3;
    for(let col=0;col<columns;col++)for(let row=0;row<rows;row++){
      const v=new T.Vector3((col-(columns-1)/2)*7.2/columns,(row-(rows-1)/2)*2.7/rows,.23).applyQuaternion(q).add(new T.Vector3(x,top,z));
      const g=new T.PlaneGeometry(6.1/columns,2.05/rows);g.applyQuaternion(q);g.translate(...v.toArray());add('Floodlights','Lamps',g,'#d5e8ee');
    }
  }

  // Regulation goals and texture-backed netting, 16 net triangles in total.
  for(const s of [-1,1]){
    const gx=s*hx,back=s*(hx+2.25),gh=PITCH.goalHeight,gw=PITCH.goalWidth/2;
    const shadow=new T.PlaneGeometry(5.2,10.5);shadow.rotateX(-Math.PI/2);shadow.translate(s*(hx+1),.006,0);add('ContactShadows','ContactShadow',shadow);
    for(const z of [-gw,gw]){
      beam('Goals','White',[gx,0,z],[gx,gh,z],.06,'#eeeee1',li===2?6:10);
      beam('Goals','Steel',[gx,gh,z],[back,2,z],.035,'#9daeb5',4);
      beam('Goals','Steel',[back,0,z],[back,2,z],.035,'#9daeb5',4);
      add('Nets','Net',quad([gx,0,z],[back,0,z],[back,2,z],[gx,gh,z],[0,0,4,0,4,4,0,4]),'#a9b7bc');
    }
    beam('Goals','White',[gx,gh,-gw],[gx,gh,gw],.06,'#f3f3e5',li===2?6:10);
    add('Nets','Net',quad([back,0,-gw],[back,0,gw],[back,2,gw],[back,2,-gw],[0,0,8,0,8,3,0,3]),'#b6c6cc');
    add('Nets','Net',quad([gx,gh,-gw],[back,2,-gw],[back,2,gw],[gx,gh,gw],[0,0,3,0,3,8,0,8]),'#a9bcc3');
    for(const side of [-1,1]){
      const x=s*hx,z=side*hz;beam('PitchDetails','White',[x,0,z],[x,1.5,z],.025,'#d9d9c8',4);
      add('PitchDetails','WarmLight',quad([x,1.48,z],[x+.55,1.36,z],[x+.55,1.02,z],[x,1.15,z]),'#e4b66c');
    }
  }

  // Technical areas and modest dugouts remain outside the playing rectangle.
  if(li<2)for(const x of [-17,17]){
    box('PitchDetails','Concrete',x,.12,36.4,10,.24,1.7,'#45525b');
    box('PitchDetails','Glass',x,1.45,37.15,10.3,2.6,.1,'#375565');
    box('PitchDetails','Steel',x,2.8,36.5,10.4,.13,1.7,'#758b99');
    for(let j=0;j<8;j++)box('PitchDetails','BenchSeats',x+(j-3.5)*1.1,.6,36.7,.8,.7,.6,'#6e999e');
  }

  const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Stadium');
  const glRoot=doc.createNode(level.name);scene.addChild(glRoot);
  const unlit=doc.createExtension(KHRMaterialsUnlit),materials=new Map();
  const material=(name)=>{
    if(materials.has(name))return materials.get(name);
    const m=doc.createMaterial(name).setBaseColorFactor([1,1,1,1]).setRoughnessFactor(.86).setMetallicFactor(0).setDoubleSided(true);
    if(['Led','Lamps','WarmLight','ContactShadow'].includes(name)||(li>0&&['Risers','Seats'].includes(name)))m.setExtension('KHR_materials_unlit',unlit.createUnlit());
    materials.set(name,m);return m;
  };
  const report={lod:li,parts:[],crowdInstances:crowdPlacements(level).length};
  for(const [key,list] of buckets){
    const [part,mat]=key.split('|'),g=mergeGeometries(list,false);
    if(!g)throw new Error('Geometry layout mismatch: '+key);
    const primitive=doc.createPrimitive().setMaterial(material(mat));
    for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['color','COLOR_0']]){
      const attr=g.getAttribute(name),type=name==='uv'?'VEC2':'VEC3';
      primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(attr.array)).setBuffer(buffer));
    }
    const indices=g.index.array;
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
    const mesh=doc.createMesh(part+'_'+mat).addPrimitive(primitive),node=doc.createNode(part+'_'+mat).setMesh(mesh).setExtras({part});
    glRoot.addChild(node);report.parts.push({part,material:mat,triangles:indices.length/3});
    list.forEach(x=>x.dispose());g.dispose();
  }
  await doc.transform(draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5,quantizePosition:18,quantizeNormal:10,quantizeTexcoord:14,quantizeColor:8}));
  const bytes=await io.writeBinary(doc),file=`stadium-lod${li}.glb`;
  const destination=path.join(root,'runtime',file),temporary=destination+'.tmp';
  await fs.writeFile(temporary,bytes);await fs.rename(temporary,destination);
  report.staticTriangles=report.parts.reduce((s,p)=>s+p.triangles,0);
  report.crowdTriangles=report.crowdInstances*2;report.total=report.staticTriangles+report.crowdTriangles+10;
  report.bytes=bytes.length;reports.push(report);
  console.log(file,bytes.length,'bytes,',report.staticTriangles,'static +',report.crowdTriangles,'crowd + 10 sky/halos =',report.total);
}
const metricRows=['lod,part,material,triangles,glb_bytes'];
for(const report of reports){
  for(const part of report.parts)metricRows.push([report.lod,part.part,part.material,part.triangles,report.bytes].join(','));
  metricRows.push([report.lod,'Crowd','Atlas',report.crowdTriangles,report.bytes].join(','));
  metricRows.push([report.lod,'Halos+Sky','Runtime',10,report.bytes].join(','));
  metricRows.push([report.lod,'TOTAL','All',report.total,report.bytes].join(','));
}
await fs.writeFile(path.join(root,'source','build-metrics.csv'),metricRows.join('\n')+'\n');
