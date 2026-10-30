// Asset authoring only. Run from any directory; dependencies live outside the game.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modules=process.argv[process.argv.indexOf('--modules')+1];
if(!process.argv.includes('--modules'))throw Error('Pass --modules /path/to/authoring/package.json');
const require=createRequire(path.resolve(modules));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const draco=require('draco3dgltf');
const runtimeRequire=createRequire(path.resolve(path.dirname(process.execPath),'../node_modules/package.json'));
let sharp;try{sharp=require('sharp');}catch{sharp=runtimeRequire('sharp');}
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
const write=async(p,v)=>fs.writeFile(path.join(here,p),JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(path.join(here,'outfits'),{recursive:true});
await fs.mkdir(path.join(here,'maps'),{recursive:true});
const screenManifest=JSON.parse(await fs.readFile(path.join(here,'../screens/manifest.json')));
const palette={schemaVersion:1,colorSpace:'srgb',hairMode:'color-only',defaultSkin:'skin-03',defaultHair:'hair-01',
 skins:['#F1C9AA','#DEAB84','#BF8054','#9B6142','#71452F','#492D24'].map((color,i)=>({id:`skin-0${i+1}`,color})),
 hair:['#222B38','#563E3A','#8C5A38','#D6AE63','#A64C39','#BBC3CF'].map((color,i)=>({id:`hair-0${i+1}`,color}))};
await write('palettes.json',palette);
const rules={};
const entry=(region,condition={})=>({region,...condition});
const lower=(floor,region)=>entry(region,{yMax:floor});
const make=(skin,hair,white,accent,base,other)=>({
 '#714D46':[entry('preserve')], [skin]:[entry('skin')], [hair]:[entry('hair')],
 '#263443':[entry('preserve')],
 [white]:[entry('preserve',{yMin:1.2}),lower(.08,'soles'),entry('socks')],
 [accent]:[lower(.12,'shoes'),lower(.77,'shorts'),entry('shirt')],
 [base]:[lower(.38,'socks'),lower(.77,'shorts'),entry('shirt')],...other});
rules['soccer-player']=make('#BF8054','#25343F','#F8FAEF','#FFF0B8','#27C9A0',{
 '#FF795B':[entry('shoes')],'#173B50':[entry('shorts')]});
rules.goalkeeper=make('#E4AC7E','#563E3A','#FFF7DB','#FF785D','#FFD35D',{
 '#FFF7DB':[entry('preserve',{yMin:1.2}),entry('soles')],
 '#FF785D':[entry('gloves',{absXMin:.60}),lower(.77,'shorts'),entry('shirt')],
 '#343D69':[lower(.12,'shoes'),lower(.38,'socks'),lower(.77,'shorts'),entry('shirt')]});
rules['basketball-player']=make('#81513B','#222B38','#F8F1E5','#FFCB68','#A68AF8',{
 '#F8F1E5':[entry('preserve',{yMin:1.2}),entry('soles')],
 '#FFCB68':[lower(.12,'shoes'),entry('accent',{absXMin:.48}),lower(.77,'shorts'),entry('shirt')],
 '#353455':[entry('shorts')]});
rules.skier={
 '#DCA279':[entry('skin')],'#FFFFFF':[entry('preserve')],'#C5F8F3':[entry('preserve')],
 '#EDF9FF':[entry('soles')],
 '#263D63':[entry('preserve',{yMin:1.2}),lower(.033,'equipment'),lower(.12,'shoes'),lower(.77,'shorts'),entry('shirt')],
 '#FF8069':[entry('helmet',{yMin:1.2}),entry('gloves',{absXMin:.60}),lower(.052,'equipment'),lower(.12,'shoes'),lower(.77,'shorts'),entry('shirt')],
 '#57D8E4':[lower(.77,'shorts'),entry('shirt')]};
const toHex=rgb=>'#'+rgb.slice(0,3).map(v=>Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)).toString(16).padStart(2,'0')).join('').toUpperCase();
const models={};
for(const id of Object.keys(rules)){
 const bytes=await fs.readFile(path.join(here,`../characters/${id}.glb`));
 const doc=await io.readBinary(new Uint8Array(bytes));
 const primitive=doc.getRoot().listMeshes()[0].listPrimitives()[0];
 const color=primitive.getAttribute('COLOR_0'), sources=new Map();
 for(let i=0;i<color.getCount();i++){
  const rgb=color.getElement(i,[]).slice(0,3),hex=toHex(rgb);
  if(!rules[id][hex])throw Error(`${id}: unknown source ${hex}`);
  sources.set(hex,rgb.map(v=>+v.toFixed(8)));
 }
 models[id]={path:`../characters/${id}.glb`,sha256:hash(bytes),bytes:bytes.length,
  vertexCount:primitive.getAttribute('POSITION').getCount(),triangles:primitive.getIndices().getCount()/3,
  absentRegions:id==='skier'?['hair','socks']:id==='basketball-player'?['socks']:[],
  sources:[...sources].map(([hex,linearRGB])=>({hex,linearRGB,rules:rules[id][hex]}))};
}
await write('regions.json',{schemaVersion:1,selection:'source-linear-rgb-and-bind-space-triangle-centroid',maxColorError:.000002,
 models,
 atlas:{width:256,height:256,shirt:[0,0,128,128],shorts:[128,0,128,128],
  swatches:['socks','shoes','soles','gloves','helmet','equipment','white','accent'],
  uvProjection:{shirt:{xScale:350,xOffset:128,yScale:-480,yOffset:586.8},shorts:{xScale:400,xOffset:128,yScale:-450,yOffset:381}}}});
const outfits=screenManifest.kits.map(k=>({schemaVersion:1,id:k.id,modelId:k.sport==='soccer'?'soccer-player':'basketball-player',
 label:k.label,pattern:k.pattern,source:{manifest:'../../screens/manifest.json',kitId:k.id,shirt:`../../screens/${k.shirt}`,shorts:`../../screens/${k.shorts}`},
 colors:{shirt:k.base,shorts:k.base,accent:k.accent,socks:k.base,shoes:k.accent,soles:'#F1EDDA',gloves:k.accent,helmet:k.accent,equipment:k.accent},
 map:`../maps/${k.id}.png`}));
for(const [i,[base,accent]] of [['#FFD16A','#343D69'],['#69D5A4','#173F32'],['#FF987D','#4F253B'],['#91D9FF','#234B65']].entries()){
 const id=`goalkeeper-0${i+1}`;
 outfits.push({schemaVersion:1,id,modelId:'goalkeeper',label:`שוער ${i+1}`,pattern:'keeper-panel',source:{kind:'original-palette'},
  colors:{shirt:base,shorts:accent,accent,socks:base,shoes:accent,soles:'#F1EDDA',gloves:'#F1EDDA',helmet:accent,equipment:accent},map:`../maps/${id}.png`});
}
for(const [i,[base,accent,pants]] of [['#57D8E4','#FF8069','#263D63'],['#BDB0FF','#FFD16A','#352B5D'],['#D5E4A0','#2A6472','#173F32'],['#F6ABD1','#78C9FF','#573C60']].entries()){
 const id=`skier-0${i+1}`;
 outfits.push({schemaVersion:1,id,modelId:'skier',label:`סקי ${i+1}`,pattern:'alpine-chevron',source:{kind:'original-palette'},
  colors:{shirt:base,shorts:pants,accent,socks:pants,shoes:pants,soles:'#EDF9FF',gloves:accent,helmet:accent,equipment:accent},map:`../maps/${id}.png`});
}
function originalPanel(outfit,kind){
 const {colors:c,pattern}=outfit;
 const decoration=pattern==='keeper-panel'?`<path d="M0 65h256v32H0Z" fill="${c.accent}"/>`:
  `<path d="M0 79 128 146 256 79v29l-128 67L0 108Z" fill="${c.accent}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="${c[kind]}" d="M0 0h256v256H0Z"/>${decoration}</svg>`;
}
for(const outfit of outfits){
 const panels=[];
 for(const kind of ['shirt','shorts']){
  let svg;
  if(outfit.source.kitId){
   const source=(await fs.readFile(path.resolve(here,'outfits',outfit.source[kind]),'utf8')).replaceAll('\r\n','\n');
   outfit.source.hashEncoding='utf8-lf';
   outfit.source[`${kind}Sha256`]=hash(Buffer.from(source));
   const pattern=source.split(/<g clip-path="[^"]+">/)[1]?.split('<path d="M62 218')[0];
   if(!pattern)throw Error(`Cannot extract pattern from ${outfit.id}/${kind}`);
   svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="${outfit.colors[kind]}" d="M0 0h256v256H0Z"/>${pattern}</svg>`;
  }else svg=originalPanel(outfit,kind);
  panels.push(await sharp(Buffer.from(svg)).resize(128,128).png().toBuffer());
 }
 const swatches=['socks','shoes','soles','gloves','helmet','equipment','white','accent'];
 const bottom=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="128">${swatches.map((k,i)=>`<path fill="${k==='white'?'#FFFFFF':outfit.colors[k]}" d="M${i*32} 0h32v128h-32Z"/>`).join('')}</svg>`;
 await sharp({create:{width:256,height:256,channels:3,background:'#FFFFFF'}}).composite([
  {input:panels[0],left:0,top:0},{input:panels[1],left:128,top:0},
  {input:await sharp(Buffer.from(bottom)).png().toBuffer(),left:0,top:128}
 ]).png({palette:true,colours:64,compressionLevel:9,effort:10,dither:0}).toFile(path.join(here,'maps',`${outfit.id}.png`));
 await write(`outfits/${outfit.id}.json`,outfit);
}
await write('manifest.json',{schemaVersion:1,created:'2026-10-30',kind:'design-assets-not-runtime',license:'CC0-1.0',
 baseCommit:'039419a2182d40f12d9acbfe0451e18118394d41',budgetBytes:400000,budgetScope:'all four referenced GLBs plus every file in variants/',
 application:'neutralized vertex colors multiplied by a 256px sRGB map; skin/hair are linear vertex colors sampling white',
 regionMap:'regions.json',palettes:'palettes.json',models:Object.keys(models),
 outfits:outfits.map(({id,modelId})=>({id,modelId,path:`outfits/${id}.json`}))});
console.log(`Built ${outfits.length} outfit maps and JSON definitions. Shared GLBs unchanged.`);
