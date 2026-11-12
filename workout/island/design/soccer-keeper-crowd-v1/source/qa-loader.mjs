// SPDX-License-Identifier: CC0-1.0. Adapt only the CLI's input inventory; never its reader or scoring.
export async function resolve(specifier,context,nextResolve){
 if(specifier==='./sources.mjs'&&context.parentURL===process.env.KEEPER_QA_CLI)return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
