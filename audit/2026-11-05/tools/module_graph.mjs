// Static ES-module graph using a lexer, not a bundler. No source is modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const {init,parse}=await import(process.env.ES_MODULE_LEXER||'/tmp/bakasun-audit-runtime/node_modules/es-module-lexer/dist/lexer.js');await init;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='https://audit.invalid/Bakasun/';
const entries={bakasun:'js/app.js',workout:'workout/js/app.js',island:'workout/island/app.mjs',north:'north/js/app.js'};
const report={at:new Date().toISOString(),method:'es-module-lexer static imports from the shipped entry; URL query is part of module identity; dynamic imports are listed but not traversed',apps:{}};
for(const [app,entry] of Object.entries(entries)){
  const todo=[new URL(entry,origin).href],seen=new Map(),missing=[],external=[],dynamic=[],expressions=[];
  while(todo.length){
    const href=todo.shift();if(seen.has(href))continue;
    const u=new URL(href);if(u.origin!==new URL(origin).origin){external.push(href);continue;}
    const rel=decodeURIComponent(u.pathname.slice('/Bakasun/'.length));
    let source;try{source=await fs.readFile(path.join(root,rel),'utf8');}catch{missing.push({path:rel,query:u.search});continue;}
    seen.set(href,{path:rel,query:u.search,bytes:Buffer.byteLength(source),gzipBytes:gzipSync(source).length});
    let imports;try{[imports]=parse(source);}catch(e){expressions.push({path:rel,parseError:String(e)});continue;}
    for(const im of imports){
      if(im.d===-2)continue; // import.meta
      if(!im.n){if(im.d>=0)expressions.push({path:rel,offset:im.s});continue;}
      const target=new URL(im.n,href).href;
      if(im.d>=0)dynamic.push({from:rel,to:new URL(target).pathname.replace('/Bakasun/','')});else todo.push(target);
    }
  }
  const modules=[...seen.values()],byPath=new Map();for(const m of modules){if(!byPath.has(m.path))byPath.set(m.path,[]);byPath.get(m.path).push(m.query);}
  report.apps[app]={entry,staticModuleIdentities:modules.length,uniqueFiles:byPath.size,totalDecodedBytes:modules.reduce((n,m)=>n+m.bytes,0),totalGzipBytes:modules.reduce((n,m)=>n+m.gzipBytes,0),
    duplicateIdentities:[...byPath].filter(([,v])=>v.length>1).map(([path,queries])=>({path,queries})),missing,external:[...new Set(external)],dynamic,expressions,modules};
}
await fs.writeFile(path.join(root,'audit/2026-11-05/evidence/module-graph.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.apps).map(([k,v])=>[k,{modules:v.staticModuleIdentities,bytes:v.totalDecodedBytes,gzip:v.totalGzipBytes,duplicates:v.duplicateIdentities,missing:v.missing}])),null,2));
