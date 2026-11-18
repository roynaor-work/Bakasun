// SPDX-License-Identifier: CC0-1.0
// Original adapter hook. Only the source loader of the pinned QA CLI is replaced.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const qaRoot = process.env.SOCCER_CLIPS_QA_ROOT;
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
