/** Same-origin static module worker for the basketball v7 bodies' meshopt-compressed animation data.
 * The island page runs under `script-src 'self'` (no WebAssembly exception), exactly like the Draco decoder,
 * so the decoder, which compiles its WebAssembly from inline bytes, runs here and never in the page:
 * the page only posts the compressed bytes and receives the decoded buffer. */
import {MeshoptDecoder} from '../vendor/meshopt_decoder.module.js';

self.onmessage=async event=>{
 const {id,count,size,source,mode,filter}=event.data||{};
 if(!id)return self.close();
 try{
  await MeshoptDecoder.ready;
  const target=new Uint8Array(count*size);
  MeshoptDecoder.decodeGltfBuffer(target,count,size,source,mode,filter);
  self.postMessage({id,value:target},[target.buffer]);
 }catch(error){
  self.postMessage({id,error:String(error?.message||error)});
 }
};
