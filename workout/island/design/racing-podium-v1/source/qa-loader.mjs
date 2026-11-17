// SPDX-License-Identifier: CC0-1.0. Redirect input discovery only; scoring is upstream.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function resolve(specifier,context,nextResolve){
  const upstream=process.env.PODIUM_QA_ROOT;
  if(upstream&&context.parentURL&&fileURLToPath(context.parentURL)===path.join(path.resolve(upstream),'run.mjs')&&specifier==='./sources.mjs')
    return{url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
