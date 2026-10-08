import {PNG} from 'pngjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {segment,polygon,normalize,pngMask,iou} from './silhouette.mjs';
const base=new URL('.',import.meta.url),views=['front','side','back','frontRepeat'];
const configURL=process.argv[2]?pathToFileURL(path.resolve(process.argv[2])):new URL('target.json',base);
const output=process.argv[3]?pathToFileURL(path.resolve(process.argv[3])+'/'):new URL('shots/',base);
await mkdir(output,{recursive:true});
const config=JSON.parse(await readFile(configURL));
let target,status='measured';
try{target=PNG.sync.read(await readFile(new URL(config.image,configURL)));}catch(e){if(e.code!=='ENOENT'||!config.manualTraceFile)throw e;status='manual-trace';}
const trace=status==='manual-trace'?JSON.parse(await readFile(new URL(config.manualTraceFile,configURL))):null;
const targets={},targetDir=new URL(status==='manual-trace'?'target-trace/':'target/',output);await mkdir(targetDir,{recursive:true});
for(const v of views){targets[v]=normalize(trace?polygon(trace.views[v]):segment(target,config.views[v],config.threshold||30));await writeFile(new URL(`${v}.png`,targetDir),pngMask(targets[v]));}
const rounds=JSON.parse(await readFile(new URL('rounds.json',base))),results=[];
for(const p of rounds){let row={round:p.round};for(const v of views){const file=v==='frontRepeat'&&!p.version?'front':v;const png=PNG.sync.read(await readFile(new URL(`shots/r${p.round}/${file}-head.png`,base)));const raw=segment(png,[0,0,png.width,png.height],30,true),m=normalize(raw);row[`${v}DisconnectedPixels`]=raw.disconnectedPixels;await mkdir(new URL(`r${p.round}/`,output),{recursive:true});await writeFile(new URL(`r${p.round}/${v}-mask.png`,output),pngMask(m));row[v]=iou(m,targets[v]);row[`${v}Aspect`]=m.aspect;}
row.mean=((row.front+row.frontRepeat)/2+row.side+row.back)/3;results.push(row);}
const best=results.reduce((a,b)=>a.mean>=b.mean?a:b);
const report={status,source:status==='manual-trace'?'User-visible image contours marked manually; not original image pixel IoU':config.image,method:'head-only; filled silhouette; height-only isotropic normalization; average duplicate fronts then equal weight front/side/back',targetAspect:Object.fromEntries(views.map(v=>[v,targets[v].aspect])),results,bestRound:best.round};
await writeFile(new URL('metrics.json',output),JSON.stringify(report,null,2)+'\n');console.table(results.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.endsWith('Aspect')&&!k.endsWith('Pixels')))));console.log(`${status}; best=${best.round}`);
