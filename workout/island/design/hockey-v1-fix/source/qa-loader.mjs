// SPDX-License-Identifier: CC0-1.0
// מקור: נגזר ממתאם מקור PR 414; רק קורא sources מוחלף, כלי QA נשאר מקורי.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const tool = pathToFileURL(path.resolve(process.env.HOCKEY_QA_TOOL_DIR || '/tmp/hockey-qa', 'sources.mjs')).href;
const adapter = new URL('./qa-adapter.mjs', import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  return resolved.url === tool ? {url: adapter, shortCircuit: true} : resolved;
}
