// Original unbranded tennis umpire chair. CC0-1.0.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire('/tmp/tennis-officials-tools/package.json');
const T=require('three');
const {Document,NodeIO}=require('@gltf-transform/core');
const root=fileURLToPath(new URL('../',import.meta.url));
const d=new Document(),buffer=d.createBuffer(),scene=d.createScene('Tennis umpire high chair');
const mats=new Map();let triangles=0;
function material(name,color){if(!mats.has(name))mats.set(name,d.createMaterial(name).setBaseColorFactor([...new T.Color(color).toArray(),1]).setRoughnessFactor(.7));return mats.get(name);}
function add(name,g,color){g.computeVertexNormals();const a=(name,type,array)=>d.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);const p=d.createPrimitive().setAttribute('POSITION',a(name+' positions','VEC3',new Float32Array(g.attributes.position.array))).setAttribute('NORMAL',a(name+' normals','VEC3',new Float32Array(g.attributes.normal.array))).setIndices(a(name+' indices','SCALAR',new Uint16Array(g.index.array))).setMaterial(material(name.includes('Cushion')?'Warm canvas':'Ivory powder-coated steel',color));scene.addChild(d.createNode(name).setMesh(d.createMesh(name).addPrimitive(p)));triangles+=g.index.count/3;}
function box(name,p,s,color='#dcd8bc'){const g=new T.BoxGeometry(...s).translate(...p);add(name,g,color);}
function tube(name,a,b,r=.025,color='#dcd8bc'){const x=new T.Vector3(...a),y=new T.Vector3(...b),v=y.clone().sub(x);const g=new T.CylinderGeometry(r,r,v.length(),6,1);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));g.translate(...x.add(y).multiplyScalar(.5).toArray());add(name,g,color);}
// Seat top y=1.57m. The actor's authored seated pelvis aligns to this datum.
box('Cushion seat',[0,1.54,0],[.65,.06,.57],'#a7b8a1');
box('Cushion back',[0,1.93,-.28],[.65,.64,.06],'#a7b8a1');
for(const x of [-.29,.29]){tube('Front leg',[x*1.8,.025,.48],[x,1.55,.23],.035);tube('Back leg',[x*1.8,.025,-.48],[x,2.23,-.28],.035);tube('Armrest',[x,1.84,-.25],[x,1.84,.32]);tube('Armrest front support',[x,1.55,.28],[x,1.84,.28]);tube('Base brace',[x*1.8,.15,-.48],[x*1.8,.15,.48]);}
tube('Rear cross brace',[-.49,.2,-.47],[.29,1.5,-.27]);tube('Rear cross brace',[.49,.2,-.47],[-.29,1.5,-.27]);
for(let i=0;i<5;i++){const y=.23+i*.245,z=.65-i*.065;box('Ladder tread '+i,[0,y,z],[.57,.045,.14]);}
for(const x of [-.30,.30])tube('Ladder rail',[x,.035,.73],[x,1.57,.31],.029);
box('Footrest',[0,1.0965,.58],[.70,.055,.27]);
d.getRoot().getAsset().generator='Tennis officials v1 original chair / glTF Transform';
d.getRoot().getAsset().copyright='CC0-1.0; see LICENSES.md';
await fs.mkdir(root+'models',{recursive:true});await new NodeIO().write(root+'models/umpire-chair.glb',d);
console.log(JSON.stringify({file:'models/umpire-chair.glb',triangles,seatTopMeters:1.57,forward:'+Z',units:'metres'}));
