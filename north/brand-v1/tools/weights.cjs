/* Recalculate the entire delivery inventory; no original generation PNGs needed. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),brand=path.join(root,'north/brand-v1'),images=path.join(root,'north/img/v4');
const csv=v=>'"'+String(v).replaceAll('"','""')+'"';
function update(){
  const js=path.join(brand,'weights.js'),sheet=path.join(brand,'weights.csv');
  for(const file of [js,sheet])if(!fs.existsSync(file))fs.writeFileSync(file,'');
  const completedRounds=fs.readdirSync(path.join(brand,'iterations')).filter(n=>/^\d{2}$/.test(n)&&['checks.json','CRITIQUE.md'].every(f=>fs.existsSync(path.join(brand,'iterations',n,f)))).sort();
  let files=[];
  for(let pass=0;pass<12;pass++){
    files=[];
    function scan(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(folder,e.name);if(e.isDirectory())scan(p);else if(e.isFile())files.push({file:path.relative(root,p),bytes:fs.statSync(p).size,triangles:0,textures:0});}}
    scan(images);scan(brand);
    const a='window.NORTH_WEIGHTS = '+JSON.stringify({unit:'decimal MB',files,completedRounds})+';\n';
    const b='\uFEFF'+[['file','bytes','MB','triangles','GPU textures'],...files.map(f=>[f.file,f.bytes,(f.bytes/1000000).toFixed(6),0,0])].map(r=>r.map(csv).join(',')).join('\n')+'\n';
    if(fs.readFileSync(js,'utf8')===a&&fs.readFileSync(sheet,'utf8')===b)return{files,completedRounds,totalBytes:files.reduce((s,f)=>s+f.bytes,0)};
    fs.writeFileSync(js,a);fs.writeFileSync(sheet,b);
  }
  throw Error('Inventory sizes did not converge');
}
module.exports=update;
if(require.main===module){const r=update();console.log(JSON.stringify({fileCount:r.files.length,totalBytes:r.totalBytes,completedRounds:r.completedRounds,largest:r.files.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,8)}));}
