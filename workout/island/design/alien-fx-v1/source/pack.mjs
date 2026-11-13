// SPDX-License-Identifier: CC0-1.0
// Original atlas packaging, timing and geometric overlays. See ../LICENSES.md.
import {createRequire} from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, 'sprites'), {recursive:true});
const blank = (w,h) => sharp({create:{width:w,height:h,channels:4,background:'#0000'}});
const svg = (w,h,body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const tau = Math.PI * 2;
const clip = n => Math.max(0,Math.min(1,n));
const originals = ['regular','vulcan','impact','small','boss','shield'];
const crops = [[0,0,627,452],[627,0,627,452],[0,452,627,280],[627,452,627,295],[0,732,627,522],[627,747,627,507]];
const art = {};
for (let i=0;i<originals.length;i++) {
  const [left,top,width,height] = crops[i];
  const cell = await sharp(join(root,'source/effects-original.png'))
    .extract({left,top,width,height}).png().toBuffer();
  art[originals[i]] = await sharp(cell).trim({threshold:8}).png().toBuffer();
}
async function stamp(kind, w, h, opacity=1, angle=0) {
  const {data,info} = await sharp(art[kind]).rotate(angle,{background:'#0000'})
    .resize(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),{fit:'fill'})
    .ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Preserve straight alpha; never color-key or flatten the generated source.
  for (let i=3;i<data.length;i+=4) {
    data[i]=Math.round(data[i]*clip(opacity));
    // Remove quantization dust from the nominally empty shield interior.
    if(kind==='shield' && data[i]<4) data[i]=0;
  }
  return {input:await sharp(data,{raw:info}).png().toBuffer(), width:info.width,height:info.height};
}
async function frame(w,h,kind,size,opacity=1,angle=0,anchor=[.5,.5],overlay='') {
  const mark = await stamp(kind,size[0],size[1],opacity,angle);
  const layers=[{input:mark.input,left:Math.round(w*anchor[0]-mark.width/2),top:Math.round(h*anchor[1]-mark.height*(anchor[1]>.7?1:.5))}];
  if(overlay) layers.push({input:svg(w,h,overlay),left:0,top:0});
  return blank(w,h).composite(layers).png().toBuffer();
}
const textures=[];
async function sheet(id, fw,fh,columns,rows,durations,frames,details={}) {
  const path=`sprites/${id}.png`;
  await blank(fw*columns,fh*rows).composite(frames.map((input,i)=>({input,left:i%columns*fw,top:Math.floor(i/columns)*fh})))
    .png({compressionLevel:9}).toFile(join(root,path));
  textures.push({id,path,width:fw*columns,height:fh*rows,frameWidth:fw,frameHeight:fh,columns,rows,frameCount:frames.length,
    frameDurationsMs:durations,playback:details.loop?'loop':'once',alpha:'straight',blend:'source-over',
    pivot:details.pivot??[.5,.5],frames:frames.map((_,i)=>({x:i%columns*fw,y:Math.floor(i/columns)*fh,w:fw,h:fh})),...details});
}
await sheet('cannon-regular',128,128,4,1,[45,45,45,45],await Promise.all([.62,1,.83,.46].map((s,i)=>frame(128,128,'regular',[48*s,104*s],1-i*.12,[0,-2,2,0][i],[.5,.92]))),{pivot:[.5,.92],direction:'up',loop:false});
await sheet('vulcan-burst',128,128,8,1,Array(8).fill(62.5),await Promise.all([.7,1,.78,.96,.75,1,.73,.49].map((s,i)=>frame(128,128,'vulcan',[61*s,109*s],i===7?.5:1,[0,-3,2,-2,3,-1,2,0][i],[.5,.92]))),{pivot:[.5,.92],direction:'up',loop:false});

const flamePath='M16 3C18 9 24 10 24 18A9 9 0 0 1 6 18C6 13 11 10 11 7C12 13 15 14 16 3ZM17 15C17 19 12 20 13 24C17 28 21 22 17 15Z';
function heat(fill=1, brightness=1, shutdown=false) {
  return svg(256,32,`<defs><linearGradient id="heat"><stop stop-color="#38e995"/><stop offset=".5" stop-color="#ffdd46"/><stop offset="1" stop-color="#ff525b"/></linearGradient><linearGradient id="glass" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".48"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="slot"><rect x="38" y="8" width="208" height="16" rx="7"/></clipPath></defs>
  <rect x="1" y="1" width="254" height="30" rx="15" fill="#102a40" stroke="#85ddeb" stroke-opacity=".7"/>
  <g opacity="${brightness}"><path d="${flamePath}" fill="${shutdown?'#ff9370':'#ffce56'}" fill-rule="evenodd" transform="translate(3 1) scale(.94)"/>
  <g clip-path="url(#slot)"><rect x="38" y="8" width="208" height="16" fill="#243e52"/><rect x="38" y="8" width="${208*fill}" height="16" fill="url(#heat)"/><rect x="38" y="8" width="208" height="7" fill="url(#glass)"/></g></g>
  <path d="M107 9V23M176 9V23" stroke="#102a40" stroke-opacity=".55" stroke-width="2"/>
  ${shutdown?'<path d="M228 13V19M234 13V19" stroke="#fff0dc" stroke-width="2" stroke-linecap="round"/>':''}`);
}
await sharp(heat()).png().toFile(join(root,'sprites/heat-bar.png'));
textures.push({id:'heat-bar',path:'sprites/heat-bar.png',width:256,height:32,frameWidth:256,frameHeight:32,columns:1,rows:1,frameCount:1,frames:[{x:0,y:0,w:256,h:32}],frameDurationsMs:[0],playback:'static',alpha:'straight',blend:'source-over',pivot:[0,0],fillRect:{x:38,y:8,w:208,h:16},iconRect:{x:4,y:3,w:26,h:26},fillDirection:'left-to-right',thresholds:{green:0,yellow:.5,red:1}});
await sharp(svg(32,32,`<path d="${flamePath}" fill="#ffce56" fill-rule="evenodd"/>`)).png().toFile(join(root,'sprites/heat-icon.png'));
textures.push({id:'heat-icon',path:'sprites/heat-icon.png',width:32,height:32,frameWidth:32,frameHeight:32,columns:1,rows:1,frameCount:1,frames:[{x:0,y:0,w:32,h:32}],frameDurationsMs:[0],playback:'static',alpha:'straight',blend:'source-over',pivot:[.5,.5]});
await sheet('overheat-shutdown',256,32,6,1,Array(6).fill(200),await Promise.all([1,.32,.91,.27,.64,.22].map((b,i)=>sharp(heat(1-i/5,b,true)).png().toBuffer())),{loop:false,flashPeaksPerSecond:2.5});
await sheet('alien-impact',128,128,6,1,[35,40,50,65,80,90],await Promise.all([.36,.66,.89,1,.91,.83].map((s,i)=>frame(128,128,'impact',[108*s,108*s],[.55,1,1,.75,.4,.05][i],i*4))),{loop:false});
// Eight rectangular cells make an exactly 512 x 512 atlas; artwork stays round.
await sheet('alien-explosion',128,256,4,2,[45,55,65,80,90,105,120,140],await Promise.all([.23,.51,.77,.96,1,.94,.84,.65].map((s,i)=>frame(128,256,'small',[112*s,100*s],[.65,1,1,1,.85,.6,.3,.035][i],i*3))),{loop:false,artworkBounds:{x:8,y:78,w:112,h:100}});

const bossFrames=[];
for(let i=0;i<64;i++) {
  const t=i/63, growth=1-Math.exp(-t*15), fade=i===63?0:Math.max(.006,clip((1-t)/.58)**1.8);
  const coreSize=(26+67*growth)*(1-.3*clip((t-.55)/.45));
  const ringRadius=8+49*(1-Math.exp(-t*3.1));
  const ringOpacity=Math.sin(Math.PI*clip((t-.02)/.98))*(1-t)*.78;
  let overlay=`<circle cx="64" cy="64" r="${ringRadius}" fill="none" stroke="#ffb660" stroke-width="${4*(1-t)+.4}" opacity="${ringOpacity*.3}"/><circle cx="64" cy="64" r="${ringRadius}" fill="none" stroke="#fff5bf" stroke-width="${1.8*(1-t)+.3}" opacity="${ringOpacity}"/>`;
  for(let j=0;j<14;j++) {
    const a=j*tau/14+.12*Math.sin(j*5),r=(13+39*growth)*(1+(j%3)*.06),op=clip((1-t)*1.1)*clip(t*9);
    overlay+=`<circle cx="${64+Math.cos(a)*r}" cy="${64+Math.sin(a)*r}" r="${(.5+(j%3)*.5)*(1-t)}" fill="${j%3?'#ffe28d':'#8bffe1'}" opacity="${op}"/>`;
  }
  bossFrames.push(await frame(128,128,'boss',[coreSize,coreSize],fade,t*16,[.5,.5],overlay));
}
await sheet('boss-explosion',128,128,8,8,Array(64).fill(1500/64),bossFrames,{loop:false,shockwave:true});
await sheet('shield-ring',128,128,8,1,Array(8).fill(100),await Promise.all(Array.from({length:8},(_,i)=>{
  const t=i/8*tau, s=1+.018*Math.sin(t);
  return frame(128,128,'shield',[112*s,112*s],.73+.16*Math.sin(t),i*45);
})),{loop:true,interior:'transparent'});

const audio=JSON.parse(await readFile(join(root,'source/audio-measurements.json'),'utf8'));
const manifest={schemaVersion:1,id:'alien-fx-v1',created:'2026-11-13',repository:'roynaor-work/Bakasun',baseCommit:'d759582c171600dd7c7df7906c2fb38ae7f8b88a',license:'CC0-1.0',runtimeIntegration:'not-connected',
  coordinates:'pixels, origin top-left, row-major, no rotation or trimming at runtime',sampling:{filter:'linear',mipmaps:false,wrap:'clamp-to-edge',colorSpace:'sRGB',premultipliedAlpha:false},
  textures,sounds:audio.sounds,heatMeter:{background:'#243e52',emptyFillRect:{x:38,y:8,w:208,h:16},drawing:'Draw heat-bar once; cover the unfilled right part of fillRect with background. Preserve icon, frame and dividers.',overheat:'Play overheat-shutdown once at full heat; disable vulcan until game cooldown completes. Timing here is presentation only.'},
  documentation:['REPORT.md','LICENSES.md','source/PROMPTS.md'],inventory:'FILE-SIZES.csv',preview:'preview.html'};
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(root,'preview-data.js'),'// SPDX-License-Identifier: CC0-1.0\n// Generated by source/pack.mjs from the same descriptors as manifest.json.\nwindow.ALIEN_FX = '+JSON.stringify({textures,sounds:audio.sounds})+';\n');
console.log(`Packed ${textures.length} textures, ${textures.reduce((n,t)=>n+t.frameCount,0)} frames.`);
