// SPDX-License-Identifier: CC0-1.0
// Redirect inputs only. The upstream CLI, sampler and scoring stay byte-identical.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  const upstream=process.env.CELEBRATION_QA_ROOT;
  if(upstream && context.parentURL && fileURLToPath(context.parentURL)===path.join(upstream,'run.mjs') && specifier==='./sources.mjs') {
    return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
  }
  return nextResolve(specifier,context);
}
