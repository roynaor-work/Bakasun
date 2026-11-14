// Original CC0-1.0. Input adapter only: upstream run.mjs and all scoring stay unchanged.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL && fileURLToPath(context.parentURL);
  const upstream = process.env.PIT_QA_ROOT;
  if (upstream && parent === path.join(path.resolve(upstream), 'run.mjs') && specifier === './sources.mjs') {
    return {url: new URL('./qa-sources.mjs', import.meta.url).href, shortCircuit: true};
  }
  return nextResolve(specifier, context);
}
