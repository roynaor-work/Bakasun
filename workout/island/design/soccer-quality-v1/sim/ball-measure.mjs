// node ball-measure.mjs /absolute/repository/root [--enabled]
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {measureBallQuality} from './ball-scenarios.mjs';
const root=resolve(process.argv[2]||'.'),url=p=>pathToFileURL(resolve(root,p)).href;
const [loft,assistance,physics,rules]=await Promise.all(['soccer-loft.mjs','soccer-assistance.mjs','soccer-physics.mjs','soccer-rules.mjs'].map(file=>import(url(`workout/island/minigames/${file}`))));
const config=JSON.parse(await readFile(resolve(root,'workout/island/data/config.json'),'utf8')).minigames.soccer;
if(process.argv.includes('--enabled'))config.quality={loft:true,passing:true};
const result=measureBallQuality({...loft,...assistance,...physics,...rules},config);
console.log(JSON.stringify({sourceRoot:root,enabled:!!config.quality,...result},null,2));
