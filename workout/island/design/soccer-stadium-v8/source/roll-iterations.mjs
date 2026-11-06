// Keep the latest and previous completed reviews. Earlier rounds become one
// text line each, retaining their scores, criticism and runtime fingerprint.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','iterations');
const latest=Number(process.argv[2]);if(!Number.isInteger(latest)||latest<2)throw new Error('Supply the latest completed round');
await fs.access(path.join(root,String(latest).padStart(2,'0'),'REVIEW.md'));
const history=path.join(root,'HISTORY.md');let text='';
try{text=await fs.readFile(history,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
const entries=new Map(text.split('\n').filter(line=>/^\d{2} — /.test(line)).map(line=>[Number(line.slice(0,2)),line]));
for(const item of await fs.readdir(root,{withFileTypes:true})){
  if(!item.isDirectory()||!/^\d{2}$/.test(item.name)||Number(item.name)>=latest-1)continue;
  const directory=path.join(root,item.name),review=await fs.readFile(path.join(directory,'REVIEW.md'),'utf8');
  const scores=[...review.matchAll(/^\|\s*([^|]+)\|\s*(\d+)\s*\|/gm)].map(m=>`${m[1].trim()}: ${m[2]}`);
  const criticism=review.split('\n').find(line=>line.startsWith('ביקורת עצמית:'))??'';
  const source=await fs.readFile(path.join(directory,'SOURCE.txt'),'utf8');
  const hash=source.match(/SHA-256: ([a-f0-9]+)/)?.[1]??'unrecorded';
  entries.set(Number(item.name),`${item.name} — ${scores.join('; ')}. ${criticism} Runtime SHA-256 ${hash}.`);
  await fs.rm(directory,{recursive:true});
}
await fs.writeFile(history,'# היסטוריית הסבבים\n\nרק שני הסבבים האחרונים נשמרים במלואם. כל סבב מוקדם נשמר כאן כשורת טקסט אחת עם ציונים, ביקורת וחתימת קובצי הריצה.\n\n'+[...entries.entries()].sort((a,b)=>a[0]-b[0]).map(([,line])=>line).join('\n')+'\n');
console.log(`Retained ${String(latest-1).padStart(2,'0')} and ${String(latest).padStart(2,'0')}; ${entries.size} earlier rounds archived as text.`);
