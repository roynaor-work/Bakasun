import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/Bakasun';
const seen=new Map();
function deps(f){const s=fs.readFileSync(f,'utf8');const out=[];const re=/(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;let m;while((m=re.exec(s))){const p=m[1]||m[2];if(p.startsWith('.'))out.push(path.resolve(path.dirname(f),p));}return out;}
function walk(f,by){if(seen.has(f))return;seen.set(f,by);for(const d of deps(f))walk(d,f);}
walk(path.join(root,process.argv[2]||'js/app.js'),null);
let tot=0;const rows=[];for(const [f] of seen){const sz=fs.statSync(f).size;tot+=sz;rows.push([sz,path.relative(root,f)]);}
rows.sort((a,b)=>b[0]-a[0]);console.log(seen.size,'modules',tot,'bytes');rows.slice(0,25).forEach(r=>console.log(r.join(' ')));
