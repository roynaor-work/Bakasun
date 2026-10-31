// Node-only. Decode the FINAL Draco GLBs once and embed their actual attributes.
// The delivered file:// viewer does not fetch modules, models, WASM or images.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),vendor=path.resolve(root,'../../vendor/draco'),require=createRequire(import.meta.url);
const code=await fs.readFile(path.join(vendor,'draco_wasm_wrapper.js'),'utf8');
const factory=new Function('module','exports','require','__dirname',code+';return DracoDecoderModule;')({exports:{}},{},require,vendor);
const d=await factory({wasmBinary:await fs.readFile(path.join(vendor,'draco_decoder.wasm'))});
const packed=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
function decodePrimitive(json,bin,primitive){
 const ext=primitive.extensions?.KHR_draco_mesh_compression;if(!ext)throw Error('Every preview primitive must come from Draco delivery');
 const v=json.bufferViews[ext.bufferView],bytes=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),buffer=new d.DecoderBuffer(),decoder=new d.Decoder(),mesh=new d.Mesh();
 buffer.Init(new Int8Array(bytes),bytes.length);const status=decoder.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw Error(status.error_msg());
 const attrs={},n=mesh.num_points();
 for(const [semantic,id]of Object.entries(ext.attributes)){
   const attr=decoder.GetAttributeByUniqueId(mesh,id),count=attr.num_components(),values=new d.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(mesh,attr,values);
   // Draco's float getter already applies the attribute's normalized flag.
   // Dividing again by the glTF integer range would blacken COLOR_0.
   const a=new Float32Array(n*count);
   for(let i=0;i<a.length;i++)a[i]=values.GetValue(i);attrs[semantic]={data:a,count};d.destroy(values);
 }
 const positions=attrs.POSITION.data,normals=attrs.NORMAL?.data||new Float32Array(n*3),uvs=attrs.TEXCOORD_0?.data||new Float32Array(n*2),colors=new Uint8Array(n*3);
 const factor=json.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1];
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)colors[i*3+c]=Math.round(255*(attrs.COLOR_0?attrs.COLOR_0.data[i*attrs.COLOR_0.count+c]:1)*factor[c]);
 const indices=new Uint16Array(mesh.num_faces()*3),face=new d.DracoInt32Array();
 if(n>65535)throw Error('Preview index limit exceeded');
 for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let j=0;j<3;j++)indices[i*3+j]=face.GetValue(j);}
 for(const obj of [face,mesh,decoder,buffer])d.destroy(obj);
 return {positions:packed(positions),normals:packed(normals),uvs:packed(uvs),colors:packed(colors),indices:packed(indices),vertices:n,triangles:indices.length/3};
}
const assets={};
for(const name of (await fs.readdir(path.join(root,'models'))).filter(n=>n.endsWith('.glb')).sort()){
 const file=await fs.readFile(path.join(root,'models',name)),len=file.readUInt32LE(12),json=JSON.parse(file.subarray(20,20+len).toString()),bin=file.subarray(28+len),primitives=[];
 function visit(i,parent){const node=json.nodes[i],chain=[...parent,{matrix:node.matrix,translation:node.translation,rotation:node.rotation,scale:node.scale}];
   if(node.mesh!==undefined)for(const p of json.meshes[node.mesh].primitives)primitives.push({...decodePrimitive(json,bin,p),chain});
   for(const child of node.children||[])visit(child,chain);
 }
 for(const i of json.scenes[json.scene||0].nodes)visit(i,[]);
 assets[name.slice(0,-4)]={primitives,sha256:createHash('sha256').update(file).digest('hex')};
}
const textures={};
for(const dir of ['textures','vfx','decals'])for(const name of await fs.readdir(path.join(root,dir))){if(/\.(webp|png)$/.test(name)&&!name.includes('normal'))textures[name.replace(/\.(webp|png)$/,'')]=`data:image/${name.endsWith('.png')?'png':'webp'};base64,`+(await fs.readFile(path.join(root,dir,name))).toString('base64');}
const decalModule=(await fs.readFile(path.join(root,'decals/track-decals.mjs'),'utf8')).replace('export function createTrackDecals','function createTrackDecals');
const runtime=decalModule+'\n'+await fs.readFile(path.join(root,'tools/preview-runtime.js'),'utf8'),css=await fs.readFile(path.join(root,'tools/preview.css'),'utf8');
const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'"><title>מסלול שלג · חבילת נכסים</title><style>${css}</style><main><div id="stage"><canvas id="world" aria-label="תצוגת נכסי המסלול בתלת ממד"></canvas><div class="top"><span class="pill">מסלול שלג</span><span class="pill small">תצוגת נכסים · מקומית</span></div><div class="caption"><span id="eyebrow">חבילת מסלול מקורית</span><h1 id="heading">יותר מרקם. יותר עומק.</h1><p id="detail">שלג מכוסח, קפיצות ושוליים רכים בקנה מידה של טלפון</p></div><div id="error" hidden></div><div class="hint">גרירה לסיבוב · גלגלת או צביטה לקירוב</div></div><nav aria-label="תצוגת נכסים"><button class="active" data-mode="route">מסלול</button><button data-mode="pipe">חצי צינור</button><button data-mode="props">אביזרים</button><button data-mode="materials">מרקמים</button><button id="pause" aria-pressed="false">עצירת שלג</button></nav><section id="materials" hidden><div class="material-head"><h2>אריחים מתפרים</h2><p>כל כרטיס מציג חזרה של 2×2 · ללא normal בתצוגה</p></div><div id="swatches"></div></section><footer><span>יחידה: מטר · בלי טקסט או מותגים בנכסים</span><span>הדגמה חזותית עצמאית · אינה מחוברת למשחק</span></footer></main><script>const ASSETS=${JSON.stringify(assets)},TEXTURES=${JSON.stringify(textures)};\n${runtime}</script></html>`;
await fs.writeFile(path.join(root,'preview.html'),html);
console.log(JSON.stringify({previewBytes:Buffer.byteLength(html),assets:Object.keys(assets),textures:Object.keys(textures)}));
