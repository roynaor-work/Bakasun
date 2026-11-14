// Original, text-free artwork. Requires sharp 0.35.x (build dependency only).
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = {ink:'#173E40',sea:'#24786D',mint:'#B9DDC8',sand:'#F8EED9',coral:'#EB947F',gold:'#E9BA57',paper:'#FFFCF4',red:'#F25F55',green:'#48C98A',off:'#395B5B'};
const hash = b => createHash('sha256').update(b).digest('hex');
const defs = `<defs>
 <linearGradient id="sea" x2="0" y2="1"><stop stop-color="#39988A"/><stop offset="1" stop-color="${C.sea}"/></linearGradient>
 <linearGradient id="gold" x2="0" y2="1"><stop stop-color="#FFD77F"/><stop offset="1" stop-color="${C.gold}"/></linearGradient>
 <linearGradient id="snow" x2="0" y2="1"><stop stop-color="${C.paper}"/><stop offset="1" stop-color="#D4EBDF"/></linearGradient>
 <radialGradient id="red"><stop stop-color="#FFAC83"/><stop offset=".7" stop-color="${C.red}"/><stop offset="1" stop-color="#C94549"/></radialGradient>
 <radialGradient id="green"><stop stop-color="#BBF5AA"/><stop offset=".7" stop-color="${C.green}"/><stop offset="1" stop-color="#249D75"/></radialGradient>
</defs>`;
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}<g stroke="${C.ink}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const rect = (x,y,w,h,r,fill,sw=8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke-width="${sw}"/>`;
const circle = (x,y,r,fill,sw=8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke-width="${sw}"/>`;
const line = (x1,y1,x2,y2,color=C.ink,sw=8) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
const bolt = (x,y) => circle(x,y,4,C.sand,2);
const peak = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 27 0-28 40 27Z" fill="${C.mint}" stroke-width="5"/><path d="M-17-4 0-28 17-4 6-8 0-2-6-8Z" fill="${C.paper}" stroke-width="4"/></g>`;
const emblem = (x,y,r=30) => circle(x,y,r,'url(#gold)',6)+peak(x,y,r/48);
const snowFoot = (x,y,w) => `<path d="M${x} ${y}q${w*.12} -24 ${w*.3} -10q${w*.17} -25 ${w*.35} -5q${w*.2} -7 ${w*.35} 15q-${w*.45} 19 -${w} 0Z" fill="url(#snow)" stroke-width="6"/>`;
const assets = [];
function add(id,role,body,extra={}) { assets.push({id,role,svg:svg(body),anchor:[.5,.5],...extra}); }

function lights(active) {
 let b = rect(242,354,28,104,9,'url(#sea)') + rect(200,444,112,23,10,C.sea) + snowFoot(184,467,144);
 b += rect(150,42,212,337,37,C.ink) + rect(142,32,212,337,37,'url(#sea)');
 b += `<path d="M164 55q0-10 12-10h141" stroke="#73BEA7" stroke-width="6"/>`;
 [82,160,238,316].forEach((y,i)=>{
  b += `<path d="M176 ${y-22}q36-40 72-24q34-14 76 18" fill="${C.ink}" stroke-width="5"/>`;
  b += circle(248,y,32,C.ink,6);
  const on = active===4 ? i===3 : i<active;
  b += circle(248,y,25,on ? `url(#${i===3?'green':'red'})` : C.off,4);
  b += `<path d="M234 ${y-8}q7-10 19-8" stroke="${on?C.paper:'#68847A'}" stroke-width="5" fill="none"/>`;
  if(on) b += `<path d="M${i%2?322:174} ${y-4}l0 8" stroke="${i===3?C.green:C.coral}" stroke-width="6"/>`;
 });
 return b + [ [161,49],[335,49],[161,350],[335,350] ].map(([x,y])=>bolt(x,y)).join('');
}
['idle','red-1','red-2','red-3','green'].forEach((v,i)=>add(`start-lights-${v}`,'start-lights',lights(i),{anchor:[.484375,.921875],lightState:i===4?[false,false,false,true]:[0,1,2,3].map(k=>k<i),sockets:{countdown:[382,210]}}));

const gateAngles = [0,-12,-30,-50,-68,-83,-90];
gateAngles.forEach((angle,i)=>{
 let b = rect(66,92,42,366,14,C.sea) + rect(404,92,42,366,14,C.sea);
 b += rect(75,109,12,321,5,C.mint,0) + rect(413,109,12,321,5,C.mint,0);
 b += rect(51,64,410,89,25,C.ink) + rect(45,53,410,89,25,'url(#sea)');
 b += `<path d="M64 60q32-20 64-7q51-15 92-2q76-11 121 0q64-10 103 5v12q-37 14-70 3q-53 15-101 0q-57 14-98 0q-68 12-111 1Z" fill="url(#snow)" stroke-width="6"/>`;
 b += emblem(105,105,25) + rect(148,85,271,40,14,C.sand,5);
 b += `<g transform="rotate(${angle} 100 390)">${rect(92,375,321,28,12,C.paper,6)}<path d="M131 377h31l-17 24h-31Zm75 0h31l-17 24h-31Zm75 0h31l-17 24h-31Zm75 0h31l-17 24h-31Z" fill="${C.coral}" stroke="none"/>${line(113,381,396,381,C.paper,3)}</g>`;
 b += circle(100,390,22,'url(#gold)',6) + circle(100,390,7,C.sea,3);
 b += rect(400,367,48,45,12,C.ink,5) + rect(412,379,22,20,6,i===6?C.green:C.coral,3);
 b += snowFoot(45,461,88)+snowFoot(385,461,88);
 add(`start-gate-${i===0?'closed':i===6?'open':`opening-0${i}`}`,'start-gate',b,{anchor:[.5,.921875],pivots:{bar:[100,390]},barRotationDeg:angle,textRegions:{title:[154,88,256,34]}});
});

let sign = rect(111,310,28,132,8,C.sea)+rect(373,310,28,132,8,C.sea);
sign += rect(38,169,444,171,32,C.ink)+rect(30,157,444,171,32,'url(#gold)');
sign += rect(47,173,410,138,22,C.sand,5)+emblem(105,240,39);
sign += `<path d="M37 171q37-21 69-10q40-16 77-7q45-11 89-1q64-12 111 0q45-10 82 7v15q-47 14-83 2q-41 11-77 0q-59 11-106 0q-66 11-110 0q-24 10-52-6Z" fill="url(#snow)" stroke-width="5"/>`;
sign += bolt(48,235)+bolt(455,235)+snowFoot(90,451,73)+snowFoot(353,451,73);
add('ready-sign','ready-sign',sign,{anchor:[.5,.89453125],textRegions:{title:[160,209,272,68]}});

let board = rect(104,408,25,57,7,C.sea)+rect(383,408,25,57,7,C.sea);
board += rect(34,71,452,374,29,C.ink)+rect(26,60,452,374,29,'url(#sea)');
board += rect(43,143,418,273,19,C.paper,5)+rect(42,76,420,77,20,'url(#gold)',5);
board += emblem(94,114,26);
board += rect(58,165,389,39,12,C.sand,0);
[222,284,346].forEach((y,i)=>{
 board += rect(58,y,389,52,13,i===0?C.mint:C.sand,0);
 board += circle(412,y+26,17,i===0?'url(#gold)':C.paper,4);
});
board += line(178,177,178,393,'#A6C9B5',2)+line(375,177,375,393,'#A6C9B5',2);
board += bolt(37,89)+bolt(467,89)+bolt(37,408)+bolt(467,408);
board += snowFoot(77,467,72)+snowFoot(365,467,72);
add('results-board','results-board',board,{anchor:[.5,.921875],textRegions:{title:[138,88,297,48],headerPlace:[387,170,50,30],headerName:[193,170,167,30],headerTime:[65,170,102,30]},rows:[248,310,372].map(y=>({place:[396,y-16,32,32],name:[193,y-16,167,32],time:[65,y-16,102,32]}))});

let rail = rect(220,76,80,392,31,C.ink,6)+rect(210,66,80,392,31,C.sand,6);
rail += rect(236,121,28,302,14,C.ink,4);
[197,272,347].forEach(y=>{ rail += circle(277,y,5,C.gold,2); });
rail += emblem(250,88,30)+circle(250,438,10,C.sea,3);
add('progress-rail','progress-rail',rail,{sockets:{start:[250,423],finish:[250,121]},fillClipRect:[240,125,20,294]});
add('progress-fill','progress-fill',rect(241,125,18,294,9,C.green,0));
let marker = `<path d="M203 236h40l23 20-23 20h-40q-13 0-13-13v-14q0-13 13-13Z" fill="url(#gold)" stroke-width="6"/>`+circle(220,256,7,C.paper,3);
add('progress-marker','progress-marker',marker,{anchor:[.48828125,.5],pivots:{tip:[266,256]}});

const point=(angle,r)=>[256+Math.cos(angle*Math.PI/180)*r,300+Math.sin(angle*Math.PI/180)*r];
const arc=(a,b,r)=>{const p=point(a,r),q=point(b,r);return `M${p[0]} ${p[1]} A${r} ${r} 0 ${b-a>180?1:0} 1 ${q[0]} ${q[1]}`;};
let speed=circle(263,307,197,C.ink,8)+circle(256,295,197,'url(#sea)',8)+circle(256,295,175,C.sand,6);
speed += `<path d="${arc(150,390,142)}" fill="none" stroke="${C.ink}" stroke-width="30"/>`;
[[150,232,C.green],[238,308,C.gold],[314,390,C.coral]].forEach(([a,b,c])=>{speed+=`<path d="${arc(a,b,142)}" fill="none" stroke="${c}" stroke-width="19"/>`;});
for(let i=0;i<=12;i++){const a=150+i*20,p=point(a,119),q=point(a,i%3===0?100:108);speed+=line(...p,...q,C.ink,i%3===0?6:4);}
speed+=rect(163,355,186,55,17,C.paper,5)+`<path d="M94 252q18-78 87-105" fill="none" stroke="${C.paper}" stroke-width="6"/>`;
add('speedometer-base','speedometer-base',speed,{pivots:{needle:[256,300]},textRegions:{value:[173,359,166,47],unit:[196,416,120,24]}});
let needle=`<path d="M247 295 256 150 265 295 277 317 235 317Z" fill="${C.coral}" stroke-width="6"/>${line(256,174,253,278,C.paper,3)}${circle(256,300,21,'url(#gold)',6)}${circle(256,300,7,C.paper,3)}`;
add('speedometer-needle','speedometer-needle',needle,{anchor:[.5,.5859375],pivots:{needle:[256,300]}});

for(let frame=0;frame<6;frame++){
 const phase=frame/6*Math.PI*2;
 const top=x=>105+Math.sin((x-149)/273*Math.PI*2-phase)*13;
 const bottom=x=>top(x)+160;
 const vertex=(col,row)=>{const x=149+col*273/6;return [x,top(x)+(bottom(x)-top(x))*row/4];};
 const polygon=points=>points.map(p=>p.join(',')).join(' ');
 let b=rect(129,86,22,364,10,'url(#gold)',6)+circle(140,78,17,'url(#gold)',6);
 for(let c=0;c<6;c++)for(let r=0;r<4;r++){
  b+=`<polygon points="${polygon([vertex(c,r),vertex(c+1,r),vertex(c+1,r+1),vertex(c,r+1)])}" fill="${(r+c)%2?C.ink:C.paper}" stroke="${(r+c)%2?C.ink:C.paper}" stroke-width="1"/>`;
 }
 const outline=[...Array.from({length:7},(_,c)=>vertex(c,0)),...Array.from({length:7},(_,c)=>vertex(6-c,4))];
 b+=`<polygon points="${polygon(outline)}" fill="none" stroke-width="7"/>${line(151,113,151,252,C.gold,7)}${snowFoot(102,459,94)}`;
 add(`finish-flag-0${frame+1}`,'finish-flag',b,{anchor:[.2734375,.90625]});
}
let plate=circle(263,263,174,C.ink,8)+circle(256,251,174,'url(#gold)',8)+circle(256,251,147,C.paper,6);
plate+=`<path d="M118 205q25-68 91-91" stroke="${C.paper}" stroke-width="8" fill="none"/>`;
add('countdown-disc','countdown-disc',plate,{textRegions:{value:[139,169,234,157]}});

const manifest={
 schemaVersion:1,id:'alpine-start-lights-v1',version:'1.0.0',created:'2026-11-14',
 baseCommit:'19d9cdc5e3718236df5a2fc4d8b8c26c72007575',
 description:'Text-free alpine race sprites. All visible words and numbers belong to the host UI.',
 coordinateSystem:{logicalSize:[512,512],origin:'top-left',x:'right',y:'down',anchorUnits:'normalized fraction of full untrimmed image',rectFormat:'x,y,width,height in logical pixels',pivotUnits:'logical pixels',scaleRule:'multiply logical coordinates by PNG size / 512; never trim animation frames'},
 format:{type:'image/png',colorSpace:'sRGB',alpha:'straight RGBA',sizes:[512,1024],maxBytesPerFile:1000000},
 style:{palette:C,reference:'../ui-kit-v2/tokens.json',outlineLogicalPx:8},
 text:{baked:false,direction:'rtl',language:'he',fontStack:'Arial, DejaVu Sans, sans-serif',numericDirection:'ltr',recommendedInk:C.ink,minDisplayFontPx:14},
 animations:{
  countdown:{loop:false,initial:'start-lights-idle',gateAtGreen:true,frames:[{asset:'start-lights-red-1',durationMs:1000,value:'3'},{asset:'start-lights-red-2',durationMs:1000,value:'2'},{asset:'start-lights-red-3',durationMs:1000,value:'1'},{asset:'start-lights-green',durationMs:500,value:'צאו!'}],reducedMotion:'same discrete light states and timing; no pulses'},
  gateOpen:{loop:false,holdLast:true,frames:gateAngles.map((_,i)=>({asset:`start-gate-${i===0?'closed':i===6?'open':`opening-0${i}`}`,durationMs:[40,55,65,75,85,70,70][i]})),reducedMotion:'switch from closed to open at green'},
  finishFlag:{loop:true,frames:Array.from({length:6},(_,i)=>({asset:`finish-flag-0${i+1}`,durationMs:120})),reducedMotion:'finish-flag-01'}
 },
 composition:{
  progress:{layers:['progress-rail','progress-fill','progress-marker'],range:[0,1],start:[250,423],finish:[250,121],fillClipRect:[240,125,20,294],fillRule:'clip fill from bottom upwards with height = 294 * progress',markerRule:'draw at the same canvas origin as rail; translateY = (423 - 302 * progress) - 256',mirrorForRTL:false},
  speedometer:{layers:['speedometer-base','speedometer-needle'],pivot:[256,300],rangeKmh:[0,140],rotationDeg:[-120,120],rotationRule:'clamp speed / 140 to [0,1]; angle = -120 + 240 * fraction; rotate needle about pivot',valueAsset:'speedometer-base',numericDirection:'ltr'},
  results:{asset:'results-board',columnsRTL:['place','name','time'],numericDirection:'ltr',rows:3},
  readiness:{asset:'ready-sign',text:'מוכנים'},countdown:{asset:'countdown-disc',values:['3','2','1','צאו!']}
 },assets:[]
};
await mkdir(path.join(root,'source','svg'),{recursive:true});
for(const asset of assets){
 const {svg:source,...meta}=asset;
 await writeFile(path.join(root,'source','svg',`${asset.id}.svg`),source+'\n');
 manifest.assets.push(await exportAsset(meta,Buffer.from(source)));
}
manifest.assets.push(await exportAsset({id:'alpine-badge',role:'decoration',anchor:[.5,.5],provenance:'source/badge-master.webp; lossless copy of image_gen original generated for this task'},await readFile(path.join(root,'source','badge-master.webp'))));
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'source','catalog.js'),'// Generated from manifest.json by build.mjs; enables file:// previews.\nwindow.ALPINE_KIT = '+JSON.stringify(manifest)+';\n');
console.log(JSON.stringify({assets:manifest.assets.length,pngs:manifest.assets.length*2,totalBytes:manifest.assets.flatMap(a=>a.variants).reduce((n,v)=>n+v.bytes,0),maxBytes:Math.max(...manifest.assets.flatMap(a=>a.variants.map(v=>v.bytes)))},null,2));

async function exportAsset(meta,input){
 const variants=[];
 for(const size of [512,1024]){
  const folder=path.join(root,'png',String(size));await mkdir(folder,{recursive:true});
  const margin=meta.role==='decoration'?size/32:0;
  let render=sharp(input,{density:size/512*72}).resize(size-margin*2,size-margin*2).toColourspace('srgb').ensureAlpha();
  if(margin)render=render.extend({top:margin,bottom:margin,left:margin,right:margin,background:{r:0,g:0,b:0,alpha:0}});
  const buffer=await render.png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
  if(buffer.length>=1000000)throw new Error(`${meta.id} ${size} exceeds decimal 1MB`);
  const relative=`png/${size}/${meta.id}.png`;await writeFile(path.join(root,relative),buffer);
  const {data,info}=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
  let minX=size,minY=size,maxX=-1,maxY=-1,clear=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const alpha=data[(y*size+x)*info.channels+3];
   if(alpha){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}else clear++;
  }
  variants.push({file:relative,width:size,height:size,bytes:(await stat(path.join(root,relative))).size,sha256:hash(buffer),alphaBounds:[minX,minY,maxX-minX+1,maxY-minY+1],transparentPixelFraction:Number((clear/(size*size)).toFixed(5))});
 }
 return {...meta,variants};
}
