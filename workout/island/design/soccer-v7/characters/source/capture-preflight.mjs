/** Explicit candidate-only authoring proof; never mutates the packaged viewer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const round=process.argv[2]||'14';if(!/^\d{2}$/.test(round))throw Error('Expected iteration number');
const out=path.join(root,'iterations',round,'preflight');await fs.mkdir(out,{recursive:true});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestName=process.env.PREFLIGHT_MANIFEST||'asset-manifest-preflight'+round+'.json';
if(!/^asset-manifest-preflight[0-9]{2}(?:-[a-z]+)?\.json$/.test(manifestName))throw Error('Unexpected candidate manifest');
const candidate=JSON.parse(await fs.readFile(path.join(root,manifestName),'utf8'));
const selected=(process.env.PREFLIGHT_IDS||'player-01,player-06').split(',');
candidate.characters=candidate.characters.filter(c=>selected.includes(c.id));
if(candidate.characters.length!==2)throw Error('Two explicit candidates required');
const original=await fs.readFile(path.join(root,'vendor/data.js'),'utf8');
const data=JSON.parse(original.slice(original.indexOf('globalThis.SOCCER_V7_DATA=')+'globalThis.SOCCER_V7_DATA='.length).trim().replace(/;$/,''));
const overrides={},models=[];data.manifest=candidate;data.floor=null;data.bootBounds=null;
data.hashes={...data.hashes,manifest:digest(JSON.stringify(candidate)),models:{}};
delete data.hashes.bootBounds;
for(const c of candidate.characters)for(const k of c.kits||[c])for(const level of [0,1]){
  const file=k['lod'+level],b=await fs.readFile(path.join(root,file));
  if(b.length>1500000||digest(b)!==k['lod'+level+'Sha256'])throw Error('Candidate does not match compressed preflight manifest: '+file);
  data.hashes.models[file]=digest(b);models.push({file,bytes:b.length,sha256:digest(b)});
  overrides['/offline/'+path.basename(file,'.glb')+'.js']='(globalThis.SOCCER_V7_ASSETS??={})['+JSON.stringify(file)+']='+JSON.stringify(b.toString('base64'))+';';
}
overrides['/vendor/data.js']='globalThis.SOCCER_V7_DATA='+JSON.stringify(data)+';';
const runtime=await fs.readFile(path.join(root,'vendor/viewer-runtime.js')),records=[];
const s=await openPreview({dpr:1.5,resourceOverrides:overrides});
try{
  for(const c of candidate.characters){
    await s.page.evaluate(async id=>{await soccerV7.setCharacter(id);soccerV7.setClip('idle');},c.id);
    for(const size of [{width:390,height:844},{width:844,height:390}]){
      await s.page.setViewportSize(size);
      for(const view of ['face','cloth']){
        await s.page.evaluate(async view=>{await soccerV7.setView(view);soccerV7.seek(.15);soccerV7.setOrbit(.13);},view);
        const file=c.id+'-'+view+'-'+size.width+'x'+size.height+'.png';await s.page.screenshot({path:path.join(out,file),scale:'css'});records.push({id:c.id,view,size,file});
      }
    }
  }
  if(!(await fs.readFile(path.join(root,'vendor/viewer-runtime.js'))).equals(runtime))throw Error('Runtime changed during preflight');
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify({kind:'candidate-only-in-memory-response-override',complete:false,generatedAt:new Date().toISOString(),deviceScaleFactor:1.5,screenshotScale:'css',packagedFilesMutated:false,models,runtimeSha256:digest(runtime),loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),records,errors:s.errors,remoteRequests:s.remoteRequests,limits:'Two selected compressed candidates; not the full roster or final delivery. Data and payload HTTP responses are overridden in memory, with their actual candidate hashes recorded.'},null,2)+'\n');
  console.log(JSON.stringify({captures:records.length,errors:s.errors,out}));
}finally{await s.close();}
