/** Soccer AI generation switch. 'v2' is the gameplay-1 behaviour (rival build-up, shot discipline);
 * 'v1' restores the behaviour before it. Resolution order: explicit option, then the page's
 * `?soccerAI=v1|v2`, then 'v2'. Pure: reads the URL only when a browser location exists. */
export function resolveSoccerAI(option){
  const pick=value=>value==='v1'||value==='v2'?value:null;
  const search=globalThis.location?.search;
  const fromUrl=typeof search==='string'?pick(new URLSearchParams(search).get('soccerAI')):null;
  return pick(option)||fromUrl||'v2';
}
