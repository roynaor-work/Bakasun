// Inventory from actual file bytes and decoded GLB counts in the manifest.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const models=new Map(manifest.assets.map(a=>[a.file,a])),mb=b=>(b/1e6).toFixed(6);
async function walk(dir){let out=[];for(const d of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const exclude=new Set(['WEIGHTS.md','WEIGHTS.csv','inventory.json','verification/soak-progress.json']);
const files=[];for(const p of(await walk(root)).sort()){
 const file=path.relative(root,p);if(exclude.has(file))continue;const b=await fs.readFile(p),a=models.get(file);
 let dimensions=null;if(file.endsWith('.png')&&b.readUInt32BE(0)===0x89504e47)dimensions=[b.readUInt32BE(16),b.readUInt32BE(20)];
 if(file==='textures/fire-sky.jpg')dimensions=[1024,512];
 files.push({file,bytes:b.length,mb:Number(mb(b.length)),triangles:a?.triangles??null,lod:a?.lod??null,
   texture:a?.texture??null,dimensions:dimensions||a?.textureDimensions||null,sha256:createHash('sha256').update(b).digest('hex')});
}
const inventory={generatedAt:new Date().toISOString(),decimalMegabytes:true,excludedSelfAndGeneratedReports:[...exclude],files,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
await fs.writeFile(path.join(root,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
const csv=v=>v===null||v===undefined?'':`"${String(v).replaceAll('"','""')}"`;
const rows=[['file','bytes','MB_decimal','triangles','LOD','texture','texture_or_image_dimensions','sha256'],...files.map(f=>[f.file,f.bytes,mb(f.bytes),f.triangles,f.lod,f.texture,f.dimensions?.join('x'),f.sha256])];
await fs.writeFile(path.join(root,'WEIGHTS.csv'),rows.map(row=>row.map(csv).join(',')).join('\n')+'\n');
let md='# משקלי קבצים · Fire v7\n\nMB בטבלה הוא 1,000,000 בתים. מספרי המשולשים נמדדו אחרי פענוח Draco, בלי LOD נסתרים ובלי כפל מופעים. הטקסטורה מוטמעת בכל GLB; בחבילת התצוגה היא משותפת פעם אחת.\n\n## כל קובצי GLB\n\n| קובץ | רמה | משולשים | בתים | MB | טקסטורה יחידה |\n|---|---:|---:|---:|---:|---|\n';
for(const a of manifest.assets)md+=`| [${a.file}](${a.file}) | ${a.lod} | ${a.triangles.toLocaleString('en-US')} | ${a.bytes.toLocaleString('en-US')} | ${mb(a.bytes)} | ${path.basename(a.texture)} · ${a.textureDimensions.join('×')} |\n`;
md+='\n## אטלסים ושמיים\n\n| קובץ | ממדים | בתים | MB |\n|---|---:|---:|---:|\n';
for(const f of files.filter(f=>/^(textures|particles)\//.test(f.file)))md+=`| [${f.file}](${f.file}) | ${f.dimensions?.join('×')||'—'} | ${f.bytes.toLocaleString('en-US')} | ${mb(f.bytes)} |\n`;
md+='\n## תצוגה ומפענח\n\n| קובץ | בתים | MB |\n|---|---:|---:|\n';
for(const f of files.filter(f=>!f.file.includes('/')&&/\.(js|html|css)$/.test(f.file)||f.file.startsWith('vendor/')))md+=`| [${f.file}](${f.file}) | ${f.bytes.toLocaleString('en-US')} | ${mb(f.bytes)} |\n`;
md+='\n## קבצים גדולים\n\n| קובץ | MB |\n|---|---:|\n';
for(const f of [...files].sort((a,b)=>b.bytes-a.bytes).slice(0,10))md+=`| [${f.file}](${f.file}) | ${mb(f.bytes)} |\n`;
md+='\n[WEIGHTS.csv](WEIGHTS.csv) ו־[inventory.json](inventory.json) מפרטים גם כל צילום, ביקורת, מחולל, דוח וקובץ אימות, עם משקל ו־SHA-256. שלושת קובצי האינדקס עצמם מוחרגים כדי למנוע תלות עצמית של גודל ו־checksum. קובץ התקדמות חי מוחרג בזמן העבודה ואינו נכלל במסירה הסופית.\n';
md+='\nמפות 512×512 תופסות כ־1.40MB כל אחת כ־RGBA8 עם שרשרת mip מלאה; אטלס 1024×1024 כ־5.59MB. זו הערכת אחסון לטקסטורה בודדת, לא מדידת זיכרון GPU כולל. ברירת המחדל משתמשת באטלסי חלקיקים 512, ובהפחתת איכות ב־256.\n';
await fs.writeFile(path.join(root,'WEIGHTS.md'),md);console.log(JSON.stringify({files:files.length,totalMB:Number(mb(inventory.totalBytes)),largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,5).map(f=>({file:f.file,bytes:f.bytes,mb:f.mb})),glbCount:manifest.assets.length,maxGLB:Math.max(...manifest.assets.map(a=>a.bytes))}));
