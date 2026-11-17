import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../../../',import.meta.url);
const {startFire}=await import(new URL('workout/island/minigames/fire.mjs',root));
const config=JSON.parse(await readFile(new URL('workout/island/data/config.json',root),'utf8'));
console.log(JSON.stringify(startFire({level:3,config:config.minigames,balance:config.minigames.fireRescue,finish:x=>x})));
