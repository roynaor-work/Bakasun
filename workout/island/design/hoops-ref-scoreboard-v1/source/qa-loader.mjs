// SPDX-License-Identifier: CC0-1.0. Replace only the input inventory for the original CLI.
export async function resolve(specifier,context,nextResolve){
 if(specifier==='./sources.mjs'&&context.parentURL===process.env.HOOPS_REF_QA_CLI)return {url:new URL('./qa-sources.mjs',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
