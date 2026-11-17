// Build-only normalization of legacy sources. No mesh decoder is shipped.
import {NodeIO,Logger} from '@gltf-transform/core';
import {ALL_EXTENSIONS,KHRMeshQuantization,EXTTextureWebP} from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import {MeshoptDecoder} from 'meshoptimizer';
import {parseGLB,buildGLB} from './common.mjs';
import {losslessWebP} from './images.mjs';

export const GLB_LIMITS={maxPositionError:0,maxNormalDegrees:0.01,maxUVError:1/65535/2+1e-8,maxNodeMatrixError:1e-9};
const FORBIDDEN=['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'];
let ioReady;
export function nativeIO() {
  ioReady||=(async()=>{await MeshoptDecoder.ready;return new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'meshopt.decoder':MeshoptDecoder});})();
  return ioReady;
}
export function assertNative(json) {
  for(const ext of [...json.extensionsUsed||[],...json.extensionsRequired||[]])if(FORBIDDEN.includes(ext))throw Error(`Forbidden runtime codec: ${ext}`);
  for(const view of json.bufferViews||[])if(view.extensions?.EXT_meshopt_compression)throw Error('Forbidden Meshopt buffer view');
  for(const image of json.images||[])if(image.mimeType==='image/ktx2')throw Error('Forbidden KTX2 texture');
}
async function writeNative(doc) {
  const io=await nativeIO(),{json,bin}=parseGLB(Buffer.from(await io.writeBinary(doc))),nodes=doc.getRoot().listNodes();
  // The authoring writer omits near-identity TRS using an epsilon. Keep even
  // tiny original bone rotations so canonicalization cannot alter the rig.
  for(let i=0;i<nodes.length;i++){delete json.nodes[i].matrix;json.nodes[i].translation=nodes[i].getTranslation();json.nodes[i].rotation=nodes[i].getRotation();json.nodes[i].scale=nodes[i].getScale();}
  return buildGLB(json,bin);
}
export async function readSourceGLB(bytes,readResource) {
  const io=await nativeIO(),{json,bin}=parseGLB(bytes),resources={};
  if(json.buffers?.[0]){json.buffers[0].uri='@glb.bin';resources['@glb.bin']=new Uint8Array(bin);}
  for(const item of [...json.images||[],...json.buffers||[]])if(item.uri&&!item.uri.startsWith('data:')&&item.uri!=='@glb.bin')resources[item.uri]=new Uint8Array(await readResource(item.uri));
  const doc=await io.readJSON({json,resources});
  for(const extension of doc.getRoot().listExtensionsUsed())if(FORBIDDEN.includes(extension.extensionName)) {
    if(extension.extensionName==='KHR_texture_basisu')throw Error('Legacy KTX2 needs manual source texture replacement');
    extension.dispose();
  }
  const buffers=doc.getRoot().listBuffers();
  if(buffers.length>1)for(const buffer of buffers.slice(1)){for(const accessor of doc.getRoot().listAccessors())if(accessor.getBuffer()===buffer)accessor.setBuffer(buffers[0]);buffer.dispose();}
  for(const texture of doc.getRoot().listTextures())texture.setURI('');
  return doc;
}
const elements=accessor=>Array.from({length:accessor.getCount()},(_,i)=>accessor.getElement(i,[]));
function angle(a,b) {
  const n=Math.hypot(...a.slice(0,3))*Math.hypot(...b.slice(0,3));
  return n?Math.acos(Math.min(1,Math.max(-1,a.slice(0,3).reduce((s,v,i)=>s+v*b[i],0)/n)))*180/Math.PI:0;
}
export function compareNative(before,after) {
  const quality={maxPositionError:0,maxNormalDegrees:0,maxUVError:0,maxNodeMatrixError:0,comparedVertices:0,animationValuesExact:true,skinWeightsExact:true,topologyExact:true};
  const a=before.getRoot().listMeshes(),b=after.getRoot().listMeshes();
  if(a.length!==b.length)throw Error('Mesh count changed');
  for(let mi=0;mi<a.length;mi++) {
    const pa=a[mi].listPrimitives(),pb=b[mi].listPrimitives();
    if(pa.length!==pb.length)throw Error('Primitive count changed');
    for(let pi=0;pi<pa.length;pi++) {
      if(JSON.stringify(pa[pi].getIndices()?.getArray())!==JSON.stringify(pb[pi].getIndices()?.getArray())||pa[pi].getMode()!==pb[pi].getMode())throw Error('Topology changed');
      for(const semantic of pa[pi].listSemantics()) {
        const old=pa[pi].getAttribute(semantic),now=pb[pi].getAttribute(semantic);
        if(!now||old.getCount()!==now.getCount())throw Error('Attribute count changed');
        for(let i=0;i<old.getCount();i++) {
          const x=old.getElement(i,[]),y=now.getElement(i,[]);
          if(semantic==='POSITION'){quality.maxPositionError=Math.max(quality.maxPositionError,Math.hypot(...x.map((v,j)=>v-y[j])));quality.comparedVertices++;}
          else if(semantic==='NORMAL'||semantic==='TANGENT'){quality.maxNormalDegrees=Math.max(quality.maxNormalDegrees,angle(x,y));if(semantic==='TANGENT'&&x[3]!==y[3])throw Error('Tangent handedness changed');}
          else if(semantic.startsWith('TEXCOORD_'))quality.maxUVError=Math.max(quality.maxUVError,...x.map((v,j)=>Math.abs(v-y[j])));
          else if(x.some((v,j)=>v!==y[j]))throw Error(`Unselected attribute changed: ${semantic}`);
        }
      }
    }
  }
  const animations=d=>d.getRoot().listAnimations().map(a=>({channels:a.listChannels().map(c=>[c.getTargetNode()?.getName(),c.getTargetPath()]),samplers:a.listSamplers().map(s=>[s.getInterpolation(),Array.from(s.getInput().getArray()),Array.from(s.getOutput().getArray())])}));
  if(JSON.stringify(animations(before))!==JSON.stringify(animations(after)))throw Error('Animation values changed');
  const na=before.getRoot().listNodes(),nb=after.getRoot().listNodes();
  if(na.length!==nb.length)throw Error('Node count changed');
  for(let i=0;i<na.length;i++){if(na[i].getName()!==nb[i].getName())throw Error('Node order changed');const x=na[i].getWorldMatrix(),y=nb[i].getWorldMatrix();quality.maxNodeMatrixError=Math.max(quality.maxNodeMatrixError,...x.map((v,j)=>Math.abs(v-y[j])));}
  if(quality.maxNodeMatrixError>GLB_LIMITS.maxNodeMatrixError)throw Error('Node transforms changed');
  const skins=d=>d.getRoot().listSkins().map(s=>[s.listJoints().map(j=>j.getName()),s.getInverseBindMatrices()?Array.from(s.getInverseBindMatrices().getArray()):null]);
  if(JSON.stringify(skins(before))!==JSON.stringify(skins(after)))throw Error('Skin bind transforms changed');
  return quality;
}
function quantizeNormalsUV(doc) {
  let attributes=0;
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())for(const semantic of primitive.listSemantics()) {
    const normal=semantic==='NORMAL'||semantic==='TANGENT',uv=/^TEXCOORD_\d+$/.test(semantic),source=primitive.getAttribute(semantic);
    if((!normal&&!uv)||!(source.getArray() instanceof Float32Array))continue;
    const values=elements(source).flat();
    if(values.some(v=>!Number.isFinite(v)||v<(normal?-1:0)||v>1))continue;
    const array=normal?Int16Array.from(values,v=>Math.round(v*32767)):Uint16Array.from(values,v=>Math.round(v*65535));
    primitive.setAttribute(semantic,source.clone().setArray(array).setNormalized(true));attributes++;
    if(source.listParents().every(parent=>parent===doc.getRoot()))source.dispose();
  }
  if(attributes)doc.createExtension(KHRMeshQuantization).setRequired(true);
  return attributes;
}
export async function compressGLB(bytes,{readResource=()=>{throw Error('External resource reader required');}}={}) {
  const io=await nativeIO(),source=await readSourceGLB(bytes,readResource),baseline=await writeNative(source);
  assertNative(parseGLB(baseline).json);
  const candidate=await io.readBinary(baseline),quantizedAttributes=quantizeNormalsUV(candidate),imageMetrics=[];
  for(const [i,texture]of candidate.getRoot().listTextures().entries()) {
    if(!['image/png','image/jpeg'].includes(texture.getMimeType()))continue;
    const input=Buffer.from(texture.getImage()),result=await losslessWebP(input);
    imageMetrics.push({image:i,sourceBytes:input.length,...result,bytes:undefined});
    if(result.selected){texture.setImage(new Uint8Array(result.bytes)).setMimeType('image/webp');candidate.createExtension(EXTTextureWebP).setRequired(true);}
  }
  const output=await writeNative(candidate),roundtrip=await io.readBinary(output),quality=compareNative(source,roundtrip);
  quality.embeddedImages=imageMetrics;
  const safe=quality.maxPositionError<=GLB_LIMITS.maxPositionError&&quality.maxNormalDegrees<=GLB_LIMITS.maxNormalDegrees&&quality.maxUVError<=GLB_LIMITS.maxUVError;
  assertNative(parseGLB(output).json);
  return {bytes:safe?output:baseline,baselineBytes:baseline,safe,quality,quantizedAttributes,codec:safe&&quantizedAttributes?'KHR_mesh_quantization':'native-glb',requiresWASM:false,sourceHadLegacyCodec:FORBIDDEN.some(e=>parseGLB(bytes).json.extensionsUsed?.includes(e))};
}
