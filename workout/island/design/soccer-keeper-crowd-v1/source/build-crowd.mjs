// SPDX-License-Identifier: CC0-1.0. Original vector pose, using the original v8 palette/layout.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),sharp=require('sharp'),root=new URL('../',import.meta.url);
const variants=JSON.parse(await readFile(new URL('source/crowd-variants.json',root)));
const polygon=(points,fill)=>`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${fill}"/>`;
const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">';
for(const{variant,people}of variants){svg+=`<g transform="translate(${variant%4*256} ${Math.floor(variant/4)*256})">`;
 for(const p of people){const{x,head:h,shirt,skin,hair,scarf}=p;
  svg+=`<rect x="${x-24}" y="174" width="49" height="58" rx="10" fill="#172633"/>`;
  svg+=polygon([[x-22,h+36],[x+20,h+36],[x+29,187],[x+9,200],[x-25,189]],shirt);
  svg+=polygon([[x-18,h+38],[x-8,h+43],[x-11,185],[x-24,186]],'#233e4b');
  for(const side of[-1,1]){const elbow=[x+side*31,h+8],hand=[x+side*32,h-30];
   svg+=`<path d="M ${x+side*18} ${h+46} L ${elbow.join(' ')}" stroke="${shirt}" stroke-width="13" fill="none"/>`;
   svg+=`<path d="M ${elbow.join(' ')} L ${hand.join(' ')}" stroke="${skin}" stroke-width="9" fill="none"/>`;
   svg+=ellipse(hand[0],hand[1]-.5,5,5.5,skin);
  }
  svg+=`<rect x="${x-6}" y="${h+20}" width="13" height="20" fill="${skin}"/>`+ellipse(x,h+5,16,19,skin);
  svg+=`<path d="M ${x-17} ${h+1} A 17 19.5 0 0 1 ${x+17} ${h-1.4} L ${x} ${h+.5} Z" fill="${hair}"/>`;
  svg+=`<path d="M ${x+12} ${h-7} A 15 19 0 0 1 ${x+3} ${h+24}" stroke="#9a6e57" stroke-width="2" fill="none"/>`;
  if(scarf)svg+=`<path d="M ${x-19} ${h+38} L ${x+20} ${h+44}" stroke="#e5d9b6" stroke-width="5"/>`;
 }
 svg+='</g>';
}svg+='</svg>';
await writeFile(new URL('source/crowd-raised.svg',root),svg+'\n');
const sourceURL=new URL('../../soccer-stadium-v8/runtime/crowd-atlas.webp',import.meta.url),source=await readFile(sourceURL);
const original=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(original.info.width!==1024||original.info.height!==1024)throw new Error('Unexpected v8 atlas dimensions');
const raised=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
// Concatenate decoded scanlines: all 16 source cells remain pixel-identical, including alpha.
const raw=Buffer.concat([original.data,raised]);
await sharp(raw,{raw:{width:1024,height:2048,channels:4}}).png({compressionLevel:9}).toFile(new URL('runtime/crowd-atlas.png',root).pathname);
const cells=[];
for(const pose of ['original','hands_up'])for(let variant=0;variant<16;variant++){
 const column=variant%4,row=Math.floor(variant/4)+(pose==='hands_up'?4:0),x=column*256,y=row*256;
 cells.push({id:`${pose}_${String(variant).padStart(2,'0')}`,variant,pose,sourceVariant:variant,supporters:3,pixelRect:{x,y,width:256,height:256},uvTopLeft:[x/1024,y/2048,(x+256)/1024,(y+256)/2048],uvBottomLeft:[x/1024,1-(y+256)/2048,(x+256)/1024,1-y/2048],safeUvBottomLeft:[(x+4)/1024,1-(y+252)/2048,(x+252)/1024,1-(y+4)/2048]});
}
const manifest={schemaVersion:1,version:'soccer-keeper-crowd-v1',image:'crowd-atlas.png',width:1024,height:2048,cellWidth:256,cellHeight:256,columns:4,rows:8,format:'RGBA8 PNG, lossless',source:{repository:'https://github.com/roynaor-work/Bakasun',commit:'51f4faab518c695672efaf6323a8b72f239a2b84',path:'workout/island/design/soccer-stadium-v8/runtime/crowd-atlas.webp',sha256:createHash('sha256').update(source).digest('hex')},originalPixelIdentity:true,originalDecodedSha256:createHash('sha256').update(original.data).digest('hex'),sampling:{flipY:false,uvConvention:'Use uvBottomLeft for glTF UV coordinates with flipY=false, or uvTopLeft with a top-left canvas crop.',recommendation:'Use safeUvBottomLeft and alphaTest .35; preserve the 256 px cell size. Original UV v values halve because the new texture is twice as tall.'},cells};
await writeFile(new URL('runtime/crowd-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({cells:cells.length,raisedVariants:16,raisedSupporters:48,width:1024,height:2048}));
