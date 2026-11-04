/** Optional OFFLINE asset authoring; the preview itself has no build step.
 * Install tooling outside the repo: three@0.160.0, playwright,
 * @gltf-transform/{core,extensions,functions}@4.5.1, draco3dgltf@1.5.7, sharp.
 * Run with --tool-root /absolute/tooling-project --url http://127.0.0.1:8765/.../arena/preview.html
 * Optional --chromium /usr/bin/chromium. Only ../arena-shell.glb is written.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const toolRoot=option('--tool-root'),url=option('--url');
if(!toolRoot||!url)throw Error('--tool-root and --url are required');
const require=createRequire(path.resolve(toolRoot,'package.json'));
const {chromium}=require('playwright'),{NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {weld,textureCompress,draco}=require('@gltf-transform/functions');
const codec=require('draco3dgltf'),sharp=require('sharp');
const threeURL=new URL('../../../vendor/three.module.js',url).href;
// The exporter receives ordinary uncompressed image textures, so the optional
// compressed GPU texture decompressor is deliberately unreachable here.
const source=(await fs.readFile(require.resolve('three/examples/jsm/exporters/GLTFExporter.js'),'utf8'))
 .replace("from 'three'",`from '${threeURL}'`)
 .replace("import { decompress } from './../utils/TextureUtils.js';","const decompress=()=>{throw Error('Expected uncompressed authoring textures');};");
const browser=await chromium.launch({headless:true,executablePath:option('--chromium'),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let data;
try{
 const page=await browser.newPage({viewport:{width:844,height:390}});
 await page.goto(url);await page.waitForFunction(()=>window.__hoopsV6?.state.ready,{},{timeout:60000});
 data=await page.evaluate(async exporterSource=>{
  const blob=URL.createObjectURL(new Blob([exporterSource],{type:'text/javascript'}));
  const {GLTFExporter}=await import(blob);URL.revokeObjectURL(blob);
  const arena=window.__hoopsV6.arena;await arena.ready;
  const bytes=await new GLTFExporter().parseAsync(arena.staticGroup,{binary:true,onlyVisible:false,maxTextureSize:1024});
  const array=new Uint8Array(bytes);let result='';
  for(let i=0;i<array.length;i+=32768)result+=String.fromCharCode(...array.subarray(i,i+32768));
  return btoa(result);
 },source);
}finally{await browser.close();}
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.encoder':await codec.createEncoderModule(),'draco3d.decoder':await codec.createDecoderModule()
});
const doc=await io.readBinary(Buffer.from(data,'base64'));
await doc.transform(weld(),textureCompress({encoder:sharp,targetFormat:'webp',quality:88}),draco({method:'edgebreaker',quantizePosition:16,quantizeNormal:10,quantizeTexcoord:14}));
const output=new URL('../arena-shell.glb',import.meta.url);await io.write(output.pathname,doc);
const size=(await fs.stat(output)).size;if(size>1500000)throw Error('GLB exceeds 1.5 MB');
console.log(JSON.stringify({file:'arena-shell.glb',bytes:size}));
