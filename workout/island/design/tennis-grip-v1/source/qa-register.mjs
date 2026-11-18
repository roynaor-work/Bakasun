// SPDX-License-Identifier: CC0-1.0
// Replace only the closed input inventory in the pinned QA CLI.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const runner=pathToFileURL(process.env.TENNIS_QA_CLI).href;
registerHooks({resolve(specifier,context,next){if(context.parentURL===runner&&specifier==='./sources.mjs')return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
