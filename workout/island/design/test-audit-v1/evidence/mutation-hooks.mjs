const change=(url,source)=>{
 if(new URL(url).pathname.endsWith('/minigames/fire-v24-flow.mjs')&&process.env.AUDIT_MUTATION==='fire-unfreeze')return source.replace('if(flow.inside)return;', 'if(false&&flow.inside)return;');
 if(new URL(url).pathname.endsWith('/minigames/fire.mjs')&&process.env.AUDIT_MUTATION==='fire-route')return source.replace('if(fireFlowV24()&&isEntryStage(ctx.level','if(false&&fireFlowV24()&&isEntryStage(ctx.level');
 if(process.env.AUDIT_PROBE==='1'){
  if(new URL(url).pathname.endsWith('/minigames/fire-session.mjs'))return source.replace('export function runFireSession(','function unusedRunFireSession(')+"\nexport function runFireSession(){return {route:'street'};}\n";
  if(new URL(url).pathname.endsWith('/minigames/fire-v24-flow.mjs'))return source.replace('export function startFireEntry(','function unusedStartFireEntry(')+"\nexport function startFireEntry(){return {route:'entry'};}\n";
 }
 return source;
};
export async function load(url,context,nextLoad){const r=await nextLoad(url,context);if(r.format==='module'&&r.source&&url.startsWith('file:'))return {...r,source:change(url,r.source.toString())};return r;}
