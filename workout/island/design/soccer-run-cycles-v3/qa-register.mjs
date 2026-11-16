// SPDX-License-Identifier: CC0-1.0
// Only the closed source inventory is adapted; the pinned QA runner and metrics are unchanged.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const qaRoot = process.env.SOCCER_RUN_CYCLES_QA_ROOT;
if (!qaRoot) throw new Error('Run measure.mjs to prepare the immutable QA reader.');
const runner = pathToFileURL(path.join(qaRoot, 'run.mjs')).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === runner && specifier === './sources.mjs') {
      return {url: new URL('./qa-sources.mjs', import.meta.url).href, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});
