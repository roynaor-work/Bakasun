// SPDX-License-Identifier: CC0-1.0
// Resolve the original QA module's existing Three import without editing its bytes.
import {registerHooks} from 'node:module';

const three = new URL('../vendor/three.module.js', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('soccer-motion-v8/runtime/vendor/three.module.js')) {
      return {url: three, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  },
});
