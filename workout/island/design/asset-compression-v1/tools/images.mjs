import sharp from 'sharp';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import encodeExact,{init as initExact} from '@jsquash/webp/encode.js';
import {simd} from 'wasm-feature-detect';
import {sha256} from './common.mjs';

sharp.concurrency(2);
export async function pixels(bytes) {
  return sharp(bytes,{limitInputPixels:64*1024*1024}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
export async function pixelDifference(a,b) {
  const [x,y]=await Promise.all([pixels(a),pixels(b)]);
  if(x.info.width!==y.info.width||x.info.height!==y.info.height||x.data.length!==y.data.length)throw Error('Image dimensions changed');
  let maxVisibleRGBAError=0,maxAlphaError=0,maxRGBAError=0;
  for(let i=0;i<x.data.length;i+=4) {
    maxAlphaError=Math.max(maxAlphaError,Math.abs(x.data[i+3]-y.data[i+3]));
    for(let c=0;c<4;c++)maxRGBAError=Math.max(maxRGBAError,Math.abs(x.data[i+c]-y.data[i+c]));
    // Also require hidden RGB to survive: linear filtering of straight-alpha
    // game textures can bring that color into a visible edge.
    if(x.data[i+3]||y.data[i+3]) for(let c=0;c<4;c++)maxVisibleRGBAError=Math.max(maxVisibleRGBAError,Math.abs(x.data[i+c]-y.data[i+c]));
  }
  return {width:x.info.width,height:x.info.height,maxVisibleRGBAError,maxAlphaError,maxRGBAError};
}
let exactReady;
async function exactWebP(bytes) {
  exactReady||=(async()=>{const name=await simd()?'webp_enc_simd.wasm':'webp_enc.wasm';const module=await WebAssembly.compile(await readFile(new URL(`../node_modules/@jsquash/webp/codec/enc/${name}`,import.meta.url)));await initExact(module);})();
  await exactReady;
  const {data,info}=await pixels(bytes);
  return Buffer.from(await encodeExact({data:new Uint8ClampedArray(data),width:info.width,height:info.height},{lossless:1,exact:1,quality:100,method:6,alpha_quality:100}));
}
async function decodeMS(bytes) {
  const times=[];
  await pixels(bytes);
  for(let i=0;i<3;i++){const start=performance.now();await pixels(bytes);times.push(performance.now()-start);}
  return Number(times.sort((a,b)=>a-b)[1].toFixed(3));
}
const encodedImages=new Map();
export function losslessWebP(bytes) {
  const key=sha256(bytes);
  if(!encodedImages.has(key))encodedImages.set(key,encodeLosslessWebP(bytes));
  return encodedImages.get(key);
}
async function encodeLosslessWebP(bytes) {
  const start=performance.now();
  const metadata=await sharp(bytes).metadata();
  if(metadata.pages>1||metadata.orientation&&metadata.orientation!==1||metadata.icc) return {bytes,safe:false,selected:false,reason:'Animated, rotated or ICC-managed image requires manual review'};
  let candidate=await sharp(bytes).webp({lossless:true,effort:6,alphaQuality:100}).toBuffer(),quality=await pixelDifference(bytes,candidate),encoder='sharp';
  if(quality.maxRGBAError){candidate=await exactWebP(bytes);quality=await pixelDifference(bytes,candidate);encoder='libwebp-exact-wasm';}
  const safe=quality.maxRGBAError===0;
  return {bytes:safe&&candidate.length<bytes.length?candidate:bytes,safe,selected:safe&&candidate.length<bytes.length,quality,candidateBytes:candidate.length,encoder,encodeMS:Number((performance.now()-start).toFixed(3)),sourceDecodeMS:await decodeMS(bytes),webpDecodeMS:await decodeMS(candidate),reason:safe?'Exact decoded RGBA, including hidden RGB, dimensions and alpha':'Pixel gate failed; original retained'};
}
