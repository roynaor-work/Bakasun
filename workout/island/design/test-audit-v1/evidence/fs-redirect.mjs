import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
const root=process.env.AUDIT_REPO_ROOT;
if(!root)throw Error('AUDIT_REPO_ROOT required');
function dest(p){
 const s=p instanceof URL?fileURLToPath(p):typeof p==='string'?p:null;
 if(!s)return p;
 const abs=path.resolve(s);
 if(abs.startsWith(root+'/'))return (process.env.AUDIT_OUTPUT_ROOT||'/tmp/test-audit-v1-outputs')+'/'+abs.slice(root.length+1);
 return p;
}
for(const method of ['writeFile','appendFile','mkdir']){
 const original=fs.promises[method].bind(fs.promises);
 fs.promises[method]=async(p,...args)=>{
  const next=dest(p);
  if(next!==p&&method!=='mkdir')await fs.promises.mkdir(path.dirname(next),{recursive:true});
  return original(next,...args);
 };
}
for(const method of ['writeFileSync','appendFileSync','mkdirSync','createWriteStream']){
 const original=fs[method].bind(fs);
 fs[method]=(p,...args)=>{
  const next=dest(p);
  if(next!==p&&method!=='mkdirSync')fs.mkdirSync(path.dirname(next),{recursive:true});
  return original(next,...args);
 };
}
syncBuiltinESMExports();
