// SPDX-License-Identifier: CC0-1.0
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.FIREFIGHTER_QA_ROOT;
if(!root)throw Error('Run measure.mjs first.');
const runner=pathToFileURL(path.join(root,'run.mjs')).href;
registerHooks({resolve(specifier,context,next){
  if(context.parentURL===runner&&specifier==='./sources.mjs')return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
