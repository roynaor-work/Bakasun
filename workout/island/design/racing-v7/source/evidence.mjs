import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export async function hashRuntime(root,standalone=false){
  const files=['app.mjs','world.mjs','loader.mjs','effects.mjs','index.html','style.css'];
  if(standalone)files.push('offline.html');
  const hashes={};
  for(const file of files)hashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  return hashes;
}
