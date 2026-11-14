// SPDX-License-Identifier: CC0-1.0
// Replace only the closed source inventory of the unmodified pinned QA CLI.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.env.SOCCER_REFEREE_QA_ROOT;
if (!root) throw new Error('Run source/run-qa.mjs first.');
const runner=pathToFileURL(path.join(root,'run.mjs')).href;
registerHooks({resolve(specifier,context,nextResolve) {
  if (context.parentURL===runner && specifier==='./sources.mjs') {
    return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
  }
  return nextResolve(specifier,context);
}});
