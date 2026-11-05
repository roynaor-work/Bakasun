/* Optional asset preparation utility; the preview needs no build or dependencies. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'../../..');
const [input,relative,kind='portrait']=process.argv.slice(2);
if(!input||!relative)throw Error('Usage: node tools/encode.cjs source.png north/img/v4/id-role.webp [portrait|banner|mockup]');
const out=path.resolve(root,relative);
if(!out.startsWith(path.join(root,'north/img/v4/'))&&!out.startsWith(path.join(root,'north/brand-v1/assets/')))throw Error('Output must be in the authorized new asset directories');
(async()=>{
  const [width,height]=kind==='banner'?[1024,384]:kind==='mockup'?[1000,1000]:[800,1000];
  fs.mkdirSync(path.dirname(out),{recursive:true});
  let quality=88,buf;
  do{buf=await sharp(input).rotate().resize(width,height,{fit:'cover',position:'centre'}).webp({quality,effort:6}).toBuffer();quality-=3;}while(buf.length>195000&&quality>=55);
  if(buf.length>200000)throw Error('Cannot meet the 200,000 byte cap');
  fs.writeFileSync(out,buf);
  console.log(JSON.stringify({file:relative,source:path.basename(input),width,height,bytes:buf.length,quality:quality+3,sha256:crypto.createHash('sha256').update(buf).digest('hex')}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
