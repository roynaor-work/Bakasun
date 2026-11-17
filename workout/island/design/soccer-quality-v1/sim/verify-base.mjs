import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const manifest=JSON.parse(await readFile(new URL('../BASE.json',import.meta.url),'utf8'));
export async function verifyBase(root){
  for(const [name,expected] of Object.entries(manifest.files)){
    const actual=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
    if(actual!==expected)throw Error(`Base file differs: ${name}. Expected source ${manifest.commit}`);
  }
  return manifest.commit;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Pass a clean checkout root');
  console.log(`Verified runtime base ${await verifyBase(process.argv[2])}`);
}
