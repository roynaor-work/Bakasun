import fs from 'node:fs';
import {register,syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
register('./mutation-hooks.mjs',import.meta.url);
const transform=(path,value)=>{
 const name=path instanceof URL?fileURLToPath(path):String(path);
 if(!name.endsWith('/minigames/fire.mjs')||process.env.AUDIT_MUTATION!=='fire-route')return value;
 const text=value.toString().replace('if(fireFlowV24()&&isEntryStage(ctx.level','if(false&&fireFlowV24()&&isEntryStage(ctx.level');return typeof value==='string'?text:Buffer.from(text);
};
const read=fs.promises.readFile.bind(fs.promises);fs.promises.readFile=async(p,...a)=>transform(p,await read(p,...a));
const readSync=fs.readFileSync.bind(fs);fs.readFileSync=(p,...a)=>transform(p,readSync(p,...a));
syncBuiltinESMExports();
