/* Overview sheets for visual comparison; individual delivery images remain untouched. */
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
process.env.XDG_CACHE_HOME='/tmp/north-font-cache';fs.mkdirSync(process.env.XDG_CACHE_HOME,{recursive:true});
const D=require('../catalog.json'),brand=path.resolve(__dirname,'..'),out=path.resolve(brand,'../img/v4');
(async()=>{
 const dest=path.join(brand,'verification');fs.mkdirSync(dest,{recursive:true});
 const width=960,height=920,cellWidth=160,imageWidth=144,imageHeight=180,rowHeight=220;
 for(let batch=0;batch<3;batch++){
  const composites=[];
  const title=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="28"><rect width="960" height="28" fill="#15120f"/><text x="14" y="20" font-family="sans-serif" font-size="12" fill="#e4cca0">NORTH V4 / ${batch*4+1}–${batch*4+4} / product · mood · inside · packaging · use · scale</text></svg>`);
  composites.push({input:title,left:0,top:0});
  for(let row=0;row<4;row++){const p=D.products[batch*4+row];for(let col=0;col<6;col++){const role=D.roles[col],image=await sharp(path.join(out,p.id+'-'+role.id+'.webp')).resize(imageWidth,imageHeight).toBuffer();composites.push({input:image,left:col*cellWidth+8,top:28+row*rowHeight});}
   const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="28"><text x="14" y="18" font-family="sans-serif" font-size="12" fill="#f0e6d2">${p.id}</text></svg>`);composites.push({input:label,left:0,top:208+row*rowHeight});
  }
  let q=83,b;do{b=await sharp({create:{width,height,channels:3,background:'#15120f'}}).composite(composites).webp({quality:q,effort:6}).toBuffer();q-=4;}while(b.length>195000&&q>=48);fs.writeFileSync(path.join(dest,'contact-'+(batch+1)+'.webp'),b);
 }
 console.log('Three 960×920 product-contact sheets written.');
})().catch(e=>{console.error(e);process.exit(1)});
