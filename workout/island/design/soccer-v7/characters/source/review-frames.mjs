/** Curated, actual historical candidate frames; no copied/relabelled images. */
import fs from 'node:fs/promises';
import path from 'node:path';
const sources={
  '16':['16c-fullhead','core'],
  '17':['candidate','core'],
  '18':['candidate','core'],
  '19':['cornea-portable','core'],
  '20':['candidate-fullhead','core'],
  '21':['core'],
  '25':['catmull25','core'],
  '26':['roster','core'],
  '27':['anatomical27','core'],
  '28':['groom28','core'],
  '29':['crown29','core'],
  '30':['baseline27','core'],
  '31':['macro-shape31','wisps31','lids05','cloth-static-finish','core'],
  '32':['combined32','core'],
};
export async function selectedCandidateFrames(root,round){
  const frames=[];
  for(const directory of sources[round]||[]){
    const prefix='iterations/'+round+'/preflight/'+directory,capture=prefix+'/capture.json';
    const metadata=JSON.parse(await fs.readFile(path.join(root,capture),'utf8').catch(()=>'null'));
    for(const record of metadata?.records||[]){
      if(!/^(player-0[1-6]|goalkeeper|referee)$/.test(record.id||'')||typeof record.file!=='string')continue;
      if(round==='19'&&directory==='cornea-portable'&&!record.file.includes('portable-opaque-atlas'))continue;
      if(round==='31'&&directory==='macro-shape31'&&record.id!=='player-03')continue;
      if(/gray-diffuse|diagnostic-close-mouth/.test(record.file))continue;
      const match=record.file.match(/-(390x844|844x390)\.(png|webp)$/);if(!match)continue;
      const name=record.file,quarter=/three-quarter|profile/.test(name);
      const view=/body-far/.test(name)?'body-far':/body/.test(name)?'body':/cloth/.test(name)?quarter?'cloth-profile':'cloth':/face|front|three-quarter/.test(name)?quarter?'profile':'face':null;
      if(!view)continue;
      const file=path.posix.join(prefix,name);if(!file.startsWith(prefix+'/')||!(await fs.stat(path.join(root,file)).catch(()=>null))?.isFile())continue;
      frames.push({id:record.id,size:match[1],view,file,capture,metadata,scope:Number(round)<=21?'Historical candidate with supplementary real renders; not final delivery acceptance.':'Staged candidate with paired real renders; selection and limitations are recorded in its review.'});
    }
  }
  return frames;
}
