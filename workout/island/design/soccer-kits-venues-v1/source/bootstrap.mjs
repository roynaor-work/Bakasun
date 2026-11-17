// Copy only into this new package. Existing renderer/decoder files are read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {root, repo, sha, writeJSON} from './common.mjs';
const files = ['three.module.js','GLTFLoader.js','DRACOLoader.js','BufferGeometryUtils.js','SkeletonUtils.js',
  'LICENSE.three','draco/draco_wasm_wrapper.js','draco/draco_decoder.wasm'];
const records = [];
for(const name of files) {
  const source = 'workout/island/vendor/'+name, target = 'vendor/'+name;
  const data = await fs.readFile(path.join(repo,source));
  await fs.mkdir(path.dirname(path.join(root,target)),{recursive:true});
  await fs.writeFile(path.join(root,target),data);
  records.push({file:target,source,bytes:data.length,sha256:sha(data),license:name.includes('draco/')?'Apache-2.0':'MIT'});
}
await fs.copyFile(path.join(repo,'workout/island/design/viewer/draco/LICENSE.draco'),path.join(root,'vendor/draco/LICENSE.draco'));
await writeJSON('vendor/provenance.json',{threeRevision:'160',draco:'three.js r160 glTF WASM decoder',files:records});
