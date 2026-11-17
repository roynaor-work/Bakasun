import {decodeMotion16} from './motion16.mjs';
export async function createCompressedAssetLoader(manifestURL=new URL('../offline-pack.json',import.meta.url)) {
  const response=await fetch(manifestURL);if(!response.ok)throw Error('Compression manifest unavailable');
  const manifest=await response.json(),base=new URL('.',manifestURL),records=new Map(manifest.assets.map(a=>[a.source,a]));
  const record=source=>{const result=records.get(source);if(!result||result.omitted)throw Error(`Asset is omitted or not in the offline pack: ${source}`);return result;};
  const resolve=source=>new URL(record(source).output,base).href;
  async function read(entry) {
    const response=await fetch(new URL(entry.output,base));if(!response.ok)throw Error(`Missing packed asset: ${entry.output}`);
    const buffer=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==entry.sha256)throw Error(`SHA-256 mismatch: ${entry.output}`);
    if(entry.encoding==='gzip')return new Uint8Array(await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    if(entry.encoding)throw Error(`Unsupported native encoding: ${entry.encoding}`);
    return new Uint8Array(buffer);
  }
  const bytes=source=>read(record(source));
  const configure=loader=>{loader.setDRACOLoader(null);loader.setMeshoptDecoder(null);return loader;};
  async function parse(entry,loader){configure(loader);const value=await read(entry);return loader.parseAsync(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength),new URL('.',new URL(entry.output,base)).href);}
  return {manifest,resolve,record,bytes,
    async json(source){const entry=record(source),value=await bytes(source);return entry.codec==='motion16'?decodeMotion16(value):JSON.parse(new TextDecoder().decode(value));},
    configureGLTFLoader:configure,
    glb:(source,loader)=>parse(record(source),loader),
    referenceGLB(source,loader){const reference=record(source).reference;if(!reference)throw Error('Reference is available in manifest.json only');return parse(reference,loader);},
    dispose(){}
  };
}
