// Adapter redirection only; the upstream QA implementation remains unmodified.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL && fileURLToPath(context.parentURL);
  if (process.env.COACH_QA_ROOT && parent === path.join(path.resolve(process.env.COACH_QA_ROOT), 'run.mjs') && specifier === './sources.mjs') {
    return {url: new URL('./qa-sources.mjs', import.meta.url).href, shortCircuit: true};
  }
  return nextResolve(specifier, context);
}
