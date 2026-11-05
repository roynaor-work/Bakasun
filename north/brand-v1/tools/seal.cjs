/* Final byte inventory and SHA-256 seal. The checksum file excludes itself. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),brand=path.join(root,'north/brand-v1'),images=path.join(root,'north/img/v4');
const round=process.argv[2]||'09',checksum=path.join(brand,'verification/SHA256SUMS');
if(!/^\d{2}$/.test(round))throw Error('Round required');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const captured=JSON.parse(fs.readFileSync(path.join(brand,'iterations',round,'checks.json')));
for(const [file,want]of Object.entries(captured.sourceHashes))if(hash(path.join(brand,file))!==want)throw Error('Runtime changed since capture: '+file);
function files(){const out=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())out.push(p);else throw Error('Non-regular delivery entry: '+p);}}walk(brand);walk(images);return out.sort();}
if(!fs.existsSync(checksum))fs.writeFileSync(checksum,'');
let converged=false;
for(let n=0;n<12;n++){
 require('./weights.cjs')();
 const next=files().filter(p=>p!==checksum).map(p=>hash(p)+'  '+path.relative(root,p)).join('\n')+'\n',before=fs.readFileSync(checksum,'utf8');
 if(next!==before)fs.writeFileSync(checksum,next);
 require('./weights.cjs')();
 if(next===before){converged=true;break;}
}
if(!converged)throw Error('Seal did not converge');
const bad=[];for(const line of fs.readFileSync(checksum,'utf8').trim().split('\n')){const m=line.match(/^([a-f0-9]{64})  (.+)$/);if(!m||hash(path.join(root,m[2]))!==m[1])bad.push(m?.[2]||line);}
if(bad.length)throw Error('Checksum mismatch: '+bad.join(', '));
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(brand,'weights.js'),'utf8'),sandbox);const W=sandbox.window.NORTH_WEIGHTS,all=files();
if(all.length!==W.files.length||W.files.some(f=>fs.statSync(path.join(root,f.file)).size!==f.bytes))throw Error('Weight inventory differs from final disk bytes');
console.log(JSON.stringify({sealedFiles:all.length-1,inventoryFiles:W.files.length,totalBytes:W.files.reduce((s,f)=>s+f.bytes,0),runtimeHashesMatch:true,allChecksumsMatch:true,inventorySizesMatch:true,completedRounds:W.completedRounds,largest:W.files.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,3)}));
