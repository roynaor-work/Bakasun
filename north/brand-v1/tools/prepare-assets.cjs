/* Optional image delivery preparation. The delivered HTML runs without this tool. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'../../..'),brand=path.join(root,'north/brand-v1'),out=path.join(root,'north/img/v4');
const data=JSON.parse(fs.readFileSync(path.join(brand,'catalog.json')));
const sources=JSON.parse(fs.readFileSync(path.join(out,'generation.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const roles=new Set(data.roles.map(r=>r.id));
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
(async()=>{
  fs.mkdirSync(path.join(out,'thumbs'),{recursive:true});
  const assets=[];
  for(const s of sources){
    const raw=path.join('/workspace/generated_images',s.sourceFile);
    let productId=data.products.find(p=>data.roles.some(r=>s.key===p.id+'-'+r.id))?.id;
    const role=productId?s.key.slice(productId.length+1):null;
    const banner=s.key.startsWith('banner-'),mockup=s.key.endsWith('-mockup');
    if(!productId&&!banner&&!mockup)throw Error('Unknown source key '+s.key);
    const [width,height]=banner?[1024,384]:mockup?[1000,1000]:[800,1000];
    const file=s.key+'.webp';
    const destination=path.join(mockup?path.join(brand,'assets'):out,file);
    if(!fs.existsSync(destination)||fs.statSync(destination).mtimeMs<fs.statSync(raw).mtimeMs){
      let quality=88,buf;do{buf=await sharp(raw).rotate().resize(width,height,{fit:'cover',position:'centre'}).webp({quality,effort:6}).toBuffer();quality-=3;}while(buf.length>195000&&quality>=55);
      if(buf.length>200000)throw Error('Image budget exceeded: '+file);
      fs.writeFileSync(destination,buf);
    }
    const image=fs.readFileSync(destination),metadata=await sharp(image).metadata();
    if(metadata.width!==width||metadata.height!==height||metadata.format!=='webp'||image.length>200000)throw Error('Invalid image '+file);
    if(productId){const t=path.join(out,'thumbs',file);if(!fs.existsSync(t)||fs.statSync(t).mtimeMs<fs.statSync(destination).mtimeMs)await sharp(image).resize(320,400).webp({quality:76,effort:6}).toFile(t);}
    const record={file,kind:mockup?'mockup':banner?'banner':'product',...(productId?{productId,role}:{}),...(banner?{occasion:s.key.slice(7)}:{}),width,height,bytes:image.length,megabytes:+(image.length/1000000).toFixed(6),sha256:hash(image),sourceFile:s.sourceFile,sourceSha256:hash(fs.readFileSync(raw))};
    assets.push(record);
  }
  assets.sort((a,b)=>a.file.localeCompare(b.file));
  const photos=assets.filter(a=>a.kind==='product'),banners=assets.filter(a=>a.kind==='banner');
  const coverage=data.products.map(p=>({id:p.id,roles:data.roles.map(r=>r.id).filter(role=>photos.some(a=>a.productId===p.id&&a.role===role)),missing:data.roles.map(r=>r.id).filter(role=>!photos.some(a=>a.productId===p.id&&a.role===role))}));
  const manifest={schemaVersion:1,collection:'north-product-photography-v4',format:'image/webp',maximumBytes:200000,portraitDimensions:[800,1000],bannerDimensions:[1024,384],generationTool:'OpenAI image_gen',imagesAreSynthetic:true,sourceCatalog:data.source,style:{references:['north/img/v2/spa-product.webp','north/img/v2/single-malt-product.webp'],gold:'#c8a45a',lighting:'large soft warm source from upper left',surface:'dark charcoal-brown stone',background:'near-black warm brown'},notes:{scale:'Visual scale illustration only. Package dimensions were not provided and are not invented.',wineCheese:'No cheese in the authoritative contents array; no cheese added to the set.',packaging:'Packaging appearance is a proposal; physical sizes and print finish need approval.',moodAndUse:'Serving vessels, ice, table surfaces and scenery are not additional promised contents.'},productPhotoCount:photos.length,bannerCount:banners.length,totalBytes:photos.concat(banners).reduce((s,a)=>s+a.bytes,0),coverage,assets:assets.filter(a=>a.kind!=='mockup')};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(brand,'assets.js'),'window.NORTH_ASSETS = '+JSON.stringify(assets)+';\n');
  const rows=[['productId','role','occasion','file','width','height','bytes','MB','sha256','sourceFile']].concat(assets.filter(a=>a.kind!=='mockup').map(a=>[a.productId,a.role,a.occasion,a.file,a.width,a.height,a.bytes,a.megabytes,a.sha256,a.sourceFile]));
  fs.writeFileSync(path.join(out,'mapping.csv'),'\uFEFF'+rows.map(r=>r.map(csv).join(',')).join('\n')+'\n');
  const thumbs=fs.readdirSync(path.join(out,'thumbs')).map(file=>({file:'thumbs/'+file,bytes:fs.statSync(path.join(out,'thumbs',file)).size}));
  fs.writeFileSync(path.join(out,'thumbnails.json'),JSON.stringify({dimensions:[320,400],count:thumbs.length,totalBytes:thumbs.reduce((s,t)=>s+t.bytes,0),assets:thumbs},null,2)+'\n');
  const palette=JSON.parse(fs.readFileSync(path.join(brand,'palette.json')));
  require('./weights.cjs')();
  console.log(JSON.stringify({photos:photos.length,banners:banners.length,mockups:assets.filter(a=>a.kind==='mockup').length,thumbnails:thumbs.length,missing:coverage.reduce((s,p)=>s+p.missing.length,0),largest:assets.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,3).map(a=>({file:a.file,bytes:a.bytes})),paletteColors:Object.keys(palette.colors).length}));
})().catch(e=>{console.error(e);process.exitCode=1});
