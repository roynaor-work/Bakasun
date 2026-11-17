import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CLIPS,auditGraph,auditClip } from '../src/index.mjs';

const profiles=[];
for(const speedMps of [null,2.6,4.5,7.2]){
  const report=auditGraph(speedMps===null?{}:{speedMps});
  profiles.push({speedMps,...report});
  console.log(JSON.stringify({speedMps,...report.summary}));
}
const nativeClips=CLIPS.map(c=>auditClip(c));
const report={schemaVersion:1,method:'All graph edges; five uniform source phases including window endpoints; exact original accessor tracks sampled at 120Hz through runtime blend; native and requested game speeds; source clips key times plus120Hz; joint origins and sole corners; default bounded0.12m lift.',profiles,nativeClips};
const path=fileURLToPath(new URL('../data/transition-audit.json',import.meta.url));
await writeFile(path,JSON.stringify(report,null,2)+'\n');
console.log(`Saved ${path}`);
