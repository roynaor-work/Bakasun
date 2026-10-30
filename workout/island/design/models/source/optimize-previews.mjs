/** Palette PNGs and a contact sheet, built exclusively from the reimported GLB renders. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const args=process.argv.slice(2);
const arg=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d;
const dir=path.resolve(arg('--models','.'));
const moduleRoot=arg('--modules');
const require=createRequire(moduleRoot?path.join(path.resolve(moduleRoot),'package.json'):import.meta.url);
const sharp=require('sharp');
const ids=['soccer-stadium','basketball-arena','ski-slope','slalom-gate','fir-a','fir-b','fir-c','rock','fence','soccer-goal','basketball-hoop','soccer-ball','basketball','skis','snowboard','ski-poles'];
const tiles=[];const size=192,header=60,tileHeight=216;
for(let i=0;i<ids.length;i++){
  const id=ids[i],filename=path.join(dir,id+'.png');
  const data=await sharp(filename).resize(384,384).png({palette:true,colours:128,dither:0,effort:10}).toBuffer();
  await fs.writeFile(filename,data);
  const image=await sharp(data).resize(size,size).png().toBuffer();
  const label=Buffer.from(`<svg width="192" height="24"><rect width="192" height="24" fill="#243D51"/><text x="96" y="17" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#F6EBCB">${id}</text></svg>`);
  const x=i%4*size,y=header+Math.floor(i/4)*tileHeight;
  tiles.push({input:image,left:x,top:y},{input:label,left:x,top:y+size});
}
const banner=Buffer.from('<svg width="768" height="60"><rect width="768" height="60" fill="#243D51"/><text x="20" y="27" font-family="Arial,sans-serif" font-size="19" font-weight="bold" fill="#F6EBCB">ISLAND / ENVIRONMENT + EQUIPMENT</text><text x="20" y="46" font-family="Arial,sans-serif" font-size="11" fill="#8ED3C6">16 ORIGINAL LOW-POLY GLB ASSETS · METRES · VERTEX COLOURS · DRACO</text></svg>');
tiles.push({input:banner,left:0,top:0});
await sharp({create:{width:768,height:header+4*tileHeight,channels:3,background:'#243D51'}}).composite(tiles).png({palette:true,colours:128,dither:0,effort:10}).toFile(path.join(dir,'overview.png'));
console.log('Optimized 16 PNG previews and overview.png.');
