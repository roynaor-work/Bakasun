#!/usr/bin/env node
/** Static, dependency-free inventory. Never imports or executes game code.
 * Run from any directory: node <this-file> [--check] [--self-test] [--history].
 * --history rebuilds verified introduction evidence from reachable Git history;
 * ordinary runs reuse introduction evidence; source hashes guard semantic notes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const OUTPUT=path.dirname(HERE);
const ROOT=execFileSync('git',['-C',HERE,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const ISLAND='workout/island/';
const SELF=path.relative(ROOT,OUTPUT).replaceAll(path.sep,'/')+'/';
const args=new Set(process.argv.slice(2));
for(const arg of args)if(!['--check','--self-test','--history','--help'].includes(arg))throw Error('Unknown option: '+arg);
const git=(...xs)=>execFileSync('git',xs,{cwd:ROOT,encoding:'utf8',maxBuffer:256*1024*1024});
const hash=s=>createHash('sha256').update(s).digest('hex');
const unique=xs=>[...new Set(xs)];
const lexical=(a,b)=>a<b?-1:a>b?1:0;

// The small lexer removes comments, regex contents and literal text from the
// call search. Template substitutions remain code. Offsets always refer to the
// original file, including HTML script blocks. It is not a JavaScript evaluator.
export function tokens(source){
  const out=[];let i=0;
  function quoted(q){const start=i++;let value='';while(i<source.length){const c=source[i++];if(c===q)break;if(c==='\\'&&i<source.length){const n=source[i++];value+=({n:'\n',r:'\r',t:'\t'}[n]??n);}else value+=c;}out.push({v:value,type:'string',start,end:i});}
  function template(){const start=i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='`'){i++;break;}if(source[i]==='$'&&source[i+1]==='{'){i+=2;code(true);continue;}i++;}out.push({v:'<template>',type:'template',start,end:i});}
  function code(stop=false){let depth=0;while(i<source.length){const c=source[i],start=i;
    if(/\s/.test(c)){i++;continue;}
    if(c==='/'&&source[i+1]==='/'){i=source.indexOf('\n',i);if(i<0)i=source.length;continue;}
    if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
    if(c==='"'||c==="'"){quoted(c);continue;}
    if(c==='`'){template();continue;}
    const prev=out.at(-1);
    if(c==='/'&&(!prev||['=','(','[',',',':','!','&&','||','??','=>','return','case',';','{','}'].includes(prev.v))){
      i++;let inClass=false;while(i<source.length){const r=source[i++];if(r==='\\'){i++;continue;}if(r==='[')inClass=true;if(r===']')inClass=false;if(r==='/'&&!inClass)break;}while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;out.push({v:'<regex>',type:'regex',start,end:i});continue;
    }
    if(/[A-Za-z_$]/.test(c)){i++;while(/[\w$]/.test(source[i]||'')&&i<source.length)i++;out.push({v:source.slice(start,i),type:'id',start,end:i});continue;}
    if(/[0-9]/.test(c)){i++;while(/[\w.]/.test(source[i]||'')&&i<source.length)i++;out.push({v:source.slice(start,i),type:'number',start,end:i});continue;}
    if(c==='}'&&stop&&depth===0){i++;return;}
    if(c==='{')depth++;if(c==='}')depth--;
    const v=['===','!==','=>','?.','??','&&','||','==','!=','>=','<=','++','--','**','...'].find(v=>source.startsWith(v,i))||c;
    i+=v.length;out.push({v,type:'punct',start,end:i});
  }}code();return out;
}

function codeOf(file,source){
  if(!file.endsWith('.html'))return source;
  const chars=source.replace(/[^\n\r]/g,' ').split('');
  for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/\btype\s*=\s*["'](?:application\/ld\+json|importmap|application\/json)["']/i.test(m[1]))continue;
    const start=m.index+m[0].indexOf('>')+1;
    for(let n=0;n<m[2].length;n++)chars[start+n]=m[2][n];
  }return chars.join('');
}
function scopeOf(file){
  if(/\/(?:tests|verification)\//.test(file))return 'test-harness';
  if(file.includes('/tools/'))return 'developer-tool';
  if(file.includes('/design/'))return 'design-preview';
  return 'runtime';
}
// Explicit adapters for the repository's indirect readers. A new literal key
// through these helpers is discovered without adding it to a list of flag names.
// New reader shapes appear in diagnostics and require reviewing this adapter.
function helpersFor(file,code){
  const helpers=new Map();
  for(const n of ['polishLegacy','polishValue','fireV20','fireV21'])if(code.includes(n))helpers.set(n,0);
  if(/new\s+URLSearchParams[\s\S]*?\.get\s*\(\s*name\s*\)/.test(code))for(const n of ['read','param']){
    if(new RegExp('(?:function\\s+'+n+'\\s*\\(|\\b'+n+'\\s*=)').test(code))helpers.set(n,0);
  }
  const base=path.posix.basename(file);
  if(['soccer-v24.mjs','hoops-v241.mjs'].includes(base))helpers.set('on',0);
  if(base==='soccer-v23.mjs')helpers.set('version',0);
  if(base==='soccer-r241.mjs'){helpers.set('view',0);helpers.set('engineRule',1);}
  if(base==='racing-v24.mjs'){helpers.set('v23',0);helpers.set('off',0);helpers.delete('read');}
  if(base==='racing-offtrack.mjs')helpers.set('num',0);
  return helpers;
}

export function scanSource(file,source){
  const code=codeOf(file,source);
  if(!/URLSearchParams|searchParams|location\.search|polishLegacy|polishValue|fireV20|fireV21|params\s*(?:\?\.|\.)\s*(?:get|has)/.test(code))return {sites:[],unresolved:[]};
  const ts=tokens(code),pairs=new Map(),stack=[];
  for(let i=0;i<ts.length;i++){const v=ts[i].v;if(['(','[','{'].includes(v))stack.push(i);else if([')',']','}'].includes(v)){const o=stack.pop();if(o!==undefined){pairs.set(o,i);pairs.set(i,o);}}}
  const constants=new Map(),objects=new Map(),aliases=new Set(['params','parameters']);
  for(let i=0;i<ts.length-3;i++){
    if(ts[i].type!=='id'||ts[i+1]?.v!=='='||['.','?.'].includes(ts[i-1]?.v))continue;
    if(ts[i+2].type==='string')constants.set(ts[i].v,ts[i+2].v);
    if(ts[i+2].v==='new'&&ts[i+3].v==='URLSearchParams')aliases.add(ts[i].v);
    if(ts[i+2].v==='('&&pairs.has(i+2)&&ts.slice(i+3,pairs.get(i+2)).some(t=>t.v==='URLSearchParams'))aliases.add(ts[i].v);
    if(ts[i+2].v==='{'&&pairs.has(i+2)){
      const vals=[];for(let j=i+3;j<pairs.get(i+2)-1;j++)if(ts[j].v===':'&&ts[j+1].type==='string')vals.push(ts[j+1].v);
      if(vals.length)objects.set(ts[i].v,unique(vals));
    }
  }
  // Query-returning wrappers, e.g. const q=read(search), and function arguments
  // explicitly named params. Do not treat Map.get or Set.has as URL reads.
  const queryFactory=/\bread\s*=\s*[^;]*=>\s*\{?\s*try\s*\{\s*return\s+new\s+URLSearchParams/.test(code);
  if(queryFactory)for(let i=0;i<ts.length-3;i++)if(ts[i].type==='id'&&ts[i+1].v==='='&&ts[i+2].v==='read'&&ts[i+3].v==='(')aliases.add(ts[i].v);
  const helpers=helpersFor(file,code),sites=[],unresolved=[];
  const lineAt=index=>source.slice(0,index).split('\n').length;
  const resolve=(start,end)=>{
    if(end===start+1){if(ts[start].type==='string')return [ts[start].v];if(constants.has(ts[start].v))return [constants.get(ts[start].v)];}
    if(ts[start+1]?.v==='['&&objects.has(ts[start]?.v))return objects.get(ts[start].v);
    return [];
  };
  const argumentsOf=open=>{const end=pairs.get(open);if(end===undefined)return [];const result=[];let start=open+1;for(let j=start;j<end;j++){if(pairs.has(j)&&['(','[','{'].includes(ts[j].v)){j=pairs.get(j);continue;}if(ts[j].v===','){result.push([start,j]);start=j+1;}}if(start<end)result.push([start,end]);return result;};
  function add(names,index,kind,reader){for(const name of names){if(!/^[A-Za-z][\w.-]*$/.test(name))continue;const line=lineAt(ts[index].start),raw=source.split('\n')[line-1]||'',column=ts[index].start-(source.lastIndexOf('\n',ts[index].start-1)+1)+1;
    const start=raw.length>1600?Math.max(0,column-121):0;
    sites.push({name,file,line,column,kind,reader,scope:scopeOf(file),expression:raw.slice(start,start+1600).trim(),expressionStartColumn:start+1,expressionTruncated:raw.length>1600});}}
  for(let i=0;i<ts.length;i++){
    const t=ts[i];
    if(['get','has'].includes(t.v)&&['.','?.'].includes(ts[i-1]?.v)){
      const recv=ts[i-2];let kind=null;
      if(recv?.v==='searchParams')kind='url-object';
      else if(recv?.type==='id'&&aliases.has(recv.v))kind='page-query';
      else if(recv?.v===')'){
        const open=pairs.get(i-2),callee=ts[open-1];
        if(callee?.v==='URLSearchParams'||ts.slice(open,i-2).some(t=>t.v==='URLSearchParams'))kind='page-query';
        else if(callee?.v==='read'&&queryFactory)kind='page-query';
      }
      if(!kind)continue;
      const open=ts[i+1]?.v==='?.'?i+2:i+1;if(ts[open]?.v!=='(')continue;
      const [arg]=argumentsOf(open);if(!arg)continue;const names=resolve(...arg);
      if(names.length)add(names,i,kind,t.v);
      else {const value=code.slice(ts[arg[0]].start,ts[arg[1]-1].end);if(!(helpers.size&&['name','key'].includes(value)))unresolved.push({file,line:lineAt(t.start),reader:t.v,argument:value});}
    }
    if(t.type==='id'&&helpers.has(t.v)&&ts[i+1]?.v==='('&&!['.','?.','function'].includes(ts[i-1]?.v)){
      const arg=argumentsOf(i+1)[helpers.get(t.v)];if(!arg)continue;const names=resolve(...arg);if(names.length)add(names,i,'helper-query',t.v);
    }
  }
  // Boar's quality helper additionally tests qa with /[?&]qa\b/.
  if(file.endsWith('/boar-island/kit.js')){const i=source.indexOf('qa\\b');if(i>=0){const line=lineAt(i);sites.push({name:'qa',file,line,column:i-(source.lastIndexOf('\n',i-1)+1)+1,kind:'regex-query',reader:'regex.test',scope:scopeOf(file),expression:source.split('\n')[line-1].trim(),expressionTruncated:false});}}
  return {sites,unresolved};
}

function selfTest(){
  const s=`// new URLSearchParams('').get('comment')
const q=new URLSearchParams(location.search);q.get('literal');q?.get?.('optional');
const FLAG='constant';q.get(FLAG);q.has('present');const m=new Map();m.get('not-a-flag');
const text="q.get('quoted')";const regex=/q.get('regex')/;
const search=(()=>{try{return new URLSearchParams('');}catch{return null;}})();search.get('iife');
const read=(name,s)=>new URLSearchParams(s).get(name);read('wrapped','');
const racket={};racket.name='not-a-flag-either';
const params={};params?.get?.('passed');const names={a:'mappedA',b:'mappedB'};q.get(names[k]);
const n=\`text q.get('templateText') \${q.get('interpolation')}\`;
`;
  assert.deepEqual(unique(scanSource('fixture.mjs',s).sites.map(x=>x.name)).sort(),['constant','iife','interpolation','literal','mappedA','mappedB','optional','passed','present','wrapped'].sort());
  assert.deepEqual(scanSource('fixture.mjs',`const q=new URLSearchParams('');q.get(dynamicKey);`).unresolved.map(x=>x.argument),['dynamicKey']);
  assert.deepEqual(scanSource('fixture.html',`<p>q.get('markup')</p><script>const q=new URLSearchParams('');q.get('html')</script>`).sites.map(x=>x.name),['html']);
  assert.equal(scanSource('fixture.mjs',`const q=new URLSearchParams('');q.get('x');`).sites[0].line,1);
  assert.equal(scanSource('fixture.mjs',`const q=new URLSearchParams('');q.get(name);`).unresolved.length,1);
  const numeric=`const read=search=>{try{return new URLSearchParams(search);}catch{return null;}};const q=read(''),num=(key,fallback)=>q.get(key)||fallback;num('numeric',7);`;
  assert.deepEqual(scanSource('racing-offtrack.mjs',numeric).sites.map(x=>x.name),['numeric']);
  console.log('Scanner self-test: literal, optional, constant, presence, wrapper, map, template, comments, regex, HTML, diagnostics, locations passed.');
}

function sourceFiles(){return unique(git('ls-files','--cached','--others','--exclude-standard','-z',ISLAND).split('\0').filter(f=>f&&!f.startsWith(SELF)&&/\.(?:mjs|js|html)$/.test(f)&&!/(?:^|\/)(?:vendor|lib|node_modules)\//.test(f)&&!f.endsWith('.min.js'))).sort(lexical);}

function collectTests(flags){
  const cases=new Map(flags.map(f=>[f.name,{explicitUrlCases:[],literalMentions:[],relatedImports:[]}]));
  const readers=new Map(flags.map(f=>[f.name,new Set(f.reads.filter(r=>r.scope==='runtime').map(r=>path.posix.basename(r.file)))]));
  const files=unique(git('ls-files','--cached','--others','--exclude-standard','-z','tests',ISLAND+'tests',ISLAND+'tools',ISLAND+'verification').split('\0').filter(f=>/\.(mjs|js|html)$/.test(f)&&!f.includes('/vendor/')));
  for(const file of files){
    const source=fs.readFileSync(path.join(ROOT,file),'utf8'),lines=source.split('\n'),ci=/^tests\/[^/]+\.mjs$/.test(file);
    const role=file.startsWith('tests/')||file.startsWith(ISLAND+'tests/')?'test':'measurement-tool';
    for(const f of flags){const record=cases.get(f.name),escaped=f.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const url=new RegExp('[?&]'+escaped+'(?:=|(?=[&#\\s\'"`]))');
      const literal=new RegExp('[\'"`]'+escaped+'[\'"`]');
      for(let i=0;i<lines.length;i++){
        const line=lines[i];if(url.test(line))record.explicitUrlCases.push({file,line:i+1,ci,role});
        else if(literal.test(line))record.literalMentions.push({file,line:i+1,ci,role});
      }
      for(const m of source.matchAll(/(?:import[^;\n]*?from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){
        if(readers.get(f.name).has(path.posix.basename(m[1].split('?')[0])))record.relatedImports.push({file,line:source.slice(0,m.index).split('\n').length,ci,role});
      }
    }
  }
  for(const record of cases.values()){
    for(const key of ['explicitUrlCases','literalMentions','relatedImports'])record[key]=[...new Map(record[key].map(x=>[`${x.file}:${x.line}`,x])).values()].sort((a,b)=>lexical(a.file,b.file)||a.line-b.line);
    record.status=record.explicitUrlCases.some(x=>x.role==='test')?'explicit-url-case':record.literalMentions.some(x=>x.role==='test')?'literal-mention':record.relatedImports.some(x=>x.role==='test')?'related-import-only':record.explicitUrlCases.length||record.literalMentions.length||record.relatedImports.length?'measurement-only':'none-found';
  }return cases;
}

// Read raw object history once. Batching object downloads matters in a partial
// clone: a pickaxe query for every flag would repeatedly download the same files.
function introductionHistory(flags){
  if(git('rev-parse','--is-shallow-repository').trim()==='true')throw Error('Introduction history needs a complete commit graph; run git fetch --unshallow first.');
  const auxiliary=unique(flags.flatMap(f=>f.reads.filter(r=>r.scope!=='runtime').map(r=>r.file)));
  const specs=[':(glob)workout/island/**/*.mjs',':(glob)workout/island/**/*.js',':(glob)workout/island/**/*.html',
    ...['design','verification','tests','tools','assets','vendor','lib'].map(d=>':(exclude)workout/island/'+d+'/**')];
  // Additional current preview/tool paths are read separately so the exclusions
  // above cannot suppress their own history.
  const logs=[git('log','--reverse','--topo-order','--format=@@%H\t%aI\t%s','--raw','--no-abbrev','--no-renames','HEAD','--',...specs)];
  if(auxiliary.length)logs.push(git('log','--reverse','--topo-order','--format=@@%H\t%aI\t%s','--raw','--no-abbrev','--no-renames','HEAD','--',...auxiliary));
  const changes=[];let commit;
  for(const log of logs)for(const line of log.split('\n')){
    if(line.startsWith('@@')){const [sha,date,...subject]=line.slice(2).split('\t');commit={commit:sha,date,subject:subject.join('\t')};}
    else if(line.startsWith(':')){const [head,file]=line.split('\t'),fields=head.split(' '),oid=fields[3];if(oid&&oid!=='0'.repeat(40)&&file&&!/\/(vendor|lib|node_modules)\//.test(file)&&!file.endsWith('.min.js'))changes.push({...commit,file,oid});}
  }
  const oids=unique(changes.map(c=>c.oid));
  const missing=new Set(git('rev-list','--objects','--missing=print','HEAD').split('\n').filter(x=>x.startsWith('?')).map(x=>x.slice(1)));
  const wanted=oids.filter(x=>missing.has(x));
  for(let i=0;i<wanted.length;i+=400){
    const r=spawnSync('git',['-c','fetch.negotiationAlgorithm=noop','fetch','--no-tags','--no-write-fetch-head','--filter=blob:none','--stdin','origin'],{cwd:ROOT,input:wanted.slice(i,i+400).join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024});
    if(r.status!==0)throw Error('History text fetch failed: '+r.stderr);
    console.log(`History text: ${Math.min(i+400,wanted.length)}/${wanted.length} fetched`);
  }
  const objects=spawnSync('git',['cat-file','--batch'],{cwd:ROOT,input:oids.join('\n')+'\n',maxBuffer:512*1024*1024});
  if(objects.status!==0)throw Error(String(objects.stderr));
  const blobs=new Map();let offset=0;
  while(offset<objects.stdout.length){const end=objects.stdout.indexOf(10,offset),header=objects.stdout.subarray(offset,end).toString().split(' ');if(header[1]!=='blob')throw Error('Unexpected history object '+header.join(' '));const size=Number(header[2]);blobs.set(header[0],objects.stdout.subarray(end+1,end+1+size));offset=end+size+2;}
  const cache=new Map(),found=new Map(),wantedNames=new Set(flags.map(f=>f.name));
  for(const c of changes){const key=c.oid+':'+path.posix.basename(c.file);let sites=cache.get(key);if(!sites){sites=scanSource(c.file,blobs.get(c.oid).toString('utf8')).sites;cache.set(key,sites);}
    for(const site of sites){if(wantedNames.has(site.name)&&!found.has(site.name))found.set(site.name,{...c,line:site.line,evidence:site.expression,scope:scopeOf(c.file)});}
  }
  const mainline=git('rev-list','--first-parent','--reverse','HEAD').trim().split('\n'),shipped=new Map(),releases=new Map();
  function firstMainline(sha){if(shipped.has(sha))return shipped.get(sha);let lo=0,hi=mainline.length-1;while(lo<hi){const mid=(lo+hi)>>1;const r=spawnSync('git',['merge-base','--is-ancestor',sha,mainline[mid]],{cwd:ROOT});if(r.status===0)hi=mid;else if(r.status===1)lo=mid+1;else throw Error('merge-base failed');}shipped.set(sha,mainline[lo]);return mainline[lo];}
  function releaseAt(sha){if(releases.has(sha))return releases.get(sha);let value=null;for(const file of ['release.json','release.mjs']){
      if(!git('ls-tree',sha,'--',ISLAND+file).trim())continue;
      const text=git('show',sha+':'+ISLAND+file);value=file.endsWith('.json')?JSON.parse(text).version:text.match(/DATA_VERSION\s*=\s*['"]([^'"]+)/)?.[1];if(value)break;
    }releases.set(sha,value??null);return value??null;}
  for(const [name,entry] of found){entry.firstMainlineCommit=firstMainline(entry.commit);entry.releaseAtFirstMainline=releaseAt(entry.firstMainlineCommit);entry.developmentVersionInSubject=entry.subject.match(/\bv\d+(?:\.\d+)?/i)?.[0]??null;entry.method=entry.scope==='runtime'?'first-recognized-read-in-reachable-runtime-history':'first-recognized-read-in-current-auxiliary-path-history';}
  console.log(`History examined: ${changes.length} revisions, ${oids.length} text objects; ${found.size}/${flags.length} introductions found.`);
  return found;
}

function sourceFingerprint(reads){return hash(unique(reads.map(r=>r.file)).sort(lexical).map(f=>f+'\0'+hash(fs.readFileSync(path.join(ROOT,f)))).join('\n'));}
function link(file,line){return `[${file.replace(ISLAND,'')}:${line}](https://github.com/roynaor-work/Bakasun/blob/${sourceRevision}/${file}#L${line})`;}
let sourceRevision;
function markdown(data){
  const esc=s=>String(s??'לא זוהה').replaceAll('|','\\|').replaceAll('\n',' ');
  const lines=['# דגלי URL ותוכן — מיפוי v1','',`צילום קוד: \`${data.sourceCommit}\`. גרסת אי: \`${data.release}\`.`,
    '',`נמצאו **${data.flags.length} שמות URL**, מהם **${data.flags.filter(f=>f.reads.some(r=>r.scope==='runtime')&&f.name!=='v').length} שנקראים בקוד האי** (ללא פרמטר גרסת המשאבים \`v\`). שמות משותפים לכלי בדיקה ולהדגמות מוצגים פעם אחת, עם כל נקודות הקריאה ב־[flags.json](flags.json).`,
    '', '## קריאה נכונה של הרישום','',
    '- ברירת המחדל היא כאשר הפרמטר חסר בדפדפן. המחרוזות מדויקות ותלויות רישיות; ערך ריק אינו בהכרח כיבוי. במפתח כפול get מחזיר את הערך הראשון, אחרי פענוח URL. תנאי תצורה, איכות, מכשיר ושמירה עשויים להוסיף שערים.',
    '- גרסת ההוספה היא ערך קובץ השחרור בקומיט הראשון לאורך ההורה הראשון של הענף הנבדק המכיל את קריאת הקוד הראשונה שנמצאה בהיסטוריה. זהו מזהה שחרור אמיתי מהקוד; אין הסקה מהסיומת בשם הדגל. הודעת קומיט ההוספה והגרסה שנזכרה בה, אם יש, נשמרות ב־JSON. בערכות ובכלי עזר המזהה אינו מבטיח שהקובץ פורסם לאתר.',
    '- “מקרה URL” = נמצא ערך URL מפורש בקובץ בדיקה; “אזכור” = שם מילולי; “ייבוא קשור” = בדיקה מייבאת מודול קורא, בלי הוכחה שבדקה את הדגל. כלי מדידה מדווחים בנפרד. זהו אינדקס ראיות, לא מדידת כיסוי או טענה שהבדיקה עברה.',
    '- כל המקורות, מספרי השורות, הביטויים, מקרי הבדיקה והקומיטים המלאים נמצאים ב־JSON. טבלאות אלה מציגות את נקודת הקריאה הראשונה בלבד. הסורק אינו טוען להוכיח נגישות מכל מסלול משחק.',
    '', '## מנגנון וקשרים חשובים','',
    'דגלי התוכן נטענים מתוך `data/featureFlags.json`; מנוע האי בודק את `minigames` ואת דגל הרשומה לפני התחלה. דגלי ה־URL נקראים בנפרד במודולים, ואינם משנים את קובץ הנתונים. אין מפענח מרכזי שממיר כל ערך לבוליאני.',
    '', '`soccerV241=0` משבית את קבוצת v24.1 ומחזיר את הרדאר; `hoopsV241=0` משבית את קבוצת v24.1 בכדורסל; `alpineV241=0` מסיר גם את כללי הפיזיקה וגם את תוכן המסלול מן האיזון שעובר למשחק, לליגה ולאימות התוצאה. הם אינם מכבים אוטומטית דגלים מגרסאות קודמות.',
    '', 'בכדורגל, אפשרות מפורשת לפונקציה קודמת לדגלי הדף במספר פונקציות. `soccerFull` וכללי v24.1 מסוימים כבויים בלי דף ב־Node, אלא אם הועברו אפשרות או מחרוזת חיפוש. בחזירים, פרמטרי הדף החיצוני מועברים רק לפי הרשימה שב־`boar-session.mjs`; דגלי המסגרת הפנימית אינם כולם דגלים של דף האי.',
    '', '`v` מתייחס לגרסת מודול, CSS או Service Worker. `release` ו־`check` נכתבים לכתובות לצורך רענון ובדיקת שחרור, ואינם נקראים כמתגי משחק. hash של ניווט, שדות שמירה ופרמטרי CLI אינם דגלי URL.',
  ];
  const groups=[['משותפים, פתיחה, איכות ומצב בדיקה',f=>f.reads.some(r=>r.scope==='runtime')&&!/^(soccer|keeper|hoops|alpine|env$|racing|v2|naval|fire|alien|defense|boar|catch)/.test(f.name)],['כדורגל',f=>/^(soccer|keeper)/.test(f.name)],['כדורסל',f=>/^hoops/.test(f.name)],['סקי',f=>/^(alpine|env$)/.test(f.name)],['מרוצים',f=>/^(racing|v2)/.test(f.name)],['ספינות',f=>/^naval/.test(f.name)],['כיבוי אש',f=>/^fire/.test(f.name)],['הגנת חייזרים',f=>/^(alien|defense)/.test(f.name)],['חזירים',f=>/^boar/.test(f.name)],['תפיסת הפושע',f=>/^catch/.test(f.name)]];
  function table(flags){lines.push('| שם | ברירת מחדל בדפדפן | פעולה וערכים | נקראת ב־ | גרסת הוספה; קומיט | ראיית בדיקה |','|---|---|---|---|---|---|');for(const f of flags){const r=f.reads.find(r=>r.scope==='runtime')||f.reads[0],intro=f.introduced,first=intro?.commit;
      const test=f.tests,status={'explicit-url-case':'מקרה URL','literal-mention':'אזכור','related-import-only':'ייבוא קשור בלבד','measurement-only':'כלי מדידה בלבד','none-found':'לא נמצאה'}[test.status];const evidence=[...test.explicitUrlCases,...test.literalMentions,...test.relatedImports].find(x=>x.role==='test')||test.explicitUrlCases[0]||test.literalMentions[0]||test.relatedImports[0];
      lines.push(`| \`${f.name}\` | ${esc(f.default)} | ${esc(f.behavior)} ${esc(f.values)} | ${link(r.file,r.line)}${f.reads.length>1?` (+${f.reads.length-1})`:''} | ${intro?.releaseAtFirstMainline?'`'+intro.releaseAtFirstMainline+'`':'לא נמצא מזהה בקובצי השחרור'}; ${first?'['+first.slice(0,8)+'](https://github.com/roynaor-work/Bakasun/commit/'+first+')':'לא זוהה'} | ${status}${evidence?' — '+link(evidence.file,evidence.line):''} |`);
    }lines.push('');}
  for(const [title,pick] of groups){const flags=data.flags.filter(f=>f.reads.some(r=>r.scope==='runtime')&&pick(f));if(flags.length){lines.push('',`## ${title}`,'');table(flags);}}
  lines.push('','## פרמטרים של כלי עבודה, בדיקות ותצוגות בלבד','','אלה נרשמים בשלמותם אך אינם מתגים של דף האי הראשי. אותו שם יכול לקבל ברירת מחדל אחרת בכל קובץ; במקרה כזה הביטוי המדויק בכל קריאה נמצא ב־JSON.','');table(data.flags.filter(f=>!f.reads.some(r=>r.scope==='runtime')));
  lines.push('','## דגלי תוכן מקובץ הנתונים','','אלה אינם פרמטרי URL. הוספת `?soccer=0`, למשל, אינה מחליפה את הערך בקובץ.','','| שם | ברירת מחדל |','|---|---|',...Object.entries(data.dataFlags).map(([k,v])=>`| \`${k}\` | \`${v}\` |`),'','## יצירה מחדש ואימות','','משורש הריפו, עם Node.js 22 ומעלה (אפשר גם להפעיל בנתיב מלא מכל תיקייה):','','```bash','node workout/island/design/architecture-map-v1/tools/scan-flags.mjs','node workout/island/design/architecture-map-v1/tools/scan-flags.mjs --check','node workout/island/design/architecture-map-v1/tools/scan-flags.mjs --self-test','```','','לשחזור ראיות ההיסטוריה (דורש היסטוריה מלאה; בעותק חלקי מתבצעת הורדת אובייקטי קוד בלבד):','','```bash','node workout/island/design/architecture-map-v1/tools/scan-flags.mjs --history','```','','הסורק כותב רק את `flags.json` ואת `FLAGS.md` שבתיקייה זו. `tools/flag-notes.json` מחזיק פירוש אנושי שנבדק מול הקוד וחותמת מקורות לכל שם. שם חדש, מקור שהשתנה או קריאה דינמית בלתי פתורה מסומנים; `--check` נכשל עד סקירה ועדכון. ההרצה הרגילה משתמשת בראיות ההיסטוריה הקודמות; שם חדש בלי ראיות דורש `--history`. אין חותמת זמן משתנה, ולכן שני שחזורים של אותו קוד ותיעוד נותנים בתים זהים.','','גבול הסורק: ניתוח סטטי של קריאות מילוליות, קבועי מחרוזת, קוראי `params`, מפות שמות והעוזרים המוכרים בריפו; זה אינו מפרש JavaScript כללי. הוא אינו מבצע קוד משחק, אינו מייצא משתנים גלובליים ואינו משחזר מצב שמירה. `REPORT.md` מפרט את ההצלבה העצמאית ואת מגבלות האימות.','');
  return lines.join('\n');
}
function main(){
  if(args.has('--help')){console.log('node workout/island/design/architecture-map-v1/tools/scan-flags.mjs [--check | --self-test | --history]\nDefault: generate flags.json + FLAGS.md here. --check: read only, verify freshness and review. --history: rebuild Git introduction evidence (full history required). --self-test: isolated parser fixtures.');return;}
  if(args.has('--self-test')){selfTest();return;}
  const files=sourceFiles(),all=[],diagnostics=[];let scanned=0;
  for(const file of files){const full=path.join(ROOT,file);if(!fs.existsSync(full))throw Error('Missing tracked source (check sparse checkout): '+file);const source=fs.readFileSync(full,'utf8');const r=scanSource(file,source);all.push(...r.sites);diagnostics.push(...r.unresolved);scanned++;}
  const grouped=new Map();for(const site of all){const {name,...rest}=site;if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(rest);}
  sourceRevision=git('log','-1','--format=%H','HEAD','--',ISLAND,'tests',':(exclude)'+SELF+'**').trim();
  const result={schemaVersion:1,sourceCommit:sourceRevision,sourceFingerprint:hash(files.map(f=>f+'\0'+hash(fs.readFileSync(path.join(ROOT,f)))).join('\n')),release:JSON.parse(fs.readFileSync(path.join(ROOT,ISLAND,'release.json'),'utf8')).version,scope:{root:ISLAND,excluded:['third-party vendor/lib/node_modules','*.min.js',SELF],filesScanned:scanned},diagnostics,dataFlags:JSON.parse(fs.readFileSync(path.join(ROOT,ISLAND,'data/featureFlags.json'),'utf8')),flags:[...grouped].sort(([a],[b])=>lexical(a,b)).map(([name,reads])=>({name,reads}))};
  const target=path.join(OUTPUT,'flags.json'),old=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{flags:[]};
  const notesFile=path.join(HERE,'flag-notes.json'),notes=fs.existsSync(notesFile)?JSON.parse(fs.readFileSync(notesFile,'utf8')):{};
  const history=args.has('--history')?introductionHistory(result.flags):new Map(old.flags.filter(f=>f.introduced).map(f=>[f.name,f.introduced]));
  const tests=collectTests(result.flags);
  for(const f of result.flags){const n=notes[f.name],fingerprint=sourceFingerprint(f.reads);f.default=n?.default??'טרם נבדק';f.behavior=n?.behavior??'נדרשת סקירה';f.values=n?.values??'';f.review={status:n?.sourceFingerprint===fingerprint?'reviewed':'review-needed',sourceFingerprint:fingerprint};f.introduced=history.get(f.name)??null;f.tests=tests.get(f.name);}
  const text=JSON.stringify(result,null,2)+'\n',md=markdown(result),doc=path.join(OUTPUT,'FLAGS.md');
  if(args.has('--check')){assert.equal(result.diagnostics.length,0,'Unresolved dynamic reads');assert.equal(result.flags.filter(f=>f.review.status!=='reviewed').length,0,'Missing or stale semantic notes');assert.equal(result.flags.filter(f=>!f.introduced).length,0,'Missing introduction evidence; run --history');assert.equal(fs.readFileSync(target,'utf8'),text,'flags.json is stale; rerun scanner');assert.equal(fs.readFileSync(doc,'utf8'),md,'FLAGS.md is stale; rerun scanner');console.log(`Inventory current: ${grouped.size} names, ${all.length} reads; semantic notes, history and Markdown verified.`);}
  else {fs.writeFileSync(target,text);fs.writeFileSync(doc,md);console.log(`Generated inventory and FLAGS.md: ${grouped.size} names, ${all.length} reads, ${diagnostics.length} diagnostics; ${result.flags.filter(f=>f.review.status!=='reviewed').length} need review, ${result.flags.filter(f=>!f.introduced).length} need history.`);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
