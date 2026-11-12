// SPDX-License-Identifier: CC0-1.0
// מקור: מתאם טעינה מקורי. מחליף רק את קורא הספריות הנעולות של כלי QA; הנוסחאות וספי המדידה אינם משתנים.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const tool = pathToFileURL(path.resolve(process.env.HOCKEY_QA_TOOL_DIR || '/tmp/hockey-qa', 'sources.mjs')).href;
const adapter = new URL('./qa-adapter.mjs', import.meta.url).href;
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (resolved.url === tool) return {url:adapter, shortCircuit:true};
  return resolved;
}
