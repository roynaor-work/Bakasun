import fs from 'node:fs/promises';
import path from 'node:path';
import {root,repo,json,writeJSON,sha} from './common.mjs';
const kits=await json('kits.json'),venues=await json('venues.json'),vendor=await json('vendor/provenance.json');
const sources=[];
for(const file of [kits.source.file,'workout/island/design/soccer-v5/rig.json','workout/island/design/motion2/soccer.json',
  'workout/island/design/soccer-v5/LICENSES.md','workout/island/design/characters/LICENSES.md']){
  const bytes=await fs.readFile(path.join(repo,file));sources.push({file,sha256:sha(bytes),bytes:bytes.length});
}
const assets=[...kits.kits,kits.numberLibrary,...venues.venues].map(({file,bytes,sha256,triangles,vertices})=>({file,bytes,sha256,triangles,vertices}));
await writeJSON('manifest.json',{
  schemaVersion:1,id:'soccer-kits-venues-v1',kind:'design-assets-not-runtime',created:'2026-11-17',
  baseCommit:'43b27dc235387e3cb737aee9558cdf9d5fd5a262',branch:'codex/soccer-kits-venues-v1',
  scope:'Only new files below workout/island/design/soccer-kits-venues-v1/.',
  license:'CC0-1.0 for assets/source; MIT for bundled three.js; Apache-2.0 for Draco; see LICENSES.md',
  budget:{maxBytes:4000000,unit:'decimal bytes',scope:'Every regular file recursively in this folder, including vendor, sources, documentation and verification.'},
  preview:{file:'preview.html',viewport:{width:844,height:390},offline:true,serveFromFolder:true,requiresLocalHttp:true,externalRequests:0},
  encoding:{format:'glTF 2.0 binary',compression:'KHR_draco_mesh_compression',colors:'linear-sRGB COLOR_0',rasterTextures:0,up:'+Y',forward:'+Z',units:'meters'},
  rig:{file:'rig.json',bones:18,order:JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8')).joints.map(j=>j.name),
    contract:'../motion2/soccer.json / skeleton.bones names, order and parents',bind:'Preserved soccer-v5 transforms and inverse binds; use calibrated retargeting for canonical JSON clips.'},
  kits:{count:8,catalog:'kits.json',paths:kits.kits.map(k=>k.file),defaultNumbers:kits.kits.map(k=>({kitId:k.id,number:k.defaultNumber})),
    clothing:['shirt','shorts','socks'],backNumber:{range:[1,11],library:kits.numberLibrary.file,helper:'apply.mjs',
      method:'Original block digits projected onto the jersey; barycentric skin weights; select exactly one number mesh.',
      exportedDefault:'Each kit GLB already includes its default number in COLOR_0.',runtimeSelection:'applyKitNumber(clonedKitScene, loadedNumberLibraryScene, integer1to11, kit.palette.number)'},
    animation:'Each kit includes the existing CC0 run, retained only for fitting review; preview also provides a relaxed presentation pose.'},
  venues:{count:3,catalog:'venues.json',paths:venues.venues.map(v=>v.file),standLayersPerVenue:3,signage:{text:false,logos:false},
    lighting:'Directional/spot lights embedded as KHR_lights_punctual. Recreate hemisphere/fog/exposure from venues.json; these are not native glTF ambient light fields.'},
  integration:{entrypoint:'apply.mjs',characterScale:'GLB binds retained at source size (~1.30m); preview uniformly scales each actor to 1.80m. Do not rescale individual joints.',
    runtimeFilesUnchanged:true,venueImport:'Load exactly one venue GLB at a time. Keep Sky unlit and exempt from fog. Night has four actual spot lights.',
    libraryImport:'numbers-01-11.glb is an alternatives library, not a scene to render wholesale.'},
  assets,sources,vendor,report:'REPORT.md',verification:{assets:'verification/assets.json',browser:'verification/browser.json',
    numberFit:'verification/number-fit.json',repository:'verification/repository.json',package:'verification/package.json'},
});
console.log(`manifest: ${assets.length} GLBs, ${assets.reduce((n,a)=>n+a.bytes,0)} bytes in GLBs`);
