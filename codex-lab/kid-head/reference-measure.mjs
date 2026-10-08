import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {segment,polygon,normalize,pngMask,iou} from './silhouette.mjs';

const base=fileURLToPath(new URL('.',import.meta.url));
const archive=path.join(base,'shots/faces/baseline-r9');
const views=['front','side','back','frontRepeat'];
const options=Object.fromEntries(process.argv.slice(2).reduce((pairs,arg,index,args)=>arg.startsWith('--')?[...pairs,[arg.slice(2),args[index+1]]]:pairs,[]));
const configPath=path.resolve(base,options.config||'target.json');
const config=JSON.parse(await readFile(configPath));
const frozenTrace=await readFile(path.join(archive,'source/contours.json'));
const manifest=JSON.parse(await readFile(path.join(archive,'source-hashes.json')));
if(createHash('sha256').update(frozenTrace).digest('hex')!==manifest.hashes.source['contours.json'])throw Error('Frozen manual trace hash mismatch');
const trace=JSON.parse(frozenTrace);
const original=JSON.parse(await readFile(path.join(archive,'original/metrics.json')));
const oldRound=original.results.find(r=>r.round===9);
if(!oldRound)throw Error('Preserved round 9 metrics are missing');
const imagePath=path.resolve(path.dirname(configPath),options.image||config.image);
const output=path.resolve(base,options.output||'shots/faces/reference-report.json');
const masksDir=options.masks?path.resolve(base,options.masks):path.join(archive,'measurement-masks');
await mkdir(masksDir,{recursive:true});
let target=null,referenceError=null;
try{target=PNG.sync.read(await readFile(imagePath));}catch(error){if(error.code!=='ENOENT')throw error;}
const validatedROIs={};
if(target){
 try{
  if(config.sourceSize&&(config.sourceSize[0]!==target.width||config.sourceSize[1]!==target.height))throw Error(`Reference dimensions ${target.width}x${target.height} differ from the annotated layout ${config.sourceSize.join('x')}; supply matching --config, do not silently resize old ROIs.`);
  for(const view of views){
   const roi=config.views?.[view];
   if(!Array.isArray(roi)||roi.length!==4||roi.some(v=>!Number.isInteger(v)))throw Error('Invalid integer ROI: '+view);
   const [x,y,w,h]=roi;
   if(x<0||y<0||w<12||h<1||x+w>target.width||y+h>target.height)throw Error(`ROI ${view} ${JSON.stringify(roi)} is outside ${target.width}x${target.height} or too narrow for background strips.`);
   validatedROIs[view]=roi;
  }
 }catch(error){referenceError=error.message;}
}
const table=[],fresh={},manual={},pixels={};
for(const view of views){
 const png=PNG.sync.read(await readFile(path.join(archive,'fresh',view+'-head.png')));
 const raw=segment(png,[0,0,png.width,png.height],config.threshold||30,true);
 fresh[view]=normalize(raw);manual[view]=normalize(polygon(trace.views[view]));
 await writeFile(path.join(masksDir,view+'-fresh-mask.png'),pngMask(fresh[view]));
 await writeFile(path.join(masksDir,view+'-manual-target.png'),pngMask(manual[view]));
 if(target&&!referenceError){
  try{
   pixels[view]=normalize(segment(target,validatedROIs[view],config.threshold||30));
   await writeFile(path.join(masksDir,view+'-pixel-target.png'),pngMask(pixels[view]));
  }catch(error){referenceError=`Pixel segmentation failed for ${view}: ${error.message}`;}
 }
 const freshManualIoU=iou(fresh[view],manual[view]);
 table.push({view,previousManualIoU:oldRound[view],freshManualIoU,manualRecaptureDelta:freshManualIoU-oldRound[view],pixelIoU:null,pixelMinusManual:null,modelAspect:fresh[view].aspect,manualTargetAspect:manual[view].aspect,pixelTargetAspect:null,disconnectedPixels:raw.disconnectedPixels});
}
// Pixel comparisons are all-or-nothing: a failed ROI cannot make a partial result look measured.
if(target&&!referenceError)for(const row of table){row.pixelIoU=iou(fresh[row.view],pixels[row.view]);row.pixelMinusManual=row.pixelIoU-row.freshManualIoU;row.pixelTargetAspect=pixels[row.view].aspect;}
const weighted=values=>((values.front+values.frontRepeat)/2+values.side+values.back)/3;
const map=key=>Object.fromEntries(table.map(row=>[row.view,row[key]]));
const meanManual=weighted(map('freshManualIoU'));
table.push({view:'weightedMean',previousManualIoU:oldRound.mean,freshManualIoU:meanManual,manualRecaptureDelta:meanManual-oldRound.mean,pixelIoU:target&&!referenceError?weighted(map('pixelIoU')):null,pixelMinusManual:target&&!referenceError?weighted(map('pixelIoU'))-meanManual:null});
const report={round:9,status:target&&!referenceError?'measured':referenceError?'reference-layout-invalid':'manual-trace',
 reference:{present:!!target,image:path.relative(base,imagePath),dimensions:target?[target.width,target.height]:null,annotatedDimensions:config.sourceSize||null,validatedROIs,error:referenceError},
 source:'Fresh preserved-r9 captures; same frozen contours as rounds 1–13',
 method:'Filled head silhouette; keep all model components; isotropic height normalization to 440 within 512 square, top aligned and bounding-box centered. Duplicate front views average before equal front/side/back weights.',
 threshold:config.threshold||30,table,
 limitation:target&&!referenceError?'Pixel masks use the explicitly configured original head-sheet layout; inspect masks and neck boundaries before interpreting IoU. Silhouette IoU does not measure faces or expressions.':referenceError?'reference.png is present but the original layout or segmentation is invalid; no pixel IoU is claimed.':'אין reference.png בתיקייה ואין קובץ תמונה מצורף נגיש בהודעה הנוכחית. ההשוואה החזותית היא לבסיס r9; ציוני IoU הם מול הסימון הידני הקבוע של גיליון הראש הקודם בלבד. אין כאן מדידה מפיקסלי גיליון ההבעות.',
 pixelDeltaMeaning:'pixelMinusManual = fresh-r9 pixel-derived target IoU minus fresh-r9 frozen-manual-target IoU; null when no valid reference pixels are available.'};
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.table(table.map(({view,previousManualIoU,freshManualIoU,manualRecaptureDelta,pixelIoU,pixelMinusManual})=>({view,previousManualIoU,freshManualIoU,manualRecaptureDelta,pixelIoU,pixelMinusManual})));
console.log(report.status+(referenceError?': '+referenceError:''));
if(referenceError)process.exitCode=1;
