/** Isolate HairCards normal strength on the frozen16c candidates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {openPreview,root} from './browser-session.mjs';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestRaw=await fs.readFile(path.join(root,'asset-manifest-preflight16-normals.json'),'utf8'),manifest=JSON.parse(manifestRaw);
manifest.characters=manifest.characters.filter(c=>['player-01','goalkeeper'].includes(c.id));
const dataRaw=await fs.readFile(path.join(root,'vendor/data.js'),'utf8'),data=JSON.parse(dataRaw.slice(dataRaw.indexOf('globalThis.SOCCER_V7_DATA=')+'globalThis.SOCCER_V7_DATA='.length).trim().replace(/;$/,''));
data.manifest=manifest;data.floor=null;data.bootBounds=null;data.hashes={...data.hashes,manifest:digest(JSON.stringify(manifest)),models:{}};delete data.hashes.bootBounds;
const overrides={},models=[];
for(const c of manifest.characters)for(const kit of c.kits||[c])for(const level of[0,1]){
  const file=kit['lod'+level],bytes=await fs.readFile(path.join(root,file)),sha256=digest(bytes);
  if(sha256!==kit['lod'+level+'Sha256']||bytes.length>1500000)throw Error('Unfrozen candidate '+file);
  models.push({file,bytes:bytes.length,sha256});data.hashes.models[file]=sha256;
  overrides['/offline/'+path.basename(file,'.glb')+'.js']='(globalThis.SOCCER_V7_ASSETS??={})['+JSON.stringify(file)+']='+JSON.stringify(bytes.toString('base64'))+';';
}
const runtime=await fs.readFile('/tmp/soccer-v7-character-runtime86.mjs');
overrides['/vendor/viewer-runtime.js']=runtime;overrides['/vendor/data.js']='globalThis.SOCCER_V7_DATA='+JSON.stringify(data)+';';
const out=path.join(root,'iterations/16/hair-normal-probes');await fs.mkdir(out,{recursive:true});const records=[],s=await openPreview({dpr:1.5,resourceOverrides:overrides});
try{
  for(const c of manifest.characters){
    await s.page.evaluate(async id=>{await soccerV7.setCharacter(id);await soccerV7.setView('face');await soccerV7.setLOD(0);soccerV7.setPlaying(false);soccerV7.setClip('idle');soccerV7.seek(.15);},c.id);
    for(const size of[{width:390,height:844},{width:844,height:390}]){
      await s.page.setViewportSize(size);
      for(const [orbit,label]of[[.13,'front'],[-.7,'three-quarter']])for(const normalScale of[.5,1]){
        const zoom=size.width>size.height?1.08:1;
        await s.page.evaluate(({orbit,zoom,normalScale})=>{
          const a=soccerV7.inspect().actors[0];a.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='HairCards')m.normalScale.set(normalScale,normalScale);});soccerV7.setOrbit(orbit,0,zoom);
        },{orbit,zoom,normalScale});
        const file=c.id+'-'+label+'-normal-'+normalScale+'-'+size.width+'x'+size.height+'.png';await s.page.screenshot({path:path.join(out,file),scale:'css'});records.push({id:c.id,size,orbit,zoom,normalScale,file});
      }
    }
  }
  for(const m of models)if(digest(await fs.readFile(path.join(root,m.file)))!==m.sha256)throw Error('Candidate changed '+m.file);
  await fs.writeFile(path.join(out,'probe.json'),JSON.stringify({kind:'isolated16c-hair-normal-strength',complete:false,generatedAt:new Date().toISOString(),runtimeSha256:digest(runtime),baseDataSha256:digest(dataRaw),candidateManifestSha256:digest(manifestRaw),loadedHashes:await s.page.evaluate(()=>soccerV7.inspect().data.hashes),models,deviceScaleFactor:1.5,screenshotScale:'css',records,errors:s.errors,remoteRequests:s.remoteRequests,limits:'RAM material uniform changes only; no delivered material, model, atlas or bundle changes. Landscape zoom1.08 keeps the crown inside this older frozen camera. Other settings/geometry/textures are identical; any chosen strength needs integration and full-roster recapture.'},null,2)+'\n');
  console.log(JSON.stringify({captures:records.length,errors:s.errors,remoteRequests:s.remoteRequests,out}));
}finally{await s.close();}
